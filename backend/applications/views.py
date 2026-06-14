from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import (
    FormParser,
    MultiPartParser,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_engine.gemini_scorer import (
    score_resume_with_gemini,
)
from ai_engine.resume_parser import (
    extract_text_from_pdf,
)

from .models import Application
from .permissions import (
    IsCandidateUser,
    IsHRUser,
)
from .serializers import (
    ApplicationCreateSerializer,
    CandidateApplicationSerializer,
    HRApplicationSerializer,
)


class ApplyJobView(generics.CreateAPIView):
    serializer_class = (
        ApplicationCreateSerializer
    )

    permission_classes = [
        IsCandidateUser
    ]

    parser_classes = [
        MultiPartParser,
        FormParser,
    ]

    def perform_create(self, serializer):
        job = serializer.validated_data.get(
            "job"
        )

        already_applied = (
            Application.objects.filter(
                candidate=self.request.user,
                job=job,
            ).exists()
        )

        if already_applied:
            raise ValidationError(
                "You have already applied "
                "for this job."
            )

        application = serializer.save(
            candidate=self.request.user
        )

        resume_path = application.resume.path

        extracted_text = extract_text_from_pdf(
            resume_path
        )

        application.extracted_resume_text = (
            extracted_text
        )

        if extracted_text:
            ai_result = (
                score_resume_with_gemini(
                    extracted_text,
                    job,
                )
            )

            application.ai_score = (
                ai_result["ai_score"]
            )

            application.matched_skills = (
                ai_result["matched_skills"]
            )

            application.missing_skills = (
                ai_result["missing_skills"]
            )

            application.experience_match = (
                ai_result["experience_match"]
            )

            application.total_experience_years = (
                ai_result[
                    "total_experience_years"
                ]
            )

            application.worked_companies = (
                ai_result[
                    "worked_companies"
                ]
            )

            application.experience_summary = (
                ai_result[
                    "experience_summary"
                ]
            )

            application.ai_feedback = (
                ai_result["ai_feedback"]
            )

            application.recommendation = (
                ai_result["recommendation"]
            )

        else:
            application.ai_score = 0

            application.experience_match = (
                "Resume text could not "
                "be extracted."
            )

            application.total_experience_years = (
                0.0
            )

            application.worked_companies = ""

            application.experience_summary = (
                "Experience details could not "
                "be extracted."
            )

            application.ai_feedback = (
                "Could not read resume. "
                "Please review manually."
            )

            application.recommendation = "review"

        application.save()


class MyApplicationsView(
    generics.ListAPIView
):
    serializer_class = (
        CandidateApplicationSerializer
    )

    permission_classes = [
        IsCandidateUser
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
            .order_by("-submitted_at")
        )


class HRApplicationsView(
    generics.ListAPIView
):
    serializer_class = (
        HRApplicationSerializer
    )

    permission_classes = [
        IsHRUser
    ]

    def get_queryset(self):
        applications = (
            Application.objects.filter(
                job__hr_user=self.request.user
            )
            .select_related(
                "job",
                "candidate",
                "candidate__profile",
            )
            .order_by("-submitted_at")
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
                score_value = int(min_score)

                if (
                    score_value < 0
                    or score_value > 100
                ):
                    raise ValidationError(
                        "Minimum AI score must "
                        "be between 0 and 100."
                    )

                applications = (
                    applications.filter(
                        ai_score__gte=score_value
                    )
                )

            except ValueError:
                raise ValidationError(
                    "Minimum AI score must "
                    "be a number."
                )

        if experience_filter:
            if experience_filter == "fresher":
                applications = (
                    applications.filter(
                        total_experience_years=0
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
                    recommendation=recommendation
                )
            )

        if status:
            allowed_statuses = [
                "pending",
                "shortlisted",
                "rejected",
            ]

            if status not in allowed_statuses:
                raise ValidationError(
                    "Invalid application status."
                )

            applications = (
                applications.filter(
                    application_status=status
                )
            )

        return applications


class UpdateApplicationStatusView(APIView):
    permission_classes = [IsHRUser]

    def patch(self, request, pk):
        try:
            application = (
                Application.objects.get(
                    pk=pk,
                    job__hr_user=request.user,
                )
            )

        except Application.DoesNotExist:
            raise ValidationError(
                "Application not found."
            )

        new_status = request.data.get(
            "application_status"
        )

        allowed_statuses = [
            "pending",
            "shortlisted",
            "rejected",
        ]

        if new_status not in allowed_statuses:
            raise ValidationError(
                "Invalid application status."
            )

        application.application_status = (
            new_status
        )

        application.save(
            update_fields=[
                "application_status"
            ]
        )

        serializer = HRApplicationSerializer(
            application
        )

        return Response(serializer.data)