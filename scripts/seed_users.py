import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from backend.app.core.config import settings
from backend.app.core.security import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scripts.seed_users")

DEFAULT_DEV_PASSWORD = "synthetic-dev-password"

SYNTHETIC_HOSPITALS = [
    {
        "hospital_id": "HOSP-METRO-01",
        "name": "Metro Health University Medical Center",
        "region": "Region North",
        "departments": [
            "Cardiology",
            "Internal Medicine",
            "Oncology",
            "Emergency Medicine",
        ],
        "is_synthetic": True,
    },
    {
        "hospital_id": "HOSP-VALLEY-02",
        "name": "Valley Memorial Community Hospital",
        "region": "Region South",
        "departments": [
            "Neurology",
            "General Medicine",
            "Emergency Department",
        ],
        "is_synthetic": True,
    },
]

ROLES_PERMISSIONS_SEED = [
    {
        "role": "patient",
        "description": "Patient viewing own health records and consent preferences",
        "permissions": [
            "records:read_own",
            "consent:manage",
        ],
    },
    {
        "role": "doctor",
        "description": "Care team clinician drafting notes and proposing clinical orders",
        "permissions": [
            "records:read",
            "records:draft",
            "notes:write",
            "prescriptions:propose",
        ],
    },
    {
        "role": "senior_doctor",
        "description": "Senior clinician with verifier authority to approve/reject AI proposals",
        "permissions": [
            "records:read",
            "records:draft",
            "notes:write",
            "prescriptions:propose",
            "records:verify",
            "proposals:approve",
            "proposals:reject",
            "audit:read",
        ],
    },
    {
        "role": "hospital_admin",
        "description": "Hospital administrator reviewing department compliance and audit trails",
        "permissions": [
            "hospital:read",
            "compliance:read",
            "audit:read",
            "staff:read",
        ],
    },
    {
        "role": "system_admin",
        "description": "Platform infrastructure administrator managing security and external adapters",
        "permissions": [
            "*",
        ],
    },
]

SYNTHETIC_PATIENTS = [
    {
        "patient_id": "PAT-SYN-001",
        "mrn": "SYN-84920",
        "name": "Eleanor Vance",
        "date_of_birth": "1968-04-12",
        "gender": "Female",
        "blood_type": "A+",
        "allergies": ["Penicillin", "Sulfa drugs"],
        "hospital_ids": ["HOSP-METRO-01", "HOSP-VALLEY-02"],  # Linked to BOTH hospitals
        "care_team_ids": ["CT-INTERNAL-B", "CT-CARDIO-A"],
        "active_consent": True,
        "is_synthetic": True,
        "created_at": datetime.now(timezone.utc),
    },
    {
        "patient_id": "PAT-SYN-002",
        "mrn": "SYN-90412",
        "name": "Arthur Pendelton",
        "date_of_birth": "1954-11-20",
        "gender": "Male",
        "blood_type": "O-",
        "allergies": ["Aspirin"],
        "hospital_ids": ["HOSP-VALLEY-02"],
        "care_team_ids": ["CT-NEURO-1"],
        "active_consent": True,
        "is_synthetic": True,
        "created_at": datetime.now(timezone.utc),
    },
]

CARE_TEAM_MEMBERSHIPS = [
    # Eleanor Vance (PAT-SYN-001) memberships
    {
        "membership_id": "MEM-001",
        "patient_id": "PAT-SYN-001",
        "care_team_id": "CT-INTERNAL-B",
        "care_team_name": "Internal Medicine Team B",
        "hospital_id": "HOSP-METRO-01",
        "clinician_id": "USR-VERIFIER-001",  # Dr. Sarah Lin (verifier)
        "role": "Senior Verifier",
        "active": True,
    },
    {
        "membership_id": "MEM-002",
        "patient_id": "PAT-SYN-001",
        "care_team_id": "CT-CARDIO-A",
        "care_team_name": "Cardiology Team A",
        "hospital_id": "HOSP-METRO-01",
        "clinician_id": "USR-DOC-CARDIO-001",  # Dr. Marcus Vance (cardiology)
        "role": "Attending Cardiologist",
        "active": True,
    },
    # Arthur Pendelton (PAT-SYN-002) memberships
    {
        "membership_id": "MEM-003",
        "patient_id": "PAT-SYN-002",
        "care_team_id": "CT-NEURO-1",
        "care_team_name": "Neurology Team 1",
        "hospital_id": "HOSP-VALLEY-02",
        "clinician_id": "USR-DOC-NEURO-003",  # Dr. James Thorne (neurology)
        "role": "Attending Neurologist",
        "active": True,
    },
]

