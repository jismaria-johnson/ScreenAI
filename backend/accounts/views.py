from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .serializers import (
    HRTokenObtainPairSerializer,
    CustomTokenRefreshSerializer,
    ChangePasswordSerializer,
    ProfileSerializer,
    RegisterSerializer,
)
from accounts.utils import log_audit


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    @transaction.atomic
    def perform_create(self, serializer):
        user = serializer.save()
        log_audit(
            action="recruiter_created",
            actor=self.request.user,
            target_type="User",
            target_id=user.id,
            target_label=user.username,
            metadata={
                "username": user.username,
                "email": user.email,
                "role": "hr"
            },
            request=self.request
        )


class HRTokenObtainPairView(
    TokenObtainPairView
):
    serializer_class = (
        HRTokenObtainPairSerializer
    )


class CustomTokenRefreshView(TokenRefreshView):
    serializer_class = CustomTokenRefreshSerializer


class SecurityStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from accounts.models import UserSecurityState
        security_state, _ = UserSecurityState.objects.get_or_create(user=request.user)
        return Response({"must_change_password": security_state.must_change_password})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            new_password = serializer.validated_data["new_password"]
            user = request.user

            user.set_password(new_password)
            user.save()

            from accounts.models import UserSecurityState
            security_state, _ = UserSecurityState.objects.select_for_update().get_or_create(user=user)
            security_state.must_change_password = False
            security_state.password_changed_at = timezone.now()
            security_state.token_version = F("token_version") + 1
            security_state.save()
            security_state.refresh_from_db()

            log_audit(
                action="recruiter_forced_password_changed",
                actor=user,
                target_type="User",
                target_id=user.id,
                target_label=user.username,
                metadata={
                    "username": user.username,
                    "role": "hr" if getattr(user, "profile", None) and user.profile.role == "hr" else "admin"
                },
                request=request
            )

            return Response({"detail": "Password changed successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProfileView(
    generics.RetrieveUpdateAPIView
):
    serializer_class = ProfileSerializer
    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def get_object(self):
        return self.request.user.profile