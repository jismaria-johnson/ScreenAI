import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'screenai.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import Profile
from jobs.models import Job
from applications.models import Application, CandidateProgression
from django.core.files import File


def seed():
    print("Clearing old test data...")
    # Keep superusers, clean other HRs, jobs, and applications
    Application.objects.all().delete()
    Job.objects.all().delete()
    Profile.objects.exclude(user__is_superuser=True).delete()
    User.objects.exclude(is_superuser=True).delete()

    resume_dir = 'media/resumes/'
    resume_file = 'Software_Engineer_Resume.pdf'
    resume_path = os.path.join(resume_dir, resume_file)
    
    # Check if a dummy file exists or copy one
    if not os.path.exists(resume_path):
        os.makedirs(resume_dir, exist_ok=True)
        with open(resume_path, 'wb') as f:
            f.write(b"%PDF-1.4\n%dummy pdf content\n%%EOF")

    # 1. Create Recruiter HR Users
    print("Creating Recruiters...")
    hr1 = User.objects.create_user(username="alice_recruiter", password="password", email="alice@google.com", first_name="Alice", last_name="Johnson")
    Profile.objects.create(user=hr1, role="hr", phone="+1 (555) 011-2233")

    hr2 = User.objects.create_user(username="bob_recruiter", password="password", email="bob@stripe.com", first_name="Bob", last_name="Smith")
    Profile.objects.create(user=hr2, role="hr", phone="+1 (555) 044-5566")

    # 2. Create Jobs
    print("Creating Jobs...")
    job1 = Job.objects.create(
        hr_user=hr1,
        job_title="Senior Python Developer",
        company_name="Google",
        job_description="We are looking for a Senior Python Developer with extensive experience in Django and AI APIs.",
        required_skills="Python, Django, PostgreSQL, REST APIs",
        required_experience="5+ years",
        status="open"
    )

    job2 = Job.objects.create(
        hr_user=hr1,
        job_title="Data Analyst",
        company_name="Google",
        job_description="Looking for a Data Analyst to process metric datasets.",
        required_skills="SQL, Python, Pandas, Tableau",
        required_experience="2-4 years",
        status="closed"
    )

    job3 = Job.objects.create(
        hr_user=hr2,
        job_title="Frontend React Engineer",
        company_name="Stripe",
        job_description="Join Stripe's dashboard team. Advanced knowledge of React 19, CSS modules, and custom Hooks is required.",
        required_skills="React, JavaScript, CSS, HTML5, TypeScript",
        required_experience="3+ years",
        status="open"
    )

    # 3. Create Applications
    print("Seeding Candidate Applications...")

    # Application 1: Old legacy candidate (null component breakdown for backward compatibility checks)
    app1 = Application(
        job=job1,
        candidate_name="Thomas Legacy",
        candidate_email="thomas.legacy@email.com",
        candidate_phone="+1 (555) 100-2000",
        candidate_education="B.S. in Computer Science",
        ai_score=72,
        matched_skills="Python, PostgreSQL",
        missing_skills="Django, REST APIs",
        experience_match="Has 4 years of Python experience, meeting general requirements.",
        total_experience_years=4.0,
        worked_companies="Tech Solutions",
        experience_summary="Thomas worked for 4 years at Tech Solutions developing Python scripts.",
        ai_feedback="Solid legacy profile. Re-evaluation not needed unless requirements change.",
        recommendation="review",
        application_status="pending"
    )
    with open(resume_path, 'rb') as f:
        app1.resume.save('thomas_resume.pdf', File(f), save=False)
    app1.save()

    # Application 2: Modern hired candidate with full breakdown
    app2 = Application(
        job=job1,
        candidate_name="Sarah Miller",
        candidate_email="sarah.miller@email.com",
        candidate_phone="+1 (555) 300-4000",
        candidate_education="M.S. in Software Engineering",
        
        # Breakdown scores summing to 92
        skills_score=28,
        experience_score=23,
        projects_score=18,
        company_role_score=9,
        education_score=5,
        relevance_score=9,
        ai_score=92,

        skills_reason="Sarah exhibits exceptional mastery of Python and Django, with several years of hands-on REST API development.",
        experience_score_reason="Sarah has over 6 years of experience, aligning perfectly with the senior seniority expectations.",
        projects_score_reason="Demonstrates complex projects including microservices architecture and cloud-hosted deployments.",
        company_role_score_reason="Worked in highly structured engineering departments at reputable software houses.",
        education_score_reason="Holds a Master's degree in Software Engineering.",
        relevance_score_reason="Fits the core requirements of Google's backend division perfectly.",
        project_summary="Built a scalable telemetry pipeline and led migration to microservices.",
        education_summary="M.S. in Software Engineering, B.S. in CS.",

        matched_skills="Python, Django, PostgreSQL, REST APIs",
        missing_skills="",
        experience_match="6.5 years of professional backend engineering experience.",
        total_experience_years=6.5,
        worked_companies="InnovateCorp, DevHouse",
        experience_summary="6.5 years working as a Django Backend Lead.",
        ai_feedback="Highly recommended. Exceptional candidate for leadership roles.",
        recommendation="shortlist",
        application_status="hired" # This will auto-create initial "Hired" progression log via signals
    )
    with open(resume_path, 'rb') as f:
        app2.resume.save('sarah_resume.pdf', File(f), save=False)
    app2.save()

    # Add extra progression logs to Sarah Miller for rich visualization
    CandidateProgression.objects.create(
        application=app2,
        stage="Onboarding",
        notes="Sarah has signed her offer letter and is completing her background check."
    )
    CandidateProgression.objects.create(
        application=app2,
        stage="Active Employee",
        notes="Successfully completed orientation and assigned to the Backend Platform team."
    )

    # Application 3: Frontend Candidate
    app3 = Application(
        job=job3,
        candidate_name="Alex Rivera",
        candidate_email="alex.rivera@email.com",
        candidate_phone="+1 (555) 700-8000",
        candidate_education="Self-taught Bootcamp Graduate",
        
        skills_score=22,
        experience_score=15,
        projects_score=16,
        company_role_score=6,
        education_score=3,
        relevance_score=8,
        ai_score=70,

        skills_reason="Strong JavaScript and React skills, but lacks deep TypeScript experience required by the team.",
        experience_score_reason="Has 3 years of experience, meeting the minimum requirement threshold.",
        projects_score_reason="Showcases beautiful React dashboards with custom hooks.",
        company_role_score_reason="Prior roles were mostly in small agencies rather than product companies.",
        education_score_reason="Education is compensated by solid portfolio projects.",
        relevance_score_reason="Capable frontend developer suitable for a standard engineering role.",
        project_summary="Developed e-commerce storefronts and custom calendar widgets.",
        education_summary="General Assembly Frontend Development Immersive.",

        matched_skills="React, JavaScript, CSS, HTML5",
        missing_skills="TypeScript",
        experience_match="3 years of frontend agency development.",
        total_experience_years=3.0,
        worked_companies="PixelPerfect, CreativeAgency",
        experience_summary="3 years of frontend work creating React web apps.",
        ai_feedback="Good technical builder. Suitable for interview round.",
        recommendation="review",
        application_status="shortlisted"
    )
    with open(resume_path, 'rb') as f:
        app3.resume.save('alex_resume.pdf', File(f), save=False)
    app3.save()

    # Application 4: Failed AI Evaluation Candidate (Gemini Error Fallback Simulation)
    app4 = Application(
        job=job3,
        candidate_name="Kevin Dev",
        candidate_email="kevin.dev@email.com",
        candidate_phone="+1 (555) 900-9999",
        candidate_education="Unknown",
        
        # All component scores and AI score are None
        skills_score=None,
        experience_score=None,
        projects_score=None,
        company_role_score=None,
        education_score=None,
        relevance_score=None,
        ai_score=None,

        skills_reason="AI evaluation was not completed. Please review manually.",
        experience_score_reason="AI evaluation was not completed. Please review manually.",
        projects_score_reason="AI evaluation was not completed. Please review manually.",
        company_role_score_reason="AI evaluation was not completed. Please review manually.",
        education_score_reason="AI evaluation was not completed. Please review manually.",
        relevance_score_reason="AI evaluation was not completed. Please review manually.",
        project_summary="AI evaluation was not completed. Please review manually.",
        education_summary="AI evaluation was not completed. Please review manually.",

        matched_skills="",
        missing_skills="",
        experience_match="AI evaluation was not completed.",
        total_experience_years=None,
        worked_companies="",
        experience_summary="AI evaluation was not completed. Please review manually.",
        ai_feedback="AI evaluation failed. Please review this application manually.",
        recommendation="not_evaluated",
        application_status="pending"
    )
    with open(resume_path, 'rb') as f:
        app4.resume.save('kevin_resume.pdf', File(f), save=False)
    app4.save()

    print("\nDatabase seeded successfully!")
    print(f"Total HR Users: {User.objects.exclude(is_superuser=True).count()}")
    print(f"Total Jobs: {Job.objects.count()}")
    print(f"Total Candidate Applications: {Application.objects.count()}")
    print(f"Hired Candidate Progressions: {CandidateProgression.objects.count()}")


if __name__ == '__main__':
    seed()
