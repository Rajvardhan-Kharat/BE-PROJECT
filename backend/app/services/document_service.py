import hashlib
import logging
import os
import time
import uuid
from typing import Any, Dict, Optional, Tuple
from fastapi import HTTPException, status
from backend.app.core.config import settings
from backend.app.repositories.document_repository import document_repository
from backend.app.schemas.extraction import ExtractionDocumentResult
from backend.app.services.extraction_service import extraction_service
from backend.app.services.patient_service import patient_service
from backend.app.services.pdf_service import pdf_service

logger = logging.getLogger("vericare.document")

# In-memory rate limiting tracker: user_id/ip -> list of timestamps
_upload_rate_limits: Dict[str, list[float]] = {}


class DocumentService:
    @staticmethod
    def check_rate_limit(client_identifier: str) -> None:
        """Enforces rate limit for document uploads."""
        now = time.time()
        window = 60.0  # 1 minute window
        max_requests = settings.RATE_LIMIT_UPLOADS_PER_MINUTE

        timestamps = _upload_rate_limits.get(client_identifier, [])
        # Retain only timestamps within the last 60 seconds
        valid_timestamps = [t for t in timestamps if now - t < window]

        if len(valid_timestamps) >= max_requests:
            logger.warning("Upload rate limit exceeded for client %s", client_identifier)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Upload rate limit exceeded ({max_requests} uploads per minute). Please retry later.",
            )

        valid_timestamps.append(now)
        _upload_rate_limits[client_identifier] = valid_timestamps

    @staticmethod
    def validate_pdf_content(content: bytes) -> Tuple[str, int]:
        """
        Validates PDF by magic bytes (%PDF-) and enforces strict size cap.
        Returns: (content_hash, size_bytes)
        """
        size = len(content)

        # 1. Size cap check
        if size > settings.MAX_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum allowed upload size ({max_mb:.1f} MB).",
            )

        # 2. Magic bytes validation (%PDF-)
        if not content.startswith(b"%PDF-"):
            logger.warning("Rejected file upload: Invalid magic bytes. Header does not start with %%PDF-.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file format: File header must contain valid PDF magic bytes (%PDF-).",
            )

        # 3. Content hash calculation (SHA-256)
        content_hash = hashlib.sha256(content).hexdigest()
        return content_hash, size

    async def upload_and_process_document(
        self,
        file_bytes: bytes,
        original_filename: str,
        patient_id: str,
        user: Dict[str, Any],
        request_id: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Processes document upload with:
          - Scope check for patient
          - Magic bytes & size cap validation
          - Rate limiting
          - Idempotency check via SHA-256 content hash
          - Randomized disk storage name
          - Offset-preserving text extraction
          - LLM extraction with mandatory grounding check
          - Saved strictly as pending_review
        """
        # 1. Scope check: verify caller has authority to upload/view patient
        await patient_service.check_patient_access(
            user=user,
            patient_id=patient_id,
            resource_path="/documents/upload",
            client_ip=client_ip,
        )

        # 2. Rate limiting check
        rate_id = user.get("user_id") or client_ip or "anonymous"
        self.check_rate_limit(rate_id)

        # 3. Validate magic bytes and size cap
        content_hash, size_bytes = self.validate_pdf_content(file_bytes)

        # 4. IDEMPOTENCY CHECK: content hash + patient_id
        existing_doc = await document_repository.get_by_content_hash(
            content_hash=content_hash, patient_id=patient_id
        )
        if existing_doc:
            logger.info(
                "Idempotent re-upload detected for patient %s with content hash %s. Returning existing extraction.",
                patient_id,
                content_hash,
            )
            return {
                "document_id": existing_doc["document_id"],
                "patient_id": patient_id,
                "status": existing_doc.get("status", "pending_review"),
                "content_hash": content_hash,
                "fields": existing_doc.get("fields", []),
                "page_count": existing_doc.get("page_count", 1),
                "is_idempotent_replay": True,
                "message": "Document already uploaded and extracted. Returned existing pending_review record.",
            }

        # 5. Randomized Storage Filename
        doc_uuid = str(uuid.uuid4())
        safe_filename = f"{doc_uuid}.pdf"
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        stored_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

        with open(stored_path, "wb") as f:
            f.write(file_bytes)

        # 6. Extract text with page and character offsets
        pdf_extraction = pdf_service.extract_text_with_offsets(file_bytes)

        # 7. Call extraction service (with grounding check and repair loop)
        extraction_result: ExtractionDocumentResult = await extraction_service.extract_and_verify(
            document_id=doc_uuid,
            patient_id=patient_id,
            pdf_extraction=pdf_extraction,
            content_hash=content_hash,
        )

        # 8. Store extraction in untrusted_documents collection (pending_review)
        fields_dict = [f.model_dump() for f in extraction_result.fields]
        await document_repository.record_document_extraction(
            document_id=doc_uuid,
            patient_id=patient_id,
            filename=original_filename,
            stored_path=stored_path,
            content_hash=content_hash,
            size_bytes=size_bytes,
            extracted_text=pdf_extraction.full_text,
            page_count=pdf_extraction.total_pages,
            fields=fields_dict,
            provider_name=extraction_result.provider_name,
            repair_attempts=extraction_result.repair_attempts,
            extraction_status="pending_review",  # INVARIANT: strictly pending_review
            uploader_user_id=user.get("user_id"),
            request_id=request_id,
        )

        return {
            "document_id": doc_uuid,
            "patient_id": patient_id,
            "status": "pending_review",
            "content_hash": content_hash,
            "fields": fields_dict,
            "page_count": pdf_extraction.total_pages,
            "is_idempotent_replay": False,
            "provider_name": extraction_result.provider_name,
            "repair_attempts": extraction_result.repair_attempts,
            "message": "Document uploaded and extracted successfully. Stored in untrusted collection as pending_review.",
        }


document_service = DocumentService()
