import { Link, Navigate } from "react-router-dom";

function Home() {
  const token = localStorage.getItem("access");
  const role = localStorage.getItem("role");

  if (token && role === "hr") {
    return <Navigate to="/hr-dashboard" replace />;
  }

  return (
    <div className="container py-5">
      <div className="text-center mb-5">
        <h1 className="fw-bold mb-3">ScreenAI</h1>

        <p className="lead mb-4">
          AI-powered resume screening for HR teams.
        </p>

        <p className="text-muted mb-4">
          Post jobs, share public application links with candidates, and let AI
          assist with resume screening.
        </p>

        <div className="mt-4">
          <Link to="/register" className="btn btn-primary me-3">
            HR Sign Up
          </Link>

          <Link to="/login" className="btn btn-outline-primary">
            HR Login
          </Link>
        </div>
      </div>

      <hr className="my-5" />

      <div className="row mt-5">
        <div className="col-md-4 mb-4 text-center">
          <h5>For HR Users</h5>
          <p className="text-muted">
            Create jobs and generate public application links to share with
            candidates.
          </p>
        </div>

        <div className="col-md-4 mb-4 text-center">
          <h5>For Candidates</h5>
          <p className="text-muted">
            Open a shared application link and submit your resume for quick AI
            screening.
          </p>
        </div>

        <div className="col-md-4 mb-4 text-center">
          <h5>AI-Powered</h5>
          <p className="text-muted">
            Resume screening with AI analysis helps HR teams find the best
            matches.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Home;