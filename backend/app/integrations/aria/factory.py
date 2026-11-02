import logging
from typing import Optional
from backend.app.core.config import settings
from backend.app.integrations.aria.base import AriaProvider
from backend.app.integrations.aria.http_provider import HttpAriaProvider
from backend.app.integrations.aria.mock_provider import MockAriaProvider

logger = logging.getLogger("vericare.aria.factory")

_active_aria_provider: Optional[AriaProvider] = None


def get_aria_provider() -> AriaProvider:
    """
    Factory function returning the active AriaProvider singleton based on ARIA_MODE setting.
    Defaults to MockAriaProvider.
    """
    global _active_aria_provider
    if _active_aria_provider is None:
        if settings.ARIA_MODE == "http":
            logger.info("Initializing HttpAriaProvider (url=%s)", settings.ARIA_BASE_URL)
            _active_aria_provider = HttpAriaProvider()
        else:
            logger.info("Initializing MockAriaProvider (synthetic placeholder mode)")
            _active_aria_provider = MockAriaProvider()
    return _active_aria_provider


def set_aria_provider(provider: AriaProvider) -> None:
    """Testing override for injecting mock or customized providers."""
    global _active_aria_provider
    _active_aria_provider = provider
