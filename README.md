# ScreenAI — AI-Powered Recruitment & Assessment Platform

ScreenAI is a full-stack recruitment platform that automates candidate screening using Google Gemini AI. It manages the entire hiring lifecycle — from job posting and public application intake, through AI-scored resume evaluation, structured interview tracking, and browser-based technical coding assessments with secure Docker-sandboxed evaluation.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Repository Structure](#repository-structure)
5. [Data Models](#data-models)
6. [Core Workflow](#core-workflow)
7. [User Roles](#user-roles)
8. [API Reference](#api-reference)
9. [Frontend Routes](#frontend-routes)
10. [Environment Variables](#environment-variables)
11. [Local Setup](#local-setup)
12. [Seed Data](#seed-data)
13. [Security Design](#security-design)

---

## Project Overview

ScreenAI solves the bottleneck of high-volume candidate screening by:

- Letting HR users post jobs and share a **public shareable link** — no candidate login required to apply.
- Automatically extracting text from uploaded PDF resumes and sending them to **Google Gemini** for multi-dimensional scoring.
- Providing HR users with a ranked, AI-annotated candidate list inside a rich dashboard.
- Enabling HR users to create **versioned assessment templates** with coding questions and send personalized, time-limited invitations via **Brevo transactional email**.
- Delivering an in-browser coding environment (Monaco Editor) where candidates write and run code against visible and hidden test cases.
- Running submitted code inside a **Docker-sandboxed Python/JavaScript environment** to grade answers securely.
- Tracking every candidate through **interview rounds** with per-round ratings and progression notes.
- Providing an **Admin dashboard** with a full audit log, HR management, and cross-organization candidate directory.

---

## Architecture

```
+-----------------------------------------------------+
|                    Browser (React)                  |
|  HR Dashboard  Admin Dashboard  Public Apply        |
|  Candidate Assessment (Monaco Editor + test runner) |
+-------------------+-----+---------------------------+
                    |  REST (Axios + JWT Bearer)
+-------------------v-----+---------------------------+
|              Django REST Framework (Python)          |
|  accounts  jobs  applications  assessments           |
|  ai_engine (Gemini API)                              |
+------+----------------+---------------+-------------+
       |                |               |
  SQLite DB        media/resumes   Docker Sandbox
  (db.sqlite3)    (PDF files)      (code execution)
```

- **Backend**: Django 6 + Django REST Framework, JWT via `djangorestframework-simplejwt` with a custom token-versioning layer.
- **Frontend**: React 19 + Vite + React Router v7, MUI Data Grid, Monaco Editor, Bootstrap 5.
- **AI**: Google Gemini (`gemini-2.5-flash-lite` by default) for resume scoring.
- **Email**: Brevo (formerly Sendinblue) transactional API for assessment invitations with full webhook tracking.
- **Code Execution**: Docker (`python:3.11-slim`) with configurable CPU, memory, and timeout limits.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | Django 6.0 |
| API layer | Django REST Framework 3.17 |
| Authentication | JWT via `djangorestframework-simplejwt` 5.5 + custom token versioning |
| Database | SQLite (development) |
| AI scoring | Google Generative AI SDK (`google-generativeai` 0.8) — Gemini model |
| Resume parsing | `pdfplumber` 0.11 |
| Email delivery | Brevo REST API v3 |
| Code sandbox | Docker (`python:3.11-slim`) via `subprocess` |
| Notebook format | `nbformat` 5.10 |
| Frontend | React 19, Vite 8 |
| UI components | MUI v9 (Material UI), MUI X Data Grid, Bootstrap 5 |
| Code editor | Monaco Editor (`@monaco-editor/react`) |
| HTTP client | Axios 1.17 with automatic JWT refresh interceptors |
| Routing | React Router v7 |
| CORS | `django-cors-headers` |

---

## Repository Structure

```
ScreenAI/
+-- backend/                        # Django project
|   +-- screenai/                   # Project config (settings, urls, wsgi, asgi)
|   +-- accounts/                   # User auth, profiles, JWT, audit logging
|   |   +-- models.py               #   Profile, AuditLog, UserSecurityState
|   |   +-- authentication.py       #   Custom JWT auth with token versioning
|   |   +-- serializers.py          #   Register, login, profile serializers
|   |   +-- views.py                #   Register, Login, Profile, ChangePassword
|   |   +-- urls.py
|   +-- jobs/                       # Job postings
|   |   +-- models.py               #   Job (with UUID token for public link)
|   |   +-- views.py
|   |   +-- urls.py
|   +-- applications/               # Candidate applications, interviews, admin
|   |   +-- models.py               #   Application, CandidateIdentity, CandidateProgression, Interview
|   |   +-- views.py                #   Apply, public apply, HR view, status update, interviews
|   |   +-- admin_views.py          #   Admin HR management, candidate directory, audit log
|   |   +-- serializers.py
|   |   +-- admin_serializers.py
|   |   +-- urls.py
|   +-- ai_engine/                  # Gemini AI integration
|   |   +-- gemini_scorer.py        #   Multi-dimensional resume scoring via Gemini
|   |   +-- resume_parser.py        #   PDF text extraction via pdfplumber
|   +-- assessments/                # Coding assessment engine
|   |   +-- models.py               #   AssessmentTemplate, Question, CandidateAssessment, Submission, Result
|   |   +-- services.py             #   Business logic: token gen, assignment, email dispatch
|   |   +-- evaluator.py            #   Docker sandbox runner + test harness builder
|   |   +-- views.py                #   HR + candidate-facing API views
|   |   +-- email_providers/
|   |   |   +-- brevo.py            #   Brevo API client
|   |   +-- urls.py
|   +-- manage.py
|   +-- requirements.txt
|   +-- seed_data.py                # Creates demo HR users, jobs, and applications
|   +-- seed_structured_questions.py# Creates demo assessment templates & questions
|   +-- .env.example
|   +-- db.sqlite3
|
+-- frontend/                       # React + Vite SPA
|   +-- src/
|   |   +-- App.jsx                 # Route definitions
|   |   +-- main.jsx
|   |   +-- api/
|   |   |   +-- axiosConfig.js      #   Axios instance + JWT refresh interceptor
|   |   |   +-- assessments.js      #   Assessment API calls
|   |   +-- components/
|   |   |   +-- ProtectedRoute.jsx  #   Role-based route guard
|   |   |   +-- ErrorBoundary.jsx
|   |   |   +-- ConfirmModal.jsx
|   |   |   +-- Toast.jsx
|   |   |   +-- assessments/
|   |   |       +-- AssessmentsManager.jsx   # HR: manage templates & assignments
|   |   |       +-- AssessmentSection.jsx    # HR: view results per candidate
|   |   |       +-- SubmittedAssessmentPage.jsx
|   |   +-- pages/
|   |   |   +-- Home.jsx
|   |   |   +-- Login.jsx
|   |   |   +-- HRDashboard.jsx          # Main HR workspace
|   |   |   +-- AdminDashboard.jsx       # Admin workspace
|   |   |   +-- PublicApplyJob.jsx       # Token-based public application form
|   |   |   +-- CandidateAssessmentPage.jsx # In-browser coding environment
|   |   |   +-- ForcePasswordChange.jsx
|   |   |   +-- assessment/
|   |   |       +-- ProblemPanel.jsx     # Problem statement display
|   |   |       +-- TestCasesPanel.jsx   # Visible test cases + run output
|   |   +-- utils/
|   |   +-- styles/
|   +-- index.html
|   +-- package.json
|   +-- vite.config.js
|   +-- .env.example
|
+-- output/                         # (gitignored) output files
+-- tmp/                            # (gitignored) temporary files
+-- .gitignore
```

---

## Data Models

### `accounts` app

| Model | Purpose |
|---|---|
| `Profile` | Extends Django `User` with `role` (`candidate` / `hr`), phone, education, skills, experience |
| `AuditLog` | Append-only immutable audit trail — every significant action is recorded |
| `UserSecurityState` | Per-user `token_version` (incremented on password change to revoke all existing sessions) and `must_change_password` flag |

### `jobs` app

| Model | Purpose |
|---|---|
| `Job` | Title, company, description, required skills, experience, location, status (`open`/`closed`), UUID `application_token` for public shareable links, optional `application_deadline` |

### `applications` app

| Model | Purpose |
|---|---|
| `CandidateIdentity` | Unified identity record for `registered`, `public`, or `anonymous` applicants |
| `Application` | Resume upload, extracted text, full AI scoring breakdown (6 sub-scores + reasons, matched/missing skills, experience summary), HR status (`pending`/`shortlisted`/`rejected`/`hired`), AI recommendation |
| `CandidateProgression` | Stage-by-stage progression log per application |
| `Interview` | Multi-round interview records with type, schedule, 5-dimension ratings, feedback, and hire recommendation |

### `assessments` app

| Model | Purpose |
|---|---|
| `AssessmentTemplate` | Versioned assessment with name, instructions, duration, status (`draft`/`active`/`archived`) |
| `AssessmentQuestion` | Per-template coding questions with per-language starter code, visible & hidden test cases, execution mode (`function`/`stdio`), time/memory limits |
| `CandidateAssessment` | Assignment record: HMAC-secured token digest, deadline, email tracking, immutable `assessment_snapshot` + `private_grading_snapshot` captured at assignment time |
| `AssessmentSubmission` | Uploaded notebook file (SHA-256 verified, stored in private filesystem outside media root) |
| `AssessmentResult` | Total score, percentage, pass/fail, Docker execution metadata |
| `AssessmentQuestionResult` | Per-question score, passed/failed tests, execution status, safe stdout |
| `AssessmentEmailDelivery` | Full Brevo email delivery audit trail per send attempt |
| `CandidateAnswer` | Auto-saved code answers per question + selected language |

---

## Core Workflow

### Stage 1 — Job Posting

1. An **HR user** logs in and navigates to the **HR Dashboard → Jobs** tab.
2. HR creates a new job, filling in title, company, description, required skills, experience, and location.
3. Each job is automatically assigned a **UUID `application_token`** that forms a public shareable URL: `/apply/public/<token>`.
4. HR can optionally set an `application_deadline` and toggle the application form on/off.
5. HR copies the shareable link and distributes it externally (email, LinkedIn, etc.).

---

### Stage 2 — Application Intake & AI Scoring

**Public (unauthenticated) path:**

1. A candidate opens the public URL `/apply/public/<token>`.
2. The `PublicApplyJob` page fetches job details from `GET /api/jobs/public/<token>/`.
3. Candidate fills in name, email, phone, education, and uploads a PDF resume.
4. On submit, a `POST /api/applications/public/<token>/` request is made.
5. The backend creates a `CandidateIdentity` of type `public` and an `Application` record.
6. The application's `evaluate_and_save()` method is called synchronously:
   - **`resume_parser.py`** uses `pdfplumber` to extract raw text from the PDF.
   - **`gemini_scorer.py`** sends a structured prompt to the configured **Gemini model** containing the resume text and job requirements.
   - Gemini returns a JSON payload with 6 sub-scores (Skills, Experience, Projects, Company Role, Education, Relevance), reasons, matched/missing skills, experience summary, worked companies, total experience years, AI feedback, and a `recommendation` (`shortlist`/`review`/`reject`).
   - All fields are stored on the `Application` record.

**HR view:**

7. HR navigates to the **Candidates** tab and sees all applicants ranked by AI score.
8. HR can read the full AI breakdown for any candidate (score breakdown, matched/missing skills, experience summary, project highlights, AI recommendation).
9. HR manually sets the application status to `shortlisted`, `rejected`, or `hired`.

---

### Stage 3 — Assessment Invitation via Email

1. HR navigates to the **Assessments** tab and creates an **Assessment Template**:
   - Sets name, instructions, duration.
   - Adds coding questions: each has a title, prompt, per-language starter code (Python / JavaScript), visible sample test cases, and hidden test cases.
   - Activates the template (status: `draft` → `active`).
2. From a shortlisted candidate's profile, HR clicks **Send Assessment**.
3. The backend (`POST /api/assessments/assignments/send/`) calls `assign_assessment_to_candidate()`:
   - Creates a `CandidateAssessment` with a **HMAC-SHA256 secure token** (only the digest is stored in DB; the raw token is emailed to the candidate).
   - Takes an **immutable snapshot** of the template + questions at the moment of assignment (`assessment_snapshot`) and a separate **private grading snapshot** with hidden test cases (`private_grading_snapshot`) — neither changes if the template is edited later.
   - Calls the **Brevo API** to send a personalized invitation email containing the one-time assessment URL: `/assessments/take/<raw_token>`.
   - Tracks the Brevo `message_id` for webhook-based delivery updates.
4. Brevo webhooks (`POST /api/assessments/webhooks/brevo/`) update the email delivery status in real time (sent, delivered, opened, clicked, bounced, etc.).
5. HR can **Resend** the invitation if the candidate has not responded.

> **Note:** Email delivery is controlled by `ASSESSMENT_INVITATIONS_ENABLED`. When `False`, invitation API calls are accepted but no email is sent.

---

### Stage 4 — Candidate Takes the Assessment

1. Candidate opens the emailed link: `/assessments/take/<raw_token>`.
2. The `CandidateAssessmentPage` calls `GET /api/assessments/access/<token>/`:
   - Backend verifies the HMAC token, checks the deadline, and ensures the assessment is in a valid state.
   - Returns the **public snapshot** (questions without hidden tests), candidate name, time remaining.
3. The page renders a **split-panel coding environment**:
   - Left: `ProblemPanel` — problem statement, constraints, visible sample test cases.
   - Center: **Monaco Editor** — full-featured code editor with syntax highlighting for Python 3 and JavaScript (Node).
   - Right: `TestCasesPanel` — run visible test cases and view output.
4. As the candidate types, answers are **auto-saved** after 1.2 seconds of inactivity (`POST /api/assessments/access/<token>/save-answers/`).
5. Candidate can switch languages per question; the system stores the last selected language per question.
6. Candidate can **Run Code** (`POST /api/assessments/access/<token>/run-code/`) to see execution output.
7. Candidate can **Run Tests** against visible test cases (`POST /api/assessments/access/<token>/run-tests/`).
8. A countdown timer shows remaining time. On expiry, submission is forced.
9. On **Submit**, `POST /api/assessments/access/<token>/submit/` is called. The assessment status transitions to `submitted`.

---

### Stage 5 — Secure Code Evaluation

1. HR (or admin) triggers evaluation: `POST /api/assessments/assignments/<uuid>/queue/`.
2. `evaluator.py` builds a **private test harness** Python script that:
   - Embeds the candidate's code (from saved answers or extracted notebook cells).
   - Embeds hidden test cases from the private grading snapshot (base64-encoded to prevent injection).
   - Runs each test case against the candidate's function or stdio output.
3. The harness is executed inside a **Docker container** (`python:3.11-slim`) with:
   - Configurable CPU limit (`EVALUATOR_CPU_LIMIT`)
   - Memory limit (`EVALUATOR_MEMORY_MB`)
   - Execution timeout (`EVALUATOR_TIMEOUT_SECONDS`)
   - Max output bytes cap (`EVALUATOR_MAX_OUTPUT_BYTES`)
4. Results are parsed: per-question pass/fail counts, scores, execution status (`passed`/`failed`/`error`/`timeout`).
5. An `AssessmentResult` and per-question `AssessmentQuestionResult` records are created.
6. The `CandidateAssessment` status transitions to `graded`.
7. HR can view results in the candidate's assessment detail view.
8. On failure, HR can **Retry** evaluation (`POST /api/assessments/assignments/<uuid>/retry/`), subject to `EVALUATOR_MAX_RETRIES`.

---

### Stage 6 — Interview Tracking & Final Decision

1. HR adds **Interview rounds** for shortlisted candidates:
   - Sets round name, number, type (Phone / Video / In-Person / Technical / HR / Managerial).
   - Records scheduled time, duration, interviewer, and meeting link.
2. After each round, HR updates the interview with:
   - Status: `scheduled` → `completed` / `cancelled` / `no_show`.
   - 5-dimension ratings (1–5): Technical, Communication, Problem Solving, Culture Fit, Overall.
   - Written feedback and hire recommendation (`strong_hire`/`hire`/`review`/`no_hire`).
3. HR marks the application as **Hired**, which automatically creates a `CandidateProgression` record with stage `"Hired"` and logs an audit event.
4. Admin can view all hired candidates, the full audit log, and manage HR accounts (activate/deactivate, reset passwords).

---

## User Roles

| Role | Access |
|---|---|
| **HR** (`role = "hr"`) | Create/edit/close jobs, view all applications for their jobs, run AI scoring, manage interview rounds, create assessment templates, send/resend assessment invitations, view results |
| **Admin** (`is_superuser = True` or `is_staff = True`) | Everything HR can do, plus HR account management (create, activate, deactivate, reset passwords), full audit log, cross-HR candidate directory, all interview records |
| **Candidate (public)** | Submit application via public URL — no account required |
| **Candidate (assessment)** | Access assessment via emailed token — no account required |

**Password Security:**
- Newly created HR accounts have `must_change_password = True`.
- On first login, users are forced to `/force-password-change` before accessing any other route.
- Changing password increments `token_version`, immediately revoking all previously issued JWT tokens.

---

## API Reference

### Authentication — `/api/accounts/`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register/` | Create a new user account |
| `POST` | `/login/` | Obtain JWT access + refresh tokens |
| `POST` | `/token/refresh/` | Refresh an expired access token |
| `GET/PATCH` | `/profile/` | View or update own profile |
| `POST` | `/change-password/` | Change password (revokes all sessions) |
| `GET` | `/security-status/` | Check if password change is required |

### Jobs — `/api/jobs/`

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/` | List own jobs (HR) or create a job |
| `GET/PUT/DELETE` | `/<int:pk>/` | Retrieve, update, or delete a job |
| `GET` | `/public/<uuid:token>/` | Fetch job detail by public token (no auth) |

### Applications — `/api/applications/`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/apply/` | Apply to a job (authenticated candidate) |
| `GET` | `/my/` | List own applications |
| `GET` | `/hr/` | List all applications for HR's jobs |
| `PATCH` | `/<int:pk>/status/` | Update application status |
| `POST` | `/public/<uuid:token>/` | Public application submission (no auth, rate-limited) |
| `GET/POST` | `/<int:application_id>/interviews/` | List or create interview rounds |
| `GET/PUT/PATCH/DELETE` | `/interviews/<int:pk>/` | Interview detail operations |

### Admin — `/api/applications/admin/`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/hrs/` | List all HR accounts |
| `POST` | `/hrs/<int:pk>/toggle/` | Activate or deactivate an HR account |
| `POST` | `/hrs/<int:pk>/reset-password/` | Reset HR password |
| `GET` | `/activity-log/` | System-wide audit log |
| `GET` | `/hired-candidates/` | All hired candidates |
| `GET` | `/interviews/` | All interview records |
| `GET/POST` | `/<int:pk>/progression/` | Candidate progression records |
| `GET` | `/directory/` | Application directory |
| `GET` | `/candidates/` | Candidate directory |

### Assessments — `/api/assessments/`

| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/templates/` | List or create assessment templates |
| `GET/PUT/PATCH/DELETE` | `/templates/<uuid:pk>/` | Template detail operations |
| `POST` | `/templates/<uuid:pk>/questions/` | Add a question to a template |
| `GET/PUT/PATCH/DELETE` | `/templates/<uuid:pk>/questions/<uuid:question_id>/` | Question detail |
| `POST` | `/templates/<uuid:pk>/questions/reorder/` | Reorder questions |
| `POST` | `/templates/<uuid:pk>/activate/` | Activate a draft template |
| `POST` | `/templates/<uuid:pk>/archive/` | Archive an active template |
| `POST` | `/templates/<uuid:pk>/clone/` | Clone a template as a new draft |
| `GET` | `/templates/<uuid:pk>/preview/` | Preview a template |
| `POST` | `/assignments/send/` | Send assessment to a candidate |
| `GET` | `/applications/<int:application_id>/assignments/` | List assignments for an application |
| `GET` | `/assignments/<uuid:pk>/` | Assignment detail |
| `POST` | `/assignments/<uuid:pk>/resend/` | Resend invitation email |
| `POST` | `/assignments/<uuid:pk>/queue/` | Queue submission for evaluation |
| `POST` | `/assignments/<uuid:pk>/retry/` | Retry failed evaluation |
| `GET` | `/assignments/<uuid:pk>/result/` | Get assessment result |
| `GET` | `/assignments/<uuid:pk>/dev-access-link/` | Dev-only: get raw access token |
| `POST` | `/webhooks/brevo/` | Brevo email delivery webhook |
| `GET` | `/access/<str:token>/` | Candidate: access assessment (token auth) |
| `GET` | `/access/<str:token>/notebook/` | Download assessment notebook |
| `POST` | `/access/<str:token>/upload/` | Upload completed notebook |
| `POST` | `/access/<str:token>/save-answers/` | Auto-save code answers |
| `POST` | `/access/<str:token>/run-code/` | Run code in sandbox |
| `POST` | `/access/<str:token>/run-tests/` | Run visible test cases |
| `POST` | `/access/<str:token>/submit/` | Final submission |

---

## Frontend Routes

| Path | Component | Access |
|---|---|---|
| `/` | `Home` | Public |
| `/login` | `Login` | Public |
| `/register` | `Register` | Public |
| `/apply/public/:token` | `PublicApplyJob` | Public |
| `/assessments/take/:token` | `CandidateAssessmentPage` | Public (token-gated) |
| `/hr-dashboard` | `HRDashboard` | HR role only |
| `/admin-dashboard` | `AdminDashboard` | Admin only |
| `/force-password-change` | `ForcePasswordChange` | HR / Admin with `must_change_password` |

Legacy paths (`/my-jobs`, `/add-job`, `/hr-applications`, `/profile`, `/edit-profile`) redirect to the appropriate dashboard tab.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | `development-only-secret-key` | Django secret key — **must be changed in production** |
| `DJANGO_DEBUG` | `True` | Enable debug mode |
| `DJANGO_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated allowed hosts |
| `GEMINI_API_KEY` | — | **Required** — Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Gemini model name |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed CORS origins |
| `BREVO_API_KEY` | — | Brevo API key for email sending |
| `BREVO_API_BASE_URL` | `https://api.brevo.com/v3` | Brevo API base URL |
| `BREVO_SENDER_EMAIL` | `no-reply@screenai.com` | Verified Brevo sender email |
| `BREVO_SENDER_NAME` | `ScreenAI` | Sender display name |
| `BREVO_WEBHOOK_SECRET` | — | Secret to authenticate Brevo webhook requests |
| `BREVO_REQUEST_TIMEOUT_SECONDS` | `10` | Brevo API request timeout |
| `ASSESSMENT_FRONTEND_URL` | `http://localhost:5173/assessments` | Base URL for assessment links in emails |
| `MAX_INVITATION_LIFETIME_DAYS` | `30` | Token validity window in days |
| `ASSESSMENT_INVITATIONS_ENABLED` | `False` | Set `True` to enable live email delivery |
| `MAX_NOTEBOOK_UPLOAD_SIZE` | `2097152` (2 MB) | Max notebook file size in bytes |
| `PRIVATE_ASSESSMENT_ROOT` | `backend/private_assessments` | Filesystem path for private notebook storage |
| `ASSESSMENT_TOKEN_HMAC_KEY` | _(SECRET_KEY)_ | HMAC key for assessment tokens |
| `EVALUATOR_DOCKER_IMAGE` | `python:3.11-slim` | Docker image for code execution |
| `EVALUATOR_TIMEOUT_SECONDS` | `30` | Per-submission execution timeout |
| `EVALUATOR_MEMORY_MB` | `256` | Container memory limit |
| `EVALUATOR_CPU_LIMIT` | `1.0` | Container CPU limit |
| `EVALUATOR_MAX_OUTPUT_BYTES` | `51200` (50 KB) | Max allowed stdout/stderr |
| `EVALUATOR_STALE_TIMEOUT_SECONDS` | `300` | Stale evaluation cleanup timeout |
| `EVALUATOR_MAX_RETRIES` | `3` | Max evaluation retry attempts |
| `EVALUATOR_POLL_INTERVAL_SECONDS` | `10` | Evaluation polling interval |
| `TRUST_PROXY_HEADERS` | `False` | Trust `X-Forwarded-For` headers |
| `THROTTLE_RATE_PUBLIC_APP_SUBMIT` | `10/minute` | Rate limit for public application submissions |
| `ALLOW_DUPLICATE_APPLICATIONS_FOR_TESTING` | `True` | Allow duplicate applications (dev only) |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000/api` | Backend API base URL |
| `VITE_ASSESSMENT_INVITATIONS_ENABLED` | `true` | Show/hide Send/Resend buttons in HR UI |

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (required for code evaluation in Stage 5)
- A Google Gemini API key

### 1. Clone the repository

```bash
git clone <repo-url>
cd ScreenAI
```

### 2. Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux
# Edit .env and set GEMINI_API_KEY (required)

# Run migrations
python manage.py migrate

# Create a superuser (admin account)
python manage.py createsuperuser

# Start the dev server
python manage.py runserver
```

Backend runs at: `http://127.0.0.1:8000`

Django Admin UI: `http://127.0.0.1:8000/admin/`

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux

# Start the dev server
npm run dev
```

Frontend runs at: `http://localhost:5173`

### 4. Pull Docker image (for code evaluation)

```bash
docker pull python:3.11-slim
```

---

## Seed Data

Two seed scripts are provided to populate the database with demo data.

**Seed HR users, jobs, and applications:**

```bash
cd backend
python seed_data.py
```

Creates two HR recruiters (`alice_recruiter`, `bob_recruiter`), several job postings, and sample applications.

> **Warning:** `seed_data.py` deletes all existing non-superuser accounts, jobs, and applications before seeding.

**Seed assessment templates and structured questions:**

```bash
cd backend
python seed_structured_questions.py
```

Creates demo assessment templates with coding questions, per-language starter code, and test cases.

---

## Security Design

| Concern | Implementation |
|---|---|
| **JWT Token Versioning** | Each user has a `token_version` in `UserSecurityState`. The version is embedded in the JWT. Changing the password increments the version, immediately invalidating all previously issued tokens. |
| **Force Password Change** | HR accounts created by admin have `must_change_password = True`. The custom JWT authenticator blocks all endpoints except `change-password` and `security-status` until the password is changed. |
| **Assessment Token Security** | Raw assessment tokens are never stored in the database — only HMAC-SHA256 digests. Token verification uses `hmac.compare_digest` (constant-time comparison). In `DEBUG` mode, the raw token is stored in `dev_raw_token` for development convenience. |
| **Immutable Snapshots** | `assessment_snapshot` and `private_grading_snapshot` are captured at assignment time. Editing the template later does not change what the candidate receives or what is graded against. |
| **Private File Storage** | Submitted notebooks are stored outside the Django `media/` root using a custom `PrivateAssessmentFileSystemStorage`, making them inaccessible via HTTP. |
| **Docker Sandbox** | All candidate code runs inside a Docker container with CPU, memory, time, and output limits. The test harness serializes hidden tests as base64 to prevent code injection via test case content. |
| **Rate Limiting** | Public application submissions are rate-limited via DRF `ScopedRateThrottle` (default: 10/minute per IP). |
| **CORS** | Configured to allow only the explicitly listed frontend origins. |
| **Audit Log** | `AuditLog` records are append-only at the model level — `save()` on an existing record raises `PermissionError`, and `delete()` is blocked unconditionally. |
| **Brevo Webhook Authentication** | Incoming webhook requests are verified against `BREVO_WEBHOOK_SECRET`. |
