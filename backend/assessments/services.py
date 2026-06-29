import hmac
import hashlib
import logging
import os
import secrets
import json
import nbformat
from django.conf import settings
from django.db import transaction, IntegrityError, models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.timezone import is_aware
from urllib.parse import urljoin
from .models import AssessmentTemplate, AssessmentQuestion, CandidateAssessment, AssessmentEmailDelivery, AssessmentSubmission, CandidateAnswer
from accounts.utils import log_audit

logger = logging.getLogger(__name__)


# --- Token Security Helpers ---

def generate_raw_token():
    return secrets.token_urlsafe(32)


def get_token_digest(raw_token):
    key = getattr(settings, "ASSESSMENT_TOKEN_HMAC_KEY", settings.SECRET_KEY)
    message = b"screenai-assessment-token:v1:" + raw_token.encode("utf-8")
    return hmac.new(key.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_token(raw_token, secure_token_digest):
    digest = get_token_digest(raw_token)
    return hmac.compare_digest(digest, secure_token_digest)


# --- Template Management Services ---

@transaction.atomic
def create_assessment_template(name, description, instructions, duration_minutes, created_by):
    template = AssessmentTemplate.objects.create(
        name=name,
        description=description,
        instructions=instructions,
        duration_minutes=duration_minutes,
        version=1,
        status="draft",
        created_by=created_by
    )
    log_audit(
        action="assessment_template_created",
        actor=created_by,
        target_type="AssessmentTemplate",
        target_id=template.id,
        target_label=template.name,
        metadata={"template_id": str(template.id), "name": template.name, "version": template.version}
    )
    return template


@transaction.atomic
def update_assessment_template(template_id, name, description, instructions, duration_minutes, updated_by):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status in ["active", "archived"]:
        raise ValidationError("Active or archived templates cannot be structurally updated.")
    
    template.name = name
    template.description = description
    template.instructions = instructions
    template.duration_minutes = duration_minutes
    template.save()
    
    log_audit(
        action="assessment_template_updated",
        actor=updated_by,
        target_type="AssessmentTemplate",
        target_id=template.id,
        target_label=template.name,
        metadata={"template_id": str(template.id), "name": template.name}
    )
    return template


@transaction.atomic
def add_assessment_question(
    template_id, title, prompt, starter_code, hidden_tests, marks, display_order, user,
    starter_code_per_language=None, visible_test_cases=None, hidden_test_cases=None,
    execution_mode="function", function_name="", time_limit_seconds=5, memory_limit_mb=None
):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status in ["active", "archived"]:
        raise ValidationError("Cannot add questions to an active or archived template.")
    
    question = AssessmentQuestion.objects.create(
        template=template,
        title=title,
        prompt=prompt,
        starter_code=starter_code,
        hidden_tests=hidden_tests,
        marks=marks,
        display_order=display_order,
        starter_code_per_language=starter_code_per_language or {},
        visible_test_cases=visible_test_cases or [],
        hidden_test_cases=hidden_test_cases or [],
        execution_mode=execution_mode,
        function_name=function_name,
        time_limit_seconds=time_limit_seconds,
        memory_limit_mb=memory_limit_mb
    )
    log_audit(
        action="assessment_question_added",
        actor=user,
        target_type="AssessmentQuestion",
        target_id=question.id,
        target_label=question.title,
        metadata={"template_id": str(template.id), "question_id": str(question.id), "display_order": display_order}
    )
    return question


@transaction.atomic
def update_assessment_question(
    question_id, title, prompt, starter_code, hidden_tests, marks, display_order, user,
    starter_code_per_language=None, visible_test_cases=None, hidden_test_cases=None,
    execution_mode=None, function_name=None, time_limit_seconds=None, memory_limit_mb=None
):
    question = AssessmentQuestion.objects.select_for_update().get(pk=question_id)
    template = question.template
    if template.status in ["active", "archived"]:
        raise ValidationError("Cannot edit questions of an active or archived template.")
    
    question.title = title
    question.prompt = prompt
    question.starter_code = starter_code
    if hidden_tests is not None:
        question.hidden_tests = hidden_tests
    question.marks = marks
    question.display_order = display_order
    
    if starter_code_per_language is not None:
        question.starter_code_per_language = starter_code_per_language
    if visible_test_cases is not None:
        question.visible_test_cases = visible_test_cases
    if hidden_test_cases is not None:
        question.hidden_test_cases = hidden_test_cases
    if execution_mode is not None:
        question.execution_mode = execution_mode
    if function_name is not None:
        question.function_name = function_name
    if time_limit_seconds is not None:
        question.time_limit_seconds = time_limit_seconds
    if memory_limit_mb is not None:
        question.memory_limit_mb = memory_limit_mb
        
    question.save()
    
    log_audit(
        action="assessment_question_updated",
        actor=user,
        target_type="AssessmentQuestion",
        target_id=question.id,
        target_label=question.title,
        metadata={"template_id": str(template.id), "question_id": str(question.id)}
    )
    return question


@transaction.atomic
def delete_assessment_question(question_id, user):
    question = AssessmentQuestion.objects.select_for_update().get(pk=question_id)
    template = question.template
    if template.status in ["active", "archived"]:
        raise ValidationError("Cannot delete questions of an active or archived template.")
    
    q_id_str = str(question.id)
    q_title = question.title
    question.delete()
    
    log_audit(
        action="assessment_question_deleted",
        actor=user,
        target_type="AssessmentQuestion",
        target_id=q_id_str,
        target_label=q_title,
        metadata={"template_id": str(template.id), "question_id": q_id_str}
    )


@transaction.atomic
def reorder_assessment_questions(template_id, order_list, user):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status in ["active", "archived"]:
        raise ValidationError("Cannot reorder questions of an active or archived template.")
    
    questions = {str(q.id): q for q in template.questions.select_for_update()}
    provided_ids = [item.get("id") for item in order_list]
    
    if set(provided_ids) != set(questions.keys()):
        raise ValidationError("Provided question IDs do not match the template questions.")
    if len(provided_ids) != len(set(provided_ids)):
        raise ValidationError("Duplicate question IDs provided.")
        
    new_orders = [item.get("display_order") for item in order_list]
    expected_orders = list(range(len(questions)))
    if sorted(new_orders) != expected_orders:
        raise ValidationError("New display orders must be unique and contiguous starting at 0.")
        
    # Step 1: Temporarily set display_orders to safe large unique values (e.g. 10000 + index)
    for idx, item in enumerate(order_list):
        q = questions[item["id"]]
        q.display_order = 10000 + idx
        q.save()
        
    # Step 2: Set target display_orders
    for item in order_list:
        q = questions[item["id"]]
        q.display_order = item["display_order"]
        q.save()
        
    log_audit(
        action="assessment_questions_reordered",
        actor=user,
        target_type="AssessmentTemplate",
        target_id=template.id,
        target_label=template.name,
        metadata={"template_id": str(template.id), "question_count": len(order_list)}
    )
    return template


@transaction.atomic
def activate_assessment_template(template_id, activated_by_user):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status != "draft":
        raise ValidationError("Only draft templates can be activated.")
    if not template.questions.exists():
        raise ValidationError("Cannot activate template with zero questions.")
    
    # Verify display order of questions is unique and contiguous starting at 0
    questions = template.questions.all().order_by("display_order")
    total_marks = 0
    for idx, q in enumerate(questions):
        if q.display_order != idx:
            raise ValidationError("Question display orders must be unique and contiguous starting at 0.")
        if not q.title or not q.title.strip() or not q.prompt or not q.prompt.strip():
            raise ValidationError("Question title and prompt cannot be blank.")
        if q.marks <= 0:
            raise ValidationError("Question marks must be positive.")

        # Determine if structured or legacy
        is_structured = bool(q.visible_test_cases or q.hidden_test_cases or q.starter_code_per_language or q.function_name)

        if is_structured:
            if q.execution_mode == "function" and not q.function_name.strip():
                raise ValidationError(f"Question '{q.title}' (Q{idx + 1}) is missing a function name.")
            if not q.visible_test_cases:
                raise ValidationError(f"Question '{q.title}' (Q{idx + 1}) must have at least one visible test case.")
            if not q.hidden_test_cases:
                raise ValidationError(f"Question '{q.title}' (Q{idx + 1}) must have at least one hidden test case.")
            if not q.starter_code_per_language:
                raise ValidationError(f"Question '{q.title}' (Q{idx + 1}) must have starter code.")
            for lang, code in q.starter_code_per_language.items():
                if not code or not code.strip():
                    raise ValidationError(f"Question '{q.title}' (Q{idx + 1}) has empty starter code for {lang}.")
        else:
            if not q.hidden_tests or not q.hidden_tests.strip():
                raise ValidationError("Question hidden tests cannot be blank upon activation.")

        total_marks += q.marks
        
    if total_marks <= 0:
        raise ValidationError("Total marks of activated template must be positive.")
        
    template.status = "active"
    template.activated_at = timezone.now()
    template.save()
    
    log_audit(
        action="assessment_template_activated",
        actor=activated_by_user,
        target_type="AssessmentTemplate",
        target_id=template.id,
        target_label=template.name,
        metadata={"template_id": str(template.id), "status": template.status}
    )
    return template


@transaction.atomic
def archive_assessment_template(template_id, user):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status == "archived":
        return template
    if template.status != "active":
        raise ValidationError("Only active templates can be archived.")
        
    template.status = "archived"
    template.archived_at = timezone.now()
    template.save()
    
    log_audit(
        action="assessment_template_archived",
        actor=user,
        target_type="AssessmentTemplate",
        target_id=template.id,
        target_label=template.name,
        metadata={"template_id": str(template.id), "status": template.status}
    )
    return template


@transaction.atomic
def delete_assessment_template(template_id, user):
    template = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    if template.status != "draft":
        raise ValidationError("Only draft templates can be deleted.")
    if template.candidate_assessments.exists():
        raise ValidationError("Cannot delete template referenced by assignments.")
        
    template_id_str = str(template.id)
    template_name = template.name
    template.delete()
    
    log_audit(
        action="assessment_template_deleted",
        actor=user,
        target_type="AssessmentTemplate",
        target_id=template_id_str,
        target_label=template_name,
        metadata={"template_id": template_id_str, "name": template_name}
    )


@transaction.atomic
def clone_assessment_template(template_id, user):
    orig = AssessmentTemplate.objects.select_for_update().get(pk=template_id)
    
    # Lock templates with same name to prevent race conditions on version allocation
    AssessmentTemplate.objects.filter(name=orig.name).select_for_update()
    max_version = AssessmentTemplate.objects.filter(name=orig.name).aggregate(models.Max("version"))["version__max"] or 0
    next_version = max_version + 1
    
    cloned = AssessmentTemplate.objects.create(
        name=orig.name,
        description=orig.description,
        instructions=orig.instructions,
        duration_minutes=orig.duration_minutes,
        version=next_version,
        status="draft",
        created_by=user
    )
    
    for q in orig.questions.all().order_by("display_order"):
        AssessmentQuestion.objects.create(
            template=cloned,
            title=q.title,
            prompt=q.prompt,
            starter_code=q.starter_code,
            hidden_tests=q.hidden_tests,
            marks=q.marks,
            display_order=q.display_order,
            language=q.language,
            starter_code_per_language=q.starter_code_per_language or {},
            visible_test_cases=q.visible_test_cases or [],
            hidden_test_cases=q.hidden_test_cases or [],
            execution_mode=q.execution_mode,
            function_name=q.function_name,
            time_limit_seconds=q.time_limit_seconds,
            memory_limit_mb=q.memory_limit_mb
        )
        
    log_audit(
        action="assessment_template_cloned",
        actor=user,
        target_type="AssessmentTemplate",
        target_id=cloned.id,
        target_label=cloned.name,
        metadata={"template_id": str(cloned.id), "original_template_id": str(orig.id), "version": cloned.version}
    )
    return cloned


# --- Candidate Assignment Services ---

@transaction.atomic
def create_candidate_assessment(application_id, template_id, assigned_by_user, attempt_number=1):
    from applications.models import Application

    application = Application.objects.select_for_update().get(pk=application_id)
    template = AssessmentTemplate.objects.get(pk=template_id)
    
    if template.status != "active":
        raise ValidationError("Assessment assignments can only be created from active templates.")
    
    # Conflict detection
    active_statuses = ["draft", "email_pending", "invited", "started", "submitted", "queued", "evaluating", "failed"]
    existing_active = CandidateAssessment.objects.filter(
        application=application,
        template=template,
        attempt_number=attempt_number,
        status__in=active_statuses
    ).exists()
    
    if existing_active:
        raise ValidationError("An active assessment assignment already exists for this application, template, and attempt.")
        
    questions_snapshot = []
    private_questions_snapshot = []
    total_marks = 0
    for q in template.questions.all().order_by("display_order"):
        questions_snapshot.append({
                "id": str(q.id),
                "display_order": q.display_order,
                "title": q.title,
                "prompt": q.prompt,
                "starter_code": q.starter_code,
                "starter_code_per_language": q.starter_code_per_language or {},
                "visible_test_cases": q.visible_test_cases or [],
                "execution_mode": q.execution_mode,
                "function_name": q.function_name,
                "time_limit_seconds": q.time_limit_seconds,
                "marks": q.marks,
                "language": q.language
            })
        private_questions_snapshot.append({
                "id": str(q.id),
                # Legacy notebook-based hidden tests (kept for backward compat)
                "hidden_tests": q.hidden_tests,
                # Structured hidden test cases for browser-based evaluation
                "hidden_test_cases": q.hidden_test_cases or [],
                "function_name": q.function_name,
                "execution_mode": q.execution_mode,
                "time_limit_seconds": q.time_limit_seconds,
                "memory_limit_mb": q.memory_limit_mb,
                "marks": q.marks
            })
        total_marks += q.marks
        
    snapshot = {
        "schema_version": "1.0",
        "template": {
            "id": str(template.id),
            "version": template.version,
            "name": template.name,
            "instructions": template.instructions,
            "duration_minutes": template.duration_minutes
        },
        "questions": questions_snapshot,
        "total_maximum_marks": total_marks
    }
    
    private_snapshot = {
        "schema_version": "1.0",
        "questions": private_questions_snapshot
    }
    
    raw_token = generate_raw_token()
    token_digest = get_token_digest(raw_token)
    
    assigned_at = timezone.now()
    token_expires_at = assigned_at + timezone.timedelta(days=7)
    assessment_deadline = assigned_at + timezone.timedelta(days=7)
    
    candidate_name = application.candidate_name or (application.candidate.get_full_name() if application.candidate else "Candidate")
    candidate_email = application.candidate_email or (application.candidate.email if application.candidate else "")
    
    try:
        # Create nested transaction check for IntegrityError portability
        with transaction.atomic():
            dev_raw_token = raw_token if getattr(settings, "DEBUG", False) else None
            assessment = CandidateAssessment.objects.create(
                application=application,
                template=template,
                template_version_snapshot=template.version,
                candidate_name_snapshot=candidate_name,
                candidate_email_snapshot=candidate_email,
                status="email_pending",
                secure_token_digest=token_digest,
                token_expires_at=token_expires_at,
                assessment_deadline=assessment_deadline,
                attempt_number=attempt_number,
                assigned_by=assigned_by_user,
                assigned_at=assigned_at,
                assessment_snapshot=snapshot,
                private_grading_snapshot=private_snapshot,
                dev_raw_token=dev_raw_token
            )
    except IntegrityError:
        raise ValidationError("An assessment assignment already exists for this application, template, and attempt.")
    
    log_audit(
        action="candidate_assessment_created",
        actor=assigned_by_user,
        target_type="CandidateAssessment",
        target_id=assessment.id,
        target_label=f"Attempt {attempt_number}",
        metadata={
            "assessment_id": str(assessment.id),
            "application_id": str(application_id),
            "template_id": str(template_id),
            "attempt_number": attempt_number,
            "status": assessment.status
        }
    )
    
    return assessment, raw_token


@transaction.atomic
def transition_candidate_assessment(candidate_assessment_id, new_status, updated_by_user, failure_code=None, failure_message=None):
    assessment = CandidateAssessment.objects.select_for_update().get(pk=candidate_assessment_id)
    old_status = assessment.status
    
    if old_status == new_status:
        return assessment
        
    valid_map = {
        "draft": ["email_pending", "cancelled"],
        "email_pending": ["invited", "failed", "cancelled"],
        "invited": ["started", "expired", "cancelled", "email_pending"],
        "started": ["submitted", "expired", "cancelled"],
        "submitted": ["queued"],
        "queued": ["evaluating", "failed"],
        "evaluating": ["graded", "failed"],
        "failed": ["queued", "cancelled", "email_pending"],
        "graded": [],
        "expired": [],
        "cancelled": []
    }
    
    allowed = valid_map.get(old_status, [])
    if new_status not in allowed:
        raise ValidationError(f"Invalid transition from {old_status} to {new_status}.")
        
    if new_status == "email_pending":
        if assessment.submissions.exists():
            raise ValidationError("Cannot resend invitation because a submission already exists.")
        if assessment.evaluation_started_at or assessment.evaluated_at:
            raise ValidationError("Cannot resend invitation because evaluation has already started.")
            
    now = timezone.now()
    if new_status == "started":
        assessment.started_at = now
    elif new_status == "submitted":
        assessment.submitted_at = now
    elif new_status == "evaluating":
        if not assessment.evaluation_started_at:
            assessment.evaluation_started_at = now
    elif new_status == "graded":
        assessment.evaluated_at = now
    elif new_status == "cancelled":
        assessment.cancelled_at = now
        
    if old_status == "failed" and new_status == "queued":
        assessment.failure_code = None
        assessment.safe_failure_message = None
    elif new_status == "failed":
        assessment.failure_code = failure_code
        assessment.safe_failure_message = failure_message
        
    assessment.status = new_status
    assessment.save()
    
    log_audit(
        action="candidate_assessment_status_changed",
        actor=updated_by_user,
        target_type="CandidateAssessment",
        target_id=assessment.id,
        target_label=assessment.status,
        metadata={
            "assessment_id": str(assessment.id),
            "old_status": old_status,
            "new_status": new_status,
        }
    )
    return assessment



# --- Email Event Log Service ---

EVENT_STATUS_MAP = {
    "request": "pending",
    "deferred": "deferred",
    "delivered": "delivered",
    "soft_bounce": "soft_bounced",
    "hard_bounce": "hard_bounced",
    "opened": "opened",
    "unique_opened": "opened",
    "clicked": "clicked",
    "complaint": "complaint",
    "blocked": "blocked",
    "invalid_email": "failed",
    "error": "failed",
}


@transaction.atomic
def record_email_event(provider_message_id, event_name, event_timestamp, failure_code=None, failure_message=None):
    if event_name not in EVENT_STATUS_MAP:
        raise ValidationError(f"Unsupported event name: {event_name}")
    if not is_aware(event_timestamp):
        raise ValidationError("Event timestamp must be timezone-aware.")
        
    assessment = CandidateAssessment.objects.select_for_update().filter(provider_message_id=provider_message_id).first()
    if not assessment:
        raise ValidationError(f"No candidate assessment found with provider_message_id {provider_message_id}")
        
    # Idempotency and stale update check
    if assessment.email_last_event_at and event_timestamp < assessment.email_last_event_at:
        return assessment
        
    mapped_status = EVENT_STATUS_MAP[event_name]
    state_changed = False
    
    # Monotonic timestamps update
    if event_name == "request":
        if not assessment.email_sent_at or event_timestamp > assessment.email_sent_at:
            assessment.email_sent_at = event_timestamp
            state_changed = True
    elif event_name == "delivered":
        if not assessment.email_delivered_at or event_timestamp > assessment.email_delivered_at:
            assessment.email_delivered_at = event_timestamp
            state_changed = True
    elif event_name in ["opened", "unique_opened"]:
        if not assessment.email_opened_at or event_timestamp > assessment.email_opened_at:
            assessment.email_opened_at = event_timestamp
            state_changed = True
    elif event_name == "clicked":
        if not assessment.email_clicked_at or event_timestamp > assessment.email_clicked_at:
            assessment.email_clicked_at = event_timestamp
            state_changed = True
    elif mapped_status == "failed":
        if not assessment.email_failed_at or event_timestamp > assessment.email_failed_at:
            assessment.email_failed_at = event_timestamp
            assessment.email_failure_code = failure_code
            assessment.email_failure_message = failure_message
            state_changed = True

    if assessment.email_status != mapped_status:
        assessment.email_status = mapped_status
        state_changed = True
        
    if state_changed or (assessment.email_last_event_at != event_timestamp):
        assessment.email_last_event_at = event_timestamp
        assessment.save()
        
        # Only audit if something has actually mutated
        log_audit(
            action="assessment_email_status_changed",
            actor=None,  # Null actor for automated webhooks
            target_type="CandidateAssessment",
            target_id=assessment.id,
            target_label=assessment.email_status,
            metadata={
                "assessment_id": str(assessment.id),
                "email_status": assessment.email_status,
                "event_name": event_name,
            }
        )
        
    return assessment


def assign_and_send_assessment(application_id, template_id, deadline, recruiter_user):
    """
    Checks eligibility allowlist, locks application, computes new attempt number,
    and calls existing create_candidate_assessment to initialize assignment.
    Creates a pending AssessmentEmailDelivery record.
    External Brevo send is called OUTSIDE the transaction.
    """
    if not getattr(settings, "ASSESSMENT_INVITATIONS_ENABLED", False):
        raise ValidationError(
            "Invitation delivery will be available after candidate assessment access is configured.",
            code="assessment_invitations_disabled"
        )

    with transaction.atomic():
        from applications.models import Application
        try:
            application = Application.objects.select_for_update().get(pk=application_id)
        except Application.DoesNotExist:
            raise ValidationError("Application not found.")

        is_staff_or_super = recruiter_user.is_staff or recruiter_user.is_superuser
        if not is_staff_or_super:
            if application.job.hr_user != recruiter_user:
                raise ValidationError("You do not own this application's job posting.")

        eligible_statuses = ['pending', 'shortlisted']
        if application.application_status not in eligible_statuses:
            raise ValidationError(
                f"Candidate is ineligible for assessment in status '{application.application_status}'."
            )

        candidate_email = application.candidate_email or (application.candidate.email if application.candidate else "")
        if not candidate_email:
            raise ValidationError("Candidate email is missing on the application.")
        try:
            from django.core.validators import EmailValidator
            validator = EmailValidator()
            validator(candidate_email)
        except ValidationError:
            raise ValidationError("Candidate email is syntactically invalid.")

        try:
            template = AssessmentTemplate.objects.get(pk=template_id)
        except AssessmentTemplate.DoesNotExist:
            raise ValidationError("Template not found.")

        if template.status != "active":
            raise ValidationError("Assessment assignments can only be created from active templates.")

        if not is_staff_or_super:
            if template.created_by != recruiter_user:
                raise ValidationError("You do not own this template.")

        if not deadline:
            raise ValidationError("Deadline is required.")
        if not is_aware(deadline):
            raise ValidationError("Deadline must be timezone-aware.")
        now = timezone.now()
        if deadline <= now:
            raise ValidationError("Deadline must be in the future.")
        max_days = getattr(settings, "MAX_INVITATION_LIFETIME_DAYS", 30)
        if deadline > now + timezone.timedelta(days=max_days):
            raise ValidationError(f"Deadline cannot exceed the maximum lifetime of {max_days} days.")

        active_statuses = ["draft", "email_pending", "invited", "started", "submitted", "queued", "evaluating", "failed"]
        conflicting_assessment = CandidateAssessment.objects.filter(
            application=application,
            status__in=active_statuses
        ).exists()
        if conflicting_assessment:
            raise ValidationError("An active assessment assignment already exists for this application.")

        max_attempt = CandidateAssessment.objects.filter(
            application=application,
            template=template
        ).aggregate(models.Max('attempt_number'))['attempt_number__max'] or 0
        next_attempt = max_attempt + 1

        assessment, raw_token = create_candidate_assessment(
            application_id=application.id,
            template_id=template.id,
            assigned_by_user=recruiter_user,
            attempt_number=next_attempt
        )
        assessment.assessment_deadline = deadline
        assessment.token_expires_at = deadline
        assessment.save()

        delivery = AssessmentEmailDelivery.objects.create(
            candidate_assessment=assessment,
            send_attempt=1,
            provider="brevo",
            status="pending",
            recipient_email_snapshot=candidate_email,
            requested_by=recruiter_user,
            secure_token_digest=get_token_digest(raw_token)
        )

        log_audit(
            action="assessment_invitation_requested",
            actor=recruiter_user,
            target_type="CandidateAssessment",
            target_id=str(assessment.id),
            target_label=f"Attempt {next_attempt}",
            metadata={
                "assessment_id": str(assessment.id),
                "application_id": str(application.id),
                "template_id": str(template.id),
                "send_attempt": 1
            }
        )

    # Invoke Brevo SMTP request outside any database transaction context
    frontend_url = getattr(settings, "ASSESSMENT_FRONTEND_URL", "http://localhost:5173/assessments")
    if not frontend_url.endswith("/"):
        frontend_url += "/"
    raw_url = urljoin(frontend_url, f"take/{raw_token}/")
    if not settings.DEBUG and not raw_url.startswith("https://"):
        if raw_url.startswith("http://"):
            raw_url = "https://" + raw_url[7:]
        else:
            raw_url = "https://" + raw_url

    candidate_name = assessment.candidate_name_snapshot
    recruiter_name = recruiter_user.get_full_name() or recruiter_user.username
    assessment_name = template.name
    assessment_duration = template.duration_minutes
    assessment_deadline_str = deadline.strftime("%Y-%m-%d %H:%M:%S %Z")

    from .email_providers.brevo import send_assessment_invitation_email
    res = send_assessment_invitation_email(
        candidate_email=candidate_email,
        candidate_name=candidate_name,
        recruiter_name=recruiter_name,
        assessment_name=assessment_name,
        assessment_duration=assessment_duration,
        assessment_deadline_str=assessment_deadline_str,
        assessment_url=raw_url
    )

    with transaction.atomic():
        delivery = AssessmentEmailDelivery.objects.select_for_update().get(pk=delivery.id)
        assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)

        if res["accepted"]:
            norm_id = normalize_message_id(res["provider_message_id"])
            delivery.status = "accepted"
            delivery.accepted_at = timezone.now()
            delivery.provider_message_id = norm_id
            delivery.save()

            transition_candidate_assessment(
                candidate_assessment_id=assessment.id,
                new_status="invited",
                updated_by_user=recruiter_user
            )

            # Update parent summary fields
            assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
            assessment.email_provider = "brevo"
            assessment.email_status = "invited"
            assessment.provider_message_id = norm_id
            assessment.email_sent_at = timezone.now()
            assessment.email_last_event_at = timezone.now()
            assessment.save()

            log_audit(
                action="assessment_invitation_accepted",
                actor=recruiter_user,
                target_type="CandidateAssessment",
                target_id=str(assessment.id),
                target_label="invited",
                metadata={
                    "assessment_id": str(assessment.id),
                    "send_attempt": 1,
                }
            )
        else:
            failure_code = res["failure_code"] or "provider_outcome_unknown"
            safe_msg = res["safe_failure_message"] or "Email sending failed."

            delivery.status = "failed"
            delivery.failed_at = timezone.now()
            delivery.failure_code = failure_code
            delivery.safe_failure_message = safe_msg
            delivery.save()

            transition_candidate_assessment(
                candidate_assessment_id=assessment.id,
                new_status="failed",
                updated_by_user=recruiter_user,
                failure_code=failure_code,
                failure_message=safe_msg
            )

            # Update parent summary fields
            assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
            assessment.email_provider = "brevo"
            assessment.email_status = "failed"
            assessment.email_failed_at = timezone.now()
            assessment.email_last_event_at = timezone.now()
            assessment.email_failure_code = failure_code
            assessment.email_failure_message = safe_msg
            assessment.save()

            log_audit(
                action="assessment_invitation_failed",
                actor=recruiter_user,
                target_type="CandidateAssessment",
                target_id=str(assessment.id),
                target_label="failed",
                metadata={
                    "assessment_id": str(assessment.id),
                    "send_attempt": 1,
                    "failure_code": failure_code
                }
            )

    return assessment


