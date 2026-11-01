import asyncio
import logging
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo import ASCENDING, IndexModel
from motor.motor_asyncio import AsyncIOMotorClient
from backend.app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scripts.create_indexes")


async def create_indexes():
    logger.info("Connecting to MongoDB: %s", settings.MONGODB_URL)
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]

    logger.info("Creating indexes for collection 'users'...")
    await db.users.create_indexes([
        IndexModel([("email", ASCENDING)], unique=True, name="idx_users_email_unique"),
        IndexModel([("user_id", ASCENDING)], unique=True, name="idx_users_user_id_unique"),
        IndexModel([("role", ASCENDING)], name="idx_users_role"),
    ])

    logger.info("Creating indexes for collection 'token_denylist'...")
    await db.token_denylist.create_indexes([
        IndexModel([("jti", ASCENDING)], unique=True, name="idx_token_denylist_jti_unique"),
        IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0, name="idx_token_denylist_ttl"),
    ])

    logger.info("Creating indexes for collection 'roles_permissions'...")
    await db.roles_permissions.create_indexes([
        IndexModel([("role", ASCENDING)], unique=True, name="idx_roles_permissions_role_unique"),
    ])

    logger.info("Creating indexes for collection 'audit_events'...")
    await db.audit_events.create_indexes([
        IndexModel([("timestamp", ASCENDING)], name="idx_audit_timestamp"),
        IndexModel([("event_type", ASCENDING)], name="idx_audit_event_type"),
        IndexModel([("user_id", ASCENDING)], name="idx_audit_user_id"),
        IndexModel([("role", ASCENDING)], name="idx_audit_role"),
    ])

    logger.info("Creating indexes for collection 'hospitals' and 'organizations'...")
    await db.hospitals.create_indexes([
        IndexModel([("hospital_id", ASCENDING)], unique=True, name="idx_hospitals_id_unique"),
    ])
    await db.organizations.create_indexes([
        IndexModel([("hospital_id", ASCENDING)], unique=True, name="idx_organizations_id_unique"),
    ])

    logger.info("Creating indexes for collection 'patients'...")
    await db.patients.create_indexes([
        IndexModel([("patient_id", ASCENDING)], unique=True, name="idx_patients_id_unique"),
        IndexModel([("mrn", ASCENDING)], unique=True, name="idx_patients_mrn_unique"),
        IndexModel([("hospital_ids", ASCENDING)], name="idx_patients_hospitals"),
    ])

    logger.info("Creating indexes for collection 'care_team_memberships'...")
    await db.care_team_memberships.create_indexes([
        IndexModel([("care_team_id", ASCENDING), ("patient_id", ASCENDING)], name="idx_care_team_patient"),
        IndexModel([("clinician_id", ASCENDING)], name="idx_care_team_clinician"),
        IndexModel([("patient_id", ASCENDING)], name="idx_care_team_patient_only"),
    ])

    logger.info("Creating indexes for collection 'encounters'...")
    await db.encounters.create_indexes([
        IndexModel([("encounter_id", ASCENDING)], unique=True, name="idx_encounters_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("admission_date", ASCENDING)], name="idx_encounters_patient_date"),
        IndexModel([("hospital_id", ASCENDING)], name="idx_encounters_hospital"),
    ])

    logger.info("Creating indexes for collection 'untrusted_documents'...")
    await db.untrusted_documents.create_indexes([
        IndexModel([("document_id", ASCENDING)], unique=True, name="idx_untrusted_docs_id_unique"),
        IndexModel([("content_hash", ASCENDING), ("patient_id", ASCENDING)], name="idx_untrusted_docs_hash_patient"),
        IndexModel([("patient_id", ASCENDING)], name="idx_untrusted_docs_patient"),
    ])

    client.close()
    logger.info("All MongoDB indexes created successfully.")


if __name__ == "__main__":
    asyncio.run(create_indexes())
