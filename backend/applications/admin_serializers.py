from rest_framework import serializers
from applications.models import Application

class AdminApplicationDirectorySerializer(serializers.ModelSerializer):
    candidate_uuid = serializers.SerializerMethodField()
    identity_type = serializers.SerializerMethodField()
    candidate_contact = serializers.SerializerMethodField()
    job = serializers.SerializerMethodField()
    recruiter = serializers.SerializerMethodField()
    status = serializers.CharField(source="application_status")
    interview_count = serializers.IntegerField(read_only=True, default=0)
    latest_interview_status = serializers.CharField(read_only=True, default=None)
    latest_progression_stage = serializers.CharField(read_only=True, default=None)
    resume_available = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "candidate_uuid",
            "identity_type",
            "candidate_contact",
            "job",
            "recruiter",
            "status",
            "ai_score",
            "recommendation",
            "submitted_at",
            "interview_count",
            "latest_interview_status",
            "latest_progression_stage",
            "resume_available"
        ]

    def get_candidate_uuid(self, obj):
        if obj.candidate_identity:
            return obj.candidate_identity.uuid
        return None

    def get_identity_type(self, obj):
        if obj.candidate_identity:
            return obj.candidate_identity.identity_type
        if obj.candidate:
            return "registered"
        if obj.candidate_email:
            return "public"
        return "anonymous"

    def get_candidate_contact(self, obj):
        if obj.candidate_id is not None:
            user = obj.candidate
            full_name = f"{user.first_name} {user.last_name}".strip()
            name = full_name if full_name else user.username
            email = user.email
            phone = getattr(user.profile, "phone", "") if hasattr(user, "profile") else ""
        else:
            name = obj.candidate_name
            email = obj.candidate_email
            phone = obj.candidate_phone

        return {
            "name": name,
            "email": email,
            "phone": phone
        }

    def get_job(self, obj):
        return {
            "id": obj.job.id,
            "title": obj.job.job_title,
            "company": obj.job.company_name
        }

    def get_recruiter(self, obj):
        hr = obj.job.hr_user
        full_name = f"{hr.first_name} {hr.last_name}".strip()
        name = full_name if full_name else hr.username
        return {
            "id": hr.id,
            "name": name,
            "username": hr.username
        }

    def get_resume_available(self, obj):
        return bool(obj.resume)