def resend_assessment_invitation(assessment_id, recruiter_user, new_deadline=None):
    """
    Resends/rotates token for a candidate assessment.
    """
    if not getattr(settings, "ASSESSMENT_INVITATIONS_ENABLED", False):
        raise ValidationError(
            "Invitation delivery will be available after candidate assessment access is configured.",
            code="assessment_invitations_disabled"
        )

    with transaction.atomic():
        try:
            assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment_id)
        except CandidateAssessment.DoesNotExist:
            raise ValidationError("Assessment assignment not found.")

        is_staff_or_super = recruiter_user.is_staff or recruiter_user.is_superuser
        if not is_staff_or_super:
            if assessment.application.job.hr_user != recruiter_user:
                raise ValidationError("You do not own this application's job posting.")

        pending_delivery_exists = AssessmentEmailDelivery.objects.filter(
            candidate_assessment=assessment,
            status="pending"
        ).exists()
        if pending_delivery_exists:
            raise ValidationError(
                "An assessment invitation delivery is currently in progress.",
                code="assessment_delivery_in_progress"
            )

        transition_candidate_assessment(
            candidate_assessment_id=assessment.id,
            new_status="email_pending",
            updated_by_user=recruiter_user
        )

        # Reload locked assessment
        assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment_id)

        if new_deadline:
            if not is_aware(new_deadline):
                raise ValidationError("Deadline must be timezone-aware.")
            now = timezone.now()
            if new_deadline <= now:
                raise ValidationError("Deadline must be in the future.")
            max_days = getattr(settings, "MAX_INVITATION_LIFETIME_DAYS", 30)
            if new_deadline > now + timezone.timedelta(days=max_days):
                raise ValidationError(f"Deadline cannot exceed the maximum lifetime of {max_days} days.")
            assessment.assessment_deadline = new_deadline

        # Token rotation
        raw_token = generate_raw_token()
        token_digest = get_token_digest(raw_token)

        assessment.secure_token_digest = token_digest
        assessment.token_expires_at = assessment.assessment_deadline
        assessment.save()

        max_send_attempt = AssessmentEmailDelivery.objects.filter(
            candidate_assessment=assessment
        ).aggregate(models.Max('send_attempt'))['send_attempt__max'] or 0
        next_send_attempt = max_send_attempt + 1

        delivery = AssessmentEmailDelivery.objects.create(
            candidate_assessment=assessment,
            send_attempt=next_send_attempt,
            provider="brevo",
            status="pending",
            recipient_email_snapshot=assessment.candidate_email_snapshot,
            requested_by=recruiter_user,
            secure_token_digest=token_digest
        )

        log_audit(
            action="assessment_invitation_resent",
            actor=recruiter_user,
            target_type="CandidateAssessment",
            target_id=str(assessment.id),
            target_label=f"Attempt {next_send_attempt}",
            metadata={
                "assessment_id": str(assessment.id),
                "send_attempt": next_send_attempt,
            }
        )

    # Invoke Brevo SMTP request outside transaction
    frontend_url = getattr(settings, "ASSESSMENT_FRONTEND_URL", "http://localhost:5173/assessments")
    if not frontend_url.endswith("/"):
        frontend_url += "/"
    raw_url = urljoin(frontend_url, f"take/{raw_token}/")
    if not settings.DEBUG and not raw_url.startswith("https://"):
        if raw_url.startswith("http://"):
            raw_url = "https://" + raw_url[7:]
        else:
            raw_url = "https://" + raw_url

    candidate_name = assessment.candidate_name_snapshot
    candidate_email = assessment.candidate_email_snapshot
    recruiter_name = recruiter_user.get_full_name() or recruiter_user.username
    assessment_name = assessment.template.name
    assessment_duration = assessment.template.duration_minutes
    assessment_deadline_str = assessment.assessment_deadline.strftime("%Y-%m-%d %H:%M:%S %Z")

    from .email_providers.brevo import send_assessment_invitation_email
    res = send_assessment_invitation_email(
        candidate_email=candidate_email,
        candidate_name=candidate_name,
        recruiter_name=recruiter_name,
        assessment_name=assessment_name,
        assessment_duration=assessment_duration,
        assessment_deadline_str=assessment_deadline_str,
        assessment_url=raw_url
    )

    with transaction.atomic():
        delivery = AssessmentEmailDelivery.objects.select_for_update().get(pk=delivery.id)
        assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)

        max_send_attempt = AssessmentEmailDelivery.objects.filter(
            candidate_assessment=assessment
        ).aggregate(models.Max('send_attempt'))['send_attempt__max'] or 0

        is_latest = (delivery.send_attempt == max_send_attempt)

        if res["accepted"]:
            norm_id = normalize_message_id(res["provider_message_id"])
            delivery.status = "accepted"
            delivery.accepted_at = timezone.now()
            delivery.provider_message_id = norm_id
            delivery.save()

            transition_candidate_assessment(
                candidate_assessment_id=assessment.id,
                new_status="invited",
                updated_by_user=recruiter_user
            )

            if is_latest:
                assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
                assessment.email_provider = "brevo"
                assessment.email_status = "invited"
                assessment.provider_message_id = norm_id
                assessment.email_sent_at = timezone.now()
                assessment.email_last_event_at = timezone.now()
                assessment.email_failure_code = None
                assessment.email_failure_message = None
                assessment.save()

            log_audit(
                action="assessment_invitation_accepted",
                actor=recruiter_user,
                target_type="CandidateAssessment",
                target_id=str(assessment.id),
                target_label="invited",
                metadata={
                    "assessment_id": str(assessment.id),
                    "send_attempt": delivery.send_attempt,
                }
            )
        else:
            failure_code = res["failure_code"] or "provider_outcome_unknown"
            safe_msg = res["safe_failure_message"] or "Email sending failed."

            delivery.status = "failed"
            delivery.failed_at = timezone.now()
            delivery.failure_code = failure_code
            delivery.safe_failure_message = safe_msg
            delivery.save()

            transition_candidate_assessment(
                candidate_assessment_id=assessment.id,
                new_status="failed",
                updated_by_user=recruiter_user,
                failure_code=failure_code,
                failure_message=safe_msg
            )

            if is_latest:
                assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
                assessment.email_provider = "brevo"
                assessment.email_status = "failed"
                assessment.email_failed_at = timezone.now()
                assessment.email_last_event_at = timezone.now()
                assessment.email_failure_code = failure_code
                assessment.email_failure_message = safe_msg
                assessment.save()

            log_audit(
                action="assessment_invitation_failed",
                actor=recruiter_user,
                target_type="CandidateAssessment",
                target_id=str(assessment.id),
                target_label="failed",
                metadata={
                    "assessment_id": str(assessment.id),
                    "send_attempt": delivery.send_attempt,
                    "failure_code": failure_code
                }
            )

    return assessment


