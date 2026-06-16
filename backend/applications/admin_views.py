from django.contrib.auth.models import User
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Profile
from applications.models import Application, CandidateProgression
from applications.serializers import HRApplicationSerializer
from jobs.models import Job


class IsAdminUser(permissions.BasePermission):
    """
    Allows access only to superusers or staff users.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_staff
                or request.user.is_superuser
            )
        )


class IsAdminOrHiringHR(permissions.BasePermission):
    """
    Allows access to Admin users or the HR user who posted the job for the application.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Admin check
        if request.user.is_staff or request.user.is_superuser:
            return True
            
        # Hiring HR check
        app_id = view.kwargs.get("pk")
        try:
            application = Application.objects.get(pk=app_id)
            return application.job.hr_user == request.user
        except Application.DoesNotExist:
            return False


class AdminHRListView(APIView):
    """
    Returns a list of all HRs along with their metrics:
    - Number of jobs posted
    - Number of candidates hired
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        hr_profiles = Profile.objects.filter(role="hr").select_related("user")
        hr_data = []
        
        for profile in hr_profiles:
            user = profile.user
            jobs_query = Job.objects.filter(hr_user=user).order_by("-created_at")
            jobs_list = [{
                "id": job.id,
                "job_title": job.job_title,
                "company_name": job.company_name,
                "status": job.status,
                "created_at": job.created_at
            } for job in jobs_query]
            
            jobs_count = len(jobs_list)
            hired_count = Application.objects.filter(
                job__hr_user=user,
                application_status="hired"
            ).count()
            applications_count = Application.objects.filter(
                job__hr_user=user
            ).count()
            
            hr_data.append({
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "phone": profile.phone,
                "is_active": user.is_active,
                "jobs_count": jobs_count,
                "hired_count": hired_count,
                "applications_count": applications_count,
                "jobs_list": jobs_list,
            })
            
        return Response(hr_data)


class AdminHiredCandidatesListView(generics.ListAPIView):
    """
    Returns all applications that are currently marked as "hired",
    including full progression histories.
    """
    permission_classes = [IsAdminUser]
    serializer_class = HRApplicationSerializer

    def get_queryset(self):
        return Application.objects.filter(
            application_status="hired"
        ).select_related(
            "job",
            "candidate",
            "job__hr_user"
        ).prefetch_related(
            "progressions"
        ).order_by("-submitted_at")


class AdminCandidateProgressionCreateView(APIView):
    """
    Creates a new CandidateProgression entry for a hired application.
    Accessible by Admin or the HR user who posted the job.
    """
    permission_classes = [IsAdminOrHiringHR]

    def post(self, request, pk):
        try:
            application = Application.objects.get(pk=pk)
        except Application.DoesNotExist:
            return Response(
                {"detail": "Application not found."},
                status=404
            )

        stage = request.data.get("stage", "").strip()
        notes = request.data.get("notes", "").strip()

        if not stage:
            return Response(
                {"detail": "Stage name is required."},
                status=400
            )

        CandidateProgression.objects.create(
            application=application,
            stage=stage,
            notes=notes,
            updated_by=request.user,
            updater_role="admin" if (request.user.is_staff or request.user.is_superuser) else "hr"
        )
        
        # Return the updated application with progressions nested
        serializer = HRApplicationSerializer(application)
        return Response(serializer.data)


class AdminToggleHRActiveView(APIView):
    """
    Toggles a recruiter's active status (user.is_active) on or off.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            # Ensure we don't deactivate superusers or staff
            if user.is_superuser or user.is_staff:
                return Response(
                    {"detail": "Cannot deactivate administrative accounts."},
                    status=400
                )
            
            # Verify they are actually a recruiter (has Profile with role='hr')
            profile = getattr(user, "profile", None)
            if not profile or profile.role != "hr":
                return Response(
                    {"detail": "User is not a registered HR recruiter."},
                    status=400
                )
            
            user.is_active = not user.is_active
            user.save()
            return Response({
                "id": user.id,
                "username": user.username,
                "is_active": user.is_active
            })
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=404
            )


class AdminSystemActivityListView(APIView):
    """
    Returns a unified feed of recent administrative/recruitment activities on the platform.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        activities = []
        
        # 1. Recent job postings (top 10)
        recent_jobs = Job.objects.select_related("hr_user").order_by("-created_at")[:10]
        for job in recent_jobs:
            activities.append({
                "id": f"job_{job.id}",
                "timestamp": job.created_at,
                "type": "job_created",
                "message": f"HR Recruiter @{job.hr_user.username} posted a new job: '{job.job_title}' at '{job.company_name}'.",
                "details": {"job_id": job.id, "title": job.job_title}
            })

        # 2. Recent applications submitted (top 15)
        recent_applications = Application.objects.select_related("job", "job__hr_user").order_by("-submitted_at")[:15]
        for app in recent_applications:
            activities.append({
                "id": f"app_{app.id}",
                "timestamp": app.submitted_at,
                "type": "application_submitted",
                "message": f"Candidate '{app.candidate_name}' applied for '{app.job.job_title}' (posted by @{app.job.hr_user.username}). AI Score: {app.ai_score or 'Not evaluated'}.",
                "details": {"app_id": app.id, "job_title": app.job.job_title, "candidate": app.candidate_name}
            })

        # 3. Recent candidate progression stage updates (top 15)
        recent_progressions = CandidateProgression.objects.select_related("application", "application__job").order_by("-updated_at")[:15]
        for prog in recent_progressions:
            activities.append({
                "id": f"prog_{prog.id}",
                "timestamp": prog.updated_at,
                "type": "progression_updated",
                "message": f"Candidate '{prog.application.candidate_name}' progression updated to '{prog.stage}' for job '{prog.application.job.job_title}' (Notes: {prog.notes or 'None'}).",
                "details": {"prog_id": prog.id, "stage": prog.stage}
            })

        # Sort activities by timestamp descending
        activities.sort(key=lambda x: x["timestamp"], reverse=True)
        # Limit to top 30 global activities
        return Response(activities[:30])


class AdminCandidateProgressionDetailView(APIView):
    """
    Allows system administrators to edit or delete any candidate progression entry.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            progression = CandidateProgression.objects.get(pk=pk)
        except CandidateProgression.DoesNotExist:
            return Response(
                {"detail": "Progression log not found."},
                status=404
            )

        stage = request.data.get("stage", "").strip()
        notes = request.data.get("notes", "").strip()

        if not stage:
            return Response(
                {"detail": "Stage name is required."},
                status=400
            )

        progression.stage = stage
        progression.notes = notes
        progression.updated_by = request.user
        progression.updater_role = "admin"
        progression.save()

        # Return the updated application with progressions nested
        serializer = HRApplicationSerializer(progression.application)
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            progression = CandidateProgression.objects.get(pk=pk)
        except CandidateProgression.DoesNotExist:
            return Response(
                {"detail": "Progression log not found."},
                status=404
            )

        application = progression.application
        progression.delete()

        # Return the updated application with progressions nested
        serializer = HRApplicationSerializer(application)
        return Response(serializer.data)
