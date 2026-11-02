from typing import Any, Dict, List, Optional
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Request,
    UploadFile,
    status,
)
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.document_repository import document_repository
from backend.app.services.document_service import document_service
from backend.app.services.patient_service import patient_service

router = APIRouter()


@router.post("/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    file: UploadFile = File(..., description="Clinical PDF document"),
    patient_id: str = Form(..., description="Target patient internal ID"),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Security-critical document upload and extraction endpoint:
      - Validates PDF magic bytes (%PDF-)
      - Enforces strict file size cap (10MB)
      - Computes SHA-256 content hash
      - Enforces idempotency: identical upload returns existing pending_review record
      - Extracts text preserving page and character offsets
      - Evaluates extraction through LLM provider abstraction
      - MANDATORY: Validates all source span quotes; rejects or downgrades hallucinated spans
      - Stores result strictly as 'pending_review' in untrusted collection
    """
    client_ip = request.client.host if request.client else None
    content = await file.read()

    result = await document_service.upload_and_process_document(
        file_bytes=content,
        original_filename=file.filename or "clinical_document.pdf",
        patient_id=patient_id,
        user=current_user,
        request_id=x_request_id,
        client_ip=client_ip,
    )

    return result


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Returns single document extraction with text and fields."""
    doc = await document_repository.get_by_document_id(document_id)
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Document not found")
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=doc["patient_id"],
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )
    return doc


@router.post("/documents/{document_id}/corrections")
async def add_human_correction(
    document_id: str,
    correction: Dict[str, Any],
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Records reviewer human correction (original, corrected, reason)."""
    from datetime import datetime, timezone
    from fastapi import HTTPException
    doc = await document_repository.get_by_document_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=doc["patient_id"],
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )
    corrections = doc.get("human_corrections", [])
    corrections.append({
        "field_name": correction.get("field_name"),
        "original_value": correction.get("original_value"),
        "corrected_value": correction.get("corrected_value"),
        "reason": correction.get("reason"),
        "corrected_by": current_user.get("user_id"),
        "corrected_at": datetime.now(timezone.utc).isoformat(),
    })
    await document_repository.update_one(
        {"document_id": document_id},
        {"human_corrections": corrections}
    )
    return {"status": "success", "corrections_count": len(corrections)}


@router.get("/documents/patient/{patient_id}")
async def list_patient_documents(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Lists untrusted extractions pending review for an authorized patient."""
    client_ip = request.client.host if request.client else None
    await patient_service.check_patient_access(
        user=current_user,
        patient_id=patient_id,
        resource_path=str(request.url.path),
        client_ip=client_ip,
    )

    docs = await document_repository.get_patient_documents(patient_id=patient_id)
    return [
        {
            "document_id": d["document_id"],
            "patient_id": d["patient_id"],
            "filename": d.get("original_filename"),
            "status": d.get("status", "pending_review"),
            "fields_count": len(d.get("fields", [])),
            "content_hash": d.get("content_hash"),
            "uploaded_at": d.get("uploaded_at"),
            "provider_name": d.get("provider_name"),
        }
        for d in docs
    ]
