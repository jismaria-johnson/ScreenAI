from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
