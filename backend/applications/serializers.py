from rest_framework import serializers
from .models import Application


class ApplicationSerializer(serializers.ModelSerializer):
    candidate_username = serializers.CharField(source="candidate.username", read_only=True)
    job_title = serializers.CharField(source="job.job_title", read_only=True)
    company_name = serializers.CharField(source="job.company_name", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id",
            "candidate",
            "candidate_username",
            "job",
            "job_title",
            "company_name",
            "resume",
            "extracted_resume_text",
            "ai_score",
            "matched_skills",
            "missing_skills",
            "experience_match",
            "ai_feedback",
            "recommendation",
            "application_status",
            "submitted_at",
        ]
        read_only_fields = [
            "candidate",
            "extracted_resume_text",
            "ai_score",
            "matched_skills",
            "missing_skills",
            "experience_match",
            "ai_feedback",
            "recommendation",
            "application_status",
            "submitted_at",
        ]