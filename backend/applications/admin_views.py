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
    Allows access only to superusers or users with 'admin' role in their Profile.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or (
                    hasattr(request.user, "profile")
                    and request.user.profile.role == "admin"
                )
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
        if request.user.is_superuser or (
            hasattr(request.user, "profile")
            and request.user.profile.role == "admin"
        ):
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
            jobs_count = Job.objects.filter(hr_user=user).count()
            hired_count = Application.objects.filter(
                job__hr_user=user,
                application_status="hired"
            ).count()
            
            hr_data.append({
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "phone": profile.phone,
                "jobs_count": jobs_count,
                "hired_count": hired_count,
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
            notes=notes
        )
        
        # Return the updated application with progressions nested
        serializer = HRApplicationSerializer(application)
        return Response(serializer.data)
