import asyncio
import logging
import sys
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
        "is_synthetic": True,
    },
    {
        "hospital_id": "HOSP-VALLEY-02",
        "name": "Valley Memorial Community Hospital",
        "region": "Region South",
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


def get_synthetic_users():
    pw_hash = hash_password(DEFAULT_DEV_PASSWORD)

    users = [
        # 1 Patient
        {
            "user_id": "USR-PATIENT-001",
            "name": "Eleanor Vance",
            "email": "patient.eleanor@synthetic.vericare.internal",
            "role": "patient",
            "hashed_password": pw_hash,
            "hospital_id": "HOSP-METRO-01",
            "scope": {
                "patient_id": "SYN-84920",
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

    # 1. Seed Hospitals
    logger.info("Seeding 2 synthetic hospitals...")
    for hosp in SYNTHETIC_HOSPITALS:
        await db.hospitals.update_one(
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

    client.close()
    logger.info("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_all())
