import json

import google.generativeai as genai
from django.conf import settings


def parse_experience_years(value):
    try:
        years = float(value)

        if years < 0:
            return 0.0

        return round(years, 1)

    except (TypeError, ValueError):
        return 0.0


def format_worked_companies(value):
    if isinstance(value, list):
        cleaned_companies = [
            str(company).strip()
            for company in value
            if str(company).strip()
        ]

        unique_companies = []

        for company in cleaned_companies:
            if company.lower() not in [
                existing.lower()
                for existing in unique_companies
            ]:
                unique_companies.append(company)

        return ", ".join(unique_companies)

    if isinstance(value, str):
        return value.strip()

    return ""


def score_resume_with_gemini(resume_text, job):
    genai.configure(
        api_key=settings.GEMINI_API_KEY
    )

    model = genai.GenerativeModel(
        "gemini-2.5-flash-lite"
    )

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
  "total_experience_years": 0,
  "worked_companies": ["Company One", "Company Two"],
  "experience_summary": "short summary of the candidate's work experience",
  "ai_feedback": "short HR-friendly feedback",
  "recommendation": "shortlist"
}}

Rules:

- ai_score must be an integer from 0 to 100.
- recommendation must be one of:
  shortlist, review, reject.
- total_experience_years must be numeric.
- Return total_experience_years rounded to one decimal place.
- Count only professional work experience.
- Do not count academic project duration as work experience.
- Internships may be included only when clearly mentioned as work experience.
- worked_companies must contain only company or organisation names found in the resume.
- Do not include job portals, technologies, colleges or project names as companies.
- If no company is found, return an empty list.
- If the candidate is a fresher, return total_experience_years as 0.
- If no professional experience is found, use:
  "No previous company experience found."
  as the experience_summary.
- Do not invent companies or experience.
- Do not include markdown.
- Do not include JSON code fences.
"""

    try:
        response = model.generate_content(prompt)

        result_text = response.text.strip()

        result_text = (
            result_text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        result = json.loads(result_text)

        ai_score = int(
            result.get("ai_score", 0)
        )

        ai_score = max(
            0,
            min(ai_score, 100),
        )

        recommendation = result.get(
            "recommendation",
            "review",
        )

        if recommendation not in [
            "shortlist",
            "review",
            "reject",
        ]:
            recommendation = "review"

        total_experience_years = (
            parse_experience_years(
                result.get(
                    "total_experience_years",
                    0,
                )
            )
        )

        worked_companies = (
            format_worked_companies(
                result.get(
                    "worked_companies",
                    [],
                )
            )
        )

        experience_summary = result.get(
            "experience_summary",
            "",
        )

        if not experience_summary:
            if total_experience_years == 0:
                experience_summary = (
                    "No previous company "
                    "experience found."
                )
            else:
                experience_summary = (
                    "Experience details were "
                    "not clearly extracted."
                )

        return {
            "ai_score": ai_score,
            "matched_skills": result.get(
                "matched_skills",
                "",
            ),
            "missing_skills": result.get(
                "missing_skills",
                "",
            ),
            "experience_match": result.get(
                "experience_match",
                "",
            ),
            "total_experience_years": (
                total_experience_years
            ),
            "worked_companies": (
                worked_companies
            ),
            "experience_summary": (
                experience_summary
            ),
            "ai_feedback": result.get(
                "ai_feedback",
                "",
            ),
            "recommendation": recommendation,
        }

    except Exception as error:
        print(
            "Gemini scoring error:",
            error,
        )

        return {
            "ai_score": 0,
            "matched_skills": "",
            "missing_skills": "",
            "experience_match": (
                "Could not evaluate experience."
            ),
            "total_experience_years": 0.0,
            "worked_companies": "",
            "experience_summary": (
                "Experience details could not "
                "be evaluated."
            ),
            "ai_feedback": (
                "AI scoring failed. "
                "Please review manually."
            ),
            "recommendation": "review",
        }