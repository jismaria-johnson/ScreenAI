from rest_framework import permissions


class IsCandidateUser(permissions.BasePermission):
    """
    Allows access only to candidate users.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "profile")
            and request.user.profile.role == "candidate"
        )


class IsHRUser(permissions.BasePermission):
    """
    Allows access only to HR users.
    """

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "profile")
            and request.user.profile.role == "hr"
        )


class IsAdminOrHiringHRForInterview(permissions.BasePermission):
    """
    For applications: Admin can access, or HR who owns the job.
    For interviews: Admin can access (read-only), or HR who owns the interview's application's job.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Staff/superuser can view only
        if request.user.is_staff or request.user.is_superuser:
            if request.method in permissions.SAFE_METHODS:
                return True
            return False

        # HR has access
        return hasattr(request.user, "profile") and request.user.profile.role == "hr"

    def has_object_permission(self, request, view, obj):
        # Admin can view
        if request.user.is_staff or request.user.is_superuser:
            return request.method in permissions.SAFE_METHODS

        # HR ownership check
        from .models import Application, Interview
        if isinstance(obj, Application):
            return obj.job.hr_user == request.user
        elif isinstance(obj, Interview):
            return obj.application.job.hr_user == request.user
        return False