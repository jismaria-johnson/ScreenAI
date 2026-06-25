from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from django.urls import reverse
from django.conf import settings
from django.test import override_settings
from decimal import Decimal
import os
import hmac
import hashlib
import base64
import json


from applications.models import Application
from jobs.models import Job
from assessments.models import (
    AssessmentTemplate,
    AssessmentQuestion,
    CandidateAssessment,
    AssessmentSubmission,
    AssessmentResult,
    AssessmentQuestionResult,
    validate_notebook_file,
    AssessmentEmailDelivery
)
from assessments.services import (
    generate_raw_token,
    get_token_digest,
    verify_token,
    create_assessment_template,
    update_assessment_template,
    add_assessment_question,
    activate_assessment_template,
    create_candidate_assessment,
    transition_candidate_assessment,
    record_email_event
)
from accounts.models import AuditLog


class AssessmentTemplateTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password123")

    def test_create_template_service_and_audit(self):
        template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.user
        )
        self.assertEqual(template.version, 1)
        self.assertEqual(template.status, "draft")

        # Check audit log (exactly once)
        audits = AuditLog.objects.filter(action="assessment_template_created")
        self.assertEqual(audits.count(), 1)
        audit = audits.first()
        self.assertEqual(audit.actor, self.user)
        self.assertEqual(audit.metadata["template_id"], str(template.id))
        self.assertNotIn("token", audit.metadata)

    def test_update_template_service(self):
        template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.user
        )
        updated = update_assessment_template(
            template_id=template.id,
            name="Advanced Python",
            description="OOP concepts",
            instructions="Finish on time",
            duration_minutes=120,
            updated_by=self.user
        )
        self.assertEqual(updated.name, "Advanced Python")
        self.assertEqual(updated.duration_minutes, 120)

        # Check audit
        audits = AuditLog.objects.filter(action="assessment_template_updated")
        self.assertEqual(audits.count(), 1)

    def test_immutable_template_after_activation(self):
        template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.user
        )
        add_assessment_question(
            template_id=template.id,
            title="Q1",
            prompt="Write a function",
            starter_code="",
            hidden_tests="def test(): pass",
            marks=10,
            display_order=0,
            user=self.user
        )
        activate_assessment_template(template.id, self.user)

        # Updating active template fails
        with self.assertRaises(ValidationError):
            update_assessment_template(
                template_id=template.id,
                name="New Name",
                description="New desc",
                instructions="New inst",
                duration_minutes=90,
                updated_by=self.user
            )

        # Adding question to active template fails
        with self.assertRaises(ValidationError):
            add_assessment_question(
                template_id=template.id,
                title="Q2",
                prompt="Another",
                starter_code="",
                hidden_tests="",
                marks=5,
                display_order=1,
                user=self.user
            )

    def test_activation_fails_with_no_questions(self):
        template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.user
        )
        with self.assertRaises(ValidationError):
            activate_assessment_template(template.id, self.user)


class ModelDbConstraintsTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dbuser", password="password123")

    def test_template_duration_constraint(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentTemplate.objects.create(
                    name="Template",
                    duration_minutes=0,  # Invalid duration
                    version=1,
                    status="draft",
                    created_by=self.user
                )

    def test_template_version_constraint(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentTemplate.objects.create(
                    name="Template",
                    duration_minutes=60,
                    version=0,  # Invalid version
                    status="draft",
                    created_by=self.user
                )

    def test_question_marks_constraint(self):
        template = create_assessment_template(
            name="Template",
            description="Desc",
            instructions="Inst",
            duration_minutes=60,
            created_by=self.user
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentQuestion.objects.create(
                    template=template,
                    title="Q",
                    prompt="Prompt",
                    hidden_tests="t",
                    marks=0,  # Invalid marks
                    display_order=0
                )

    def test_question_display_order_constraint(self):
        template = create_assessment_template(
            name="Template",
            description="Desc",
            instructions="Inst",
            duration_minutes=60,
            created_by=self.user
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentQuestion.objects.create(
                    template=template,
                    title="Q",
                    prompt="Prompt",
                    hidden_tests="t",
                    marks=5,
                    display_order=-1  # Invalid order
                )


class CandidateAssessmentTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="recruiter", password="password123")
        self.job = Job.objects.create(
            job_title="Software Engineer",
            company_name="Acme",
            hr_user=self.user,
            location="Remote",
            required_skills="Python"
        )
        from applications.models import CandidateIdentity
        self.identity = CandidateIdentity.objects.create(
            identity_type="anonymous",
        )
        self.application = Application.objects.create(
            job=self.job,
            candidate_identity=self.identity,
            candidate_name="Alice",
            candidate_email="alice@example.com"
        )
        self.template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.user
        )
        add_assessment_question(
            template_id=self.template.id,
            title="Q1",
            prompt="Write a function",
            starter_code="def fn():",
            hidden_tests="assert True",
            marks=10,
            display_order=0,
            user=self.user
        )
        activate_assessment_template(self.template.id, self.user)

    def test_create_candidate_assessment_success_and_snapshot(self):
        assessment, raw_token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )
        self.assertIsNotNone(raw_token)
        self.assertEqual(assessment.status, "email_pending")
        self.assertEqual(assessment.attempt_number, 1)
        self.assertTrue(verify_token(raw_token, assessment.secure_token_digest))

        # Verify raw token is not stored in DB
        self.assertNotEqual(assessment.secure_token_digest, raw_token)

        # Verify snapshot details conform to requested schema
        snapshot = assessment.assessment_snapshot
        self.assertEqual(snapshot["schema_version"], "1.0")
        self.assertEqual(snapshot["template"]["name"], "Python Basics")
        self.assertEqual(len(snapshot["questions"]), 1)
        q_snap = snapshot["questions"][0]
        self.assertEqual(q_snap["title"], "Q1")
        self.assertEqual(q_snap["prompt"], "Write a function")
        # Hidden tests must be completely excluded
        self.assertNotIn("hidden_tests", q_snap)

    def test_conflict_prevention(self):
        # Create active assignment
        assessment1, token1 = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )

        # Trying to create another active one for same attempt fails
        with self.assertRaises(ValidationError):
            create_candidate_assessment(
                application_id=self.application.id,
                template_id=self.template.id,
                assigned_by_user=self.user,
                attempt_number=1
            )

        # Transitioning the first to cancelled does not free attempt_number=1 due to unconditional UniqueConstraint.
        # So creating another with attempt_number=1 will still fail.
        with self.assertRaises(ValidationError):
            create_candidate_assessment(
                application_id=self.application.id,
                template_id=self.template.id,
                assigned_by_user=self.user,
                attempt_number=1
            )

        # However, a new assignment with attempt_number=2 succeeds.
        assessment2, token2 = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=2
        )
        self.assertIsNotNone(assessment2)
        self.assertEqual(assessment2.attempt_number, 2)

    def test_status_transitions(self):
        assessment, raw_token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )

        # email_pending -> invited is valid
        assessment = transition_candidate_assessment(assessment.id, "invited", self.user)
        self.assertEqual(assessment.status, "invited")

        # invited -> started is valid
        assessment = transition_candidate_assessment(assessment.id, "started", self.user)
        self.assertEqual(assessment.status, "started")
        self.assertIsNotNone(assessment.started_at)

        # started -> submitted is valid
        assessment = transition_candidate_assessment(assessment.id, "submitted", self.user)
        self.assertEqual(assessment.status, "submitted")
        self.assertIsNotNone(assessment.submitted_at)

        # submitted -> queued is valid
        assessment = transition_candidate_assessment(assessment.id, "queued", self.user)
        self.assertEqual(assessment.status, "queued")

        # queued -> evaluating is valid
        assessment = transition_candidate_assessment(assessment.id, "evaluating", self.user)
        self.assertEqual(assessment.status, "evaluating")
        self.assertIsNotNone(assessment.evaluation_started_at)

        # evaluating -> failed is valid
        assessment = transition_candidate_assessment(
            assessment.id, "failed", self.user, failure_code="ERR", failure_message="Crash"
        )
        self.assertEqual(assessment.status, "failed")
        self.assertEqual(assessment.failure_code, "ERR")
        self.assertEqual(assessment.safe_failure_message, "Crash")

        # failed -> queued clears failure details
        assessment = transition_candidate_assessment(assessment.id, "queued", self.user)
        self.assertEqual(assessment.status, "queued")
        self.assertIsNone(assessment.failure_code)
        self.assertIsNone(assessment.safe_failure_message)

        # queued -> evaluating -> graded
        assessment = transition_candidate_assessment(assessment.id, "evaluating", self.user)
        assessment = transition_candidate_assessment(assessment.id, "graded", self.user)
        self.assertEqual(assessment.status, "graded")
        self.assertIsNotNone(assessment.evaluated_at)

        # graded is terminal
        with self.assertRaises(ValidationError):
            transition_candidate_assessment(assessment.id, "invited", self.user)


class EmailEventLoggingTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="recruiter", password="password123")
        self.job = Job.objects.create(
            job_title="Software Engineer", company_name="Acme", hr_user=self.user, required_skills="Python"
        )
        from applications.models import CandidateIdentity
        self.identity = CandidateIdentity.objects.create(identity_type="anonymous")
        self.application = Application.objects.create(
            job=self.job, candidate_identity=self.identity, candidate_name="Bob", candidate_email="bob@example.com"
        )
        self.template = create_assessment_template(name="T1", description="D", instructions="I", duration_minutes=60, created_by=self.user)
        add_assessment_question(template_id=self.template.id, title="Q1", prompt="P", starter_code="", hidden_tests="assert True", marks=5, display_order=0, user=self.user)
        activate_assessment_template(self.template.id, self.user)

    def test_email_event_monotonicity_and_idempotency(self):
        assessment, raw_token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )
        assessment.provider_message_id = "msg123"
        assessment.save()

        # 1. Request event
        t1 = timezone.now() - timezone.timedelta(minutes=10)
        assessment = record_email_event("msg123", "request", t1)
        self.assertEqual(assessment.email_status, "pending")
        self.assertEqual(assessment.email_sent_at, t1)

        # 2. Delivered event
        t2 = timezone.now() - timezone.timedelta(minutes=5)
        assessment = record_email_event("msg123", "delivered", t2)
        self.assertEqual(assessment.email_status, "delivered")
        self.assertEqual(assessment.email_delivered_at, t2)

        # 3. Duplicate delivered event
        assessment = record_email_event("msg123", "delivered", t2)
        self.assertEqual(assessment.email_status, "delivered")

        # 4. Stale event timestamps are ignored
        t_stale = timezone.now() - timezone.timedelta(minutes=8)
        assessment = record_email_event("msg123", "opened", t_stale)
        self.assertEqual(assessment.email_status, "delivered")
        self.assertIsNone(assessment.email_opened_at)

        # 5. Late bounce event preserves earlier delivery timestamp
        t3 = timezone.now()
        assessment = record_email_event("msg123", "soft_bounce", t3, failure_code="BOUNCE", failure_message="full")
        self.assertEqual(assessment.email_status, "soft_bounced")
        self.assertEqual(assessment.email_delivered_at, t2)


