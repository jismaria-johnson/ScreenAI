from rest_framework import serializers
from applications.models import Application, CandidateIdentity, Interview, CandidateProgression
from accounts.models import AuditLog

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
    resume_url = serializers.SerializerMethodField()

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
            "resume_available",
            "resume_url"
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

    def get_resume_url(self, obj):
        if not obj.resume:
            return None
        return f"/applications/admin/directory/{obj.id}/resume/"


class AdminCandidateDirectorySerializer(serializers.ModelSerializer):
    candidate_uuid = serializers.UUIDField(source="uuid")
    total_applications = serializers.IntegerField(read_only=True)
    matching_application_count = serializers.IntegerField(read_only=True)
    highest_score = serializers.IntegerField(read_only=True)
    latest_score = serializers.IntegerField(read_only=True)
    interview_count = serializers.IntegerField(read_only=True)
    hired_state = serializers.BooleanField(read_only=True)
    latest_progression_stage = serializers.CharField(read_only=True)

    candidate_contact = serializers.SerializerMethodField()
    latest_application = serializers.SerializerMethodField()
    jobs = serializers.SerializerMethodField()
    recruiters = serializers.SerializerMethodField()

    class Meta:
        model = CandidateIdentity
        fields = [
            "candidate_uuid",
            "identity_type",
            "candidate_contact",
            "total_applications",
            "matching_application_count",
            "latest_application",
            "highest_score",
            "latest_score",
            "jobs",
            "recruiters",
            "interview_count",
            "hired_state",
            "latest_progression_stage"
        ]

    def get_candidate_contact(self, obj):
        if obj.identity_type == "registered" and obj.candidate_user:
            user = obj.candidate_user
            full_name = f"{user.first_name} {user.last_name}".strip()
            name = full_name if full_name else user.username
            email = user.email
            phone = getattr(user.profile, "phone", "") if hasattr(user, "profile") else ""
        else:
            name = getattr(obj, "latest_app_name", "")
            email = getattr(obj, "latest_app_email", "")
            phone = getattr(obj, "latest_app_phone", "")

        return {
            "name": name or "",
            "email": email or "",
            "phone": phone or ""
        }

    def get_latest_application(self, obj):
        latest_id = getattr(obj, "latest_application_id", None)
        if not latest_id:
            return None
        
        job_id = getattr(obj, "latest_job_id", None)
        job_title = getattr(obj, "latest_job_title", "")
        job_company = getattr(obj, "latest_job_company", "")

        return {
            "id": latest_id,
            "date": getattr(obj, "latest_application_date", None),
            "status": getattr(obj, "latest_application_status", None),
            "job": {
                "id": job_id,
                "title": job_title,
                "company": job_company
            } if job_id else None
        }

    def get_jobs(self, obj):
        jobs_map = self.context.get("jobs_map", {})
        return jobs_map.get(obj.id, [])

    def get_recruiters(self, obj):
        recruiters_map = self.context.get("recruiters_map", {})
        return recruiters_map.get(obj.id, [])


class AdminCandidateSummarySerializer(serializers.ModelSerializer):
    candidate_uuid = serializers.UUIDField(source="uuid")
    candidate_contact = serializers.SerializerMethodField()
    applications_url = serializers.SerializerMethodField()
    activity_url = serializers.SerializerMethodField()

    total_applications = serializers.IntegerField(read_only=True, default=0)
    latest_application_id = serializers.IntegerField(read_only=True, default=None)
    latest_application_date = serializers.DateTimeField(read_only=True, default=None)
    highest_score = serializers.IntegerField(read_only=True, default=None)
    latest_score = serializers.IntegerField(read_only=True, default=None)
    interview_count = serializers.IntegerField(read_only=True, default=0)
    hired_state = serializers.BooleanField(read_only=True, default=False)
    latest_progression_stage = serializers.CharField(read_only=True, default=None)

    class Meta:
        model = CandidateIdentity
        fields = [
            "candidate_uuid",
            "identity_type",
            "candidate_contact",
            "total_applications",
            "latest_application_id",
            "latest_application_date",
            "highest_score",
            "latest_score",
            "interview_count",
            "hired_state",
            "latest_progression_stage",
            "applications_url",
            "activity_url"
        ]

    def get_candidate_contact(self, obj):
        if obj.identity_type == "registered" and obj.candidate_user:
            user = obj.candidate_user
            full_name = f"{user.first_name} {user.last_name}".strip()
            name = full_name if full_name else user.username
            email = user.email
            phone = getattr(user.profile, "phone", "") if hasattr(user, "profile") else ""
            education = getattr(user.profile, "education", "") if hasattr(user, "profile") else ""
        else:
            name = getattr(obj, "latest_app_name", "")
            email = getattr(obj, "latest_app_email", "")
            phone = getattr(obj, "latest_app_phone", "")
            education = getattr(obj, "latest_app_education", "")

        return {
            "name": name or "",
            "email": email or "",
            "phone": phone or "",
            "education": education or ""
        }

    def get_applications_url(self, obj):
        return f"/applications/admin/candidates/{obj.uuid}/applications/"

    def get_activity_url(self, obj):
        return f"/applications/admin/candidates/{obj.uuid}/activity/"