def normalize_message_id(msg_id):
    """
    Normalizes a provider message ID:
    - Must be a string
    - Trim surrounding whitespace
    - Remove one matching outer <...> pair only
    - Max length 255
    - Preserve case
    """
    if not isinstance(msg_id, str):
        raise ValueError("Message ID must be a string")
    msg_id = msg_id.strip()
    if msg_id.startswith("<") and msg_id.endswith(">"):
        msg_id = msg_id[1:-1]
    if len(msg_id) > 255:
        raise ValueError("Message ID exceeds maximum length of 255 characters")
    return msg_id


# --- Stage 4: Candidate Access, Notebook Generation & Submission Services ---

def get_and_start_assessment_by_token(token):
    """
    Retrieves the assessment by raw token.
    Checks for invalid, expired, and rotated/superseded tokens.
    On first valid access (when status is 'invited'), transitions status to 'started'.
    """
    digest = get_token_digest(token)
    assessment = CandidateAssessment.objects.filter(secure_token_digest=digest).first()
    
    if not assessment:
        # Check if this token was rotated/superseded
        if AssessmentEmailDelivery.objects.filter(secure_token_digest=digest).exists():
            raise ValidationError("This assessment token has been rotated and superseded.", code="superseded_token")
        raise ValidationError("Invalid assessment token.", code="invalid_token")
        
    if assessment.status == "cancelled":
        raise ValidationError("This assessment assignment has been cancelled.", code="assessment_not_accessible")
        
    now = timezone.now()
    if now > assessment.assessment_deadline or now > assessment.token_expires_at:
        if assessment.status in ("invited", "started"):
            # Progress status to expired
            transition_candidate_assessment(assessment.id, "expired", updated_by_user=None)
            # Reload
            assessment = CandidateAssessment.objects.get(pk=assessment.id)
        raise ValidationError("The assessment submission deadline has passed.", code="expired_token")
        
    # Transition invited -> started on first valid access
    if assessment.status == "invited":
        with transaction.atomic():
            assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
            if assessment.status == "invited":
                transition_candidate_assessment(assessment.id, "started", updated_by_user=None)
                assessment = CandidateAssessment.objects.get(pk=assessment.id)
                log_audit(
                    action="assessment_accessed_first_time",
                    actor=None,
                    target_type="CandidateAssessment",
                    target_id=assessment.id,
                    target_label="started",
                    metadata={
                        "assessment_id": str(assessment.id),
                        "started_at": assessment.started_at.isoformat()
                    }
                )
                
    return assessment


