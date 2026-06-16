from django.contrib.auth.models import User
from django.db import models

from jobs.models import Job


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
        from ai_engine.gemini_scorer import score_resume_with_gemini

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
def handle_application_hired(sender, instance, **kwargs):
    if instance.application_status == "hired":
        if not instance.progressions.filter(stage="Hired").exists():
            updated_by = getattr(instance, "_updated_by", None)
            updater_role = "hr"
            if updated_by:
                if updated_by.is_superuser or updated_by.is_staff:
                    updater_role = "admin"
                else:
                    updater_role = "hr"
            CandidateProgression.objects.create(
                application=instance,
                stage="Hired",
                notes="Candidate was marked as Hired by HR.",
                updated_by=updated_by,
                updater_role=updater_role,
            )