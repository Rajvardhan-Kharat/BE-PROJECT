import hashlib
import hmac
from backend.app.core.config import settings


def derive_pseudonymous_user_id(patient_id: str) -> str:
    """
    Derives an opaque, deterministic pseudonymous identifier for a patient
    using HMAC-SHA256 with a server-side secret salt.

    Invariant: VeriCare NEVER sends real patient name, internal MRN, or real patient ID
    to the Aria service. Only this pseudonymous identifier is passed across the boundary.
    """
    salt = settings.ARIA_HMAC_SALT.encode("utf-8")
    raw_hash = hmac.new(salt, patient_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"aria_pseudo_usr_{raw_hash[:16]}"
