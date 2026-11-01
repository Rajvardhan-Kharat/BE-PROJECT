from typing import Any, Callable, Dict, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from backend.app.core.security import decode_access_token
from backend.app.repositories.roles_permissions_repository import roles_permissions_repository
from backend.app.repositories.token_denylist_repository import token_denylist_repository
from backend.app.repositories.user_repository import user_repository
from backend.app.services.audit_service import audit_service

security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Dict[str, Any]:
    """
    Extracts, verifies, and decodes the JWT bearer token.
    Enforces token denylist checks.
    Returns the user document or token payload.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing or invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if jti:
        is_revoked = await token_denylist_repository.is_denylisted(jti)
        if is_revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked or logged out.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    user_id = payload.get("sub")
    user = await user_repository.get_by_user_id(user_id)
    if not user:
        # Fallback to token payload if user is mock / transient
        user = {
            "user_id": user_id,
            "email": payload.get("email"),
            "role": payload.get("role"),
            "scope": payload.get("scope", {}),
            "consent_active": True,
        }

    # Attach token metadata for logout
    user["_jti"] = jti
    user["_exp"] = payload.get("exp")
    user["_token"] = token
    return user


def require(permission: str, required_scope: Optional[str] = None) -> Callable:
    """
    FastAPI dependency for RBAC: Role + Scope + Consent check.
    Enforces strict default deny: every denial is audited to audit_events collection.
    """

    async def permission_checker(
        request: Request,
        current_user: Dict[str, Any] = Depends(get_current_user),
    ) -> Dict[str, Any]:
        role = current_user.get("role")
        user_id = current_user.get("user_id")
        user_scope = current_user.get("scope", {})
        consent_active = current_user.get("consent_active", True)
        client_ip = request.client.host if request.client else None

        # 1. Consent / State Check (Missing consent blocks clinical access)
        if not consent_active and role not in ["system_admin"]:
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=role,
                permission=permission,
                resource=str(request.url.path),
                scope=user_scope,
                reason="Consent inactive or revoked",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Patient care consent is inactive or revoked (audited).",
            )

        # 2. RBAC Permissions Check against roles_permissions collection
        granted_permissions = await roles_permissions_repository.get_permissions_for_role(role)

        # Wildcard permission or explicit permission check
        has_permission = ("*" in granted_permissions) or (permission in granted_permissions)

        if not has_permission:
            await audit_service.log_access_denied_403(
                user_id=user_id,
                role=role,
                permission=permission,
                resource=str(request.url.path),
                scope=user_scope,
                reason=f"Role '{role}' lacks permission '{permission}'",
                ip_address=client_ip,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Role '{role}' lacks required permission '{permission}' (audited).",
            )

        # 3. Scope Check (e.g. Care Team Scope or Hospital Scope if required)
        if required_scope:
            has_scope = False
            if role == "system_admin":
                has_scope = True
            elif required_scope == "care_team":
                has_scope = bool(user_scope.get("care_team_id") or user_scope.get("care_team_name"))
            elif required_scope == "hospital":
                has_scope = bool(user_scope.get("hospital_id"))
            elif required_scope == "patient_self":
                has_scope = bool(user_scope.get("patient_id"))
            else:
                has_scope = required_scope in user_scope

            if not has_scope:
                await audit_service.log_access_denied_403(
                    user_id=user_id,
                    role=role,
                    permission=permission,
                    resource=str(request.url.path),
                    scope=user_scope,
                    reason=f"User scope does not satisfy '{required_scope}'",
                    ip_address=client_ip,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: Scope requirement '{required_scope}' not satisfied (audited).",
                )

        return current_user

    return permission_checker
