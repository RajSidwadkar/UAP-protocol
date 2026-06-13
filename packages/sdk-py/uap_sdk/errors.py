class UapError(Exception):
    def __init__(self, message: str, status_code: int, code: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code

class UapClientError(UapError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, status_code, 'UAP_CLIENT_ERROR')

class UapAuthError(UapError):
    def __init__(self, message: str):
        super().__init__(message, 401, 'UAP_AUTH_ERROR')

class UapForbiddenError(UapError):
    def __init__(self, message: str):
        super().__init__(message, 403, 'UAP_FORBIDDEN_ERROR')

class UapValidationError(UapError):
    def __init__(self, message: str):
        super().__init__(message, 422, 'UAP_VALIDATION_ERROR')
