from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel, Field


class AriaHealthStatus(BaseModel):
    status: str = Field(..., description="Service status: 'healthy', 'degraded', or 'unavailable'")
    mode: str = Field(..., description="Active adapter mode: 'mock' or 'http'")
    provider_name: str = Field(..., description="Provider descriptor (e.g. 'MOCK' or real provider label)")
    companion_available: bool = Field(default=True, description="Whether companion provider is currently reachable")
    latency_ms: Optional[float] = Field(None, description="Round-trip latency in milliseconds")


class AriaSendMessageRequest(BaseModel):
    session_ref: str = Field(..., description="Opaque session identifier")
    pseudonymous_user_id: str = Field(..., description="Server-derived pseudonymous patient hash")
    text: str = Field(..., description="User message content")


class AriaSendMessageResponse(BaseModel):
    reply_text: str = Field(..., description="Companion message response")
    safety_event: bool = Field(default=False, description="Whether safety intervention occurred")
    provider_name: str = Field(..., description="Label of provider (e.g. 'MOCK')")
    is_fallback: bool = Field(default=False, description="True if response is a fallback due to outage")


class AriaDraftSummaryRequest(BaseModel):
    session_ref: str = Field(..., description="Opaque session identifier")
    pseudonymous_user_id: str = Field(..., description="Server-derived pseudonymous patient hash")


class AriaDraftSummaryResponse(BaseModel):
    draft_text: str = Field(..., description="Patient-editable draft summary")
    provider_name: str = Field(...)


class AriaProvider(ABC):
    """
    Contract interface for Aria mental-health companion integrations.
    Implemented by MockAriaProvider (placeholder) and HttpAriaProvider (external API).
    """

    provider_name: str

    @abstractmethod
    async def health(self) -> AriaHealthStatus:
        """Returns health status, active mode, and latency."""
        pass

    @abstractmethod
    async def send_message(
        self, session_ref: str, pseudonymous_user_id: str, text: str
    ) -> AriaSendMessageResponse:
        """Sends a message and returns the companion reply."""
        pass

    @abstractmethod
    async def draft_summary(
        self, session_ref: str, pseudonymous_user_id: str
    ) -> AriaDraftSummaryResponse:
        """Drafts a high-level summary of the session for patient review."""
        pass

    @abstractmethod
    async def delete_session(self, session_ref: str) -> bool:
        """Notifies Aria to purge conversational state for the given session."""
        pass
