import json
import logging

import google.generativeai as genai
from django.conf import settings


logger = logging.getLogger(__name__)


def parse_experience_years(value):
    try:
        years = float(value)

        if years < 0:
            return 0.0

        return round(years, 1)

    except (TypeError, ValueError):
        return 0.0


def clean_text_value(value):
    if value is None:
        return ""

    return str(value).strip()


def format_worked_companies(value):
    if isinstance(value, list):
        cleaned_companies = [
            str(company).strip()
            for company in value
            if str(company).strip()
        ]

        unique_companies = []

        existing_names = set()

        for company in cleaned_companies:
            normalised_name = company.lower()

            if normalised_name not in existing_names:
                unique_companies.append(
                    company
                )

                existing_names.add(
                    normalised_name
                )

        return ", ".join(
            unique_companies
        )

    if isinstance(value, str):
        return value.strip()

    return ""


def parse_and_clamp_score(value, max_val):
    try:
        val = float(value)
        if val != val or val == float('inf') or val == float('-inf'):
            return 0
        val = int(round(val))
        return max(0, min(val, max_val))
    except (TypeError, ValueError):
        return 0


def get_not_evaluated_result(message):
    return {
        "ai_score": None,
        "skills_score": None,
        "experience_score": None,
        "projects_score": None,
        "company_role_score": None,
        "education_score": None,
        "relevance_score": None,

        "skills_reason": message,
        "experience_score_reason": message,
        "projects_score_reason": message,
        "company_role_score_reason": message,
        "education_score_reason": message,
        "relevance_score_reason": message,

        "project_summary": message,
        "education_summary": message,

        "matched_skills": "",
        "missing_skills": "",
        "experience_match": (
            "AI evaluation was not completed."
        ),
        "total_experience_years": None,
        "worked_companies": "",
        "experience_summary": message,
        "ai_feedback": message,
        "recommendation": (
            "not_evaluated"
        ),
    }


def score_resume_with_gemini(
    resume_text,
    job,
):
    if not settings.GEMINI_API_KEY:
        logger.error(
            "GEMINI_API_KEY is not configured."
        )

        return get_not_evaluated_result(
            "AI evaluation is unavailable because "
            "the Gemini API key is not configured."
        )

    model_name = getattr(
        settings,
        "GEMINI_MODEL",
        "gemini-2.5-flash-lite",
    )

    genai.configure(
        api_key=settings.GEMINI_API_KEY
    )

    model = genai.GenerativeModel(
        model_name
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
  "skills_score": 0,
  "skills_reason": "Short explanation",

  "experience_score": 0,
  "experience_reason": "Short explanation",

  "projects_score": 0,
  "projects_reason": "Short explanation",

  "company_role_score": 0,
  "company_role_reason": "Short explanation",

  "education_score": 0,
  "education_reason": "Short explanation",

  "relevance_score": 0,
  "relevance_reason": "Short explanation",

  "matched_skills": "skill1, skill2",
  "missing_skills": "skill3, skill4",

  "total_experience_years": 0,
  "worked_companies": ["Company One", "Company Two"],
  "experience_summary": "Short experience summary",

  "project_summary": "Short summary of relevant projects",
  "education_summary": "Short education and certification summary",

  "ai_feedback": "Short HR-friendly overall feedback",
  "recommendation": "shortlist"
}}

Scoring rules:

1. Skills Match (0 to 30 points):
- Evaluate required skills explicitly present in the resume, depth and practical use of the skills, missing required skills, and closely related alternatives.
- Do not award full marks merely because skill names appear once.

2. Relevant Experience (0 to 25 points):
- Evaluate total professional experience, relevance to the job, responsibilities performed, and alignment with the required experience range.
- Do not automatically penalize an experienced candidate only because they exceed the preferred range. If the candidate is overqualified, mention it in the explanation, but score based mainly on relevance.
- Do not count academic-project duration as professional work experience.

3. Projects (0 to 20 points):
- Evaluate project relevance to the job, technologies used, practical implementation, complexity, measurable outcomes, and ownership and contribution.
- Do not invent missing project information.

4. Previous Role and Company Relevance (0 to 10 points):
- Evaluate similarity of previous roles, responsibilities, industry or domain relevance, technologies and work performed.
- Do not give extra points merely because a company is famous. Company reputation must not influence the score.

