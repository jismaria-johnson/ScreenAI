from django.http import Http404
from django.db import transaction, models
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler
from applications.pagination import StandardPageNumberPagination

from .models import AssessmentTemplate, AssessmentQuestion, CandidateAssessment, AssessmentEmailDelivery
from .serializers import (
    AssessmentTemplateSerializer,
    AssessmentQuestionSerializer,
    CandidateSafePreviewSerializer,
    CandidateAssessmentAssignmentSerializer,
    CandidateAssessmentDetailSerializer,
    CandidateAccessSerializer,
    AssessmentSubmissionSerializer,
    AssessmentResultSerializer,
)
from .services import (
    create_assessment_template,
    update_assessment_template,
    add_assessment_question,
    update_assessment_question,
    delete_assessment_question,
    reorder_assessment_questions,
    activate_assessment_template,
    archive_assessment_template,
    clone_assessment_template,
    delete_assessment_template,
    assign_and_send_assessment,
    resend_assessment_invitation,
    normalize_message_id,
    get_and_start_assessment_by_token,
    generate_candidate_notebook,
    save_candidate_upload,
    save_candidate_answers,
    submit_candidate_assessment,
    queue_submission_for_evaluation,
    trigger_evaluation_in_background,
    retry_failed_assessment,
    run_candidate_visible_tests,
)
from .permissions import IsTemplateOwnerOrAdmin
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.conf import settings
from accounts.utils import log_audit
from django.utils import timezone
import hmac
import logging

logger = logging.getLogger(__name__)


def custom_assessment_exception_handler(exc, context):
    # If a Django ValidationError occurs, convert it to a DRF ValidationError
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        code = "validation_failed"
        detail_msg = str(detail)
        
        if isinstance(detail, list) and detail:
            detail_msg = detail[0]
        elif isinstance(detail, dict) and detail:
            first_key = list(detail.keys())[0]
            first_val = detail[first_key]
            if isinstance(first_val, list) and first_val:
                first_val = first_val[0]
            detail_msg = f"{first_key}: {first_val}"
            
        if hasattr(exc, "error_list") and exc.error_list:
            code = getattr(exc.error_list[0], "code", "validation_failed") or "validation_failed"
        elif hasattr(exc, "code") and exc.code:
            code = exc.code or "validation_failed"
            
        # Map Django service validation errors to correct stable error codes
        if code in ("validation_failed", "invalid"):
            if "Active or archived templates cannot be structurally updated" in detail_msg or \
               "Cannot add questions to an active or archived template" in detail_msg or \
               "Cannot edit questions of an active or archived template" in detail_msg or \
               "Cannot delete questions of an active or archived template" in detail_msg or \
               "Cannot reorder questions of an active or archived template" in detail_msg or \
               "Only draft templates can be modified" in detail_msg or \
               "Only draft templates can be deleted" in detail_msg:
                code = "template_not_editable"
            elif "Only active templates can be archived" in detail_msg:
                code = "version_conflict"
            elif "Cannot delete template referenced by assignments" in detail_msg:
                code = "protected_template_deletion"
            elif "Question display orders must be unique and contiguous" in detail_msg:
                code = "invalid_question_ordering"
            elif "Cannot activate template with zero questions" in detail_msg or \
                 "Total marks of activated template must be positive" in detail_msg or \
                 "Question hidden tests cannot be blank upon activation" in detail_msg:
                code = "activation_validation_failed"
            elif "Invitation delivery will be available after candidate assessment access is configured" in detail_msg:
                code = "assessment_invitations_disabled"
            elif "An assessment invitation delivery is currently in progress" in detail_msg:
                code = "assessment_delivery_in_progress"
            
        exc = DRFValidationError(detail=detail_msg, code=code)

    response = exception_handler(exc, context)
    
    if response is not None:
        # If response already has our format, return it
        if isinstance(response.data, dict) and "code" in response.data:
            return response
            
        detail = response.data
        code = "validation_failed"
        
        if hasattr(exc, "get_codes"):
            codes = exc.get_codes()
            if isinstance(codes, dict) and codes:
                first_key = list(codes.keys())[0]
                code = codes[first_key]
                if isinstance(code, list) and code:
                    code = code[0]
            elif isinstance(codes, str):
                code = codes
            elif isinstance(codes, list) and codes:
                code = codes[0]
                
        if response.status_code == 403:
            code = "permission_denied"
            detail = "Permission denied."
        elif response.status_code == 404:
            code = "template_not_found"
            detail = "Template not found."
        elif response.status_code == 400:
            if code == "invalid":
                code = "validation_failed"
                
        if isinstance(detail, dict):
            # Try to extract the first key's message
            first_key = list(detail.keys())[0]
            first_val = detail[first_key]
            if isinstance(first_val, list) and first_val:
                first_val = first_val[0]
            detail = f"{first_key}: {first_val}"
        elif isinstance(detail, list) and detail:
            detail = detail[0]
            
        response.data = {
            "code": str(code),
            "detail": str(detail)
        }
        
    return response


