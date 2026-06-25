from rest_framework import permissions


class IsTemplateOwnerOrAdmin(permissions.BasePermission):
    """
    Permissions mapping for ScreenAI Assessment Templates:
    - Anonymous and candidate users: denied.
    - Active recruiter (HR role): allowed. May view/edit only templates they created.
    - Staff/superuser: allowed. May view all templates, but modify only if draft and they own it.
    """

    def has_permission(self, request, view):
        # Deny anonymous users
        if not request.user or not request.user.is_authenticated:
            return False
            
        # Deny candidate users
        if hasattr(request.user, "profile") and request.user.profile.role == "candidate":
            return False
            
        # Check active recruiter (HR) or staff/superuser
        is_hr = hasattr(request.user, "profile") and request.user.profile.role == "hr"
        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        
        return is_hr or is_staff_or_super

    def has_object_permission(self, request, view, obj):
        # Staff or superuser can view any template
        if request.user.is_staff or request.user.is_superuser:
            if request.method in permissions.SAFE_METHODS:
                return True
            # For writes, staff can only edit if they are the owner
            return obj.created_by == request.user

        # HR recruiters can only access their own templates (enforced by owner check)
        return obj.created_by == request.user
