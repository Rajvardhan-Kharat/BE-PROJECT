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

    client.close()
    logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_all())
