import os
import uuid
from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.conf import settings
from django.utils.deconstruct import deconstructible
from applications.models import Application


@deconstructible
class PrivateAssessmentFileSystemStorage(FileSystemStorage):
    def __init__(self):
        location = getattr(
            settings,
            "PRIVATE_ASSESSMENT_ROOT",
            os.path.join(settings.BASE_DIR, "private_assessments")
        )
        super().__init__(location=location, base_url=None)


private_assessment_storage = PrivateAssessmentFileSystemStorage()


def validate_notebook_file(file):
    if not file:
        return
    name = file.name.lower()
    if not name.endswith(".ipynb"):
        raise ValidationError("Only .ipynb notebook files are allowed.")
    max_size = getattr(settings, "MAX_NOTEBOOK_UPLOAD_SIZE", 10 * 1024 * 1024)
    if file.size > max_size:
        raise ValidationError(f"File size exceeds the maximum limit of {max_size} bytes.")



def validate_assessment_snapshot(value):
    if not isinstance(value, dict):
        raise ValidationError("Snapshot must be a JSON object.")
    if "schema_version" not in value:
        raise ValidationError("Snapshot is missing schema_version.")
    if "template" not in value:
        raise ValidationError("Snapshot is missing template details.")
    t = value["template"]
    for key in ["id", "version", "name", "instructions", "duration_minutes"]:
        if key not in t:
            raise ValidationError(f"Snapshot template is missing '{key}'.")
    if "questions" not in value or not isinstance(value["questions"], list):
        raise ValidationError("Snapshot must contain a questions list.")
    
    for idx, q in enumerate(value["questions"]):
        for key in ["id", "title", "prompt", "starter_code", "marks", "language", "display_order"]:
            if key not in q:
                raise ValidationError(f"Snapshot question at index {idx} is missing '{key}'.")


class AssessmentTemplate(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("active", "Active"),
        ("archived", "Archived"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField()
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="assessment_templates")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "version"], name="unique_template_name_version"),
            models.CheckConstraint(condition=models.Q(duration_minutes__gt=0), name="template_duration_positive"),
            models.CheckConstraint(condition=models.Q(version__gt=0), name="template_version_positive"),
        ]

    def __str__(self):
        return f"{self.name} (v{self.version}) - {self.status}"


class AssessmentQuestion(models.Model):
    EXECUTION_MODE_CHOICES = (
        ("function", "Function Call"),
        ("stdio", "Standard Input/Output"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(AssessmentTemplate, on_delete=models.CASCADE, related_name="questions")
    title = models.CharField(max_length=255)
    prompt = models.TextField()
    # Legacy single-language starter code (kept for backward compat with notebooks)
    starter_code = models.TextField(blank=True)
    # Legacy free-text assertion block (kept for backward compat with notebook evaluation)
    hidden_tests = models.TextField(blank=True, default="")
    marks = models.PositiveIntegerField()
    display_order = models.IntegerField()
    # Legacy single-language field (kept for backward compat)
    language = models.CharField(max_length=50, default="python")
    # ── New browser-based coding assessment fields ──────────────────────────────
    # Per-language starter code: {"python": "...", "javascript": "..."}
    starter_code_per_language = models.JSONField(default=dict, blank=True)
    # Visible sample test cases shown to candidate: [{"input": "...", "expected_output": "...", "order": 1}]
    visible_test_cases = models.JSONField(default=list, blank=True)
    # Structured hidden test cases (never sent to candidate): [{"input": "...", "expected_output": "...", "order": 1}]
    hidden_test_cases = models.JSONField(default=list, blank=True)
    # Execution mode: "function" (call a named function) or "stdio" (stdin/stdout based)
    execution_mode = models.CharField(
        max_length=30,
        choices=EXECUTION_MODE_CHOICES,
        default="function"
    )
    # The function name to call when execution_mode="function"
    function_name = models.CharField(max_length=100, blank=True, default="")
    # Per-question time limit (seconds)
    time_limit_seconds = models.PositiveIntegerField(default=5)
    # Per-question memory limit (MB), null means use system default
    memory_limit_mb = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["template", "display_order"], name="unique_question_template_order"),
            models.CheckConstraint(condition=models.Q(marks__gt=0), name="question_marks_positive"),
            models.CheckConstraint(condition=models.Q(display_order__gte=0), name="question_display_order_non_negative"),
        ]

    def __str__(self):
        return f"{self.template.name} - Q{self.display_order}: {self.title}"


