from rest_framework import serializers

from .models import Job


class JobSerializer(serializers.ModelSerializer):
    hr_username = serializers.CharField(
        source="hr_user.username",
        read_only=True,
    )

    applicant_count = serializers.IntegerField(
        read_only=True,
        default=0,
    )

    class Meta:
        model = Job
        fields = [
            "id",
            "hr_user",
            "hr_username",
            "job_title",
            "company_name",
            "job_description",
            "required_skills",
            "required_experience",
            "location",
            "status",
            "application_token",
            "application_form_enabled",
            "application_deadline",
            "applicant_count",
            "created_at",
        ]

        read_only_fields = [
            "hr_user",
            "application_token",
            "applicant_count",
            "created_at",
        ]


class PublicJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
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