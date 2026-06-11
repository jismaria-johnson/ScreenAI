from rest_framework import generics
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError
from .models import Application
from .serializers import ApplicationSerializer
from .permissions import IsCandidateUser, IsHRUser


class ApplyJobView(generics.CreateAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsCandidateUser]
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        job = serializer.validated_data.get("job")

        already_applied = Application.objects.filter(
            candidate=self.request.user,
            job=job
        ).exists()

        if already_applied:
            raise ValidationError("You have already applied for this job.")

        serializer.save(candidate=self.request.user)


class MyApplicationsView(generics.ListAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsCandidateUser]

    def get_queryset(self):
        return Application.objects.filter(
            candidate=self.request.user
        ).order_by("-submitted_at")


class HRApplicationsView(generics.ListAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsHRUser]

    def get_queryset(self):
        return Application.objects.filter(
            job__hr_user=self.request.user
        ).order_by("-submitted_at")