def generate_candidate_notebook(assessment):
    """
    Generates a clean candidate Jupyter notebook (v4) from the immutable snapshot.
    Excludes hidden tests, solutions, and scoring algorithms.
    """
    snapshot = assessment.assessment_snapshot
    nb = nbformat.v4.new_notebook()
    
    # 1. Header Title & Instructions
    title = snapshot["template"]["name"]
    instructions = snapshot["template"]["instructions"] or "Please read the instructions carefully."
    duration = snapshot["template"]["duration_minutes"]
    
    title_md = f"# Take-Home Assessment: {title}\n\n"
    title_md += f"**Instructions:**\n{instructions}\n\n"
    title_md += f"**Duration Limit:** {duration} minutes\n"
    nb.cells.append(nbformat.v4.new_markdown_cell(title_md))
    
    # 2. Deadline Info
    deadline = assessment.assessment_deadline.strftime("%Y-%m-%d %H:%M:%S %Z")
    deadline_md = (
        f"### Completion Guidance\n\n"
        f"- **Deadline:** Please complete and submit before **{deadline}**.\n"
        f"- Ensure you answer all question cells below.\n"
        f"- Do not modify the structure, metadata, or markers in this notebook.\n"
    )
    nb.cells.append(nbformat.v4.new_markdown_cell(deadline_md))
    
    # 3. visible questions
    questions = snapshot.get("questions", [])
    questions_sorted = sorted(questions, key=lambda q: q.get("display_order", 0))
    
    for idx, q in enumerate(questions_sorted):
        q_id = q.get("id")
        q_title = q.get("title", f"Question {idx + 1}")
        q_prompt = q.get("prompt", "")
        q_marks = q.get("marks", 0)
        
        prompt_md = (
            f"## {idx + 1}. {q_title} ({q_marks} Marks)\n\n"
            f"{q_prompt}\n"
        )
        nb.cells.append(nbformat.v4.new_markdown_cell(prompt_md))
        
        starter = q.get("starter_code", "")
        if not starter or not starter.strip():
            starter = f"# Write your solution for Question {idx + 1} here\n"
            
        code_cell = nbformat.v4.new_code_cell(starter)
        code_cell.metadata["screenai_question_id"] = str(q_id)
        nb.cells.append(code_cell)
        
    # Notebook Metadata
    nb.metadata["screenai_assessment_id"] = str(assessment.id)
    nb.metadata["screenai_attempt_number"] = assessment.attempt_number
    nb.metadata["screenai_marker"] = "screenai_assessment_notebook"
    
    return nbformat.writes(nb)


