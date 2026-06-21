# ScreenAI

ScreenAI is an AI-assisted recruitment screening platform that helps HR teams publish jobs, collect public candidate applications, analyze resumes, manage interviews, and track hiring progress through HR and Admin dashboards.

## Key Features

* **Admin-Created Recruiter Accounts:** No public self-registration for HR; recruiters are provisioned exclusively by administrators.
* **HR Job Creation & Management:** Create, edit, close, and manage active jobs.
* **UUID-Based Public Application Links:** Generate secure, unique links for each job listing.
* **Public Candidate Application Form:** Simple form allowing candidates to apply directly to open listings.
* **PDF Resume Upload & Validation:** Secure document processing with strict file type (PDF) and size (under 5 MB) checks.
* **AI Resume Scoring & Recommendation:** Auto-parse resumes using Gemini to extract skills, experience years, and provide a compatibility score.
* **Candidate Filtering & Review:** Rich filtering options for recruiters based on AI score, experience, or matched skills.
* **Shortlist/Reject/Hire Workflow:** Streamlined stages to progress candidate applications.
* **Interview Scheduling & Tracking:** Recruiter workspace to manage scheduling, updates, and candidate rounds.
* **Post-Hire Progression Tracking:** Governance overview to track hired candidates' onboarding/progression pipeline.
* **Admin Recruiter Governance:** Administration panel to monitor recruiters' active jobs, metrics, and manage credentials.
* **Recruiter Suspension/Reactivation:** Admins can suspend or reactivate recruiter accounts on the fly.
* **Recruiter Credential Reset:** Safe mechanism to reset password credentials for HR staff.
* **Audit & Activity Tracking:** Recruiter analytics overview dashboard.
* **Responsive Dark UI:** Sleek, modern dashboard utilizing CSS variables and unified surface levels.

## Tech Stack

* **Frontend:** React, JavaScript (ES6+), Vite, Vanilla CSS (Custom tokens), Bootstrap 5, React Router, Axios.
* **Backend:** Python 3, Django, Django REST Framework, Django Simple JWT (Token Auth), django-cors-headers, SQLite.
* **AI & Document Processing:** Gemini API (`google.generativeai`), `pdfplumber`.

## User Roles

### 1. Admin
* Provisions and manages HR recruiter accounts.
* Suspends or reactivates recruiter profiles.
* Resets HR recruiter passwords.
* Views platform-wide performance analytics and placed candidate progression pipelines.

### 2. HR Recruiter
* Creates and publishes job postings.
* Shares unique application links with prospective candidates.
* Reviews candidates, reads AI-generated summaries, and filters applications.
* Schedules interview rounds, records feedback, and updates hiring statuses.

### 3. Candidate
* Accesses public application pages via job-specific UUID links.
* Submits details and uploads a PDF resume without registering an account.

## Main Workflows

### Candidate Flow
```text
Access secure public job link
→ Complete applicant form details
→ Upload PDF resume
→ Auto-triggers backend AI parsing and scoring
```

### HR Flow
```text
Admin creates recruiter credentials
→ Recruiter logs in via JWT
→ Publishes job listing & generates public token link
→ Reviews applicants using AI score and feedback
→ Schedules interview rounds & manages candidate status
```

### Admin Flow
```text
Admin login
→ Manage recruiter list (create, suspend, reset password)
→ Track placed candidates' progression logs
→ Review general platform analytics (jobs, applicants, hires)
```

## Security Highlights

* **JWT Authentication:** Stateful session authentication using secure access/refresh JSON Web Tokens.
* **Role-Based Access Control (RBAC):** Strict view/endpoint constraints between HR and Admin capabilities.
* **Admin-Only Recruiter Provisioning:** Excludes any self-signup routes for recruiter accounts.
* **Suspended Account Blocking:** Instantly blocks login attempts for suspended recruiters.
* **UUID Public Links:** Protects application pages from URL enumeration attacks.
* **PDF-Only Resume Validation:** Enforces strict mime-type verification.
* **Public Application Throttling:** Rate limiting to protect endpoints from automated abuse.
* **Transaction-Safe Actions:** Ensures database integrity when hiring or updating models.
* **Credential Safety:** Temporary passwords are not exposed or logged after creation/reset.
* **Excluded Configuration Secrets:** Excludes all environment secrets and local database copies.

