import { Link } from "react-router-dom";

function CandidateDashboard() {
  return (
    <div className="container py-5">
      <h2>Candidate Dashboard</h2>
      <p>Welcome candidate. You can view jobs and apply with your resume.</p>

      <Link to="/jobs" className="btn btn-primary me-3">
        View Jobs
      </Link>

      <Link to="/my-applications" className="btn btn-outline-primary">
        My Applications
      </Link>
    </div>
  );
}

export default CandidateDashboard;