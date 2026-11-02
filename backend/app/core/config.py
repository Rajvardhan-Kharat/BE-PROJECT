from typing import List, Literal
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "VeriCare AI"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: Literal["development", "staging", "production", "testing"] = "development"

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "vericare_db"

    # Security & JWT
    JWT_SECRET_KEY: str = "vericare-super-secret-synthetic-jwt-key-32-chars-min!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # External Aria Service Adapter
    ARIA_SERVICE_URL: str = "http://localhost:8001"

    # Uploads & Extraction Storage
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB size cap
    RATE_LIMIT_UPLOADS_PER_MINUTE: int = 20

    # LLM Provider Configuration
    LLM_PROVIDER_TYPE: Literal["mock", "real_stub"] = "mock"
    LLM_API_KEY: str | None = None
    LLM_API_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TIMEOUT_SECONDS: float = 10.0

    # Break-Glass Emergency Override Configuration
    BREAK_GLASS_ALLOWED_ROLES: List[str] = ["doctor", "senior_doctor"]
    BREAK_GLASS_DEFAULT_DURATION_MINUTES: int = 60
    BREAK_GLASS_RATE_LIMIT_PER_HOUR: int = 5

    # Consent Subsystem Configuration
    CONSENT_DEFAULT_TEXT_VERSION: str = "v1.0-synthetic-clinical-consent"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters long for security.")
        return v

    @field_validator("MONGODB_URL")
    @classmethod
    def validate_mongodb_url(cls, v: str) -> str:
        if not (v.startswith("mongodb://") or v.startswith("mongodb+srv://")):
            raise ValueError("MONGODB_URL must start with 'mongodb://' or 'mongodb+srv://'")
        return v


settings = Settings()
