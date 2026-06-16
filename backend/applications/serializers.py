from pathlib import Path

from rest_framework import serializers

from jobs.models import Job

from .models import Application, CandidateProgression


MAX_RESUME_SIZE = 5 * 1024 * 1024


def validate_pdf_resume(resume):
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
        "application/octet-stream",
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
        resume.seek(0)
        first_bytes = resume.read(5)
        resume.seek(0)

        if first_bytes != b"%PDF-":
            raise serializers.ValidationError(
                "The uploaded file is not a valid PDF."
            )

        import pdfplumber
        try:
            with pdfplumber.open(resume) as pdf:
                _ = pdf.pages
        except Exception:
            raise serializers.ValidationError(
                "The uploaded PDF file is corrupt or invalid."
            )

    except serializers.ValidationError:
        raise

    except Exception:
        raise serializers.ValidationError(
            "The uploaded PDF could not be validated."
        )
    finally:
        try:
            resume.seek(0)
        except Exception:
            pass

    return resume


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
        return validate_pdf_resume(resume)


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


class CandidateProgressionSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(
        source="updated_by.username",
        read_only=True,
        default="",
    )

    class Meta:
        model = CandidateProgression
        fields = [
            "id",
            "stage",
            "notes",
            "updated_at",
            "updated_by",
            "updated_by_username",
            "updater_role",
        ]
        read_only_fields = fields


class HRApplicationSerializer(
    serializers.ModelSerializer
):
    progressions = CandidateProgressionSerializer(
        many=True,
        read_only=True,
    )
    candidate_username = (
        serializers.SerializerMethodField()
    )

    candidate_first_name = (
        serializers.SerializerMethodField()
    )

    candidate_last_name = (
        serializers.SerializerMethodField()
    )

    candidate_email_db = (
        serializers.SerializerMethodField()
    )

    candidate_phone_db = (
        serializers.SerializerMethodField()
    )

    job_title = serializers.CharField(
        source="job.job_title",
        read_only=True,
    )

    company_name = serializers.CharField(
        source="job.company_name",
        read_only=True,
    )

    hr_user_id = serializers.IntegerField(
        source="job.hr_user.id",
        read_only=True,
    )

    hr_username = serializers.CharField(
        source="job.hr_user.username",
        read_only=True,
    )

    def get_candidate_username(self, obj):
        if obj.candidate:
            return obj.candidate.username

        return ""

    def get_candidate_first_name(self, obj):
        if obj.candidate:
            return obj.candidate.first_name

        return obj.candidate_name or ""

    def get_candidate_last_name(self, obj):
        if obj.candidate:
            return obj.candidate.last_name

        return ""

    def get_candidate_email_db(self, obj):
        if obj.candidate:
            return obj.candidate.email

        return obj.candidate_email or ""

    def get_candidate_phone_db(self, obj):
        if (
            obj.candidate
            and hasattr(
                obj.candidate,
                "profile",
            )
        ):
            return (
                obj.candidate.profile.phone
                or ""
            )

        return obj.candidate_phone or ""

    class Meta:
        model = Application
        fields = [
            "id",
            "candidate",
            "candidate_username",
            "candidate_first_name",
            "candidate_last_name",
            "candidate_email_db",
            "candidate_phone_db",
            "candidate_name",
            "candidate_email",
            "candidate_phone",
            "candidate_education",
            "job",
            "job_title",
            "company_name",
            "hr_user_id",
            "hr_username",
            "resume",
            "ai_score",
            "skills_score",
            "experience_score",
            "projects_score",
            "company_role_score",
            "education_score",
            "relevance_score",
            "skills_reason",
            "experience_score_reason",
            "projects_score_reason",
            "company_role_score_reason",
            "education_score_reason",
            "relevance_score_reason",
            "project_summary",
            "education_summary",
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
            "progressions",
        ]

        read_only_fields = fields


class PublicJobSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Job
        fields = [
            "id",
            "job_title",
            "company_name",
            "job_description",
            "required_skills",
            "required_experience",
            "location",
            "status",
            "application_form_enabled",
            "application_deadline",
        ]

        read_only_fields = fields


class PublicApplicationCreateSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Application
        fields = [
            "id",
            "candidate_name",
            "candidate_email",
            "candidate_phone",
            "candidate_education",
            "resume",
        ]

        read_only_fields = [
            "id",
        ]

    def validate_candidate_name(
        self,
        value,
    ):
        if not value or not value.strip():
            raise serializers.ValidationError(
                "Full name is required."
            )

        return value.strip()

    def validate_candidate_email(
        self,
        value,
    ):
        if not value or not value.strip():
            raise serializers.ValidationError(
                "Email is required."
            )

        return value.strip().lower()

    def validate_candidate_phone(
        self,
        value,
    ):
        if not value or not value.strip():
            raise serializers.ValidationError(
                "Phone number is required."
            )

        return value.strip()

    def validate_candidate_education(
        self,
        value,
    ):
        if not value:
            return ""

        return value.strip()

    def validate_resume(
        self,
        resume,
    ):
        return validate_pdf_resume(resume)