SYNTHETIC_ENCOUNTERS = [
    # Scenario Event 1: Eleanor Vance at Metro Health (Hospital A) - Oct 2
    {
        "encounter_id": "ENC-2026-072",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-METRO-01",
        "department": "Cardiology",
        "attending_doctor_id": "USR-DOC-CARDIO-001",
        "attending_doctor_name": "Dr. Marcus Vance",
        "encounter_type": "Inpatient Admission",
        "admission_date": "2026-10-02 09:30",
        "discharge_date": "2026-10-04 16:00",
        "status": "completed",
        "chief_complaint": "Acute hypertension workup; initiated Amlodipine 10mg daily.",
        "diagnosis_codes": ["I10 (Essential hypertension)"],
        "is_synthetic": True,
    },
    # Scenario Event 2: Specialist Outpatient Consultation - Oct 8
    {
        "encounter_id": "ENC-2026-078",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-METRO-01",
        "department": "Cardiology",
        "attending_doctor_id": "USR-DOC-CARDIO-001",
        "attending_doctor_name": "Dr. Marcus Vance (Specialist)",
        "encounter_type": "Specialist Consultation",
        "admission_date": "2026-10-08 14:15",
        "discharge_date": "2026-10-08 15:30",
        "status": "completed",
        "chief_complaint": "Follow-up adverse reaction: Severe bilateral lower extremity edema. Discontinued Amlodipine.",
        "diagnosis_codes": ["R60.0 (Localized edema, bilateral lower extremity)"],
        "is_synthetic": True,
    },
    # Scenario Event 3: Hospital B (Valley Clinic) - Legacy Chart Import - Oct 12
    {
        "encounter_id": "ENC-2026-088",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-VALLEY-02",
        "department": "Primary Care / Records Intake",
        "attending_doctor_id": "USR-ED-VALLEY-01",
        "attending_doctor_name": "Dr. David Miller",
        "encounter_type": "Chart Import Intake",
        "admission_date": "2026-10-12 11:00",
        "discharge_date": "2026-10-12 11:45",
        "status": "completed",
        "chief_complaint": "Intake registration; imported prior outpatient medication list showing active Amlodipine.",
        "diagnosis_codes": ["Z76.89 (Persons encountering health services in other specified circumstances)"],
        "is_synthetic": True,
    },
    # Date Anomaly Demonstration Encounter
    {
        "encounter_id": "ENC-2026-099",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-VALLEY-02",
        "department": "Urgent Care",
        "attending_doctor_id": "USR-ED-VALLEY-01",
        "attending_doctor_name": "Dr. David Miller",
        "encounter_type": "Urgent Care Walk-in",
        "admission_date": "2026-10-25 18:30",
        "discharge_date": "2026-10-25 14:00",  # Inconsistent date: discharge before admission!
        "status": "completed",
        "chief_complaint": "Sprained ankle evaluation with temporal audit discrepancy.",
        "diagnosis_codes": ["S93.401A (Sprain of unspecified ligament of right ankle)"],
        "is_synthetic": True,
    },
    # Eleanor Vance - Encounter 1 at Metro Health (Inpatient Cardiology)
    {
        "encounter_id": "ENC-2026-081",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-METRO-01",
        "department": "Cardiology",
        "attending_doctor_id": "USR-DOC-CARDIO-001",
        "attending_doctor_name": "Dr. Marcus Vance",
        "encounter_type": "Inpatient Admission",
        "admission_date": "2026-10-15 08:30",
        "discharge_date": "2026-10-18 14:00",
        "status": "completed",
        "chief_complaint": "Palpitations and shortness of breath upon exertion.",
        "diagnosis_codes": [
            "I48.0 (Paroxysmal atrial fibrillation)",
            "I10 (Essential hypertension)",
        ],
        "is_synthetic": True,
    },
    # Eleanor Vance - Encounter 2 at Metro Health (Outpatient Internal Medicine)
    {
        "encounter_id": "ENC-2026-092",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-METRO-01",
        "department": "Internal Medicine",
        "attending_doctor_id": "USR-VERIFIER-001",
        "attending_doctor_name": "Dr. Sarah Lin",
        "encounter_type": "Outpatient Consultation",
        "admission_date": "2026-10-24 10:15",
        "discharge_date": "2026-10-24 11:30",
        "status": "completed",
        "chief_complaint": "Follow-up post-AFib discharge, titration of Metoprolol.",
        "diagnosis_codes": [
            "I48.91 (Unspecified atrial fibrillation)",
            "E11.9 (Type 2 diabetes mellitus without complications)",
        ],
        "is_synthetic": True,
    },
    # Eleanor Vance - Encounter 3 at Valley Memorial (Emergency Department)
    {
        "encounter_id": "ENC-2026-105",
        "patient_id": "PAT-SYN-001",
        "hospital_id": "HOSP-VALLEY-02",
        "department": "Emergency Department",
        "attending_doctor_id": "USR-ED-VALLEY-01",
        "attending_doctor_name": "Dr. David Miller",
        "encounter_type": "Emergency Presentation",
        "admission_date": "2026-10-29 22:45",
        "discharge_date": "2026-10-30 04:20",
        "status": "completed",
        "chief_complaint": "Urticaria and facial rash following accidental Sulfa-containing antibiotic ingestion.",
        "diagnosis_codes": [
            "T36.0X5A (Adverse effect of sulfonamides, initial encounter)",
            "L50.0 (Allergic urticaria)",
        ],
        "is_synthetic": True,
    },
    # Arthur Pendelton - Encounter at Valley Memorial (Neurology)
    {
        "encounter_id": "ENC-2026-110",
        "patient_id": "PAT-SYN-002",
        "hospital_id": "HOSP-VALLEY-02",
        "department": "Neurology",
        "attending_doctor_id": "USR-DOC-NEURO-003",
        "attending_doctor_name": "Dr. James Thorne",
        "encounter_type": "Outpatient Consultation",
        "admission_date": "2026-10-28 14:00",
        "discharge_date": "2026-10-28 15:15",
        "status": "completed",
        "chief_complaint": "Evaluation of recurrent migraine headaches and visual aura.",
        "diagnosis_codes": [
            "G43.109 (Migraine with aura, not intractable, without status migrainosus)",
        ],
        "is_synthetic": True,
    },
]