class AssessmentBaseView(generics.GenericAPIView):
    permission_classes = [IsTemplateOwnerOrAdmin]
    
    def get_exception_handler(self):
        return custom_assessment_exception_handler


class AssessmentTemplateListCreateView(AssessmentBaseView):
    serializer_class = AssessmentTemplateSerializer
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
            
        if user.is_superuser or user.is_staff:
            queryset = AssessmentTemplate.objects.all()
        else:
            queryset = AssessmentTemplate.objects.filter(created_by=user)
            
        # Apply Query Parameter Validations
        allowed_params = {"search", "status", "language", "created_by", "ordering", "page", "page_size"}
        for param in self.request.query_params.keys():
            if param not in allowed_params:
                raise DRFValidationError(detail=f"Invalid query parameter: {param}", code="invalid_filter")
                
        # 1. status filter
        status_val = self.request.query_params.get("status")
        if status_val:
            if status_val not in ["draft", "active", "archived"]:
                raise DRFValidationError(detail=f"Invalid status: {status_val}", code="invalid_filter")
            queryset = queryset.filter(status=status_val)
            
        # 2. search filter
        search_val = self.request.query_params.get("search")
        if search_val:
            queryset = queryset.filter(
                name__icontains=search_val
            ) | queryset.filter(
                description__icontains=search_val
            )
            queryset = queryset.distinct()
            
        # 3. language filter
        lang_val = self.request.query_params.get("language")
        if lang_val:
            if lang_val.lower() != "python":
                raise DRFValidationError(detail=f"Unsupported language: {lang_val}", code="invalid_language")
            # Filter templates where at least one question matches the language,
            # or if the template has questions and all are python
            queryset = queryset.filter(questions__language=lang_val.lower()).distinct()
            
        # 4. created_by filter
        created_by_val = self.request.query_params.get("created_by")
        if created_by_val:
            if not (user.is_superuser or user.is_staff):
                raise DRFValidationError(detail="Only admin users can filter by created_by.", code="invalid_filter")
            queryset = queryset.filter(created_by_id=created_by_val)
            
        # 5. ordering
        ordering_val = self.request.query_params.get("ordering")
        VALID_ORDERING_FIELDS = [
            "created_at", "-created_at",
            "updated_at", "-updated_at",
            "name", "-name",
            "version", "-version",
            "status", "-status"
        ]
        if ordering_val:
            ordering_parts = [p.strip() for p in ordering_val.split(",")]
            for part in ordering_parts:
                if part not in VALID_ORDERING_FIELDS:
                    raise DRFValidationError(detail=f"Invalid ordering field: {part}", code="invalid_filter")
            
            # Enforce deterministic id tie-breaker
            ordering_parts.append("id")
            queryset = queryset.order_by(*ordering_parts)
        else:
            # Default ordering
            queryset = queryset.order_by("-created_at", "id")
            
        return queryset

    def get(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
            
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        template = create_assessment_template(
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            instructions=serializer.validated_data.get("instructions", ""),
            duration_minutes=serializer.validated_data["duration_minutes"],
            created_by=request.user
        )
        
        response_serializer = self.get_serializer(template)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class AssessmentTemplateDetailView(AssessmentBaseView):
    serializer_class = AssessmentTemplateSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def get(self, request, pk, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template)
        return Response(serializer.data)

    def patch(self, request, pk, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        
        updated_template = update_assessment_template(
            template_id=template.id,
            name=serializer.validated_data.get("name", template.name),
            description=serializer.validated_data.get("description", template.description),
            instructions=serializer.validated_data.get("instructions", template.instructions),
            duration_minutes=serializer.validated_data.get("duration_minutes", template.duration_minutes),
            updated_by=request.user
        )
        
        response_serializer = self.get_serializer(updated_template)
        return Response(response_serializer.data)

    def delete(self, request, pk, *args, **kwargs):
        template = self.get_object()
        delete_assessment_template(template.id, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssessmentQuestionCreateView(AssessmentBaseView):
    serializer_class = AssessmentQuestionSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def post(self, request, pk, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        question = add_assessment_question(
            template_id=template.id,
            title=serializer.validated_data["title"],
            prompt=serializer.validated_data["prompt"],
            starter_code=serializer.validated_data.get("starter_code", ""),
            hidden_tests=serializer.validated_data.get("hidden_tests", ""),
            marks=serializer.validated_data["marks"],
            display_order=serializer.validated_data["display_order"],
            user=request.user,
            starter_code_per_language=serializer.validated_data.get("starter_code_per_language"),
            visible_test_cases=serializer.validated_data.get("visible_test_cases"),
            hidden_test_cases=serializer.validated_data.get("hidden_test_cases"),
            execution_mode=serializer.validated_data.get("execution_mode", "function"),
            function_name=serializer.validated_data.get("function_name", ""),
            time_limit_seconds=serializer.validated_data.get("time_limit_seconds", 5),
            memory_limit_mb=serializer.validated_data.get("memory_limit_mb"),
        )
        
        response_serializer = self.get_serializer(question)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class AssessmentQuestionDetailView(AssessmentBaseView):
    serializer_class = AssessmentQuestionSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def get_question(self, template, question_id):
        try:
            return template.questions.get(pk=question_id)
        except AssessmentQuestion.DoesNotExist:
            raise Http404("Question not found.")

    def patch(self, request, pk, question_id, *args, **kwargs):
        template = self.get_object()
        question = self.get_question(template, question_id)
        
        serializer = self.get_serializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        
        # Replacement semantics:
        # Missing hidden_tests field means retain existing value (None).
        # Non-empty hidden_tests replaces it.
        # Empty hidden_tests is rejected by serializer validation.
        hidden_tests = serializer.validated_data.get("hidden_tests")
        if "hidden_tests" not in request.data:
            hidden_tests = None
            
        updated_question = update_assessment_question(
            question_id=question.id,
            title=serializer.validated_data.get("title", question.title),
            prompt=serializer.validated_data.get("prompt", question.prompt),
            starter_code=serializer.validated_data.get("starter_code", question.starter_code),
            hidden_tests=hidden_tests,
            marks=serializer.validated_data.get("marks", question.marks),
            display_order=serializer.validated_data.get("display_order", question.display_order),
            user=request.user,
            starter_code_per_language=serializer.validated_data.get("starter_code_per_language", question.starter_code_per_language),
            visible_test_cases=serializer.validated_data.get("visible_test_cases", question.visible_test_cases),
            hidden_test_cases=serializer.validated_data.get("hidden_test_cases", question.hidden_test_cases),
            execution_mode=serializer.validated_data.get("execution_mode", question.execution_mode),
            function_name=serializer.validated_data.get("function_name", question.function_name),
            time_limit_seconds=serializer.validated_data.get("time_limit_seconds", question.time_limit_seconds),
            memory_limit_mb=serializer.validated_data.get("memory_limit_mb", question.memory_limit_mb),
        )
        
        response_serializer = self.get_serializer(updated_question)
        return Response(response_serializer.data)

    def delete(self, request, pk, question_id, *args, **kwargs):
        template = self.get_object()
        question = self.get_question(template, question_id)
        
        delete_assessment_question(question.id, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssessmentQuestionReorderView(AssessmentBaseView):
    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def post(self, request, pk, *args, **kwargs):
        template = self.get_object()
        order_list = request.data
        
        if not isinstance(order_list, list):
            raise DRFValidationError(detail="Payload must be a list of question orderings.", code="invalid_question_ordering")
            
        for item in order_list:
            if not isinstance(item, dict) or "id" not in item or "display_order" not in item:
                raise DRFValidationError(detail="Each item must contain 'id' and 'display_order'.", code="invalid_question_ordering")
                
        reorder_assessment_questions(template.id, order_list, request.user)
        return Response({"detail": "Questions reordered successfully."})


class AssessmentTemplateActivateView(AssessmentBaseView):
    serializer_class = AssessmentTemplateSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def post(self, request, pk, *args, **kwargs):
        template = self.get_object()
        if template.status == "active":
            serializer = self.get_serializer(template)
            return Response(serializer.data)
            
        activated_template = activate_assessment_template(template.id, request.user)
        serializer = self.get_serializer(activated_template)
        return Response(serializer.data)


class AssessmentTemplateArchiveView(AssessmentBaseView):
    serializer_class = AssessmentTemplateSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def post(self, request, pk, *args, **kwargs):
        template = self.get_object()
        if template.status == "archived":
            serializer = self.get_serializer(template)
            return Response(serializer.data)
            
        archived_template = archive_assessment_template(template.id, request.user)
        serializer = self.get_serializer(archived_template)
        return Response(serializer.data)


class AssessmentTemplateCloneView(AssessmentBaseView):
    serializer_class = AssessmentTemplateSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def post(self, request, pk, *args, **kwargs):
        template = self.get_object()
        cloned_template = clone_assessment_template(template.id, request.user)
        serializer = self.get_serializer(cloned_template)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AssessmentTemplatePreviewView(AssessmentBaseView):
    serializer_class = CandidateSafePreviewSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AssessmentTemplate.objects.none()
        if user.is_superuser or user.is_staff:
            return AssessmentTemplate.objects.all()
        return AssessmentTemplate.objects.filter(created_by=user)

    def get(self, request, pk, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template)
        return Response(serializer.data)


class CandidateAssessmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, application_id, *args, **kwargs):
        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        from applications.models import Application
        try:
            application = Application.objects.get(pk=application_id)
        except Application.DoesNotExist:
            raise Http404("Application not found.")
            
        if not is_staff_or_super:
            if application.job.hr_user != request.user:
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
                
        assignments = CandidateAssessment.objects.filter(application_id=application_id).order_by("-assigned_at")
        serializer = CandidateAssessmentAssignmentSerializer(assignments, many=True)
        return Response(serializer.data)


class CandidateAssessmentSendView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, *args, **kwargs):
        application_id = request.data.get("application_id")
        template_id = request.data.get("template_id")
        deadline_str = request.data.get("deadline")

        if not application_id or not template_id or not deadline_str:
            raise DRFValidationError(detail="application_id, template_id, and deadline are required fields.", code="validation_failed")

        from django.utils.dateparse import parse_datetime
        try:
            deadline = parse_datetime(deadline_str)
            if not deadline:
                raise ValueError()
            if not timezone.is_aware(deadline):
                deadline = timezone.make_aware(deadline, timezone.utc)
        except Exception:
            raise DRFValidationError(detail="Invalid deadline format. Use ISO 8601.", code="validation_failed")

        assessment = assign_and_send_assessment(
            application_id=application_id,
            template_id=template_id,
            deadline=deadline,
            recruiter_user=request.user
        )

        serializer = CandidateAssessmentAssignmentSerializer(assessment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CandidateAssessmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, pk, *args, **kwargs):
        try:
            assessment = CandidateAssessment.objects.get(pk=pk)
        except CandidateAssessment.DoesNotExist:
            raise Http404("Assessment assignment not found.")

        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        if not is_staff_or_super:
            if assessment.application.job.hr_user != request.user:
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = CandidateAssessmentDetailSerializer(assessment)
        return Response(serializer.data)


class CandidateAssessmentResendView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, pk, *args, **kwargs):
        deadline_str = request.data.get("deadline")
        deadline = None
        if deadline_str:
            from django.utils.dateparse import parse_datetime
            try:
                deadline = parse_datetime(deadline_str)
                if not deadline:
                    raise ValueError()
                if not timezone.is_aware(deadline):
                    deadline = timezone.make_aware(deadline, timezone.utc)
            except Exception:
                raise DRFValidationError(detail="Invalid deadline format. Use ISO 8601.", code="validation_failed")

        assessment = resend_assessment_invitation(
            assessment_id=pk,
            recruiter_user=request.user,
            new_deadline=deadline
        )

        serializer = CandidateAssessmentAssignmentSerializer(assessment)
        return Response(serializer.data)


class BrevoWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, *args, **kwargs):
        # 1. Size protection: Content-Length check
        content_length = request.META.get('CONTENT_LENGTH')
        if not content_length:
            return Response({"detail": "Length Required"}, status=status.HTTP_411_LENGTH_REQUIRED)
        try:
            cl = int(content_length)
            if cl > 1048576:
                return Response({"detail": "Payload Too Large"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        except ValueError:
            return Response({"detail": "Invalid Content-Length"}, status=status.HTTP_400_BAD_REQUEST)

        # Bounded read
        body = request.read(1048577)
        if len(body) > 1048576:
            return Response({"detail": "Payload Too Large"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        # 2. Bearer Authentication
        auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
        if not auth_header:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        
        secret = parts[1]
        webhook_secret = getattr(settings, "BREVO_WEBHOOK_SECRET", "")
        if not webhook_secret or not hmac.compare_digest(secret, webhook_secret):
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        # 3. Parse and Validate JSON structure
        try:
            import json
            data = json.loads(body.decode("utf-8"))
        except Exception:
            return Response({"detail": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(data, dict):
            return Response({"detail": "Payload must be a JSON object"}, status=status.HTTP_400_BAD_REQUEST)

        event_name = data.get("event")
        msg_id_raw = data.get("message-id") or data.get("messageId")
        
        if not event_name or not msg_id_raw:
            return Response({"detail": "Missing event or message-id"}, status=status.HTTP_400_BAD_REQUEST)

        # Timestamp parsing
        ts_val = data.get("ts") or data.get("date")
        event_timestamp = None
        if ts_val:
            try:
                if isinstance(ts_val, int) or (isinstance(ts_val, str) and ts_val.isdigit()):
                    event_timestamp = timezone.datetime.fromtimestamp(int(ts_val), tz=timezone.utc)
                else:
                    from django.utils.dateparse import parse_datetime
                    event_timestamp = parse_datetime(str(ts_val))
                    if event_timestamp and not timezone.is_aware(event_timestamp):
                        event_timestamp = timezone.make_aware(event_timestamp, timezone.utc)
            except Exception:
                pass

        if not event_timestamp:
            event_timestamp = timezone.now()

        # 4. Message-ID Normalization (Preserving Case)
        try:
            normalized_msg_id = normalize_message_id(msg_id_raw)
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Centralized Event Name Mapping
        EVENT_STATUS_MAP = {
            "request": "sent",
            "sent": "sent",
            "delivered": "delivered",
            "opened": "opened",
            "unique_opened": "opened",
            "clicks": "clicked",
            "click": "clicked",
            "clicked": "clicked",
            "deferred": "deferred",
            "soft_bounce": "soft_bounced",
            "soft_bounceed": "soft_bounced",
            "hard_bounce": "hard_bounced",
            "hard_bounceed": "hard_bounced",
            "blocked": "blocked",
            "spam": "complaint",
            "complaint": "complaint",
            "error": "failed",
            "failed": "failed",
        }

        mapped_status = EVENT_STATUS_MAP.get(event_name.lower())
        if not mapped_status:
            return Response({"detail": "Unsupported event ignored"})

        # 5. Row locking: Lock delivery row
        with transaction.atomic():
            try:
                delivery = AssessmentEmailDelivery.objects.select_for_update().get(provider_message_id=normalized_msg_id)
            except AssessmentEmailDelivery.DoesNotExist:
                return Response({"detail": "Event logged (unknown ID)"})

            assessment = CandidateAssessment.objects.select_for_update().get(pk=delivery.candidate_assessment_id)

            # Stale Event check
            if delivery.last_event_at and event_timestamp < delivery.last_event_at:
                return Response({"detail": "Stale event ignored"})

            # Determine latest send attempt
            max_send_attempt = AssessmentEmailDelivery.objects.filter(
                candidate_assessment=assessment
            ).aggregate(models.Max('send_attempt'))['send_attempt__max'] or 0

            is_latest = (delivery.send_attempt == max_send_attempt)

            # 6. Monotonic independent updates on delivery row
            state_changed = False
            
            if mapped_status == "sent":
                if not delivery.sent_at or event_timestamp > delivery.sent_at:
                    delivery.sent_at = event_timestamp
                    state_changed = True
            elif mapped_status == "delivered":
                if not delivery.delivered_at or event_timestamp > delivery.delivered_at:
                    delivery.delivered_at = event_timestamp
                    state_changed = True
            elif mapped_status == "opened":
                if not delivery.opened_at or event_timestamp > delivery.opened_at:
                    delivery.opened_at = event_timestamp
                    state_changed = True
            elif mapped_status == "clicked":
                if not delivery.clicked_at or event_timestamp > delivery.clicked_at:
                    delivery.clicked_at = event_timestamp
                    state_changed = True
            elif mapped_status in ["failed", "soft_bounced", "hard_bounced", "blocked", "complaint"]:
                if not delivery.failed_at or event_timestamp > delivery.failed_at:
                    delivery.failed_at = event_timestamp
                    delivery.failure_code = mapped_status
                    delivery.safe_failure_message = f"Delivery failed with status: {event_name}"
                    state_changed = True

            if delivery.status != mapped_status:
                delivery.status = mapped_status
                state_changed = True

            if state_changed:
                delivery.last_event_at = event_timestamp
                delivery.save()

            # 7. Update parent assessment summary fields if it is the latest attempt
            if is_latest:
                parent_changed = False
                
                if mapped_status == "sent":
                    if not assessment.email_sent_at or event_timestamp > assessment.email_sent_at:
                        assessment.email_sent_at = event_timestamp
                        parent_changed = True
                elif mapped_status == "delivered":
                    if not assessment.email_delivered_at or event_timestamp > assessment.email_delivered_at:
                        assessment.email_delivered_at = event_timestamp
                        parent_changed = True
                elif mapped_status == "opened":
                    if not assessment.email_opened_at or event_timestamp > assessment.email_opened_at:
                        assessment.email_opened_at = event_timestamp
                        parent_changed = True
                elif mapped_status == "clicked":
                    if not assessment.email_clicked_at or event_timestamp > assessment.email_clicked_at:
                        assessment.email_clicked_at = event_timestamp
                        parent_changed = True
                elif mapped_status in ["failed", "soft_bounced", "hard_bounced", "blocked", "complaint"]:
                    if not assessment.email_failed_at or event_timestamp > assessment.email_failed_at:
                        assessment.email_failed_at = event_timestamp
                        assessment.email_failure_code = mapped_status
                        assessment.email_failure_message = f"Delivery failed with status: {event_name}"
                        parent_changed = True

                if assessment.email_status != mapped_status:
                    assessment.email_status = mapped_status
                    parent_changed = True

                if parent_changed:
                    assessment.email_last_event_at = event_timestamp
                    assessment.save()
                    
                    log_audit(
                        action="assessment_email_status_changed",
                        actor=None,
                        target_type="CandidateAssessment",
                        target_id=str(assessment.id),
                        target_label=mapped_status,
                        metadata={
                            "assessment_id": str(assessment.id),
                            "send_attempt": delivery.send_attempt,
                            "email_status": mapped_status,
                            "event_name": event_name,
                        }
                    )

        return Response({"detail": "Event processed successfully"})


from django.http import HttpResponse

class CandidateAccessView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, token, *args, **kwargs):
        assessment = get_and_start_assessment_by_token(token)
        serializer = CandidateAccessSerializer(assessment)
        return Response(serializer.data)


class CandidateNotebookDownloadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, token, *args, **kwargs):
        assessment = get_and_start_assessment_by_token(token)
        notebook_content = generate_candidate_notebook(assessment)
        
        response = HttpResponse(notebook_content, content_type="application/x-ipynb+json")
        response['Content-Disposition'] = f'attachment; filename="assessment_{assessment.id}_attempt_{assessment.attempt_number}.ipynb"'
        
        log_audit(
            action="assessment_notebook_downloaded",
            actor=None,
            target_type="CandidateAssessment",
            target_id=assessment.id,
            target_label="downloaded",
            metadata={
                "assessment_id": str(assessment.id)
            }
        )
        return response


class CandidateNotebookUploadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, token, *args, **kwargs):
        assessment = get_and_start_assessment_by_token(token)
        file_obj = request.FILES.get('file')
        if not file_obj:
            raise DRFValidationError(detail="No notebook file was provided.", code="notebook_required")
            
        submission = save_candidate_upload(assessment, file_obj)
        serializer = AssessmentSubmissionSerializer(submission)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CandidateSaveAnswersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, token, *args, **kwargs):
        assessment = get_and_start_assessment_by_token(token)
        answers_dict = request.data.get("answers")
        if answers_dict is None:
            raise DRFValidationError(detail="No answers data was provided.", code="answers_required")
        if not isinstance(answers_dict, dict):
            raise DRFValidationError(detail="Answers data must be a dictionary.", code="invalid_payload")
            
        save_candidate_answers(assessment, answers_dict)
        return Response({"detail": "Answers saved successfully."}, status=status.HTTP_200_OK)


class CandidateAssessmentSubmitView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, token, *args, **kwargs):
        assessment = get_and_start_assessment_by_token(token)
        submit_candidate_assessment(assessment)
        assessment.refresh_from_db()
        auto_queue_error = None
        if assessment.status == "submitted":
            try:
                assessment = queue_submission_for_evaluation(assessment.id, queued_by_user=None)
                import sys
                if "test" not in sys.argv:
                    trigger_evaluation_in_background(assessment.id)
            except Exception:
                auto_queue_error = "automatic_queue_failed"
                logger.exception(
                    "Failed to automatically queue assessment %s after candidate submission.",
                    assessment.id,
                )
                assessment.refresh_from_db()

        return Response({
            "detail": "Assessment submitted successfully.",
            "status": assessment.status,
            "submitted_at": assessment.submitted_at.isoformat() if assessment.submitted_at else None,
            "auto_queue_error": auto_queue_error,
        }, status=status.HTTP_200_OK)


class CandidateRunCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, token, *args, **kwargs):
        """
        Preview-only code execution endpoint for the browser-based assessment workspace.
        Runs the candidate's current question code in a sandboxed Docker container,
        returning stdout/stderr for display in the UI.
        NOT used for grading — hidden tests are never executed here.
        """
        from .evaluator import run_candidate_code_preview

        assessment = get_and_start_assessment_by_token(token)

        # Only allow run-code when assessment is active
        if assessment.status not in ("started", "invited"):
            raise DRFValidationError(
                detail="Code execution is only allowed while the assessment is active.",
                code="assessment_not_accessible"
            )

        code = request.data.get("code", "")
        if not isinstance(code, str):
            raise DRFValidationError(detail="code must be a string.", code="invalid_payload")

        # Hard limit on code size
        if len(code) > 50000:
            raise DRFValidationError(detail="Code is too large to execute.", code="code_too_large")

        try:
            run_timeout = getattr(settings, "RUN_CODE_PREVIEW_TIMEOUT_SECONDS", 5)
            result = run_candidate_code_preview(code, timeout_seconds=run_timeout)
        except RuntimeError as e:
            err_msg = str(e)
            if "Docker" in err_msg or "docker" in err_msg:
                return Response({
                    "stdout": "",
                    "stderr": "",
                    "exit_code": -1,
                    "duration_seconds": 0,
                    "error": "Sandbox environment is not available. Docker may not be running."
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            return Response({
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1,
                "duration_seconds": 0,
                "error": "An unexpected error occurred during code execution."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Truncate large outputs for safety
        MAX_OUTPUT = 10000
        stdout_val = result.stdout[:MAX_OUTPUT] if result.stdout else ""
        stderr_val = result.stderr[:MAX_OUTPUT] if result.stderr else ""

        response_data = {
            "stdout": stdout_val,
            "stderr": stderr_val,
            "exit_code": result.exit_code,
            "duration_seconds": round(result.duration, 3),
            "is_timeout": result.is_timeout,
        }
        return Response(response_data, status=status.HTTP_200_OK)


class QueueSubmissionForEvaluationView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, pk, *args, **kwargs):
        try:
            assessment = CandidateAssessment.objects.get(pk=pk)
        except CandidateAssessment.DoesNotExist:
            raise Http404("Assessment assignment not found.")

        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        if not is_staff_or_super and assessment.application.job.hr_user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        queued_assessment = queue_submission_for_evaluation(assessment.id, request.user)

        # Immediately trigger background evaluation so recruiter does not need to
        # run a terminal command. Safe for dev (daemon thread) and single-worker prod.
        import sys
        if "test" not in sys.argv:
            trigger_evaluation_in_background(queued_assessment.id)

        serializer = CandidateAssessmentDetailSerializer(queued_assessment)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CandidateAssessmentRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, pk, *args, **kwargs):
        try:
            assessment = CandidateAssessment.objects.get(pk=pk)
        except CandidateAssessment.DoesNotExist:
            raise Http404("Assessment assignment not found.")

        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        if not is_staff_or_super and assessment.application.job.hr_user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        retried_assessment = retry_failed_assessment(assessment.id, request.user)
        serializer = CandidateAssessmentDetailSerializer(retried_assessment)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CandidateAssessmentResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, pk, *args, **kwargs):
        try:
            assessment = CandidateAssessment.objects.get(pk=pk)
        except CandidateAssessment.DoesNotExist:
            raise Http404("Assessment assignment not found.")

        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        if not is_staff_or_super and assessment.application.job.hr_user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        submission = assessment.submissions.filter(attempt_number=assessment.attempt_number).first()
        if not submission or not hasattr(submission, "result"):
            raise Http404("Assessment result not found.")

        serializer = AssessmentResultSerializer(submission.result)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CandidateAssessmentDevAccessLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def get(self, request, pk, *args, **kwargs):
        if not getattr(settings, "DEBUG", False):
            raise DRFValidationError(
                detail="This endpoint is only available in development.",
                code="development_only_endpoint"
            )

        try:
            assessment = CandidateAssessment.objects.get(pk=pk)
        except CandidateAssessment.DoesNotExist:
            raise Http404("Assessment assignment not found.")

        is_staff_or_super = request.user.is_staff or request.user.is_superuser
        if not is_staff_or_super and assessment.application.job.hr_user != request.user:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        if not assessment.dev_raw_token:
            raise DRFValidationError(
                detail="No raw token is stored for this assignment. Please create a new assignment.",
                code="token_not_available"
            )

        from urllib.parse import urljoin
        frontend_url = getattr(settings, "ASSESSMENT_FRONTEND_URL", "http://localhost:5173/assessments")
        if not frontend_url.endswith("/"):
            frontend_url += "/"
        dev_access_url = urljoin(frontend_url, f"take/{assessment.dev_raw_token}/")

        return Response({
            "assessment_id": str(assessment.id),
            "candidate_name_snapshot": assessment.candidate_name_snapshot,
            "status": assessment.status,
            "dev_access_url": dev_access_url
        }, status=status.HTTP_200_OK)


class CandidateRunTestsView(APIView):
    """
    POST /api/assessments/access/<token>/run-tests/

    Runs candidate code against VISIBLE sample test cases only.
    Returns structured per-test results: input, expected_output, actual_output, status, runtime_ms.
    NEVER runs hidden tests. NEVER used for grading.

    Request body:
        {
            "question_id": "<uuid>",
            "code": "...",
            "language": "python"  # or "javascript"
        }

    HTTP status codes:
        200  - execution completed (even if all tests failed — failure is a normal result)
        400  - invalid payload (bad code, unsupported language, missing question_id)
        403  - expired token, cancelled assessment, or assessment already submitted
        404  - invalid token or question not found
        409  - assessment already submitted, reruns not allowed
        503  - Docker sandbox unavailable
        500  - unexpected server error
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_exception_handler(self):
        return custom_assessment_exception_handler

    def post(self, request, token, *args, **kwargs):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from .evaluator import SUPPORTED_LANGUAGES

        # ── Token validation ──────────────────────────────────────────────────────
        try:
            assessment = get_and_start_assessment_by_token(token)
        except DjangoValidationError as e:
            err_code = getattr(e, "code", None) or "invalid_token"
            detail_msg = e.message if hasattr(e, "message") else str(e)
            if err_code in ("expired_token", "assessment_not_accessible"):
                return Response({"detail": detail_msg}, status=status.HTTP_403_FORBIDDEN)
            return Response({"detail": detail_msg}, status=status.HTTP_404_NOT_FOUND)

        # ── Assessment status check ───────────────────────────────────────────────
        if assessment.status in ("submitted", "graded", "evaluating", "queued"):
            return Response(
                {"detail": "Cannot run tests after the assessment has been submitted."},
                status=status.HTTP_409_CONFLICT
            )
        if assessment.status not in ("started", "invited"):
            return Response(
                {"detail": "Assessment is not in an active state."},
                status=status.HTTP_403_FORBIDDEN
            )

        # ── Payload validation ────────────────────────────────────────────────────
        question_id = request.data.get("question_id", "")
        candidate_code = request.data.get("code", "")
        language = request.data.get("language", "python")

        if not question_id:
            return Response({"detail": "question_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(candidate_code, str):
            return Response({"detail": "code must be a string."}, status=status.HTTP_400_BAD_REQUEST)
        if len(candidate_code) > 50000:
            return Response({"detail": "Code is too large to execute."}, status=status.HTTP_400_BAD_REQUEST)
        if language not in SUPPORTED_LANGUAGES:
            return Response(
                {"detail": f"Unsupported language '{language}'. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Run visible test cases ────────────────────────────────────────────────
        try:
            result = run_candidate_visible_tests(
                assessment=assessment,
                question_id=str(question_id),
                code=candidate_code,
                language=language,
            )
        except DjangoValidationError as e:
            err_code = getattr(e, "code", "validation_error") or "validation_error"
            detail_msg = e.message if hasattr(e, "message") else str(e)
            if err_code == "invalid_question":
                return Response({"detail": detail_msg}, status=status.HTTP_404_NOT_FOUND)
            if err_code == "unsupported_language":
                return Response({"detail": detail_msg}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": detail_msg}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError) as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as e:
            err_msg = str(e)
            if "Docker" in err_msg or "docker" in err_msg:
                return Response(
                    {
                        "status": "error",
                        "detail": "Sandbox environment is not available. Docker may not be running.",
                        "test_results": []
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
            return Response(
                {
                    "status": "error",
                    "detail": "An unexpected error occurred during code execution.",
                    "test_results": []
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(result, status=status.HTTP_200_OK)