class CandidateAssessment(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("email_pending", "Email Pending"),
        ("invited", "Invited"),
        ("started", "Started"),
        ("submitted", "Submitted"),
        ("queued", "Queued"),
        ("evaluating", "Evaluating"),
        ("graded", "Graded"),
        ("failed", "Failed"),
        ("expired", "Expired"),
        ("cancelled", "Cancelled"),
    )

    EMAIL_STATUS_CHOICES = (
        ("not_queued", "Not Queued"),
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("opened", "Opened"),
        ("clicked", "Clicked"),
        ("deferred", "Deferred"),
        ("soft_bounced", "Soft Bounced"),
        ("hard_bounced", "Hard Bounced"),
        ("blocked", "Blocked"),
        ("complaint", "Complaint"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.PROTECT, related_name="candidate_assessments")
    template = models.ForeignKey(AssessmentTemplate, on_delete=models.PROTECT, related_name="candidate_assessments")
    template_version_snapshot = models.PositiveIntegerField()
    candidate_name_snapshot = models.CharField(max_length=255)
    candidate_email_snapshot = models.CharField(max_length=255)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="draft")
    secure_token_digest = models.CharField(max_length=64, unique=True, db_index=True)
    token_expires_at = models.DateTimeField()
    assessment_deadline = models.DateTimeField()
    attempt_number = models.PositiveIntegerField(default=1)
    assigned_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="assigned_assessments")
    assigned_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    evaluation_started_at = models.DateTimeField(null=True, blank=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=100, null=True, blank=True)
    safe_failure_message = models.TextField(null=True, blank=True)
    assessment_snapshot = models.JSONField(validators=[validate_assessment_snapshot])
    # Stage 5: private hidden-test snapshot — server-side only, never exposed to candidates.
    # Captured at assignment time; immutable after creation. Evaluator reads exclusively from here.
    private_grading_snapshot = models.JSONField(default=dict)
    # Tracks how many times this assessment has entered "evaluating" (enforces retry limit)
    evaluation_attempt_count = models.PositiveIntegerField(default=0)
    # Strictly development-only recoverable token value (null in production/when DEBUG=False)
    dev_raw_token = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Brevo-ready email tracking fields
    email_provider = models.CharField(max_length=50, default="brevo")
    email_status = models.CharField(max_length=30, choices=EMAIL_STATUS_CHOICES, default="not_queued")
    provider_message_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)
    email_delivered_at = models.DateTimeField(null=True, blank=True)
    email_opened_at = models.DateTimeField(null=True, blank=True)
    email_clicked_at = models.DateTimeField(null=True, blank=True)
    email_failed_at = models.DateTimeField(null=True, blank=True)
    email_last_event_at = models.DateTimeField(null=True, blank=True)
    email_failure_code = models.CharField(max_length=100, null=True, blank=True)
    email_failure_message = models.TextField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["application", "template", "attempt_number"], name="unique_application_template_attempt"),
            models.CheckConstraint(condition=models.Q(attempt_number__gt=0), name="assessment_attempt_positive"),
        ]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["assessment_deadline"]),
            models.Index(fields=["application"]),
        ]

    def clean(self):
        super().clean()
        # Temporal ordering is enforced only at creation time.
        # On updates (status transitions, expiry, etc.) these dates may legitimately
        # be in the past, so we skip them to avoid blocking valid state changes.
        if not self.pk:
            if self.token_expires_at and self.assigned_at and self.token_expires_at <= self.assigned_at:
                raise ValidationError("Token expiry must be after assigned_at.")
            if self.assessment_deadline and self.assigned_at and self.assessment_deadline <= self.assigned_at:
                raise ValidationError("Assessment deadline must be after assigned_at.")
            if self.token_expires_at and self.assessment_deadline and self.token_expires_at > self.assessment_deadline:
                raise ValidationError("Token expiry must not exceed the assessment deadline.")
        if self.submitted_at and self.started_at and self.submitted_at < self.started_at:
            raise ValidationError("submitted_at must not precede started_at.")
        if self.evaluated_at and self.evaluation_started_at and self.evaluated_at < self.evaluation_started_at:
            raise ValidationError("evaluated_at must not precede evaluation_started_at.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


    def __str__(self):
        return f"Assessment for {self.candidate_name_snapshot} - Attempt {self.attempt_number} ({self.status})"


class AssessmentSubmission(models.Model):
    STATUS_CHOICES = (
        ("uploaded", "Uploaded"),
        ("submitted", "Submitted"),
        ("queued", "Queued"),
        ("evaluating", "Evaluating"),
        ("graded", "Graded"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate_assessment = models.ForeignKey(CandidateAssessment, on_delete=models.PROTECT, related_name="submissions")
    attempt_number = models.PositiveIntegerField()
    private_notebook = models.FileField(
        storage=private_assessment_storage,
        upload_to="private_submissions/",
        validators=[validate_notebook_file],
        null=True,
        blank=True
    )
    original_filename = models.CharField(max_length=255, null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    sha256_digest = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="uploaded")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    evaluation_started_at = models.DateTimeField(null=True, blank=True)
    evaluation_finished_at = models.DateTimeField(null=True, blank=True)
    safe_failure_code = models.CharField(max_length=100, null=True, blank=True)
    safe_failure_message = models.TextField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["candidate_assessment", "attempt_number"], name="unique_submission_attempt"),
            models.CheckConstraint(condition=models.Q(attempt_number__gt=0), name="submission_attempt_positive"),
            models.CheckConstraint(
                condition=models.Q(file_size__isnull=True) | models.Q(file_size__gte=0),
                name="submission_file_size_non_negative"
            ),
        ]

    def __str__(self):
        return f"Submission for {self.candidate_assessment.id} - Attempt {self.attempt_number}"


class AssessmentResult(models.Model):
    submission = models.OneToOneField(AssessmentSubmission, on_delete=models.PROTECT, related_name="result")
    total_score = models.DecimalField(max_digits=6, decimal_places=2)
    maximum_score = models.DecimalField(max_digits=6, decimal_places=2)
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    passed = models.BooleanField(null=True, blank=True)
    passed_tests = models.PositiveIntegerField()
    failed_tests = models.PositiveIntegerField()
    total_tests = models.PositiveIntegerField()
    evaluator_version = models.CharField(max_length=50)
    # Stage 5 result metadata — timing and sandbox metadata
    docker_image_tag = models.CharField(max_length=100, blank=True)
    execution_wall_seconds = models.FloatField(null=True, blank=True)
    safe_summary = models.TextField(blank=True)
    safe_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(total_score__gte=0), name="result_total_score_non_negative"),
            models.CheckConstraint(condition=models.Q(maximum_score__gt=0), name="result_maximum_score_positive"),
            models.CheckConstraint(condition=models.Q(percentage__gte=0, percentage__lte=100), name="result_percentage_bounds"),
            models.CheckConstraint(condition=models.Q(passed_tests__gte=0), name="result_passed_tests_non_negative"),
            models.CheckConstraint(condition=models.Q(failed_tests__gte=0), name="result_failed_tests_non_negative"),
            models.CheckConstraint(condition=models.Q(total_tests__gte=0), name="result_total_tests_non_negative"),
            models.CheckConstraint(
                condition=models.Q(total_tests=models.F("passed_tests") + models.F("failed_tests")),
                name="result_tests_count_consistency"
            ),
            models.CheckConstraint(
                condition=models.Q(total_score__lte=models.F("maximum_score")),
                name="result_score_consistency"
            ),
        ]

    def __str__(self):
        return f"Result for submission {self.submission.id}: {self.total_score}/{self.maximum_score}"


class AssessmentQuestionResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment_result = models.ForeignKey(AssessmentResult, on_delete=models.CASCADE, related_name="question_results")
    question = models.ForeignKey(AssessmentQuestion, on_delete=models.PROTECT, related_name="question_results")
    score_awarded = models.DecimalField(max_digits=6, decimal_places=2)
    maximum_score = models.DecimalField(max_digits=6, decimal_places=2)
    passed_tests = models.PositiveIntegerField()
    failed_tests = models.PositiveIntegerField()
    safe_feedback = models.TextField(blank=True)
    # Stage 5: per-question execution outcome
    EXECUTION_STATUS_CHOICES = (
        ("passed", "Passed"),
        ("failed", "Failed"),
        ("error", "Error"),
        ("timeout", "Timeout"),
        ("skipped", "Skipped"),
    )
    execution_status = models.CharField(
        max_length=20,
        choices=EXECUTION_STATUS_CHOICES,
        default="skipped"
    )
    # Bounded truncated harness feedback for recruiter debugging (max 2000 chars, no hidden test code)
    safe_stdout_summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["assessment_result", "question"], name="unique_qresult_result_question"),
            models.CheckConstraint(condition=models.Q(score_awarded__gte=0), name="qresult_score_awarded_non_negative"),
            models.CheckConstraint(condition=models.Q(maximum_score__gt=0), name="qresult_maximum_score_positive"),
            models.CheckConstraint(
                condition=models.Q(score_awarded__lte=models.F("maximum_score")),
                name="qresult_score_bound"
            ),
            models.CheckConstraint(condition=models.Q(passed_tests__gte=0), name="qresult_passed_tests_non_negative"),
            models.CheckConstraint(condition=models.Q(failed_tests__gte=0), name="qresult_failed_tests_non_negative"),
        ]

    def __str__(self):
        return f"QResult for {self.question.title} - Score: {self.score_awarded}/{self.maximum_score}"


