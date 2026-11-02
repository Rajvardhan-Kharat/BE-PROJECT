import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("vericare.safety_rules")


class DrugReferenceCatalog:
    """Loads and caches synthetic demonstration rules from drug_reference_v1.json."""

    def __init__(self, json_path: Optional[str] = None):
        if not json_path:
            # Default to synthetic_data/drug_reference/drug_reference_v1.json relative to project root
            base_dir = Path(__file__).resolve().parent.parent.parent.parent
            json_path = str(base_dir / "synthetic_data" / "drug_reference" / "drug_reference_v1.json")

        self.json_path = json_path
        self._data: Dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        try:
            with open(self.json_path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
            logger.info("Loaded drug reference catalog from %s (version %s)", self.json_path, self.version)
        except Exception as e:
            logger.error("Failed to load drug reference catalog from %s: %s", self.json_path, e)
            self._data = {
                "metadata": {"version": "1.0.0", "rule_set_label": "synthetic demonstration rules"},
                "aliases": {},
                "allergy_classes": {},
                "interactions": [],
                "dosage_limits": {},
            }

    @property
    def version(self) -> str:
        return self._data.get("metadata", {}).get("version", "1.0.0")

    @property
    def rule_set_label(self) -> str:
        return self._data.get("metadata", {}).get("rule_set_label", "synthetic demonstration rules")

    @property
    def aliases(self) -> Dict[str, str]:
        return self._data.get("aliases", {})

    @property
    def allergy_classes(self) -> Dict[str, Any]:
        return self._data.get("allergy_classes", {})

    @property
    def interactions(self) -> List[Dict[str, Any]]:
        return self._data.get("interactions", [])

    @property
    def dosage_limits(self) -> Dict[str, Any]:
        return self._data.get("dosage_limits", {})

    def normalize_drug_name(self, raw_name: str) -> str:
        """Normalizes drug name by stripping salt, dosage, route, and mapping brand aliases to generic."""
        if not raw_name:
            return ""

        clean = raw_name.lower().strip()
        # Remove common salt / formulation tokens
        clean = re.sub(r"\b(tartrate|succinate|hydrochloride|hcl|sodium|potassium|maleate|sulfate|po|bid|tid|qid|daily|qd|oral|iv|tablet|capsule|mg|mcg|ml)\b", "", clean)
        # Remove numbers and units
        clean = re.sub(r"\d+(\.\d+)?\s*(mg|mcg|g|ml)?", "", clean)
        # Remove punctuation
        clean = re.sub(r"[,/\\-]", " ", clean)
        clean = " ".join(clean.split()).strip()

        # Check aliases dictionary
        if clean in self.aliases:
            return self.aliases[clean]

        # Check individual tokens against aliases
        tokens = clean.split()
        for token in tokens:
            if token in self.aliases:
                return self.aliases[token]

        return clean


# Singleton instance of reference catalog
drug_reference_catalog = DrugReferenceCatalog()


class SafetyRulesEngine:
    """
    Deterministic clinical safety rules engine.
    Strictly deterministic logic without LLM pharmacology hallucinations or invented severity scores.
    """

    def __init__(self, catalog: DrugReferenceCatalog = drug_reference_catalog):
        self.catalog = catalog

    def evaluate_all(
        self,
        patient_id: str,
        patient_allergies: List[str],
        prescriptions: List[Dict[str, Any]],
        encounters: Optional[List[Dict[str, Any]]] = None,
        record_versions: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Runs all 5 deterministic safety rules and returns structured alert candidate dictionaries.
        """
        alerts: List[Dict[str, Any]] = []

        # 1. Duplicate active prescriptions check
        alerts.extend(self.check_duplicate_active_prescriptions(patient_id, prescriptions))

        # 2. Allergy vs medication check
        alerts.extend(self.check_allergy_conflicts(patient_id, patient_allergies, prescriptions))

        # 3. Listed drug-drug interactions check
        alerts.extend(self.check_drug_interactions(patient_id, prescriptions))

        # 4. Contradictory status across encounters
        alerts.extend(self.check_contradictory_status(patient_id, prescriptions, encounters, record_versions))

        # 5. Dosage / duration inconsistency check
        alerts.extend(self.check_dosage_duration_inconsistencies(patient_id, prescriptions))

        return alerts

    def check_duplicate_active_prescriptions(
        self, patient_id: str, prescriptions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        RULE: Duplicate Active Prescriptions
        Identifies multiple active prescriptions for the same generic medication.
        """
        alerts = []
        active_rx = [rx for rx in prescriptions if rx.get("status") == "active"]

        # Group by normalized generic name
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for rx in active_rx:
            norm = self.catalog.normalize_drug_name(rx.get("drug_name", ""))
            if norm:
                grouped.setdefault(norm, []).append(rx)

        for norm_name, rx_list in grouped.items():
            if len(rx_list) > 1:
                evidence_refs = [
                    {
                        "ref_type": "prescription",
                        "ref_id": str(rx.get("prescription_id", rx.get("id", "RX-UNKNOWN"))),
                        "description": f"Active prescription: {rx.get('drug_name')} {rx.get('dosage', '')} ({rx.get('frequency', '')})",
                        "data": {
                            "drug_name": rx.get("drug_name"),
                            "dosage": rx.get("dosage"),
                            "frequency": rx.get("frequency"),
                            "status": rx.get("status"),
                        },
                    }
                    for rx in rx_list
                ]

                # Evidence signature for deduplication
                rx_ids = sorted([str(rx.get("prescription_id", rx.get("id", ""))) for rx in rx_list])
                sig = f"dup_{norm_name}_{'_'.join(rx_ids)}"

                alerts.append({
                    "patient_id": patient_id,
                    "rule_id": "DUP-RX-001",
                    "rule_version": self.catalog.version,
                    "source": "Synthetic Demonstration Rules / Prescription Deduplication",
                    "type": "data_inconsistency",
                    "title": f"Duplicate Active Prescription: {norm_name.title()}",
                    "evidence_signature": sig,
                    "evidence_refs": evidence_refs,
                    "explanation": f"Patient has {len(rx_list)} concurrent active prescriptions for generic {norm_name.title()}. Clinical order reconciliation is required to eliminate duplicate therapy.",
                    "status": "open",
                })

        return alerts

    def check_allergy_conflicts(
        self,
        patient_id: str,
        patient_allergies: List[str],
        prescriptions: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        RULE: Allergy vs Medication
        Cross-checks documented patient allergies against active prescriptions using allergy classes and brand aliases.
        """
        alerts = []
        active_rx = [rx for rx in prescriptions if rx.get("status") == "active"]

        for allergy in patient_allergies:
            if not allergy:
                continue

            allergy_clean = allergy.lower().strip()

            # Determine allergy class keys that match this documented allergy
            matched_classes: Set[str] = set()
            for class_key, class_info in self.catalog.allergy_classes.items():
                if class_key in allergy_clean or allergy_clean in class_key:
                    matched_classes.add(class_key)
                if class_info.get("display_name", "").lower() in allergy_clean:
                    matched_classes.add(class_key)

            for rx in active_rx:
                raw_drug = rx.get("drug_name", "")
                norm_drug = self.catalog.normalize_drug_name(raw_drug)
                rx_id = str(rx.get("prescription_id", rx.get("id", "RX-UNKNOWN")))

                is_conflict = False
                matched_reason = ""

                # 1. Direct name match (e.g. allergy "Aspirin" and drug "Aspirin")
                if norm_drug and (norm_drug in allergy_clean or allergy_clean in norm_drug):
                    is_conflict = True
                    matched_reason = f"Direct match between allergy '{allergy}' and medication '{raw_drug}'."

                # 2. Allergy class membership match (e.g. allergy "Penicillin" and drug "Amoxicillin")
                if not is_conflict:
                    for class_key in matched_classes:
                        members = self.catalog.allergy_classes[class_key].get("members", [])
                        if norm_drug in members or any(m in raw_drug.lower() for m in members):
                            is_conflict = True
                            class_name = self.catalog.allergy_classes[class_key].get("display_name", class_key)
                            matched_reason = f"Prescribed drug '{raw_drug}' belongs to '{class_name}' which conflicts with documented allergy '{allergy}'."
                            break

                if is_conflict:
                    sig = f"allergy_{allergy_clean}_{norm_drug}_{rx_id}"
                    alerts.append({
                        "patient_id": patient_id,
                        "rule_id": "ALLERGY-CONTRA-001",
                        "rule_version": self.catalog.version,
                        "source": "Synthetic Demonstration Rules / Cross-Sensitivity Reference",
                        "type": "potential_clinical_concern",
                        "title": f"Documented Allergy Conflict: {allergy} vs {raw_drug}",
                        "evidence_signature": sig,
                        "evidence_refs": [
                            {
                                "ref_type": "allergy",
                                "ref_id": patient_id,
                                "description": f"Documented patient allergy: {allergy}",
                                "data": {"allergy": allergy},
                            },
                            {
                                "ref_type": "prescription",
                                "ref_id": rx_id,
                                "description": f"Active prescription: {raw_drug} {rx.get('dosage', '')}",
                                "data": rx,
                            },
                        ],
                        "explanation": f"Patient has documented allergy '{allergy}'. {matched_reason} Administration presents immediate risk of adverse hypersensitivity reaction.",
                        "status": "open",
                    })

        return alerts

    def check_drug_interactions(
        self, patient_id: str, prescriptions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        RULE: Listed Drug-Drug Interactions
        Evaluates active prescription pairs against the ~15 interaction rules in the catalog.
        """
        alerts = []
        active_rx = [rx for rx in prescriptions if rx.get("status") == "active"]

        # Map each active prescription to normalized drug name
        normalized_rx: List[Tuple[Dict[str, Any], str]] = []
        for rx in active_rx:
            norm = self.catalog.normalize_drug_name(rx.get("drug_name", ""))
            if norm:
                normalized_rx.append((rx, norm))

        # Check all unique pairs
        seen_pairs: Set[str] = set()

        for i in range(len(normalized_rx)):
            for j in range(i + 1, len(normalized_rx)):
                rx_a, norm_a = normalized_rx[i]
                rx_b, norm_b = normalized_rx[j]

                # Match against interactions catalog
                for rule in self.catalog.interactions:
                    rule_a = rule.get("drug_a", "").lower()
                    rule_b = rule.get("drug_b", "").lower()

                    matches = (norm_a == rule_a and norm_b == rule_b) or (norm_a == rule_b and norm_b == rule_a)
                    if matches:
                        pair_key = tuple(sorted([str(rx_a.get("prescription_id", "")), str(rx_b.get("prescription_id", ""))]))
                        sig = f"{rule.get('rule_id')}_{pair_key[0]}_{pair_key[1]}"
                        if sig in seen_pairs:
                            continue
                        seen_pairs.add(sig)

                        alerts.append({
                            "patient_id": patient_id,
                            "rule_id": rule.get("rule_id", "DDI-SYN-000"),
                            "rule_version": rule.get("version", "1.0"),
                            "source": rule.get("source", "Synthetic Demonstration Reference"),
                            "type": rule.get("type", "potential_clinical_concern"),
                            "title": f"Drug Interaction: {rule_a.title()} + {rule_b.title()}",
                            "evidence_signature": sig,
                            "evidence_refs": [
                                {
                                    "ref_type": "prescription",
                                    "ref_id": str(rx_a.get("prescription_id", rx_a.get("id", ""))),
                                    "description": f"Active prescription: {rx_a.get('drug_name')} {rx_a.get('dosage', '')}",
                                    "data": rx_a,
                                },
                                {
                                    "ref_type": "prescription",
                                    "ref_id": str(rx_b.get("prescription_id", rx_b.get("id", ""))),
                                    "description": f"Active prescription: {rx_b.get('drug_name')} {rx_b.get('dosage', '')}",
                                    "data": rx_b,
                                },
                            ],
                            "explanation": f"{rule.get('clinical_effect', '')} Rationale: {rule.get('rationale', '')}",
                            "status": "open",
                        })

        return alerts

    def check_contradictory_status(
        self,
        patient_id: str,
        prescriptions: List[Dict[str, Any]],
        encounters: Optional[List[Dict[str, Any]]] = None,
        record_versions: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        RULE: Contradictory Status Across Encounters
        Flags medications that are concurrently marked 'discontinued'/'held' in one encounter/record
        and 'active' in another concurrent/newer encounter without an explicit reconciliation event.
        """
        alerts = []

        # Find prescriptions of the same drug with contradictory statuses
        by_drug: Dict[str, List[Dict[str, Any]]] = {}
        for rx in prescriptions:
            norm = self.catalog.normalize_drug_name(rx.get("drug_name", ""))
            if norm:
                by_drug.setdefault(norm, []).append(rx)

        for norm_name, rx_list in by_drug.items():
            active_items = [rx for rx in rx_list if rx.get("status") == "active"]
            discontinued_items = [rx for rx in rx_list if rx.get("status") in ["discontinued", "held"]]

            if active_items and discontinued_items:
                act = active_items[0]
                disc = discontinued_items[0]

                act_id = str(act.get("prescription_id", act.get("id", "RX-ACT")))
                disc_id = str(disc.get("prescription_id", disc.get("id", "RX-DISC")))
                sig = f"status_conflict_{norm_name}_{act_id}_{disc_id}"

                evidence_refs = [
                    {
                        "ref_type": "prescription",
                        "ref_id": act_id,
                        "description": f"Marked ACTIVE in encounter {act.get('encounter_id', 'General')}: {act.get('drug_name')} ({act.get('dosage', '')})",
                        "data": act,
                    },
                    {
                        "ref_type": "prescription",
                        "ref_id": disc_id,
                        "description": f"Marked {disc.get('status', '').upper()} in encounter {disc.get('encounter_id', 'General')}: {disc.get('drug_name')} ({disc.get('dosage', '')})",
                        "data": disc,
                    },
                ]

                alerts.append({
                    "patient_id": patient_id,
                    "rule_id": "STATUS-CONFLICT-001",
                    "rule_version": self.catalog.version,
                    "source": "Synthetic Demonstration Rules / Cross-Encounter Status Reconciliation",
                    "type": "data_inconsistency",
                    "title": f"Contradictory Status Across Encounters: {norm_name.title()}",
                    "evidence_signature": sig,
                    "evidence_refs": evidence_refs,
                    "explanation": f"Medication '{norm_name.title()}' has contradictory status records ('active' vs '{disc.get('status')}'). Order reconciliation across encounters is required to confirm whether medication should be continued or discontinued.",
                    "status": "open",
                })

        return alerts

    def check_dosage_duration_inconsistencies(
        self, patient_id: str, prescriptions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        RULE: Dosage / Duration Inconsistency
        Validates prescribed single dose, daily dose, duration, and frequency against catalog reference bounds.
        """
        alerts = []
        active_rx = [rx for rx in prescriptions if rx.get("status") == "active"]

        for rx in active_rx:
            raw_drug = rx.get("drug_name", "")
            norm_drug = self.catalog.normalize_drug_name(raw_drug)
            rx_id = str(rx.get("prescription_id", rx.get("id", "RX-UNKNOWN")))

            # 1. Parse dose
            parsed_dose = self._parse_numeric_dose(rx.get("dosage", ""))
            freq_multiplier = self._parse_frequency_multiplier(rx.get("frequency", ""))

            # Reference limits
            limits = self.catalog.dosage_limits.get(norm_drug)
            if limits and parsed_dose is not None:
                max_single = limits.get("max_single_dose_mg")
                max_daily = limits.get("max_daily_dose_mg")

                daily_dose = parsed_dose * freq_multiplier if freq_multiplier else parsed_dose

                # Check max single dose
                if max_single and parsed_dose > max_single:
                    sig = f"dose_single_{norm_drug}_{rx_id}"
                    alerts.append({
                        "patient_id": patient_id,
                        "rule_id": "DOSE-EXCEEDED-001",
                        "rule_version": self.catalog.version,
                        "source": "Synthetic Demonstration Rules / Maximum Single Dose Limit",
                        "type": "potential_clinical_concern",
                        "title": f"Single Dose Exceeds Reference Limit: {raw_drug}",
                        "evidence_signature": sig,
                        "evidence_refs": [
                            {
                                "ref_type": "prescription",
                                "ref_id": rx_id,
                                "description": f"Prescribed dose: {rx.get('dosage')} ({parsed_dose} mg) vs limit ({max_single} mg)",
                                "data": rx,
                            }
                        ],
                        "explanation": f"Prescribed single dose of {parsed_dose} mg for '{raw_drug}' exceeds synthetic reference limit of {max_single} mg.",
                        "status": "open",
                    })

                # Check max daily dose
                if max_daily and daily_dose > max_daily:
                    sig = f"dose_daily_{norm_drug}_{rx_id}"
                    alerts.append({
                        "patient_id": patient_id,
                        "rule_id": "DOSE-EXCEEDED-002",
                        "rule_version": self.catalog.version,
                        "source": "Synthetic Demonstration Rules / Maximum Daily Dose Limit",
                        "type": "potential_clinical_concern",
                        "title": f"Daily Dose Exceeds Reference Limit: {raw_drug}",
                        "evidence_signature": sig,
                        "evidence_refs": [
                            {
                                "ref_type": "prescription",
                                "ref_id": rx_id,
                                "description": f"Calculated daily dose: {daily_dose} mg/day vs limit ({max_daily} mg/day)",
                                "data": rx,
                            }
                        ],
                        "explanation": f"Prescribed regimen yields calculated daily dose of {daily_dose} mg/day for '{raw_drug}', exceeding synthetic reference limit of {max_daily} mg/day.",
                        "status": "open",
                    })

                # Check duration limit
                max_duration = limits.get("max_duration_days")
                duration = rx.get("duration_days")
                if max_duration and duration is not None and duration > max_duration:
                    sig = f"duration_exceeded_{norm_drug}_{rx_id}"
                    alerts.append({
                        "patient_id": patient_id,
                        "rule_id": "DURATION-INCONSISTENCY-001",
                        "rule_version": self.catalog.version,
                        "source": "Synthetic Demonstration Rules / Maximum Course Duration Limit",
                        "type": "data_inconsistency",
                        "title": f"Duration Exceeds Safe Guidance: {raw_drug}",
                        "evidence_signature": sig,
                        "evidence_refs": [
                            {
                                "ref_type": "prescription",
                                "ref_id": rx_id,
                                "description": f"Prescribed duration: {duration} days vs maximum guidance ({max_duration} days)",
                                "data": rx,
                            }
                        ],
                        "explanation": f"Prescribed duration of {duration} days for '{raw_drug}' exceeds the maximum recommended acute course limit of {max_duration} days.",
                        "status": "open",
                    })

            # Check for negative duration or missing frequency inconsistency
            duration = rx.get("duration_days")
            if duration is not None and duration <= 0:
                sig = f"invalid_duration_{norm_drug}_{rx_id}"
                alerts.append({
                    "patient_id": patient_id,
                    "rule_id": "DURATION-INCONSISTENCY-002",
                    "rule_version": self.catalog.version,
                    "source": "Synthetic Demonstration Rules / Prescription Validation",
                    "type": "data_inconsistency",
                    "title": f"Invalid Prescription Duration: {raw_drug}",
                    "evidence_signature": sig,
                    "evidence_refs": [
                        {
                            "ref_type": "prescription",
                            "ref_id": rx_id,
                            "description": f"Invalid duration value: {duration} days",
                            "data": rx,
                        }
                    ],
                    "explanation": f"Prescription for '{raw_drug}' contains an invalid non-positive duration ({duration} days). Duration must be greater than zero.",
                    "status": "open",
                })

        return alerts

    @staticmethod
    def _parse_numeric_dose(dosage_str: str) -> Optional[float]:
        """Extracts numeric milligram dose from dosage string like '25 mg' or '50mg'."""
        if not dosage_str:
            return None
        match = re.search(r"(\d+(\.\d+)?)\s*(mg)?", dosage_str.lower())
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None

    @staticmethod
    def _parse_frequency_multiplier(freq_str: str) -> Optional[float]:
        """Maps clinical frequency codes to times-per-day multiplier."""
        if not freq_str:
            return 1.0
        f = freq_str.lower().strip()
        if "bid" in f or "twice" in f or "q12" in f:
            return 2.0
        elif "tid" in f or "three" in f or "q8" in f:
            return 3.0
        elif "qid" in f or "four" in f or "q6" in f:
            return 4.0
        elif "daily" in f or "qd" in f or "q24" in f or "once" in f or "bedtime" in f:
            return 1.0
        elif "weekly" in f:
            return 1.0 / 7.0
        return 1.0


safety_rules_engine = SafetyRulesEngine()
