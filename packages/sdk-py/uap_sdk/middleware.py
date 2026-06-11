import functools
from typing import Any, Callable, List
from fastapi import Request, HTTPException


def uap_auth(scope: List[str]):
    """
    FastAPI decorator factory for UAP authentication.
    Requires `request.app.state.uap_auth` to be an object with `verify_token` method.
    """
    def decorator(func: Callable[..., Any]):
        @functools.wraps(func)
        async def wrapper(request: Request, *args: Any, **kwargs: Any):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Missing Authorization header")
            
            token = auth_header.removeprefix("Bearer ")
            if not token:
                raise HTTPException(status_code=401, detail="Invalid Authorization header")

            try:
                # verify_token(token, scope)
                claims = await request.app.state.uap_auth.verify_token(token, scope)
                request.state.uap_claims = claims
            except Exception as err:
                raise HTTPException(status_code=401, detail=str(err))

            return await func(request, *args, **kwargs)
        return wrapper
    return decorator
