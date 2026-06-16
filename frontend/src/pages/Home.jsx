import { Link, Navigate } from "react-router-dom";

function Home() {
  const token = localStorage.getItem("access");
  const role = localStorage.getItem("role");

  if (token) {
    if (role === "hr") {
      return <Navigate to="/hr-dashboard" replace />;
    } else if (role === "admin") {
      return <Navigate to="/admin-dashboard" replace />;
    }
  }

  return (
    <div className="container py-5">
      <div className="text-center mb-5 py-4 bg-light rounded-4 shadow-sm px-3">
        <h1 className="fw-bold display-4 mb-3 text-primary">ScreenAI</h1>

        <p className="lead fw-normal text-secondary mb-4">
          AI-powered resume screening and recruitment management.
        </p>

        <p className="text-muted mx-auto mb-4" style={{ maxWidth: "700px" }}>
          A unified workspace for recruitment management. HR recruiters can publish job listings and generate secure, public application links. System administrators can monitor recruiters' accounts, jobs, hiring metrics, and candidate progression pipelines.
        </p>

        <div className="d-flex justify-content-center gap-3 mt-4">
          <Link to="/register" className="btn btn-primary btn-lg px-4 fw-semibold shadow-sm">
            Register
          </Link>

          <Link to="/login" className="btn btn-outline-primary btn-lg px-4 fw-semibold">
            Login
          </Link>
        </div>
      </div>

      <div className="row g-4 mt-4">
        {/* For Recruiters */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 border-0 shadow-sm p-4 rounded-3 text-center transition-all hover-shadow">
            <div className="fs-1 text-primary mb-3">💼</div>
            <h5 className="fw-bold">For Recruiters</h5>
            <p className="text-muted small mb-0 mt-2">
              Register an account, create job listings, and generate shareable public links to collect candidate applications directly.
            </p>
          </div>
        </div>

        {/* For Candidates */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 border-0 shadow-sm p-4 rounded-3 text-center transition-all hover-shadow">
            <div className="fs-1 text-success mb-3">📄</div>
            <h5 className="fw-bold">For Candidates</h5>
            <p className="text-muted small mb-0 mt-2">
              Apply to jobs without registering or creating an account. Simply use the public application link provided by recruiters to upload your resume.
            </p>
          </div>
        </div>

        {/* For Administrators */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 border-0 shadow-sm p-4 rounded-3 text-center transition-all hover-shadow">
            <div className="fs-1 text-warning mb-3">🛠️</div>
            <h5 className="fw-bold">For Administrators</h5>
            <p className="text-muted small mb-0 mt-2">
              Manage recruiter accounts, track job postings, monitor candidate hiring status, and coordinate candidate progression updates.
            </p>
          </div>
        </div>

        {/* AI-Powered Screening */}
        <div className="col-md-6 col-lg-3">
          <div className="card h-100 border-0 shadow-sm p-4 rounded-3 text-center transition-all hover-shadow">
            <div className="fs-1 text-info mb-3">⚡</div>
            <h5 className="fw-bold">AI-Powered Screening</h5>
            <p className="text-muted small mb-0 mt-2">
              Leverage Gemini AI to automatically parse uploaded PDF resumes, calculate compatibility scores, and extract skills and work history.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;