## Project Structure

```text
ScreenAI/
├── backend/
│   ├── accounts/          # Authentication & recruiter provisioning
│   ├── jobs/              # Job posting & management models/views
│   ├── applications/      # Applications, scheduling, & progression logs
│   ├── ai_engine/         # Gemini parsing & scoring logic
│   ├── screenai/          # Core Django project settings
│   └── requirements.txt   # Backend dependencies list
│
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios interceptors & configs
│   │   ├── components/    # Reusable widgets (Navbar, Toast, etc.)
│   │   ├── pages/         # Dashboard panels & public form pages
│   │   ├── utils/         # Authentication storage helpers
│   │   ├── App.jsx        # Routing & layout configuration
│   │   └── index.css      # Core styles & dark design tokens
│   ├── package.json       # Frontend package configuration
│   └── vite.config.js     # Vite compiler configuration
│
└── README.md
```

## Setup Instructions

### Environment Variables

#### Backend (`backend/.env`)
The Django backend requires a `.env` file inside the `backend/` directory. Create this file locally and define the following variables:

```env
# Local Development
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
DJANGO_SECRET_KEY=generate_a_secure_django_secret_key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Production Example
# GEMINI_API_KEY=your_production_gemini_key
# GEMINI_MODEL=gemini-2.5-flash-lite
# DJANGO_SECRET_KEY=secure-production-only-key
# DJANGO_DEBUG=False
# DJANGO_ALLOWED_HOSTS=api.screenai.com
# CORS_ALLOWED_ORIGINS=https://screenai.com
```

#### Frontend (`frontend/.env`)
The React frontend loads environment variables starting with `VITE_` during build time. Copy the provided `frontend/.env.example` to `frontend/.env` to configure your environment variables:

```env
# Local Development Fallback
VITE_API_BASE_URL=http://127.0.0.1:8000/api

# Production Example
# VITE_API_BASE_URL=https://api.screenai.com/api
```

> [!IMPORTANT]
> **Vite Build-time Environments**: Vite injects environment variables statically into the production bundle during compilation. Therefore, `VITE_API_BASE_URL` must be configured in `frontend/.env` (or via system environment variables) **before** executing the production frontend build (`npm run build`).

> [!WARNING]
> Never commit any `.env` file or SQLite database (`db.sqlite3`) to git.

### Running Backend

1. Navigate to the `backend/` folder:
   ```powershell
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Run migrations:
   ```powershell
   python manage.py migrate
   ```
5. Create an Admin superuser account:
   ```powershell
   python manage.py createsuperuser
   ```
6. Run Django validation checks:
   ```powershell
   python manage.py check
   ```
7. Launch the development server:
   ```powershell
   python manage.py runserver
   ```

### Running Frontend

1. Navigate to the `frontend/` folder:
   ```powershell
   cd frontend
   ```
2. Install Node packages:
   ```powershell
   npm install
   ```
3. Start the Vite server:
   ```powershell
   npm run dev
   ```

## Testing

### Backend tests
Run Django tests locally to verify serializers, view logic, and endpoints:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python manage.py test
```

### Frontend tests
Verify code styling and build compatibility:
```powershell
cd frontend
npm run lint
npm run build
```

## Git Branch Note
All development, visual polishing, and recruitment flow fixes are implemented on the `public-application-flow` branch.

## Future Improvements

* Dynamic public application forms generated/configured by HR.
* Email notifications for scheduled interview rounds.
* Support for application withdrawal.
* Resume replacement and scoring recalculations.
* List pagination for tables with large candidate datasets.
* Background task queues for AI scoring.
* Cloud media storage integration.
* Transition to production PostgreSQL databases.