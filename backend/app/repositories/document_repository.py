from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from backend.app.repositories.base import BaseRepository


class DocumentRepository(BaseRepository):
    """
    Repository for uploaded clinical documents and AI proposal extractions.
    INVARIANT: Stored in the untrusted_documents collection. AI code has NO write
    path to approved clinical collections. Status is strictly 'pending_review'.
    """
    collection_name = "untrusted_documents"

    async def get_by_document_id(self, document_id: str) -> Optional[Dict[str, Any]]:
        return await self.find_one({"document_id": document_id})

    async def get_by_content_hash(
        self, content_hash: str, patient_id: str
    ) -> Optional[Dict[str, Any]]:
        return await self.find_one({
            "content_hash": content_hash,
            "patient_id": patient_id,
        })

    async def get_patient_documents(
        self, patient_id: str, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        return await self.find_many(
            query={"patient_id": patient_id},
            skip=skip,
            limit=limit,
            sort=[("uploaded_at", -1)],
        )

    async def record_document_extraction(
        self,
        document_id: str,
        patient_id: str,
        filename: str,
        stored_path: str,
        content_hash: str,
        size_bytes: int,
        extracted_text: str,
        page_count: int,
        fields: List[Dict[str, Any]],
        provider_name: str,
        repair_attempts: int = 0,
        extraction_status: str = "pending_review",
        uploader_user_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates an immutable untrusted extraction record with status 'pending_review'.
        """
        doc = {
            "document_id": document_id,
            "patient_id": patient_id,
            "original_filename": filename,
            "stored_path": stored_path,
            "content_hash": content_hash,
            "size_bytes": size_bytes,
            "extracted_text_snippet": extracted_text[:2000],
            "page_count": page_count,
            "status": extraction_status,  # STRICTLY pending_review
            "fields": fields,
            "provider_name": provider_name,
            "repair_attempts": repair_attempts,
            "uploader_user_id": uploader_user_id,
            "request_id": request_id,
            "uploaded_at": datetime.now(timezone.utc),
        }
        return await self.create(doc)


document_repository = DocumentRepository()
