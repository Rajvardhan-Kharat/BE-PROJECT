from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from backend.app.permissions.rbac import get_current_user
from backend.app.repositories.agent_log_repository import agent_log_repository
from backend.app.schemas.agent_log import AgentRunLog

router = APIRouter()


@router.get("/agent-runs", response_model=List[AgentRunLog])
async def list_agent_runs(
    request: Request,
    agent_name: Optional[str] = Query(None, description="Filter by agent name"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (started, success, failed)"),
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns immutable execution logs for agent runs, recording request ID, tools called, input refs, and status.
    """
    role = current_user.get("role", "")
    if role not in ["doctor", "senior_doctor", "system_admin", "hospital_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent execution logs restricted to clinical verifiers and administrators.",
        )

    runs = await agent_log_repository.list_runs(
        agent_name=agent_name,
        status=status_filter,
        patient_id=patient_id,
        skip=skip,
        limit=limit,
    )
    return [AgentRunLog(**r) for r in runs]


@router.get("/agent-runs/{run_id}", response_model=AgentRunLog)
async def get_agent_run(
    run_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns full tool call trace and execution log for a specific agent run.
    """
    role = current_user.get("role", "")
    if role not in ["doctor", "senior_doctor", "system_admin", "hospital_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent execution logs restricted to clinical verifiers and administrators.",
        )

    run = await agent_log_repository.get_by_run_id(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent run {run_id} not found.")
    return AgentRunLog(**run)
