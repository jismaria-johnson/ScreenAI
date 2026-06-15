from django.contrib.auth.models import User
from rest_framework import generics, permissions
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
)

from .serializers import (
    HRTokenObtainPairSerializer,
    ProfileSerializer,
    RegisterSerializer,
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [
        permissions.AllowAny,
    ]


class HRTokenObtainPairView(
    TokenObtainPairView
):
    serializer_class = (
        HRTokenObtainPairSerializer
    )


class ProfileView(
    generics.RetrieveUpdateAPIView
):
    serializer_class = ProfileSerializer
    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def get_object(self):
        return self.request.user.profile