import os
import json
import datetime
from io import StringIO
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from django.test import override_settings
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import AuditLog


class RegisterViewSecurityTestCase(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            username="adminuser",
            email="admin@example.com",
            password="adminpassword123"
        )
        self.hr_user = User.objects.create_user(
            username="hruser",
            email="hr@example.com",
            password="hrpassword123"
        )
        self.register_url = reverse("register")

    def test_anonymous_registration_is_denied(self):
        payload = {
            "username": "newrecruiter",
            "first_name": "New",
            "last_name": "Recruiter",
            "email": "recruiter@example.com",
            "phone": "1234567890",
            "password": "recruiterpass123",
            "confirm_password": "recruiterpass123"
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_hr_user_registration_is_denied(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "username": "newrecruiter",
            "first_name": "New",
            "last_name": "Recruiter",
            "email": "recruiter@example.com",
            "phone": "1234567890",
            "password": "recruiterpass123",
            "confirm_password": "recruiterpass123"
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_user_registration_is_allowed(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "username": "newrecruiter2",
            "first_name": "New",
            "last_name": "Recruiter",
            "email": "recruiter2@example.com",
            "phone": "1234567890",
            "password": "recruiterpass123",
            "confirm_password": "recruiterpass123"
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newrecruiter2").exists())


class LoginLastLoginTestCase(APITestCase):
    def setUp(self):
        from .models import Profile
        self.login_url = reverse("login")

        # Create standard HR user
        self.hr_user = User.objects.create_user(
            username="hrtest",
            email="hrtest@example.com",
            password="hrpassword123"
        )
        Profile.objects.create(user=self.hr_user, role="hr")

        # Create suspended HR user
        self.suspended_hr = User.objects.create_user(
            username="suspendedhr",
            email="suspended@example.com",
            password="suspendedpass123"
        )
        Profile.objects.create(user=self.suspended_hr, role="hr")
        self.suspended_hr.is_active = False
        self.suspended_hr.save()

        # Create Admin user
        self.admin_user = User.objects.create_superuser(
            username="admintest",
            email="admintest@example.com",
            password="adminpassword123"
        )

    def test_hr_login_updates_last_login(self):
        # 1. HR user starts with last_login = None
        self.assertIsNone(self.hr_user.last_login)

        # 2. HR logs in through the login endpoint
        payload = {
            "username": "hrtest",
            "password": "hrpassword123"
        }
        response = self.client.post(self.login_url, payload, format="json")

        # 3. response is successful
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 4. user is refreshed from database
        self.hr_user.refresh_from_db()

        # 5. last_login is now not null
        self.assertIsNotNone(self.hr_user.last_login)

    def test_admin_login_succeeds(self):
        # Admin login still succeeds
        payload = {
            "username": "admintest",
            "password": "adminpassword123"
        }
        response = self.client.post(self.login_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_user.refresh_from_db()
        self.assertIsNotNone(self.admin_user.last_login)

    def test_suspended_hr_login_is_blocked(self):
        # Suspended HR login remains blocked
        payload = {
            "username": "suspendedhr",
            "password": "suspendedpass123"
        }
        response = self.client.post(self.login_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.suspended_hr.refresh_from_db()
        self.assertIsNone(self.suspended_hr.last_login)

    def test_failed_login_does_not_update_last_login(self):
        # Failed login does not update last_login
        payload = {
            "username": "hrtest",
            "password": "wrongpassword"
        }
        response = self.client.post(self.login_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.hr_user.refresh_from_db()
        self.assertIsNone(self.hr_user.last_login)


class ScreenAISecurityTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile, UserSecurityState
        self.admin = User.objects.create_superuser(
            username="securityadmin",
            password="adminpassword123",
            email="admin@example.com"
        )
        self.recruiter = User.objects.create_user(
            username="securityrecruiter",
            password="recruiterpassword123",
            email="recruiter@example.com"
        )
        Profile.objects.create(user=self.recruiter, role="hr")

        # Get tokens
        login_url = reverse("login")
        res = self.client.post(login_url, {
            "username": "securityrecruiter",
            "password": "recruiterpassword123"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.access_token = res.data["access"]
        self.refresh_token = res.data["refresh"]

    def test_existing_users_have_security_state(self):
        from accounts.models import UserSecurityState
        # Check security state created defensively or via migration
        state = UserSecurityState.objects.get(user=self.recruiter)
        self.assertEqual(state.token_version, 0)
        self.assertFalse(state.must_change_password)

    def test_inactive_access_token_rejected_with_inactive_account(self):
        self.recruiter.is_active = False
        self.recruiter.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "inactive_account")
        self.assertEqual(response.data["detail"], "This account is suspended.")

    def test_inactive_refresh_token_refresh_rejected(self):
        self.recruiter.is_active = False
        self.recruiter.save()

        response = self.client.post(reverse("token-refresh"), {
            "refresh": self.refresh_token
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "inactive_account")

    def test_stale_access_token_rejected_with_session_revoked(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.token_version += 1
        state.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_revoked")
        self.assertEqual(response.data["detail"], "This session is no longer valid.")

    def test_stale_refresh_token_refresh_rejected_with_session_revoked(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.token_version += 1
        state.save()

        response = self.client.post(reverse("token-refresh"), {
            "refresh": self.refresh_token
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_revoked")

    def test_reactivation_does_not_revive_tokens(self):
        from accounts.models import UserSecurityState
        # Suspend increments version
        self.recruiter.is_active = False
        self.recruiter.save()
        state = self.recruiter.security_state
        state.token_version += 1
        state.save()

        # Reactivate
        self.recruiter.is_active = True
        self.recruiter.save()

        # Old token is still rejected because version is stale
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_revoked")

    def test_password_change_required_restricts_ordinary_endpoints(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "password_change_required")
        self.assertEqual(response.data["detail"], "You must change your temporary password.")

    def test_restricted_user_can_access_password_change_and_security_status(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        
        # Test security status endpoint
        response = self.client.get(reverse("security_status"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["must_change_password"])

        # Test invalid change password attempt is hit (proving we aren't blocked by auth middleware)
        response = self.client.post(reverse("change_password"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forced_password_change_validator_rules(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")

        # 1. Wrong current password
        response = self.client.post(reverse("change_password"), {
            "current_password": "wrongpassword",
            "new_password": "newpassword123!",
            "confirm_password": "newpassword123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)

        # 2. Confirmation mismatch
        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "newpassword123!",
            "confirm_password": "mismatchpassword!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("confirm_password", response.data)

        # 3. Reuse current password
        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "recruiterpassword123",
            "confirm_password": "recruiterpassword123"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)

        # 4. Weak password
        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "123",
            "confirm_password": "123"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)

    def test_successful_forced_password_change_flow(self):
        from accounts.models import UserSecurityState, AuditLog
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")

        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "SuperSecureNewPassword123!",
            "confirm_password": "SuperSecureNewPassword123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Confirm state updated
        state.refresh_from_db()
        self.assertFalse(state.must_change_password)
        self.assertIsNotNone(state.password_changed_at)
        self.assertEqual(state.token_version, 1) # incremented

        # Check audit log written
        audit = AuditLog.objects.filter(action="recruiter_forced_password_changed").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.recruiter)
        self.assertNotIn("password", audit.metadata)

        # Try using the old access token -> should be session_revoked
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_revoked")

    def test_audit_logs_read_only_via_api(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse("admin_activity_log")

        # GET is allowed
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # POST is rejected
        response = self.client.post(url, {"action": "fake"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # PUT/DELETE are rejected
        response = self.client.put(url, {"action": "fake"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_deleted_or_missing_user_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        # Delete user
        self.recruiter.delete()
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_revoked")

    def test_expired_restricted_access_token_can_refresh_once_and_complete_password_change(self):
        from accounts.models import UserSecurityState
        state = self.recruiter.security_state
        state.must_change_password = True
        state.save()

        # Simulate access token expired by calling token-refresh endpoint using the restricted refresh token
        response = self.client.post(reverse("token-refresh"), {
            "refresh": self.refresh_token
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_access_token = response.data["access"]

        # Use new access token to change password successfully
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access_token}")
        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "SuperSecureNewPassword123!",
            "confirm_password": "SuperSecureNewPassword123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify password changed successfully
        state.refresh_from_db()
        self.assertFalse(state.must_change_password)

    def test_failed_actions_create_no_audit_record(self):
        from accounts.models import AuditLog
        AuditLog.objects.all().delete()
        initial_count = AuditLog.objects.count()

        # Attempt password change with wrong password (validation failure)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.post(reverse("change_password"), {
            "current_password": "wrongpassword",
            "new_password": "SuperSecureNewPassword123!",
            "confirm_password": "SuperSecureNewPassword123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Confirm no audit log created
        self.assertEqual(AuditLog.objects.count(), initial_count)

    def test_audit_actions_occur_exactly_once(self):
        from accounts.models import AuditLog
        AuditLog.objects.all().delete()

        # Successful password change
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.post(reverse("change_password"), {
            "current_password": "recruiterpassword123",
            "new_password": "SuperSecureNewPassword123!",
            "confirm_password": "SuperSecureNewPassword123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify exactly 1 audit log created
        self.assertEqual(AuditLog.objects.filter(action="recruiter_forced_password_changed").count(), 1)

    def test_audit_logs_pagination_and_filters(self):
        from accounts.models import AuditLog
        
        # Clean existing log entries if any to have exact counts
        AuditLog.objects.all().delete()
        
        # Create different audit logs
        actor_hr = self.recruiter
        actor_admin = self.admin
        
        # Log 1
        AuditLog.objects.create(
            actor=actor_hr,
            action="job_created",
            target_type="Job",
            target_id="1",
            target_label="Developer Job",
            metadata={"recruiter_id": actor_hr.id, "info": "first job"},
            ip_address="127.0.0.1"
        )
        # Log 2
        AuditLog.objects.create(
            actor=actor_admin,
            action="recruiter_suspended",
            target_type="User",
            target_id=str(actor_hr.id),
            target_label=actor_hr.username,
            metadata={"recruiter_id": actor_hr.id},
            ip_address="192.168.1.1"
        )
        # Log 3
        AuditLog.objects.create(
            actor=actor_hr,
            action="application_submitted",
            target_type="Application",
            target_id="10",
            target_label="Jane Candidate",
            metadata={"recruiter_id": actor_hr.id},
            ip_address="127.0.0.1"
        )
        
        self.client.force_authenticate(user=self.admin)
        url = reverse("admin_activity_log")
        
        # 1. Test pagination (limit page_size = 2)
        response = self.client.get(url, {"page_size": 2})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        
        # 2. Filter by action
        response = self.client.get(url, {"action": "job_created"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action"], "job_created")
        
        # 3. Filter by actor (digit)
        response = self.client.get(url, {"actor": str(actor_hr.id)})
        self.assertEqual(response.data["count"], 2)
        
        # 4. Filter by actor (username iexact)
        response = self.client.get(url, {"actor": actor_admin.username.upper()})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["actor_username"], actor_admin.username)
        
        # 5. Filter by target_id & target_type
        response = self.client.get(url, {"target_id": "10", "target_type": "Application"})
        self.assertEqual(response.data["count"], 1)
        
        # 6. Filter by recruiter_id (actor, target, or metadata recruiter_id)
        response = self.client.get(url, {"recruiter_id": str(actor_hr.id)})
        self.assertEqual(response.data["count"], 3)
        
        # 7. Search filter
        response = self.client.get(url, {"search": "Jane"})
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["target_label"], "Jane Candidate")

        # 8. Date filters
        import datetime
        from django.utils import timezone
        now = timezone.now()
        yesterday = now - timezone.timedelta(days=1)
        tomorrow = now + timezone.timedelta(days=1)
        
        response = self.client.get(url, {"date_from": yesterday.date().isoformat()})
        self.assertEqual(response.data["count"], 3)
        
        response = self.client.get(url, {"date_to": tomorrow.date().isoformat()})
        self.assertEqual(response.data["count"], 3)
        
        # Test validation error on invalid date
        response = self.client.get(url, {"date_from": "invalid-date-format"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_from", response.data)


class ArchiveAuditLogsCommandTestCase(APITestCase):
    def setUp(self):
        # Clear existing logs
        AuditLog.objects.all().delete()
        
        # Create some logs with different creation dates
        self.log1 = AuditLog.objects.create(action="action1", target_type="User", target_id="1", target_label="label1")
        self.log2 = AuditLog.objects.create(action="action2", target_type="User", target_id="2", target_label="label2")
        
        # Manually backdate log1 using filter/update
        past_date = timezone.now() - datetime.timedelta(days=10)
        AuditLog.objects.filter(id=self.log1.id).update(created_at=past_date)
        self.log1.refresh_from_db()
        
        self.archive_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_archive.jsonl")

    def tearDown(self):
        if os.path.exists(self.archive_file):
            try:
                os.remove(self.archive_file)
            except OSError:
                pass

    def test_dry_run_default(self):
        # Running command without --execute should not write file or delete records
        out = StringIO()
        before_date = (timezone.now() - datetime.timedelta(days=5)).strftime("%Y-%m-%d")
        
        call_command(
            "archive_audit_logs",
            before=before_date,
            output=self.archive_file,
            stdout=out
        )
        
        output_str = out.getvalue()
        self.assertIn("[DRY RUN]", output_str)
        self.assertFalse(os.path.exists(self.archive_file))
        # Ensure log 1 and 2 are still in database
        self.assertEqual(AuditLog.objects.count(), 2)

    def test_invalid_date(self):
        with self.assertRaises(CommandError) as ctx:
            call_command(
                "archive_audit_logs",
                before="invalid-date",
                output=self.archive_file,
                execute=True
            )
        self.assertIn("Invalid date format", str(ctx.exception))

    def test_invalid_output_path(self):
        invalid_path = "/nonexistent_folder_abc_123/file.jsonl"
        before_date = timezone.now().strftime("%Y-%m-%d")
        with self.assertRaises(CommandError) as ctx:
            call_command(
                "archive_audit_logs",
                before=before_date,
                output=invalid_path,
                execute=True
            )
        self.assertIn("Output directory does not exist", str(ctx.exception))

    def test_successful_export_without_delete(self):
        out = StringIO()
        before_date = (timezone.now() - datetime.timedelta(days=5)).strftime("%Y-%m-%d")
        
        call_command(
            "archive_audit_logs",
            before=before_date,
            output=self.archive_file,
            execute=True,
            stdout=out
        )
        
        self.assertTrue(os.path.exists(self.archive_file))
        
        # Read the file
        with open(self.archive_file, "r") as f:
            lines = f.readlines()
        self.assertEqual(len(lines), 1)
        data = json.loads(lines[0])
        self.assertEqual(data["action"], "action1")
        self.assertEqual(data["target_id"], "1")
        
        # Database counts should not change (no deletion requested)
        self.assertEqual(AuditLog.objects.count(), 2)

    def test_explicit_deletion_bypasses_protection(self):
        # Deleting audit logs via the delete method raises PermissionError
        with self.assertRaises(PermissionError):
            self.log1.delete()
            
        out = StringIO()
        before_date = (timezone.now() - datetime.timedelta(days=5)).strftime("%Y-%m-%d")
        
        call_command(
            "archive_audit_logs",
            before=before_date,
            output=self.archive_file,
            execute=True,
            delete_after_export=True,
            stdout=out
        )
        
        # Ensure file exists and contains log1
        self.assertTrue(os.path.exists(self.archive_file))
        
        # log1 is deleted from the database
        self.assertFalse(AuditLog.objects.filter(id=self.log1.id).exists())
        # log2 remains
        self.assertTrue(AuditLog.objects.filter(id=self.log2.id).exists())
        self.assertEqual(AuditLog.objects.count(), 1)

    def test_overwrite_protection(self):
        # Create a dummy file first
        with open(self.archive_file, "w") as f:
            f.write("some existing content")
        
        before_date = timezone.now().strftime("%Y-%m-%d")
        
        # Running command should raise CommandError because overwrite=False by default
        with self.assertRaises(CommandError) as ctx:
            call_command(
                "archive_audit_logs",
                before=before_date,
                output=self.archive_file,
                execute=True
            )
        self.assertIn("Use --overwrite to overwrite", str(ctx.exception))
        
        # Running with overwrite=True should succeed
        out = StringIO()
        call_command(
            "archive_audit_logs",
            before=before_date,
            output=self.archive_file,
            execute=True,
            overwrite=True,
            stdout=out
        )
        self.assertTrue(os.path.exists(self.archive_file))
        
        # Ensure content was overwritten
        with open(self.archive_file, "r") as f:
            content = f.read()
        self.assertNotEqual(content, "some existing content")

    def test_delete_without_execute_remains_dry_run(self):
        out = StringIO()
        before_date = (timezone.now() - datetime.timedelta(days=5)).strftime("%Y-%m-%d")
        
        call_command(
            "archive_audit_logs",
            before=before_date,
            output=self.archive_file,
            delete_after_export=True,
            stdout=out
        )
        
        output_str = out.getvalue()
        self.assertIn("[DRY RUN]", output_str)
        self.assertIn("Would delete", output_str)
        self.assertFalse(os.path.exists(self.archive_file))
        self.assertEqual(AuditLog.objects.count(), 2)


class ProxyAwareIPHandlingTestCase(APITestCase):
    def setUp(self):
        # Create standard user
        self.user = User.objects.create_user(username="ipuser", password="ippassword123")

    @override_settings(TRUST_PROXY_HEADERS=False)
    def test_direct_client_ip(self):
        from accounts.utils import log_audit
        from django.test import RequestFactory
        factory = RequestFactory()
        request = factory.get("/api/profile/", REMOTE_ADDR="192.168.1.100")
        
        log = log_audit(action="test_action", actor=self.user, request=request)
        self.assertEqual(log.ip_address, "192.168.1.100")

    @override_settings(TRUST_PROXY_HEADERS=True)
    def test_trusted_forwarded_ip(self):
        from accounts.utils import log_audit
        from django.test import RequestFactory
        factory = RequestFactory()
        request = factory.get("/api/profile/", REMOTE_ADDR="192.168.1.100", HTTP_X_FORWARDED_FOR="203.0.113.195, 70.41.3.18, 150.172.238.178")
        
        log = log_audit(action="test_action", actor=self.user, request=request)
        # Should pick the first valid IP from X-Forwarded-For
        self.assertEqual(log.ip_address, "203.0.113.195")

    @override_settings(TRUST_PROXY_HEADERS=False)
    def test_untrusted_forwarded_header(self):
        from accounts.utils import log_audit
        from django.test import RequestFactory
        factory = RequestFactory()
        request = factory.get("/api/profile/", REMOTE_ADDR="192.168.1.100", HTTP_X_FORWARDED_FOR="203.0.113.195")
        
        log = log_audit(action="test_action", actor=self.user, request=request)
        # Should ignore X-Forwarded-For when TRUST_PROXY_HEADERS=False
        self.assertEqual(log.ip_address, "192.168.1.100")

    @override_settings(TRUST_PROXY_HEADERS=True)
    def test_malformed_forwarded_header(self):
        from accounts.utils import log_audit
        from django.test import RequestFactory
        factory = RequestFactory()
        # Header has malformed IP strings, should fall back to REMOTE_ADDR
        request = factory.get("/api/profile/", REMOTE_ADDR="192.168.1.100", HTTP_X_FORWARDED_FOR="malformed_ip, 203.0.113.195")
        
        log = log_audit(action="test_action", actor=self.user, request=request)
        self.assertEqual(log.ip_address, "203.0.113.195")
        
        # Test completely malformed header
        request2 = factory.get("/api/profile/", REMOTE_ADDR="192.168.1.100", HTTP_X_FORWARDED_FOR="not-an-ip")
        log2 = log_audit(action="test_action", actor=self.user, request=request2)
        self.assertEqual(log2.ip_address, "192.168.1.100")
