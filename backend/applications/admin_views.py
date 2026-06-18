from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Profile
from applications.models import Application, CandidateProgression, Interview
from applications.serializers import HRApplicationSerializer, InterviewSerializer
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
                "created_at": job.created_at,
                "candidates_count": Application.objects.filter(job=job).count(),
            } for job in jobs_query]
            
            jobs_count = len(jobs_list)
            hired_count = Application.objects.filter(
                job__hr_user=user,
                application_status="hired"
            ).count()
            applications_count = Application.objects.filter(
                job__hr_user=user
            ).count()
            pending_apps_query = Application.objects.filter(
                job__hr_user=user,
                application_status="pending"
            ).order_by("-submitted_at")
            pending_applications_count = pending_apps_query.count()
            
            pending_applications_list = [{
                "id": app.id,
                "candidate_name": app.candidate_name,
                "job_title": app.job.job_title,
                "company_name": app.job.company_name,
                "submitted_at": app.submitted_at,
                "ai_score": app.ai_score,
            } for app in pending_apps_query]
            
            hr_data.append({
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "phone": profile.phone,
                "is_active": user.is_active,
                "last_login": user.last_login,
                "jobs_count": jobs_count,
                "hired_count": hired_count,
                "applications_count": applications_count,
                "pending_applications_count": pending_applications_count,
                "jobs_list": jobs_list,
                "pending_applications_list": pending_applications_list,
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

        # 4. Recent interviews (top 15)
        recent_interviews = Interview.objects.select_related("application", "application__job").order_by("-updated_at")[:15]
        for interview in recent_interviews:
            candidate_name = interview.application.candidate_name
            if not candidate_name and interview.application.candidate:
                candidate_name = interview.application.candidate.username
            
            # Determine type
            if interview.status == "completed":
                if interview.completed_at and interview.updated_at > interview.completed_at:
                    ev_type = "interview_feedback_updated"
                    msg = f"Interview round {interview.round_number} ({interview.round_name}) feedback updated for candidate '{candidate_name}'."
                else:
                    ev_type = "interview_completed"
                    msg = f"Interview round {interview.round_number} ({interview.round_name}) completed for candidate '{candidate_name}'."
            elif interview.status == "cancelled":
                ev_type = "interview_cancelled"
                msg = f"Interview round {interview.round_number} ({interview.round_name}) cancelled for candidate '{candidate_name}'."
            elif interview.status == "no_show":
                ev_type = "interview_no_show"
                msg = f"Interview round {interview.round_number} ({interview.round_name}) marked as no-show for candidate '{candidate_name}'."
            else:
                is_rescheduled = False
                if interview.created_at and interview.updated_at:
                    delta = (interview.updated_at - interview.created_at).total_seconds()
                    if delta > 2:
                        is_rescheduled = True
                
                if is_rescheduled:
                    ev_type = "interview_rescheduled"
                    msg = f"Interview round {interview.round_number} ({interview.round_name}) rescheduled for candidate '{candidate_name}'."
                else:
                    ev_type = "interview_scheduled"
                    msg = f"Interview round {interview.round_number} ({interview.round_name}) scheduled for candidate '{candidate_name}'."

            activities.append({
                "id": f"interview_{interview.id}_{ev_type}",
                "timestamp": interview.updated_at,
                "type": ev_type,
                "message": msg,
                "details": {
                    "interview_id": interview.id,
                    "round_number": interview.round_number,
                    "round_name": interview.round_name,
                    "candidate": candidate_name
                }
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


class AdminInterviewsListView(generics.ListAPIView):
    """
    Returns all interviews in the system with filters and metrics for Admin dashboard monitoring.
    """
    permission_classes = [IsAdminUser]
    serializer_class = InterviewSerializer

    def get_queryset(self):
        from django.db import models
        queryset = Interview.objects.select_related(
            "application", "application__job", "application__job__hr_user", "created_by"
        ).order_by("-scheduled_at")
        
        # Apply filters
        hr_id = self.request.query_params.get("recruiter")
        job_id = self.request.query_params.get("job")
        status_val = self.request.query_params.get("status")
        type_val = self.request.query_params.get("type")
        search = self.request.query_params.get("search")
        
        if hr_id:
            queryset = queryset.filter(application__job__hr_user_id=hr_id)
        if job_id:
            queryset = queryset.filter(application__job_id=job_id)
        if status_val:
            queryset = queryset.filter(status=status_val)
        if type_val:
            queryset = queryset.filter(interview_type=type_val)
        if search:
            queryset = queryset.filter(
                models.Q(application__candidate_name__icontains=search) |
                models.Q(application__candidate__username__icontains=search) |
                models.Q(interviewer_name__icontains=search)
            )
            
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        # Calculate metrics (overall in system, not paginated)
        all_interviews = Interview.objects.all()
        now = timezone.now()
        
        metrics = {
            "total": all_interviews.count(),
            "scheduled": all_interviews.filter(status="scheduled").count(),
            "completed": all_interviews.filter(status="completed").count(),
            "cancelled": all_interviews.filter(status="cancelled").count(),
            "no_show": all_interviews.filter(status="no_show").count(),
            "upcoming": all_interviews.filter(status="scheduled", scheduled_at__gt=now).count(),
        }
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response({
                "metrics": metrics,
                "results": serializer.data
            })
            
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            "metrics": metrics,
            "results": serializer.data
        })


class AdminResetHRPasswordView(APIView):
    """
    Resets a recruiter's password.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
            # Verify they are actually a recruiter (has Profile with role='hr')
            profile = getattr(user, "profile", None)
            if not profile or profile.role != "hr":
                return Response(
                    {"detail": "User is not a registered HR recruiter."},
                    status=400
                )
            
            password = request.data.get("password", "").strip()
            if not password or len(password) < 6:
                return Response(
                    {"detail": "Password must be at least 6 characters long."},
                    status=400
                )
            
            user.set_password(password)
            user.save()
            return Response({"detail": "Password reset successfully."})
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=404
            )


