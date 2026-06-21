from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.settings import api_settings
from django.contrib.auth.models import User
from accounts.exceptions import (
    PasswordChangeRequiredException,
    SessionRevokedException,
    InactiveAccountException
)
from accounts.models import UserSecurityState

class CustomJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None

        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None

        # Performs the standard cryptographic, expiry, and signature checks
        validated_token = self.get_validated_token(raw_token)

        # Retain the request context for get_user route-checking
        self.request = request

        user = self.get_user(validated_token)
        return user, validated_token

    def get_user(self, validated_token):
        user_id_claim = api_settings.USER_ID_CLAIM
        user_id = validated_token.get(user_id_claim)
        if not user_id:
            raise SessionRevokedException()

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise SessionRevokedException()

        # Explicitly check user status
        if not user.is_active:
            raise InactiveAccountException()

        # Defensively get security state
        security_state, _ = UserSecurityState.objects.get_or_create(user=user)

        # Validate token version
        token_version = validated_token.get("token_version")
        if token_version is None or token_version != security_state.token_version:
            raise SessionRevokedException()

        # Enforce must change password restrictions
        if security_state.must_change_password:
            request = getattr(self, "request", None)
            url_name = request.resolver_match.url_name if request and request.resolver_match else None
            # Allow only password-change and security-status endpoints
            if url_name not in ["change_password", "security_status"]:
                raise PasswordChangeRequiredException()

        return user
