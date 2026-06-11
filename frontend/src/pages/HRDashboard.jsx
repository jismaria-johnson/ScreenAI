import { Link } from "react-router-dom";

function HRDashboard() {
  return (
    <div className="container py-5">
      <h2>HR Dashboard</h2>
      <p>Welcome HR. You can add job openings and view applications.</p>

      <Link to="/add-job" className="btn btn-primary me-3">
        Add Job
      </Link>

      <Link to="/jobs" className="btn btn-outline-primary me-3">
        View My Jobs
      </Link>

      <Link to="/hr-applications" className="btn btn-outline-dark">
        View Applications
      </Link>
    </div>
  );
}

export default HRDashboard;