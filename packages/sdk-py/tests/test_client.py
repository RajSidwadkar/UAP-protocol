import httpx
import pytest
import respx
import json
from unittest.mock import AsyncMock, MagicMock
from uap_sdk import UapClient, UapClientOptions, ITokenProvider, UapClientError


@pytest.fixture
def mock_token_provider():
    provider = MagicMock(spec=ITokenProvider)
    provider.get_token = AsyncMock(return_value="valid-token")
    provider.clear_cache = MagicMock()
    return provider


@pytest.fixture
def client_options(mock_token_provider):
    return UapClientOptions(
        gateway_url="http://gateway.local",
        token_provider=mock_token_provider,
        card_sig="ed25519:test-sig",
    )


@pytest.mark.asyncio
@respx.mock
async def test_invoke_tool_success(client_options, mock_token_provider):
    # Mock the gateway response
    route = respx.post("http://gateway.local/tools/invoke").mock(
        return_value=httpx.Response(200, json={"result": "ok"})
    )

    async with UapClient(client_options) as client:
        result = await client.invoke_tool("test-tool", {"arg1": "val1"}, ["tool:read"])

    assert result == {"result": "ok"}
    assert route.called
    
    # Check request body
    request_body = json.loads(route.calls.last.request.content)
    assert request_body["uap"]["type"] == "tool_call"
    assert request_body["uap"]["auth"]["card_sig"] == "ed25519:test-sig"
    assert "traceparent" in request_body["uap"]["trace"]
    assert request_body["method"] == "tools/invoke"
    assert request_body["params"] == {"tool_id": "test-tool", "input": {"arg1": "val1"}}
    
    # Check auth header
    assert route.calls.last.request.headers["Authorization"] == "Bearer valid-token"


@pytest.mark.asyncio
@respx.mock
async def test_invoke_tool_401_retry(client_options, mock_token_provider):
    # First call returns 401, second succeeds
    route = respx.post("http://gateway.local/tools/invoke")
    route.side_effect = [
        httpx.Response(401, text="Unauthorized"),
        httpx.Response(200, json={"result": "ok"}),
    ]

    async with UapClient(client_options) as client:
        await client.invoke_tool("test-tool", {}, [])

    assert route.call_count == 2
    assert mock_token_provider.clear_cache.called
    assert mock_token_provider.get_token.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_invoke_tool_401_failure(client_options, mock_token_provider):
    # Both calls return 401
    route = respx.post("http://gateway.local/tools/invoke").mock(
        return_value=httpx.Response(401, text="Unauthorized")
    )

    async with UapClient(client_options) as client:
        with pytest.raises(UapClientError) as excinfo:
            await client.invoke_tool("test-tool", {}, [])
        
        assert excinfo.value.status_code == 401

    assert route.call_count == 2 # Initial + 1 retry


@pytest.mark.asyncio
@respx.mock
async def test_invoke_tool_500_no_retry(client_options, mock_token_provider):
    route = respx.post("http://gateway.local/tools/invoke").mock(
        return_value=httpx.Response(500, text="Server Error")
    )

    async with UapClient(client_options) as client:
        with pytest.raises(UapClientError) as excinfo:
            await client.invoke_tool("test-tool", {}, [])
        
        assert excinfo.value.status_code == 500

    assert route.call_count == 1


@pytest.mark.asyncio
async def test_client_context_manager_closes_httpx_client(client_options):
    async with UapClient(client_options) as client:
        # Mock aclose to spy on it
        client._client.aclose = AsyncMock()
        spy_aclose = client._client.aclose

    assert spy_aclose.called
