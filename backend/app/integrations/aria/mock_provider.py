import logging
from typing import Dict, List
from backend.app.integrations.aria.base import (
    AriaDraftSummaryResponse,
    AriaHealthStatus,
    AriaProvider,
    AriaSendMessageResponse,
)

logger = logging.getLogger("vericare.aria.mock")


class MockAriaProvider(AriaProvider):
    """
    EXPLICITLY LABELED PLACEHOLDER MOCK PROVIDER (ACADEMIC SYNTHETIC DEMONSTRATION).
    Uses deterministic, fixed gentle canned replies and template draft summaries.
    Executes NO machine learning, NO clinical classification, and NO pretend intelligence.
    Every response is flagged with provider_name="MOCK".
    """

    provider_name = "MOCK"

    def __init__(self):
        self.force_unavailable: bool = False
        self._reply_index = 0
        self._canned_replies: List[str] = [
            "Thank you for sharing that with me. I'm here to listen. How has that been feeling for you today?",
            "It sounds like there has been quite a bit on your mind. Would it be helpful to focus on one small step at a time?",
            "I hear you. Taking a moment to acknowledge how much energy that takes can sometimes help. What usually brings you a bit of calm?",
            "Thank you for being open about this. Please remember you can take things at your own pace.",
            "I'm keeping this space open for you. Whenever you're ready, feel free to say more, or we can simply pause here.",
        ]
        self._sessions_deleted: List[str] = []

    async def health(self) -> AriaHealthStatus:
        if self.force_unavailable:
            return AriaHealthStatus(
                status="unavailable",
                mode="mock",
                provider_name=self.provider_name,
                companion_available=False,
                latency_ms=0.0,
            )
        return AriaHealthStatus(
            status="healthy",
            mode="mock",
            provider_name=self.provider_name,
            companion_available=True,
            latency_ms=1.5,
        )

    async def send_message(
        self, session_ref: str, pseudonymous_user_id: str, text: str
    ) -> AriaSendMessageResponse:
        if self.force_unavailable:
            logger.warning("MockAriaProvider is forced unavailable.")
            return AriaSendMessageResponse(
                reply_text=(
                    "[Companion Unavailable]: Aria is currently unreachable. "
                    "Your message has been safely saved in your personal session, and you can try again later."
                ),
                safety_event=False,
                provider_name=self.provider_name,
                is_fallback=True,
            )

        reply = self._canned_replies[self._reply_index % len(self._canned_replies)]
        self._reply_index += 1

        return AriaSendMessageResponse(
            reply_text=reply,
            safety_event=False,
            provider_name=self.provider_name,
            is_fallback=False,
        )

    async def draft_summary(
        self, session_ref: str, pseudonymous_user_id: str
    ) -> AriaDraftSummaryResponse:
        if self.force_unavailable:
            return AriaDraftSummaryResponse(
                draft_text="[Companion Unavailable]: Summary drafting is currently offline. Please try again later.",
                provider_name=self.provider_name,
            )

        # Deterministic, non-interpretive template summary
        draft = (
            "Session Reflections Summary (Draft):\n"
            "- Discussion centered on current daily stressors, routine pacing, and self-care boundaries.\n"
            "- Identified personal relaxation techniques and restful intervals as helpful supports.\n"
            "- Open communication maintained in a calm, non-judgmental space."
        )
        return AriaDraftSummaryResponse(
            draft_text=draft,
            provider_name=self.provider_name,
        )

    async def delete_session(self, session_ref: str) -> bool:
        self._sessions_deleted.append(session_ref)
        logger.info("MockAriaProvider deleted session ref %s", session_ref)
        return True
