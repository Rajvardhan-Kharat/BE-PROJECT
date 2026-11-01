import pytest
import httpx
from backend.app.main import app
from backend.app.core.database import connect_to_mongo, close_mongo_connection
from scripts.create_indexes import create_indexes
from scripts.seed_users import seed_all


@pytest.fixture(scope="session", autouse=True)
async def initialize_test_database():
    """Initializes MongoDB connection and seeds synthetic users for testing."""
    await connect_to_mongo()
    await create_indexes()
    await seed_all()
    yield
    await close_mongo_connection()


@pytest.fixture
async def client():
    """Async HTTP test client for FastAPI."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
