from django.contrib.auth.models import User
from django.db import models

from jobs.models import Job


class Application(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("shortlisted", "Shortlisted"),
        ("rejected", "Rejected"),
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