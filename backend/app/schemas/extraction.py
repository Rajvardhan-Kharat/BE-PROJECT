from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

FieldStatus = Literal["explicit", "inferred", "uncertain", "missing", "conflicting"]


class SourceSpan(BaseModel):
    doc: str = Field(..., description="Document identifier or filename")
    page: int = Field(..., ge=1, description="1-indexed page number in the document")
    start: int = Field(..., ge=0, description="Character start offset on the page")
    end: int = Field(..., ge=0, description="Character end offset on the page")
    quote: str = Field(..., description="Exact character substring excerpted from document")


class ExtractedField(BaseModel):
    field_name: str = Field(..., description="Name of the clinical field, e.g. medication, diagnosis")
    value: Any = Field(..., description="Extracted clinical value")
    confidence_note: str = Field(..., description="Explanation of confidence and extraction reasoning")
    status: FieldStatus = Field(..., description="Extraction confidence status")
    source_span: Optional[SourceSpan] = Field(None, description="Verifiable document source span")
    grounding_verified: bool = Field(False, description="True if quote was verified at the exact character offsets")


class ExtractionDocumentResult(BaseModel):
    document_id: str
    patient_id: str
    status: str = "pending_review"  # INVARIANT: AI extraction is strictly pending_review
    fields: List[ExtractedField] = []
    page_count: int = 0
    extracted_text_length: int = 0
    content_hash: str
    repair_attempts: int = 0
    provider_name: str
    created_at: str
    metadata: Dict[str, Any] = {}
