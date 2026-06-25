from django.contrib import admin
from .models import (
    AssessmentTemplate,
    AssessmentQuestion,
    CandidateAssessment,
    AssessmentSubmission,
    AssessmentResult,
    AssessmentQuestionResult,
    AssessmentEmailDelivery
)


class AssessmentQuestionInline(admin.TabularInline):
    model = AssessmentQuestion
    extra = 0

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status in ["active", "archived"]:
            return [field.name for field in self.model._meta.fields]
        return super().get_readonly_fields(request, obj)

    def has_add_permission(self, request, obj):
        if obj and obj.status in ["active", "archived"]:
            return False
        return super().has_add_permission(request, obj)

    def has_delete_permission(self, request, obj):
        if obj and obj.status in ["active", "archived"]:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(AssessmentTemplate)
class AssessmentTemplateAdmin(admin.ModelAdmin):
    inlines = [AssessmentQuestionInline]
    list_display = ("name", "version", "status", "created_by", "created_at")
    list_filter = ("status", "created_by")
    search_fields = ("name",)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status in ["active", "archived"]:
            return [field.name for field in self.model._meta.fields]
        return super().get_readonly_fields(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and obj.status in ["active", "archived"]:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(CandidateAssessment)
class CandidateAssessmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "template",
        "template_version_snapshot",
        "candidate_name_snapshot",
        "status",
        "assigned_by",
        "assigned_at"
    )
    list_filter = ("status", "assigned_by")
    search_fields = ("candidate_name_snapshot",)

    # Exclude sensitive fields completely from forms and displays
    exclude = (
        "secure_token_digest",
        "candidate_email_snapshot",
        "failure_code",
        "safe_failure_message"
    )

    # Disable admin bulk actions to prevent bypassing service transitions
    actions = None

    def get_readonly_fields(self, request, obj=None):
        return [
            field.name
            for field in self.model._meta.fields
            if field.name not in self.exclude
        ]


@admin.register(AssessmentSubmission)
class AssessmentSubmissionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "candidate_assessment",
        "attempt_number",
        "status",
        "uploaded_at"
    )
    # Hide notebook path in admin
    exclude = ("private_notebook",)

    def get_readonly_fields(self, request, obj=None):
        return [
            field.name
            for field in self.model._meta.fields
            if field.name not in self.exclude
        ]


admin.site.register(AssessmentResult)
admin.site.register(AssessmentQuestionResult)


@admin.register(AssessmentEmailDelivery)
class AssessmentEmailDeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "candidate_assessment",
        "send_attempt",
        "provider",
        "provider_message_id",
        "status",
        "masked_recipient_email",
        "requested_by",
        "requested_at"
    )
    list_filter = ("status", "provider")
    search_fields = ("provider_message_id", "recipient_email_snapshot")

    def masked_recipient_email(self, obj):
        email = obj.recipient_email_snapshot
        if not email:
            return ""
        if "@" not in email:
            return "***"
        try:
            local, domain = email.split("@", 1)
            if len(local) <= 2:
                return f"*{domain}"
            return f"{local[0]}***{local[-1]}@{domain}"
        except ValueError:
            return "***"
    masked_recipient_email.short_description = "Recipient Email"

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

