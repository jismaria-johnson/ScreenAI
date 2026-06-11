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