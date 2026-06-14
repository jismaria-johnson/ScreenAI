from pathlib import Path

from rest_framework import serializers

from .models import Application


MAX_RESUME_SIZE = 5 * 1024 * 1024


class ApplicationCreateSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Application
        fields = [
            "id",
            "job",
            "resume",
        ]

        read_only_fields = [
            "id",
        ]

    def validate_job(self, job):
        if job.status != "open":
            raise serializers.ValidationError(
                "This job is no longer accepting applications."
            )

        return job

    def validate_resume(self, resume):
        if not resume:
            raise serializers.ValidationError(
                "Please upload a resume."
            )

        if resume.size == 0:
            raise serializers.ValidationError(
                "The uploaded resume is empty."
            )

        if resume.size > MAX_RESUME_SIZE:
            raise serializers.ValidationError(
                "Resume size must not exceed 5 MB."
            )

        extension = Path(
            resume.name
        ).suffix.lower()

        if extension != ".pdf":
            raise serializers.ValidationError(
                "Only PDF resumes are accepted."
            )

        content_type = getattr(
            resume,
            "content_type",
            "",
        )

        allowed_content_types = [
            "application/pdf",
            "application/x-pdf",
        ]

        if (
            content_type
            and content_type
            not in allowed_content_types
        ):
            raise serializers.ValidationError(
                "The uploaded file must be a valid PDF."
            )

        try:
            first_bytes = resume.read(5)
            resume.seek(0)

            if first_bytes != b"%PDF-":
                raise serializers.ValidationError(
                    "The uploaded file is not a valid PDF."
                )

        except serializers.ValidationError:
            raise

        except Exception:
            raise serializers.ValidationError(
                "The uploaded PDF could not be validated."
            )

        return resume


class CandidateApplicationSerializer(
    serializers.ModelSerializer
):
    job_title = serializers.CharField(
        source="job.job_title",
        read_only=True,
    )

    company_name = serializers.CharField(
        source="job.company_name",
        read_only=True,
    )

    class Meta:
        model = Application
        fields = [
            "id",
            "job",
            "job_title",
            "company_name",
            "application_status",
            "submitted_at",
        ]

        read_only_fields = fields


class HRApplicationSerializer(
    serializers.ModelSerializer
):
    candidate_username = serializers.CharField(
        source="candidate.username",
        read_only=True,
    )

    candidate_first_name = serializers.CharField(
        source="candidate.first_name",
        read_only=True,
    )

    candidate_last_name = serializers.CharField(
        source="candidate.last_name",
        read_only=True,
    )

    candidate_email = serializers.EmailField(
        source="candidate.email",
        read_only=True,
    )

    candidate_phone = serializers.CharField(
        source="candidate.profile.phone",
        read_only=True,
    )

    job_title = serializers.CharField(
        source="job.job_title",
        read_only=True,
    )

    company_name = serializers.CharField(
        source="job.company_name",
        read_only=True,
    )

    class Meta:
        model = Application
        fields = [
            "id",
            "candidate",
            "candidate_username",
            "candidate_first_name",
            "candidate_last_name",
            "candidate_email",
            "candidate_phone",
            "job",
            "job_title",
            "company_name",
            "resume",
            "ai_score",
            "matched_skills",
            "missing_skills",
            "experience_match",
            "total_experience_years",
            "worked_companies",
            "experience_summary",
            "ai_feedback",
            "recommendation",
            "application_status",
            "submitted_at",
        ]

        read_only_fields = fields