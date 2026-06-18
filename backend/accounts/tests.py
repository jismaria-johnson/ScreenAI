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