def save_candidate_upload(assessment, notebook_file):
    """
    Validates the uploaded Jupyter notebook file:
    - Checks file type (.ipynb) and file size (using settings.MAX_NOTEBOOK_UPLOAD_SIZE)
    - Validates valid JSON and nbformat v4 schema structure
    - Scans for metadata, markers, structure, and tag tampering
    - Overwrites existing active draft submission atomically or creates a new draft
    """
    if timezone.now() > assessment.assessment_deadline:
        raise ValidationError("The submission deadline has passed.", code="submission_deadline_passed")
    if assessment.status in ("submitted", "graded", "evaluating", "queued"):
        raise ValidationError("This assessment has already been submitted.", code="assessment_already_submitted")
        
    name = notebook_file.name.lower()
    if not name.endswith(".ipynb"):
        raise ValidationError("Only Jupyter Notebook (.ipynb) files are allowed.", code="invalid_notebook_file")
        
    max_size = getattr(settings, "MAX_NOTEBOOK_UPLOAD_SIZE", 2 * 1024 * 1024)
    if notebook_file.size > max_size:
        raise ValidationError("The uploaded file exceeds the size limit.", code="notebook_too_large")
        
    try:
        content_bytes = notebook_file.read()
        notebook_file.seek(0)
        content_str = content_bytes.decode("utf-8")
        json.loads(content_str)
    except Exception:
        raise ValidationError("Failed to parse notebook JSON content.", code="notebook_parse_failed")
        
    try:
        nb = nbformat.reads(content_str, as_version=4)
    except Exception:
        raise ValidationError("Invalid notebook schema or format.", code="notebook_schema_invalid")
        
    # Anti-tampering validation
    nb_metadata = nb.get("metadata", {})
    if nb_metadata.get("screenai_marker") != "screenai_assessment_notebook":
        raise ValidationError("Notebook tampering detected: missing ScreenAI markers.", code="notebook_tampering_detected")
    if nb_metadata.get("screenai_assessment_id") != str(assessment.id):
        raise ValidationError("Notebook tampering detected: assessment ID mismatch.", code="notebook_tampering_detected")
        
    snapshot = assessment.assessment_snapshot
    expected_q_ids = {q["id"] for q in snapshot.get("questions", [])}
    
    uploaded_q_ids = set()
    for cell in nb.get("cells", []):
        cell_meta = cell.get("metadata", {})
        q_id = cell_meta.get("screenai_question_id")
        if q_id:
            uploaded_q_ids.add(q_id)
            
    if not expected_q_ids.issubset(uploaded_q_ids):
        raise ValidationError("Notebook tampering detected: question structure is modified.", code="notebook_tampering_detected")
        
    for cell in nb.get("cells", []):
        cell_meta = cell.get("metadata", {})
        if cell_meta.get("hidden") is True or "hidden" in cell_meta.get("tags", []):
            raise ValidationError("Notebook tampering detected: forbidden cell metadata tags found.", code="notebook_tampering_detected")
        
        source_str = cell.get("source", "")
        if isinstance(source_str, list):
            source_str = "".join(source_str)
        if "screenai_grader" in source_str or "screenai_hidden_test" in source_str:
            raise ValidationError("Notebook tampering detected: forbidden grader/test markers found.", code="notebook_tampering_detected")
            
    sha256 = hashlib.sha256(content_bytes).hexdigest()
    
    with transaction.atomic():
        submission = AssessmentSubmission.objects.filter(
            candidate_assessment=assessment,
            attempt_number=assessment.attempt_number
        ).select_for_update().first()
        
        filename = f"assessment_{assessment.id}_attempt_{assessment.attempt_number}_submission.ipynb"
        
        if submission:
            if submission.status == "submitted":
                raise ValidationError("Cannot modify final submission.", code="assessment_already_submitted")
                
            if submission.private_notebook:
                try:
                    submission.private_notebook.delete(save=False)
                except Exception as e:
                    print(f"Error deleting old notebook: {e}")
                    
            submission.private_notebook.save(filename, notebook_file, save=False)
            submission.original_filename = notebook_file.name
            submission.file_size = notebook_file.size
            submission.sha256_digest = sha256
            submission.status = "uploaded"
            submission.save()
        else:
            submission = AssessmentSubmission(
                candidate_assessment=assessment,
                attempt_number=assessment.attempt_number,
                original_filename=notebook_file.name,
                file_size=notebook_file.size,
                sha256_digest=sha256,
                status="uploaded"
            )
            submission.private_notebook.save(filename, notebook_file, save=False)
            submission.save()
            
        log_audit(
            action="assessment_upload_saved",
            actor=None,
            target_type="CandidateAssessment",
            target_id=assessment.id,
            target_label=submission.original_filename,
            metadata={
                "assessment_id": str(assessment.id),
                "submission_id": str(submission.id),
                "file_size": submission.file_size,
                "sha256_digest": submission.sha256_digest
            }
        )
        
    return submission


