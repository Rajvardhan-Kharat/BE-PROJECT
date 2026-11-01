from typing import Any, Dict, Optional
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    specialty: Optional[str] = None
    hospital_id: Optional[str] = None
    scope: Dict[str, Any] = {}
    consent_active: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserResponse


class LogoutResponse(BaseModel):
    message: str = "Successfully logged out."
    denylisted: bool = True
