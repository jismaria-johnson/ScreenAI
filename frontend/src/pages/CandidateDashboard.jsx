import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import API from "../api/axiosConfig";

function CandidateDashboard() {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [profileResponse, applicationsResponse] =
        await Promise.all([
          API.get("/accounts/profile/"),
          API.get("/applications/my/"),
        ]);

      setProfile(profileResponse.data);
      setApplications(applicationsResponse.data);
    } catch (error) {
      console.log(
        "Failed to fetch candidate dashboard data:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const totalApplications = applications.length;

  const pendingApplications = applications.filter(
    (application) =>
      application.application_status === "pending"
  ).length;

  const shortlistedApplications = applications.filter(
    (application) =>
      application.application_status === "shortlisted"
  ).length;

  const rejectedApplications = applications.filter(
    (application) =>
      application.application_status === "rejected"
  ).length;

  const displayName =
    profile?.first_name?.trim() ||
    profile?.username ||
    "Candidate";

  return (
    <div className="container py-5">
      <h2 className="mb-2">
        Welcome, {displayName}
      </h2>

      <p className="text-muted mb-4">
        View available jobs and track your submitted applications.
      </p>

      {loading ? (
        <p>Loading dashboard...</p>
      ) : (
        <div className="row mb-4">
          <div className="col-md-3 mb-3">
            <div className="card shadow-sm p-4 text-center h-100">
              <h3 className="fw-bold">
                {totalApplications}
              </h3>
              <p className="mb-0">
                Total Applications
              </p>
            </div>
          </div>

          <div className="col-md-3 mb-3">
            <div className="card shadow-sm p-4 text-center h-100">
              <h3 className="fw-bold">
                {pendingApplications}
              </h3>
              <p className="mb-0">Pending</p>
            </div>
          </div>

          <div className="col-md-3 mb-3">
            <div className="card shadow-sm p-4 text-center h-100">
              <h3 className="fw-bold">
                {shortlistedApplications}
              </h3>
              <p className="mb-0">Shortlisted</p>
            </div>
          </div>

          <div className="col-md-3 mb-3">
            <div className="card shadow-sm p-4 text-center h-100">
              <h3 className="fw-bold">
                {rejectedApplications}
              </h3>
              <p className="mb-0">Rejected</p>
            </div>
          </div>
        </div>
      )}

      <div className="d-flex gap-3 flex-wrap">
        <Link to="/jobs" className="btn btn-primary">
          View Jobs
        </Link>

        <Link
          to="/my-applications"
          className="btn btn-outline-primary"
        >
          My Applications
        </Link>

        <Link
          to="/profile"
          className="btn btn-outline-dark"
        >
          View Profile
        </Link>
      </div>
    </div>
  );
}

export default CandidateDashboard;