def save_candidate_answers(assessment, answers_dict):
    """
    Saves/updates candidate answers and selected language.
    answers_dict is a dictionary of:
      {question_id: answer_text}  — legacy format
      OR
      {question_id: {"code": answer_text, "language": "python"|"javascript"}}  — new format
    """
    if timezone.now() > assessment.assessment_deadline:
        raise ValidationError("The submission deadline has passed.", code="submission_deadline_passed")

    with transaction.atomic():
        # Reload and lock
        assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
        if assessment.status in ("submitted", "graded", "evaluating", "queued"):
            raise ValidationError("This assessment has already been submitted.", code="assessment_already_submitted")

        if assessment.status not in ("started", "invited"):
            raise ValidationError("This assessment is not in an editable state.", code="assessment_not_accessible")

        snapshot = assessment.assessment_snapshot
        valid_q_ids = {q["id"] for q in snapshot.get("questions", [])}

        for q_id, answer_data in answers_dict.items():
            if str(q_id) not in valid_q_ids:
                raise ValidationError(f"Invalid question ID {q_id} for this assessment.", code="invalid_question")

            # Support both legacy string format and new {code, language} format
            if isinstance(answer_data, dict):
                answer_text = answer_data.get("code", "")
                selected_language = answer_data.get("language", "python")
            else:
                answer_text = answer_data
                selected_language = "python"

            # Validate language choice
            supported_langs = {"python", "javascript"}
            if selected_language not in supported_langs:
                selected_language = "python"

            question = AssessmentQuestion.objects.get(pk=q_id)
            CandidateAnswer.objects.update_or_create(
                candidate_assessment=assessment,
                question=question,
                defaults={
                    "answer_text": answer_text,
                    "selected_language": selected_language,
                }
            )

        log_audit(
            action="assessment_answers_saved",
            actor=None,
            target_type="CandidateAssessment",
            target_id=assessment.id,
            target_label="answers_saved",
            metadata={
                "assessment_id": str(assessment.id),
                "questions_saved": list(answers_dict.keys())
            }
        )


def run_candidate_visible_tests(assessment, question_id, code, language):
    """
    Runs candidate code against the visible sample test cases for a given question.
    Returns structured per-test-case results (with expected output for visible tests).

    This is NEVER used for grading — hidden tests are never involved here.
    Candidate-facing: includes input, expected_output, actual_output, status, runtime_ms.

    Args:
        assessment: CandidateAssessment instance
        question_id: str UUID of the question
        code: candidate code string
        language: "python" or "javascript"

    Returns:
        dict with keys: status, total, passed, failed, runtime_ms, test_results

    Raises:
        ValidationError on access or config errors.
        RuntimeError if Docker is unavailable.
        ValueError if language is unsupported.
    """
    from .evaluator import run_structured_test_cases, SUPPORTED_LANGUAGES

    if language not in SUPPORTED_LANGUAGES:
        raise ValidationError(
            f"Unsupported language: {language}. Supported: {', '.join(sorted(SUPPORTED_LANGUAGES))}",
            code="unsupported_language"
        )

    # Validate question belongs to this assessment snapshot
    snapshot = assessment.assessment_snapshot
    question_data = None
    for q in snapshot.get("questions", []):
        if str(q.get("id")) == str(question_id):
            question_data = q
            break

    if question_data is None:
        raise ValidationError(
            f"Question {question_id} not found in this assessment.",
            code="invalid_question"
        )

    visible_test_cases = question_data.get("visible_test_cases", [])
    function_name = question_data.get("function_name", "")
    time_limit = question_data.get("time_limit_seconds", 5)

    # If the question has no visible test cases defined, return a helpful message
    if not visible_test_cases:
        return {
            "status": "no_test_cases",
            "total": 0,
            "passed": 0,
            "failed": 0,
            "runtime_ms": 0,
            "test_results": [],
            "message": "This question has no visible sample test cases."
        }

    memory_mb = getattr(__import__("django.conf", fromlist=["settings"]).settings,
                        "EVALUATOR_MEMORY_MB", 256)

    test_results = run_structured_test_cases(
        code=code,
        language=language,
        test_cases=visible_test_cases,
        function_name=function_name,
        time_limit_seconds=time_limit,
        memory_limit_mb=memory_mb,
        include_expected_output=True,   # Visible tests: show expected output to candidate
    )

    passed = sum(1 for r in test_results if r.get("status") == "passed")
    failed = len(test_results) - passed
    total_runtime = sum(r.get("runtime_ms", 0) for r in test_results)

    return {
        "status": "completed",
        "total": len(test_results),
        "passed": passed,
        "failed": failed,
        "runtime_ms": total_runtime,
        "test_results": test_results,
    }


def submit_candidate_assessment(assessment):

    """
    Finalizes submission:
    - Transitions CandidateAssessment to status='submitted'
    - Creates or updates AssessmentSubmission status='submitted' and records submitted_at
    """
    if timezone.now() > assessment.assessment_deadline:
        raise ValidationError("The submission deadline has passed.", code="submission_deadline_passed")
        
    with transaction.atomic():
        assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
        if assessment.status in ("submitted", "graded", "evaluating", "queued"):
            raise ValidationError("This assessment has already been submitted.", code="assessment_already_submitted")
            
        if assessment.status not in ("started", "invited"):
            raise ValidationError("This assessment is not in a submittable state.", code="assessment_not_accessible")
            
        # Check if DB answers exist and are not empty
        answers_qs = CandidateAnswer.objects.filter(candidate_assessment=assessment)
        has_db_answers = answers_qs.exists() and any(ans.answer_text.strip() for ans in answers_qs)
        
        submission = AssessmentSubmission.objects.filter(
            candidate_assessment=assessment,
            attempt_number=assessment.attempt_number
        ).select_for_update().first()
        
        has_notebook = submission is not None and bool(submission.private_notebook)
        
        # Detect if this is a browser-based coding assessment
        questions = assessment.assessment_snapshot.get("questions", [])
        is_browser_coding = any(
            bool(q.get("visible_test_cases")) or 
            bool(q.get("hidden_test_cases")) or 
            bool(q.get("starter_code_per_language"))
            for q in questions
        )
        
        if not has_db_answers and not has_notebook:
            if is_browser_coding or answers_qs.exists():
                raise ValidationError("Cannot submit an empty assessment. Please write answers in the workspace first.", code="empty_submission")
            else:
                raise ValidationError("Notebook upload is required before submitting.", code="notebook_required")
            
        transition_candidate_assessment(assessment.id, "submitted", updated_by_user=None)
        
        # Refresh locked models
        assessment = CandidateAssessment.objects.get(pk=assessment.id)
        if not submission:
            submission = AssessmentSubmission.objects.create(
                candidate_assessment=assessment,
                attempt_number=assessment.attempt_number,
                original_filename="browser_submission",
                file_size=0,
                sha256_digest="",
                status="submitted",
                submitted_at=timezone.now()
            )
        else:
            submission.status = "submitted"
            submission.submitted_at = timezone.now()
            submission.save()
            
        log_audit(
            action="assessment_submitted",
            actor=None,
            target_type="CandidateAssessment",
            target_id=assessment.id,
            target_label="submitted",
            metadata={
                "assessment_id": str(assessment.id),
                "submission_id": str(submission.id),
                "submitted_at": submission.submitted_at.isoformat()
            }
        )
        
    return assessment


# --- Stage 5: Secure Notebook Evaluation Services ---

class EvaluationError(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(message)


@transaction.atomic
def queue_submission_for_evaluation(assessment_id, queued_by_user):
    """
    Transitions candidate assessment status from submitted to queued.
    """
    assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment_id)
    if assessment.status == "queued":
        return assessment
    if assessment.status != "submitted":
        raise ValidationError("Only submitted assessments can be queued for evaluation.")
    
    return transition_candidate_assessment(assessment.id, "queued", updated_by_user=queued_by_user)


def trigger_evaluation_in_background(assessment_id):
    """
    Spawns a daemon thread that immediately claims and evaluates the given queued assessment.

    This is safe to call from a Django view — the thread is non-blocking and uses its
    own DB connection. Intended for development and single-worker setups.
    For production PostgreSQL multi-worker deployments, process_assessments management
    command remains the primary mechanism.
    """
    import threading
    from django.db import connection as _conn

    def _run():
        try:
            # Give the committing transaction a moment to fully flush
            import time
            time.sleep(0.2)

            from django.db import connection as thread_conn
            # Re-fetch to confirm it's still queued (race-safe)
            try:
                assessment = CandidateAssessment.objects.get(pk=assessment_id, status="queued")
            except CandidateAssessment.DoesNotExist:
                logger.info(
                    f"[bg-eval] Assessment {assessment_id} is no longer queued — skipping background evaluation."
                )
                return

            claimed = claim_next_assessments_for_worker(batch_size=1)
            if not claimed:
                logger.info(f"[bg-eval] No assessments claimed for {assessment_id}.")
                return

            logger.info(f"[bg-eval] Starting background evaluation for assessment {assessment_id}.")
            evaluate_candidate_assessment(claimed[0])
            logger.info(f"[bg-eval] Background evaluation complete for assessment {assessment_id}.")
        except Exception as e:
            logger.exception(f"[bg-eval] Unexpected error during background evaluation of {assessment_id}: {e}")
        finally:
            from django.db import connections
            connections.close_all()

    t = threading.Thread(target=_run, daemon=True, name=f"eval-{assessment_id}")
    t.start()


