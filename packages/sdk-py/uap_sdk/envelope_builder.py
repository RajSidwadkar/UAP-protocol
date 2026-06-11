import secrets
from typing import Any
from ulid import ULID


class UapEnvelopeBuilder:
    @staticmethod
    def _generate_traceparent() -> str:
        """Generates a valid W3C traceparent."""
        trace_id = secrets.token_hex(16)
        span_id = secrets.token_hex(8)
        return f"00-{trace_id}-{span_id}-01"

    @staticmethod
    def tool_call(tool_id: str, input_: dict[str, Any], token: str, scope: list[str]) -> dict[str, Any]:
        """Builds a UAP tool_call envelope."""
        return {
            "uap": {
                "version": "1.0",
                "type": "tool_call",
                "id": str(ULID()),
                "trace": {
                    "traceparent": UapEnvelopeBuilder._generate_traceparent(),
                },
                "auth": {
                    "token": token,
                    "scope": scope,
                },
            },
            "method": "tools/invoke",
            "schema_ref": "uap:tool.invoke/v1",
            "params": input_,
            "ack": True,
        }

    @staticmethod
    def agent_delegate(agent_id: str, input_: dict[str, Any], token: str, scope: list[str]) -> dict[str, Any]:
        """Builds a UAP agent_delegate envelope."""
        return {
            "uap": {
                "version": "1.0",
                "type": "agent_delegate",
                "id": str(ULID()),
                "trace": {
                    "traceparent": UapEnvelopeBuilder._generate_traceparent(),
                },
                "auth": {
                    "token": token,
                    "scope": scope,
                },
            },
            "method": f"{agent_id}/task.submit",
            "schema_ref": "uap:agent.delegate/v1",
            "params": input_,
            "ack": True,
        }
