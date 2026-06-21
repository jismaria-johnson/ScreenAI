from django.urls import path

from .views import (
    HRTokenObtainPairView,
    CustomTokenRefreshView,
    SecurityStatusView,
    ChangePasswordView,
    ProfileView,
    RegisterView,
)


urlpatterns = [
    path(
        "register/",
        RegisterView.as_view(),
        name="register",
    ),
    path(
        "login/",
        HRTokenObtainPairView.as_view(),
        name="login",
    ),
    path(
        "token/refresh/",
        CustomTokenRefreshView.as_view(),
        name="token-refresh",
    ),
    path(
        "profile/",
        ProfileView.as_view(),
        name="profile",
    ),
    path(
        "change-password/",
        ChangePasswordView.as_view(),
        name="change_password",
    ),
    path(
        "security-status/",
        SecurityStatusView.as_view(),
        name="security_status",
    ),
]