SYNTHETIC_RECORD_VERSIONS = [
    # 1. Approved Record v1 (Cardiology Discharge Summary)
    {
        "version_id": "VER-20261018-001",
        "record_id": "REC-PAT001-CARDIO-01",
        "patient_id": "PAT-SYN-001",
        "version_number": 1,
        "status": "approved",
        "record_type": "discharge_summary",
        "title": "Discharge Summary - Paroxysmal Atrial Fibrillation",
        "department": "Cardiology",
        "hospital_id": "HOSP-METRO-01",
        "care_team_id": "CT-CARDIO-A",
        "data": {
            "primary_diagnosis": "Paroxysmal atrial fibrillation (ICD-10 I48.0)",
            "secondary_diagnosis": "Essential hypertension (I10)",
            "discharge_medications": [
                "Metoprolol Tartrate 25 mg PO BID",
                "Lisinopril 10 mg PO daily",
                "Atorvastatin 20 mg PO bedtime",
            ],
            "allergies": ["Penicillin", "Sulfa drugs"],
            "discharge_date": "2026-10-18",
        },
        "source_document_id": "DOC-SYN-84920-01",
        "source_text_snippet": "Primary Diagnosis: Paroxysmal atrial fibrillation (ICD-10 I48.0). Discharge Medications: Metoprolol 25mg BID.",
        "extracted_fields": [
            {
                "field_name": "primary_diagnosis",
                "value": "Paroxysmal atrial fibrillation (ICD-10 I48.0)",
                "status": "explicit",
                "confidence_note": "Extracted with high confidence",
            },
            {
                "field_name": "discharge_date",
                "value": "2026-10-18",
                "status": "explicit",
                "confidence_note": "Extracted from header",
            },
        ],
        "submitted_by": "USR-DOC-CARDIO-001",
        "submitter_name": "Dr. Marcus Vance",
        "submitted_at": datetime(2026, 10, 18, 14, 0, tzinfo=timezone.utc),
        "reviewed_by": "USR-VERIFIER-001",
        "reviewer_name": "Dr. Sarah Lin",
        "reviewed_at": datetime(2026, 10, 18, 15, 30, tzinfo=timezone.utc),
        "review_decision": "approved",
        "review_reason": "Verified against telemetry discharge summary and vital records.",
        "superseded_by": None,
        "superseded_at": None,
        "clinical_timestamp": "2026-10-18 14:00",
        "created_at": datetime(2026, 10, 18, 14, 0, tzinfo=timezone.utc),
    },
    # 2. Pending Review Record v1 (Aria AI / Clinician Proposed Titration)
    {
        "version_id": "VER-20261024-002",
        "record_id": "REC-PAT001-CARDIO-02",
        "patient_id": "PAT-SYN-001",
        "version_number": 1,
        "status": "pending_review",
        "record_type": "medication_reconciliation",
        "title": "Aria AI Proposal: Beta-Blocker Dose Titration",
        "department": "Cardiology",
        "hospital_id": "HOSP-METRO-01",
        "care_team_id": "CT-CARDIO-A",
        "data": {
            "proposed_medication": "Metoprolol Tartrate 50 mg PO BID",
            "previous_medication": "Metoprolol Tartrate 25 mg PO BID",
            "clinical_indication": "Resting pulse 92 bpm at outpatient cardiology visit; inadequate rate control.",
            "titration_rationale": "Gradual upward titration recommended per ACC/AHA AFib guidelines.",
        },
        "source_document_id": "DOC-SYN-84920-01",
        "source_text_snippet": "Outpatient Follow-up: Resting heart rate remains 92 bpm. Plan: Increase Metoprolol to 50mg BID.",
        "extracted_fields": [
            {
                "field_name": "proposed_medication",
                "value": "Metoprolol Tartrate 50 mg PO BID",
                "status": "inferred",
                "confidence_note": "Aria proposal from encounter follow-up notes",
            },
        ],
        "submitted_by": "USR-DOC-CARDIO-001",
        "submitter_name": "Dr. Marcus Vance",
        "submitted_at": datetime(2026, 10, 24, 11, 45, tzinfo=timezone.utc),
        "reviewed_by": None,
        "reviewer_name": None,
        "reviewed_at": None,
        "review_decision": None,
        "review_reason": None,
        "superseded_by": None,
        "superseded_at": None,
        "clinical_timestamp": "2026-10-24 10:15",
        "created_at": datetime(2026, 10, 24, 11, 45, tzinfo=timezone.utc),
    },
    # 3. Requires Correction Record v1 (Oncology extract requiring biopsy code)
    {
        "version_id": "VER-20261028-003",
        "record_id": "REC-PAT001-ONCO-01",
        "patient_id": "PAT-SYN-001",
        "version_number": 1,
        "status": "requires_correction",
        "record_type": "clinical_note",
        "title": "Oncology Baseline Screening Extract",
        "department": "Oncology",
        "hospital_id": "HOSP-METRO-01",
        "care_team_id": "CT-ONCO-4",
        "data": {
            "consultation_reason": "Screening for palpable nodule",
            "biopsy_ordered": "true",
            "provisional_code": "C79.9 (Unspecified secondary malignant neoplasm)",
        },
        "source_document_id": None,
        "source_text_snippet": "Screening note: Palpable nodule. Core biopsy ordered.",
        "extracted_fields": [],
        "submitted_by": "USR-DOC-ONCO-002",
        "submitter_name": "Dr. Elena Rostova",
        "submitted_at": datetime(2026, 10, 28, 9, 30, tzinfo=timezone.utc),
        "reviewed_by": "USR-VERIFIER-001",
        "reviewer_name": "Dr. Sarah Lin",
        "reviewed_at": datetime(2026, 10, 28, 14, 0, tzinfo=timezone.utc),
        "review_decision": "requires_correction",
        "review_reason": "Provisional ICD code C79.9 inappropriate prior to histological pathology report. Please adjust to benign/screening code pending lab results.",
        "superseded_by": None,
        "superseded_at": None,
        "clinical_timestamp": "2026-10-28 09:00",
        "created_at": datetime(2026, 10, 28, 9, 30, tzinfo=timezone.utc),
    },
]


