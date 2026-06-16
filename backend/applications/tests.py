import json
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application
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

    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_public_application_submission_success(self, mock_scorer, mock_parser):
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

    @patch("ai_engine.resume_parser.extract_text_from_pdf")
    @patch("ai_engine.gemini_scorer.score_resume_with_gemini")
    def test_public_application_submission_gemini_failure(self, mock_scorer, mock_parser):
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

        # Check old application serialization details
        old_app_data = next(app for app in response.data if app["id"] == old_app.id)
        self.assertIsNone(old_app_data["skills_score"])
        self.assertIsNone(old_app_data["project_summary"])

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
