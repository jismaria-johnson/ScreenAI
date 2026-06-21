from django.db import models
from django.contrib.auth.models import User
from django.db.utils import IntegrityError
from django.db.models.signals import post_save
from django.dispatch import receiver


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


class AuditLog(models.Model):
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    action = models.CharField(max_length=100, db_index=True)
    target_type = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    target_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    target_label = models.CharField(max_length=255, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionError("Audit records are append-only and cannot be updated.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Audit records cannot be deleted.")

    def __str__(self):
        return f"{self.action} by {self.actor} at {self.created_at}"


class UserSecurityState(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="security_state")
    token_version = models.IntegerField(default=0)
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - Version {self.token_version}"


@receiver(post_save, sender=User)
def create_user_security_state(sender, instance, created, **kwargs):
    if created:
        try:
            UserSecurityState.objects.get_or_create(user=instance)
        except IntegrityError:
            pass