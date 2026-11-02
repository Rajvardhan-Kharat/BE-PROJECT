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

    logger.info("Creating indexes for collection 'record_versions'...")
    await db.record_versions.create_indexes([
        IndexModel([("version_id", ASCENDING)], unique=True, name="idx_record_versions_id_unique"),
        IndexModel([("record_id", ASCENDING), ("version_number", ASCENDING)], name="idx_record_versions_rec_num"),
        IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)], name="idx_record_versions_patient_status"),
        IndexModel([("status", ASCENDING)], name="idx_record_versions_status"),
        IndexModel([("hospital_id", ASCENDING)], name="idx_record_versions_hospital"),
    ])

    logger.info("Creating indexes for collection 'clinical_alerts'...")
    await db.clinical_alerts.create_indexes([
        IndexModel([("alert_id", ASCENDING)], unique=True, name="idx_clinical_alerts_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)], name="idx_clinical_alerts_patient_status"),
        IndexModel([("patient_id", ASCENDING), ("rule_id", ASCENDING), ("evidence_signature", ASCENDING)], name="idx_clinical_alerts_dedup"),
        IndexModel([("type", ASCENDING)], name="idx_clinical_alerts_type"),
    ])

    logger.info("Creating indexes for collection 'prescriptions'...")
    await db.prescriptions.create_indexes([
        IndexModel([("prescription_id", ASCENDING)], unique=True, name="idx_prescriptions_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)], name="idx_prescriptions_patient_status"),
    ])

    logger.info("Creating indexes for collection 'timeline_conflicts'...")
    await db.timeline_conflicts.create_indexes([
        IndexModel([("conflict_id", ASCENDING)], unique=True, name="idx_timeline_conflicts_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)], name="idx_timeline_conflicts_patient_status"),
        IndexModel([("rule_id", ASCENDING)], name="idx_timeline_conflicts_rule_id"),
    ])

    logger.info("Creating indexes for collection 'agent_execution_logs'...")
    await db.agent_execution_logs.create_indexes([
        IndexModel([("run_id", ASCENDING)], unique=True, name="idx_agent_logs_run_id_unique"),
        IndexModel([("request_id", ASCENDING)], name="idx_agent_logs_request_id"),
        IndexModel([("agent_name", ASCENDING)], name="idx_agent_logs_agent_name"),
        IndexModel([("patient_id", ASCENDING)], name="idx_agent_logs_patient_id"),
        IndexModel([("started_at", ASCENDING)], name="idx_agent_logs_started_at"),
    ])

    logger.info("Creating indexes for collection 'patient_consents'...")
    await db.patient_consents.create_indexes([
        IndexModel([("consent_id", ASCENDING)], unique=True, name="idx_consents_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("status", ASCENDING)], name="idx_consents_patient_status"),
        IndexModel([("patient_id", ASCENDING), ("recipient", ASCENDING), ("status", ASCENDING)], name="idx_consents_patient_recip_status"),
    ])

    logger.info("Creating indexes for collection 'break_glass_sessions'...")
    await db.break_glass_sessions.create_indexes([
        IndexModel([("session_id", ASCENDING)], unique=True, name="idx_bg_session_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("clinician_id", ASCENDING), ("status", ASCENDING)], name="idx_bg_pat_clin_status"),
        IndexModel([("clinician_id", ASCENDING), ("granted_at", ASCENDING)], name="idx_bg_clin_granted_rate_limit"),
        IndexModel([("review_status", ASCENDING)], name="idx_bg_review_status"),
        IndexModel([("expires_at", ASCENDING)], name="idx_bg_expires_at"),
    ])

    logger.info("Creating indexes for collection 'patient_notifications'...")
    await db.patient_notifications.create_indexes([
        IndexModel([("notification_id", ASCENDING)], unique=True, name="idx_notif_id_unique"),
        IndexModel([("patient_id", ASCENDING), ("created_at", ASCENDING)], name="idx_notif_patient_created"),
        IndexModel([("patient_id", ASCENDING), ("read", ASCENDING)], name="idx_notif_patient_read"),
    ])

    client.close()
    logger.info("All MongoDB indexes created successfully.")


if __name__ == "__main__":
    asyncio.run(create_indexes())
