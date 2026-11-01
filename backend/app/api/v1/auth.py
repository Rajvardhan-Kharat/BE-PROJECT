from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from backend.app.core.config import settings
from backend.app.core.security import create_access_token, verify_password
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.token_denylist_repository import token_denylist_repository
from backend.app.repositories.user_repository import user_repository
from backend.app.schemas.auth import LoginRequest, LogoutResponse, TokenResponse, UserResponse
from backend.app.services.audit_service import audit_service

router = APIRouter()

# Uniform error message requirement: Never leak whether email or password was wrong
UNIFORM_AUTH_ERROR = "Invalid email or password."


@router.post("/auth/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginRequest):
    client_ip = request.client.host if request.client else None
    email_clean = payload.email.lower().strip()

    user = await user_repository.get_by_email(email_clean)
    if not user:
        await audit_service.log_login_failure(
            email=email_clean,
            reason="User not found",
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=UNIFORM_AUTH_ERROR,
        )

    # Verify password hash with Argon2
    password_valid = verify_password(payload.password, user.get("hashed_password", ""))
    if not password_valid:
        await audit_service.log_login_failure(
            email=email_clean,
            reason="Password mismatch",
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=UNIFORM_AUTH_ERROR,
        )

    # Issue JWT
    token_str, jti, expire = create_access_token(
        subject=user["user_id"],
        role=user["role"],
        email=user["email"],
        scope=user.get("scope", {}),
    )

    await audit_service.log_login_success(
        user_id=user["user_id"],
        role=user["role"],
        email=user["email"],
        ip_address=client_ip,
    )

    user_resp = UserResponse(
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
        role=user["role"],
        specialty=user.get("specialty"),
        hospital_id=user.get("hospital_id"),
        scope=user.get("scope", {}),
        consent_active=user.get("consent_active", True),
    )

    return TokenResponse(
        access_token=token_str,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_resp,
    )


@router.post("/auth/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    jti = current_user.get("_jti")
    exp_timestamp = current_user.get("_exp")
    client_ip = request.client.host if request.client else None

    if jti:
        if exp_timestamp:
            expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        else:
            expires_at = datetime.now(timezone.utc)

        await token_denylist_repository.denylist_token(
            jti=jti,
            expires_at=expires_at,
            user_id=current_user.get("user_id"),
            reason="user_logout",
        )

    await audit_service.log_logout(
        user_id=current_user.get("user_id"),
        role=current_user.get("role"),
        jti=jti or "unknown",
        ip_address=client_ip,
    )

    return LogoutResponse(message="Successfully logged out.", denylisted=True)


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        user_id=current_user["user_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        specialty=current_user.get("specialty"),
        hospital_id=current_user.get("hospital_id"),
        scope=current_user.get("scope", {}),
        consent_active=current_user.get("consent_active", True),
    )
