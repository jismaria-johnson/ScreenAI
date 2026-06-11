from rest_framework import generics, permissions
from .models import Job
from .serializers import JobSerializer
from .permissions import IsHRUser


class JobListCreateView(generics.ListCreateAPIView):
    serializer_class = JobSerializer

    def get_queryset(self):
        user = self.request.user

        if user.is_authenticated and hasattr(user, "profile") and user.profile.role == "hr":
            return Job.objects.filter(hr_user=user).order_by("-created_at")

        return Job.objects.filter(status="open").order_by("-created_at")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsHRUser()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        serializer.save(hr_user=self.request.user)


class JobDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = JobSerializer

    def get_queryset(self):
        user = self.request.user

        if user.is_authenticated and hasattr(user, "profile") and user.profile.role == "hr":
            return Job.objects.filter(hr_user=user)

        return Job.objects.filter(status="open")

    def get_permissions(self):
        if self.request.method in ["PUT", "PATCH", "DELETE"]:
            return [IsHRUser()]
        return [permissions.AllowAny()]