5. Education and Certifications (0 to 5 points):
- Evaluate education relevance, technical certifications, and job-related training.
- Do not over-penalize candidates whose practical experience compensates for education.

6. Overall Job Relevance (0 to 10 points):
- Evaluate overall alignment with the complete job description, clarity of evidence in the resume, consistency of the candidate’s profile, and suitability for the role.

Constraints:
- Return ONLY valid JSON. Do not include markdown or JSON code fences.
- All reason fields must be short, clear, and professional.
- recommendation must be one of: "shortlist", "review", "reject".
- total_experience_years must be numeric. Return total_experience_years rounded to one decimal place.
- Count only professional work experience. Internships may be included only when clearly mentioned as work experience.
- worked_companies must contain only company or organisation names found in the resume. If no company is found, return an empty list: [].
- If the candidate is a fresher, return total_experience_years as 0.
- If no professional experience is found, use "No previous company experience found." as the experience_summary.
- Do not invent skills, projects, companies, experience, education, or certifications.
"""

    try:
        response = model.generate_content(
            prompt
        )

        result_text = (
            response.text
            .strip()
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

        result = json.loads(
            result_text
        )

        # Parse and clamp component scores
        skills_score = parse_and_clamp_score(result.get("skills_score", 0), 30)
        experience_score = parse_and_clamp_score(result.get("experience_score", 0), 25)
        projects_score = parse_and_clamp_score(result.get("projects_score", 0), 20)
        company_role_score = parse_and_clamp_score(result.get("company_role_score", 0), 10)
        education_score = parse_and_clamp_score(result.get("education_score", 0), 5)
        relevance_score = parse_and_clamp_score(result.get("relevance_score", 0), 10)

        # Calculate final score in Python
        ai_score = (
            skills_score
            + experience_score
            + projects_score
            + company_role_score
            + education_score
            + relevance_score
        )

        recommendation = (
            clean_text_value(
                result.get(
                    "recommendation",
                    "review",
                )
            ).lower()
        )

        allowed_recommendations = [
            "shortlist",
            "review",
            "reject",
        ]

        if (
            recommendation
            not in allowed_recommendations
        ):
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

        experience_summary = (
            clean_text_value(
                result.get(
                    "experience_summary",
                    "",
                )
            )
        )

        if not experience_summary:
            if (
                total_experience_years
                == 0
            ):
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
            "skills_score": skills_score,
            "experience_score": experience_score,
            "projects_score": projects_score,
            "company_role_score": company_role_score,
            "education_score": education_score,
            "relevance_score": relevance_score,

            "skills_reason": clean_text_value(result.get("skills_reason", "")),
            "experience_score_reason": clean_text_value(result.get("experience_reason", "")),
            "projects_score_reason": clean_text_value(result.get("projects_reason", "")),
            "company_role_score_reason": clean_text_value(result.get("company_role_reason", "")),
            "education_score_reason": clean_text_value(result.get("education_reason", "")),
            "relevance_score_reason": clean_text_value(result.get("relevance_reason", "")),

            "project_summary": clean_text_value(result.get("project_summary", "")),
            "education_summary": clean_text_value(result.get("education_summary", "")),

            "matched_skills": (
                clean_text_value(
                    result.get(
                        "matched_skills",
                        "",
                    )
                )
            ),
            "missing_skills": (
                clean_text_value(
                    result.get(
                        "missing_skills",
                        "",
                    )
                )
            ),
            "experience_match": (
                clean_text_value(
                    result.get(
                        "experience_reason",
                        "",
                    )
                )
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
            "ai_feedback": (
                clean_text_value(
                    result.get(
                        "ai_feedback",
                        "",
                    )
                )
            ),
            "recommendation": (
                recommendation
            ),
        }

    except json.JSONDecodeError as error:
        logger.exception(
            "Gemini returned invalid JSON: %s",
            error,
        )

        return get_not_evaluated_result(
            "Gemini returned an invalid response. "
            "Please review this application manually."
        )

    except Exception as error:
        logger.exception(
            "Gemini scoring failed: %s",
            error,
        )

        return get_not_evaluated_result(
            "AI scoring failed. "
            "Please review this application manually."
        )