from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ITokenProvider(Protocol):
    async def get_token(self, scope: list[str]) -> str:
        """Returns a Bearer token string."""
        ...

    def clear_cache(self) -> None:
        """Clears any cached tokens."""
        ...


@runtime_checkable
class ITracePort(Protocol):
    async def trace(self, name: str, attributes: dict[str, Any], fn: Any) -> Any:
        """Wraps a function call in a trace span."""
        ...
