from rest_framework import serializers

from .models import Application


class ApplicationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = [
            "id",
            "job",
            "resume",
        ]
        read_only_fields = ["id"]


class CandidateApplicationSerializer(serializers.ModelSerializer):
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


class HRApplicationSerializer(serializers.ModelSerializer):
    candidate_username = serializers.CharField(
        source="candidate.username",
        read_only=True,
    )

    candidate_first_name = serializers.CharField(
        source="candidate.first_name",
        read_only=True,
    )

    candidate_last_name = serializers.CharField(
        source="candidate.last_name",
        read_only=True,
    )

    candidate_email = serializers.EmailField(
        source="candidate.email",
        read_only=True,
    )

    candidate_phone = serializers.CharField(
        source="candidate.profile.phone",
        read_only=True,
    )

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
            "candidate",
            "candidate_username",
            "candidate_first_name",
            "candidate_last_name",
            "candidate_email",
            "candidate_phone",
            "job",
            "job_title",
            "company_name",
            "resume",
            "ai_score",
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
        ]

        read_only_fields = fields