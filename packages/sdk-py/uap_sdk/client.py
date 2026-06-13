import httpx
from dataclasses import dataclass
from typing import Any, Optional, Self, Type, Callable
from types import TracebackType

from .ports import ITokenProvider, ITracePort
from .envelope_builder import UapEnvelopeBuilder
from .errors import UapClientError


@dataclass
class UapClientOptions:
    gateway_url: str
    token_provider: ITokenProvider
    card_sig: str
    tracer: Optional[ITracePort] = None


class UapClient:
    def __init__(self, options: UapClientOptions):
        self.options = options
        self._client = httpx.AsyncClient(
            base_url=options.gateway_url,
            timeout=30.0,
            headers={"Content-Type": "application/json"}
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self._client.aclose()

    async def invoke_tool(self, tool_id: str, input_: dict[str, Any], scope: list[str]) -> dict[str, Any]:
        """Invokes a tool via the UAP gateway."""
        async def _request():
            return await self._request_with_retry(
                "/tools/invoke",
                lambda t: UapEnvelopeBuilder.tool_call(tool_id, input_, t, scope, self.options.card_sig),
                scope
            )

        if self.options.tracer:
            return await self.options.tracer.trace("uap:invoke_tool", {"toolId": tool_id}, _request)
        return await _request()

    async def delegate_task(self, agent_id: str, input_: dict[str, Any], scope: list[str]) -> dict[str, Any]:
        """Delegates a task to an agent via the UAP gateway."""
        async def _request():
            return await self._request_with_retry(
                "/agents/delegate",
                lambda t: UapEnvelopeBuilder.agent_delegate(agent_id, input_, t, scope, self.options.card_sig),
                scope
            )

        if self.options.tracer:
            return await self.options.tracer.trace("uap:delegate_task", {"agentId": agent_id}, _request)
        return await _request()

    async def _request_with_retry(
        self,
        path: str,
        envelope_factory: Callable[[str], dict[str, Any]],
        scope: list[str],
        is_retry: bool = False
    ) -> dict[str, Any]:
        token = await self.options.token_provider.get_token(scope)
        envelope = envelope_factory(token)

        response = await self._client.post(
            path,
            json=envelope,
            headers={"Authorization": f"Bearer {token}"}
        )

        if response.status_code == 401 and not is_retry:
            self.options.token_provider.clear_cache()
            return await self._request_with_retry(path, envelope_factory, scope, True)

        if response.is_error:
            raise UapClientError(response.text, response.status_code)

        return response.json()
