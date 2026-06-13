import httpx
import time
import json
import base64
from typing import Optional
from .ports import ITokenProvider
from .errors import UapClientError, UapAuthError


class ClientCredentialsTokenProvider(ITokenProvider):
    def __init__(
        self,
        token_url: str,
        client_id: str,
        client_secret: str
    ):
        self.token_url = token_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.cached_token: Optional[str] = None
        self.expiry: Optional[int] = None

    async def get_token(self, scope: list[str]) -> str:
        now = int(time.time())
        
        if self.cached_token and self.expiry and now < self.expiry - 60:
            return self.cached_token

        return await self._fetch_token(scope)

    def clear_cache(self) -> None:
        self.cached_token = None
        self.expiry = None

    async def _fetch_token(self, scope: list[str], is_retry: bool = False) -> str:
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": " ".join(scope),
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    self.token_url,
                    data=data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
            except httpx.TimeoutException:
                raise UapAuthError("Token endpoint timed out after 10s")
            except Exception as err:
                raise UapClientError(f"Failed to fetch token: {err}", 500)

            if response.status_code == 401:
                if not is_retry:
                    self.clear_cache()
                    return await self._fetch_token(scope, True)
                raise UapAuthError("Token endpoint returned 401")

            if response.is_error:
                raise UapClientError(response.text, response.status_code)

            res_data = response.json()
            token = res_data["access_token"]
            
            try:
                # Basic JWT decoding for expiry
                parts = token.split(".")
                if len(parts) > 1:
                    payload_b64 = parts[1]
                    # Add padding if needed
                    payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
                    payload = json.loads(base64.b64decode(payload_b64).decode("utf-8"))
                    self.expiry = payload.get("exp")
                    self.cached_token = token
            except Exception:
                # If parsing fails, don't cache
                pass

            return token
