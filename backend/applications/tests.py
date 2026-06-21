import json
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application, CandidateIdentity, CandidateProgression, Interview
from jobs.models import Job
from ai_engine.gemini_scorer import score_resume_with_gemini, parse_and_clamp_score


class GeminiScorerTestCase(TestCase):
    def test_parse_and_clamp_score(self):
        # Test normal integers
        self.assertEqual(parse_and_clamp_score(15, 20), 15)
        # Test negative clamped to 0
        self.assertEqual(parse_and_clamp_score(-5, 20), 0)
        # Test values over maximum clamped to maximum
        self.assertEqual(parse_and_clamp_score(25, 20), 20)
        # Test floats rounded
        self.assertEqual(parse_and_clamp_score(15.6, 20), 16)
        # Test invalid values returning 0
        self.assertEqual(parse_and_clamp_score("invalid", 20), 0)
        self.assertEqual(parse_and_clamp_score(None, 20), 0)

    @patch("google.generativeai.GenerativeModel")
    def test_gemini_scorer_success(self, MockGenerativeModel):
        # Configure settings mock if necessary, we assume GEMINI_API_KEY is mocked or set in test env
        mock_model_instance = MockGenerativeModel.return_value
        
        # Mock successful JSON return
        mock_response = mock_model_instance.generate_content.return_value
        mock_response.text = """
        {
          "skills_score": 28,
          "skills_reason": "Excellent skills match",
          "experience_score": 22,
          "experience_reason": "Strong experience",
          "projects_score": 18,
          "projects_reason": "Great projects",
          "company_role_score": 9,
          "company_role_reason": "Good role relevance",
          "education_score": 4,
          "education_reason": "Relevant degree",
          "relevance_score": 9,
          "relevance_reason": "High job relevance",
          "matched_skills": "Python, Django",
          "missing_skills": "Docker",
          "total_experience_years": 4.5,
          "worked_companies": ["Company A", "Company B"],
          "experience_summary": "4.5 years of experience",
          "project_summary": "Built multiple web applications",
          "education_summary": "B.S. in Computer Science",
          "ai_feedback": "Highly recommended",
          "recommendation": "shortlist"
        }
        """

        # Create dummy job
        hr_user = User.objects.create_user(username="hr_user", password="password")
        job = Job.objects.create(
            hr_user=hr_user,
            job_title="Software Engineer",
            company_name="TestCorp",
            job_description="Django developer role",
            required_skills="Python, Django",
            required_experience="3-5 years"
        )

        with patch("django.conf.settings.GEMINI_API_KEY", "dummy_key"):
            result = score_resume_with_gemini("Resume text", job)

        # Check total ai_score calculation in Python
        self.assertEqual(result["ai_score"], 28 + 22 + 18 + 9 + 4 + 9) # 90
        self.assertEqual(result["skills_score"], 28)
        self.assertEqual(result["experience_score"], 22)
        self.assertEqual(result["projects_score"], 18)
        self.assertEqual(result["company_role_score"], 9)
        self.assertEqual(result["education_score"], 4)
        self.assertEqual(result["relevance_score"], 9)
        self.assertEqual(result["recommendation"], "shortlist")
        self.assertEqual(result["worked_companies"], "Company A, Company B")

    @patch("google.generativeai.GenerativeModel")
    def test_gemini_scorer_over_max_clamping(self, MockGenerativeModel):
        mock_model_instance = MockGenerativeModel.return_value
        mock_response = mock_model_instance.generate_content.return_value
        # Values exceed maximums: skills_score=35 (max 30), projects_score=25 (max 20)
        mock_response.text = """
        {
          "skills_score": 35,
          "skills_reason": "Superb",
          "experience_score": 25,
          "experience_reason": "Expert",
          "projects_score": 25,
          "projects_reason": "Many",
          "company_role_score": 10,
          "company_role_reason": "Direct",
          "education_score": 5,
          "education_reason": "PhD",
          "relevance_score": 10,
          "relevance_reason": "Matches",
          "matched_skills": "Python",
          "missing_skills": "",
          "total_experience_years": 10,
          "worked_companies": ["Big Tech"],
          "experience_summary": "10 years",
          "project_summary": "Large projects",
          "education_summary": "PhD CS",
          "ai_feedback": "Perfect candidate",
          "recommendation": "shortlist"
        }
        """

        hr_user = User.objects.create_user(username="hr_user", password="password")
        job = Job.objects.create(
            hr_user=hr_user,
            job_title="Architect",
            company_name="TestCorp",
            job_description="Architect role",
            required_skills="Python",
            required_experience="10 years"
        )

        with patch("django.conf.settings.GEMINI_API_KEY", "dummy_key"):
            result = score_resume_with_gemini("Resume text", job)

        # Clamped values should be:
        # skills_score: 35 -> 30
        # experience_score: 25 -> 25
        # projects_score: 25 -> 20
        # company_role_score: 10 -> 10
        # education_score: 5 -> 5
        # relevance_score: 10 -> 10
        # Sum = 30 + 25 + 20 + 10 + 5 + 10 = 100
        self.assertEqual(result["skills_score"], 30)
        self.assertEqual(result["projects_score"], 20)
        self.assertEqual(result["ai_score"], 100)

    @patch("google.generativeai.GenerativeModel")
    def test_gemini_scorer_failure_fallback(self, MockGenerativeModel):
        mock_model_instance = MockGenerativeModel.return_value
        # Mock invalid JSON causing JSONDecodeError
        mock_response = mock_model_instance.generate_content.return_value
        mock_response.text = "This is not JSON at all."

        hr_user = User.objects.create_user(username="hr_user", password="password")
        job = Job.objects.create(
            hr_user=hr_user,
            job_title="Developer",
            company_name="TestCorp",
            job_description="Dev role",
            required_skills="Python",
            required_experience="2 years"
        )

        with patch("django.conf.settings.GEMINI_API_KEY", "dummy_key"):
            result = score_resume_with_gemini("Resume text", job)

        # All scores must be None
        self.assertIsNone(result["ai_score"])
        self.assertIsNone(result["skills_score"])
        self.assertIsNone(result["experience_score"])
        self.assertEqual(result["recommendation"], "not_evaluated")
        self.assertIn("Please review this application manually", result["ai_feedback"])


class ApplicationEvaluationFlowTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        self.hr_user = User.objects.create_user(username="hr_user", password="password", email="hr@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Python Engineer",
            company_name="PythonCorp",
            job_description="Looking for Python developers",
            required_skills="Python, Django",
            required_experience="2 years",
            status="open",
            application_form_enabled=True
        )
        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )

    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_public_application_submission_success(self, mock_scorer, mock_parser, mock_pdf_open):
        # Set up mock for pdfplumber validation
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        # Set up mocks
        mock_parser.return_value = "Python Developer with 3 years of experience in Django."
        mock_scorer.return_value = {
            "ai_score": 85,
            "skills_score": 25,
            "experience_score": 20,
            "projects_score": 15,
            "company_role_score": 8,
            "education_score": 4,
            "relevance_score": 13, # Will be clamped to 10 by parse_and_clamp_score or in models if needed, but let's assume it was clamped
            "skills_reason": "Strong Python knowledge",
            "experience_score_reason": "Meets required range",
            "projects_score_reason": "Relevant web projects",
            "company_role_score_reason": "Good role fit",
            "education_score_reason": "Relevant B.S. degree",
            "relevance_score_reason": "Highly aligned",
            "project_summary": "Web projects summary",
            "education_summary": "B.S. in CS",
            "matched_skills": "Python, Django",
            "missing_skills": "",
            "experience_match": "Meets required range",
            "total_experience_years": 3.0,
            "worked_companies": "A Corp",
            "experience_summary": "Good track record",
            "ai_feedback": "Shortlist candidate",
            "recommendation": "shortlist"
        }

        url = f"/api/applications/public/{self.job.application_token}/"
        payload = {
            "candidate_name": "John Doe",
            "candidate_email": "john.doe@test.com",
            "candidate_phone": "1234567890",
            "candidate_education": "B.S. Computer Science",
            "resume": self.resume_file,
        }

        # Submit public application
        response = self.client.post(url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify that public response does NOT expose AI scores
        self.assertNotIn("ai_score", response.data)
        self.assertNotIn("skills_score", response.data)
        self.assertNotIn("ai_feedback", response.data)

        # Verify database save
        application = Application.objects.get(candidate_email="john.doe@test.com")
        self.assertEqual(application.ai_score, 85)
        self.assertEqual(application.skills_score, 25)
        self.assertEqual(application.experience_score, 20)
        self.assertEqual(application.project_summary, "Web projects summary")
        self.assertEqual(application.education_summary, "B.S. in CS")
        self.assertEqual(application.recommendation, "shortlist")

    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_public_application_submission_gemini_failure(self, mock_scorer, mock_parser, mock_pdf_open):
        # Set up mock for pdfplumber validation
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        # Set up mocks for Gemini failure
        mock_parser.return_value = "Python Developer."
        mock_scorer.return_value = {
            "ai_score": None,
            "skills_score": None,
            "experience_score": None,
            "projects_score": None,
            "company_role_score": None,
            "education_score": None,
            "relevance_score": None,
            "skills_reason": "Failed to evaluate.",
            "experience_score_reason": "Failed to evaluate.",
            "projects_score_reason": "Failed to evaluate.",
            "company_role_score_reason": "Failed to evaluate.",
            "education_score_reason": "Failed to evaluate.",
            "relevance_score_reason": "Failed to evaluate.",
            "project_summary": "Failed to evaluate.",
            "education_summary": "Failed to evaluate.",
            "matched_skills": "",
            "missing_skills": "",
            "experience_match": "AI evaluation was not completed.",
            "total_experience_years": None,
            "worked_companies": "",
            "experience_summary": "Failed to evaluate.",
            "ai_feedback": "Failed to evaluate.",
            "recommendation": "not_evaluated"
        }

        url = f"/api/applications/public/{self.job.application_token}/"
        payload = {
            "candidate_name": "Jane Smith",
            "candidate_email": "jane.smith@test.com",
            "candidate_phone": "0987654321",
            "candidate_education": "Self-taught",
            "resume": self.resume_file,
        }

        response = self.client.post(url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify database save contains None/not_evaluated
        application = Application.objects.get(candidate_email="jane.smith@test.com")
        self.assertIsNone(application.ai_score)
        self.assertIsNone(application.skills_score)
        self.assertEqual(application.skills_reason, "Failed to evaluate.")
        self.assertEqual(application.recommendation, "not_evaluated")

    def test_hr_sees_score_breakdown_and_compatibility(self):
        # Create an old application with null breakdown fields
        old_app = Application.objects.create(
            job=self.job,
            candidate_name="Old Candidate",
            candidate_email="old@test.com",
            candidate_phone="111",
            resume=self.resume_file,
            ai_score=75,  # Has final score
            recommendation="review"
            # Component scores are null
        )

        # Create a new application with full breakdown fields
        new_app = Application.objects.create(
            job=self.job,
            candidate_name="New Candidate",
            candidate_email="new@test.com",
            candidate_phone="222",
            resume=self.resume_file,
            ai_score=80,
            skills_score=24,
            experience_score=20,
            projects_score=15,
            company_role_score=8,
            education_score=5,
            relevance_score=8,
            skills_reason="Good skills",
            experience_score_reason="Good experience",
            projects_score_reason="Nice projects",
            company_role_score_reason="Fit",
            education_score_reason="Degree",
            relevance_score_reason="Aligned",
            project_summary="Project summary text",
            education_summary="Education summary text",
            recommendation="shortlist",
            total_experience_years=3.0,
            worked_companies="Company XYZ"
        )

        # Authenticate as HR User
        self.client.force_authenticate(user=self.hr_user)

        # Fetch applications
        response = self.client.get("/api/applications/hr/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify both applications load successfully
        self.assertEqual(len(response.data), 2)
        
        # Check new application serialization details
        new_app_data = next(app for app in response.data if app["id"] == new_app.id)
        self.assertEqual(new_app_data["skills_score"], 24)
        self.assertEqual(new_app_data["project_summary"], "Project summary text")
        self.assertEqual(new_app_data["education_summary"], "Education summary text")
        self.assertEqual(new_app_data["relevance_score"], 8)
        self.assertEqual(new_app_data["relevance_score_reason"], "Aligned")
        self.assertEqual(new_app_data["education_score"], 5)
        self.assertEqual(new_app_data["education_score_reason"], "Degree")
        self.assertEqual(new_app_data["skills_reason"], "Good skills")
        self.assertEqual(new_app_data["experience_score_reason"], "Good experience")
        self.assertEqual(new_app_data["projects_score_reason"], "Nice projects")
        self.assertEqual(new_app_data["company_role_score_reason"], "Fit")

        # Check old application serialization details
        old_app_data = next(app for app in response.data if app["id"] == old_app.id)
        self.assertIsNone(old_app_data["skills_score"])
        self.assertIsNone(old_app_data["project_summary"])
        self.assertIsNone(old_app_data["relevance_score"])
        self.assertIsNone(old_app_data["relevance_score_reason"])
        self.assertIsNone(old_app_data["education_score"])
        self.assertIsNone(old_app_data["education_score_reason"])
        self.assertIsNone(old_app_data["skills_reason"])
        self.assertIsNone(old_app_data["experience_score_reason"])
        self.assertIsNone(old_app_data["projects_score_reason"])
        self.assertIsNone(old_app_data["company_role_score_reason"])

    def test_serializer_score_visibility_restrictions(self):
        # Create an application with score details
        app = Application.objects.create(
            job=self.job,
            candidate_name="Private Candidate",
            candidate_email="private@test.com",
            resume=self.resume_file,
            ai_score=85,
            skills_score=25,
            experience_score=20,
            projects_score=15,
            company_role_score=10,
            education_score=5,
            relevance_score=10,
            skills_reason="skills reason",
            experience_score_reason="exp reason",
            projects_score_reason="proj reason",
            company_role_score_reason="role reason",
            education_score_reason="edu reason",
            relevance_score_reason="relevance reason",
            recommendation="shortlist"
        )
        
        # Test candidate application serializer
        from applications.serializers import CandidateApplicationSerializer, PublicApplicationCreateSerializer
        candidate_serializer = CandidateApplicationSerializer(app)
        for field in [
            "ai_score", "skills_score", "experience_score", "projects_score", 
            "company_role_score", "education_score", "relevance_score",
            "skills_reason", "experience_score_reason", "projects_score_reason",
            "company_role_score_reason", "education_score_reason", "relevance_score_reason",
            "recommendation", "ai_feedback"
        ]:
            self.assertNotIn(field, candidate_serializer.data)
            
        # Test public application serializer
        public_serializer = PublicApplicationCreateSerializer(app)
        for field in [
            "ai_score", "skills_score", "experience_score", "projects_score", 
            "company_role_score", "education_score", "relevance_score",
            "skills_reason", "experience_score_reason", "projects_score_reason",
            "company_role_score_reason", "education_score_reason", "relevance_score_reason",
            "recommendation", "ai_feedback"
        ]:
            self.assertNotIn(field, public_serializer.data)

    def test_hr_filters_still_work(self):
        # Create different applications
        app_low = Application.objects.create(
            job=self.job,
            candidate_name="Low Candidate",
            candidate_email="low@test.com",
            resume=self.resume_file,
            ai_score=40,
            total_experience_years=0.0,
            worked_companies="",
            recommendation="reject"
        )
        app_high = Application.objects.create(
            job=self.job,
            candidate_name="High Candidate",
            candidate_email="high@test.com",
            resume=self.resume_file,
            ai_score=90,
            total_experience_years=5.0,
            worked_companies="Google, Meta",
            recommendation="shortlist"
        )

        self.client.force_authenticate(user=self.hr_user)

        # Filter by min_score
        response = self.client.get("/api/applications/hr/", {"min_score": 60})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], app_high.id)

        # Filter by experience
        response = self.client.get("/api/applications/hr/", {"experience": "fresher"})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], app_low.id)

        # Filter by company
        response = self.client.get("/api/applications/hr/", {"company": "Google"})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], app_high.id)


class AdminPanelTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        
        # Admin User
        self.admin_user = User.objects.create_superuser(username="admin_user", password="password", email="admin@test.com")
        self.admin_profile = Profile.objects.create(user=self.admin_user, role="admin")

        # HR User
        self.hr_user = User.objects.create_user(username="hr_user", password="password", email="hr@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")

        # Other HR User
        self.other_hr_user = User.objects.create_user(username="other_hr_user", password="password", email="other@test.com")
        self.other_hr_profile = Profile.objects.create(user=self.other_hr_user, role="hr")

        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="DevOps Engineer",
            company_name="PythonCorp",
            job_description="Looking for DevOps engineers",
            required_skills="Docker",
            required_experience="1 year",
            status="open"
        )

        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )

        # Hired Candidate application
        self.hired_app = Application.objects.create(
            job=self.job,
            candidate_name="Hired Candidate",
            candidate_email="hired@test.com",
            resume=self.resume_file,
            application_status="hired"
        )

    def test_admin_hr_list_permissions(self):
        # Authenticated as HR -> Forbidden (403)
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get("/api/applications/admin/hrs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Authenticated as Admin -> OK (200)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/hrs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2) # both hr_user and other_hr_user should be returned

        # Check job count and hired count
        hr_data = next(hr for hr in response.data if hr["id"] == self.hr_user.id)
        self.assertEqual(hr_data["jobs_count"], 1)
        self.assertEqual(hr_data["hired_count"], 1)

    def test_admin_hired_candidates_permissions(self):
        # Authenticated as HR -> Forbidden (403)
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get("/api/applications/admin/hired-candidates/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Authenticated as Admin -> OK (200)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/hired-candidates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["candidate_name"], "Hired Candidate")

    def test_candidate_progression_creation(self):
        # Verify that handle_application_hired signal auto-created the initial "Hired" stage
        self.assertEqual(self.hired_app.progressions.count(), 1)
        self.assertEqual(self.hired_app.progressions.first().stage, "Hired")

        url = f"/api/applications/admin/{self.hired_app.id}/progression/"
        payload = {
            "stage": "Onboarding Completed",
            "notes": "Finished orientation training."
        }

        # 1. Anonymous user -> Unauthorized
        self.client.force_authenticate(user=None)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Other HR (not hiring manager) -> Forbidden
        self.client.force_authenticate(user=self.other_hr_user)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Hiring HR -> OK
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["progressions"]), 2)
        self.assertEqual(response.data["progressions"][1]["stage"], "Onboarding Completed")

        # 4. Admin user -> OK
        self.client.force_authenticate(user=self.admin_user)
        payload["stage"] = "Active Employee"
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["progressions"]), 3)

    def test_admin_toggle_hr_active_status(self):
        url = f"/api/applications/admin/hrs/{self.hr_user.id}/toggle/"

        # 1. Authenticated as HR -> Forbidden
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Authenticated as Admin -> OK (deactivates HR)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_active"])

        # Check in DB that is_active is false
        self.hr_user.refresh_from_db()
        self.assertFalse(self.hr_user.is_active)

        # 3. Toggle back to active
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_active"])
        self.hr_user.refresh_from_db()
        self.assertTrue(self.hr_user.is_active)

        # 4. Admin tries to deactivate superuser -> Bad Request
        superuser_toggle_url = f"/api/applications/admin/hrs/{self.admin_user.id}/toggle/"
        response = self.client.patch(superuser_toggle_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_system_activity_log(self):
        url = "/api/applications/admin/activity-log/"

        # 1. Authenticated as HR -> Forbidden
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Authenticated as Admin -> OK
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should have at least the job creation activity and application progression activity
        self.assertTrue(len(response.data["results"]) > 0)
        self.assertEqual(response.data["results"][0]["action"], "candidate_progression_created")

    def test_admin_progression_override(self):
        # Create a progression log
        prog = self.hired_app.progressions.first()
        url = f"/api/applications/admin/progression/{prog.id}/"
        payload = {
            "stage": "Corrected Onboarding Stage",
            "notes": "Admin updated orientation details."
        }

        # 1. Non-admin (HR) tries to edit -> Forbidden
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.patch(url, payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin edits -> OK
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify in database
        prog.refresh_from_db()
        self.assertEqual(prog.stage, "Corrected Onboarding Stage")
        self.assertEqual(prog.notes, "Admin updated orientation details.")
        self.assertEqual(prog.updated_by, self.admin_user)
        self.assertEqual(prog.updater_role, "admin")

        # 3. Non-admin (HR) tries to delete -> Forbidden
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Admin deletes -> OK
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify in database that progression log was deleted
        self.assertFalse(self.hired_app.progressions.filter(id=prog.id).exists())


class HRStatusTransitionTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        
        # HR User
        self.hr_user = User.objects.create_user(username="hr_transition_user", password="password", email="hr_transition@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")

        # Other HR User
        self.other_hr_user = User.objects.create_user(username="other_transition_user", password="password", email="other_transition@test.com")
        self.other_hr_profile = Profile.objects.create(user=self.other_hr_user, role="hr")

        # Admin User
        self.admin_user = User.objects.create_superuser(username="admin_transition_user", password="password", email="admin_transition@test.com")
        self.admin_profile = Profile.objects.create(user=self.admin_user, role="admin")

        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Software Engineer",
            company_name="TestCorp",
            job_description="Dev role",
            required_skills="Python",
            required_experience="2 years",
            status="open"
        )

        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )

        # Pending application
        self.app = Application.objects.create(
            job=self.job,
            candidate_name="John Candidate",
            candidate_email="john@candidate.com",
            resume=self.resume_file,
            application_status="pending"
        )

    def test_pending_can_be_shortlisted(self):
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/{self.app.id}/status/"
        response = self.client.patch(url, {"application_status": "shortlisted"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.app.refresh_from_db()
        self.assertEqual(self.app.application_status, "shortlisted")

    def test_shortlisted_can_be_hired(self):
        self.app.application_status = "shortlisted"
        self.app.save()
        
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/{self.app.id}/status/"
        response = self.client.patch(url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.app.refresh_from_db()
        self.assertEqual(self.app.application_status, "hired")
        self.assertEqual(self.app.progressions.count(), 1)
        self.assertEqual(self.app.progressions.first().stage, "Hired")

    def test_hired_cannot_be_shortlisted_rejected_or_pending(self):
        self.app.application_status = "hired"
        self.app.save()

        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/{self.app.id}/status/"
        
        # Cannot shortlist
        response = self.client.patch(url, {"application_status": "shortlisted"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("A hired application cannot be moved back", response.data["detail"])

        # Cannot reject
        response = self.client.patch(url, {"application_status": "rejected"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("A hired application cannot be moved back", response.data["detail"])

        # Cannot mark pending
        response = self.client.patch(url, {"application_status": "pending"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("A hired application cannot be moved back", response.data["detail"])

    def test_repeated_hire_requests_do_not_create_duplicate_progression(self):
        self.app.application_status = "hired"
        self.app.save()
        
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/{self.app.id}/status/"
        
        # Try to hire again -> should fail with ValidationError
        response = self.client.patch(url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Application is already hired.")
        
        # Verify only one Hired progression exists
        self.assertEqual(self.app.progressions.filter(stage="Hired").count(), 1)

    def test_hiring_hr_can_add_progression_but_other_hr_cannot(self):
        # Mark application as hired
        self.app.application_status = "hired"
        self.app.save()

        url = f"/api/applications/admin/{self.app.id}/progression/"
        payload = {"stage": "Offer Extended", "notes": "Details of the offer"}

        # Other HR tries to update -> Forbidden
        self.client.force_authenticate(user=self.other_hr_user)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Hiring HR tries to update -> OK
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.app.progressions.count(), 2) # "Hired" and "Offer Extended"


class PublicApplicationValidationAndThrottlingTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        self.hr_user = User.objects.create_user(username="hr_user_val", password="password", email="hr_val@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Backend Developer",
            company_name="ScreenCorp",
            job_description="Django expert",
            required_skills="Python",
            required_experience="2 years",
            status="open",
            application_form_enabled=True
        )
        self.url = f"/api/applications/public/{self.job.application_token}/"

    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_valid_pdf_under_5mb_accepted(self, mock_scorer, mock_parser, mock_pdf_open):
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        mock_parser.return_value = "Valid resume content."
        mock_scorer.return_value = {
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
        valid_pdf = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")
        payload = {
            "candidate_name": "Alice Green",
            "candidate_email": "alice@test.com",
            "candidate_phone": "1112223333",
            "resume": valid_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Application.objects.filter(candidate_email="alice@test.com").exists())

    def test_file_above_5mb_rejected(self):
        large_content = b"%PDF-1.4\n" + b"x" * (5 * 1024 * 1024 + 100) + b"\n%%EOF"
        large_pdf = SimpleUploadedFile("resume.pdf", large_content, content_type="application/pdf")
        payload = {
            "candidate_name": "Big File",
            "candidate_email": "big@test.com",
            "candidate_phone": "1112223333",
            "resume": large_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Resume size must not exceed 5 MB.", str(response.data["resume"]))
        self.assertFalse(Application.objects.filter(candidate_email="big@test.com").exists())

    def test_non_pdf_renamed_with_pdf_rejected(self):
        fake_pdf = SimpleUploadedFile("resume.pdf", b"This is just normal text, not pdf", content_type="application/pdf")
        payload = {
            "candidate_name": "Fake PDF",
            "candidate_email": "fake@test.com",
            "candidate_phone": "1112223333",
            "resume": fake_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("The uploaded file is not a valid PDF.", str(response.data["resume"]))

    def test_invalid_pdf_signature_rejected(self):
        invalid_pdf = SimpleUploadedFile("resume.pdf", b"NOT_A_PDF_SIGNATURE", content_type="application/pdf")
        payload = {
            "candidate_name": "Invalid Sign",
            "candidate_email": "invalid@test.com",
            "candidate_phone": "1112223333",
            "resume": invalid_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("The uploaded file is not a valid PDF.", str(response.data["resume"]))

    def test_corrupt_pdf_rejected(self):
        corrupt_pdf = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\ncorrupt content without pdf structure", content_type="application/pdf")
        payload = {
            "candidate_name": "Corrupt Candidate",
            "candidate_email": "corrupt@test.com",
            "candidate_phone": "1112223333",
            "resume": corrupt_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("The uploaded PDF file is corrupt or invalid.", str(response.data["resume"]))
        self.assertFalse(Application.objects.filter(candidate_email="corrupt@test.com").exists())

    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_image_only_or_textless_valid_pdf_fallback(self, mock_scorer, mock_parser, mock_pdf_open):
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        mock_parser.return_value = ""
        valid_pdf = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")
        payload = {
            "candidate_name": "Textless Candidate",
            "candidate_email": "textless@test.com",
            "candidate_phone": "1112223333",
            "resume": valid_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        app = Application.objects.get(candidate_email="textless@test.com")
        self.assertEqual(app.recommendation, "not_evaluated")
        self.assertIsNone(app.ai_score)
        mock_scorer.assert_not_called()
        
        # Verify the application remains visible to the owning HR and the resume is retained for manual review
        self.client.force_authenticate(user=self.hr_user)
        hr_response = self.client.get("/api/applications/hr/")
        self.assertEqual(hr_response.status_code, status.HTTP_200_OK)
        # Ensure our new application is visible to HR
        hr_app_list = [a for a in hr_response.data if a["candidate_email_db"] == "textless@test.com"]
        self.assertEqual(len(hr_app_list), 1)
        self.assertEqual(hr_app_list[0]["recommendation"], "not_evaluated")
        self.assertTrue("resume" in hr_app_list[0]["resume"] and hr_app_list[0]["resume"].endswith(".pdf"))
        # Verify actual file contents in storage can be retrieved
        self.assertTrue(app.resume.name.endswith(".pdf"))
        self.assertTrue(app.resume.size > 0)


    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_public_submission_throttle_applied(self, mock_scorer, mock_parser, mock_pdf_open):
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        mock_parser.return_value = "Throttle resume content."
        mock_scorer.return_value = {
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

        from rest_framework.throttling import ScopedRateThrottle
        from django.test import override_settings
        from django.core.cache import cache

        orig_rate = ScopedRateThrottle.THROTTLE_RATES.get("public_application_submit")
        ScopedRateThrottle.THROTTLE_RATES["public_application_submit"] = "2/minute"
        
        valid_pdf = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/pdf")
        payload = {
            "candidate_name": "Throttle Candidate",
            "candidate_email": "throttle@test.com",
            "candidate_phone": "1112223333",
            "resume": valid_pdf
        }
        
        try:
            with override_settings(
                CACHES={
                    "default": {
                        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                    }
                }
            ):
                cache.clear()

                response = self.client.post(self.url, payload, format="multipart")
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                
                valid_pdf.seek(0)
                payload["candidate_email"] = "throttle2@test.com"
                response = self.client.post(self.url, payload, format="multipart")
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                
                valid_pdf.seek(0)
                payload["candidate_email"] = "throttle3@test.com"
                response = self.client.post(self.url, payload, format="multipart")
                self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        finally:
            if orig_rate is not None:
                ScopedRateThrottle.THROTTLE_RATES["public_application_submit"] = orig_rate
            else:
                ScopedRateThrottle.THROTTLE_RATES.pop("public_application_submit", None)

    def test_unrelated_endpoints_not_affected_by_throttle(self):
        self.client.force_authenticate(user=self.hr_user)
        for _ in range(5):
            response = self.client.get("/api/jobs/")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("pdfplumber.open")
    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_valid_pdf_with_octet_stream_mime_accepted(self, mock_scorer, mock_parser, mock_pdf_open):
        from unittest.mock import MagicMock
        mock_pdf = MagicMock()
        mock_pdf.pages = [MagicMock()]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf

        mock_parser.return_value = "Valid resume with generic mime type."
        mock_scorer.return_value = {
            "ai_score": 70,
            "skills_score": 20,
            "experience_score": 15,
            "projects_score": 15,
            "company_role_score": 10,
            "education_score": 5,
            "relevance_score": 5,
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
            "recommendation": "review"
        }
        valid_pdf = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy pdf content\n%%EOF", content_type="application/octet-stream")
        payload = {
            "candidate_name": "Octet Stream Candidate",
            "candidate_email": "octet@test.com",
            "candidate_phone": "1112223333",
            "resume": valid_pdf
        }
        response = self.client.post(self.url, payload, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Application.objects.filter(candidate_email="octet@test.com").exists())



class PlacementTransactionTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        self.hr_user = User.objects.create_user(username="hr_trans", password="password", email="hr_trans@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Python Dev",
            company_name="ScreenCorp",
            job_description="Django role",
            required_skills="Python",
            required_experience="2 years",
            status="open"
        )
        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )
        self.app = Application.objects.create(
            job=self.job,
            candidate_name="Trans Candidate",
            candidate_email="trans@test.com",
            resume=self.resume_file,
            application_status="shortlisted"
        )
        self.url = f"/api/applications/{self.app.id}/status/"

    def test_successful_hire_creates_state_and_one_initial_progression(self):
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.patch(self.url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.application_status, "hired")
        self.assertEqual(self.app.progressions.count(), 1)
        self.assertEqual(self.app.progressions.first().stage, "Hired")

    @patch("applications.models.CandidateProgression.objects.create")
    def test_connected_write_failure_rolls_back_hired_status(self, mock_create):
        mock_create.side_effect = Exception("Simulated database write error")
        
        self.client.force_authenticate(user=self.hr_user)
        self.client.raise_request_exception = False
        response = self.client.patch(self.url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        self.app.refresh_from_db()
        self.assertEqual(self.app.application_status, "shortlisted")
        self.assertEqual(self.app.progressions.count(), 0)

    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_hiring_does_not_invoke_gemini_or_pdf_work(self, mock_scorer, mock_parser):
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.patch(self.url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify that changing status to hired does NOT call any AI engine or PDF extraction methods
        mock_scorer.assert_not_called()
        mock_parser.assert_not_called()


from applications.models import Interview

class InterviewTestCaseBase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        
        # Recruiter 1
        self.hr_user = User.objects.create_user(username="hr_i1", password="password", email="hri1@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")
        
        # Recruiter 2
        self.other_hr = User.objects.create_user(username="hr_i2", password="password", email="hri2@test.com")
        self.other_hr_profile = Profile.objects.create(user=self.other_hr, role="hr")
        
        # Admin
        self.admin_user = User.objects.create_superuser(username="admin_i", password="password", email="admini@test.com")
        self.admin_profile = Profile.objects.create(user=self.admin_user, role="admin")

        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Dev",
            company_name="Corp",
            job_description="Dev role",
            status="open"
        )
        self.resume_file = SimpleUploadedFile("resume.pdf", b"%PDF-1.4\n%dummy\n%%EOF", content_type="application/pdf")
        
        self.app = Application.objects.create(
            job=self.job,
            candidate_name="John Doe",
            candidate_email="john@test.com",
            resume=self.resume_file,
            application_status="shortlisted"
        )
        self.url = f"/api/applications/{self.app.id}/interviews/"


class InterviewModelAndSerializerTestCase(InterviewTestCaseBase):
    def test_valid_interview_creation(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "duration_minutes": 45,
            "location_or_meeting_link": "http://zoom.us/link",
            "interviewer_name": "Alice Interviewer",
            "interviewer_email": "alice@test.com"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Interview.objects.count(), 1)
        self.assertEqual(Interview.objects.first().status, "scheduled")

    def test_ratings_outside_1_to_5_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        interview = Interview.objects.create(
            application=self.app,
            round_name="Technical Round 1",
            round_number=1,
            interview_type="video",
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            duration_minutes=45,
            location_or_meeting_link="http://zoom.us/link",
            created_by=self.hr_user
        )
        url = f"/api/applications/interviews/{interview.id}/"
        
        payload = {
            "status": "completed",
            "technical_rating": 6,
            "communication_rating": 5,
            "problem_solving_rating": 5,
            "culture_fit_rating": 5,
            "overall_rating": 5,
            "feedback": "Perfect",
            "recommendation": "hire"
        }
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        payload["technical_rating"] = 0
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_zero_or_negative_round_number_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 0,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_duration_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "duration_minutes": 0,
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scheduled_time_in_past_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() - timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completed_interview_requires_ratings_feedback_recommendation(self):
        self.client.force_authenticate(user=self.hr_user)
        interview = Interview.objects.create(
            application=self.app,
            round_name="Technical Round 1",
            round_number=1,
            interview_type="video",
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            location_or_meeting_link="http://zoom.us/link",
            created_by=self.hr_user
        )
        url = f"/api/applications/interviews/{interview.id}/"
        
        payload = {"status": "completed", "feedback": "Good", "recommendation": "hire"}
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_video_interview_requires_meeting_link(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": ""
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_in_person_interview_requires_location(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Technical Round 1",
            "round_number": 1,
            "interview_type": "in_person",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "   "
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_active_round_rejected(self):
        self.client.force_authenticate(user=self.hr_user)
        Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            status="scheduled",
            created_by=self.hr_user
        )
        
        payload = {
            "round_name": "Tech 1 Duplicate",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class InterviewPermissionsTestCase(InterviewTestCaseBase):
    def test_owning_hr_can_list_and_create(self):
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payload = {
            "round_name": "HR Round",
            "round_number": 2,
            "interview_type": "phone",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "phone details"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_another_hr_cannot_list_retrieve_or_modify(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            created_by=self.hr_user
        )
        
        self.client.force_authenticate(user=self.other_hr)
        
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        url_detail = f"/api/applications/interviews/{interview.id}/"
        response = self.client.get(url_detail)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        response = self.client.patch(url_detail, {"round_name": "Stolen Round"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_view_all(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.admin_user)
        
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        url_detail = f"/api/applications/interviews/{interview.id}/"
        response = self.client.get(url_detail)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.get("/api/applications/admin/interviews/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unauthenticated_user_cannot_access(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class InterviewWorkflowTestCase(InterviewTestCaseBase):
    def test_pending_candidate_cannot_receive_interview(self):
        self.app.application_status = "pending"
        self.app.save()
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Tech 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_shortlisted_candidate_can_receive_interview(self):
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Tech 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_rejected_candidate_cannot_receive_interview(self):
        self.app.application_status = "rejected"
        self.app.save()
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Tech 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hired_candidate_cannot_receive_interview(self):
        self.app.application_status = "hired"
        self.app.save()
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Tech 1",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_interview_can_be_rescheduled(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        new_time = timezone.now() + timezone.timedelta(days=2)
        response = self.client.patch(url, {"scheduled_at": new_time}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        interview.refresh_from_db()
        self.assertEqual(interview.scheduled_at, new_time)

    def test_interview_can_be_cancelled(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        response = self.client.patch(url, {"status": "cancelled"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        interview.refresh_from_db()
        self.assertEqual(interview.status, "cancelled")

    def test_interview_can_be_marked_no_show(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        response = self.client.patch(url, {"status": "no_show"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        interview.refresh_from_db()
        self.assertEqual(interview.status, "no_show")

    def test_completed_interview_stores_ratings_and_completion_time(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        payload = {
            "status": "completed",
            "technical_rating": 4,
            "communication_rating": 4,
            "problem_solving_rating": 5,
            "culture_fit_rating": 5,
            "overall_rating": 4,
            "feedback": "Outstanding skills.",
            "recommendation": "hire"
        }
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        interview.refresh_from_db()
        self.assertEqual(interview.status, "completed")
        self.assertIsNotNone(interview.completed_at)

    def test_cancelled_interview_cannot_be_completed_directly(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            status="cancelled",
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        payload = {
            "status": "completed",
            "technical_rating": 4,
            "communication_rating": 4,
            "problem_solving_rating": 5,
            "culture_fit_rating": 5,
            "overall_rating": 4,
            "feedback": "Outstanding",
            "recommendation": "hire"
        }
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completed_interview_cannot_be_rescheduled(self):
        interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            status="completed",
            technical_rating=4,
            communication_rating=4,
            problem_solving_rating=5,
            culture_fit_rating=5,
            overall_rating=4,
            feedback="Yes",
            recommendation="hire",
            created_by=self.hr_user
        )
        self.client.force_authenticate(user=self.hr_user)
        url = f"/api/applications/interviews/{interview.id}/"
        response = self.client.patch(url, {"scheduled_at": timezone.now() + timezone.timedelta(days=2)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_interview_history_survives_candidate_hiring(self):
        Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            status="completed",
            technical_rating=4,
            communication_rating=4,
            problem_solving_rating=5,
            culture_fit_rating=5,
            overall_rating=4,
            feedback="Yes",
            recommendation="hire",
            created_by=self.hr_user
        )
        
        self.client.force_authenticate(user=self.hr_user)
        status_url = f"/api/applications/{self.app.id}/status/"
        response = self.client.patch(status_url, {"application_status": "hired"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.app.interviews.count(), 1)


class InterviewAuditTestCase(InterviewTestCaseBase):
    def test_audit_logs_construction(self):
        # 1. Schedule an interview using the HR API endpoint
        self.client.force_authenticate(user=self.hr_user)
        payload = {
            "round_name": "Round Audit",
            "round_number": 1,
            "interview_type": "video",
            "scheduled_at": timezone.now() + timezone.timedelta(days=1),
            "location_or_meeting_link": "http://zoom.us/link"
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        interview_id = res.data["id"]
        
        # Authenticate as admin to query the activity log
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/activity-log/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.data["results"]
        scheduled_logs = [x for x in results if x["action"] == "interview_scheduled"]
        self.assertTrue(len(scheduled_logs) > 0)
        self.assertEqual(scheduled_logs[0]["target_id"], str(interview_id))
        
        # 2. Reschedule the interview using the HR API endpoint
        self.client.force_authenticate(user=self.hr_user)
        reschedule_url = f"/api/applications/interviews/{interview_id}/"
        new_time = timezone.now() + timezone.timedelta(days=2)
        res = self.client.patch(reschedule_url, {"scheduled_at": new_time}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Authenticate as admin to query the activity log
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/activity-log/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.data["results"]
        rescheduled_logs = [x for x in results if x["action"] == "interview_rescheduled"]
        self.assertTrue(len(rescheduled_logs) > 0)
        self.assertEqual(rescheduled_logs[0]["target_id"], str(interview_id))


class Phase2Stage1To3TestCase(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        self.hr_user = User.objects.create_user(username="hr_test_p2", password="password", email="hr@test.com")
        self.candidate_user = User.objects.create_user(username="cand_test_p2", password="password", email="cand@test.com")
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Dev",
            company_name="Corp",
            job_description="Description",
            required_skills="Python",
            required_experience="1 year",
            status="open"
        )
        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )

    def test_date_range_validation(self):
        from applications.utils import parse_and_validate_date_range
        from rest_framework.exceptions import ValidationError
        
        # Test valid
        date_from, date_to = parse_and_validate_date_range("2026-06-01", "2026-06-10")
        self.assertIsNotNone(date_from)
        self.assertIsNotNone(date_to)
        self.assertTrue(date_from < date_to)

        # Test reversed
        with self.assertRaises(ValidationError):
            parse_and_validate_date_range("2026-06-10", "2026-06-01")

        # Test invalid string
        with self.assertRaises(ValidationError):
            parse_and_validate_date_range("invalid-date", "2026-06-01")

    def test_candidate_identity_registered_constraint(self):
        from applications.models import CandidateIdentity
        from django.db import IntegrityError
        
        # registered identity without user should raise IntegrityError
        with self.assertRaises(IntegrityError):
            CandidateIdentity.objects.create(
                identity_type="registered",
                candidate_user=None
            )

    def test_candidate_identity_public_constraint(self):
        from applications.models import CandidateIdentity
        from django.db import IntegrityError

        # public identity without email should raise IntegrityError
        with self.assertRaises(IntegrityError):
            CandidateIdentity.objects.create(
                identity_type="public",
                normalized_email=None,
                public_email_key=None
            )

    def test_candidate_identity_anonymous_constraint(self):
        from applications.models import CandidateIdentity
        from django.db import IntegrityError

        # anonymous identity with user or email key should raise IntegrityError
        with self.assertRaises(IntegrityError):
            CandidateIdentity.objects.create(
                identity_type="anonymous",
                candidate_user=self.candidate_user
            )

    def test_candidate_identity_protect_user_deletion(self):
        from applications.models import CandidateIdentity
        from django.db.models import ProtectedError

        identity = CandidateIdentity.objects.create(
            identity_type="registered",
            candidate_user=self.candidate_user
        )

        # Deleting the user should be protected and raise ProtectedError
        with self.assertRaises(ProtectedError):
            self.candidate_user.delete()

    def test_identity_assignment_service(self):
        from applications.services import get_or_create_candidate_identity
        
        # Test registered application
        app_reg = Application.objects.create(
            job=self.job,
            candidate=self.candidate_user,
            resume=self.resume_file
        )
        ident_reg = get_or_create_candidate_identity(app_reg)
        self.assertEqual(ident_reg.identity_type, "registered")
        self.assertEqual(ident_reg.candidate_user, self.candidate_user)

        # Test public valid email
        app_pub = Application.objects.create(
            job=self.job,
            candidate_name="Public Cand",
            candidate_email="Pub@test.com",
            resume=self.resume_file
        )
        ident_pub = get_or_create_candidate_identity(app_pub)
        self.assertEqual(ident_pub.identity_type, "public")
        self.assertEqual(ident_pub.public_email_key, "pub@test.com")

        # Test public valid email case-insensitivity/spacing grouping
        app_pub_dup = Application.objects.create(
            job=self.job,
            candidate_name="Public Cand Dup",
            candidate_email=" PUB@test.com ",
            resume=self.resume_file
        )
        ident_pub_dup = get_or_create_candidate_identity(app_pub_dup)
        self.assertEqual(ident_pub.pk, ident_pub_dup.pk)

        # Test anonymous missing email
        app_anon = Application.objects.create(
            job=self.job,
            candidate_name="Anon Cand",
            candidate_email="",
            resume=self.resume_file
        )
        ident_anon = get_or_create_candidate_identity(app_anon)
        self.assertEqual(ident_anon.identity_type, "anonymous")
        self.assertIsNone(ident_anon.public_email_key)


class AdminApplicationDirectoryTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        # Admin User
        self.admin_user = User.objects.create_superuser(username="admin_p2", password="password", email="admin@test.com")
        self.admin_profile = Profile.objects.create(user=self.admin_user, role="admin")

        # Recruiter Users
        self.hr_user = User.objects.create_user(username="hr_p2", password="password", email="hr@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")
        
        self.other_hr = User.objects.create_user(username="other_hr_p2", password="password", email="other_hr@test.com")
        self.other_hr_profile = Profile.objects.create(user=self.other_hr, role="hr")

        # Candidate User
        self.candidate_user = User.objects.create_user(username="cand_p2", password="password", email="cand@test.com")
        self.candidate_profile = Profile.objects.create(user=self.candidate_user, role="candidate")

        # Jobs (one active, one archived status-wise, though is_archived field is phase 2 stage 8, let's just make jobs)
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Software Architect",
            company_name="CorpCorp",
            job_description="Architect description",
            required_skills="Python",
            required_experience="5 years",
            status="open"
        )
        self.job_closed = Job.objects.create(
            hr_user=self.other_hr,
            job_title="Frontend Developer",
            company_name="WebCorp",
            job_description="Frontend dev description",
            required_skills="React",
            required_experience="2 years",
            status="closed"
        )

        self.resume_file = SimpleUploadedFile(
            "resume.pdf",
            b"%PDF-1.4\n%dummy pdf content\n%%EOF",
            content_type="application/pdf"
        )

        # Create Identities & Applications
        from applications.services import get_or_create_candidate_identity
        
        # 1. Registered candidate app
        self.app_reg = Application.objects.create(
            job=self.job,
            candidate=self.candidate_user,
            ai_score=85,
            recommendation="shortlist",
            application_status="shortlisted"
        )
        self.app_reg.candidate_identity = get_or_create_candidate_identity(self.app_reg)
        self.app_reg.save()

        # 2. Public candidate app with email
        self.app_pub = Application.objects.create(
            job=self.job,
            candidate_name="Public candidate",
            candidate_email="public_cand@test.com",
            candidate_phone="+9999",
            candidate_education="B.S. CS",
            ai_score=60,
            recommendation="review",
            application_status="pending"
        )
        self.app_pub.candidate_identity = get_or_create_candidate_identity(self.app_pub)
        self.app_pub.save()

        # 3. Anonymous candidate app (no email/phone)
        self.app_anon = Application.objects.create(
            job=self.job_closed,
            candidate_name="Anonymous candidate",
            candidate_email="",
            ai_score=95,
            recommendation="shortlist",
            application_status="hired"
        )
        self.app_anon.candidate_identity = get_or_create_candidate_identity(self.app_anon)
        self.app_anon.save()

        # Add some Interviews
        self.interview1 = Interview.objects.create(
            application=self.app_reg,
            round_name="Tech 1",
            round_number=1,
            status="completed",
            scheduled_at=timezone.now() - timezone.timedelta(days=2),
            created_by=self.hr_user
        )
        self.interview2 = Interview.objects.create(
            application=self.app_reg,
            round_name="Tech 2",
            round_number=2,
            status="scheduled",
            scheduled_at=timezone.now() + timezone.timedelta(days=1),
            created_by=self.hr_user
        )

        # Add some Progressions
        self.progression1 = CandidateProgression.objects.create(
            application=self.app_anon,
            stage="Hired",
            notes="Hired Stage",
            updated_by=self.admin_user,
            updater_role="admin"
        )
        self.progression2 = CandidateProgression.objects.create(
            application=self.app_anon,
            stage="Onboarding",
            notes="Onboarding Stage",
            updated_by=self.admin_user,
            updater_role="admin"
        )

    def test_permissions(self):
        url = "/api/applications/admin/directory/"
        
        # 1. Anonymous user denied (401 or 403)
        self.client.force_authenticate(user=None)
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Candidate user denied (403)
        self.client.force_authenticate(user=self.candidate_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Active recruiter user denied (403)
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Suspended recruiter (user.is_active = False) denied (403 or 401)
        self.hr_user.is_active = False
        self.hr_user.save()
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
        self.hr_user.is_active = True
        self.hr_user.save()

        # 5. Superuser allowed (200)
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_response_shape_and_sensitive_exclusion(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/directory/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.data["results"]
        self.assertEqual(len(results), 3)

        # Validate that sensitive identity fields are NOT exposed
        for item in results:
            self.assertNotIn("public_email_key", item)
            self.assertNotIn("normalized_email", item)
            # Ensure candidate_uuid is a valid UUID string
            self.assertIsNotNone(item["candidate_uuid"])
            # Ensure resume_url is not present until streaming endpoints are added
            self.assertNotIn("resume_url", item)

        # Verify specific fields in registered candidate app serialization
        app_reg_data = next(x for x in results if x["id"] == self.app_reg.id)
        self.assertEqual(app_reg_data["identity_type"], "registered")
        self.assertEqual(app_reg_data["candidate_contact"]["email"], self.candidate_user.email)
        self.assertEqual(app_reg_data["job"]["title"], self.job.job_title)
        self.assertEqual(app_reg_data["recruiter"]["username"], self.hr_user.username)
        self.assertEqual(app_reg_data["interview_count"], 2)
        # Latest interview status by scheduled_at desc, id desc (Tech 2 is scheduled)
        self.assertEqual(app_reg_data["latest_interview_status"], "scheduled")

        # Verify specific fields in public candidate app serialization
        app_pub_data = next(x for x in results if x["id"] == self.app_pub.id)
        self.assertEqual(app_pub_data["identity_type"], "public")
        self.assertEqual(app_pub_data["candidate_contact"]["name"], "Public candidate")
        self.assertEqual(app_pub_data["candidate_contact"]["phone"], "+9999")
        self.assertEqual(app_pub_data["interview_count"], 0)
        self.assertIsNone(app_pub_data["latest_interview_status"])

        # Verify specific fields in anonymous candidate app serialization
        app_anon_data = next(x for x in results if x["id"] == self.app_anon.id)
        self.assertEqual(app_anon_data["identity_type"], "anonymous")
        self.assertEqual(app_anon_data["latest_progression_stage"], "Onboarding")

    def test_transitional_null_identity_safety(self):
        # Temporarily nullify the identity relation
        self.app_reg.candidate_identity = None
        self.app_reg.save()

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/directory/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data["results"]
        app_reg_data = next(x for x in results if x["id"] == self.app_reg.id)
        self.assertIsNone(app_reg_data["candidate_uuid"])
        self.assertEqual(app_reg_data["identity_type"], "registered")

        # Restore identity
        from applications.services import get_or_create_candidate_identity
        self.app_reg.candidate_identity = get_or_create_candidate_identity(self.app_reg)
        self.app_reg.save()

    def test_individual_filters(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # 1. search
        res = self.client.get("/api/applications/admin/directory/", {"search": "Architect"})
        self.assertEqual(res.data["count"], 2) # app_reg & app_pub both belong to Software Architect job

        res = self.client.get("/api/applications/admin/directory/", {"search": "public_cand@test.com"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.app_pub.id)

        # 2. recruiter_id
        res = self.client.get("/api/applications/admin/directory/", {"recruiter_id": self.hr_user.id})
        self.assertEqual(res.data["count"], 2)

        # 3. job_id
        res = self.client.get("/api/applications/admin/directory/", {"job_id": self.job_closed.id})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.app_anon.id)

        # 4. status
        res = self.client.get("/api/applications/admin/directory/", {"status": "hired"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.app_anon.id)

        # 5. min_score / max_score
        res = self.client.get("/api/applications/admin/directory/", {"min_score": 80})
        self.assertEqual(res.data["count"], 2) # app_reg (85) and app_anon (95)

        res = self.client.get("/api/applications/admin/directory/", {"max_score": 70})
        self.assertEqual(res.data["count"], 1) # app_pub (60)

        # 6. is_registered
        res = self.client.get("/api/applications/admin/directory/", {"is_registered": "true"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.app_reg.id)

        res = self.client.get("/api/applications/admin/directory/", {"is_registered": "false"})
        self.assertEqual(res.data["count"], 2)

        # 7. date_from / date_to boundaries (inclusive)
        today = timezone.now().date().isoformat()
        res = self.client.get("/api/applications/admin/directory/", {"date_from": today, "date_to": today})
        self.assertEqual(res.data["count"], 3)

    def test_combined_filters(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "status": "shortlisted",
            "min_score": 80,
            "is_registered": "true"
        }
        res = self.client.get("/api/applications/admin/directory/", payload)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["id"], self.app_reg.id)

    def test_invalid_filters_bad_request(self):
        self.client.force_authenticate(user=self.admin_user)

        # 1. Invalid recruiter_id
        res = self.client.get("/api/applications/admin/directory/", {"recruiter_id": "abc"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Invalid status
        res = self.client.get("/api/applications/admin/directory/", {"status": "unknown"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Invalid score
        res = self.client.get("/api/applications/admin/directory/", {"min_score": "abc"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/directory/", {"min_score": 110})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/directory/", {"min_score": 80, "max_score": 60})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Invalid is_registered
        res = self.client.get("/api/applications/admin/directory/", {"is_registered": "yes"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Invalid date
        res = self.client.get("/api/applications/admin/directory/", {"date_from": "2026/06/01"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/directory/", {"date_from": "2026-06-10", "date_to": "2026-06-01"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ordering_and_tie_breaker(self):
        self.client.force_authenticate(user=self.admin_user)

        # Allow only: submitted_at, ai_score, candidate_name, job_title, status
        # Test ai_score ascending
        res = self.client.get("/api/applications/admin/directory/", {"ordering": "ai_score"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        scores = [x["ai_score"] for x in res.data["results"]]
        self.assertEqual(scores, [60, 85, 95])

        # Test ai_score descending
        res = self.client.get("/api/applications/admin/directory/", {"ordering": "-ai_score"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        scores = [x["ai_score"] for x in res.data["results"]]
        self.assertEqual(scores, [95, 85, 60])

        # Test invalid ordering parameter
        res = self.client.get("/api/applications/admin/directory/", {"ordering": "invalid_field"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_limits(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # Test custom page size
        res = self.client.get("/api/applications/admin/directory/", {"page_size": 2})
        self.assertEqual(len(res.data["results"]), 2)
        self.assertIsNotNone(res.data["next"])

        # Test maximum page size enforcement (max 100)
        res = self.client.get("/api/applications/admin/directory/", {"page_size": 150})
        # Even though we requested 150, the pagination max limit should restrict the page size
        # We only have 3 items in total, let's verify standard metadata fields are in response
        self.assertEqual(res.data["count"], 3)
        self.assertIsNone(res.data["next"])

    def test_stable_query_count_and_n_plus_one_protection(self):
        self.client.force_authenticate(user=self.admin_user)
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # Capture queries with page_size=1
        with CaptureQueriesContext(connection) as ctx1:
            self.client.get("/api/applications/admin/directory/", {"page_size": 1})
        count1 = len(ctx1.captured_queries)

        # Capture queries with page_size=3
        with CaptureQueriesContext(connection) as ctx2:
            self.client.get("/api/applications/admin/directory/", {"page_size": 3})
        count2 = len(ctx2.captured_queries)

        # Both query counts must be identical, verifying N+1 query protection
        self.assertEqual(count1, count2, f"SQL Query counts differ: {count1} vs {count2}")

    def test_existing_endpoints_compatibility(self):
        # 1. Authenticate as HR to recruiter application endpoint
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get("/api/applications/hr/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 2. Authenticate as Admin to recruiter summary endpoint
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/hrs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class AdminCandidateDirectoryTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        from applications.services import get_or_create_candidate_identity
        
        # 1. Users & Profiles
        self.admin_user = User.objects.create_superuser(username="admin_cands", password="password", email="admin_cands@test.com")
        self.admin_profile = Profile.objects.create(user=self.admin_user, role="admin")

        self.hr_user = User.objects.create_user(username="hr_cands", password="password", email="hr_cands@test.com")
        self.hr_profile = Profile.objects.create(user=self.hr_user, role="hr")

        self.other_hr = User.objects.create_user(username="other_hr_cands", password="password", email="other_hr_cands@test.com")
        self.other_hr_profile = Profile.objects.create(user=self.other_hr, role="hr")

        # 2. Jobs
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Backend Engineer",
            company_name="Company X",
            status="open"
        )
        self.job_closed = Job.objects.create(
            hr_user=self.other_hr,
            job_title="Frontend Engineer",
            company_name="Company Y",
            status="closed"
        )

        # 3. Candidates (Registered with same email, separate users)
        self.cand_reg1 = User.objects.create_user(
            username="cand_reg1", first_name="John", last_name="Doe", email="same@email.com", password="password"
        )
        Profile.objects.create(user=self.cand_reg1, role="candidate")

        self.cand_reg2 = User.objects.create_user(
            username="cand_reg2", first_name="", last_name="", email="same@email.com", password="password"
        )
        Profile.objects.create(user=self.cand_reg2, role="candidate")

        # Create applications & identities
        # Registered candidate 1 applications
        self.app_reg1_1 = Application.objects.create(
            job=self.job,
            candidate=self.cand_reg1,
            ai_score=85,
            recommendation="shortlist",
            application_status="shortlisted"
        )
        self.app_reg1_1.candidate_identity = get_or_create_candidate_identity(self.app_reg1_1)
        self.app_reg1_1.save()

        # Add an Interview for app_reg1_1
        self.interview1 = Interview.objects.create(
            application=self.app_reg1_1,
            round_name="Tech Round",
            round_number=1,
            status="scheduled",
            scheduled_at=timezone.now() - timezone.timedelta(days=1),
            created_by=self.hr_user
        )

        self.app_reg1_2 = Application.objects.create(
            job=self.job_closed,
            candidate=self.cand_reg1,
            ai_score=95,
            recommendation="shortlist",
            application_status="hired"
        )
        self.app_reg1_2.candidate_identity = get_or_create_candidate_identity(self.app_reg1_2)
        self.app_reg1_2.save()

        # Add a CandidateProgression
        self.prog1 = CandidateProgression.objects.create(
            application=self.app_reg1_2,
            stage="Onboarding",
            notes="Onboarding now",
            updated_by=self.admin_user,
            updater_role="admin"
        )

        # Registered candidate 2 application (first/last names are empty, fallback to username)
        self.app_reg2 = Application.objects.create(
            job=self.job,
            candidate=self.cand_reg2,
            ai_score=70,
            recommendation="review",
            application_status="pending"
        )
        self.app_reg2.candidate_identity = get_or_create_candidate_identity(self.app_reg2)
        self.app_reg2.save()

        # Public candidate applications (same email -> grouped into single identity)
        self.app_pub1 = Application.objects.create(
            job=self.job,
            candidate_name="Jane Doe",
            candidate_email="public_doe@test.com",
            candidate_phone="+12345",
            ai_score=60,
            recommendation="review",
            application_status="pending"
        )
        self.app_pub1.candidate_identity = get_or_create_candidate_identity(self.app_pub1)
        self.app_pub1.save()

        self.app_pub2 = Application.objects.create(
            job=self.job_closed,
            candidate_name="Jane Doe Second",
            candidate_email="public_doe@test.com",
            candidate_phone="+54321",
            ai_score=75,
            recommendation="shortlist",
            application_status="pending"
        )
        self.app_pub2.candidate_identity = get_or_create_candidate_identity(self.app_pub2)
        self.app_pub2.save()

        # Anonymous candidate applications (should remain separate!)
        self.app_anon1 = Application.objects.create(
            job=self.job,
            candidate_name="Anon One",
            candidate_email="",
            ai_score=None,
            recommendation="not_evaluated",
            application_status="pending"
        )
        self.app_anon1.candidate_identity = get_or_create_candidate_identity(self.app_anon1)
        self.app_anon1.save()

        self.app_anon2 = Application.objects.create(
            job=self.job,
            candidate_name="Anon Two",
            candidate_email="",
            ai_score=80,
            recommendation="review",
            application_status="pending"
        )
        self.app_anon2.candidate_identity = get_or_create_candidate_identity(self.app_anon2)
        self.app_anon2.save()

        # Orphan identity (no applications)
        self.orphan_identity = CandidateIdentity.objects.create(
            identity_type="public",
            normalized_email="orphan@test.com",
            public_email_key="orphan@test.com"
        )

        # Application with null candidate_identity
        self.app_null_identity = Application.objects.create(
            job=self.job,
            candidate_name="Null Identity Cand",
            candidate_email="null@test.com",
            candidate_identity=None,
            application_status="pending"
        )

    def test_permissions(self):
        url = "/api/applications/admin/candidates/"

        # 1. Anonymous user denied
        self.client.force_authenticate(user=None)
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Candidate user denied
        self.client.force_authenticate(user=self.cand_reg1)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Active recruiter denied
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Unrelated/hiring recruiter denied
        self.client.force_authenticate(user=self.other_hr)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Suspended recruiter denied
        self.hr_user.is_active = False
        self.hr_user.save()
        self.client.force_authenticate(user=self.hr_user)
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
        self.hr_user.is_active = True
        self.hr_user.save()

        # 6. Admin allowed
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_identity_grouping_and_exclusions(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/candidates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Expect exactly 5 rows (cand_reg1, cand_reg2, public_doe, anon1, anon2)
        # Excludes orphan and null-identity application
        results = response.data["results"]
        self.assertEqual(len(results), 5)

        # Verify orphan is NOT present
        self.assertFalse(any(x["candidate_uuid"] == str(self.orphan_identity.uuid) for x in results))

        # Verify same-email registered users remain separate
        reg1_uuid = str(self.app_reg1_1.candidate_identity.uuid)
        reg2_uuid = str(self.app_reg2.candidate_identity.uuid)
        self.assertNotEqual(reg1_uuid, reg2_uuid)
        self.assertTrue(any(x["candidate_uuid"] == reg1_uuid for x in results))
        self.assertTrue(any(x["candidate_uuid"] == reg2_uuid for x in results))

        # Verify duplicate public email grouped
        pub_uuid = str(self.app_pub1.candidate_identity.uuid)
        self.assertTrue(any(x["candidate_uuid"] == pub_uuid for x in results))
        pub_cand_item = next(x for x in results if x["candidate_uuid"] == pub_uuid)
        self.assertEqual(pub_cand_item["total_applications"], 2)

        # Verify anonymous submissions separate
        anon1_uuid = str(self.app_anon1.candidate_identity.uuid)
        anon2_uuid = str(self.app_anon2.candidate_identity.uuid)
        self.assertNotEqual(anon1_uuid, anon2_uuid)
        self.assertTrue(any(x["candidate_uuid"] == anon1_uuid for x in results))
        self.assertTrue(any(x["candidate_uuid"] == anon2_uuid for x in results))

    def test_security_exclusions(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/candidates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data["results"]
        for cand in results:
            self.assertNotIn("normalized_email", cand)
            self.assertNotIn("public_email_key", cand)
            self.assertNotIn("candidate_user", cand)
            self.assertNotIn("candidate_user_id", cand)
            self.assertNotIn("resume", cand)
            self.assertNotIn("extracted_resume_text", cand)
            self.assertNotIn("ai_explanation", cand)

    def test_contact_selection_and_latest_tie_breaker(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/candidates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]

        # 1. Registered John Doe
        reg1_uuid = str(self.app_reg1_1.candidate_identity.uuid)
        reg1_data = next(x for x in results if x["candidate_uuid"] == reg1_uuid)
        self.assertEqual(reg1_data["candidate_contact"]["name"], "John Doe")
        self.assertEqual(reg1_data["candidate_contact"]["email"], "same@email.com")

        # 2. Registered Username Fallback
        reg2_uuid = str(self.app_reg2.candidate_identity.uuid)
        reg2_data = next(x for x in results if x["candidate_uuid"] == reg2_uuid)
        self.assertEqual(reg2_data["candidate_contact"]["name"], "cand_reg2")

        # 3. Public contact details from latest application (app_pub2 is latest: phone is +54321, name Jane Doe Second)
        pub_uuid = str(self.app_pub1.candidate_identity.uuid)
        pub_data = next(x for x in results if x["candidate_uuid"] == pub_uuid)
        self.assertEqual(pub_data["candidate_contact"]["name"], "Jane Doe Second")
        self.assertEqual(pub_data["candidate_contact"]["phone"], "+54321")

    def test_complete_history_aggregates(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/applications/admin/candidates/")
        results = response.data["results"]

        # reg1: 2 apps, highest score 95, latest score 95, 1 interview, hired_state True, onboarding stage
        reg1_uuid = str(self.app_reg1_1.candidate_identity.uuid)
        reg1_data = next(x for x in results if x["candidate_uuid"] == reg1_uuid)
        self.assertEqual(reg1_data["total_applications"], 2)
        self.assertEqual(reg1_data["highest_score"], 95)
        self.assertEqual(reg1_data["latest_score"], 95)
        self.assertEqual(reg1_data["interview_count"], 1)
        self.assertTrue(reg1_data["hired_state"])
        self.assertEqual(reg1_data["latest_progression_stage"], "Onboarding")
        self.assertEqual(len(reg1_data["jobs"]), 2)
        self.assertEqual(len(reg1_data["recruiters"]), 2)

        # anon1: 1 app, score None
        anon1_uuid = str(self.app_anon1.candidate_identity.uuid)
        anon1_data = next(x for x in results if x["candidate_uuid"] == anon1_uuid)
        self.assertIsNone(anon1_data["highest_score"])
        self.assertIsNone(anon1_data["latest_score"])

    def test_explicit_filters_and_validations(self):
        self.client.force_authenticate(user=self.admin_user)

        # 1. identity_type validation
        res = self.client.get("/api/applications/admin/candidates/", {"identity_type": "invalid"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"identity_type": "registered"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)

        # 2. recruiter_id validation
        res = self.client.get("/api/applications/admin/candidates/", {"recruiter_id": "abc"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"recruiter_id": "-1"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"recruiter_id": self.hr_user.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should return candidates having apps matching hr_user (cand_reg1, cand_reg2, public_doe, anon1, anon2 all have apps on self.job posted by hr_user)
        self.assertEqual(res.data["count"], 5)

        # 3. job_id validation
        res = self.client.get("/api/applications/admin/candidates/", {"job_id": "0"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. status validation
        res = self.client.get("/api/applications/admin/candidates/", {"status": "unknown"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. score validation
        res = self.client.get("/api/applications/admin/candidates/", {"min_score": 150})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"min_score": 90, "max_score": 80})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6. date validation
        res = self.client.get("/api/applications/admin/candidates/", {"date_from": "2026/06/01"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"date_from": "2026-06-15", "date_to": "2026-06-10"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 7. hired_state validation
        res = self.client.get("/api/applications/admin/candidates/", {"hired_state": "yes"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.get("/api/applications/admin/candidates/", {"hired_state": "true"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)  # Only cand_reg1 has a hired app

        res = self.client.get("/api/applications/admin/candidates/", {"hired_state": "false"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 4)  # Exclusion of hired identities works

    def test_same_application_combined_filters(self):
        self.client.force_authenticate(user=self.admin_user)

        # Let's search for a candidate who has at least one application satisfying recruiter=other_hr & status=hired & min_score=90
        # self.cand_reg1 has an application app_reg1_2: job=job_closed (other_hr), status=hired, ai_score=95
        payload = {
            "recruiter_id": self.other_hr.id,
            "status": "hired",
            "min_score": 90
        }
        res = self.client.get("/api/applications/admin/candidates/", payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["candidate_uuid"], str(self.app_reg1_1.candidate_identity.uuid))

        # If we change min_score to 98, it should return 0 since score is 95
        payload["min_score"] = 98
        res = self.client.get("/api/applications/admin/candidates/", payload)
        self.assertEqual(res.data["count"], 0)

        # Contradictory filters: hired_state=false & status=hired
        res = self.client.get("/api/applications/admin/candidates/", {"hired_state": "false", "status": "hired"})
        self.assertEqual(res.data["count"], 0)

    def test_search_branches_and_union_semantics(self):
        self.client.force_authenticate(user=self.admin_user)

        # 1. Registered Profile Search: username "cand_reg1". Matches user fields.
        # Qualified independently, matching_application_count should reflect remaining filters (which is 2 total apps)
        res = self.client.get("/api/applications/admin/candidates/", {"search": "cand_reg1"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["matching_application_count"], 2)

        # 2. Application-field Search: "Doe".
        # Matches: John Doe (user field) and Jane Doe (app field).
        res = self.client.get("/api/applications/admin/candidates/", {"search": "Doe"})
        self.assertEqual(res.data["count"], 2) # Both John Doe and Jane Doe

        # 3. Application field search with other filters: "Jane Doe" (matches Jane Doe's app fields)
        # combine with status=pending (Jane Doe has two pending apps, matching count = 2)
        res = self.client.get("/api/applications/admin/candidates/", {"search": "Jane Doe", "status": "pending"})
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["matching_application_count"], 2)

    def test_ordering_and_tie_breakers(self):
        self.client.force_authenticate(user=self.admin_user)

        # 1. candidate_name ascending
        res = self.client.get("/api/applications/admin/candidates/", {"ordering": "candidate_name"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = [x["candidate_contact"]["name"] for x in res.data["results"]]
        # expected order (case-insensitive sorted sort name):
        # "Anon One", "Anon Two", "cand_reg2", "Jane Doe Second", "John Doe"
        self.assertEqual(names, ["Anon One", "Anon Two", "cand_reg2", "Jane Doe Second", "John Doe"])

        # 2. highest_score descending (nulls last)
        # scores: 95 (reg1), 80 (anon2), 75 (pub), 70 (reg2), None (anon1)
        res = self.client.get("/api/applications/admin/candidates/", {"ordering": "-highest_score"})
        scores = [x["highest_score"] for x in res.data["results"]]
        self.assertEqual(scores[:4], [95, 80, 75, 70])
        self.assertIsNone(scores[4])

        # 3. highest_score ascending (nulls last)
        # scores order: 70, 75, 80, 95, None
        res = self.client.get("/api/applications/admin/candidates/", {"ordering": "highest_score"})
        scores = [x["highest_score"] for x in res.data["results"]]
        self.assertEqual(scores[:4], [70, 75, 80, 95])
        self.assertIsNone(scores[4])

        # 4. Reject invalid orderings
        res = self.client.get("/api/applications/admin/candidates/", {"ordering": "invalid"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Reject multiple orderings
        res = self.client.get("/api/applications/admin/candidates/", {"ordering": "highest_score,candidate_name"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_performance_stable_query_count_and_budget(self):
        self.client.force_authenticate(user=self.admin_user)
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # Capture queries with page_size=2
        with CaptureQueriesContext(connection) as ctx1:
            self.client.get("/api/applications/admin/candidates/", {"page_size": 2})
        count1 = len(ctx1.captured_queries)

        # Capture queries with page_size=5
        with CaptureQueriesContext(connection) as ctx2:
            self.client.get("/api/applications/admin/candidates/", {"page_size": 5})
        count2 = len(ctx2.captured_queries)

        # Stable query count verifying N+1 query protection
        self.assertEqual(count1, count2, f"SQL Query counts differ: {count1} vs {count2}")

        # Assert query budget is small and stable (e.g. <= 12 queries)
        self.assertLessEqual(count1, 12, f"Query count is too high: {count1}")


class AdminCandidateDetailWorkspaceTestCase(APITestCase):
    def setUp(self):
        from accounts.models import Profile
        from applications.services import get_or_create_candidate_identity
        
        # 1. Users & Profiles
        self.admin_user = User.objects.create_superuser(username="admin_det", password="password", email="admin_det@test.com")
        Profile.objects.create(user=self.admin_user, role="admin")

        self.hr_user = User.objects.create_user(username="hr_det", password="password", email="hr_det@test.com")
        Profile.objects.create(user=self.hr_user, role="hr")

        self.other_hr = User.objects.create_user(username="other_hr_det", password="password", email="other_hr_det@test.com")
        Profile.objects.create(user=self.other_hr, role="hr")

        # 2. Jobs
        self.job = Job.objects.create(
            hr_user=self.hr_user,
            job_title="Developer",
            company_name="Acme",
            location="Remote",
            required_experience="3+ years",
            status="open"
        )

        # 3. Candidate
        self.cand_user = User.objects.create_user(
            username="cand_det", first_name="Jane", last_name="Doe", email="jane@example.com", password="password"
        )
        Profile.objects.create(user=self.cand_user, role="candidate", education="MTech CSE")

        # 4. Applications
        self.app = Application.objects.create(
            job=self.job,
            candidate=self.cand_user,
            ai_score=85,
            recommendation="shortlist",
            application_status="shortlisted",
            total_experience_years=5.7,
            worked_companies="Company A, Company B",
            skills_score=25,
            experience_score=20,
            projects_score=15,
            company_role_score=8,
            education_score=4,
            relevance_score=8,
            skills_reason="Good",
            experience_score_reason="Many years",
            project_summary="React apps",
            education_summary="MTech",
            matched_skills="React, Node",
            missing_skills="Docker",
            ai_feedback="Highly recommended"
        )
        self.app.candidate_identity = get_or_create_candidate_identity(self.app)
        self.app.save()

        # Add Interviews
        self.interview = Interview.objects.create(
            application=self.app,
            round_name="Tech 1",
            round_number=1,
            interview_type="technical",
            scheduled_at=timezone.now(),
            created_by=self.hr_user,
            status="scheduled"
        )

        # Add progression
        self.progression = CandidateProgression.objects.create(
            application=self.app,
            stage="First Stage",
            notes="Note here",
            updated_by=self.admin_user,
            updater_role="admin"
        )

        # Let's create an orphan identity to test 404
        self.orphan = CandidateIdentity.objects.create(
            identity_type="public",
            normalized_email="orphan_det@test.com",
            public_email_key="orphan_det@test.com"
        )

    def test_permissions(self):
        candidate_uuid = self.app.candidate_identity.uuid
        detail_url = f"/api/applications/admin/candidates/{candidate_uuid}/"
        apps_url = f"/api/applications/admin/candidates/{candidate_uuid}/applications/"
        act_url = f"/api/applications/admin/candidates/{candidate_uuid}/activity/"
        workspace_url = f"/api/applications/admin/directory/{self.app.id}/"
        interviews_url = f"/api/applications/admin/directory/{self.app.id}/interviews/"
        progressions_url = f"/api/applications/admin/directory/{self.app.id}/progressions/"

        for url in [detail_url, apps_url, act_url, workspace_url, interviews_url, progressions_url]:
            # 1. Anonymous user denied
            self.client.force_authenticate(user=None)
            res = self.client.get(url)
            self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

            # 2. Candidate denied
            self.client.force_authenticate(user=self.cand_user)
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

            # 3. Recruiter denied
            self.client.force_authenticate(user=self.hr_user)
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

            # 4. Admin allowed
            self.client.force_authenticate(user=self.admin_user)
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_candidate_summary_details(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # Success path
        url = f"/api/applications/admin/candidates/{self.app.candidate_identity.uuid}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["candidate_uuid"], str(self.app.candidate_identity.uuid))
        self.assertEqual(res.data["identity_type"], "registered")
        self.assertEqual(res.data["candidate_contact"]["name"], "Jane Doe")
        self.assertEqual(res.data["candidate_contact"]["education"], "MTech CSE")
        self.assertEqual(res.data["total_applications"], 1)

        # Unknown UUID returns 404
        bad_url = "/api/applications/admin/candidates/00000000-0000-0000-0000-000000000000/"
        res = self.client.get(bad_url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Orphan UUID returns 404
        res = self.client.get(f"/api/applications/admin/candidates/{self.orphan.uuid}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_candidate_applications_details(self):
        self.client.force_authenticate(user=self.admin_user)
        
        url = f"/api/applications/admin/candidates/{self.app.candidate_identity.uuid}/applications/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], self.app.id)

    def test_application_workspace_detail(self):
        self.client.force_authenticate(user=self.admin_user)
        
        url = f"/api/applications/admin/directory/{self.app.id}/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data["id"], self.app.id)
        self.assertEqual(data["candidate_contact"]["education"], "MTech CSE")
        self.assertEqual(data["candidate_contact"]["total_experience_years"], 5.7)
        self.assertEqual(data["job"]["title"], "Developer")
        self.assertEqual(data["ai_evaluation"]["overall_score"], 85)
        self.assertEqual(data["ai_evaluation"]["components"]["skills"]["score"], 25)
        self.assertEqual(data["ai_evaluation"]["matched_skills"], ["React", "Node"])
        self.assertEqual(data["counts"]["interviews"], 1)
        self.assertEqual(data["counts"]["progressions"], 1)

        # 404 for missing application
        res = self.client.get("/api/applications/admin/directory/99999/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_application_subresources(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # Interviews subresource
        url = f"/api/applications/admin/directory/{self.app.id}/interviews/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["round_name"], "Tech 1")

        # Progressions subresource
        url = f"/api/applications/admin/directory/{self.app.id}/progressions/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["stage"], "First Stage")

    def test_activity_subresource_and_filtering(self):
        self.client.force_authenticate(user=self.admin_user)

        # Retrieve candidate activity
        url = f"/api/applications/admin/candidates/{self.app.candidate_identity.uuid}/activity/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]
        
        # Verify that activity entries returned do not contain sensitive data and target correct app
        for log in results:
            self.assertNotIn("ip_address", log)
            self.assertNotIn("user_agent", log)
            self.assertIn("safe_metadata", log)

    def test_performance_query_stability_and_budget(self):
        self.client.force_authenticate(user=self.admin_user)
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # Query budget check for Application detail
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(f"/api/applications/admin/directory/{self.app.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Expected bounded count: should run minimal queries (e.g. <= 4 queries)
        self.assertLessEqual(len(ctx.captured_queries), 4)



