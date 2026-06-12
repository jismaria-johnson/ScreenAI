from rest_framework import serializers

from .models import Job


class JobSerializer(serializers.ModelSerializer):
    hr_username = serializers.CharField(
        source="hr_user.username",
        read_only=True
    )
    applicant_count = serializers.IntegerField(
        read_only=True
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
            "applicant_count",
            "created_at",
        ]
        read_only_fields = [
            "hr_user",
            "applicant_count",
            "created_at",
        ]