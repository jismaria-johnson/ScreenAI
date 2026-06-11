from django.db import models
from django.contrib.auth.models import User


class Profile(models.Model):
    ROLE_CHOICES = (
        ("candidate", "Candidate"),
        ("hr", "HR"),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    phone = models.CharField(max_length=15, blank=True)
    education = models.TextField(blank=True)
    skills = models.TextField(blank=True)
    experience = models.TextField(blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.role}"