def get_synthetic_users():
    pw_hash = hash_password(DEFAULT_DEV_PASSWORD)

    users = [
        # 1 Patient (Eleanor Vance)
        {
            "user_id": "USR-PATIENT-001",
            "name": "Eleanor Vance",
            "email": "patient.eleanor@synthetic.vericare.internal",
            "role": "patient",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "patient_id": "PAT-SYN-001",
                "care_team_id": "CT-INTERNAL-B",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        # Patient 2 (Arthur Pendelton)
        {
            "user_id": "USR-PATIENT-002",
            "name": "Arthur Pendelton",
            "email": "patient.arthur@synthetic.vericare.internal",
            "role": "patient",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-VALLEY-02",
            "scope": {
                "patient_id": "PAT-SYN-002",
                "care_team_id": "CT-NEURO-1",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        # 3 Doctors (different specialties)
        {
            "user_id": "USR-DOC-CARDIO-001",
            "name": "Dr. Marcus Vance",
            "email": "dr.marcus@synthetic.vericare.internal",
            "role": "doctor",
            "specialty": "Cardiology",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "care_team_id": "CT-CARDIO-A",
                "care_team_name": "Cardiology Team A",
                "hospital_id": "HOSP-METRO-01",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        {
            "user_id": "USR-DOC-ONCO-002",
            "name": "Dr. Elena Rostova",
            "email": "dr.elena@synthetic.vericare.internal",
            "role": "doctor",
            "specialty": "Oncology",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "care_team_id": "CT-ONCO-4",
                "care_team_name": "Oncology Team 4",
                "hospital_id": "HOSP-METRO-01",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        {
            "user_id": "USR-DOC-NEURO-003",
            "name": "Dr. James Thorne",
            "email": "dr.james@synthetic.vericare.internal",
            "role": "doctor",
            "specialty": "Neurology",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-VALLEY-02",
            "scope": {
                "care_team_id": "CT-NEURO-1",
                "care_team_name": "Neurology Team 1",
                "hospital_id": "HOSP-VALLEY-02",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        # 1 Verifier (Senior Doctor)
        {
            "user_id": "USR-VERIFIER-001",
            "name": "Dr. Sarah Lin",
            "email": "dr.sarah@synthetic.vericare.internal",
            "role": "senior_doctor",
            "specialty": "Internal Medicine & Clinical Governance",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "care_team_id": "CT-INTERNAL-B",
                "care_team_name": "Internal Medicine Team B",
                "hospital_id": "HOSP-METRO-01",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        # 1 Hospital Admin
        {
            "user_id": "USR-ADMIN-HOSP-001",
            "name": "David Chen",
            "email": "admin.david@synthetic.vericare.internal",
            "role": "hospital_admin",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "hospital_id": "HOSP-METRO-01",
            },
            "consent_active": True,
            "is_synthetic": True,
        },
        # 1 System Admin
        {
            "user_id": "USR-ADMIN-SYS-001",
            "name": "Alex Mercer",
            "email": "sys.alex@synthetic.vericare.internal",
            "role": "system_admin",
            "hashed_password": pw_hash,
            "hospital_id": None,
            "scope": {},
            "consent_active": True,
            "is_synthetic": True,
        },
    ]
    return users


async def seed_all():
    logger.info("Connecting to MongoDB: %s", settings.MONGODB_URL)
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]

    # 1. Seed Hospitals and Organizations
    logger.info("Seeding 2 synthetic hospitals and organizations...")
    for hosp in SYNTHETIC_HOSPITALS:
        await db.hospitals.update_one(
            {"hospital_id": hosp["hospital_id"]},
            {"$set": hosp},
            upsert=True,
        )
        await db.organizations.update_one(
            {"hospital_id": hosp["hospital_id"]},
            {"$set": hosp},
            upsert=True,
        )

    # 2. Seed Roles and Permissions
    logger.info("Seeding roles_permissions...")
    for rp in ROLES_PERMISSIONS_SEED:
        await db.roles_permissions.update_one(
            {"role": rp["role"]},
            {"$set": rp},
            upsert=True,
        )

    # 3. Seed Users
    logger.info("Seeding synthetic users (1 patient, 3 doctors, 1 verifier, 1 hosp admin, 1 sys admin)...")
    users = get_synthetic_users()
    for user in users:
        await db.users.update_one(
            {"email": user["email"]},
            {"$set": user},
            upsert=True,
        )

    # 4. Seed Patients
    logger.info("Seeding synthetic patients (Eleanor Vance linked to 2 hospitals, Arthur Pendelton)...")
    for pat in SYNTHETIC_PATIENTS:
        await db.patients.update_one(
            {"patient_id": pat["patient_id"]},
            {"$set": pat},
            upsert=True,
        )

    # 5. Seed Care Team Memberships
    logger.info("Seeding care_team_memberships...")
    for mem in CARE_TEAM_MEMBERSHIPS:
        await db.care_team_memberships.update_one(
            {"membership_id": mem["membership_id"]},
            {"$set": mem},
            upsert=True,
        )

    # 6. Seed Encounters
    logger.info("Seeding synthetic clinical encounters across hospitals...")
    for enc in SYNTHETIC_ENCOUNTERS:
        await db.encounters.update_one(
            {"encounter_id": enc["encounter_id"]},
            {"$set": enc},
            upsert=True,
        )

    # 7. Seed Record Versions (Approved, Pending Review, Requires Correction)
    logger.info("Seeding synthetic record_versions...")
    for rec in SYNTHETIC_RECORD_VERSIONS:
        await db.record_versions.update_one(
            {"version_id": rec["version_id"]},
            {"$set": rec},
            upsert=True,
        )

    # 8. Seed Synthetic Prescriptions
    logger.info("Seeding synthetic prescriptions...")
    SYNTHETIC_PRESCRIPTIONS = [
        {
            "prescription_id": "RX-PAT001-001",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-081",
            "drug_name": "Metoprolol Tartrate",
            "dosage": "25 mg",
            "frequency": "BID",
            "route": "PO",
            "duration_days": 90,
            "status": "active",
            "start_date": "2026-10-18",
            "prescribed_by": "Dr. Marcus Vance",
            "hospital_id": "HOSP-METRO-01",
            "notes": "Rate control for paroxysmal AFib",
        },
        {
            "prescription_id": "RX-PAT001-002",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-081",
            "drug_name": "Lisinopril",
            "dosage": "10 mg",
            "frequency": "daily",
            "route": "PO",
            "duration_days": 90,
            "status": "active",
            "start_date": "2026-10-18",
            "prescribed_by": "Dr. Marcus Vance",
            "hospital_id": "HOSP-METRO-01",
            "notes": "Antihypertensive therapy",
        },
        {
            "prescription_id": "RX-PAT001-003",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-081",
            "drug_name": "Atorvastatin",
            "dosage": "20 mg",
            "frequency": "bedtime",
            "route": "PO",
            "duration_days": 90,
            "status": "active",
            "start_date": "2026-10-18",
            "prescribed_by": "Dr. Marcus Vance",
            "hospital_id": "HOSP-METRO-01",
            "notes": "Lipid management",
        },
        # -------------------------------------------------------------
        # SCENARIO: Hospital A (Oct 2) -> Specialist Discontinues (Oct 8) -> Hospital B Imports Older List (Oct 12)
        # -------------------------------------------------------------
        {
            "prescription_id": "RX-PAT001-SCENARIO-01",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-072",
            "drug_name": "Amlodipine (Medication X)",
            "dosage": "10 mg",
            "frequency": "daily",
            "route": "PO",
            "duration_days": 90,
            "status": "active",
            "start_date": "2026-10-02",
            "prescribed_by": "Dr. Marcus Vance",
            "hospital_id": "HOSP-METRO-01",
            "notes": "Hospital A (Metro Health) Inpatient blood pressure management order",
        },
        {
            "prescription_id": "RX-PAT001-SCENARIO-02",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-078",
            "drug_name": "Amlodipine (Medication X)",
            "dosage": "10 mg",
            "frequency": "daily",
            "route": "PO",
            "duration_days": None,
            "status": "discontinued",
            "start_date": "2026-10-08",
            "prescribed_by": "Dr. Marcus Vance (Specialist)",
            "hospital_id": "HOSP-METRO-01",
            "discontinuation_reason": "Specialist discontinuation: Refractory bilateral peripheral lower extremity edema. Discontinue calcium channel blocker therapy.",
            "notes": "Discontinued on Oct 8 by cardiology specialist due to side effects",
        },
        {
            "prescription_id": "RX-PAT001-SCENARIO-03",
            "patient_id": "PAT-SYN-001",
            "encounter_id": "ENC-2026-088",
            "drug_name": "Amlodipine (Medication X)",
            "dosage": "10 mg",
            "frequency": "daily",
            "route": "PO",
            "duration_days": 30,
            "status": "active",
            "start_date": "2026-10-12",
            "prescribed_by": "Dr. David Miller (Valley Intake)",
            "hospital_id": "HOSP-VALLEY-02",
            "notes": "Hospital B (Valley Clinic) imported legacy medication list without cross-hospital reconciliation",
        },
    ]
    for rx in SYNTHETIC_PRESCRIPTIONS:
        await db.prescriptions.update_one(
            {"prescription_id": rx["prescription_id"]},
            {"$set": rx},
            upsert=True,
        )

    # 9. Clear any transient timeline conflicts for clean baseline
    await db.timeline_conflicts.delete_many({})

    client.close()
    logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_all())
