from fastapi import APIRouter, Depends
from backend.app.permissions.rbac import get_current_user
from backend.app.schemas.corrections_metrics import CorrectionDashboardMetricsResponse
from backend.app.services.corrections_metrics_service import corrections_metrics_service

router = APIRouter()


@router.get("/metrics/corrections", response_model=CorrectionDashboardMetricsResponse)
async def get_correction_metrics(
    current_user: dict = Depends(get_current_user),
) -> CorrectionDashboardMetricsResponse:
    """
    Returns aggregate human correction metrics from clinical verification reviews.
    Includes overall correction rate, accepted-unchanged share, field type breakdown,
    and average review time.
    MANDATORY LABEL: "measured on synthetic data".
    """
    return await corrections_metrics_service.get_correction_metrics()