class AdminApplicationDetailSerializer(serializers.ModelSerializer):
    candidate_uuid = serializers.SerializerMethodField()
    identity_type = serializers.SerializerMethodField()
    candidate_contact = serializers.SerializerMethodField()
    job = serializers.SerializerMethodField()
    recruiter = serializers.SerializerMethodField()
    application = serializers.SerializerMethodField()
    ai_evaluation = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()
    interviews_url = serializers.SerializerMethodField()
    progressions_url = serializers.SerializerMethodField()
    resume_url = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "candidate_uuid",
            "identity_type",
            "candidate_contact",
            "job",
            "recruiter",
            "application",
            "ai_evaluation",
            "counts",
            "interviews_url",
            "progressions_url",
            "resume_url"
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
            education = getattr(user.profile, "education", "") if hasattr(user, "profile") else ""
        else:
            name = obj.candidate_name
            email = obj.candidate_email
            phone = obj.candidate_phone
            education = obj.candidate_education

        return {
            "name": name or "",
            "email": email or "",
            "phone": phone or "",
            "education": education or "",
            "total_experience_years": obj.total_experience_years,
            "worked_companies": obj.worked_companies or ""
        }

    def get_job(self, obj):
        job = obj.job
        return {
            "id": job.id,
            "title": job.job_title,
            "company": job.company_name,
            "location": job.location,
            "required_experience": job.required_experience,
            "status": job.status,
            "is_archived": getattr(job, "is_archived", False)
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

    def get_application(self, obj):
        return {
            "status": obj.application_status,
            "submitted_at": obj.submitted_at,
            "resume_available": bool(obj.resume)
        }

    def get_ai_evaluation(self, obj):
        def parse_skills(skills_str):
            if not skills_str:
                return []
            return [s.strip() for s in skills_str.split(",") if s.strip()]

        return {
            "overall_score": obj.ai_score,
            "recommendation": obj.recommendation,
            "feedback": obj.ai_feedback or "",
            "components": {
                "skills": {
                    "score": obj.skills_score,
                    "maximum": 30,
                    "reason": obj.skills_reason or ""
                },
                "experience": {
                    "score": obj.experience_score,
                    "maximum": 25,
                    "reason": obj.experience_score_reason or "",
                    "summary": obj.experience_summary or ""
                },
                "projects": {
                    "score": obj.projects_score,
                    "maximum": 20,
                    "reason": obj.projects_score_reason or "",
                    "summary": obj.project_summary or ""
                },
                "company_role_fit": {
                    "score": obj.company_role_score,
                    "maximum": 10,
                    "reason": obj.company_role_score_reason or ""
                },
                "education": {
                    "score": obj.education_score,
                    "maximum": 5,
                    "reason": obj.education_score_reason or "",
                    "summary": obj.education_summary or ""
                },
                "relevance": {
                    "score": obj.relevance_score,
                    "maximum": 10,
                    "reason": obj.relevance_score_reason or ""
                }
            },
            "matched_skills": parse_skills(obj.matched_skills),
            "missing_skills": parse_skills(obj.missing_skills)
        }

    def get_counts(self, obj):
        return {
            "interviews": getattr(obj, "interviews_count_annotated", 0),
            "progressions": getattr(obj, "progressions_count_annotated", 0)
        }

    def get_interviews_url(self, obj):
        return f"/applications/admin/directory/{obj.id}/interviews/"

    def get_progressions_url(self, obj):
        return f"/applications/admin/directory/{obj.id}/progressions/"

    def get_resume_url(self, obj):
        if not obj.resume:
            return None
        return f"/applications/admin/directory/{obj.id}/resume/"


class AdminInterviewDetailSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)

    class Meta:
        model = Interview
        fields = [
            "id",
            "round_name",
            "round_number",
            "interview_type",
            "scheduled_at",
            "duration_minutes",
            "location_or_meeting_link",
            "interviewer_name",
            "interviewer_email",
            "status",
            "technical_rating",
            "communication_rating",
            "problem_solving_rating",
            "culture_fit_rating",
            "overall_rating",
            "feedback",
            "recommendation",
            "created_at",
            "updated_at",
            "completed_at",
            "created_by_username"
        ]


class AdminCandidateProgressionSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True, default=None)

    class Meta:
        model = CandidateProgression
        fields = [
            "id",
            "stage",
            "notes",
            "updated_at",
            "updated_by_username",
            "updater_role"
        ]


class AdminCandidateActivitySerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    safe_metadata = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "actor",
            "target_type",
            "target_label",
            "safe_metadata",
            "created_at"
        ]

    def get_actor(self, obj):
        if not obj.actor:
            return None
        role = "unknown"
        profile = getattr(obj.actor, "profile", None)
        if profile:
            role = profile.role
        elif obj.actor.is_superuser or obj.actor.is_staff:
            role = "admin"
        return {
            "username": obj.actor.username,
            "role": role
        }

    def get_safe_metadata(self, obj):
        meta = obj.metadata or {}
        allowed_keys = {
            "application_id", "job_id", "old_status", "new_status",
            "stage", "notes", "recruiter_id", "recruiter_username",
            "job_title", "progression_id", "round_name", "round_number",
            "interview_id", "interview_type", "status", "recommendation"
        }
        return {k: v for k, v in meta.items() if k in allowed_keys}


