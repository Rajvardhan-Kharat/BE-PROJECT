from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FieldTypeCorrectionMetric(BaseModel):
    field_type: str
    total_reviewed: int
    corrections_count: int
    correction_rate: float = Field(..., description="Percentage of fields requiring human correction")
    common_reasons: List[str] = Field(default_factory=list)


class TopReasonMetric(BaseModel):
    reason: str
    count: int
    field_type: Optional[str] = None


class CorrectionDashboardMetricsResponse(BaseModel):
    total_documents_reviewed: int
    total_fields_reviewed: int
    total_corrections: int
    overall_correction_rate: float = Field(..., description="Overall human correction percentage")
    accepted_unchanged_share: float = Field(..., description="Share of fields accepted without alteration")
    avg_review_time_seconds: float = Field(..., description="Average reviewer inspection time in seconds")
    by_field_type: List[FieldTypeCorrectionMetric]
    top_reasons: List[TopReasonMetric]
    # Mandatory benchmark notice
    synthetic_benchmark_notice: str = "measured on synthetic data"
    last_calculated_at: str
