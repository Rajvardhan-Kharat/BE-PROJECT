import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("vericare.aria.safety")

CONFIG_DIR = os.path.join(os.getcwd(), "config")
RESOURCES_FILE = os.path.join(CONFIG_DIR, "crisis_resources.json")
MULTILINGUAL_FILE = os.path.join(CONFIG_DIR, "crisis_multilingual_phrases.json")


@dataclass
class CrisisCheckResult:
    triggered: bool
    reason: Optional[str] = None
    matched_phrase: Optional[str] = None
    guidance: Optional[str] = None
    resources: List[Dict[str, Any]] = field(default_factory=list)


# Direct Intent Patterns
DIRECT_INTENT_PATTERNS = [
    r"\b(?:want to|going to|plan to|planning to|gonna|wanna|thinking of|thinking about)\s+(?:kill|end(?:ing)?|hang|shoot|poison|strangle)\s+(?:myself|my\s+life|it\s+all)\b",
    r"\b(?:commit\s+suicide|kill\s+myself|end\s+my\s+own\s+life|end\s+my\s+life|take\s+my\s+own\s+life|take\s+my\s+life|ending\s+it\s+all)\b",
    r"\b(?:suicide|suicidal|suicyd|suicde|suiside)\b",
    r"\b(?:better\s+off\s+dead|wish\s+I\s+(?:were|was)\s+dead|don'?t\s+want\s+to\s+wake\s+up|no\s+reason\s+to\s+live|want\s+to\s+die|ready\s+to\s+die)\b",
    r"\b(?:how\s+to\s+(?:hang|suffocate|shoot|poison|kill)\s+myself|hanging\s+myself|hang\s+myself)\b",
    r"\b(?:goodbye\s+cruel\s+world|good\s+bye\s+forever|leaving\s+this\s+world\s+forever|tonight\s+is\s+my\s+last\s+night)\b",
    r"\b(?:slit\s+my\s+wrists?|jump\s+off\s+(?:the\s+)?bridge|swallow(?:ed)?\s+bleach|suicide\s+note)\b",
    r"\b(?:nobody\s+will\s+miss\s+me|no\s+one\s+will\s+miss\s+me)\b",
]

# Self-Harm Patterns
SELF_HARM_PATTERNS = [
    r"\b(?:cut\s+myself|cutting\s+myself|burn\s+myself|burning\s+myself|harm\s+myself|harming\s+myself|hurt\s+myself|hurting\s+myself)\b",
    r"\b(?:overdose\s+on\s+pills|swallow\s+a\s+bottle\s+of\s+pills|bottle\s+of\s+pills|take\s+all\s+my\s+meds\s+at\s+once)\b",
]

# Borderline / Severe Distress (leaning toward supportive guidance)
BORDERLINE_DISTRESS_PATTERNS = [
    r"\b(?:can'?t\s+take\s+this\s+pain\s+anymore|can'?t\s+go\s+on\s+like\s+this|can'?t\s+go\s+on\s+living|no\s+way\s+out|completely\s+hopeless\s+and\s+done)\b",
    r"\b(?:want\s+everything\s+to\s+stop\s+forever|everyone\s+would\s+be\s+better\s+without\s+me)\b",
]

# Explicit Negation Patterns (MUST NOT trigger crisis intent)
NEGATION_PATTERNS = [
    r"\b(?:would\s+never|will\s+never|never\s+would|don'?t\s+want\s+to|do\s+not\s+want\s+to|not\s+going\s+to|not\s+planning\s+to|have\s+no\s+desire\s+to|no\s+intention\s+to|refuse\s+to|never\s+thought\s+of|never\s+contemplated|definitely\s+not)\s+(?:kill\s+myself|hurt\s+myself|harm\s+myself|commit\s+suicide|end\s+my\s+life|ending\s+my\s+life|die)\b",
    r"\b(?:i\s*['’]m|i\s+am|ain'?t)?\s*not\s+suicidal\b",
    r"\bI\s+(?:am\s+glad|happy)\s+I\s+did\s+not\s+(?:kill\s+myself|end\s+it)\b",
    r"\b(?:no\s+thoughts\s+of\s+self-?harm|want\s+to\s+live|will\s+not\s+commit\s+suicide)\b",
    r"\brefused\s+to\s+give\s+up\s+on\s+life\b",
]


