from rest_framework.exceptions import APIException
from rest_framework import status

class PasswordChangeRequiredException(APIException):
    status_code = status.HTTP_403_FORBIDDEN
    def __init__(self):
        super().__init__(detail={
            "code": "password_change_required",
            "detail": "You must change your temporary password."
        })

class SessionRevokedException(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    def __init__(self):
        super().__init__(detail={
            "code": "session_revoked",
            "detail": "This session is no longer valid."
        })

class InactiveAccountException(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    def __init__(self):
        super().__init__(detail={
            "code": "inactive_account",
            "detail": "This account is suspended."
        })
