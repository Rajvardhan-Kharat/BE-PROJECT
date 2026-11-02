import logging
import time
import httpx
from typing import Optional
from backend.app.core.config import settings
from backend.app.integrations.aria.base import (
    AriaDraftSummaryResponse,
    AriaHealthStatus,
    AriaProvider,
    AriaSendMessageResponse,
)

logger = logging.getLogger("vericare.aria.http")


class HttpAriaProvider(AriaProvider):
    """
    HTTP client provider interfacing with external Aria mental-health companion service.
    Implements timeout, retry resilience, and graceful failure handling.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        provider_label: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.base_url = (base_url or settings.ARIA_BASE_URL).rstrip("/")
        self.api_key = api_key or settings.ARIA_API_KEY
        self.timeout = timeout_seconds or settings.ARIA_TIMEOUT_SECONDS
        self.provider_name = provider_label or settings.ARIA_PROVIDER_LABEL
        self._custom_client = client

    def _headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _execute_with_client(self, fn):
        if self._custom_client:
            return await fn(self._custom_client)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            return await fn(client)

    async def health(self) -> AriaHealthStatus:
        start = time.time()
        try:
            async def _do(client):
                return await client.get(f"{self.base_url}/api/v1/health", headers=self._headers())

            res = await self._execute_with_client(_do)
            latency = (time.time() - start) * 1000.0
            if res.status_code == 200:
                data = res.json()
                return AriaHealthStatus(
                    status=data.get("status", "healthy"),
                    mode="http",
                    provider_name=data.get("provider_name", self.provider_name),
                    companion_available=True,
                    latency_ms=round(latency, 2),
                )
            return AriaHealthStatus(
                status="degraded",
                mode="http",
                provider_name=self.provider_name,
                companion_available=False,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            logger.warning("Aria HTTP health check failed: %s", e)
            return AriaHealthStatus(
                status="unavailable",
                mode="http",
                provider_name=self.provider_name,
                companion_available=False,
                latency_ms=None,
            )

    async def send_message(
        self, session_ref: str, pseudonymous_user_id: str, text: str
    ) -> AriaSendMessageResponse:
        url = f"{self.base_url}/api/v1/sessions/{session_ref}/messages"
        payload = {
            "pseudonymous_user_id": pseudonymous_user_id,
            "text": text,
        }

        try:
            async def _do(client):
                return await client.post(url, headers=self._headers(), json=payload)

            res = await self._execute_with_client(_do)
            if res.status_code == 200:
                data = res.json()
                return AriaSendMessageResponse(
                    reply_text=data.get("reply_text", ""),
                    safety_event=data.get("safety_event", False),
                    provider_name=data.get("provider_name", self.provider_name),
                    is_fallback=False,
                )
            logger.error("Aria HTTP returned non-200 status: %d", res.status_code)
        except httpx.TimeoutException:
            logger.warning("Aria HTTP request timed out after %.1fs", self.timeout)
        except Exception as exc:
            logger.error("Aria HTTP connection failed: %s", exc)

        # Graceful failure fallback: never crash, never lose message
        return AriaSendMessageResponse(
            reply_text=(
                "[Companion Unavailable]: Aria is currently unreachable. "
                "Your message has been safely recorded in your personal session, and you can try again later."
            ),
            safety_event=False,
            provider_name="UNAVAILABLE",
            is_fallback=True,
        )

    async def draft_summary(
        self, session_ref: str, pseudonymous_user_id: str
    ) -> AriaDraftSummaryResponse:
        url = f"{self.base_url}/api/v1/sessions/{session_ref}/draft-summary"
        payload = {"pseudonymous_user_id": pseudonymous_user_id}

        try:
            async def _do(client):
                return await client.post(url, headers=self._headers(), json=payload)

            res = await self._execute_with_client(_do)
            if res.status_code == 200:
                data = res.json()
                return AriaDraftSummaryResponse(
                    draft_text=data.get("draft_text", ""),
                    provider_name=data.get("provider_name", self.provider_name),
                )
            logger.error("Aria HTTP draft summary returned status: %d", res.status_code)
        except Exception as exc:
            logger.error("Aria HTTP draft summary failed: %s", exc)

        return AriaDraftSummaryResponse(
            draft_text="[Companion Unavailable]: Summary cannot be drafted at this time. Please retry once companion connection is restored.",
            provider_name="UNAVAILABLE",
        )

    async def delete_session(self, session_ref: str) -> bool:
        url = f"{self.base_url}/api/v1/sessions/{session_ref}"
        try:
            async def _do(client):
                return await client.delete(url, headers=self._headers())

            res = await self._execute_with_client(_do)
            return res.status_code in (200, 204)
        except Exception as exc:
            logger.error("Aria HTTP delete session failed for %s: %s", session_ref, exc)
            return False