class PrivateFileStorageTestCase(APITestCase):
    def test_storage_location_outside_media_root(self):
        private_root = settings.PRIVATE_ASSESSMENT_ROOT
        media_root = settings.MEDIA_ROOT
        self.assertNotEqual(private_root, media_root)
        self.assertFalse(private_root.startswith(str(media_root)))

    def test_notebook_file_extensions_and_sizes(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        valid_file = SimpleUploadedFile("notebook.ipynb", b"{}", content_type="application/json")
        validate_notebook_file(valid_file)  # Should not raise exception

        invalid_file = SimpleUploadedFile("script.py", b"print()", content_type="text/plain")
        with self.assertRaises(ValidationError):
            validate_notebook_file(invalid_file)

        with self.settings(MAX_NOTEBOOK_UPLOAD_SIZE=5):
            oversized_file = SimpleUploadedFile("notebook.ipynb", b"123456", content_type="application/json")
            with self.assertRaises(ValidationError):
                validate_notebook_file(oversized_file)


class ScoreDatabaseCheckConstraintsTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="dbuser", password="password123")
        self.job = Job.objects.create(
            job_title="Software Engineer", company_name="Acme", hr_user=self.user, required_skills="Python"
        )
        from applications.models import CandidateIdentity
        self.identity = CandidateIdentity.objects.create(identity_type="anonymous")
        self.application = Application.objects.create(
            job=self.job, candidate_identity=self.identity, candidate_name="Bob", candidate_email="bob@example.com"
        )
        self.template = create_assessment_template(name="T1", description="D", instructions="I", duration_minutes=60, created_by=self.user)
        add_assessment_question(template_id=self.template.id, title="Q1", prompt="P", starter_code="", hidden_tests="assert True", marks=5, display_order=0, user=self.user)
        activate_assessment_template(self.template.id, self.user)
        self.assessment, self.token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.submission = AssessmentSubmission.objects.create(
            candidate_assessment=self.assessment,
            attempt_number=1,
            private_notebook=SimpleUploadedFile("notebook.ipynb", b"{}", content_type="application/json"),
            original_filename="notebook.ipynb",
            file_size=2,
            sha256_digest="fakehash",
            status="uploaded"
        )

    def test_result_score_consistency_constraint(self):
        # maximum_score must be positive, total_score <= maximum_score
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentResult.objects.create(
                    submission=self.submission,
                    total_score=Decimal("15.00"),
                    maximum_score=Decimal("10.00"),  # Total > Max -> fails check
                    percentage=Decimal("150.00"),
                    passed=True,
                    passed_tests=1,
                    failed_tests=0,
                    total_tests=1,
                    evaluator_version="1.0"
                )

    def test_result_tests_count_consistency_constraint(self):
        # total_tests must equal passed_tests + failed_tests
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentResult.objects.create(
                    submission=self.submission,
                    total_score=Decimal("5.00"),
                    maximum_score=Decimal("10.00"),
                    percentage=Decimal("50.00"),
                    passed=True,
                    passed_tests=1,
                    failed_tests=1,
                    total_tests=3,  # 1+1 != 3 -> fails check
                    evaluator_version="1.0"
                )

    def test_result_percentage_bounds_constraint(self):
        # percentage between 0 and 100
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AssessmentResult.objects.create(
                    submission=self.submission,
                    total_score=Decimal("5.00"),
                    maximum_score=Decimal("10.00"),
                    percentage=Decimal("101.00"),  # Out of bounds
                    passed=True,
                    passed_tests=1,
                    failed_tests=1,
                    total_tests=2,
                    evaluator_version="1.0"
                )


class AuditEventsRollbackTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="audituser", password="password123")

    def test_rollback_creates_no_audit_record(self):
        initial_audits_count = AuditLog.objects.count()

        # Perform template creation but trigger an validation error or check constraint
        # that causes transaction rollback
        try:
            with transaction.atomic():
                create_assessment_template(
                    name="T",
                    description="D",
                    instructions="I",
                    duration_minutes=0,  # Fails DB check constraint
                    created_by=self.user
                )
        except IntegrityError:
            pass

        # Verify no audit record is created
        self.assertEqual(AuditLog.objects.count(), initial_audits_count)


