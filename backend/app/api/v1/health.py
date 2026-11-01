from datetime import datetime, timezone
from fastapi import APIRouter
from backend.app.core.config import settings
from backend.app.core.database import get_database

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint checking application and MongoDB connection."""
    db_status = "connected"
    try:
        db = await get_database()
        await db.command("ping")
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "rules": {
            "ai_boundary": "AI proposes / backend enforces / humans decide",
            "data_mode": "Strictly synthetic data only",
        },
    }
