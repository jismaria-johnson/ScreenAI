import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import API from "../api/axiosConfig";

function MyJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedJobId, setCopiedJobId] = useState(null);
  const [togglingFormId, setTogglingFormId] = useState(null);

  const fetchJobs = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/jobs/");
      setJobs(response.data);
    } catch (err) {
      console.log("Failed to fetch HR jobs:", err);
      setError("Could not load your jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchJobs();
  }, []);

  const copyApplicationLink = (token) => {
    const link = `${window.location.origin}/apply/public/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedJobId(token);
      setTimeout(() => setCopiedJobId(null), 2000);
    });
  };

  const toggleApplicationForm = async (job) => {
    try {
      setTogglingFormId(job.id);
      await API.patch(`/jobs/${job.id}/`, {
        application_form_enabled: !job.application_form_enabled,
      });
      await fetchJobs();
    } catch (err) {
      console.log("Failed to toggle form:", err);
      alert("Could not update form setting.");
    } finally {
      setTogglingFormId(null);
    }
  };

  const updateJobStatus = async (job, newStatus) => {
    try {
      await API.patch(`/jobs/${job.id}/`, {
        status: newStatus,
      });

      await fetchJobs();
    } catch (err) {
      console.log("Failed to update job status:", err);
      alert("Could not update job status.");
    }
  };

  const deleteJob = async (job) => {
    if ((job.applicant_count ?? 0) > 0) {
      alert(
        "This job already has candidate applications and cannot be deleted. Close the job instead."
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete "${job.job_title}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await API.delete(`/jobs/${job.id}/`);
      alert("Job deleted successfully.");
      await fetchJobs();
    } catch (err) {
      console.log("Failed to delete job:", err);

      const backendMessage =
        err.response?.data?.detail ||
        "Could not delete this job.";

      alert(backendMessage);
    }
  };

  const isDeadlinePassed = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  if (loading) {
    return (
      <div className="container py-5">
        <p>Loading jobs...</p>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">My Jobs</h2>

          <p className="text-muted mb-0">
            Manage your job postings and view applicant counts.
          </p>
        </div>

        <Link to="/add-job" className="btn btn-primary">
          Add Job
        </Link>
      </div>

      {error ? (
        <div className="alert alert-danger">
          {error}
        </div>
      ) : jobs.length === 0 ? (
        <div className="alert alert-info">
          You have not posted any jobs yet.
        </div>
      ) : (
        <div className="row">
          {jobs.map((job) => {
            const applicantCount = job.applicant_count ?? 0;
            const hasApplications = applicantCount > 0;
            const deadlinePassed = isDeadlinePassed(
              job.application_deadline
            );

            return (
              <div className="col-lg-6 mb-4" key={job.id}>
                <div className="card shadow-sm p-4 h-100">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h4>{job.job_title}</h4>
                      <p className="text-muted">
                        {job.company_name}
                      </p>
                    </div>

                    <span
                      className={
                        job.status === "open"
                          ? "badge bg-success"
                          : "badge bg-secondary"
                      }
                    >
                      {job.status}
                    </span>
                  </div>

                  {job.status === "open" && (
                    <div className="mb-3">
                      {!job.application_form_enabled && (
                        <div className="alert alert-warning py-2 mb-2">
                          Application form is disabled
                        </div>
                      )}
                      {deadlinePassed && (
                        <div className="alert alert-danger py-2 mb-2">
                          Application deadline has passed
                        </div>
                      )}
                      {job.application_form_enabled &&
                        !deadlinePassed && (
                          <div className="alert alert-success py-2 mb-2">
                            Accepting applications
                          </div>
                        )}
                    </div>
                  )}

                  <p>
                    <strong>Required Skills:</strong>{" "}
                    {job.required_skills}
                  </p>

                  <p>
                    <strong>Required Experience:</strong>{" "}
                    {job.required_experience}
                  </p>

                  <p>
                    <strong>Location:</strong>{" "}
                    {job.location || "Not specified"}
                  </p>

                  <p>
                    <strong>Applicants:</strong>{" "}
                    {applicantCount}
                  </p>

                  {job.application_deadline && (
                    <p>
                      <strong>Deadline:</strong>{" "}
                      {new Date(
                        job.application_deadline
                      ).toLocaleDateString()}
                    </p>
                  )}

                  <p>{job.job_description}</p>

                  {hasApplications && (
                    <div className="alert alert-warning py-2">
                      This job cannot be deleted because it has candidate
                      applications. Close it instead.
                    </div>
                  )}

                  <div className="d-grid gap-2 mt-auto">
                    {job.status === "open" && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          copyApplicationLink(
                            job.application_token
                          )
                        }
                        title="Copy the public application link to share with candidates"
                      >
                        {copiedJobId === job.application_token
                          ? "Link Copied!"
                          : "Copy Application Link"}
                      </button>
                    )}

                    {job.status === "open" && (
                      <button
                        className={`btn btn-sm ${
                          job.application_form_enabled
                            ? "btn-outline-success"
                            : "btn-outline-secondary"
                        }`}
                        onClick={() =>
                          toggleApplicationForm(job)
                        }
                        disabled={
                          togglingFormId === job.id
                        }
                      >
                        {job.application_form_enabled
                          ? "Disable Form"
                          : "Enable Form"}
                      </button>
                    )}

                    <Link
                      to={`/edit-job/${job.id}`}
                      className="btn btn-outline-primary btn-sm"
                    >
                      Edit
                    </Link>

                    {job.status === "open" ? (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() =>
                          updateJobStatus(job, "closed")
                        }
                      >
                        Close Job
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline-success btn-sm"
                        onClick={() =>
                          updateJobStatus(job, "open")
                        }
                      >
                        Reopen Job
                      </button>
                    )}

                    <Link
                      to={`/hr-applications?job=${job.id}`}
                      className="btn btn-outline-dark btn-sm"
                    >
                      View Applications
                    </Link>

                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => deleteJob(job)}
                      disabled={hasApplications}
                      title={
                        hasApplications
                          ? "Jobs with applications cannot be deleted"
                          : "Delete this job"
                      }
                    >
                      Delete
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

export default MyJobs;