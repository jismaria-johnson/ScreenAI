import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import API from "../api/axiosConfig";

function HRApplications() {
  const [searchParams, setSearchParams] = useSearchParams();

  const jobFromUrl = searchParams.get("job") || "";

  const [applications, setApplications] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    job: jobFromUrl,
    min_score: "",
    recommendation: "",
    status: "",
  });

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const updatedFilters = {
      job: jobFromUrl,
      min_score: "",
      recommendation: "",
      status: "",
    };

    setFilters(updatedFilters);
    fetchApplications(updatedFilters);
  }, [jobFromUrl]);

  const fetchJobs = async () => {
    try {
      const response = await API.get("/jobs/");
      setJobs(response.data);
    } catch (error) {
      console.log("Failed to fetch jobs:", error);
    }
  };

  const fetchApplications = async (selectedFilters = filters) => {
    setLoading(true);

    try {
      const params = {};

      if (selectedFilters.job) {
        params.job = selectedFilters.job;
      }

      if (selectedFilters.min_score) {
        params.min_score = selectedFilters.min_score;
      }

      if (selectedFilters.recommendation) {
        params.recommendation = selectedFilters.recommendation;
      }

      if (selectedFilters.status) {
        params.status = selectedFilters.status;
      }

      const response = await API.get("/applications/hr/", {
        params,
      });

      setApplications(response.data);
    } catch (error) {
      console.log("Failed to fetch HR applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (event) => {
    setFilters({
      ...filters,
      [event.target.name]: event.target.value,
    });
  };

  const handleApplyFilters = () => {
    const updatedParams = {};

    if (filters.job) {
      updatedParams.job = filters.job;
    }

    setSearchParams(updatedParams);
    fetchApplications(filters);
  };

  const handleClearFilters = () => {
    const emptyFilters = {
      job: "",
      min_score: "",
      recommendation: "",
      status: "",
    };

    setFilters(emptyFilters);
    setSearchParams({});
    fetchApplications(emptyFilters);
  };

  const updateStatus = async (applicationId, newStatus) => {
    try {
      await API.patch(`/applications/${applicationId}/status/`, {
        application_status: newStatus,
      });

      fetchApplications(filters);
    } catch (error) {
      console.log("Failed to update application status:", error);
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

  const formatText = (value) => {
    return value && value.trim() ? value : "None";
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Candidate Applications</h2>

      <div className="card p-4 mb-4 shadow-sm">
        <h5 className="mb-3">Filter Applications</h5>

        <div className="row">
          <div className="col-md-3 mb-3">
            <label className="form-label">Job</label>

            <select
              name="job"
              className="form-select"
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
            <label className="form-label">Minimum AI Score</label>

            <input
              type="number"
              name="min_score"
              className="form-control"
              value={filters.min_score}
              onChange={handleFilterChange}
              min="0"
              max="100"
              placeholder="Example: 80"
            />
          </div>

          <div className="col-md-3 mb-3">
            <label className="form-label">AI Recommendation</label>

            <select
              name="recommendation"
              className="form-select"
              value={filters.recommendation}
              onChange={handleFilterChange}
            >
              <option value="">All Recommendations</option>
              <option value="shortlist">Shortlist</option>
              <option value="review">Review</option>
              <option value="reject">Reject</option>
            </select>
          </div>

          <div className="col-md-3 mb-3">
            <label className="form-label">HR Status</label>

            <select
              name="status"
              className="form-select"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-primary"
            onClick={handleApplyFilters}
          >
            Apply Filters
          </button>

          <button
            className="btn btn-outline-secondary"
            onClick={handleClearFilters}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading applications...</p>
      ) : applications.length === 0 ? (
        <div className="alert alert-info">
          No applications match the selected filters.
        </div>
      ) : (
        <div className="row">
          {applications.map((application) => {
            const resumeUrl = getResumeUrl(application.resume);

            return (
              <div
                className="col-lg-6 mb-4"
                key={application.id}
              >
                <div className="card shadow-sm p-4 h-100">
                  <h4>{application.candidate_username}</h4>

                  <p className="text-muted mb-1">
                    {application.job_title}
                  </p>

                  <p className="text-muted">
                    {application.company_name}
                  </p>

                  <hr />

                  <p>
                    <strong>HR Status:</strong>{" "}
                    {application.application_status}
                  </p>

                  <p>
                    <strong>AI Score:</strong>{" "}
                    {application.ai_score ?? "Not evaluated yet"}
                  </p>

                  <p>
                    <strong>AI Recommendation:</strong>{" "}
                    {application.recommendation === "not_evaluated"
                      ? "Not evaluated yet"
                      : application.recommendation}
                  </p>

                  <p>
                    <strong>Matched Skills:</strong>{" "}
                    {formatText(application.matched_skills)}
                  </p>

                  <p>
                    <strong>Missing Skills:</strong>{" "}
                    {formatText(application.missing_skills)}
                  </p>

                  <p>
                    <strong>Experience Match:</strong>{" "}
                    {formatText(application.experience_match)}
                  </p>

                  <p>
                    <strong>AI Feedback:</strong>{" "}
                    {application.ai_feedback || "Not evaluated yet"}
                  </p>

                  <div className="d-flex gap-2 flex-wrap mb-3">
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

                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() =>
                        updateStatus(
                          application.id,
                          "shortlisted"
                        )
                      }
                      disabled={
                        application.application_status ===
                        "shortlisted"
                      }
                    >
                      Shortlist
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        updateStatus(
                          application.id,
                          "rejected"
                        )
                      }
                      disabled={
                        application.application_status ===
                        "rejected"
                      }
                    >
                      Reject
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        updateStatus(
                          application.id,
                          "pending"
                        )
                      }
                      disabled={
                        application.application_status ===
                        "pending"
                      }
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