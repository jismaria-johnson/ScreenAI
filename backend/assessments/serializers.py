from rest_framework import serializers
from django.utils import timezone
from .models import (
    AssessmentTemplate,
    AssessmentQuestion,
    CandidateAssessment,
    AssessmentEmailDelivery,
    AssessmentSubmission,
    AssessmentResult,
    AssessmentQuestionResult
)


def _derive_effective_result_passed(result):
    if result is None:
        return False

    total_passed = result.passed_tests or 0
    total_failed = result.failed_tests or 0
    total_tests = result.total_tests or (total_passed + total_failed)
    total_score = float(result.total_score or 0)

    if total_tests <= 0:
        return False

    return total_passed > 0 and total_failed == 0 and total_score > 0



class AssessmentQuestionSerializer(serializers.ModelSerializer):
    has_hidden_tests = serializers.SerializerMethodField()
    hidden_tests = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_visible_test_cases = serializers.SerializerMethodField()
    has_hidden_test_cases = serializers.SerializerMethodField()

    class Meta:
        model = AssessmentQuestion
        fields = [
            "id",
            "title",
            "prompt",
            "starter_code",
            "hidden_tests",
            "marks",
            "display_order",
            "language",
            "starter_code_per_language",
            "visible_test_cases",
            "hidden_test_cases",
            "execution_mode",
            "function_name",
            "time_limit_seconds",
            "memory_limit_mb",
            "has_hidden_tests",
            "has_visible_test_cases",
            "has_hidden_test_cases",
        ]
        read_only_fields = ["id"]

    def get_has_hidden_tests(self, obj):
        return bool(obj.hidden_tests)

    def get_has_visible_test_cases(self, obj):
        return bool(obj.visible_test_cases)

    def get_has_hidden_test_cases(self, obj):
        return bool(obj.hidden_test_cases)

    def validate_title(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Title cannot be blank.")
        return value.strip()

    def validate_prompt(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Prompt cannot be blank.")
        return value.strip()

    def validate_marks(self, value):
        if value <= 0:
            raise serializers.ValidationError("Marks must be positive.")
        return value

    def validate_display_order(self, value):
        if value < 0:
            raise serializers.ValidationError("Display order must be non-negative.")
        return value

    def validate_language(self, value):
        allowed = {"python", "javascript"}
        if value.lower() not in allowed:
            raise serializers.ValidationError(f"Only {', '.join(sorted(allowed))} are currently supported.")
        return value.lower()

    def validate_hidden_tests(self, value):
        if value is not None and not value.strip():
            raise serializers.ValidationError("Hidden tests cannot be blank.")
        return value

    def _validate_test_cases(self, test_cases, field_name):
        import json
        if not isinstance(test_cases, list):
            raise serializers.ValidationError(f"{field_name} must be a list.")
        
        # Get execution mode
        execution_mode = "function"
        if "execution_mode" in self.initial_data:
            execution_mode = self.initial_data["execution_mode"]
        elif self.instance and hasattr(self.instance, "execution_mode"):
            execution_mode = self.instance.execution_mode

        for i, tc in enumerate(test_cases):
            if not isinstance(tc, dict):
                raise serializers.ValidationError(f"Test case at index {i} must be an object.")
            for req in ("input", "expected_output"):
                if req not in tc:
                    raise serializers.ValidationError(f"Test case at index {i} missing '{req}'.")
            
            input_val = tc.get("input")
            expected_val = tc.get("expected_output")

            # Validate input as JSON string
            if not isinstance(input_val, str):
                raise serializers.ValidationError(f"Test case at index {i} input must be a JSON string.")
            try:
                parsed_input = json.loads(input_val)
            except json.JSONDecodeError as e:
                raise serializers.ValidationError(f"Test case at index {i} input is not valid JSON: {str(e)}")

            # If function mode, input must be a JSON array (list)
            if execution_mode == "function":
                if not isinstance(parsed_input, list):
                    raise serializers.ValidationError(
                        f"Test case at index {i} input must be a valid JSON array of arguments (e.g. [\"text\"] or [[1, 2]])."
                    )

            # Validate expected_output as JSON string
            if not isinstance(expected_val, str):
                raise serializers.ValidationError(f"Test case at index {i} expected_output must be a JSON string.")
            try:
                json.loads(expected_val)
            except json.JSONDecodeError as e:
                raise serializers.ValidationError(f"Test case at index {i} expected_output is not valid JSON: {str(e)}")
        
        return test_cases

    def validate_visible_test_cases(self, value):
        return self._validate_test_cases(value, "visible_test_cases")

    def validate_hidden_test_cases(self, value):
        return self._validate_test_cases(value, "hidden_test_cases")

    def validate(self, attrs):
        # 1. Gather test case inputs and starter code
        visible_test_cases = attrs.get("visible_test_cases")
        if visible_test_cases is None:
            if self.instance and hasattr(self.instance, "visible_test_cases"):
                visible_test_cases = self.instance.visible_test_cases
            else:
                visible_test_cases = []

        hidden_test_cases = attrs.get("hidden_test_cases")
        if hidden_test_cases is None:
            if self.instance and hasattr(self.instance, "hidden_test_cases"):
                hidden_test_cases = self.instance.hidden_test_cases
            else:
                hidden_test_cases = []

        starter_code_per_language = attrs.get("starter_code_per_language")
        if starter_code_per_language is None:
            if self.instance and hasattr(self.instance, "starter_code_per_language"):
                starter_code_per_language = self.instance.starter_code_per_language
            else:
                starter_code_per_language = {}

        # Is it structured? It is structured if visible_test_cases, hidden_test_cases, starter_code_per_language, or execution_mode (if explicitly structured value in input) is present
        is_structured = bool(visible_test_cases or hidden_test_cases or starter_code_per_language)

        if is_structured:
            execution_mode = attrs.get("execution_mode")
            if execution_mode is None:
                if self.instance and hasattr(self.instance, "execution_mode"):
                    execution_mode = self.instance.execution_mode
                else:
                    execution_mode = "function"

            function_name = attrs.get("function_name")
            if function_name is None:
                if self.instance and hasattr(self.instance, "function_name"):
                    function_name = self.instance.function_name
                else:
                    function_name = ""

            if execution_mode == "function" and not function_name.strip():
                raise serializers.ValidationError({"function_name": "Function name is required in function mode."})

            if not visible_test_cases:
                raise serializers.ValidationError({"visible_test_cases": "At least one visible test case is required."})
            if not hidden_test_cases:
                raise serializers.ValidationError({"hidden_test_cases": "At least one hidden test case is required."})

            if not starter_code_per_language:
                raise serializers.ValidationError({"starter_code_per_language": "Starter code is required."})

            if not isinstance(starter_code_per_language, dict):
                raise serializers.ValidationError({"starter_code_per_language": "Must be a JSON object."})

            for lang, code in starter_code_per_language.items():
                if not isinstance(code, str) or not code.strip():
                    raise serializers.ValidationError({"starter_code_per_language": f"Starter code for {lang} cannot be empty."})
        else:
            # Legacy validation: must have legacy hidden_tests
            hidden_tests = attrs.get("hidden_tests")
            if hidden_tests is None:
                if self.instance and hasattr(self.instance, "hidden_tests"):
                    hidden_tests = self.instance.hidden_tests
                else:
                    hidden_tests = ""

            if not hidden_tests:
                raise serializers.ValidationError({"hidden_tests": "Hidden tests cannot be blank."})

        return attrs


class AssessmentTemplateSerializer(serializers.ModelSerializer):
    questions = AssessmentQuestionSerializer(many=True, read_only=True)
    total_marks = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = AssessmentTemplate
        fields = [
            "id",
            "name",
            "description",
            "instructions",
            "duration_minutes",
            "version",
            "status",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "activated_at",
            "archived_at",
            "questions",
            "total_marks",
            "question_count",
        ]
        read_only_fields = [
            "id",
            "version",
            "status",
            "created_by",
            "created_at",
            "updated_at",
            "activated_at",
            "archived_at",
        ]

    def get_total_marks(self, obj):
        return sum(q.marks for q in obj.questions.all())

    def get_question_count(self, obj):
        return obj.questions.count()

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value.strip()

    def validate_duration_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError("Duration must be positive.")
        return value


class CandidateSafeQuestionSerializer(serializers.ModelSerializer):
    """
    Safe serializer for candidate-facing question data.
    NEVER exposes: hidden_tests, hidden_test_cases, or any private grading data.
    Exposes visible_test_cases (inputs + expected outputs) for sample display.
    """
    class Meta:
        model = AssessmentQuestion
        fields = [
            "id",
            "title",
            "prompt",
            "starter_code",
            "starter_code_per_language",
            "marks",
            "language",
            "display_order",
            "visible_test_cases",
            "execution_mode",
            "function_name",
            "time_limit_seconds",
        ]


class CandidateSafePreviewSerializer(serializers.ModelSerializer):
    questions = CandidateSafeQuestionSerializer(many=True, read_only=True)
    total_marks = serializers.SerializerMethodField()

    class Meta:
        model = AssessmentTemplate
        fields = [
            "id",
            "name",
            "description",
            "instructions",
            "duration_minutes",
            "version",
            "total_marks",
            "questions"
        ]

    def get_total_marks(self, obj):
        return sum(q.marks for q in obj.questions.all())


class AssessmentEmailDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentEmailDelivery
        fields = [
            "send_attempt",
            "provider",
            "status",
            "requested_at",
            "accepted_at",
            "sent_at",
            "delivered_at",
            "opened_at",
            "clicked_at",
            "failed_at",
            "failure_code",
            "safe_failure_message"
        ]


class CandidateAssessmentAssignmentSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    template_version = serializers.IntegerField(source="template_version_snapshot", read_only=True)
    send_attempt_count = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()
    session_end_at = serializers.SerializerMethodField()

    class Meta:
        model = CandidateAssessment
        fields = [
            "id",
            "application_id",
            "template_name",
            "template_version",
            "status",
            "assessment_deadline",
            "assigned_at",
            "started_at",
            "submitted_at",
            "email_status",
            "duration_minutes",
            "session_end_at",
            "send_attempt_count",
            "email_sent_at",
            "email_delivered_at",
            "email_opened_at",
            "email_clicked_at",
            "email_failed_at",
            "email_failure_code",
            "email_failure_message",
            "failure_code",
            "safe_failure_message",
            "evaluation_attempt_count"
        ]

    def get_send_attempt_count(self, obj):
        return obj.email_deliveries.count()

    def get_duration_minutes(self, obj):
        return obj.assessment_snapshot.get("template", {}).get("duration_minutes", 0)

    def get_session_end_at(self, obj):
        duration_minutes = self.get_duration_minutes(obj)
        if obj.started_at and duration_minutes:
            return obj.started_at + timezone.timedelta(minutes=duration_minutes)
        return None


class CandidateAssessmentDetailSerializer(CandidateAssessmentAssignmentSerializer):
    email_deliveries = AssessmentEmailDeliverySerializer(many=True, read_only=True)
    result_summary = serializers.SerializerMethodField()

    class Meta(CandidateAssessmentAssignmentSerializer.Meta):
        fields = CandidateAssessmentAssignmentSerializer.Meta.fields + ["email_deliveries", "result_summary"]

    def get_result_summary(self, obj):
        submission = obj.submissions.filter(attempt_number=obj.attempt_number).first()
        if submission and hasattr(submission, "result"):
            effective_passed = _derive_effective_result_passed(submission.result)
            return {
                "id": str(submission.result.id),
                "total_score": float(submission.result.total_score),
                "maximum_score": float(submission.result.maximum_score),
                "percentage": float(submission.result.percentage),
                "passed": effective_passed,
                "passed_tests": submission.result.passed_tests,
                "failed_tests": submission.result.failed_tests,
                "total_tests": submission.result.total_tests,
                "evaluator_version": submission.result.evaluator_version,
                "docker_image_tag": submission.result.docker_image_tag,
                "execution_wall_seconds": submission.result.execution_wall_seconds,
            }
        return None



class AssessmentSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentSubmission
        fields = [
            "id",
            "original_filename",
            "file_size",
            "sha256_digest",
            "status",
            "uploaded_at",
            "submitted_at"
        ]


class CandidateAccessSerializer(serializers.ModelSerializer):
    template_name = serializers.SerializerMethodField()
    instructions = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    active_submission = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    session_end_at = serializers.SerializerMethodField()

    class Meta:
        model = CandidateAssessment
        fields = [
            "id",
            "candidate_name_snapshot",
            "status",
            "assessment_deadline",
            "token_expires_at",
            "started_at",
            "submitted_at",
            "template_name",
            "instructions",
            "duration_minutes",
            "session_end_at",
            "questions",
            "active_submission",
            "answers",
        ]

    def get_template_name(self, obj):
        return obj.assessment_snapshot.get("template", {}).get("name", "")

    def get_instructions(self, obj):
        return obj.assessment_snapshot.get("template", {}).get("instructions", "")

    def get_duration_minutes(self, obj):
        return obj.assessment_snapshot.get("template", {}).get("duration_minutes", 0)

    def get_session_end_at(self, obj):
        duration_minutes = self.get_duration_minutes(obj)
        if obj.started_at and duration_minutes:
            return obj.started_at + timezone.timedelta(minutes=duration_minutes)
        return None

    def get_questions(self, obj):
        questions = obj.assessment_snapshot.get("questions", [])
        return sorted(questions, key=lambda q: q.get("display_order", 0))

    def get_active_submission(self, obj):
        submission = obj.submissions.filter(attempt_number=obj.attempt_number).first()
        if submission:
            return AssessmentSubmissionSerializer(submission).data
        return None

    def get_answers(self, obj):
        from .models import CandidateAnswer
        answers = CandidateAnswer.objects.filter(candidate_assessment=obj)
        # Returns {question_id: {"code": answer_text, "language": selected_language}}
        return {
            str(a.question_id): {
                "code": a.answer_text,
                "language": a.selected_language,
            }
            for a in answers
        }



class AssessmentQuestionResultSerializer(serializers.ModelSerializer):
    question_title = serializers.CharField(source="question.title", read_only=True)

    class Meta:
        model = AssessmentQuestionResult
        fields = [
            "id",
            "question_id",
            "question_title",
            "score_awarded",
            "maximum_score",
            "passed_tests",
            "failed_tests",
            "execution_status",
            "safe_feedback",
            "safe_stdout_summary",
        ]


class AssessmentResultSerializer(serializers.ModelSerializer):
    question_results = AssessmentQuestionResultSerializer(many=True, read_only=True)
    passed = serializers.SerializerMethodField()

    def get_passed(self, obj):
        return _derive_effective_result_passed(obj)

    class Meta:
        model = AssessmentResult
        fields = [
            "id",
            "total_score",
            "maximum_score",
            "percentage",
            "passed",
            "passed_tests",
            "failed_tests",
            "total_tests",
            "evaluator_version",
            "docker_image_tag",
            "execution_wall_seconds",
            "safe_summary",
            "safe_error",
            "question_results",
        ]
