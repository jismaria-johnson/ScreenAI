import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import API from "../api/axiosConfig";

function HRApplications() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const [applications, setApplications] =
    useState([]);

  const [allApplications, setAllApplications] =
    useState([]);

  const [jobs, setJobs] = useState([]);

  const [
    selectedApplication,
    setSelectedApplication,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [progStage, setProgStage] = useState("Offer Extended");
  const [progNotes, setProgNotes] = useState("");
  const [updatingProg, setUpdatingProg] = useState(false);

  const [filters, setFilters] = useState({
    job: searchParams.get("job") || "",
    min_score:
      searchParams.get("min_score") || "",
    experience:
      searchParams.get("experience") || "",
    company:
      searchParams.get("company") || "",
    recommendation:
      searchParams.get("recommendation") || "",
    status:
      searchParams.get("status") || "",
  });

  const fetchApplications = async (
    selectedFilters = filters
  ) => {
    setLoading(true);
    setError("");

    try {
      const params = {};

      if (selectedFilters.job) {
        params.job = selectedFilters.job;
      }

      if (selectedFilters.min_score) {
        params.min_score =
          selectedFilters.min_score;
      }

      if (selectedFilters.experience) {
        params.experience =
          selectedFilters.experience;
      }

      if (selectedFilters.company) {
        params.company =
          selectedFilters.company;
      }

      if (selectedFilters.recommendation) {
        params.recommendation =
          selectedFilters.recommendation;
      }

      if (selectedFilters.status) {
        params.status =
          selectedFilters.status;
      }

      const response = await API.get(
        "/applications/hr/",
        { params }
      );

      setApplications(response.data);

      if (selectedApplication) {
        const updatedApplication =
          response.data.find(
            (application) =>
              application.id ===
              selectedApplication.id
          );

        setSelectedApplication(
          updatedApplication || null
        );
      }
    } catch (requestError) {
      console.error(
        "Failed to fetch applications:",
        requestError
      );

      setError(
        requestError.response?.data?.detail ||
          "Failed to filter applications."
      );
    } finally {
      setLoading(false);
    }
  };

  const initializePage = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        jobsResponse,
        allApplicationsResponse,
      ] = await Promise.all([
        API.get("/jobs/"),
        API.get("/applications/hr/"),
      ]);

      setJobs(jobsResponse.data);
      setAllApplications(
        allApplicationsResponse.data
      );

      await fetchApplications(filters);
    } catch (requestError) {
      console.error(
        "Failed to initialise HR applications:",
        requestError
      );

      setError(
        requestError.response?.data?.detail ||
          "Failed to load candidate applications."
      );

      setLoading(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyOptions = useMemo(() => {
    const companyMap = new Map();

    allApplications.forEach((application) => {
      if (!application.worked_companies) {
        return;
      }

      application.worked_companies
        .split(",")
        .map((company) => company.trim())
        .filter(Boolean)
        .forEach((company) => {
          const normalisedName =
            company.toLowerCase();

          if (!companyMap.has(normalisedName)) {
            companyMap.set(
              normalisedName,
              company
            );
          }
        });
    });

    return Array.from(
      companyMap.values()
    ).sort((first, second) =>
      first.localeCompare(second)
    );
  }, [allApplications]);



  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    const nextFilters = {
      ...filters,
      [name]: value,
    };
    setFilters(nextFilters);

    const urlParameters = {};
    Object.entries(nextFilters).forEach(([key, val]) => {
      if (val) {
        urlParameters[key] = val;
      }
    });
    setSearchParams(urlParameters);
    fetchApplications(nextFilters);
  };

  const handleClearFilters = () => {
    const emptyFilters = {
      job: "",
      min_score: "",
      experience: "",
      company: "",
      recommendation: "",
      status: "",
    };

    setFilters(emptyFilters);
    setSearchParams({});
    setSelectedApplication(null);
    fetchApplications(emptyFilters);
  };

  const updateStatus = async (
    applicationId,
    newStatus
  ) => {
    setError("");

    try {
      await API.patch(
        `/applications/${applicationId}/status/`,
        {
          application_status: newStatus,
        }
      );

      await fetchApplications(filters);

      const allResponse = await API.get(
        "/applications/hr/"
      );

      setAllApplications(allResponse.data);
    } catch (requestError) {
      console.error(
        "Failed to update application status:",
        requestError
      );

      setError(
        requestError.response?.data?.detail ||
          "Failed to update application status."
      );
    }
  };

  const handleAddProgression = async (e) => {
    e.preventDefault();
    if (!progStage.trim()) return;

    setUpdatingProg(true);
    setError("");

    try {
      const response = await API.post(
        `/applications/admin/${selectedApplication.id}/progression/`,
        { stage: progStage.trim(), notes: progNotes.trim() }
      );
      
      setProgNotes("");
      setSelectedApplication(response.data);
      await fetchApplications(filters);
    } catch (err) {
      console.error("Failed to update progression:", err);
      setError(
        err.response?.data?.detail || "Failed to update candidate progression."
      );
    } finally {
      setUpdatingProg(false);
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

  const getCandidateName = (application) => {
    const fullName = [
      application.candidate_first_name,
      application.candidate_last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return (
      fullName ||
      application.candidate_username ||
      "Unknown candidate"
    );
  };

  const displayValue = (
    value,
    fallback = "None"
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    return value;
  };

  const displayExperience = (value) => {
    if (
      value === null ||
      value === undefined
    ) {
      return "Not evaluated";
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      return "Not evaluated";
    }

    const roundedValue =
      Math.round(numericValue * 10) / 10;

    const formattedValue =
      Number.isInteger(roundedValue)
        ? roundedValue.toString()
        : roundedValue.toFixed(1);

    return `${formattedValue} ${
      roundedValue === 1 ? "year" : "years"
    }`;
  };

  const formatRecommendation = (
    recommendation
  ) => {
    if (
      !recommendation ||
      recommendation === "not_evaluated"
    ) {
      return "Not evaluated";
    }

    return recommendation;
  };

  const renderScoreComponent = (label, score, maxVal, explanation) => {
    if (score === null || score === undefined) {
      return (
        <div className="mb-3">
          <strong>{label}:</strong> <span className="text-muted">Not evaluated</span>
        </div>
      );
    }
    return (
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span><strong>{label}:</strong> {score} / {maxVal}</span>
          <span className="badge bg-secondary">{Math.round((score / maxVal) * 100)}%</span>
        </div>
        <div className="progress mb-2" style={{ height: "8px" }}>
          <div
            className="progress-bar bg-success"
            role="progressbar"
            style={{ width: `${(score / maxVal) * 100}%` }}
            aria-valuenow={score}
            aria-valuemin="0"
            aria-valuemax={maxVal}
          />
        </div>
        {explanation && (
          <p
            className="text-muted small mb-0 ms-2"
            style={{ borderLeft: "2px solid #dee2e6", paddingLeft: "8px" }}
          >
            {explanation}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="container-fluid px-4 py-5">
      <h2 className="mb-4">
        Candidate Applications
      </h2>

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      <div className="card p-4 mb-4 shadow-sm">
        <h5 className="mb-3">
          Filter Applications
        </h5>

        <div className="row">
          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              Job
            </label>

            <select
              name="job"
              className="form-select"
              value={filters.job}
              onChange={handleFilterChange}
            >
              <option value="">
                All Jobs
              </option>

              {jobs.map((job) => (
                <option
                  value={job.id}
                  key={job.id}
                >
                  {job.job_title}
                </option>
              ))}
            </select>
          </div>

          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              Minimum AI Score
            </label>

            <select
              name="min_score"
              className="form-select"
              value={filters.min_score}
              onChange={handleFilterChange}
            >
              <option value="">
                Any Score
              </option>
              <option value="50">
                50 and above
              </option>
              <option value="60">
                60 and above
              </option>
              <option value="70">
                70 and above
              </option>
              <option value="80">
                80 and above
              </option>
              <option value="90">
                90 and above
              </option>
            </select>
          </div>

          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              Experience
            </label>

            <select
              name="experience"
              className="form-select"
              value={filters.experience}
              onChange={handleFilterChange}
            >
              <option value="">
                Any Experience
              </option>
              <option value="fresher">
                Fresher
              </option>
              <option value="1">
                1+ years
              </option>
              <option value="2">
                2+ years
              </option>
              <option value="3">
                3+ years
              </option>
              <option value="5">
                5+ years
              </option>
              <option value="10">
                10+ years
              </option>
            </select>
          </div>

          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              Previous Company
            </label>

            <select
              name="company"
              className="form-select"
              value={filters.company}
              onChange={handleFilterChange}
            >
              <option value="">
                All Companies
              </option>

              {companyOptions.map((company) => (
                <option
                  value={company}
                  key={company}
                >
                  {company}
                </option>
              ))}
            </select>
          </div>

          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              AI Recommendation
            </label>

            <select
              name="recommendation"
              className="form-select"
              value={filters.recommendation}
              onChange={handleFilterChange}
            >
              <option value="">
                All Recommendations
              </option>
              <option value="shortlist">
                Shortlist
              </option>
              <option value="review">
                Review
              </option>
              <option value="reject">
                Reject
              </option>
              <option value="not_evaluated">
                Not Evaluated
              </option>
            </select>
          </div>

          <div className="col-xl-2 col-md-4 mb-3">
            <label className="form-label">
              HR Status
            </label>

            <select
              name="status"
              className="form-select"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">
                All Statuses
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="shortlisted">
                Shortlisted
              </option>
              <option value="rejected">
                Rejected
              </option>
              <option value="hired">
                Hired
              </option>
            </select>
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
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
          No applications match the selected
          filters.
        </div>
      ) : (
        <div className="card shadow-sm mb-4">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Candidate</th>
                  <th>Phone</th>
                  <th>Job</th>
                  <th>AI Score</th>
                  <th>Experience</th>
                  <th>Previous Companies</th>
                  <th>AI Recommendation</th>
                  <th>HR Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {applications.map(
                  (application) => (
                    <tr key={application.id}>
                      <td>
                        <strong>
                          {getCandidateName(
                            application
                          )}
                        </strong>

                        <div className="small text-muted">
                          {application.candidate_email ||
                            application.candidate_username}
                        </div>
                      </td>

                      <td>
                        {displayValue(
                          application.candidate_phone,
                          "Not provided"
                        )}
                      </td>

                      <td>
                        {application.job_title}

                        <div className="small text-muted">
                          {application.company_name}
                        </div>
                      </td>

                      <td>
                        {application.ai_score ??
                          "Not evaluated"}
                      </td>

                      <td>
                        {displayExperience(
                          application.total_experience_years
                        )}
                      </td>

                      <td>
                        {displayValue(
                          application.worked_companies
                        )}
                      </td>

                      <td className="text-capitalize">
                        {formatRecommendation(
                          application.recommendation
                        )}
                      </td>

                      <td className="text-capitalize">
                        {
                          application.application_status
                        }
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() =>
                            setSelectedApplication(
                              application
                            )
                          }
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedApplication && (
        <div className="card shadow-sm p-4">
          <div className="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h4 className="mb-1">
                {getCandidateName(
                  selectedApplication
                )}
              </h4>

              <p className="text-muted mb-0">
                {selectedApplication.job_title}
                {" — "}
                {
                  selectedApplication.company_name
                }
              </p>
            </div>

            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={() =>
                setSelectedApplication(null)
              }
            />
          </div>

          <div className="row g-4">
            <div className="col-md-6">
              <p>
                <strong>Email:</strong>{" "}
                {displayValue(
                  selectedApplication.candidate_email,
                  "Not provided"
                )}
              </p>

              <p>
                <strong>Phone:</strong>{" "}
                {displayValue(
                  selectedApplication.candidate_phone,
                  "Not provided"
                )}
              </p>

              <p>
                <strong>
                  Total Experience:
                </strong>{" "}
                {displayExperience(
                  selectedApplication.total_experience_years
                )}
              </p>

              <p>
                <strong>
                  Previous Companies:
                </strong>{" "}
                {displayValue(
                  selectedApplication.worked_companies,
                  "None listed"
                )}
              </p>

              <p>
                <strong>
                  Experience Summary:
                </strong>{" "}
                {displayValue(
                  selectedApplication.experience_summary,
                  "Not evaluated"
                )}
              </p>

              <p>
                <strong>
                  Project Summary:
                </strong>{" "}
                {displayValue(
                  selectedApplication.project_summary,
                  "Not evaluated"
                )}
              </p>

              <p>
                <strong>
                  Education Summary:
                </strong>{" "}
                {displayValue(
                  selectedApplication.education_summary,
                  "Not evaluated"
                )}
              </p>
            </div>

            <div className="col-md-6">
              <p className="text-capitalize">
                <strong>
                  AI Recommendation:
                </strong>{" "}
                {formatRecommendation(
                  selectedApplication.recommendation
                )}
              </p>

              <p className="text-capitalize">
                <strong>HR Status:</strong>{" "}
                {
                  selectedApplication.application_status
                }
              </p>

              <p>
                <strong>
                  Matched Skills:
                </strong>{" "}
                {displayValue(
                  selectedApplication.matched_skills
                )}
              </p>

              <p>
                <strong>
                  Missing Skills:
                </strong>{" "}
                {displayValue(
                  selectedApplication.missing_skills
                )}
              </p>
            </div>
          </div>

          <hr />

          <p>
            <strong>Experience Match:</strong>{" "}
            {displayValue(
              selectedApplication.experience_match,
              "Not evaluated"
            )}
          </p>

          <p>
            <strong>AI Feedback:</strong>{" "}
            {displayValue(
              selectedApplication.ai_feedback,
              "Not evaluated"
            )}
          </p>

          <hr />

          <div className="card border-0 bg-light p-4 mb-3">
            <h4 className="border-bottom pb-2 mb-4">AI Score Breakdown</h4>
            {selectedApplication.skills_score === null ? (
              <p className="text-muted mb-0">Not evaluated</p>
            ) : (
              <div className="row">
                <div className="col-md-6 pe-md-4">
                  {renderScoreComponent(
                    "Skills Match",
                    selectedApplication.skills_score,
                    30,
                    selectedApplication.skills_reason
                  )}
                  {renderScoreComponent(
                    "Relevant Experience",
                    selectedApplication.experience_score,
                    25,
                    selectedApplication.experience_score_reason
                  )}
                  {renderScoreComponent(
                    "Projects",
                    selectedApplication.projects_score,
                    20,
                    selectedApplication.projects_score_reason
                  )}
                </div>
                <div className="col-md-6 ps-md-4">
                  {renderScoreComponent(
                    "Previous Role Fit",
                    selectedApplication.company_role_score,
                    10,
                    selectedApplication.company_role_score_reason
                  )}
                  {renderScoreComponent(
                    "Education & Certifications",
                    selectedApplication.education_score,
                    5,
                    selectedApplication.education_score_reason
                  )}
                  {renderScoreComponent(
                    "Overall Job Relevance",
                    selectedApplication.relevance_score,
                    10,
                    selectedApplication.relevance_score_reason
                  )}
                </div>
                <div className="col-12 border-top pt-3 mt-3 d-flex justify-content-between align-items-center bg-white rounded p-3 shadow-sm">
                  <h5 className="mb-0"><strong>Final AI Score:</strong></h5>
                  <h3 className="mb-0 text-primary"><strong>{selectedApplication.ai_score} / 100</strong></h3>
                </div>
              </div>
            )}
          </div>

          {selectedApplication.application_status === "hired" && (
            <div className="card border-0 bg-white shadow-sm p-4 mb-3 rounded-3">
              <h4 className="border-bottom pb-2 mb-3 fw-bold text-dark">Onboarding & Progression Stages</h4>
              
              {/* Form to add progression */}
              <form onSubmit={handleAddProgression} className="bg-light p-3 rounded-3 mb-4">
                <h5 className="fw-bold text-dark small mb-2">Record Onboarding Update</h5>
                <div className="row g-2">
                  <div className="col-sm-4">
                    <select
                      className="form-select form-select-sm"
                      value={progStage}
                      onChange={(e) => setProgStage(e.target.value)}
                      disabled={updatingProg}
                    >
                      <option value="Offer Extended">Offer Extended</option>
                      <option value="Onboarding">Onboarding</option>
                      <option value="Active Employee">Active Employee</option>
                      <option value="Promoted">Promoted</option>
                      <option value="Resigned">Resigned</option>
                      <option value="Terminated">Terminated</option>
                    </select>
                  </div>
                  <div className="col-sm-6">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Orientation details, contract signed, etc."
                      value={progNotes}
                      onChange={(e) => setProgNotes(e.target.value)}
                      disabled={updatingProg}
                    />
                  </div>
                  <div className="col-sm-2">
                    <button
                      type="submit"
                      className="btn btn-sm btn-primary w-100 fw-bold"
                      disabled={updatingProg || !progStage.trim()}
                    >
                      {updatingProg ? "Saving..." : "Add Stage"}
                    </button>
                  </div>
                </div>
              </form>

              {/* Timeline */}
              <h5 className="fw-bold text-dark small mb-3">Progression Timeline</h5>
              <div className="position-relative ps-4">
                <div
                  className="position-absolute h-100 border-start border-2 border-secondary-subtle"
                  style={{ left: "9px", top: "0" }}
                />
                
                {!selectedApplication.progressions || selectedApplication.progressions.length === 0 ? (
                  <div className="text-muted small">No progression stages logged yet.</div>
                ) : (
                  selectedApplication.progressions.map((log) => (
                    <div key={log.id} className="position-relative mb-3 small text-start">
                      <div
                        className="position-absolute bg-success rounded-circle"
                        style={{
                          left: "-35px",
                          top: "4px",
                          width: "10px",
                          height: "10px",
                        }}
                      />
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <strong className="text-dark">{log.stage}</strong>
                        <span className="text-muted" style={{ fontSize: "11px" }}>
                          {new Date(log.updated_at).toLocaleString()}
                        </span>
                      </div>
                      {log.notes && <div className="text-secondary mb-1">{log.notes}</div>}
                      <div className="text-muted" style={{ fontSize: "10px" }}>
                        Recorded by: {log.updated_by_username ? `@${log.updated_by_username}` : "System"} ({log.updater_role === "admin" ? "Admin" : "HR"})
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="d-flex gap-2 flex-wrap mt-3">
            <a
              href={getResumeUrl(
                selectedApplication.resume
              )}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline-primary"
            >
              View Resume
            </a>

            <a
              href={getResumeUrl(
                selectedApplication.resume
              )}
              download
              className="btn btn-outline-dark"
            >
              Download Resume
            </a>

            <button
              type="button"
              className="btn btn-success"
              onClick={() =>
                updateStatus(
                  selectedApplication.id,
                  "hired"
                )
              }
              disabled={
                selectedApplication.application_status ===
                "hired"
              }
            >
              🎉 Hire Candidate
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                updateStatus(
                  selectedApplication.id,
                  "shortlisted"
                )
              }
              disabled={
                selectedApplication.application_status ===
                "shortlisted"
              }
            >
              Shortlist
            </button>

            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                updateStatus(
                  selectedApplication.id,
                  "rejected"
                )
              }
              disabled={
                selectedApplication.application_status ===
                "rejected"
              }
            >
              Reject
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                updateStatus(
                  selectedApplication.id,
                  "pending"
                )
              }
              disabled={
                selectedApplication.application_status ===
                "pending"
              }
            >
              Mark Pending
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HRApplications;