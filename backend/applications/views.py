from django.db import transaction
from rest_framework import generics
from rest_framework.exceptions import (
    ValidationError,
)
from rest_framework.parsers import (
    FormParser,
    MultiPartParser,
)
from rest_framework.response import (
    Response,
)
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle

from ai_engine.gemini_scorer import (
    score_resume_with_gemini,
)
from ai_engine.resume_parser import (
    extract_text_from_pdf,
)

from .models import Application, Interview
from .permissions import (
    IsCandidateUser,
    IsHRUser,
    IsAdminOrHiringHRForInterview,
)
from .serializers import (
    ApplicationCreateSerializer,
    CandidateApplicationSerializer,
    HRApplicationSerializer,
    PublicApplicationCreateSerializer,
    InterviewSerializer,
)


class ApplyJobView(
    generics.CreateAPIView
):
    serializer_class = (
        ApplicationCreateSerializer
    )

    permission_classes = [
        IsCandidateUser,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    def perform_create(
        self,
        serializer,
    ):
        job = serializer.validated_data[
            "job"
        ]

        if job.status != "open":
            raise ValidationError(
                {
                    "job": (
                        "This job is no longer "
                        "accepting applications."
                    )
                }
            )

        already_applied = (
            Application.objects.filter(
                candidate=self.request.user,
                job=job,
            ).exists()
        )

        if already_applied:
            raise ValidationError(
                {
                    "detail": (
                        "You have already applied "
                        "for this job."
                    )
                }
            )

        application = serializer.save(
            candidate=self.request.user
        )

        application.evaluate_and_save()


class MyApplicationsView(
    generics.ListAPIView
):
    serializer_class = (
        CandidateApplicationSerializer
    )

    permission_classes = [
        IsCandidateUser,
    ]

    def get_queryset(self):
        return (
            Application.objects.filter(
                candidate=self.request.user
            )
            .select_related(
                "job",
                "candidate",
            )
            .order_by(
                "-submitted_at"
            )
        )


class HRApplicationsView(
    generics.ListAPIView
):
    serializer_class = (
        HRApplicationSerializer
    )

    permission_classes = [
        IsHRUser,
    ]

    def get_queryset(self):
        applications = (
            Application.objects.filter(
                job__hr_user=(
                    self.request.user
                )
            )
            .select_related(
                "job",
                "candidate",
                "candidate__profile",
            )
            .order_by(
                "-submitted_at"
            )
        )

        job_id = (
            self.request.query_params.get(
                "job"
            )
        )

        min_score = (
            self.request.query_params.get(
                "min_score"
            )
        )

        experience_filter = (
            self.request.query_params.get(
                "experience"
            )
        )

        company = (
            self.request.query_params.get(
                "company"
            )
        )

        recommendation = (
            self.request.query_params.get(
                "recommendation"
            )
        )

        status = (
            self.request.query_params.get(
                "status"
            )
        )

        if job_id:
            applications = (
                applications.filter(
                    job_id=job_id
                )
            )

        if min_score:
            try:
                score_value = int(
                    min_score
                )

                if not 0 <= score_value <= 100:
                    raise ValidationError(
                        "Minimum AI score must "
                        "be between 0 and 100."
                    )

                applications = (
                    applications.filter(
                        ai_score__gte=(
                            score_value
                        )
                    )
                )

            except ValueError:
                raise ValidationError(
                    "Minimum AI score must "
                    "be a number."
                )

        if experience_filter:
            if (
                experience_filter
                == "fresher"
            ):
                applications = (
                    applications.filter(
                        total_experience_years=0
                    )
                )

            elif (
                experience_filter
                == "not_evaluated"
            ):
                applications = (
                    applications.filter(
                        total_experience_years__isnull=True
                    )
                )

            else:
                try:
                    experience_value = float(
                        experience_filter
                    )

                    if experience_value < 0:
                        raise ValidationError(
                            "Experience cannot "
                            "be negative."
                        )

                    applications = (
                        applications.filter(
                            total_experience_years__gte=(
                                experience_value
                            )
                        )
                    )

                except ValueError:
                    raise ValidationError(
                        "Invalid experience filter."
                    )

        if company:
            applications = (
                applications.filter(
                    worked_companies__icontains=(
                        company
                    )
                )
            )

        if recommendation:
            allowed_recommendations = [
                "shortlist",
                "review",
                "reject",
                "not_evaluated",
            ]

            if (
                recommendation
                not in allowed_recommendations
            ):
                raise ValidationError(
                    "Invalid AI recommendation."
                )

            applications = (
                applications.filter(
                    recommendation=(
                        recommendation
                    )
                )
            )

        if status:
            allowed_statuses = [
                "pending",
                "shortlisted",
                "rejected",
                "hired",
            ]

            if (
                status
                not in allowed_statuses
            ):
                raise ValidationError(
                    "Invalid application status."
                )

            applications = (
                applications.filter(
                    application_status=status
                )
            )

        return applications


class UpdateApplicationStatusView(
    APIView
):
    permission_classes = [
        IsHRUser,
    ]

    @transaction.atomic
    def patch(
        self,
        request,
        pk,
    ):
        try:
            application = (
                Application.objects.select_for_update().get(
                    pk=pk,
                    job__hr_user=(
                        request.user
                    ),
                )
            )

        except Application.DoesNotExist:
            raise ValidationError(
                "Application not found."
            )

        new_status = request.data.get(
            "application_status"
        )

        if application.application_status == "hired":
            if new_status == "hired":
                raise ValidationError(
                    {"detail": "Application is already hired."}
                )
            else:
                raise ValidationError(
                    {"detail": "A hired application cannot be moved back to a recruitment status."}
                )

        allowed_statuses = [
            "pending",
            "shortlisted",
            "rejected",
            "hired",
        ]

        if (
            new_status
            not in allowed_statuses
        ):
            raise ValidationError(
                "Invalid application status."
            )

        application.application_status = (
            new_status
        )
        application._updated_by = request.user
        application.save(
            update_fields=[
                "application_status",
            ]
        )

        serializer = (
            HRApplicationSerializer(
                application
            )
        )

        return Response(
            serializer.data
        )


class PublicApplicationCreateView(
    generics.CreateAPIView
):
    """
    Public endpoint for candidates to apply without authentication.
    Accepts multipart form data with candidate details and resume PDF.
    Job is determined from the URL token, not from user input.
    """
    serializer_class = (
        PublicApplicationCreateSerializer
    )

    permission_classes = [
        AllowAny,
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_application_submit"

    def get_job_by_token(self, token):
        from jobs.models import Job
        try:
            return Job.objects.get(
                application_token=token
            )
        except Job.DoesNotExist:
            raise ValidationError(
                "Invalid application link."
            )

    def perform_create(
        self,
        serializer,
    ):
        from datetime import datetime, timezone
        
        token = self.kwargs.get("token")
        job = self.get_job_by_token(token)

        # Validate job status
        if job.status != "open":
            raise ValidationError(
                {
                    "job": (
                        "This job is no longer "
                        "accepting applications."
                    )
                }
            )

        # Validate application form is enabled
        if not job.application_form_enabled:
            raise ValidationError(
                {
                    "job": (
                        "This job is not accepting applications at this time."
                    )
                }
            )

        # Validate deadline
        if job.application_deadline:
            now = datetime.now(timezone.utc)
            deadline = job.application_deadline
            if isinstance(deadline, datetime) and deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            
            if now > deadline:
                raise ValidationError(
                    {
                        "job": (
                            "The application deadline for this job has passed."
                        )
                    }
                )

        candidate_email = serializer.validated_data.get(
            "candidate_email", ""
        ).lower().strip()

        # Check for duplicate application
        already_applied = (
            Application.objects.filter(
                job=job,
                candidate_email__iexact=(
                    candidate_email
                ),
            ).exists()
        )

        if already_applied:
            raise ValidationError(
                {
                    "detail": (
                        "You have already applied to this job."
                    )
                }
            )

        # Create application without candidate user
        application = serializer.save(
            job=job,
            candidate=None,
        )

        application.evaluate_and_save()


class ApplicationInterviewsView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrHiringHRForInterview]
    serializer_class = InterviewSerializer

    def get_application(self):
        app_id = self.kwargs.get("application_id")
        try:
            app = Application.objects.get(pk=app_id)
        except Application.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Application not found.")
        self.check_object_permissions(self.request, app)
        return app

    def get_queryset(self):
        app = self.get_application()
        return app.interviews.select_related("created_by").order_by("round_number", "scheduled_at")

    def perform_create(self, serializer):
        app = self.get_application()
        serializer.save(
            application=app,
            created_by=self.request.user,
            status="scheduled"
        )


class InterviewDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAdminOrHiringHRForInterview]
    serializer_class = InterviewSerializer
    queryset = Interview.objects.select_related("application", "application__job", "created_by").all()