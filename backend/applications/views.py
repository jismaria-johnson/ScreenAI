from rest_framework import generics
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError

from .models import Application
from .serializers import ApplicationSerializer
from .permissions import IsCandidateUser, IsHRUser

from ai_engine.resume_parser import extract_text_from_pdf
from ai_engine.gemini_scorer import score_resume_with_gemini


class ApplyJobView(generics.CreateAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsCandidateUser]
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        job = serializer.validated_data.get("job")

        already_applied = Application.objects.filter(
            candidate=self.request.user,
            job=job
        ).exists()

        if already_applied:
            raise ValidationError("You have already applied for this job.")

        application = serializer.save(candidate=self.request.user)

        resume_path = application.resume.path

        extracted_text = extract_text_from_pdf(resume_path)
        application.extracted_resume_text = extracted_text

        if extracted_text:
            ai_result = score_resume_with_gemini(extracted_text, job)

            application.ai_score = ai_result["ai_score"]
            application.matched_skills = ai_result["matched_skills"]
            application.missing_skills = ai_result["missing_skills"]
            application.experience_match = ai_result["experience_match"]
            application.ai_feedback = ai_result["ai_feedback"]
            application.recommendation = ai_result["recommendation"]
        else:
            application.ai_score = 0
            application.experience_match = "Resume text could not be extracted."
            application.ai_feedback = "Could not read resume. Please review manually."
            application.recommendation = "review"

        application.save()


class MyApplicationsView(generics.ListAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsCandidateUser]

    def get_queryset(self):
        return Application.objects.filter(
            candidate=self.request.user
        ).order_by("-submitted_at")


class HRApplicationsView(generics.ListAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsHRUser]

    def get_queryset(self):
        return Application.objects.filter(
            job__hr_user=self.request.user
        ).order_by("-submitted_at")