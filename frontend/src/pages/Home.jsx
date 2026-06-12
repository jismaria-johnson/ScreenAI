import { Link, Navigate } from "react-router-dom";

function Home() {
  const token = localStorage.getItem("access");
  const role = localStorage.getItem("role");

  if (token && role === "candidate") {
    return <Navigate to="/candidate-dashboard" replace />;
  }

  if (token && role === "hr") {
    return <Navigate to="/hr-dashboard" replace />;
  }

  return (
    <div className="container py-5">
      <div className="text-center">
        <h1 className="fw-bold mb-3">ScreenAI</h1>

        <p className="lead">
          AI-powered resume screening and HR shortlisting system.
        </p>

        <p className="text-muted">
          Candidates can apply for jobs by uploading resumes. HR users can post
          jobs, review applications, and use AI-assisted resume screening.
        </p>

        <div className="mt-4">
          <Link to="/register" className="btn btn-primary me-3">
            Get Started
          </Link>

          <Link to="/login" className="btn btn-outline-primary me-3">
            Login
          </Link>

          <Link to="/jobs" className="btn btn-outline-dark">
            View Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;