# ScreenAI

ScreenAI is an AI-powered resume screening and HR shortlisting system built using React, Django REST Framework, and Gemini AI.

The platform allows candidates to register, view jobs, apply by uploading a resume, and track their application status. HR users can create jobs, review applications, view resumes, filter candidates, and make shortlist or reject decisions.

The system extracts text from uploaded PDF resumes and compares the resume with job requirements using Gemini AI.

## Features

### Candidate Features

* Candidate registration and JWT login
* Role-based navigation
* View available jobs
* Apply for jobs by uploading a PDF resume
* Prevent duplicate applications for the same job
* View application status
* Candidate dashboard with summary cards
* View and edit profile details

### HR Features

* HR registration and JWT login
* Add job postings
* View posted jobs
* View candidate applications
* View or download candidate resumes
* Filter applications by job
* Filter applications by minimum AI score
* Filter by AI recommendation
* Filter by HR application status
* Shortlist, reject, or mark applications as pending
* HR dashboard with job and application summary cards
* View and edit profile details

### AI Features

* Extract text from PDF resumes using pdfplumber
* Compare resume content with job requirements
* Generate an AI score from 0 to 100
* Identify matched skills
* Identify missing skills
* Evaluate experience match
* Generate HR-focused feedback
* Generate AI recommendation as shortlist, review, or reject

## Tech Stack

### Frontend

* React.js
* JavaScript
* Bootstrap
* React Router
* Axios
* Vite

### Backend

* Python
* Django
* Django REST Framework
* Simple JWT
* SQLite

### AI and Resume Processing

* Gemini API
* pdfplumber

### Development Tools

* Git
* GitHub
* VS Code
* Node.js
* npm
* Python virtual environment

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

### Authentication Module

The system supports Candidate and HR registration with JWT-based authentication and role-based access.

### Profile Module

Candidates and HR users can view and update their profile information, including:

* First name
* Last name
* Email
* Phone
* Education
* Skills
* Experience

### Job Module

HR users can add job postings containing:

* Job title
* Company name
* Job description
* Required skills
* Required experience
* Location
* Job status

### Application Module

Candidates can apply for jobs by uploading a PDF resume. Each application is linked to a candidate and a job.

### Resume Processing Module

The uploaded PDF is processed using pdfplumber to extract resume text.

### AI Screening Module

Gemini AI compares the resume with the selected job requirements and generates:

* AI score
* Matched skills
* Missing skills
* Experience match
* AI feedback
* AI recommendation

The AI recommendation supports HR decision-making, while the final application status is controlled by HR.

### HR Filtering Module

HR can filter applications using:

* Job
* Minimum AI score
* AI recommendation
* Application status

HR can then shortlist, reject, or return an application to pending status.

## API Endpoints

### Authentication and Profile

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

## How to Run the Project

### Backend Setup

Go to the backend folder:

```powershell
cd backend
```

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it in PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create a `.env` file inside the backend folder:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Run migrations:

```powershell
python manage.py makemigrations
python manage.py migrate
```

Start the backend server:

```powershell
python manage.py runserver
```

Backend URL:

```text
http://127.0.0.1:8000/
```

### Frontend Setup

Open another terminal and go to the frontend folder:

```powershell
cd frontend
```

Install dependencies:

```powershell
npm install
```

Start the frontend development server:

```powershell
npm run dev
```

Frontend URL:

```text
http://localhost:5173/
```

## Environment Variables

The project uses a backend `.env` file to store the Gemini API key.

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

The `.env` file is ignored by Git and should never be pushed to GitHub.

## Application Flow

### Candidate Flow

```text
Register
→ Login
→ View Jobs
→ Select Job
→ Upload Resume
→ AI Screening
→ View Application Status
```

### HR Flow

```text
Register
→ Login
→ Add Job
→ View Applications
→ Review AI Results
→ Filter Candidates
→ Shortlist or Reject
```

## Completed Git Progress

```text
Commit 1: Initial project setup
Commit 2: Configure Django REST Framework backend
Commit 3: Add authentication and role-based login
Commit 4: Add job posting APIs and frontend pages
Commit 5: Add candidate job application flow
Commit 6: Add resume text extraction and AI scoring
Commit 7: Add HR filtering and shortlisting
Commit 8: Improve dashboard UI, profile management, and documentation
```

## Future Improvements

* Edit job postings
* Delete job postings
* Close job openings
* Create a dedicated My Jobs page
* Show applicant count for each job
* Allow pending candidates to replace resumes
* Recalculate AI score when a resume is replaced
* Add email notifications for shortlisted candidates
* Add better validation and error handling
* Add protected routes
* Deploy frontend and backend

## Project Purpose

ScreenAI demonstrates how AI can assist HR teams during the initial resume screening process.

The system does not replace HR decision-making. AI provides screening support, while HR makes the final shortlist or rejection decision.
