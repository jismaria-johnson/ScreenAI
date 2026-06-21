from django.contrib.auth.models import User
from django.db import models, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import ValidationError

from accounts.models import Profile, AuditLog, UserSecurityState
from accounts.utils import log_audit
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
                "applicant_count": Application.objects.filter(job=job).count(),
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
                "application_status": app.application_status,
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

    @transaction.atomic
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

        progression = CandidateProgression.objects.create(
            application=application,
            stage=stage,
            notes=notes,
            updated_by=request.user,
            updater_role="admin" if (request.user.is_staff or request.user.is_superuser) else "hr"
        )
        
        log_audit(
            action="candidate_progression_created",
            actor=request.user,
            target_type="CandidateProgression",
            target_id=progression.id,
            target_label=str(progression),
            metadata={
                "recruiter_id": application.job.hr_user.id,
                "recruiter_username": application.job.hr_user.username,
                "job_id": application.job.id,
                "job_title": application.job.job_title,
                "application_id": application.id,
                "progression_id": progression.id,
                "stage": stage,
            },
            request=request
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

    @transaction.atomic
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
            
            previous_active = user.is_active
            user.is_active = not user.is_active
            user.save()

            security_state, _ = UserSecurityState.objects.select_for_update().get_or_create(user=user)
            if not user.is_active:
                security_state.token_version = F("token_version") + 1
                security_state.save()
                security_state.refresh_from_db()
                action = "recruiter_suspended"
            else:
                action = "recruiter_activated"

            log_audit(
                action=action,
                actor=request.user,
                target_type="User",
                target_id=user.id,
                target_label=user.username,
                metadata={
                    "username": user.username,
                    "role": "hr",
                    "previous_active": previous_active,
                    "new_active": user.is_active,
                },
                request=request
            )

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


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_username",
            "action",
            "target_type",
            "target_id",
            "target_label",
            "metadata",
            "ip_address",
            "user_agent",
            "created_at",
        ]


class ActivityLogPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminSystemActivityListView(generics.ListAPIView):
    """
    Returns a unified feed of recent administrative/recruitment activities on the platform.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]
    serializer_class = AuditLogSerializer
    pagination_class = ActivityLogPagination

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor").all().order_by("-created_at")

        # Apply filters
        action = self.request.query_params.get("action")
        actor = self.request.query_params.get("actor")
        target_id = self.request.query_params.get("target_id")
        target_type = self.request.query_params.get("target_type")
        recruiter_id = self.request.query_params.get("recruiter_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        search = self.request.query_params.get("search")

        if action:
            queryset = queryset.filter(action=action)
        if actor:
            if actor.isdigit():
                queryset = queryset.filter(actor_id=actor)
            else:
                queryset = queryset.filter(actor__username__iexact=actor)
        if target_id:
            queryset = queryset.filter(target_id=target_id)
        if target_type:
            queryset = queryset.filter(target_type=target_type)

        if recruiter_id:
            queryset = queryset.filter(
                models.Q(actor_id=recruiter_id) |
                models.Q(target_type="User", target_id=recruiter_id) |
                models.Q(metadata__recruiter_id=int(recruiter_id))
            )

        if date_from:
            import datetime
            parsed_from = parse_datetime(date_from) or parse_date(date_from)
            if parsed_from is None:
                raise ValidationError({"date_from": "Invalid date format. Use YYYY-MM-DD or ISO 8601 format."})
            if isinstance(parsed_from, datetime.date) and not isinstance(parsed_from, datetime.datetime):
                parsed_from = datetime.datetime.combine(parsed_from, datetime.time.min)
            if timezone.is_aware(timezone.now()) and timezone.is_naive(parsed_from):
                parsed_from = timezone.make_aware(parsed_from)
            queryset = queryset.filter(created_at__gte=parsed_from)

        if date_to:
            import datetime
            parsed_to = parse_datetime(date_to) or parse_date(date_to)
            if parsed_to is None:
                raise ValidationError({"date_to": "Invalid date format. Use YYYY-MM-DD or ISO 8601 format."})
            if isinstance(parsed_to, datetime.date) and not isinstance(parsed_to, datetime.datetime):
                parsed_to = datetime.datetime.combine(parsed_to, datetime.time.max)
            if timezone.is_aware(timezone.now()) and timezone.is_naive(parsed_to):
                parsed_to = timezone.make_aware(parsed_to)
            queryset = queryset.filter(created_at__lte=parsed_to)

        if search:
            queryset = queryset.filter(
                models.Q(action__icontains=search) |
                models.Q(actor__username__icontains=search) |
                models.Q(target_label__icontains=search) |
                models.Q(target_type__icontains=search)
            )

        return queryset


class AdminCandidateProgressionDetailView(APIView):
    """
    Allows system administrators to edit or delete any candidate progression entry.
    Accessible only by Admin users.
    """
    permission_classes = [IsAdminUser]

    @transaction.atomic
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

        log_audit(
            action="candidate_progression_updated",
            actor=request.user,
            target_type="CandidateProgression",
            target_id=progression.id,
            target_label=str(progression),
            metadata={
                "recruiter_id": progression.application.job.hr_user.id,
                "recruiter_username": progression.application.job.hr_user.username,
                "job_id": progression.application.job.id,
                "job_title": progression.application.job.job_title,
                "application_id": progression.application.id,
                "progression_id": progression.id,
                "stage": stage,
            },
            request=request
        )

        # Return the updated application with progressions nested
        serializer = HRApplicationSerializer(progression.application)
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request, pk):
        try:
            progression = CandidateProgression.objects.get(pk=pk)
        except CandidateProgression.DoesNotExist:
            return Response(
                {"detail": "Progression log not found."},
                status=404
            )

        application = progression.application
        progression_id = progression.id
        progression_label = str(progression)
        stage = progression.stage

        progression.delete()

        log_audit(
            action="candidate_progression_deleted",
            actor=request.user,
            target_type="CandidateProgression",
            target_id=progression_id,
            target_label=progression_label,
            metadata={
                "recruiter_id": application.job.hr_user.id,
                "recruiter_username": application.job.hr_user.username,
                "job_id": application.job.id,
                "job_title": application.job.job_title,
                "application_id": application.id,
                "progression_id": progression_id,
                "stage": stage,
            },
            request=request
        )

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

    @transaction.atomic
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

            security_state, _ = UserSecurityState.objects.select_for_update().get_or_create(user=user)
            security_state.must_change_password = True
            security_state.token_version = F("token_version") + 1
            security_state.save()
            security_state.refresh_from_db()

            log_audit(
                action="recruiter_password_reset",
                actor=request.user,
                target_type="User",
                target_id=user.id,
                target_label=user.username,
                metadata={
                    "username": user.username,
                    "role": "hr",
                },
                request=request
            )

            return Response({"detail": "Password reset successfully."})
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=404
            )


from django.db.models import OuterRef, Subquery, Count, IntegerField, Q, Case, When, Value, CharField
from django.db.models.functions import Coalesce, Concat
import datetime
from applications.models import CandidateIdentity
from applications.pagination import StandardPageNumberPagination
from applications.admin_serializers import AdminApplicationDirectorySerializer

class AdminApplicationDirectoryView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminApplicationDirectorySerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        latest_interview_qs = Interview.objects.filter(
            application=OuterRef('pk')
        ).order_by('-scheduled_at', '-id')

        latest_progression_qs = CandidateProgression.objects.filter(
            application=OuterRef('pk')
        ).order_by('-updated_at', '-id')

        queryset = Application.objects.select_related(
            'candidate_identity',
            'candidate',
            'candidate__profile',
            'job',
            'job__hr_user'
        ).annotate(
            interview_count=Coalesce(
                Subquery(
                    Interview.objects.filter(application=OuterRef('pk'))
                    .values('application')
                    .annotate(cnt=Count('id'))
                    .values('cnt')[:1],
                    output_field=IntegerField()
                ),
                0
            ),
            latest_interview_status=Subquery(latest_interview_qs.values('status')[:1]),
            latest_progression_stage=Subquery(latest_progression_qs.values('stage')[:1]),
            candidate_name_annotated=Case(
                When(
                    candidate__isnull=False,
                    then=Case(
                        When(
                            candidate__first_name__isnull=False,
                            candidate__last_name__isnull=False,
                            then=Concat(F("candidate__first_name"), Value(" "), F("candidate__last_name"))
                        ),
                        When(
                            candidate__first_name__isnull=False,
                            then=F("candidate__first_name")
                        ),
                        When(
                            candidate__last_name__isnull=False,
                            then=F("candidate__last_name")
                        ),
                        default=F("candidate__username"),
                        output_field=CharField()
                    )
                ),
                default=F("candidate_name"),
                output_field=CharField()
            )
        )

        params = self.request.query_params

        # 1. Search
        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(candidate__first_name__icontains=search) |
                Q(candidate__last_name__icontains=search) |
                Q(candidate__username__icontains=search) |
                Q(candidate__email__icontains=search) |
                Q(candidate_name__icontains=search) |
                Q(candidate_email__icontains=search) |
                Q(job__job_title__icontains=search) |
                Q(job__company_name__icontains=search) |
                Q(job__hr_user__username__icontains=search)
            )

        # 2. recruiter_id
        recruiter_id = params.get("recruiter_id")
        if recruiter_id:
            if not recruiter_id.isdigit() or int(recruiter_id) <= 0:
                raise ValidationError({"recruiter_id": "Recruiter ID must be a positive integer."})
            queryset = queryset.filter(job__hr_user_id=int(recruiter_id))

        # 3. job_id
        job_id = params.get("job_id")
        if job_id:
            if not job_id.isdigit() or int(job_id) <= 0:
                raise ValidationError({"job_id": "Job ID must be a positive integer."})
            queryset = queryset.filter(job_id=int(job_id))

        # 4. status
        status_val = params.get("status")
        if status_val:
            allowed_statuses = [x[0] for x in Application.STATUS_CHOICES]
            if status_val not in allowed_statuses:
                raise ValidationError({"status": f"Invalid status. Allowed values are: {', '.join(allowed_statuses)}"})
            queryset = queryset.filter(application_status=status_val)

        # 5. min_score / max_score
        min_score = params.get("min_score")
        max_score = params.get("max_score")
        
        parsed_min = None
        parsed_max = None

        if min_score:
            try:
                parsed_min = int(min_score)
                if not 0 <= parsed_min <= 100:
                    raise ValidationError({"min_score": "Min score must be between 0 and 100."})
            except ValueError:
                raise ValidationError({"min_score": "Min score must be a valid integer."})

        if max_score:
            try:
                parsed_max = int(max_score)
                if not 0 <= parsed_max <= 100:
                    raise ValidationError({"max_score": "Max score must be between 0 and 100."})
            except ValueError:
                raise ValidationError({"max_score": "Max score must be a valid integer."})

        if parsed_min is not None and parsed_max is not None and parsed_min > parsed_max:
            raise ValidationError({"min_score": "min_score cannot be greater than max_score."})

        if parsed_min is not None:
            queryset = queryset.filter(ai_score__isnull=False, ai_score__gte=parsed_min)
        if parsed_max is not None:
            queryset = queryset.filter(ai_score__isnull=False, ai_score__lte=parsed_max)

        # 6. is_registered
        is_registered = params.get("is_registered")
        if is_registered is not None:
            if is_registered.lower() not in ["true", "false"]:
                raise ValidationError({"is_registered": "is_registered must be either 'true' or 'false'."})
            val = is_registered.lower() == "true"
            queryset = queryset.filter(candidate__isnull=not val)

        # 7. Date range validation and parsing
        date_from_str = params.get("date_from")
        date_to_str = params.get("date_to")

        def parse_date_param(date_str, param_name):
            if not date_str:
                return None
            try:
                return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                raise ValidationError({param_name: f"Invalid date format for {param_name}. Use YYYY-MM-DD format."})

        date_from = parse_date_param(date_from_str, "date_from")
        date_to = parse_date_param(date_to_str, "date_to")

        if date_from and date_to and date_from > date_to:
            raise ValidationError({"non_field_errors": "date_from cannot be greater than date_to."})

        if date_from:
            dt_from = datetime.datetime.combine(date_from, datetime.time.min)
            if timezone.is_aware(timezone.now()):
                dt_from = timezone.make_aware(dt_from)
            queryset = queryset.filter(submitted_at__gte=dt_from)

        if date_to:
            dt_to = datetime.datetime.combine(date_to + datetime.timedelta(days=1), datetime.time.min)
            if timezone.is_aware(timezone.now()):
                dt_to = timezone.make_aware(dt_to)
            queryset = queryset.filter(submitted_at__lt=dt_to)

        # Ordering
        ordering = params.get("ordering")
        if ordering:
            field_name = ordering.lstrip("-")
            allowed_fields = ["submitted_at", "ai_score", "candidate_name", "job_title", "status"]
            if field_name not in allowed_fields:
                raise ValidationError({"ordering": f"Ordering by '{field_name}' is not supported."})
            
            mapping = {
                "submitted_at": "submitted_at",
                "ai_score": "ai_score",
                "candidate_name": "candidate_name_annotated",
                "job_title": "job__job_title",
                "status": "application_status",
            }
            mapped_field = mapping[field_name]
            direction = "-" if ordering.startswith("-") else ""
            queryset = queryset.order_by(f"{direction}{mapped_field}", "-id")
        else:
            queryset = queryset.order_by("-submitted_at", "-id")

        return queryset



