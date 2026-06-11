# ScreenAI

ScreenAI is an AI-powered resume screening and HR shortlisting system using React, Django REST Framework, and Gemini API.

## Features

* Candidate registration and login
* HR login
* HR can add job descriptions
* Candidates can submit details and upload resumes
* AI evaluates resumes against job descriptions
* Generates match score, matched skills, missing skills, feedback, and recommendation
* HR can filter and shortlist candidates

## Tech Stack

Frontend/UI: React.js, JavaScript, HTML, CSS, Bootstrap
Backend: Python, Django, Django REST Framework
Database: SQLite
AI / LLM Integration: Gemini API
Resume Parsing: pdfplumber
Authentication: JWT authentication with Candidate and HR role-based access
File Handling: Django media storage for resume uploads
API Communication: REST APIs using Axios
Development Tools: Git, GitHub, VS Code, Node.js, npm, Python virtual environment

## Project Structure

ScreenAI/

* backend/ - Django REST Framework backend
* frontend/ - React frontend
* README.md
* .gitignore

## Git Commit Plan

1. Initial commit — project setup with React and Django REST Framework
2. Add authentication and role-based login
3. Add job posting APIs and frontend pages
4. Add candidate profile and job application flow
5. Add resume upload and text extraction
6. Integrate Gemini AI scoring
7. Add HR dashboard and candidate filtering
8. Add shortlist/reject functionality
9. Improve UI and README
10. Final cleanup and testing

## Current Status

Initial project setup is completed with React frontend and Django backend structure.
