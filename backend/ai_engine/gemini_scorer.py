import json
import google.generativeai as genai
from django.conf import settings


def score_resume_with_gemini(resume_text, job):
    genai.configure(api_key=settings.GEMINI_API_KEY)

    model = genai.GenerativeModel("gemini-2.5-flash-lite")

    prompt = f"""
You are an AI resume screening assistant.

Compare the candidate resume with the job requirements.

Job Title:
{job.job_title}

Company:
{job.company_name}

Job Description:
{job.job_description}

Required Skills:
{job.required_skills}

Required Experience:
{job.required_experience}

Candidate Resume:
{resume_text}

Return ONLY valid JSON in this exact format:

{{
  "ai_score": 0,
  "matched_skills": "skill1, skill2",
  "missing_skills": "skill3, skill4",
  "experience_match": "short explanation",
  "ai_feedback": "short HR-friendly feedback",
  "recommendation": "shortlist"
}}

Rules:
- ai_score must be an integer from 0 to 100.
- recommendation must be one of: shortlist, review, reject.
- Do not include markdown.
- Do not include ```json.
"""

    try:
        response = model.generate_content(prompt)
        result_text = response.text.strip()

        result_text = result_text.replace("```json", "").replace("```", "").strip()

        result = json.loads(result_text)

        return {
            "ai_score": int(result.get("ai_score", 0)),
            "matched_skills": result.get("matched_skills", ""),
            "missing_skills": result.get("missing_skills", ""),
            "experience_match": result.get("experience_match", ""),
            "ai_feedback": result.get("ai_feedback", ""),
            "recommendation": result.get("recommendation", "review"),
        }

    except Exception as e:
        print("Gemini scoring error:", e)

        return {
            "ai_score": 0,
            "matched_skills": "",
            "missing_skills": "",
            "experience_match": "Could not evaluate experience.",
            "ai_feedback": "AI scoring failed. Please review manually.",
            "recommendation": "review",
        }