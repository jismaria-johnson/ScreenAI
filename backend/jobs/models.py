from django.db import models
from django.contrib.auth.models import User


class Job(models.Model):
    STATUS_CHOICES = (
        ("open", "Open"),
        ("closed", "Closed"),
    )

    hr_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="posted_jobs"
    )
    job_title = models.CharField(max_length=100)
    company_name = models.CharField(max_length=100)
    job_description = models.TextField()
    required_skills = models.TextField()
    required_experience = models.CharField(max_length=100)
    location = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.job_title} - {self.company_name}"