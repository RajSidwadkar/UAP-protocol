import pytest
import respx
import httpx
from uap_sdk import (
    UapError,
    UapClientError,
    UapAuthError,
    UapForbiddenError,
    UapValidationError,
    ClientCredentialsTokenProvider
)

def test_error_hierarchy():
    # 1. UapClientError is instance of UapError
    err = UapClientError("client error")
    assert isinstance(err, UapError)
    assert err.code == 'UAP_CLIENT_ERROR'
    assert err.status_code == 500

def test_auth_error_status():
    # 2. UapAuthError.status_code == 401
    err = UapAuthError("auth error")
    assert err.status_code == 401
    assert err.code == 'UAP_AUTH_ERROR'

def test_forbidden_error_status():
    # 3. UapForbiddenError.status_code == 403
    err = UapForbiddenError("forbidden")
    assert err.status_code == 403
    assert err.code == 'UAP_FORBIDDEN_ERROR'

def test_validation_error_status():
    # 4. UapValidationError.status_code == 422
    err = UapValidationError("invalid")
    assert err.status_code == 422
    assert err.code == 'UAP_VALIDATION_ERROR'

@pytest.mark.asyncio
@respx.mock
async def test_token_provider_http_failure():
    # 5. token_provider raises UapClientError (not bare Exception) on HTTP failure
    token_url = "http://auth.local/token"
    respx.post(token_url).mock(return_value=httpx.Response(500, text="Internal Server Error"))
    
    provider = ClientCredentialsTokenProvider(token_url, "id", "secret")
    
    with pytest.raises(UapClientError) as excinfo:
        await provider.get_token(["scope"])
    
    assert excinfo.value.status_code == 500
    assert "Internal Server Error" in str(excinfo.value)

@pytest.mark.asyncio
@respx.mock
async def test_token_provider_auth_failure():
    # 6. token_provider raises UapAuthError on 401 response from token endpoint
    token_url = "http://auth.local/token"
    # Mocking to fail with 401
    respx.post(token_url).mock(return_value=httpx.Response(401, text="Unauthorized"))
    
    provider = ClientCredentialsTokenProvider(token_url, "id", "secret")
    
    with pytest.raises(UapAuthError) as excinfo:
        await provider.get_token(["scope"])
    
    assert excinfo.value.status_code == 401
    assert "Token endpoint returned 401" in str(excinfo.value)

@pytest.mark.asyncio
@respx.mock
async def test_token_provider_connection_failure():
    # Extra verification: connection failure handled
    token_url = "http://auth.local/token"
    respx.post(token_url).side_effect = httpx.ConnectError("Connection failed")
    
    provider = ClientCredentialsTokenProvider(token_url, "id", "secret")
    
    with pytest.raises(UapClientError) as excinfo:
        await provider.get_token(["scope"])
    
    assert excinfo.value.status_code == 500
    assert "Failed to fetch token" in str(excinfo.value)