def claim_next_assessments_for_worker(batch_size=5):
    """
    DB-vendor-aware lock and claim.
    Transitions queued assessments to evaluating, incrementing attempt counts.
    Sets submission evaluation_started_at.
    """
    from django.db import connection
    
    with transaction.atomic():
        if connection.vendor == "postgresql":
            # PostgreSQL skip_locked allows multiple workers to safely run in parallel
            qs = CandidateAssessment.objects.filter(status="queued").select_for_update(skip_locked=True)
        else:
            # SQLite dev fallback (plain select_for_update, no skip_locked support)
            qs = CandidateAssessment.objects.filter(status="queued").select_for_update()
            
        claimed = list(qs[:batch_size])
        if not claimed:
            return []
            
        now = timezone.now()
        for assessment in claimed:
            assessment.evaluation_attempt_count += 1
            assessment.save(update_fields=["evaluation_attempt_count"])
            
            # Transition to evaluating
            transition_candidate_assessment(assessment.id, "evaluating", updated_by_user=None)
            
            # Update submission
            submission = assessment.submissions.filter(attempt_number=assessment.attempt_number).first()
            if submission:
                submission.evaluation_started_at = now
                submission.save(update_fields=["evaluation_started_at"])
                
        return claimed


def evaluate_candidate_assessment(assessment, _submission=None):
    """
    Orchestrates the sandboxed evaluation of a CandidateAssessment.

    Answer source priority:
      1. DB answers (CandidateAnswer) — browser-based flow (primary)
      2. Uploaded notebook file      — legacy notebook flow (fallback, only if no DB answers)
      3. No answers at all           — graceful fail with stable code, no crash

    Evaluation path:
      A. NEW — if questions have structured hidden_test_cases: uses run_structured_test_cases
               with per-question language from CandidateAnswer.selected_language
      B. LEGACY — if questions only have hidden_tests text: uses build_private_test_harness
                  (notebook-style Python assertion blocks)

    Parses output and saves results or fail state.
    """
    from .evaluator import (
        extract_candidate_answers_from_notebook,
        build_private_test_harness,
        run_docker_sandbox,
        parse_harness_output,
        run_structured_test_cases,
    )

    # Resolve submission — accepts an injected submission for testing, otherwise DB lookup
    submission = _submission if _submission is not None else (
        assessment.submissions.filter(attempt_number=assessment.attempt_number).first()
    )

    try:
        grading_snapshot = assessment.private_grading_snapshot
        questions = grading_snapshot.get("questions", [])
        if not questions:
            raise EvaluationError("empty_grading_snapshot", "Private grading snapshot contains no questions.")

        question_ids = [q["id"] for q in questions]

        # ── 1. Determine answer source ──────────────────────────────────────────
        answers_qs = CandidateAnswer.objects.filter(candidate_assessment=assessment)

        if answers_qs.exists():
            # PRIMARY: browser-based DB answers
            logger.info(
                f"[{assessment.id}] Evaluating from DB answers "
                f"({answers_qs.count()} records)."
            )
            # Build answers map: {question_id: {"code": str, "language": str}}
            answers_map = {
                str(ans.question_id): {"code": ans.answer_text, "language": ans.selected_language}
                for ans in answers_qs
            }
            # Legacy compatibility: also build plain string map for old harness
            candidate_answers = {q_id: answers_map.get(q_id, {"code": "", "language": "python"})
                                  for q_id in question_ids}

        elif submission is not None and submission.private_notebook:
            # FALLBACK: legacy notebook upload — only if the file exists
            if submission.private_notebook:
                logger.info(
                    f"[{assessment.id}] No DB answers found. "
                    f"Falling back to legacy notebook: {submission.private_notebook.name}."
                )
                try:
                    try:
                        notebook_file = submission.private_notebook.path
                    except (AttributeError, NotImplementedError):
                        notebook_file = submission.private_notebook
                    notebook_answers = extract_candidate_answers_from_notebook(
                        notebook_file, question_ids
                    )
                    # Wrap as {code, language} dict for unified handling below
                    candidate_answers = {
                        q_id: {"code": code, "language": "python"}
                        for q_id, code in notebook_answers.items()
                    }
                except Exception as e:
                    raise EvaluationError(
                        "candidate_runtime_error",
                        f"Failed to parse candidate notebook: {e}"
                    )
            else:
                logger.warning(
                    f"[{assessment.id}] private_notebook field is not set. Failing gracefully."
                )
                raise EvaluationError(
                    "submission_missing",
                    "No candidate answers found and the legacy notebook file is missing. "
                    "This assessment cannot be graded."
                )

        else:
            logger.warning(
                f"[{assessment.id}] No DB answers and no notebook submission. "
                f"Failing gracefully."
            )
            raise EvaluationError(
                "submission_missing",
                "No candidate answers exist (neither browser-based DB answers nor a "
                "legacy notebook file). This assessment cannot be graded."
            )

        # ── 2. Choose evaluation path (new structured vs legacy text harness) ────
        # A question uses the new path if it has at least one structured hidden test case.
        new_style_questions = [q for q in questions if q.get("hidden_test_cases")]
        legacy_questions = [q for q in questions if not q.get("hidden_test_cases")]

        results = []  # normalized list of {id, status, passed_tests, failed_tests, ...}

        # ── 2A. NEW PATH: structured hidden_test_cases ──────────────────────────
        if new_style_questions:
            memory_mb = getattr(__import__("django.conf", fromlist=["settings"]).settings,
                                "EVALUATOR_MEMORY_MB", 256)
            for q in new_style_questions:
                q_id = q["id"]
                answer_data = candidate_answers.get(q_id, {"code": "", "language": "python"})
                if isinstance(answer_data, str):
                    code = answer_data
                    language = "python"
                else:
                    code = answer_data.get("code", "")
                    language = answer_data.get("language", "python")

                hidden_tcs = q.get("hidden_test_cases", [])
                fn_name = q.get("function_name", "")
                time_limit = q.get("time_limit_seconds", 5)
                mem = q.get("memory_limit_mb") or memory_mb

                try:
                    tc_results = run_structured_test_cases(
                        code=code,
                        language=language,
                        test_cases=hidden_tcs,
                        function_name=fn_name,
                        time_limit_seconds=time_limit,
                        memory_limit_mb=mem,
                        include_expected_output=False,  # NEVER expose hidden test expected output
                    )
                    passed = sum(1 for r in tc_results if r.get("status") == "passed")
                    failed = len(tc_results) - passed
                    any_timeout = any(r.get("status") == "time_limit_exceeded" for r in tc_results)
                    any_oom = any(r.get("status") == "memory_limit_exceeded" for r in tc_results)
                    any_error = any(r.get("status") in ("runtime_error", "syntax_error") for r in tc_results)

                    if any_timeout:
                        q_status = "timeout"
                    elif any_oom:
                        q_status = "error"
                    elif any_error and passed == 0:
                        q_status = "error"
                    elif failed > 0:
                        q_status = "failed"
                    elif passed > 0:
                        q_status = "passed"
                    else:
                        q_status = "skipped"

                    # Build safe stdout summary (no hidden test inputs/outputs)
                    safe_summary_parts = [f"Tests: {passed}/{len(tc_results)} passed"]
                    if any_timeout:
                        safe_summary_parts.append("Time limit exceeded on some tests.")
                    elif any_error:
                        first_err = next((r.get("error", "") for r in tc_results if r.get("error")), "")
                        if first_err:
                            safe_summary_parts.append(f"Error: {first_err[:500]}")

                    results.append({
                        "id": q_id,
                        "status": q_status,
                        "passed_tests": passed,
                        "failed_tests": failed,
                        "safe_stdout_summary": " | ".join(safe_summary_parts),
                        "feedback": f"{passed} of {len(tc_results)} hidden tests passed.",
                    })
                except RuntimeError as e:
                    err_msg = str(e)
                    if "Docker command not found" in err_msg or "docker" in err_msg.lower():
                        raise EvaluationError(
                            "docker_unavailable",
                            f"Sandbox environment is currently unavailable: {e}"
                        )
                    raise EvaluationError("evaluator_internal_error", f"Docker execution error: {e}")
                except ValueError as e:
                    # Unsupported language
                    results.append({
                        "id": q_id,
                        "status": "error",
                        "passed_tests": 0,
                        "failed_tests": len(hidden_tcs),
                        "safe_stdout_summary": str(e),
                        "feedback": str(e),
                    })

        # ── 2B. LEGACY PATH: free-text hidden_tests assertion blocks ────────────
        if legacy_questions:
            # Build legacy candidate_answers dict (plain strings)
            legacy_candidate_answers = {
                q["id"]: (
                    candidate_answers.get(q["id"], {}).get("code", "")
                    if isinstance(candidate_answers.get(q["id"]), dict)
                    else candidate_answers.get(q["id"], "")
                )
                for q in legacy_questions
            }

            harness_code = build_private_test_harness(legacy_candidate_answers, legacy_questions)
            try:
                sandbox_res = run_docker_sandbox(harness_code)
            except Exception as e:
                err_msg = str(e)
                if "Docker command not found" in err_msg or "docker" in err_msg.lower():
                    raise EvaluationError(
                        "docker_unavailable",
                        f"Sandbox environment is currently unavailable: {e}"
                    )
                raise EvaluationError("evaluator_internal_error", f"Docker execution error: {e}")

            if sandbox_res.is_timeout:
                raise EvaluationError("sandbox_timeout", "Docker execution timed out.")
            if sandbox_res.is_oom:
                raise EvaluationError("sandbox_memory_exceeded", "Docker sandbox memory limit exceeded.")
            if sandbox_res.exit_code != 0:
                if not sandbox_res.stdout.strip() and not sandbox_res.stderr.strip():
                    raise EvaluationError(
                        "candidate_runtime_error",
                        f"Sandbox exited abnormally (exit code {sandbox_res.exit_code})."
                    )

            try:
                legacy_results = parse_harness_output(sandbox_res)
                results.extend(legacy_results)
            except Exception as e:
                if sandbox_res.exit_code != 0:
                    raise EvaluationError(
                        "candidate_runtime_error",
                        f"Candidate execution caused sandbox crash. "
                        f"Exit code: {sandbox_res.exit_code}. Stderr: {sandbox_res.stderr[:500]}"
                    )
                raise EvaluationError("hidden_test_execution_failed", f"Failed to parse grading results: {e}")

            # Create a dummy sandbox_res for persist_assessment_result (legacy path)
            # (used for wall_seconds; we use the last legacy sandbox run)
        else:
            # New path only — create a dummy sandbox_res for wall_seconds
            class _FakeSandboxRes:
                duration = sum(
                    r.get("runtime_ms", 0) / 1000.0 for r in results
                )
            sandbox_res = _FakeSandboxRes()

        # ── 6. Ensure submission record exists (auto-create for browser-based) ──
        if submission is None:
            submission = AssessmentSubmission.objects.create(
                candidate_assessment=assessment,
                attempt_number=assessment.attempt_number,
                original_filename="browser_submission",
                file_size=0,
                sha256_digest="",
                status="submitted",
                submitted_at=timezone.now()
            )

        # ── 7. Save successful result ───────────────────────────────────────────
        with transaction.atomic():
            persist_assessment_result(assessment, submission, results, sandbox_res)
            transition_candidate_assessment(assessment.id, "graded", updated_by_user=None)

            sub = AssessmentSubmission.objects.select_for_update().get(pk=submission.id)
            sub.evaluation_finished_at = timezone.now()
            sub.save(update_fields=["evaluation_finished_at"])


    except EvaluationError as ee:
        logger.error(
            f"[{assessment.id}] Evaluation failed with code '{ee.code}': {ee.message}"
        )
        with transaction.atomic():
            transition_candidate_assessment(
                assessment.id, "failed",
                updated_by_user=None,
                failure_code=ee.code,
                failure_message=ee.message
            )
            # Update submission if it exists
            if submission is not None:
                sub = AssessmentSubmission.objects.select_for_update().get(pk=submission.id)
                sub.evaluation_finished_at = timezone.now()
                sub.save(update_fields=["evaluation_finished_at"])

    except Exception as e:
        logger.exception(
            f"[{assessment.id}] Unexpected error in evaluate_candidate_assessment: {e}"
        )
        with transaction.atomic():
            transition_candidate_assessment(
                assessment.id, "failed",
                updated_by_user=None,
                failure_code="evaluator_internal_error",
                failure_message=str(e)
            )
            if submission is not None:
                sub = AssessmentSubmission.objects.select_for_update().get(pk=submission.id)
                sub.evaluation_finished_at = timezone.now()
                sub.save(update_fields=["evaluation_finished_at"])


