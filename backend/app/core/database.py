import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from backend.app.core.config import settings

logger = logging.getLogger("vericare.database")


class Database:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None


db_instance = Database()


async def connect_to_mongo():
    logger.info("Connecting to MongoDB at %s", settings.MONGODB_URL)
    db_instance.client = AsyncIOMotorClient(
        settings.MONGODB_URL,
        serverSelectionTimeoutMS=5000,
    )
    db_instance.db = db_instance.client[settings.MONGODB_DB_NAME]
    # Verify connection
    await db_instance.client.admin.command("ping")
    logger.info("Successfully connected to MongoDB database '%s'", settings.MONGODB_DB_NAME)


async def close_mongo_connection():
    if db_instance.client:
        logger.info("Closing MongoDB connection")
        db_instance.client.close()
        logger.info("MongoDB connection closed")


async def get_database() -> AsyncIOMotorDatabase:
    if db_instance.db is None:
        raise RuntimeError("Database connection has not been initialized.")
    return db_instance.db
