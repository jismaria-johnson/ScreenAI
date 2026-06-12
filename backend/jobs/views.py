from django.db.models import Count
from rest_framework import generics, permissions
from rest_framework.exceptions import ValidationError

from .models import Job
from .permissions import IsHRUser
from .serializers import JobSerializer


class JobListCreateView(generics.ListCreateAPIView):
    serializer_class = JobSerializer

    def get_queryset(self):
        user = self.request.user

        if (
            user.is_authenticated
            and hasattr(user, "profile")
            and user.profile.role == "hr"
        ):
            return (
                Job.objects
                .filter(hr_user=user)
                .annotate(applicant_count=Count("applications"))
                .order_by("-created_at")
            )

        return (
            Job.objects
            .filter(status="open")
            .annotate(applicant_count=Count("applications"))
            .order_by("-created_at")
        )

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

        if (
            user.is_authenticated
            and hasattr(user, "profile")
            and user.profile.role == "hr"
        ):
            return (
                Job.objects
                .filter(hr_user=user)
                .annotate(applicant_count=Count("applications"))
            )

        return (
            Job.objects
            .filter(status="open")
            .annotate(applicant_count=Count("applications"))
        )

    def get_permissions(self):
        if self.request.method in ["PUT", "PATCH", "DELETE"]:
            return [IsHRUser()]

        return [permissions.AllowAny()]

    def perform_destroy(self, instance):
        if instance.applications.exists():
            raise ValidationError(
                {
                    "detail": (
                        "This job cannot be deleted because it already has "
                        "candidate applications. Close the job instead."
                    )
                }
            )

        instance.delete()