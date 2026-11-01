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

    logger.info("Creating indexes for collection 'hospitals'...")
    await db.hospitals.create_indexes([
        IndexModel([("hospital_id", ASCENDING)], unique=True, name="idx_hospitals_id_unique"),
    ])

    client.close()
    logger.info("All MongoDB indexes created successfully.")


if __name__ == "__main__":
    asyncio.run(create_indexes())