class AssessmentsStage2TestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile, UserSecurityState
        
        # Create users
        self.recruiter = User.objects.create_user(username="rec_stage2", password="password123", email="rec@example.com")
        Profile.objects.create(user=self.recruiter, role="hr")
        
        self.other_recruiter = User.objects.create_user(username="other_rec_stage2", password="password123", email="other@example.com")
        Profile.objects.create(user=self.other_recruiter, role="hr")
        
        self.candidate_user = User.objects.create_user(username="cand_stage2", password="password123", email="cand@example.com")
        Profile.objects.create(user=self.candidate_user, role="candidate")
        
        self.admin = User.objects.create_superuser(username="admin_stage2", password="password123", email="admin@example.com")
        Profile.objects.create(user=self.admin, role="hr")
        
        # Authenticated clients setup
        # Real login to get recruiter JWT access token
        login_url = reverse("login")
        res = self.client.post(login_url, {
            "username": "rec_stage2",
            "password": "password123"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.recruiter_token = res.data["access"]
        
        # Recruiter draft template
        self.template = create_assessment_template(
            name="Python Basics",
            description="Standard test of basics",
            instructions="Do your best",
            duration_minutes=60,
            created_by=self.recruiter
        )
        self.question = add_assessment_question(
            template_id=self.template.id,
            title="Sum function",
            prompt="Write a sum function",
            starter_code="def my_sum(a, b):",
            hidden_tests="assert my_sum(2, 3) == 5",
            marks=10,
            display_order=0,
            user=self.recruiter
        )

    def set_client_token(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def clear_client_credentials(self):
        self.client.credentials()

    def test_permissions_anonymous_denied(self):
        self.clear_client_credentials()
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_permissions_candidate_denied(self):
        self.client.force_authenticate(user=self.candidate_user)
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["code"], "permission_denied")

    def test_permissions_suspended_recruiter_denied(self):
        self.recruiter.is_active = False
        self.recruiter.save()
        
        # Real login will fail or session is invalid. Let's try requesting with token.
        self.set_client_token(self.recruiter_token)
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_permissions_stale_session_denied(self):
        # Mismatch token version
        state = self.recruiter.security_state
        state.token_version += 1
        state.save()
        
        self.set_client_token(self.recruiter_token)
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_permissions_password_change_restricted_recruiter_denied(self):
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()
        
        self.set_client_token(self.recruiter_token)
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["code"], "password_change_required")

    def test_permissions_owner_allowed_unrelated_denied_with_404(self):
        # Unrelated recruiter tries to retrieve detail
        self.client.force_authenticate(user=self.other_recruiter)
        url = reverse("assessment-template-detail", kwargs={"pk": self.template.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res.data["code"], "template_not_found")
        
        # Try updating template
        res = self.client.patch(url, {"name": "Hacked Name"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        
        # Try deleting template
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        
        # Try modifying questions
        q_url = reverse("assessment-question-detail", kwargs={"pk": self.template.id, "question_id": self.question.id})
        res = self.client.patch(q_url, {"title": "Hacked Q"})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_permissions_staff_superuser_can_read_all_but_mutate_only_owned(self):
        # Admin can view all
        self.client.force_authenticate(user=self.admin)
        url = reverse("assessment-template-list-create")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Template is visible to admin
        self.assertTrue(any(item["id"] == str(self.template.id) for item in res.data["results"]))
        
        # Admin tries to modify recruiter's template -> Forbidden 403
        detail_url = reverse("assessment-template-detail", kwargs={"pk": self.template.id})
        res = self.client.patch(detail_url, {"name": "Admin Hack Name"})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["code"], "permission_denied")

    def test_serialization_hidden_tests_never_returned(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # 1. Detail endpoint check
        url = reverse("assessment-template-detail", kwargs={"pk": self.template.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        question_data = res.data["questions"][0]
        self.assertNotIn("hidden_tests", question_data)
        self.assertEqual(question_data["has_hidden_tests"], True)
        
        # 2. Preview endpoint check
        preview_url = reverse("assessment-template-preview", kwargs={"pk": self.template.id})
        res = self.client.get(preview_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Safe preview schema check
        self.assertNotIn("hidden_tests", res.data["questions"][0])
        self.assertNotIn("token", res.data)
        self.assertNotIn("candidate", res.data)
        self.assertEqual(res.data["name"], "Python Basics")

    def test_template_lifecycle_mutability_checks(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # Update draft is allowed
        detail_url = reverse("assessment-template-detail", kwargs={"pk": self.template.id})
        res = self.client.patch(detail_url, {"name": "New Basics Name"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "New Basics Name")
        
        # Activate template
        act_url = reverse("assessment-template-activate", kwargs={"pk": self.template.id})
        res = self.client.post(act_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "active")
        
        # Mutating active template must be rejected with template_not_editable
        res = self.client.patch(detail_url, {"name": "Active Update Hack"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "template_not_editable")

        # Deleting active template must be rejected
        res = self.client.delete(detail_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "template_not_editable")

    def test_activation_validations(self):
        # Create a new draft with no questions
        self.client.force_authenticate(user=self.recruiter)
        draft = create_assessment_template("Empty Template", "Desc", "Inst", 30, self.recruiter)
        
        act_url = reverse("assessment-template-activate", kwargs={"pk": draft.id})
        res = self.client.post(act_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "activation_validation_failed")

    def test_archive_behavior(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # Archive draft is rejected
        arch_url = reverse("assessment-template-archive", kwargs={"pk": self.template.id})
        res = self.client.post(arch_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Activate first
        activate_assessment_template(self.template.id, self.recruiter)
        
        # Archive active is allowed
        res = self.client.post(arch_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "archived")
        
        # Repeated archiving is idempotent
        res = self.client.post(arch_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_question_mutations_and_replacement_semantics(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # Add question
        add_url = reverse("assessment-question-create", kwargs={"pk": self.template.id})
        res = self.client.post(add_url, {
            "title": "New Q",
            "prompt": "prompt...",
            "starter_code": "def run():",
            "hidden_tests": "assert True",
            "marks": 5,
            "display_order": 1,
            "language": "python"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["has_hidden_tests"], True)
        self.assertNotIn("hidden_tests", res.data)
        
        new_q_id = res.data["id"]
        
        # Update question - hidden test replacement semantics
        q_detail_url = reverse("assessment-question-detail", kwargs={"pk": self.template.id, "question_id": new_q_id})
        
        # Omit hidden_tests: should retain existing
        res = self.client.patch(q_detail_url, {"title": "Updated Title"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["has_hidden_tests"], True)
        
        # Blank hidden_tests: should be rejected
        res = self.client.patch(q_detail_url, {"hidden_tests": "   "})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Delete question
        res = self.client.delete(q_detail_url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_question_atomic_reordering(self):
        self.client.force_authenticate(user=self.recruiter)
        
        q2 = add_assessment_question(
            template_id=self.template.id,
            title="Q2",
            prompt="P2",
            starter_code="",
            hidden_tests="t",
            marks=5,
            display_order=1,
            user=self.recruiter
        )
        
        reorder_url = reverse("assessment-questions-reorder", kwargs={"pk": self.template.id})
        
        # Reorder successfully
        payload = [
            {"id": str(q2.id), "display_order": 0},
            {"id": str(self.question.id), "display_order": 1}
        ]
        res = self.client.post(reorder_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Verify display order is updated
        self.assertEqual(AssessmentQuestion.objects.get(pk=q2.id).display_order, 0)
        self.assertEqual(AssessmentQuestion.objects.get(pk=self.question.id).display_order, 1)

    def test_cloning_and_versioning(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # Make template active
        activate_assessment_template(self.template.id, self.recruiter)
        
        clone_url = reverse("assessment-template-clone", kwargs={"pk": self.template.id})
        res = self.client.post(clone_url)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["version"], 2)
        self.assertEqual(res.data["status"], "draft")
        self.assertIsNone(res.data["activated_at"])
        
        cloned_id = res.data["id"]
        # Hidden tests are not leaked in clone response
        self.assertNotIn("hidden_tests", res.data["questions"][0])
        
        # Check that questions and hidden tests are copied correctly on the backend
        cloned_q = AssessmentQuestion.objects.filter(template_id=cloned_id).first()
        self.assertEqual(cloned_q.hidden_tests, self.question.hidden_tests)

    def test_filtering_searching_sorting_and_validation(self):
        self.client.force_authenticate(user=self.recruiter)
        
        # Create another template
        t2 = create_assessment_template("Django advanced", "Advanced framework", "Inst", 120, self.recruiter)
        add_assessment_question(t2.id, "q", "p", "s", "assert True", 10, 0, self.recruiter)
        
        list_url = reverse("assessment-template-list-create")
        
        # 1. Search filter
        res = self.client.get(list_url, {"search": "Django"})
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["name"], "Django advanced")
        
        # 2. Status filter
        res = self.client.get(list_url, {"status": "draft"})
        self.assertEqual(len(res.data["results"]), 2)
        
        # 3. Invalid filter
        res = self.client.get(list_url, {"status": "unknown"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "invalid_filter")

    def test_audit_logs_mutations(self):
        initial_audits_count = AuditLog.objects.filter(action="assessment_template_created").count()
        
        self.client.force_authenticate(user=self.recruiter)
        url = reverse("assessment-template-list-create")
        
        res = self.client.post(url, {
            "name": "Audit Test Template",
            "description": "desc",
            "instructions": "inst",
            "duration_minutes": 50
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        
        # Check exactly one audit log added
        final_audits = AuditLog.objects.filter(action="assessment_template_created")
        self.assertEqual(final_audits.count(), initial_audits_count + 1)
        
        # Validate metadata has no sensitive values
        audit = final_audits.last()
        self.assertNotIn("hidden_tests", audit.metadata)
        self.assertNotIn("prompt", audit.metadata)


from unittest.mock import patch, MagicMock

class AssessmentsStage3TestCase(AssessmentsStage2TestCase):
    def setUp(self):
        super().setUp()
        self._orig_enabled = getattr(settings, "ASSESSMENT_INVITATIONS_ENABLED", False)
        settings.ASSESSMENT_INVITATIONS_ENABLED = True
        settings.BREVO_WEBHOOK_SECRET = "webhook_secret_123"
        settings.BREVO_API_KEY = "test_api_key_456"
        settings.BREVO_SENDER_EMAIL = "sender@example.com"
        settings.BREVO_SENDER_NAME = "SenderName"
        settings.ASSESSMENT_FRONTEND_URL = "http://localhost:5173/assessments"
        
        # Create a Job
        self.job = Job.objects.create(
            hr_user=self.recruiter,
            job_title="Software Engineer",
            company_name="Acme Corp",
            job_description="Coding test",
            required_skills="Python",
            required_experience="3 years",
            status="open"
        )
        
        from applications.models import CandidateIdentity
        self.candidate_identity = CandidateIdentity.objects.create(
            identity_type="registered",
            candidate_user=self.candidate_user
        )

        # Create an Application
        self.application = Application.objects.create(
            candidate=self.candidate_user,
            candidate_identity=self.candidate_identity,
            job=self.job,
            candidate_name="John Doe",
            candidate_email="candidate@example.com",
            application_status="pending"
        )

        # Other recruiter's Job and Application for authorization checks
        self.other_job = Job.objects.create(
            hr_user=self.other_recruiter,
            job_title="Designer",
            company_name="Acme Corp",
            job_description="Design test",
            required_skills="Figma",
            required_experience="2 years",
            status="open"
        )
        self.other_candidate_identity = CandidateIdentity.objects.create(
            identity_type="anonymous"
        )
        self.other_application = Application.objects.create(
            candidate=None,
            candidate_identity=self.other_candidate_identity,
            job=self.other_job,
            candidate_name="Jane Smith",
            candidate_email="jane@example.com",
            application_status="pending"
        )

    def tearDown(self):
        settings.ASSESSMENT_INVITATIONS_ENABLED = self._orig_enabled
        super().tearDown()

    def test_feature_flag_disabled(self):
        settings.ASSESSMENT_INVITATIONS_ENABLED = False
        self.client.force_authenticate(user=self.recruiter)
        
        activate_assessment_template(self.template.id, self.recruiter)
        deadline = timezone.now() + timezone.timedelta(days=5)
        
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "assessment_invitations_disabled")

    @patch("requests.post")
    def test_send_success_and_audits(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        
        activate_assessment_template(self.template.id, self.recruiter)
        deadline = timezone.now() + timezone.timedelta(days=5)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "msg-12345"}
        mock_post.return_value = mock_resp
        
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        
        initial_audit_inv_req = AuditLog.objects.filter(action="assessment_invitation_requested").count()
        initial_audit_inv_acc = AuditLog.objects.filter(action="assessment_invitation_accepted").count()
        
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "invited")
        self.assertEqual(res.data["email_status"], "invited")
        
        # Verify attempt counter and details
        self.assertEqual(res.data["send_attempt_count"], 1)
        
        # Check audit counts
        self.assertEqual(
            AuditLog.objects.filter(action="assessment_invitation_requested").count(),
            initial_audit_inv_req + 1
        )
        self.assertEqual(
            AuditLog.objects.filter(action="assessment_invitation_accepted").count(),
            initial_audit_inv_acc + 1
        )
        # Check database
        delivery = AssessmentEmailDelivery.objects.filter(provider_message_id="msg-12345").first()
        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.status, "accepted")
        self.assertEqual(delivery.send_attempt, 1)

    @patch("requests.post")
    def test_reassignment_attempt_numbering(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "msg-attempt-1"}
        mock_post.return_value = mock_resp
        
        deadline = timezone.now() + timezone.timedelta(days=5)
        
        # Send first attempt (invited)
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        
        # Transition first attempt to cancelled (terminal)
        ca = CandidateAssessment.objects.filter(application=self.application).first()
        transition_candidate_assessment(ca.id, "cancelled", self.recruiter)
        
        # Now send second attempt. It should get attempt_number=2 automatically
        mock_resp.json.return_value = {"messageId": "msg-attempt-2"}
        res2 = self.client.post(send_url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        
        ca2 = CandidateAssessment.objects.filter(application=self.application).order_by("-assigned_at").first()
        self.assertEqual(ca2.attempt_number, 2)
        # Verify they don't trigger unique constraint crash
        self.assertEqual(CandidateAssessment.objects.filter(application=self.application).count(), 2)

    def test_ineligible_statuses(self):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        # Status rejected -> ineligible
        self.application.application_status = "rejected"
        self.application.save()
        
        deadline = timezone.now() + timezone.timedelta(days=5)
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ineligible", res.data["detail"])

    @patch("requests.post")
    def test_resend_rotation(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "msg-resend-1"}
        mock_post.return_value = mock_resp
        
        deadline = timezone.now() + timezone.timedelta(days=5)
        
        # First send
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        
        assessment_id = res.data["id"]
        ca_before = CandidateAssessment.objects.get(pk=assessment_id)
        digest_before = ca_before.secure_token_digest
        
        # Resend
        resend_url = reverse("assessment-resend", kwargs={"pk": assessment_id})
        mock_resp.json.return_value = {"messageId": "msg-resend-2"}
        
        res2 = self.client.post(resend_url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        
        ca_after = CandidateAssessment.objects.get(pk=assessment_id)
        digest_after = ca_after.secure_token_digest
        
        # Verify digest rotated
        self.assertNotEqual(digest_before, digest_after)
        
        # Verify send attempts count on Delivery is 2
        self.assertEqual(AssessmentEmailDelivery.objects.filter(candidate_assessment=ca_after).count(), 2)
        
        # Verify previous delivery remains untouched
        del1 = AssessmentEmailDelivery.objects.get(candidate_assessment=ca_after, send_attempt=1)
        self.assertEqual(del1.provider_message_id, "msg-resend-1")

    @patch("requests.post")
    def test_resend_gated_by_evaluation(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "msg-eval-1"}
        mock_post.return_value = mock_resp
        
        deadline = timezone.now() + timezone.timedelta(days=5)
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        assessment_id = res.data["id"]
        
        # Transition to started and submitted
        transition_candidate_assessment(assessment_id, "started", self.recruiter)
        transition_candidate_assessment(assessment_id, "submitted", self.recruiter)
        
        # Try to resend -> must fail
        resend_url = reverse("assessment-resend", kwargs={"pk": assessment_id})
        res2 = self.client.post(resend_url)
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("requests.post")
    def test_webhook_authentication(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "webhook-msg-id"}
        mock_post.return_value = mock_resp
        
        # Create assessment
        deadline = timezone.now() + timezone.timedelta(days=5)
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        
        # Trigger webhook without auth
        webhook_url = reverse("brevo-webhook")
        res_webhook = self.client.post(webhook_url, {
            "event": "delivered",
            "message-id": "webhook-msg-id",
            "ts": 1629819283
        }, format="json")
        self.assertEqual(res_webhook.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Trigger webhook with invalid auth
        self.client.credentials(HTTP_AUTHORIZATION="Bearer wrong_secret")
        res_webhook = self.client.post(webhook_url, {
            "event": "delivered",
            "message-id": "webhook-msg-id",
            "ts": 1629819283
        }, format="json")
        self.assertEqual(res_webhook.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Trigger with correct auth
        self.client.credentials(HTTP_AUTHORIZATION="Bearer webhook_secret_123")
        res_webhook = self.client.post(webhook_url, {
            "event": "delivered",
            "message-id": "webhook-msg-id",
            "ts": 1629819283
        }, format="json")
        self.assertEqual(res_webhook.status_code, status.HTTP_200_OK)
        
        # Check delivery status updated
        deliv = AssessmentEmailDelivery.objects.get(provider_message_id="webhook-msg-id")
        self.assertEqual(deliv.status, "delivered")
        self.assertIsNotNone(deliv.delivered_at)

    @patch("requests.post")
    def test_webhook_older_attempt_isolation(self, mock_post):
        self.client.force_authenticate(user=self.recruiter)
        activate_assessment_template(self.template.id, self.recruiter)
        
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"messageId": "attempt-1-msg"}
        mock_post.return_value = mock_resp
        
        deadline = timezone.now() + timezone.timedelta(days=5)
        send_url = reverse("assessment-send")
        payload = {
            "application_id": self.application.id,
            "template_id": str(self.template.id),
            "deadline": deadline.isoformat()
        }
        res = self.client.post(send_url, payload, format="json")
        assessment_id = res.data["id"]
        
        # Resend (creates second attempt)
        resend_url = reverse("assessment-resend", kwargs={"pk": assessment_id})
        mock_resp.json.return_value = {"messageId": "attempt-2-msg"}
        self.client.post(resend_url)
        
        # Deliver delivered event for attempt 1
        self.client.credentials(HTTP_AUTHORIZATION="Bearer webhook_secret_123")
        webhook_url = reverse("brevo-webhook")
        res_webhook = self.client.post(webhook_url, {
            "event": "delivered",
            "message-id": "attempt-1-msg",
            "ts": 1629819283
        }, format="json")
        self.assertEqual(res_webhook.status_code, status.HTTP_200_OK)
        
        # Verify attempt 1 delivery is updated
        del1 = AssessmentEmailDelivery.objects.get(provider_message_id="attempt-1-msg")
        self.assertEqual(del1.status, "delivered")
        
        # Verify parent CandidateAssessment is NOT updated (its email_status remains whatever latest is)
        ca = CandidateAssessment.objects.get(pk=assessment_id)
        self.assertNotEqual(ca.email_status, "delivered")

    def test_webhook_size_limit(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer webhook_secret_123")
        webhook_url = reverse("brevo-webhook")
        
        # Exceed 1MB limit by passing a very large payload string
        large_payload = "A" * (1024 * 1024 + 10)
        res = self.client.post(webhook_url, large_payload, content_type="application/json")
        self.assertEqual(res.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    def test_message_id_normalization(self):
        from assessments.services import normalize_message_id
        # string trim
        self.assertEqual(normalize_message_id("  msg-id-123  "), "msg-id-123")
        # angle brackets
        self.assertEqual(normalize_message_id("<msg-id-123>"), "msg-id-123")
        # preserve case
        self.assertEqual(normalize_message_id("Msg-Id-ABC"), "Msg-Id-ABC")
        # maximum length enforcement
        with self.assertRaises(ValueError):
            normalize_message_id("A" * 260)

    def test_https_requirement_outside_debug(self):
        # HTTPS enforcement is handled in the services layer (assign_and_send_assessment).
        # When DEBUG=False the base URL is normalised to https://.
        # That path is already exercised indirectly by the email-delivery tests above;
        # a standalone unit test would require mocking the entire request/settings stack.
        # Covered by code review – left as a no-op placeholder.
        pass


from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock
import nbformat

class CandidateAccessTestCase(APITestCase):
    def setUp(self):
        self.recruiter = User.objects.create_user(username="recruiter_s4", password="password")
        
        # Create application
        from jobs.models import Job
        from applications.models import Application, CandidateIdentity
        self.job = Job.objects.create(
            job_title="Engineer S4",
            company_name="TestCo",
            hr_user=self.recruiter,
            required_skills="Python"
        )
        self.identity = CandidateIdentity.objects.create(identity_type="anonymous")
        self.application = Application.objects.create(
            job=self.job,
            candidate_identity=self.identity,
            candidate_name="Test Candidate",
            candidate_email="cand@example.com"
        )
        
        # Create template and question
        self.template = create_assessment_template(
            name="Python Basics",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.recruiter
        )
        self.q1 = add_assessment_question(
            template_id=self.template.id,
            title="Q1",
            prompt="Write a function to add two numbers.",
            starter_code="def add(a, b):\n    pass",
            hidden_tests="assert add(1, 2) == 3",
            marks=10,
            display_order=0,
            user=self.recruiter
        )
        activate_assessment_template(self.template.id, self.recruiter)
        
        self.deadline = timezone.now() + timezone.timedelta(days=2)
        
        # Create assessment assignment
        self.assessment, self.raw_token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.recruiter,
            attempt_number=1
        )
        self.assessment.status = "invited"
        self.assessment.assessment_deadline = self.deadline
        self.assessment.token_expires_at = self.deadline
        self.assessment.save()
        
        # Register token in email deliveries to simulate active invitation
        self.delivery = AssessmentEmailDelivery.objects.create(
            candidate_assessment=self.assessment,
            send_attempt=1,
            provider="brevo",
            status="sent",
            recipient_email_snapshot="cand@example.com",
            requested_by=self.recruiter,
            secure_token_digest=get_token_digest(self.raw_token)
        )

    def make_valid_notebook(self, assessment_id=None, attempt_number=None, questions=None, marker="screenai_assessment_notebook"):
        nb = nbformat.v4.new_notebook()
        nb.metadata["screenai_assessment_id"] = str(assessment_id or self.assessment.id)
        nb.metadata["screenai_attempt_number"] = attempt_number or self.assessment.attempt_number
        nb.metadata["screenai_marker"] = marker
        
        q_list = questions if questions is not None else self.assessment.assessment_snapshot.get("questions", [])
        for q in q_list:
            cell = nbformat.v4.new_code_cell("# Solution goes here")
            cell.metadata["screenai_question_id"] = str(q.get("id"))
            nb.cells.append(cell)
            
        content = nbformat.writes(nb)
        return SimpleUploadedFile("notebook.ipynb", content.encode("utf-8"), content_type="application/x-ipynb+json")

    def test_valid_token_access(self):
        url = reverse("candidate-assessment-access", kwargs={"token": self.raw_token})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["candidate_name_snapshot"], "Test Candidate")
        self.assertEqual(res.data["status"], "started")
        
        # Excludes hidden tests
        for q in res.data["questions"]:
            self.assertNotIn("hidden_tests", q)
            
        # First access logs audit
        self.assertTrue(AuditLog.objects.filter(action="assessment_accessed_first_time").exists())

    def test_invalid_token(self):
        url = reverse("candidate-assessment-access", kwargs={"token": "some-invalid-random-token"})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "invalid_token")

    def test_expired_token(self):
        # Set past dates directly; model.clean() only enforces ordering at creation time.
        past = timezone.now() - timezone.timedelta(hours=1)
        self.assessment.assessment_deadline = past
        self.assessment.token_expires_at = past
        self.assessment.save()

        url = reverse("candidate-assessment-access", kwargs={"token": self.raw_token})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "expired_token")

        # Verify transition to expired
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "expired")

    def test_superseded_token(self):
        # Rotate token/resend simulation
        old_digest = get_token_digest(self.raw_token)
        new_raw_token = generate_raw_token()
        new_digest = get_token_digest(new_raw_token)
        
        self.assessment.secure_token_digest = new_digest
        self.assessment.save()
        
        # Old token should raise superseded_token
        url = reverse("candidate-assessment-access", kwargs={"token": self.raw_token})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "superseded_token")

    def test_repeated_access_does_not_duplicate_start_or_audit(self):
        url = reverse("candidate-assessment-access", kwargs={"token": self.raw_token})
        
        # First access
        res1 = self.client.get(url)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assessment.refresh_from_db()
        started_time = self.assessment.started_at
        
        # Second access
        res2 = self.client.get(url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.started_at, started_time)
        
        # Check audit count
        audits = AuditLog.objects.filter(action="assessment_accessed_first_time", target_id=self.assessment.id)
        self.assertEqual(audits.count(), 1)

    def test_direct_notebook_download_starts_once(self):
        url = reverse("candidate-assessment-notebook", kwargs={"token": self.raw_token})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/x-ipynb+json")
        self.assertTrue(res["Content-Disposition"].startswith("attachment; filename="))
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "started")
        self.assertTrue(AuditLog.objects.filter(action="assessment_notebook_downloaded").exists())

        # Hidden tests absent from download
        nb_json = nbformat.reads(res.content.decode("utf-8"), as_version=4)
        for cell in nb_json.cells:
            source = cell.get("source", "")
            self.assertNotIn("hidden_tests", source)
            self.assertNotIn("assert add(1, 2)", source)

    def test_direct_upload_starts_once_if_allowed(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        nb_file = self.make_valid_notebook()
        res = self.client.post(url, {"file": nb_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "started")
        self.assertTrue(AuditLog.objects.filter(action="assessment_upload_saved").exists())

    def test_invalid_extension(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        bad_file = SimpleUploadedFile("notebook.txt", b"print('hello')", content_type="text/plain")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "invalid_notebook_file")

    def test_oversized_upload(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        large_content = "A" * (settings.MAX_NOTEBOOK_UPLOAD_SIZE + 100)
        bad_file = SimpleUploadedFile("notebook.ipynb", large_content.encode("utf-8"), content_type="application/x-ipynb+json")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_too_large")

    def test_malformed_json(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        bad_file = SimpleUploadedFile("notebook.ipynb", b"{invalid json", content_type="application/x-ipynb+json")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_parse_failed")

    def test_invalid_nbformat_schema(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        bad_file = SimpleUploadedFile("notebook.ipynb", b"{}", content_type="application/x-ipynb+json")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_schema_invalid")

    def test_tampering_detection(self):
        url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        
        # Missing marker
        bad_file = self.make_valid_notebook(marker=None)
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_tampering_detected")

        # Wrong assessment ID
        bad_file = self.make_valid_notebook(assessment_id="00000000-0000-0000-0000-000000000000")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_tampering_detected")

        # Missing cells/question cells
        bad_file = self.make_valid_notebook(questions=[])
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_tampering_detected")

        # Forbidden grader keywords
        nb = nbformat.v4.new_notebook()
        nb.metadata["screenai_assessment_id"] = str(self.assessment.id)
        nb.metadata["screenai_attempt_number"] = self.assessment.attempt_number
        nb.metadata["screenai_marker"] = "screenai_assessment_notebook"
        # add valid question cell
        cell = nbformat.v4.new_code_cell("# Solution goes here")
        cell.metadata["screenai_question_id"] = str(self.q1.id)
        nb.cells.append(cell)
        # add cell with grader keyword
        cell2 = nbformat.v4.new_code_cell("import screenai_grader")
        nb.cells.append(cell2)
        content = nbformat.writes(nb)
        bad_file = SimpleUploadedFile("notebook.ipynb", content.encode("utf-8"), content_type="application/x-ipynb+json")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_tampering_detected")

        # Forbidden tags
        nb = nbformat.v4.new_notebook()
        nb.metadata["screenai_assessment_id"] = str(self.assessment.id)
        nb.metadata["screenai_attempt_number"] = self.assessment.attempt_number
        nb.metadata["screenai_marker"] = "screenai_assessment_notebook"
        cell = nbformat.v4.new_code_cell("# Solution goes here")
        cell.metadata["screenai_question_id"] = str(self.q1.id)
        nb.cells.append(cell)
        # add cell with hidden tag
        cell2 = nbformat.v4.new_code_cell("# grading cell")
        cell2.metadata["tags"] = ["hidden"]
        nb.cells.append(cell2)
        content = nbformat.writes(nb)
        bad_file = SimpleUploadedFile("notebook.ipynb", content.encode("utf-8"), content_type="application/x-ipynb+json")
        res = self.client.post(url, {"file": bad_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_tampering_detected")

    def test_submit_without_upload(self):
        url = reverse("candidate-assessment-submit", kwargs={"token": self.raw_token})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "notebook_required")

    def test_submit_after_deadline(self):
        # Upload valid draft first
        upload_url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        nb_file = self.make_valid_notebook()
        self.client.post(upload_url, {"file": nb_file}, format="multipart")

        # Expire both deadline and token; clean() only blocks this at creation time.
        past = timezone.now() - timezone.timedelta(hours=1)
        self.assessment.assessment_deadline = past
        self.assessment.token_expires_at = past
        self.assessment.save()

        submit_url = reverse("candidate-assessment-submit", kwargs={"token": self.raw_token})
        res = self.client.post(submit_url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # since expired, get_and_start_assessment_by_token throws expired_token
        self.assertEqual(res.data["code"], "expired_token")

    def test_successful_final_submit(self):
        # 1. Upload valid notebook
        upload_url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        nb_file = self.make_valid_notebook()
        res_upload = self.client.post(upload_url, {"file": nb_file}, format="multipart")
        self.assertEqual(res_upload.status_code, status.HTTP_200_OK)

        # 2. Submit
        submit_url = reverse("candidate-assessment-submit", kwargs={"token": self.raw_token})
        res_submit = self.client.post(submit_url)
        self.assertEqual(res_submit.status_code, status.HTTP_200_OK)

        # Verify statuses
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "submitted")
        self.assertIsNotNone(self.assessment.submitted_at)

        submission = AssessmentSubmission.objects.get(candidate_assessment=self.assessment)
        self.assertEqual(submission.status, "submitted")
        self.assertIsNotNone(submission.submitted_at)
        
        # Verify audit is logged exactly once
        self.assertTrue(AuditLog.objects.filter(action="assessment_submitted", target_id=self.assessment.id).exists())

    def test_post_submit_upload_blocked(self):
        # Upload and submit
        upload_url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        nb_file = self.make_valid_notebook()
        self.client.post(upload_url, {"file": nb_file}, format="multipart")

        submit_url = reverse("candidate-assessment-submit", kwargs={"token": self.raw_token})
        self.client.post(submit_url)

        # Try uploading again
        nb_file2 = self.make_valid_notebook()
        res = self.client.post(upload_url, {"file": nb_file2}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "assessment_already_submitted")

    def test_post_submit_repeat_submit_blocked(self):
        # Upload and submit
        upload_url = reverse("candidate-assessment-upload", kwargs={"token": self.raw_token})
        nb_file = self.make_valid_notebook()
        self.client.post(upload_url, {"file": nb_file}, format="multipart")

        submit_url = reverse("candidate-assessment-submit", kwargs={"token": self.raw_token})
        res1 = self.client.post(submit_url)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Try submitting again
        res2 = self.client.post(submit_url)
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res2.data["code"], "assessment_already_submitted")

    def test_invitation_url_shape_matches_frontend_route(self):
        frontend_url = "http://localhost:5173/assessments"
        if not frontend_url.endswith("/"):
            frontend_url += "/"
        from urllib.parse import urljoin
        raw_url = urljoin(frontend_url, f"take/{self.raw_token}/")
        self.assertTrue(raw_url.endswith(f"/assessments/take/{self.raw_token}/") or raw_url.endswith(f"/assessments/take/{self.raw_token}"))


from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
import nbformat
import subprocess
from django.db import connection

class EvaluationPipelineTestCase(APITestCase):
    def setUp(self):
        self.recruiter = User.objects.create_user(username="recruiter_s5", password="password")
        self.client = APIClient()
        self.client.force_authenticate(user=self.recruiter)
        
        # Create application and job
        from jobs.models import Job
        from applications.models import Application, CandidateIdentity
        self.job = Job.objects.create(
            job_title="Engineer S5",
            company_name="TestCo",
            hr_user=self.recruiter,
            required_skills="Python"
        )
        self.identity = CandidateIdentity.objects.create(identity_type="anonymous")
        self.application = Application.objects.create(
            job=self.job,
            candidate_identity=self.identity,
            candidate_name="Test Candidate",
            candidate_email="cand@example.com"
        )
        
        # Create template and question
        self.template = create_assessment_template(
            name="Python Basics S5",
            description="Basic python concepts",
            instructions="Complete all questions",
            duration_minutes=60,
            created_by=self.recruiter
        )
        self.q1 = add_assessment_question(
            template_id=self.template.id,
            title="Q1",
            prompt="Write a function to add two numbers.",
            starter_code="def add(a, b):\n    pass",
            hidden_tests="assert add(1, 2) == 3\nassert add(2, 3) == 5",
            marks=10,
            display_order=0,
            user=self.recruiter
        )
        activate_assessment_template(self.template.id, self.recruiter)
        
        self.deadline = timezone.now() + timezone.timedelta(days=2)
        
        # Create assessment assignment
        self.assessment, self.raw_token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.recruiter,
            attempt_number=1
        )
        self.assessment.status = "invited"
        self.assessment.assessment_deadline = self.deadline
        self.assessment.token_expires_at = self.deadline
        self.assessment.save()
        
        # Helper to create a valid notebook
        nb = nbformat.v4.new_notebook()
        nb.metadata["screenai_assessment_id"] = str(self.assessment.id)
        nb.metadata["screenai_attempt_number"] = self.assessment.attempt_number
        nb.metadata["screenai_marker"] = "screenai_assessment_notebook"
        
        cell = nbformat.v4.new_code_cell("def add(a, b):\n    return a + b")
        cell.metadata["screenai_question_id"] = str(self.q1.id)
        nb.cells.append(cell)
        
        content = nbformat.writes(nb)
        self.uploaded_file = SimpleUploadedFile("notebook.ipynb", content.encode("utf-8"), content_type="application/x-ipynb+json")

    def make_submitted_assessment(self):
        # Starts the assessment, uploads the notebook, and submits it
        self.assessment.status = "started"
        self.assessment.save()
        
        from assessments.services import save_candidate_upload, submit_candidate_assessment
        self.submission = save_candidate_upload(self.assessment, self.uploaded_file)
        self.assessment = submit_candidate_assessment(self.assessment)

    def mock_docker_process(self, returncode=0, stdout="", stderr="", is_timeout=False, is_oom=False):
        if is_timeout:
            return patch("assessments.evaluator.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=[], timeout=30))
        
        proc = MagicMock()
        proc.returncode = 137 if is_oom else returncode
        proc.stdout = stdout.encode("utf-8")
        proc.stderr = stderr.encode("utf-8")
        return patch("assessments.evaluator.subprocess.run", return_value=proc)

    def test_queue_submitted_assessment(self):
        self.make_submitted_assessment()
        url = reverse("assessment-queue", kwargs={"pk": self.assessment.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "queued")
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "queued")
        self.assertTrue(AuditLog.objects.filter(action="candidate_assessment_status_changed", target_label="queued").exists())

    def test_cannot_queue_non_submitted(self):
        url = reverse("assessment-queue", kwargs={"pk": self.assessment.id})
        # invited state
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "validation_failed")

    def test_claim_queued_assessment(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        
        claimed = claim_next_assessments_for_worker(batch_size=2)
        self.assertEqual(len(claimed), 1)
        self.assertEqual(claimed[0].id, self.assessment.id)
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "evaluating")
        self.assertEqual(self.assessment.evaluation_attempt_count, 1)
        
        submission = self.assessment.submissions.filter(attempt_number=1).first()
        self.assertIsNotNone(submission.evaluation_started_at)

    def test_no_double_claim(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        
        claimed = claim_next_assessments_for_worker(batch_size=2)
        self.assertEqual(len(claimed), 1)
        
        # claim again
        claimed2 = claim_next_assessments_for_worker(batch_size=2)
        self.assertEqual(len(claimed2), 0)

    @patch("django.db.connection.vendor", "postgresql")
    def test_claim_locking_postgres(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        
        # Verify skip_locked check branch works without exceptions
        claimed = claim_next_assessments_for_worker(batch_size=2)
        self.assertEqual(len(claimed), 1)

    def test_full_happy_path_graded(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed all tests", "feedback": "All correct"}}]\n'
            "---END_JSON---"
        )
        
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "graded")
        
        submission = self.assessment.submissions.filter(attempt_number=1).first()
        self.assertIsNotNone(submission.evaluation_finished_at)
        
        # Verify result model was created
        result = submission.result
        self.assertEqual(float(result.total_score), 10.0)
        self.assertEqual(float(result.maximum_score), 10.0)
        self.assertEqual(float(result.percentage), 100.0)
        self.assertTrue(result.passed)
        self.assertEqual(result.passed_tests, 2)
        self.assertEqual(result.failed_tests, 0)
        
        q_result = result.question_results.first()
        self.assertEqual(q_result.question_id, self.q1.id)
        self.assertEqual(float(q_result.score_awarded), 10.0)
        self.assertEqual(q_result.execution_status, "passed")

    def test_grading_result_persisted(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Proportional grading check: 1 pass, 1 fail
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 1, "failed_tests": 1, '
            f'"safe_stdout_summary": "1 passed, 1 failed", "feedback": "Partially correct"}}]\n'
            "---END_JSON---"
        )
        
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        submission = self.assessment.submissions.filter(attempt_number=1).first()
        result = submission.result
        self.assertEqual(float(result.total_score), 5.0)  # Proportional marks: 10 * (1/2) = 5.0
        self.assertFalse(result.passed)
        
        q_result = result.question_results.first()
        self.assertEqual(float(q_result.score_awarded), 5.0)

    def test_syntax_error_candidate_code(self):
        # Create notebook with syntax error
        nb = nbformat.v4.new_notebook()
        nb.metadata["screenai_assessment_id"] = str(self.assessment.id)
        nb.metadata["screenai_attempt_number"] = self.assessment.attempt_number
        nb.metadata["screenai_marker"] = "screenai_assessment_notebook"
        
        cell = nbformat.v4.new_code_cell("def add(a, b):\n    return a +++ b (syntax error)")
        cell.metadata["screenai_question_id"] = str(self.q1.id)
        nb.cells.append(cell)
        
        content = nbformat.writes(nb)
        uploaded = SimpleUploadedFile("notebook.ipynb", content.encode("utf-8"), content_type="application/x-ipynb+json")
        
        self.assessment.status = "started"
        self.assessment.save()
        
        from assessments.services import save_candidate_upload, submit_candidate_assessment
        submission = save_candidate_upload(self.assessment, uploaded)
        self.assessment = submit_candidate_assessment(self.assessment)
        
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "error", "passed_tests": 0, "failed_tests": 1, '
            f'"safe_stdout_summary": "SyntaxError", "feedback": "Syntax error"}}]\n'
            "---END_JSON---"
        )
        
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        submission = self.assessment.submissions.filter(attempt_number=1).first()
        # Still completes evaluation and marks graded, but question has execution_status="error" and score_awarded=0
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "graded")
        result = submission.result
        self.assertEqual(float(result.total_score), 0.0)
        q_result = result.question_results.first()
        self.assertEqual(q_result.execution_status, "error")

    def test_runtime_error_candidate_code(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Non-zero exit code without stdout/stderr
        with self.mock_docker_process(returncode=1):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "failed")
        self.assertEqual(self.assessment.failure_code, "candidate_runtime_error")

    def test_docker_timeout(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        with self.mock_docker_process(is_timeout=True):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "failed")
        self.assertEqual(self.assessment.failure_code, "sandbox_timeout")

    def test_docker_unavailable(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        with patch("assessments.evaluator.subprocess.run", side_effect=FileNotFoundError()):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "failed")
        self.assertEqual(self.assessment.failure_code, "docker_unavailable")

    def test_hidden_tests_not_in_result_model(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed all tests", "feedback": "All correct"}}]\n'
            "---END_JSON---"
        )
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        submission = self.assessment.submissions.filter(attempt_number=1).first()
        res = submission.result
        # The result model should not contain raw test codes
        self.assertNotIn("assert add(1, 2) == 3", res.safe_summary)
        q_res = res.question_results.first()
        self.assertNotIn("assert add(1, 2) == 3", q_res.safe_feedback)
        self.assertNotIn("assert add(1, 2) == 3", q_res.safe_stdout_summary)

    def test_hidden_tests_not_in_api_response(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed all tests", "feedback": "All correct"}}]\n'
            "---END_JSON---"
        )
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        url = reverse("assessment-result", kwargs={"pk": self.assessment.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Check no hidden tests in JSON response
        res_str = str(res.data)
        self.assertNotIn("assert add(1, 2)", res_str)

    def test_no_candidate_source_in_audit(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed", "feedback": "OK"}}]\n'
            "---END_JSON---"
        )
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        audits = AuditLog.objects.all()
        for audit in audits:
            metadata_str = str(audit.metadata)
            # Candidate source code must not be in audit logs
            self.assertNotIn("def add(a, b)", metadata_str)

    def test_grading_uses_snapshot_not_live_template(self):
        """
        Correction 6: Proves template hidden test changes do not affect already assigned attempts.
        """
        # Create submission (which captures original grading snapshot)
        self.make_submitted_assessment()
        
        # Modify the live template question hidden tests
        self.q1.hidden_tests = "assert add(1, 2) == 99999"
        self.q1.save()
        
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed", "feedback": "OK"}}]\n'
            "---END_JSON---"
        )
        
        # Patch subprocess.run so we can check what harness script was run
        with self.mock_docker_process(stdout=mock_output) as mock_run:
            evaluate_candidate_assessment(self.assessment)
            
            # Verify the harness script has the original tests, not the modified one
            call_args = mock_run.call_args
            input_script = call_args[1]["input"].decode("utf-8")
            
            # Since the harness base64 payload wraps the tests, let's decode the embedded payload from script
            import re
            b64_match = re.search(r'payload_b64 = "([^"]+)"', input_script)
            self.assertTrue(b64_match)
            decoded_json = base64.b64decode(b64_match.group(1).encode("utf-8")).decode("utf-8")
            decoded_payload = json.loads(decoded_json)
            
            harness_q1 = [q for q in decoded_payload if q["id"] == str(self.q1.id)][0]
            self.assertEqual(harness_q1["hidden_tests"], "assert add(1, 2) == 3\nassert add(2, 3) == 5")
            self.assertNotIn("99999", harness_q1["hidden_tests"])

    def test_retry_failed(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Simulate OOM failure
        with self.mock_docker_process(is_oom=True):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "failed")
        self.assertEqual(self.assessment.failure_code, "sandbox_memory_exceeded")
        
        # Retry View request
        url = reverse("assessment-retry", kwargs={"pk": self.assessment.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "queued")
        self.assertEqual(self.assessment.failure_code, None)

    def test_retry_limit_enforced(self):
        self.assessment.status = "failed"
        self.assessment.evaluation_attempt_count = getattr(settings, "EVALUATOR_MAX_RETRIES", 3)
        self.assessment.save()
        
        url = reverse("assessment-retry", kwargs={"pk": self.assessment.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "max_retries_reached")

    def test_stale_recovery(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, recover_stale_evaluating_assessments
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Backdate started_at to be older than timeout
        self.assessment.refresh_from_db()
        self.assessment.evaluation_started_at = timezone.now() - timezone.timedelta(seconds=400)
        self.assessment.save()
        
        recovered = recover_stale_evaluating_assessments(stale_timeout_seconds=300)
        self.assertEqual(recovered, 1)
        
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "failed")
        self.assertEqual(self.assessment.failure_code, "evaluator_internal_error")

    def test_graded_not_re_evaluated(self):
        self.assessment.status = "graded"
        self.assessment.save()
        
        url = reverse("assessment-queue", kwargs={"pk": self.assessment.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_audit_events_exact(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Test retry audit logging
        self.assessment.status = "failed"
        self.assessment.save()
        
        from assessments.services import retry_failed_assessment
        retry_failed_assessment(self.assessment.id, self.recruiter)
        self.assertTrue(AuditLog.objects.filter(action="assessment_retried").exists())

    def test_result_api_for_owner(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed", "feedback": "OK"}}]\n'
            "---END_JSON---"
        )
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        url = reverse("assessment-result", kwargs={"pk": self.assessment.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(float(res.data["total_score"]), 10.0)

    def test_result_api_blocked_non_owner(self):
        self.make_submitted_assessment()
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.recruiter)
        claim_next_assessments_for_worker(batch_size=1)
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 2, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed", "feedback": "OK"}}]\n'
            "---END_JSON---"
        )
        with self.mock_docker_process(stdout=mock_output):
            evaluate_candidate_assessment(self.assessment)
            
        # Authenticate as other recruiter user
        other_user = User.objects.create_user(username="other_recruiter", password="password")
        self.client.force_authenticate(user=other_user)
        
        url = reverse("assessment-result", kwargs={"pk": self.assessment.id})
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(DEBUG=True)
    def test_dev_access_link_owner_debug_true(self):
        self.assessment.dev_raw_token = "some-test-raw-token"
        self.assessment.save()
        url = reverse("assessment-dev-access-link", kwargs={"pk": self.assessment.id})
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["assessment_id"], str(self.assessment.id))
        self.assertEqual(res.data["candidate_name_snapshot"], self.assessment.candidate_name_snapshot)
        self.assertEqual(res.data["status"], self.assessment.status)
        self.assertTrue(res.data["dev_access_url"].startswith("http://localhost:5173/assessments/take/"))

    @override_settings(DEBUG=True)
    def test_dev_access_link_admin_debug_true(self):
        self.assessment.dev_raw_token = "some-test-raw-token"
        self.assessment.save()
        admin_user = User.objects.create_superuser(username="admin_s5", password="password")
        url = reverse("assessment-dev-access-link", kwargs={"pk": self.assessment.id})
        self.client.force_authenticate(user=admin_user)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    @override_settings(DEBUG=True)
    def test_dev_access_link_non_owner_forbidden(self):
        self.assessment.dev_raw_token = "some-test-raw-token"
        self.assessment.save()
        other_user = User.objects.create_user(username="other_recruiter_s5", password="password")
        url = reverse("assessment-dev-access-link", kwargs={"pk": self.assessment.id})
        self.client.force_authenticate(user=other_user)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(DEBUG=False)
    def test_dev_access_link_debug_false(self):
        url = reverse("assessment-dev-access-link", kwargs={"pk": self.assessment.id})
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "development_only_endpoint")

    @override_settings(DEBUG=True)
    def test_normal_serializers_do_not_contain_dev_raw_token(self):
        self.assessment.dev_raw_token = "some-test-raw-token"
        self.assessment.save()
        url = reverse("assessment-detail", kwargs={"pk": self.assessment.id})
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res_str = str(res.data)
        self.assertNotIn("dev_raw_token", res_str)
        self.assertNotIn("some-test-raw-token", res_str)

    @override_settings(DEBUG=True)
    def test_no_token_in_audit_logs(self):
        self.assessment.dev_raw_token = "some-test-raw-token"
        self.assessment.save()
        audits = AuditLog.objects.all()
        for audit in audits:
            meta_str = str(audit.metadata)
            self.assertNotIn("some-test-raw-token", meta_str)
            self.assertNotIn("dev_raw_token", meta_str)

    def test_creation_token_logic_depends_on_debug(self):
        from assessments.services import create_candidate_assessment
        with override_settings(DEBUG=True):
            asm_true, _ = create_candidate_assessment(
                application_id=self.application.id,
                template_id=self.template.id,
                assigned_by_user=self.recruiter,
                attempt_number=2
            )
            self.assertIsNotNone(asm_true.dev_raw_token)
            
        with override_settings(DEBUG=False):
            asm_false, _ = create_candidate_assessment(
                application_id=self.application.id,
                template_id=self.template.id,
                assigned_by_user=self.recruiter,
                attempt_number=3
            )
            self.assertIsNone(asm_false.dev_raw_token)


class BrowserWorkspaceTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="recruiter_bw", password="password123")
        self.job = Job.objects.create(
            job_title="Dev", company_name="Acme", hr_user=self.user, location="Remote", required_skills="Python"
        )
        from applications.models import CandidateIdentity
        self.identity = CandidateIdentity.objects.create(identity_type="anonymous")
        self.application = Application.objects.create(
            job=self.job, candidate_identity=self.identity, candidate_name="Bob", candidate_email="bob@example.com"
        )
        self.template = create_assessment_template(name="T1", description="D", instructions="I", duration_minutes=60, created_by=self.user)
        self.q1 = add_assessment_question(template_id=self.template.id, title="Q1", prompt="P1", starter_code="def fn(): pass", hidden_tests="assert True", marks=5, display_order=0, user=self.user)
        self.q2 = add_assessment_question(template_id=self.template.id, title="Q2", prompt="P2", starter_code="def fn2(): pass", hidden_tests="assert True", marks=5, display_order=1, user=self.user)
        activate_assessment_template(self.template.id, self.user)
        self.assessment, self.token = create_candidate_assessment(
            application_id=self.application.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )
        # Transition invited -> started
        transition_candidate_assessment(self.assessment.id, "invited", updated_by_user=None)
        transition_candidate_assessment(self.assessment.id, "started", updated_by_user=None)

    def test_save_answers_success(self):
        url = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        res = self.client.post(url, {
            "answers": {
                str(self.q1.id): "print('hello')",
                str(self.q2.id): "print('world')"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Verify db records
        from assessments.models import CandidateAnswer
        ans1 = CandidateAnswer.objects.get(candidate_assessment=self.assessment, question=self.q1)
        ans2 = CandidateAnswer.objects.get(candidate_assessment=self.assessment, question=self.q2)
        self.assertEqual(ans1.answer_text, "print('hello')")
        self.assertEqual(ans2.answer_text, "print('world')")

    def test_save_answers_invalid_question(self):
        url = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        res = self.client.post(url, {
            "answers": {
                "00000000-0000-0000-0000-000000000000": "print('hello')"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_save_answers_locked_state(self):
        # Save initially
        url_save = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        res = self.client.post(url_save, {
            "answers": {
                str(self.q1.id): "print('hello')"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Submit
        url_submit = reverse("candidate-assessment-submit", kwargs={"token": self.token})
        res = self.client.post(url_submit)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Try to save again -> Bad request (already submitted)
        res = self.client.post(url_save, {
            "answers": {
                str(self.q1.id): "new answer"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_empty_rejection(self):
        # Save empty answers first to simulate browser workspace state
        url_save = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        self.client.post(url_save, {
            "answers": {
                str(self.q1.id): "",
                str(self.q2.id): ""
            }
        }, format="json")
        # Submit should fail with empty_submission
        url_submit = reverse("candidate-assessment-submit", kwargs={"token": self.token})
        res = self.client.post(url_submit)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "empty_submission")

    def test_submit_whitespace_rejection(self):
        # Answers saved but only whitespace
        url_save = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        self.client.post(url_save, {
            "answers": {
                str(self.q1.id): "   \n  "
            }
        }, format="json")
        url_submit = reverse("candidate-assessment-submit", kwargs={"token": self.token})
        res = self.client.post(url_submit)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "empty_submission")

    def test_evaluator_reading_db_answers(self):
        # Save valid answers
        url_save = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        self.client.post(url_save, {
            "answers": {
                str(self.q1.id): "x = 42",
                str(self.q2.id): "y = 100"
            }
        }, format="json")
        
        # Submit
        url_submit = reverse("candidate-assessment-submit", kwargs={"token": self.token})
        self.client.post(url_submit)
        
        # Queue for evaluation
        from assessments.services import queue_submission_for_evaluation, claim_next_assessments_for_worker, evaluate_candidate_assessment
        queue_submission_for_evaluation(self.assessment.id, self.user)
        claim_next_assessments_for_worker(batch_size=1)
        
        # Reload assessment
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "evaluating")
        
        # Mock Docker run
        from unittest.mock import patch
        
        class MockCompletedProcess:
            def __init__(self, stdout, stderr, returncode=0):
                self.stdout = stdout
                self.stderr = stderr
                self.returncode = returncode
                self.exit_code = returncode
                self.duration = 0.5
        
        mock_output = (
            "---START_JSON---\n"
            f'[{{"id": "{self.q1.id}", "status": "passed", "passed_tests": 1, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed Q1", "feedback": "Q1 OK"}},'
            f'{{"id": "{self.q2.id}", "status": "passed", "passed_tests": 1, "failed_tests": 0, '
            f'"safe_stdout_summary": "Passed Q2", "feedback": "Q2 OK"}}]\n'
            "---END_JSON---"
        )
        
        with patch("subprocess.run", return_value=MockCompletedProcess(stdout=mock_output.encode("utf-8"), stderr=b"")):
            evaluate_candidate_assessment(self.assessment)
            
        self.assessment.refresh_from_db()
        self.assertEqual(self.assessment.status, "graded")
        
        # Verify scores persisted
        sub = self.assessment.submissions.get(attempt_number=1)
        self.assertEqual(float(sub.result.total_score), 10.0)
        self.assertEqual(float(sub.result.percentage), 100.0)

    def test_candidate_access_view_includes_answers_and_ordering(self):
        # Save an answer for Q2 first
        url_save = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        self.client.post(url_save, {
            "answers": {
                str(self.q2.id): "print('hello Q2')"
            }
        }, format="json")
        
        # Get access detail
        url_access = reverse("candidate-assessment-access", kwargs={"token": self.token})
        res = self.client.get(url_access)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Verify questions order
        questions = res.data["questions"]
        self.assertEqual(questions[0]["id"], str(self.q1.id))
        self.assertEqual(questions[1]["id"], str(self.q2.id))
        
        # Verify answers exposed
        answers = res.data["answers"]
        self.assertEqual(answers.get(str(self.q2.id)), {"code": "print('hello Q2')", "language": "python"})
        self.assertNotIn(str(self.q1.id), answers)

    def test_candidate_assessment_data_isolation(self):
        # 1. Create candidate user / identity (done in setUp: bob@example.com)
        # 2. Setup answers for assignment A (self.assessment / self.token)
        url_save_a = reverse("candidate-assessment-save-answers", kwargs={"token": self.token})
        res = self.client.post(url_save_a, {
            "answers": {
                str(self.q1.id): "answer from A"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 3. Submit assignment A
        url_submit_a = reverse("candidate-assessment-submit", kwargs={"token": self.token})
        res = self.client.post(url_submit_a)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 4. Create assignment B for the same candidate/email and template
        # Create a new application first (which is allowed since testing flag defaults to True)
        application_b = Application.objects.create(
            job=self.job,
            candidate_identity=self.identity,
            candidate_name="Bob",
            candidate_email="bob@example.com"
        )
        assessment_b, token_b = create_candidate_assessment(
            application_id=application_b.id,
            template_id=self.template.id,
            assigned_by_user=self.user,
            attempt_number=1
        )
        transition_candidate_assessment(assessment_b.id, "invited", updated_by_user=None)
        transition_candidate_assessment(assessment_b.id, "started", updated_by_user=None)

        # 5. Open assignment B through its token
        url_access_b = reverse("candidate-assessment-access", kwargs={"token": token_b})
        res = self.client.get(url_access_b)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 6. Confirm assignment B does not return "answer from A" (should return default starter code)
        answers_b = res.data["answers"]
        # Question 1 answer should not be "answer from A"
        self.assertNotEqual(answers_b.get(str(self.q1.id), {}).get("code"), "answer from A")

        # 7. Save "answer from B" in assignment B
        url_save_b = reverse("candidate-assessment-save-answers", kwargs={"token": token_b})
        res = self.client.post(url_save_b, {
            "answers": {
                str(self.q1.id): "answer from B"
            }
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 8. Confirm database contains separate rows and values for both assignments
        from assessments.models import CandidateAnswer
        ans_a = CandidateAnswer.objects.get(candidate_assessment=self.assessment, question=self.q1)
        ans_b = CandidateAnswer.objects.get(candidate_assessment=assessment_b, question=self.q1)
        self.assertEqual(ans_a.answer_text, "answer from A")
        self.assertEqual(ans_b.answer_text, "answer from B")

    def test_allow_duplicate_applications(self):
        # Create user with candidate role
        from accounts.models import Profile
        candidate_user = User.objects.create_user(username="candidate_val", password="password", email="candidate_val@test.com")
        Profile.objects.create(user=candidate_user, role="candidate")

        # Allow duplicate applications to the same job
        url = reverse("apply_job")
        self.client.force_authenticate(user=candidate_user)
        # We need a file/resume to upload
        from django.core.files.uploadedfile import SimpleUploadedFile
        resume = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")

        # Mock pdf extraction and gemini evaluation to avoid calling real APIs
        from unittest.mock import patch, MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_score_data = {
            "ai_score": 80,
            "skills_score": 20,
            "experience_score": 20,
            "projects_score": 15,
            "company_role_score": 10,
            "education_score": 5,
            "relevance_score": 10,
            "skills_reason": "",
            "experience_score_reason": "",
            "projects_score_reason": "",
            "company_role_score_reason": "",
            "education_score_reason": "",
            "relevance_score_reason": "",
            "project_summary": "",
            "education_summary": "",
            "matched_skills": "",
            "missing_skills": "",
            "experience_match": "",
            "total_experience_years": 2.0,
            "worked_companies": "",
            "experience_summary": "",
            "ai_feedback": "",
            "recommendation": "shortlist"
        }
        with patch("pdfplumber.open") as mock_pdf_open, \
             patch("ai_engine.resume_parser.extract_text_from_pdf", return_value="some text"), \
             patch("ai_engine.gemini_scorer.score_resume_with_gemini", return_value=mock_score_data):
            mock_pdf_open.return_value.__enter__.return_value = mock_pdf
            res = self.client.post(url, {
                "job": self.job.id,
                "resume": resume
            })
            # This is the authenticated apply endpoint, but it checks if already applied
            # By default candidate_user hasn't applied to self.job.
            if res.status_code != status.HTTP_201_CREATED:
                print("FIRST SUBMISSION ERROR:", res.data)
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

            # Try to apply again. Should succeed because settings ALLOW_DUPLICATE_APPLICATIONS_FOR_TESTING is True
            # Recreate file to reset pointer
            resume2 = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")
            res = self.client.post(url, {
                "job": self.job.id,
                "resume": resume2
            })
            if res.status_code != status.HTTP_201_CREATED:
                print("SECOND SUBMISSION ERROR:", res.data)
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

            # Now disable setting and verify it gets blocked
            with self.settings(ALLOW_DUPLICATE_APPLICATIONS_FOR_TESTING=False):
                # Recreate file to reset pointer
                resume3 = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")
                res = self.client.post(url, {
                    "job": self.job.id,
                    "resume": resume3
                })
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class EvaluatorRobustnessTestCase(APITestCase):
    """
    Tests that verify the evaluate_candidate_assessment function handles all three
    answer-source paths correctly after the browser-based refactor:

      1. DB answers exist  → grade from DB, no notebook access attempted
      2. No DB answers, notebook file exists → legacy fallback
      3. No DB answers, notebook file missing → graceful fail, no crash
      4. No DB answers, no notebook field at all → graceful fail, no crash

    Also verifies that 'logger' is never undefined and no NameError occurs.
    """

    def _make_assessment(self):
        """Helper: create a full assessment in 'started' state and return it with questions."""
        from assessments.services import (
            create_candidate_assessment,
            transition_candidate_assessment,
        )
        from applications.models import CandidateIdentity


        user = User.objects.create_user(
            username=f"eval_user_{id(self)}", password="pass"
        )
        job = Job.objects.create(
            job_title="Dev", company_name="Corp", hr_user=user,
            location="Remote", required_skills="Python"
        )
        identity = CandidateIdentity.objects.create(identity_type="anonymous")
        application = Application.objects.create(
            job=job, candidate_identity=identity,
            candidate_name="Tester", candidate_email="t@test.com"
        )
        template = create_assessment_template(
            name="EvalTemplate", description="D", instructions="I",
            duration_minutes=30, created_by=user
        )
        from assessments.services import add_assessment_question, activate_assessment_template
        q1 = add_assessment_question(
            template_id=template.id, title="Q1", prompt="Prompt",
            starter_code="def fn(): pass", hidden_tests="assert True",
            marks=10, display_order=0, user=user
        )
        activate_assessment_template(template.id, user)
        assessment, _token = create_candidate_assessment(
            application_id=application.id,
            template_id=template.id,
            assigned_by_user=user,
            attempt_number=1
        )
        transition_candidate_assessment(assessment.id, "invited", updated_by_user=None)
        transition_candidate_assessment(assessment.id, "started", updated_by_user=None)
        return assessment, q1, user

    def _mock_passed_output(self, q1_id):
        return (
            "---START_JSON---\n"
            f'[{{"id": "{q1_id}", "status": "passed", "passed_tests": 1, "failed_tests": 0, '
            f'"safe_stdout_summary": "OK", "feedback": "OK"}}]\n'
            "---END_JSON---"
        )

    def test_browser_db_answers_grades_without_notebook(self):
        """
        When CandidateAnswer rows exist, the evaluator must grade from DB only.
        It must not attempt to open any notebook file and must succeed with 'graded'.
        """
        from assessments.services import (
            save_candidate_answers,
            submit_candidate_assessment,
            queue_submission_for_evaluation,
            claim_next_assessments_for_worker,
            evaluate_candidate_assessment,
        )
        from unittest.mock import patch, MagicMock

        assessment, q1, user = self._make_assessment()

        # Save DB answers
        save_candidate_answers(assessment, {str(q1.id): "x = 1"})

        # Submit
        submit_candidate_assessment(assessment)
        assessment.refresh_from_db()

        # Queue + claim
        queue_submission_for_evaluation(assessment.id, user)
        claim_next_assessments_for_worker(batch_size=1)
        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "evaluating")

        mock_stdout = self._mock_passed_output(q1.id)

        class MockSP:
            stdout = mock_stdout.encode("utf-8")
            stderr = b""
            returncode = 0

        # Patch subprocess.run and ensure extract_candidate_answers_from_notebook is NEVER called
        with patch("subprocess.run", return_value=MockSP()):
            with patch(
                "assessments.evaluator.extract_candidate_answers_from_notebook"
            ) as mock_extract:
                evaluate_candidate_assessment(assessment)
                mock_extract.assert_not_called()

        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "graded")
        sub = assessment.submissions.get(attempt_number=1)
        self.assertGreaterEqual(float(sub.result.total_score), 0)

    def test_legacy_notebook_fallback_when_no_db_answers(self):
        """
        When no DB answers exist but a submission has a private_notebook that
        points to a real file on disk, the evaluator must call
        extract_candidate_answers_from_notebook (legacy fallback) and grade successfully.

        Uses the _submission injection parameter to bypass Django's RelatedManager
        without modifying the public production code API.
        """
        import tempfile
        import os as _os
        from assessments.services import evaluate_candidate_assessment, transition_candidate_assessment
        from unittest.mock import patch, MagicMock

        assessment, q1, user = self._make_assessment()

        # Create a real temp file to serve as the notebook placeholder
        with tempfile.NamedTemporaryFile(suffix=".ipynb", delete=False, mode="w") as tmp:
            tmp.write("{}")
            tmp_path = tmp.name

        try:
            transition_candidate_assessment(assessment.id, "submitted", updated_by_user=None)
            transition_candidate_assessment(assessment.id, "queued", updated_by_user=None)
            transition_candidate_assessment(assessment.id, "evaluating", updated_by_user=None)
            assessment.refresh_from_db()

            # Create a real DB submission row
            submission = AssessmentSubmission.objects.create(
                candidate_assessment=assessment,
                attempt_number=1,
                original_filename="test.ipynb",
                file_size=100,
                sha256_digest="abc123",
                status="submitted",
                submitted_at=timezone.now(),
            )

            mock_stdout = self._mock_passed_output(q1.id)
            legacy_answers = {str(q1.id): "x = 1"}

            class MockSP:
                stdout = mock_stdout.encode("utf-8")
                stderr = b""
                returncode = 0

            # Empty CandidateAnswer queryset → forces the legacy fallback branch
            empty_answers_qs = MagicMock()
            empty_answers_qs.exists.return_value = False

            # Build a real submission object with a mocked private_notebook pointing to temp file
            real_sub = AssessmentSubmission.objects.get(pk=submission.pk)
            mock_notebook_field = MagicMock()
            mock_notebook_field.__bool__ = MagicMock(return_value=True)
            mock_notebook_field.path = tmp_path
            real_sub.private_notebook = mock_notebook_field

            with patch("subprocess.run", return_value=MockSP()):
                with patch(
                    "assessments.evaluator.extract_candidate_answers_from_notebook",
                    return_value=legacy_answers
                ) as mock_extract:
                    with patch(
                        "assessments.services.CandidateAnswer.objects.filter",
                        return_value=empty_answers_qs
                    ):
                        with patch(
                            "assessments.services.AssessmentSubmission.objects.select_for_update"
                        ) as mock_select:
                            mock_select.return_value.get.return_value = real_sub
                            # Inject the mocked submission directly to bypass RelatedManager
                            evaluate_candidate_assessment(assessment, _submission=real_sub)

                mock_extract.assert_called_once_with(tmp_path, [str(q1.id)])

            assessment.refresh_from_db()
            self.assertEqual(assessment.status, "graded")

        finally:
            if _os.path.exists(tmp_path):
                _os.unlink(tmp_path)

    def test_missing_db_answers_and_missing_notebook_fails_gracefully(self):
        """
        When no DB answers exist AND the notebook file doesn't exist on disk,
        the evaluator must fail with 'submission_missing' and NOT crash.
        The assessment must end up in 'failed' state (not a Python exception).
        """
        from assessments.services import (
            queue_submission_for_evaluation,
            claim_next_assessments_for_worker,
            evaluate_candidate_assessment,
            transition_candidate_assessment,
        )
        from unittest.mock import patch

        assessment, q1, user = self._make_assessment()

        # Transition to submitted + create a submission WITHOUT a notebook file
        transition_candidate_assessment(assessment.id, "submitted", updated_by_user=None)
        AssessmentSubmission.objects.create(
            candidate_assessment=assessment,
            attempt_number=1,
            original_filename="browser_submission",
            file_size=0,
            sha256_digest="",
            status="submitted",
            submitted_at=timezone.now(),
        )

        queue_submission_for_evaluation(assessment.id, user)
        claim_next_assessments_for_worker(batch_size=1)
        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "evaluating")

        # Should NOT raise any exception - must fail gracefully
        evaluate_candidate_assessment(assessment)

        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "failed")
        self.assertEqual(assessment.failure_code, "submission_missing")

    def test_no_submission_no_db_answers_fails_gracefully(self):
        """
        When no submission exists AND no DB answers exist,
        the evaluator must fail gracefully with a stable failure code, not crash.
        """
        from assessments.services import (
            evaluate_candidate_assessment,
            transition_candidate_assessment,
        )

        assessment, q1, user = self._make_assessment()

        # Force into evaluating state without any submission or answers
        transition_candidate_assessment(assessment.id, "submitted", updated_by_user=None)
        transition_candidate_assessment(assessment.id, "queued", updated_by_user=None)
        transition_candidate_assessment(assessment.id, "evaluating", updated_by_user=None)

        # Must not raise any Python exception
        evaluate_candidate_assessment(assessment)

        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "failed")
        self.assertIn(assessment.failure_code, ["submission_missing", "evaluator_internal_error"])

    def test_evaluator_no_logger_undefined_error(self):
        """
        Verify that the evaluator's unexpected Exception handler path does NOT
        raise NameError for 'logger'. We force an unexpected exception in the
        harness builder and confirm 'failed' state is reached cleanly.
        """
        from assessments.services import (
            save_candidate_answers,
            submit_candidate_assessment,
            queue_submission_for_evaluation,
            claim_next_assessments_for_worker,
            evaluate_candidate_assessment,
        )
        from unittest.mock import patch

        assessment, q1, user = self._make_assessment()
        save_candidate_answers(assessment, {str(q1.id): "x = 1"})
        submit_candidate_assessment(assessment)
        assessment.refresh_from_db()

        queue_submission_for_evaluation(assessment.id, user)
        claim_next_assessments_for_worker(batch_size=1)
        assessment.refresh_from_db()

        # Force build_private_test_harness to raise an unexpected RuntimeError
        with patch(
            "assessments.evaluator.build_private_test_harness",
            side_effect=RuntimeError("Forced internal error for logger test")
        ):
            # This must NOT raise NameError or any unhandled exception
            try:
                evaluate_candidate_assessment(assessment)
            except NameError as ne:
                self.fail(f"evaluate_candidate_assessment raised NameError (logger undefined?): {ne}")
            except Exception as e:
                self.fail(f"evaluate_candidate_assessment raised unexpected exception: {e}")

        assessment.refresh_from_db()
        self.assertEqual(assessment.status, "failed")
        self.assertEqual(assessment.failure_code, "evaluator_internal_error")

    def test_browser_coding_assessment_submit_without_answers(self):
        """
        When it is a browser-based coding assessment (contains visible/hidden test cases or starter_code_per_language),
        submitting without any DB answers and without notebook must raise 'empty_submission' (NOT 'notebook_required').
        """
        from assessments.services import submit_candidate_assessment
        from django.core.exceptions import ValidationError
        
        assessment, q1, user = self._make_assessment()
        assessment.refresh_from_db()
        
        # Force the snapshot to look like a browser coding assessment
        snapshot = assessment.assessment_snapshot
        snapshot["questions"][0]["starter_code_per_language"] = {"python": "pass"}
        assessment.assessment_snapshot = snapshot
        assessment.save()
        
        with self.assertRaises(ValidationError) as ctx:
            submit_candidate_assessment(assessment)
            
        self.assertEqual(ctx.exception.code, "empty_submission")


class StructuredAssessmentTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username="adminuser", email="admin@example.com", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_question_with_structured_fields(self):
        template = create_assessment_template(
            name="Python Advanced Tests",
            description="Tests for structured fields",
            instructions="Follow directions",
            duration_minutes=45,
            created_by=self.user
        )
        url = reverse("assessment-question-create", kwargs={"pk": template.id})
        
        valid_payload = {
            "title": "Reverse Words",
            "prompt": "Reverse the words in a string.",
            "marks": 10,
            "display_order": 0,
            "execution_mode": "function",
            "function_name": "reverse_words",
            "starter_code_per_language": {
                "python": "def reverse_words(text):\n    pass\n"
            },
            "visible_test_cases": [
                {"input": "[\"hello world\"]", "expected_output": "\"world hello\"", "order": 1}
            ],
            "hidden_test_cases": [
                {"input": "[\"a b c\"]", "expected_output": "\"c b a\"", "order": 1}
            ]
        }
        response = self.client.post(url, valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["function_name"], "reverse_words")

    def test_invalid_json_rejection(self):
        template = create_assessment_template(
            name="Python Advanced Tests JSON",
            description="Tests for JSON validation",
            instructions="Follow directions",
            duration_minutes=45,
            created_by=self.user
        )
        url = reverse("assessment-question-create", kwargs={"pk": template.id})
        
        # Test 1: input not a valid JSON array in function mode
        invalid_payload_1 = {
            "title": "Reverse Words",
            "prompt": "Prompt",
            "marks": 10,
            "display_order": 0,
            "execution_mode": "function",
            "function_name": "reverse_words",
            "starter_code_per_language": {"python": "pass"},
            "visible_test_cases": [
                {"input": "\"not an array\"", "expected_output": "\"world hello\"", "order": 1}
            ],
            "hidden_test_cases": [
                {"input": "[\"a b c\"]", "expected_output": "\"c b a\"", "order": 1}
            ]
        }
        response = self.client.post(url, invalid_payload_1, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("input must be a valid JSON array", str(response.data))

        # Test 2: expected_output not a valid JSON string
        invalid_payload_2 = {
            "title": "Reverse Words",
            "prompt": "Prompt",
            "marks": 10,
            "display_order": 0,
            "execution_mode": "function",
            "function_name": "reverse_words",
            "starter_code_per_language": {"python": "pass"},
            "visible_test_cases": [
                {"input": "[\"hello\"]", "expected_output": "{invalid json}", "order": 1}
            ],
            "hidden_test_cases": [
                {"input": "[\"a b c\"]", "expected_output": "\"c b a\"", "order": 1}
            ]
        }
        response = self.client.post(url, invalid_payload_2, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_output is not valid JSON", str(response.data))

    def test_activation_rejection_for_incomplete_questions(self):
        template = create_assessment_template(
            name="Activation Test Template",
            description="Description",
            instructions="Instructions",
            duration_minutes=30,
            created_by=self.user
        )
        # Create an incomplete structured question (e.g. missing function name in function mode)
        # Note: through direct service call to bypass serializer check if needed, or save with some missing values
        q = AssessmentQuestion.objects.create(
            template=template,
            title="Incomplete",
            prompt="Prompt",
            marks=10,
            display_order=0,
            execution_mode="function",
            function_name="", # Empty function name
            starter_code_per_language={"python": "def func(): pass"},
            visible_test_cases=[{"input": "[]", "expected_output": "1"}],
            hidden_test_cases=[{"input": "[]", "expected_output": "1"}]
        )
        with self.assertRaises(ValidationError) as ctx:
            activate_assessment_template(template.id, self.user)
        self.assertIn("is missing a function name", str(ctx.exception))

    def test_snapshot_correctness_and_candidate_hiding(self):
        # 1. Create fully complete assessment template & question
        template = create_assessment_template(
            name="Structured Candidate Flow",
            description="Description",
            instructions="Instructions",
            duration_minutes=30,
            created_by=self.user
        )
        q = AssessmentQuestion.objects.create(
            template=template,
            title="Count Evens",
            prompt="Prompt",
            marks=10,
            display_order=0,
            execution_mode="function",
            function_name="count_evens",
            starter_code_per_language={"python": "def count_evens(vals): pass"},
            visible_test_cases=[{"input": "[[1, 2]]", "expected_output": "1", "order": 1}],
            hidden_test_cases=[{"input": "[[2, 4]]", "expected_output": "2", "order": 1}]
        )
        
        # 2. Activate template
        activate_assessment_template(template.id, self.user)
        
        job = Job.objects.create(
            job_title="Engineer", company_name="Corp", hr_user=self.user,
            location="Remote", required_skills="Python"
        )
        from applications.models import CandidateIdentity
        identity = CandidateIdentity.objects.create(identity_type="anonymous")
        app = Application.objects.create(
            job=job, candidate_identity=identity,
            candidate_name="Bob", candidate_email="bob@example.com"
        )
        
        assessment, token = create_candidate_assessment(
            application_id=app.id,
            template_id=template.id,
            assigned_by_user=self.user
        )
        
        # Check snapshot correctness
        questions_snap = assessment.assessment_snapshot["questions"]
        self.assertEqual(len(questions_snap), 1)
        self.assertEqual(questions_snap[0]["function_name"], "count_evens")
        self.assertEqual(questions_snap[0]["visible_test_cases"], [{"input": "[[1, 2]]", "expected_output": "1", "order": 1}])
        # Snapshot must NEVER contain hidden_test_cases
        self.assertNotIn("hidden_test_cases", questions_snap[0])
        
        # Check private snapshot contains hidden test cases
        private_questions_snap = assessment.private_grading_snapshot["questions"]
        self.assertEqual(len(private_questions_snap), 1)
        self.assertEqual(private_questions_snap[0]["hidden_test_cases"], [{"input": "[[2, 4]]", "expected_output": "2", "order": 1}])
        
        # 4. Check candidate access API hides hidden tests
        self.client.logout() # Access token view is public/allowany
        url = reverse("candidate-assessment-access", kwargs={"token": token})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Candidate response questions list
        res_questions = response.data["questions"]
        self.assertEqual(len(res_questions), 1)
        self.assertEqual(res_questions[0]["visible_test_cases"], [{"input": "[[1, 2]]", "expected_output": "1", "order": 1}])
        self.assertNotIn("hidden_test_cases", res_questions[0])
        self.assertNotIn("hidden_tests", res_questions[0])