class CrisisSafetyDetector:
    """
    Deterministic rule-based safety screening module at the Aria boundary.
    Executes before calling the external companion provider and before returning responses.
    """

    def __init__(self):
        self._resources: Dict[str, Any] = self._load_json(RESOURCES_FILE)
        self._multilingual: Dict[str, Any] = self._load_json(MULTILINGUAL_FILE)

    def _load_json(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error("Failed to load crisis config %s: %s", path, e)
        return {}

    def check_message(self, text: str) -> CrisisCheckResult:
        """
        Evaluates input text for crisis intent, self-harm, or severe distress.
        Negation handling ensures phrases like 'I would never hurt myself' pass without triggering.
        """
        if not text or not text.strip():
            return CrisisCheckResult(triggered=False)

        clean_text = text.strip().lower()

        # Step 1: Check Negations First
        for neg_pat in NEGATION_PATTERNS:
            if re.search(neg_pat, clean_text, re.IGNORECASE):
                # Strong explicit negation detected - pass through without triggering
                return CrisisCheckResult(
                    triggered=False,
                    reason="Explicit negation detected (safe statement)",
                )

        # Step 2: Check Direct Intent Patterns
        for pat in DIRECT_INTENT_PATTERNS:
            match = re.search(pat, clean_text, re.IGNORECASE)
            if match:
                return self._build_crisis_result(
                    reason="Direct suicidal intent pattern matched",
                    matched_phrase=match.group(0),
                )

        # Step 3: Check Self-Harm Patterns
        for pat in SELF_HARM_PATTERNS:
            match = re.search(pat, clean_text, re.IGNORECASE)
            if match:
                return self._build_crisis_result(
                    reason="Self-harm / injurious action pattern matched",
                    matched_phrase=match.group(0),
                )

        # Step 4: Check Borderline / Severe Distress (leaning toward showing support)
        for pat in BORDERLINE_DISTRESS_PATTERNS:
            match = re.search(pat, clean_text, re.IGNORECASE)
            if match:
                return self._build_crisis_result(
                    reason="Acute distress / hopelessness indicator matched",
                    matched_phrase=match.group(0),
                )

        # Step 5: Check Multilingual (Hindi, Marathi, Hinglish)
        multilingual_phrases = self._multilingual.get("phrases", [])
        for entry in multilingual_phrases:
            phrase = entry.get("phrase", "").lower()
            translit = entry.get("transliteration", "").lower()
            if (phrase and phrase in clean_text) or (translit and translit in clean_text):
                return self._build_crisis_result(
                    reason=f"Multilingual crisis expression matched ({entry.get('language')})",
                    matched_phrase=phrase or translit,
                )

        return CrisisCheckResult(triggered=False)

    def _build_crisis_result(self, reason: str, matched_phrase: str) -> CrisisCheckResult:
        # Audit log recording ONLY event type and timestamp - NO message text!
        logger.warning(
            "AUDIT [ARIA_CRISIS_SAFETY_TRIGGERED] timestamp=%s reason=%s",
            datetime.now(timezone.utc).isoformat(),
            reason,
        )

        guidance_text = self._resources.get(
            "default_compassionate_response",
            "I hear how much pain you are experiencing right now, and I want to make sure you have direct human support. "
            "Because I am an AI companion and cannot provide emergency medical care, please reach out to one of the trusted crisis resources below."
        )
        resources_list = self._resources.get("resources", [])

        return CrisisCheckResult(
            triggered=True,
            reason=reason,
            matched_phrase=matched_phrase,
            guidance=guidance_text,
            resources=resources_list,
        )


crisis_detector = CrisisSafetyDetector()
