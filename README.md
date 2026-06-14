# ScreenAI

ScreenAI is an AI-assisted resume screening and candidate shortlisting platform built with React, Django REST Framework, and Gemini AI.

Candidates can register, browse open jobs, upload PDF resumes, and track application status. HR users can create and manage jobs, review applicants in a structured table, filter candidates, inspect AI-generated screening results, and make the final shortlist or rejection decision.

AI assists the initial screening process. The final hiring decision remains with HR.

## Features

### Candidate

- Candidate registration and JWT login
- Protected candidate routes
- Browse open jobs
- Apply by uploading a PDF resume
- PDF type and size validation
- Duplicate-application prevention
- View application status
- Candidate dashboard
- View and edit profile
- Automatic JWT access-token refresh

### HR

- HR registration and JWT login
- Protected HR routes
- Create, edit, close, reopen, and delete jobs
- Prevent deletion of jobs that already have applications
- View applicant count for each job
- Review applications in a table
- View candidate name, email, phone number, and resume
- View or download uploaded resumes
- View AI score, recommendation, matched skills, missing skills, and feedback
- View extracted professional experience and previous companies
- Filter applications by:
  - Job
  - Minimum AI score
  - Experience
  - Previous company
  - AI recommendation
  - HR status
- Shortlist, reject, or return an application to pending
- HR dashboard with job and application statistics

### AI Screening

- Extract PDF resume text using `pdfplumber`
- Compare resume content with job requirements using Gemini
- Generate an AI score from 0 to 100
- Identify matched and missing skills
- Evaluate experience suitability
- Extract total professional experience
- Extract previous company names
- Generate an HR-friendly summary and recommendation
- Mark applications as `Not evaluated` when AI processing fails instead of assigning a misleading score

## Technology Stack

### Frontend

- React
- JavaScript
- Vite
- Bootstrap
- React Router
- Axios

### Backend

- Python
- Django
- Django REST Framework
- Simple JWT
- django-cors-headers
- SQLite

### AI and Resume Processing

- Gemini API
- pdfplumber

## Project Structure

```text
ScreenAI/
├── backend/
│   ├── accounts/
│   ├── jobs/
│   ├── applications/
│   ├── ai_engine/
│   ├── screenai/
│   ├── media/
│   │   └── resumes/
│   ├── manage.py
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
├── README.md
└── .gitignore
```

## Main Modules

### Authentication

ScreenAI supports Candidate and HR accounts using JWT authentication.

The frontend includes role-based protected routes:

- Candidates cannot access HR pages.
- HR users cannot access candidate-only pages.
- Expired access tokens are refreshed automatically using the refresh token.
- Invalid or expired sessions redirect to the login page.

### Profiles

Profile information includes:

- Username
- Role
- First name
- Last name
- Email
- Phone number
- Education

Skills and professional experience are not manually entered in the profile. They are extracted from the resume during AI screening.

### Jobs

HR users can create jobs containing:

- Job title
- Company name
- Job description
- Required skills
- Required experience
- Location
- Status

HR users can edit, close, reopen, and delete their jobs. Jobs with existing applications cannot be deleted and should be closed instead.

Candidates and public users see only open jobs.

### Applications

Candidates submit a PDF resume for a selected job.

The backend:

1. Confirms the job is open.
2. Checks that the candidate has not already applied.
3. Validates the uploaded PDF.
4. Saves the application and resume.
5. Extracts resume text.
6. Sends the extracted content and job requirements to Gemini.
7. Saves the structured AI results.

Candidates receive only job and application-status information. Internal AI screening details are available only to HR.

### HR Candidate Screening

HR users see applicants in a table containing:

- Candidate name
- Email
- Phone number
- Job
- AI score
- Total experience
- Previous companies
- AI recommendation
- HR application status

Detailed screening information includes:

- Matched skills
- Missing skills
- Experience match
- Experience summary
- AI feedback
- Original resume

## API Endpoints

### Authentication and Profiles

```text
POST  /api/accounts/register/
POST  /api/accounts/login/
POST  /api/accounts/token/refresh/
GET   /api/accounts/profile/
PATCH /api/accounts/profile/
PUT   /api/accounts/profile/
```

### Jobs

```text
GET    /api/jobs/
POST   /api/jobs/
GET    /api/jobs/<id>/
PUT    /api/jobs/<id>/
PATCH  /api/jobs/<id>/
DELETE /api/jobs/<id>/
```

### Applications

```text
POST  /api/applications/apply/
GET   /api/applications/my/
GET   /api/applications/hr/
PATCH /api/applications/<id>/status/
```

### HR Application Filters

Examples:

```text
GET /api/applications/hr/?job=1
GET /api/applications/hr/?min_score=80
GET /api/applications/hr/?experience=2
GET /api/applications/hr/?experience=fresher
GET /api/applications/hr/?company=Example%20Company
GET /api/applications/hr/?recommendation=shortlist
GET /api/applications/hr/?status=shortlisted
```

Filters can be combined.

## Backend Setup

Open PowerShell from the project folder:

```powershell
cd D:\internship\ScreenAI\backend
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install backend dependencies:

```powershell
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GEMINI_API_KEY=your_real_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite

DJANGO_SECRET_KEY=replace-with-a-private-secret-key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost

CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Never commit the `.env` file.

Apply migrations:

```powershell
python manage.py migrate
```

Check the Django configuration:

```powershell
python manage.py check
```

Start the backend:

```powershell
python manage.py runserver
```

Backend API:

```text
http://127.0.0.1:8000/
```

## Frontend Setup

Open a second PowerShell terminal:

```powershell
cd D:\internship\ScreenAI\frontend
```

Install dependencies:

```powershell
npm install
```

Start the frontend:

```powershell
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

## Application Flow

### Candidate Flow

```text
Register
→ Login
→ Browse open jobs
→ Select a job
→ Upload PDF resume
→ AI screening
→ Track application status
```

### HR Flow

```text
Register
→ Login
→ Create and manage jobs
→ Review candidate applications
→ Filter applicants
→ Inspect AI results and resumes
→ Shortlist, reject, or mark pending
```

## Important Notes

- Only PDF resumes are accepted.
- The maximum resume size is 5 MB.
- A candidate cannot apply to the same job more than once.
- Applications cannot be submitted to closed jobs.
- AI-generated results support screening but may require human verification.
- HR controls the final application status.
- Older applications created before experience extraction was added may show `Not evaluated`.
- Existing AI results remain stored in SQLite and are not automatically recalculated.

## Development Checks

Backend:

```powershell
cd D:\internship\ScreenAI\backend
.\.venv\Scripts\Activate.ps1
python manage.py check
```

Frontend:

```powershell
cd D:\internship\ScreenAI\frontend
npm run build
```

Optional frontend lint check:

```powershell
npm run lint
```

## Future Improvements

- Public application forms generated and shared by HR
- Email notifications
- Application withdrawal
- Resume replacement and rescoring
- Pagination for large applicant lists
- Background AI processing
- Cloud media storage
- PostgreSQL deployment
- Automated backend and frontend tests

## Project Purpose

ScreenAI demonstrates how AI can reduce manual effort during the initial resume-screening stage.

The system is designed as a decision-support tool. Gemini provides structured screening assistance, while HR remains responsible for the final hiring decision.