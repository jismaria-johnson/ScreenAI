import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="container py-5">
      <div className="text-center mb-5 py-4 rounded-4 px-3" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
        <h1 className="fw-bold display-4 mb-3" style={{ color: "var(--screenai-primary)" }}>ScreenAI</h1>

        <p className="lead fw-normal mb-4" style={{ color: "var(--screenai-text-secondary)" }}>
          AI-powered resume screening and recruitment management.
        </p>

        <p className="mx-auto mb-4" style={{ maxWidth: "700px", color: "var(--screenai-text-secondary)" }}>
          A unified workspace for recruitment management. HR recruiters can publish job listings and generate secure, public application links. System administrators can monitor recruiters' accounts, jobs, hiring metrics, and candidate progression pipelines.
        </p>

        <div className="d-flex justify-content-center gap-3 mt-4">
          <Link to="/login" className="btn btn-primary btn-lg px-4 fw-semibold shadow-sm">
            Login
          </Link>
        </div>
      </div>

      <div className="row g-4 mt-4">
        {/* For Recruiters */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 p-4 rounded-3 text-center transition-all" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
            <div className="fs-1 mb-3" style={{ color: "var(--screenai-primary)" }}>💼</div>
            <h5 className="fw-bold text-white">For Recruiters</h5>
            <p className="small mb-0 mt-2" style={{ color: "var(--screenai-text-secondary)" }}>
              Log in to manage jobs and candidates. Recruiter accounts are provisioned exclusively by system administrators.
            </p>
          </div>
        </div>

        {/* For Candidates */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 p-4 rounded-3 text-center transition-all" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
            <div className="fs-1 mb-3" style={{ color: "var(--screenai-success)" }}>📄</div>
            <h5 className="fw-bold text-white">For Candidates</h5>
            <p className="small mb-0 mt-2" style={{ color: "var(--screenai-text-secondary)" }}>
              Apply to jobs without registering or creating an account. Simply use the public application link provided by recruiters to upload your resume.
            </p>
          </div>
        </div>

        {/* For Administrators */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 p-4 rounded-3 text-center transition-all" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
            <div className="fs-1 mb-3" style={{ color: "var(--screenai-warning)" }}>🛠️</div>
            <h5 className="fw-bold text-white">For Administrators</h5>
            <p className="small mb-0 mt-2" style={{ color: "var(--screenai-text-secondary)" }}>
              Manage recruiter accounts, track job postings, monitor candidate hiring status, and coordinate candidate progression updates.
            </p>
          </div>
        </div>

        {/* AI-Powered Screening */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 p-4 rounded-3 text-center transition-all" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
            <div className="fs-1 mb-3" style={{ color: "var(--screenai-info)" }}>⚡</div>
            <h5 className="fw-bold text-white">AI-Powered Screening</h5>
            <p className="small mb-0 mt-2" style={{ color: "var(--screenai-text-secondary)" }}>
              Leverage Gemini AI to automatically parse uploaded PDF resumes, calculate compatibility scores, and extract skills and work history.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;