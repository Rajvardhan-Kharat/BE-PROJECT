import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api.v1.audit import router as audit_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.documents import router as documents_router
from backend.app.api.v1.emergency import router as emergency_router
from backend.app.api.v1.agent_runs import router as agent_runs_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.patients import router as patients_router
from backend.app.api.v1.protected_demo import router as protected_router
from backend.app.api.v1.safety import router as safety_router
from backend.app.api.v1.timeline_audit import router as timeline_audit_router
from backend.app.api.v1.verification import router as verification_router
from backend.app.core.config import settings
from backend.app.core.database import close_mongo_connection, connect_to_mongo

# Configure secure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("vericare.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation
    logger.info("Initializing VeriCare AI backend (Environment: %s)", settings.ENVIRONMENT)
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="VeriCare AI - Clinical verification & governance prototype (Synthetic data only)",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Consistent JSON Error Responses - Never leak stack traces!
@app.exception_handler(StarletteHTTPException)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "UNPROCESSABLE_ENTITY",
    }
    error_code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": error_code,
                "message": exc.detail,
                "details": getattr(exc, "headers", None),
            }
        },
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request parameter or payload.",
                "details": exc.errors(),
            }
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Log internal error on server without leaking stack trace to client
    logger.error("Unhandled server exception on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected server error occurred. Please contact the administrator.",
                "details": None,
            }
        },
    )


# Register API v1 Routers
api_v1_str = settings.API_V1_STR
app.include_router(health_router, prefix=api_v1_str, tags=["Health"])
app.include_router(auth_router, prefix=api_v1_str, tags=["Authentication"])
app.include_router(patients_router, prefix=api_v1_str, tags=["Patients"])
app.include_router(documents_router, prefix=api_v1_str, tags=["Documents & Extraction"])
app.include_router(verification_router, prefix=api_v1_str, tags=["Clinical Verification"])
app.include_router(safety_router, prefix=api_v1_str, tags=["Clinical Safety & Conflict Detection"])
app.include_router(timeline_audit_router, prefix=api_v1_str, tags=["Timeline Conflict Audit"])
app.include_router(emergency_router, prefix=api_v1_str, tags=["Emergency Clinical Profile"])
app.include_router(agent_runs_router, prefix=api_v1_str, tags=["Agent Execution Logs"])
app.include_router(audit_router, prefix=api_v1_str, tags=["Audit Trail"])
app.include_router(protected_router, prefix=api_v1_str, tags=["RBAC Protected"])


@app.get("/")
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "mode": "Academic Prototype - Synthetic Data Only",
        "health": f"{api_v1_str}/health",
    }
