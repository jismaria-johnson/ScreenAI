from pathlib import Path

from django.utils import timezone
from rest_framework import serializers

from jobs.models import Job

from .models import Application, CandidateProgression, Interview


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


class InterviewSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source="created_by.username",
        read_only=True,
        default="",
    )
    application = serializers.PrimaryKeyRelatedField(
        queryset=Application.objects.all(),
        required=False,
    )
    candidate_name = serializers.SerializerMethodField()
    job_title = serializers.CharField(
        source="application.job.job_title",
        read_only=True,
        default="",
    )
    company_name = serializers.CharField(
        source="application.job.company_name",
        read_only=True,
        default="",
    )
    recruiter_username = serializers.CharField(
        source="application.job.hr_user.username",
        read_only=True,
        default="",
    )

    class Meta:
        model = Interview
        fields = [
            "id",
            "application",
            "round_name",
            "round_number",
            "interview_type",
            "scheduled_at",
            "duration_minutes",
            "location_or_meeting_link",
            "interviewer_name",
            "interviewer_email",
            "status",
            "technical_rating",
            "communication_rating",
            "problem_solving_rating",
            "culture_fit_rating",
            "overall_rating",
            "feedback",
            "recommendation",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "completed_at",
            "candidate_name",
            "job_title",
            "company_name",
            "recruiter_username",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
            "completed_at",
            "candidate_name",
            "job_title",
            "company_name",
            "recruiter_username",
        ]

    def get_candidate_name(self, obj):
        if obj.application:
            if obj.application.candidate:
                name = f"{obj.application.candidate.first_name} {obj.application.candidate.last_name}".strip()
                return name or obj.application.candidate.username
            return obj.application.candidate_name
        return ""

    def validate_round_number(self, value):
        if value <= 0:
            raise serializers.ValidationError("Round number must be a positive integer.")
        return value

    def validate_duration_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("Duration must be a positive integer.")
        if value > 1440:
            raise serializers.ValidationError("Duration cannot exceed 24 hours (1440 minutes).")
        return value

    def validate(self, data):
        instance = self.instance
        application = data.get("application", instance.application if instance else None)
        
        if not application:
            view = self.context.get("view")
            if view and hasattr(view, "kwargs"):
                app_id = view.kwargs.get("application_id")
                if app_id:
                    try:
                        application = Application.objects.get(pk=app_id)
                    except Application.DoesNotExist:
                        pass

        status_val = data.get("status", instance.status if instance else "scheduled")
        interview_type = data.get("interview_type", instance.interview_type if instance else "technical")
        location_or_meeting_link = data.get("location_or_meeting_link", instance.location_or_meeting_link if instance else "")
        scheduled_at = data.get("scheduled_at", instance.scheduled_at if instance else None)
        round_number = data.get("round_number", instance.round_number if instance else None)

        if not instance:
            if not application:
                raise serializers.ValidationError({"application": "Application is required."})
            if application.application_status != "shortlisted":
                raise serializers.ValidationError({
                    "non_field_errors": "Only shortlisted candidates can receive interviews."
                })
            
            if scheduled_at and scheduled_at < timezone.now():
                raise serializers.ValidationError({"scheduled_at": "Scheduled time cannot be in the past."})
            
            duplicate_exists = Interview.objects.filter(
                application=application,
                round_number=round_number,
                status="scheduled"
            ).exists()
            if duplicate_exists:
                raise serializers.ValidationError({
                    "round_number": "An active scheduled interview for this round number already exists."
                })
        else:
            prev_status = instance.status
            if prev_status == "completed":
                if status_val == "scheduled" or (scheduled_at and scheduled_at != instance.scheduled_at):
                    raise serializers.ValidationError({
                        "non_field_errors": "Completed interviews cannot be rescheduled."
                    })
            
            if prev_status == "cancelled" and status_val == "completed":
                raise serializers.ValidationError({
                    "non_field_errors": "Cancelled interviews cannot be completed directly. Please reschedule first."
                })

        if interview_type == "video" and not location_or_meeting_link.strip():
            raise serializers.ValidationError({"location_or_meeting_link": "Video interviews require a meeting link."})
        if interview_type == "in_person" and not location_or_meeting_link.strip():
            raise serializers.ValidationError({"location_or_meeting_link": "In-person interviews require a location."})

        if status_val == "completed":
            errors = {}
            for field in [
                "technical_rating",
                "communication_rating",
                "problem_solving_rating",
                "culture_fit_rating",
                "overall_rating",
            ]:
                val = data.get(field, getattr(instance, field) if instance else None)
                if val is None:
                    errors[field] = "This rating is required on completion."
                elif not 1 <= val <= 5:
                    errors[field] = "Rating must be between 1 and 5."

            feedback = data.get("feedback", getattr(instance, "feedback") if instance else "")
            if not feedback.strip():
                errors["feedback"] = "Feedback is required on completion."

            recommendation = data.get("recommendation", getattr(instance, "recommendation") if instance else None)
            if not recommendation:
                errors["recommendation"] = "Recommendation is required on completion."

            if errors:
                raise serializers.ValidationError(errors)

        return data

    def save(self, **kwargs):
        status_val = self.validated_data.get("status")
        if status_val == "completed":
            if not self.instance or self.instance.status != "completed":
                self.validated_data["completed_at"] = timezone.now()
        else:
            self.validated_data["completed_at"] = None
        return super().save(**kwargs)


class HRApplicationSerializer(
    serializers.ModelSerializer
):
    progressions = CandidateProgressionSerializer(
        many=True,
        read_only=True,
    )
    interviews = InterviewSerializer(
        many=True,
        read_only=True,
    )
    interview_summary = serializers.SerializerMethodField()
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

    def get_interview_summary(self, obj):
        interviews = obj.interviews.all()
        completed = [i for i in interviews if i.status == "completed"]
        upcoming = [i for i in interviews if i.status == "scheduled" and i.scheduled_at and i.scheduled_at > timezone.now()]
        
        avg_rating = None
        ratings = [i.overall_rating for i in completed if i.overall_rating is not None]
        if ratings:
            avg_rating = round(sum(ratings) / len(ratings), 2)
            
        latest_rec = None
        completed_sorted = sorted(completed, key=lambda x: x.completed_at or x.updated_at, reverse=True)
        if completed_sorted:
            latest_rec = completed_sorted[0].recommendation

        return {
            "total_rounds": len(interviews),
            "completed_rounds": len(completed),
            "upcoming_rounds": len(upcoming),
            "average_overall_rating": avg_rating,
            "latest_recommendation": latest_rec,
        }

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
            "interviews",
            "interview_summary",
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