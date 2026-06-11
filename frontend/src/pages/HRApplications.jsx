import { useEffect, useState } from "react";
import API from "../api/axiosConfig";

function HRApplications() {
  const [applications, setApplications] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [filters, setFilters] = useState({
    job: "",
    min_score: "",
    recommendation: "",
    status: "",
  });

  useEffect(() => {
    fetchJobs();
    fetchApplications();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await API.get("/jobs/");
      setJobs(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const fetchApplications = async () => {
    try {
      const params = {};

      if (filters.job) {
        params.job = filters.job;
      }

      if (filters.min_score) {
        params.min_score = filters.min_score;
      }

      if (filters.recommendation) {
        params.recommendation = filters.recommendation;
      }

      if (filters.status) {
        params.status = filters.status;
      }

      const response = await API.get("/applications/hr/", { params });
      setApplications(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value,
    });
  };

  const handleApplyFilters = () => {
    fetchApplications();
  };

  const handleClearFilters = () => {
    setFilters({
      job: "",
      min_score: "",
      recommendation: "",
      status: "",
    });

    setTimeout(() => {
      fetchApplications();
    }, 0);
  };

  const updateStatus = async (applicationId, newStatus) => {
    try {
      await API.patch(`/applications/${applicationId}/status/`, {
        application_status: newStatus,
      });

      fetchApplications();
    } catch (error) {
      console.log(error);
      alert("Failed to update application status.");
    }
  };

  const getResumeUrl = (resumePath) => {
    if (!resumePath) {
      return "#";
    }

    if (resumePath.startsWith("http")) {
      return resumePath;
    }

    return `http://127.0.0.1:8000${resumePath}`;
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Candidate Applications</h2>

      <div className="card p-3 mb-4 shadow-sm">
        <h5 className="mb-3">Filters</h5>

        <div className="row">
          <div className="col-md-3 mb-3">
            <label>Job</label>
            <select
              name="job"
              className="form-control"
              value={filters.job}
              onChange={handleFilterChange}
            >
              <option value="">All Jobs</option>

              {jobs.map((job) => (
                <option value={job.id} key={job.id}>
                  {job.job_title}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-3 mb-3">
            <label>Minimum AI Score</label>
            <input
              type="number"
              name="min_score"
              className="form-control"
              value={filters.min_score}
              onChange={handleFilterChange}
              placeholder="Eg: 80"
            />
          </div>

          <div className="col-md-3 mb-3">
            <label>Recommendation</label>
            <select
              name="recommendation"
              className="form-control"
              value={filters.recommendation}
              onChange={handleFilterChange}
            >
              <option value="">All</option>
              <option value="shortlist">Shortlist</option>
              <option value="review">Review</option>
              <option value="reject">Reject</option>
            </select>
          </div>

          <div className="col-md-3 mb-3">
            <label>Status</label>
            <select
              name="status"
              className="form-control"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div>
          <button className="btn btn-primary me-2" onClick={handleApplyFilters}>
            Apply Filters
          </button>

          <button className="btn btn-outline-secondary" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {applications.length === 0 ? (
        <p>No applications found.</p>
      ) : (
        <div className="row">
          {applications.map((application) => {
            const resumeUrl = getResumeUrl(application.resume);

            return (
              <div className="col-md-6 mb-3" key={application.id}>
                <div className="card shadow-sm p-3">
                  <h5>{application.candidate_username}</h5>

                  <p>
                    <strong>Job:</strong> {application.job_title}
                  </p>

                  <p>
                    <strong>Company:</strong> {application.company_name}
                  </p>

                  <p>
                    <strong>Status:</strong> {application.application_status}
                  </p>

                  <p>
                    <strong>AI Score:</strong>{" "}
                    {application.ai_score ?? "Not evaluated yet"}
                  </p>

                  <p>
                    <strong>Recommendation:</strong>{" "}
                    {application.recommendation}
                  </p>

                  <p>
                    <strong>Matched Skills:</strong>{" "}
                    {application.matched_skills || "None"}
                  </p>

                  <p>
                    <strong>Missing Skills:</strong>{" "}
                    {application.missing_skills || "None"}
                  </p>

                  <p>
                    <strong>Experience Match:</strong>{" "}
                    {application.experience_match || "None"}
                  </p>

                  <p>
                    <strong>AI Feedback:</strong>{" "}
                    {application.ai_feedback || "Not evaluated yet"}
                  </p>

                  <div className="d-flex gap-2 mb-3">
                    <a
                      href={resumeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-primary btn-sm"
                    >
                      View Resume
                    </a>

                    <a
                      href={resumeUrl}
                      download
                      className="btn btn-outline-dark btn-sm"
                    >
                      Download Resume
                    </a>
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => updateStatus(application.id, "shortlisted")}
                      disabled={application.application_status === "shortlisted"}
                    >
                      Shortlist
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => updateStatus(application.id, "rejected")}
                      disabled={application.application_status === "rejected"}
                    >
                      Reject
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateStatus(application.id, "pending")}
                      disabled={application.application_status === "pending"}
                    >
                      Mark Pending
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HRApplications;