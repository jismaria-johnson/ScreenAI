import uuid
from django.contrib.auth.models import User
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

from jobs.models import Job


AI_EVALUATION_RESULT_FIELDS = (
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
)


class CandidateIdentity(models.Model):
    IDENTITY_TYPE_CHOICES = (
        ("registered", "Registered"),
        ("public", "Public"),
        ("anonymous", "Anonymous"),
    )

    uuid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    identity_type = models.CharField(max_length=20, choices=IDENTITY_TYPE_CHOICES, db_index=True)
    candidate_user = models.OneToOneField(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="candidate_identity"
    )
    normalized_email = models.EmailField(null=True, blank=True, db_index=True)
    public_email_key = models.EmailField(null=True, blank=True, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(identity_type="registered") | (
                    models.Q(candidate_user__isnull=False) & models.Q(public_email_key__isnull=True)
                ),
                name="registered_identity_integrity"
            ),
            models.CheckConstraint(
                condition=~models.Q(identity_type="public") | (
                    models.Q(candidate_user__isnull=True) & 
                    models.Q(normalized_email__isnull=False) & 
                    models.Q(public_email_key__isnull=False)
                ),
                name="public_identity_integrity"
            ),
            models.CheckConstraint(
                condition=~models.Q(identity_type="anonymous") | (
                    models.Q(candidate_user__isnull=True) & 
                    models.Q(normalized_email__isnull=True) & 
                    models.Q(public_email_key__isnull=True)
                ),
                name="anonymous_identity_integrity"
            )
        ]

    def __str__(self):
        return f"{self.identity_type} - {self.uuid}"


class Application(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("shortlisted", "Shortlisted"),
        ("rejected", "Rejected"),
        ("hired", "Hired"),
    )

    RECOMMENDATION_CHOICES = (
        ("shortlist", "Shortlist"),
        ("review", "Review"),
        ("reject", "Reject"),
        ("not_evaluated", "Not Evaluated"),
    )

    candidate = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="applications",
        null=True,
        blank=True,
    )

    candidate_identity = models.ForeignKey(
        CandidateIdentity,
        on_delete=models.PROTECT,
        related_name="applications",
        null=True
    )

    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="applications",
    )


    # New fields for public applications (candidates without user account)
    candidate_name = models.CharField(
        max_length=255,
        blank=True,
    )
    candidate_email = models.EmailField(
        blank=True,
    )
    candidate_phone = models.CharField(
        max_length=20,
        blank=True,
    )
    candidate_education = models.TextField(
        blank=True,
    )

    resume = models.FileField(upload_to="resumes/")

    extracted_resume_text = models.TextField(blank=True)

    ai_score = models.IntegerField(
        null=True,
        blank=True,
    )

    skills_score = models.IntegerField(
        null=True,
        blank=True,
    )

    experience_score = models.IntegerField(
        null=True,
        blank=True,
    )

    projects_score = models.IntegerField(
        null=True,
        blank=True,
    )

    company_role_score = models.IntegerField(
        null=True,
        blank=True,
    )

    education_score = models.IntegerField(
        null=True,
        blank=True,
    )

    relevance_score = models.IntegerField(
        null=True,
        blank=True,
    )

    skills_reason = models.TextField(
        null=True,
        blank=True,
    )

    experience_score_reason = models.TextField(
        null=True,
        blank=True,
    )

    projects_score_reason = models.TextField(
        null=True,
        blank=True,
    )

    company_role_score_reason = models.TextField(
        null=True,
        blank=True,
    )

    education_score_reason = models.TextField(
        null=True,
        blank=True,
    )

    relevance_score_reason = models.TextField(
        null=True,
        blank=True,
    )

    project_summary = models.TextField(
        null=True,
        blank=True,
    )

    education_summary = models.TextField(
        null=True,
        blank=True,
    )

    matched_skills = models.TextField(blank=True)

    missing_skills = models.TextField(blank=True)

    experience_match = models.TextField(blank=True)

    ai_feedback = models.TextField(blank=True)

    recommendation = models.CharField(
        max_length=20,
        choices=RECOMMENDATION_CHOICES,
        default="not_evaluated",
    )

    ai_evaluation_fingerprint = models.CharField(
        max_length=64,
        blank=True,
        db_index=True,
    )

    ai_evaluator_version = models.CharField(
        max_length=50,
        blank=True,
    )

    total_experience_years = models.FloatField(
        null=True,
        blank=True,
    )

    worked_companies = models.TextField(
        blank=True,
    )

    experience_summary = models.TextField(
        blank=True,
    )

    application_status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )

    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.candidate:
            return (
                f"{self.candidate.username} - "
                f"{self.job.job_title}"
            )
        return (
            f"{self.candidate_name} - "
            f"{self.job.job_title}"
        )

    def evaluate_and_save(self):
        from ai_engine.resume_parser import extract_text_from_pdf
        from ai_engine.gemini_scorer import (
            AI_SCORING_PROMPT_VERSION,
            build_evaluation_fingerprint,
            score_resume_with_gemini,
        )

        extracted_text = extract_text_from_pdf(self.resume.path)
        self.extracted_resume_text = extracted_text

        if not extracted_text:
            message = "The resume could not be read. Please review it manually."
            self.ai_score = None
            self.skills_score = None
            self.experience_score = None
            self.projects_score = None
            self.company_role_score = None
            self.education_score = None
            self.relevance_score = None

            self.skills_reason = message
            self.experience_score_reason = message
            self.projects_score_reason = message
            self.company_role_score_reason = message
            self.education_score_reason = message
            self.relevance_score_reason = message
            self.project_summary = message
            self.education_summary = message

            self.matched_skills = ""
            self.missing_skills = ""
            self.experience_match = "Resume text could not be extracted."
            self.total_experience_years = None
            self.worked_companies = ""
            self.experience_summary = message
            self.ai_feedback = "AI evaluation was not completed because resume text extraction failed."
            self.recommendation = "not_evaluated"
            self.save()
            return

        fingerprint = build_evaluation_fingerprint(extracted_text, self.job)
        cached_application = (
            Application.objects.filter(
                ai_evaluation_fingerprint=fingerprint,
                ai_score__isnull=False,
            )
            .exclude(pk=self.pk)
            .order_by("-submitted_at")
            .first()
        )

        if cached_application:
            for field_name in AI_EVALUATION_RESULT_FIELDS:
                setattr(self, field_name, getattr(cached_application, field_name))
            self.ai_evaluation_fingerprint = fingerprint
            self.ai_evaluator_version = AI_SCORING_PROMPT_VERSION
            self.save()
            return

        ai_result = score_resume_with_gemini(extracted_text, self.job)

        self.ai_score = ai_result["ai_score"]
        self.skills_score = ai_result["skills_score"]
        self.experience_score = ai_result["experience_score"]
        self.projects_score = ai_result["projects_score"]
        self.company_role_score = ai_result["company_role_score"]
        self.education_score = ai_result["education_score"]
        self.relevance_score = ai_result["relevance_score"]

        self.skills_reason = ai_result["skills_reason"]
        self.experience_score_reason = ai_result["experience_score_reason"]
        self.projects_score_reason = ai_result["projects_score_reason"]
        self.company_role_score_reason = ai_result["company_role_score_reason"]
        self.education_score_reason = ai_result["education_score_reason"]
        self.relevance_score_reason = ai_result["relevance_score_reason"]
        self.project_summary = ai_result["project_summary"]
        self.education_summary = ai_result["education_summary"]

        self.matched_skills = ai_result["matched_skills"]
        self.missing_skills = ai_result["missing_skills"]
        self.experience_match = ai_result["experience_match"]
        self.total_experience_years = ai_result["total_experience_years"]
        self.worked_companies = ai_result["worked_companies"]
        self.experience_summary = ai_result["experience_summary"]
        self.ai_feedback = ai_result["ai_feedback"]
        self.recommendation = ai_result["recommendation"]
        self.ai_evaluation_fingerprint = fingerprint
        self.ai_evaluator_version = AI_SCORING_PROMPT_VERSION
        self.save()


