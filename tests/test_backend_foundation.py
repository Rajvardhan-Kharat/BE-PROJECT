import pytest
from httpx import AsyncClient
from backend.app.core.database import get_database
from backend.app.repositories.audit_repository import audit_repository

SYNTHETIC_PASSWORD = "synthetic-dev-password"

ROLES_USERS_TO_TEST = [
    ("patient", "patient.eleanor@synthetic.vericare.internal", "Eleanor Vance"),
    ("doctor (Cardiology)", "dr.marcus@synthetic.vericare.internal", "Dr. Marcus Vance"),
    ("doctor (Oncology)", "dr.elena@synthetic.vericare.internal", "Dr. Elena Rostova"),
    ("doctor (Neurology)", "dr.james@synthetic.vericare.internal", "Dr. James Thorne"),
    ("senior_doctor (verifier)", "dr.sarah@synthetic.vericare.internal", "Dr. Sarah Lin"),
    ("hospital_admin", "admin.david@synthetic.vericare.internal", "David Chen"),
    ("system_admin", "sys.alex@synthetic.vericare.internal", "Alex Mercer"),
]


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Checks /api/v1/health returns 200 with database connected."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "rules" in data


@pytest.mark.asyncio
@pytest.mark.parametrize("role_label,email,expected_name", ROLES_USERS_TO_TEST)
async def test_login_per_role(client: AsyncClient, role_label: str, email: str, expected_name: str):
    """Tests successful authentication for every synthetic role and doctor specialty."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": SYNTHETIC_PASSWORD},
    )
    assert response.status_code == 200, f"Failed login for {role_label}: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["name"] == expected_name
    assert data["user"]["email"] == email


@pytest.mark.asyncio
async def test_uniform_login_error_responses(client: AsyncClient):
    """
    Verifies that failed logins return an identical uniform error shape and message,
    whether the email is non-existent or the password is incorrect.
    """
    # 1. Non-existent email
    res1 = await client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent.user@hospital.org", "password": "any-password"},
    )
    assert res1.status_code == 401
    body1 = res1.json()
    assert body1["error"]["code"] == "UNAUTHORIZED"
    assert body1["error"]["message"] == "Invalid email or password."

    # 2. Existing email with incorrect password
    res2 = await client.post(
        "/api/v1/auth/login",
        json={"email": "dr.sarah@synthetic.vericare.internal", "password": "wrong-password-123"},
    )
    assert res2.status_code == 401
    body2 = res2.json()
    assert body2["error"]["code"] == "UNAUTHORIZED"
    assert body2["error"]["message"] == "Invalid email or password."

    # Invariant: error shapes and messages must be identical
    assert body1["error"] == body2["error"]


@pytest.mark.asyncio
async def test_protected_route_returns_401_without_token(client: AsyncClient):
    """Verifies that protected routes reject requests without a bearer token."""
    response = await client.get("/api/v1/protected/verifier-only")
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert "token missing or invalid" in body["error"]["message"].lower()


@pytest.mark.asyncio
async def test_logout_denylists_token_and_blocks_further_access(client: AsyncClient):
    """Verifies that logging out denylists the JWT, immediately returning 401 on reused tokens."""
    # 1. Login to obtain a valid token
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "dr.marcus@synthetic.vericare.internal", "password": SYNTHETIC_PASSWORD},
    )
    token = login_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Access authorized endpoint before logout
    pre_logout_res = await client.get("/api/v1/auth/me", headers=auth_header)
    assert pre_logout_res.status_code == 200

    # 3. Perform logout
    logout_res = await client.post("/api/v1/auth/logout", headers=auth_header)
    assert logout_res.status_code == 200
    assert logout_res.json()["denylisted"] is True

    # 4. Attempt to access again with the now-denylisted token -> Must return 401
    post_logout_res = await client.get("/api/v1/auth/me", headers=auth_header)
    assert post_logout_res.status_code == 401
    body = post_logout_res.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert "revoked" in body["error"]["message"].lower()


@pytest.mark.asyncio
async def test_403_access_denial_is_strictly_audited(client: AsyncClient):
    """
    Verifies that RBAC default-deny triggers a 403 error AND persists an immutable
    audit record in the audit_events collection.
    """
    # 1. Login as patient (who lacks 'records:verify' permission)
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "patient.eleanor@synthetic.vericare.internal", "password": SYNTHETIC_PASSWORD},
    )
    patient_token = login_res.json()["access_token"]
    patient_user_id = login_res.json()["user"]["user_id"]

    # Record audit count prior to forbidden request
    db = await get_database()
    prior_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": patient_user_id,
    })

    # 2. Attempt to access verifier-only endpoint with patient credentials
    forbidden_res = await client.get(
        "/api/v1/protected/verifier-only",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert forbidden_res.status_code == 403
    err_body = forbidden_res.json()
    assert err_body["error"]["code"] == "FORBIDDEN"
    assert "lacks required permission" in err_body["error"]["message"].lower()

    # 3. Invariant: Check that ACCESS_DENIED_403 was written to audit_events collection
    new_audit_count = await db.audit_events.count_documents({
        "event_type": "ACCESS_DENIED_403",
        "user_id": patient_user_id,
    })
    assert new_audit_count == prior_audit_count + 1

    # Inspect the persisted audit event
    latest_event = await db.audit_events.find_one(
        {"event_type": "ACCESS_DENIED_403", "user_id": patient_user_id},
        sort=[("timestamp", -1)],
    )
    assert latest_event is not None
    assert latest_event["status"] == "DENIED"
    assert latest_event["role"] == "patient"
    assert latest_event["details"]["requested_permission"] == "records:verify"


@pytest.mark.asyncio
async def test_verifier_can_access_verifier_route(client: AsyncClient):
    """Verifies that senior_doctor (verifier) with care team scope can access verifier endpoint."""
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "dr.sarah@synthetic.vericare.internal", "password": SYNTHETIC_PASSWORD},
    )
    verifier_token = login_res.json()["access_token"]

    response = await client.get(
        "/api/v1/protected/verifier-only",
        headers={"Authorization": f"Bearer {verifier_token}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "authorized"


@pytest.mark.asyncio
async def test_consistent_json_error_shape_and_no_stack_traces(client: AsyncClient):
    """Verifies that all errors follow {"error": {"code": "...", "message": "...", "details": ...}}."""
    # 404 error
    res_404 = await client.get("/api/v1/non-existent-route")
    assert res_404.status_code == 404
    body = res_404.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]
    assert "traceback" not in body["error"]
    assert "stack" not in body["error"]
