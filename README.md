# ScreenAI

ScreenAI is an AI-assisted recruitment screening platform for managing job openings, public applications, resume review, candidate workflows, interviews, post-hire progression, admin governance, and browser-based coding assessments.

The project includes an HR recruiter dashboard, an admin command dashboard, public job application pages, AI resume scoring, secure audit logging, and a take-home assessment workflow with Brevo email invitations and Docker-based code evaluation.

## Current Status

Active feature branch: `notebook-assessments`

The recruitment workflow is working. The assessment workflow is under active refinement, especially the question-template editor, visible sample test cases, and LeetCode-style run output.

## Key Features

- Admin-created recruiter accounts with suspension, activation, password reset, forced password change, and session revocation.
- HR job management with public application links.
- Public candidate application form with PDF resume upload.
- AI resume parsing, compatibility scoring, recommendation, and HR-only score breakdowns.
- Unified candidate workspace for summary, resume evaluation, interviews, assessment, recruitment decision, and post-hire progression.
- Interview scheduling and timeline tracking.
- Post-hire progression logs for hired candidates.
- Admin dashboard with recruiter governance, application directories, candidate identities, audit logs, and protected resume streaming.
- Browser-based take-home coding assessments with recruiter-created templates, Brevo invitations, candidate coding workspace, save progress, final submit, Docker evaluation, and recruiter result summaries.

## Tech Stack

### Backend

- Python
- Django
- Django REST Framework
- Django Simple JWT
- SQLite for local development
- Django CORS Headers
- Gemini API for resume scoring
- Docker sandbox for assessment code execution
- Brevo Transactional Email API for assessment invitations

### Frontend

- React
- Vite
- React Router
- Axios
- Material UI
- MUI Data Grid
- Monaco/code-editor style assessment workspace
- Bootstrap utilities
- Custom ScreenAI dark theme tokens

## User Roles

### Admin

- Creates and manages recruiter accounts.
- Suspends/reactivates recruiters.
- Resets recruiter credentials.
- Reviews platform-wide jobs, applications, candidates, hires, interviews, and audit activity.
- Accesses protected admin-only directories and governance tools.

### HR Recruiter

- Creates and manages jobs.
- Shares public application links.
- Reviews candidates and AI score summaries.
- Schedules interviews.
- Shortlists, rejects, hires, and tracks candidate progression.
- Sends take-home assessment invitations.
- Reviews and evaluates submitted assessment results.

### Candidate

- Applies through a public job link.
- Uploads a PDF resume.
- Opens secure assessment invitation links.
- Writes code in the browser-based assessment workspace.
- Saves progress and submits the exam.

## Main Workflows

### Public Application Flow

```text
Candidate opens public job link
-> fills application form
-> uploads PDF resume
-> backend parses resume
-> AI score and recommendation are generated
-> recruiter reviews candidate in workspace
```

### HR Candidate Review Flow

```text
Recruiter opens candidate workspace
-> reviews summary and resume/AI evaluation
-> optionally schedules interviews
-> optionally sends take-home assessment
-> shortlists, rejects, or hires candidate
-> tracks post-hire progression if hired
```

### Take-Home Assessment Flow

```text
Recruiter creates and activates assessment template
-> recruiter sends invitation from candidate workspace
-> candidate opens secure email link
-> candidate writes code directly in browser
-> candidate can run visible/sample checks
-> candidate saves progress
-> candidate final-submits
-> recruiter clicks Evaluate
-> Docker sandbox runs hidden tests
-> recruiter reviews score and question breakdown
```

### Admin Governance Flow

```text
Admin logs in
-> monitors recruiters, jobs, candidates, applications, interviews, hires
-> suspends/reactivates recruiters when needed
-> resets credentials
-> reviews audit activity
```

## Project Structure

```text
ScreenAI/
|-- backend/
|   |-- accounts/          # Authentication, users, audit logs, security state
|   |-- jobs/              # Job posting and public job links
|   |-- applications/      # Applications, interviews, progression, admin directories
|   |-- assessments/       # Templates, invitations, candidate workspace, grading
|   |-- ai_engine/         # Gemini resume scoring
|   `-- screenai/          # Django settings and root URLs
|
|-- frontend/
|   |-- src/
|   |   |-- api/           # Axios config and API helpers
|   |   |-- components/    # Reusable UI and assessment components
|   |   |-- pages/         # Dashboards, public apply page, assessment page
|   |   `-- utils/         # Auth helpers
|   `-- package.json
|
`-- README.md
```

## Environment Variables

Do not commit `.env` files.

### Backend: `backend/.env`

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite

DJANGO_SECRET_KEY=your_local_secret_key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

ASSESSMENT_INVITATIONS_ENABLED=True
ASSESSMENT_FRONTEND_URL=http://localhost:5173
ASSESSMENT_TOKEN_HMAC_KEY=local_assessment_hmac_key

BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=verified_sender@example.com
BREVO_SENDER_NAME=ScreenAI
BREVO_WEBHOOK_SECRET=your_webhook_secret

MAX_NOTEBOOK_UPLOAD_SIZE=5242880
RUN_CODE_PREVIEW_TIMEOUT_SECONDS=5
EVALUATOR_DOCKER_IMAGE=python:3.11-slim
```

### Frontend: `frontend/.env`

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_ASSESSMENT_INVITATIONS_ENABLED=true
```

Vite reads frontend environment variables at build/start time, so restart the frontend dev server after changing `frontend/.env`.

## Local Setup

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Assessment Development Notes

- Docker Desktop must be running for `Run Code` and final grading to work.
- If Docker is not running, assessment evaluation can fail with `docker_unavailable`.
- The recruiter-side Evaluate button is intended to queue and trigger evaluation in local development.
- A manual fallback worker command is available:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py process_assessments
```

## Testing

Run targeted tests while developing to save time:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test assessments
.\.venv\Scripts\python.exe manage.py test applications
.\.venv\Scripts\python.exe manage.py test accounts
```

Run all backend tests before major merges:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test
```

Frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

## Deployment Checklist

- Use a production database such as PostgreSQL.
- Set `DJANGO_DEBUG=False`.
- Configure `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`.
- Configure HTTPS.
- Configure Brevo API key, verified sender, and webhook secret.
- Run migrations.
- Build frontend with the correct production `VITE_API_BASE_URL`.
- Ensure a safe worker/evaluation strategy for assessment grading.
- Keep generated reports, private assessment files, local databases, and runtime folders out of git.

## Known Current Priorities

- Make assessment question templates fully data-driven:
  - examples;
  - visible sample test cases;
  - expected outputs;
  - function metadata;
  - per-question constraints/time limit.
- Improve `Run Code` output to show:
  - sample input;
  - actual function return value;
  - expected value;
  - pass/fail result;
  - console output separately.
- Ensure result status labels do not show "Passed" when score/tests are zero.
- End-to-end test a fresh candidate assessment from invite to grading.