class CandidateProgression(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name="progressions",
    )
    stage = models.CharField(max_length=100)
    notes = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="progression_updates",
    )
    updater_role = models.CharField(
        max_length=20,
        choices=(("hr", "HR"), ("admin", "Admin")),
        default="hr",
    )

    def __str__(self):
        name = self.application.candidate_name
        if not name and self.application.candidate:
            name = self.application.candidate.username
        return f"{name or 'Unknown'} - {self.stage}"


from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Application)
def handle_application_hired(sender, instance, raw=False, **kwargs):
    if raw:
        return
    if instance.application_status == "hired":
        if not instance.progressions.filter(stage="Hired").exists():
            updated_by = getattr(instance, "_updated_by", None)
            updater_role = "hr"
            if updated_by:
                if updated_by.is_superuser or updated_by.is_staff:
                    updater_role = "admin"
                else:
                    updater_role = "hr"
            progression = CandidateProgression.objects.create(
                application=instance,
                stage="Hired",
                notes="Candidate was marked as Hired by HR.",
                updated_by=updated_by,
                updater_role=updater_role,
            )
            from accounts.utils import log_audit
            log_audit(
                action="candidate_progression_created",
                actor=updated_by,
                target_type="CandidateProgression",
                target_id=progression.id,
                target_label=str(progression),
                metadata={
                    "recruiter_id": instance.job.hr_user.id,
                    "recruiter_username": instance.job.hr_user.username,
                    "job_id": instance.job.id,
                    "job_title": instance.job.job_title,
                    "application_id": instance.id,
                    "progression_id": progression.id,
                    "stage": progression.stage,
                }
            )


class Interview(models.Model):
    INTERVIEW_TYPE_CHOICES = (
        ("phone", "Phone"),
        ("video", "Video"),
        ("in_person", "In Person"),
        ("technical", "Technical"),
        ("hr", "HR"),
        ("managerial", "Managerial"),
        ("other", "Other"),
    )

    STATUS_CHOICES = (
        ("scheduled", "Scheduled"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("no_show", "No Show"),
    )

    RECOMMENDATION_CHOICES = (
        ("strong_hire", "Strong Hire"),
        ("hire", "Hire"),
        ("review", "Review"),
        ("no_hire", "No Hire"),
    )

    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name="interviews",
    )
    round_name = models.CharField(max_length=100)
    round_number = models.PositiveIntegerField()
    interview_type = models.CharField(
        max_length=20,
        choices=INTERVIEW_TYPE_CHOICES,
        default="technical",
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    location_or_meeting_link = models.TextField(blank=True, default="")
    interviewer_name = models.CharField(max_length=255, blank=True, default="")
    interviewer_email = models.EmailField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="scheduled",
    )

    # Ratings (1 to 5)
    technical_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    communication_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    problem_solving_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    culture_fit_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    overall_rating = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    feedback = models.TextField(blank=True, default="")
    recommendation = models.CharField(
        max_length=20,
        choices=RECOMMENDATION_CHOICES,
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_interviews",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        name = self.application.candidate_name
        if not name and self.application.candidate:
            name = self.application.candidate.username
        return f"{name or 'Unknown'} - Round {self.round_number} ({self.round_name})"