@transaction.atomic
def persist_assessment_result(assessment, submission, question_results, sandbox_res):
    """
    Saves the final grading results into AssessmentResult and AssessmentQuestionResult.
    First removes any existing results for this submission to avoid duplicates.
    """
    from .models import AssessmentResult, AssessmentQuestionResult
    
    # Clean up any existing results for this submission/assessment attempt
    AssessmentResult.objects.filter(submission=submission).delete()
    
    grading_snapshot = assessment.private_grading_snapshot
    questions = {q["id"]: q for q in grading_snapshot.get("questions", [])}
    
    total_passed = 0
    total_failed = 0
    total_score = 0
    max_score = 0
    
    q_results_to_create = []
    
    # First, let's create a lookup of results by question_id
    results_by_q = {r["id"]: r for r in question_results}
    
    for q_id, q_data in questions.items():
        q_marks = q_data.get("marks", 0)
        max_score += q_marks
        
        result_data = results_by_q.get(q_id)
        if result_data:
            passed = result_data.get("passed_tests", 0)
            failed = result_data.get("failed_tests", 0)
            status = result_data.get("status", "skipped")
            stdout_summary = result_data.get("safe_stdout_summary", "")
            feedback = result_data.get("feedback", "")
            
            # Score logic: proportional grading
            if status == "passed" and (passed + failed) > 0:
                score = q_marks * (passed / (passed + failed))
            elif status == "passed" and passed > 0:
                score = q_marks
            else:
                score = 0
        else:
            # Question skipped/missing
            passed = 0
            failed = 0
            status = "skipped"
            stdout_summary = "Question result not returned from execution."
            feedback = "No answer provided."
            score = 0
            
        total_passed += passed
        total_failed += failed
        total_score += score
        
        q_results_to_create.append((q_id, score, q_marks, passed, failed, status, stdout_summary, feedback))
        
    total_tests = total_passed + total_failed
    if total_tests == 0:
        total_tests = 1  # prevent 0 total tests
        
    docker_tag = getattr(settings, "EVALUATOR_DOCKER_IMAGE", "python:3.11-slim")
    percentage = round((total_score / max_score) * 100, 2) if max_score > 0 else 0
    
    is_passed = total_passed > 0 and total_failed == 0 and total_tests > 0

    res = AssessmentResult.objects.create(
        submission=submission,
        total_score=total_score,
        maximum_score=max_score,
        percentage=percentage,
        passed=is_passed,
        passed_tests=total_passed,
        failed_tests=total_failed,
        total_tests=total_tests,
        evaluator_version="1.0",
        docker_image_tag=docker_tag,
        execution_wall_seconds=sandbox_res.duration,
        safe_summary=f"Grading complete. Score: {total_score}/{max_score}. Passed {total_passed} tests, failed {total_failed} tests.",
        safe_error=""
    )
    
    for q_id, score, max_marks, passed, failed, status, stdout_summary, feedback in q_results_to_create:
        AssessmentQuestionResult.objects.create(
            assessment_result=res,
            question_id=q_id,
            score_awarded=score,
            maximum_score=max_marks,
            passed_tests=passed,
            failed_tests=failed,
            execution_status=status,
            safe_stdout_summary=stdout_summary,
            safe_feedback=feedback
        )
        
    return res


@transaction.atomic
def retry_failed_assessment(assessment_id, retried_by_user):
    """
    Transitions failed candidate assessment back to queued if retries are within limits.
    """
    assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment_id)
    if assessment.status != "failed":
        raise ValidationError("Only failed assessments can be retried.")
        
    max_retries = getattr(settings, "EVALUATOR_MAX_RETRIES", 3)
    if assessment.evaluation_attempt_count >= max_retries:
        raise ValidationError(
            f"Maximum evaluation attempts ({max_retries}) reached. Cannot retry.",
            code="max_retries_reached"
        )
        
    transition_candidate_assessment(assessment.id, "queued", updated_by_user=retried_by_user)
    
    log_audit(
        action="assessment_retried",
        actor=retried_by_user,
        target_type="CandidateAssessment",
        target_id=assessment.id,
        target_label=f"Attempt {assessment.attempt_number}",
        metadata={
            "assessment_id": str(assessment.id),
            "attempt_count": assessment.evaluation_attempt_count
        }
    )
    return assessment


def recover_stale_evaluating_assessments(stale_timeout_seconds=300):
    """
    Recovers assessments stuck in 'evaluating' state for longer than timeout.
    Moves them to failed.
    """
    cutoff = timezone.now() - timezone.timedelta(seconds=stale_timeout_seconds)
    stale_assessments = CandidateAssessment.objects.filter(
        status="evaluating",
        evaluation_started_at__lt=cutoff
    )
    
    recovered_count = 0
    for assessment in stale_assessments:
        with transaction.atomic():
            assessment = CandidateAssessment.objects.select_for_update().get(pk=assessment.id)
            if assessment.status != "evaluating" or assessment.evaluation_started_at >= cutoff:
                continue
                
            transition_candidate_assessment(
                assessment.id, "failed",
                updated_by_user=None,
                failure_code="evaluator_internal_error",
                failure_message="Evaluation process timed out / worker connection lost."
            )
            
            # Mark submission finished
            submission = assessment.submissions.filter(attempt_number=assessment.attempt_number).select_for_update().first()
            if submission:
                submission.evaluation_finished_at = timezone.now()
                submission.save(update_fields=["evaluation_finished_at"])
                
            recovered_count += 1
            
    return recovered_count