class AssessmentEmailDelivery(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("sent", "Sent"),
        ("delivered", "Delivered"),
        ("opened", "Opened"),
        ("clicked", "Clicked"),
        ("deferred", "Deferred"),
        ("soft_bounced", "Soft Bounced"),
        ("hard_bounced", "Hard Bounced"),
        ("blocked", "Blocked"),
        ("complaint", "Complaint"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate_assessment = models.ForeignKey(
        CandidateAssessment,
        on_delete=models.PROTECT,
        related_name="email_deliveries"
    )
    send_attempt = models.PositiveIntegerField()
    provider = models.CharField(max_length=50, default="brevo")
    provider_message_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        db_index=True
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="pending"
    )
    secure_token_digest = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        db_index=True
    )
    recipient_email_snapshot = models.EmailField()
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="email_deliveries"
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    last_event_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=100, null=True, blank=True)
    safe_failure_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["candidate_assessment", "send_attempt"],
                name="unique_delivery_attempt"
            ),
            models.CheckConstraint(
                condition=models.Q(send_attempt__gt=0),
                name="delivery_attempt_positive"
            ),
        ]
        indexes = [
            models.Index(
                fields=["provider", "provider_message_id"],
                name="idx_provider_msg_id"
            ),
        ]

    def __str__(self):
        return f"Delivery for {self.candidate_assessment.id} - Attempt {self.send_attempt} ({self.status})"


class CandidateAnswer(models.Model):
    SUPPORTED_LANGUAGES = (
        ("python", "Python"),
        ("javascript", "JavaScript"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate_assessment = models.ForeignKey(
        CandidateAssessment, on_delete=models.CASCADE, related_name="answers"
    )
    question = models.ForeignKey(
        AssessmentQuestion, on_delete=models.PROTECT, related_name="answers"
    )
    answer_text = models.TextField(blank=True)
    # The language the candidate was using when they last saved for this question
    selected_language = models.CharField(
        max_length=50,
        choices=SUPPORTED_LANGUAGES,
        default="python"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["candidate_assessment", "question"],
                name="unique_candidate_assessment_question_answer"
            )
        ]

    def __str__(self):
        return f"Answer for {self.candidate_assessment.id} - {self.question.title} [{self.selected_language}]"


