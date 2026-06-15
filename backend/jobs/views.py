from django.db.models import Count
from rest_framework import generics
from rest_framework.exceptions import (
    PermissionDenied,
    ValidationError,
    NotFound,
)
from rest_framework.permissions import (
    AllowAny,
    IsAuthenticatedOrReadOnly,
)
from rest_framework.response import Response

from .models import Job
from .serializers import JobSerializer, PublicJobSerializer


def get_user_role(user):
    if not user or not user.is_authenticated:
        return None

    profile = getattr(user, "profile", None)

    if profile is None:
        return None

    return profile.role


class JobListCreateView(
    generics.ListCreateAPIView
):
    serializer_class = JobSerializer
    permission_classes = [
        IsAuthenticatedOrReadOnly
    ]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        if role == "hr":
            return (
                Job.objects.filter(
                    hr_user=user
                )
                .annotate(
                    applicant_count=Count(
                        "applications"
                    )
                )
                .order_by("-created_at")
            )

        return (
            Job.objects.filter(
                status="open"
            )
            .annotate(
                applicant_count=Count(
                    "applications"
                )
            )
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        role = get_user_role(
            self.request.user
        )

        if role != "hr":
            raise PermissionDenied(
                "Only HR users can create jobs."
            )

        serializer.save(
            hr_user=self.request.user
        )


class JobDetailView(
    generics.RetrieveUpdateDestroyAPIView
):
    serializer_class = JobSerializer
    permission_classes = [
        IsAuthenticatedOrReadOnly
    ]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        if role == "hr":
            return (
                Job.objects.filter(
                    hr_user=user
                )
                .annotate(
                    applicant_count=Count(
                        "applications"
                    )
                )
            )

        return (
            Job.objects.filter(
                status="open"
            )
            .annotate(
                applicant_count=Count(
                    "applications"
                )
            )
        )

    def perform_update(self, serializer):
        role = get_user_role(
            self.request.user
        )

        if role != "hr":
            raise PermissionDenied(
                "Only HR users can update jobs."
            )

        job = self.get_object()

        if job.hr_user != self.request.user:
            raise PermissionDenied(
                "You can update only jobs "
                "created by you."
            )

        serializer.save(
            hr_user=self.request.user
        )

    def perform_destroy(self, instance):
        role = get_user_role(
            self.request.user
        )

        if role != "hr":
            raise PermissionDenied(
                "Only HR users can delete jobs."
            )

        if instance.hr_user != self.request.user:
            raise PermissionDenied(
                "You can delete only jobs "
                "created by you."
            )

        if instance.applications.exists():
            raise PermissionDenied(
                "You cannot delete a job that has applications. "
                "Close the job instead."
            )

        instance.delete()


class PublicJobDetailView(
    generics.GenericAPIView
):
    """
    Retrieve public job details by application token.
    """
    serializer_class = PublicJobSerializer
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            job = Job.objects.get(
                application_token=token
            )
        except Job.DoesNotExist:
            raise NotFound(
                "Job not found."
            )

        if job.status != "open":
            return Response(
                {
                    "detail": (
                        "This job is no longer accepting applications."
                    )
                },
                status=400,
            )

        serializer = self.get_serializer(job)
        return Response(serializer.data)