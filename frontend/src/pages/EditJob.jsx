import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import API from "../api/axiosConfig";

function EditJob() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    job_title: "",
    company_name: "",
    job_description: "",
    required_skills: "",
    required_experience: "",
    location: "",
    status: "open",
    application_form_enabled: true,
    application_deadline: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchJob = async () => {
    try {
      const response = await API.get(`/jobs/${jobId}/`);
      const job = response.data;

      setFormData({
        job_title: job.job_title || "",
        company_name: job.company_name || "",
        job_description: job.job_description || "",
        required_skills: job.required_skills || "",
        required_experience: job.required_experience || "",
        location: job.location || "",
        status: job.status || "open",
        application_form_enabled:
          job.application_form_enabled !== undefined
            ? job.application_form_enabled
            : true,
        application_deadline: job.application_deadline || "",
      });
    } catch (err) {
      console.log("Failed to fetch job:", err);
      setError("Could not load this job.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      // Prepare data - if deadline is empty, don't send it
      const dataToSend = { ...formData };
      if (!dataToSend.application_deadline) {
        dataToSend.application_deadline = null;
      }

      await API.patch(`/jobs/${jobId}/`, dataToSend);

      alert("Job updated successfully.");

      navigate("/my-jobs", {
        replace: true,
      });
    } catch (err) {
      console.log("Failed to update job:", err);
      setError("Could not update job. Please check the details.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/my-jobs", {
      replace: true,
    });
  };

  if (loading) {
    return (
      <div className="container py-5">
        <p>Loading job...</p>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <h2 className="mb-2">Edit Job</h2>

      <p className="text-muted mb-4">
        Update the job posting details.
      </p>

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="card shadow-sm p-4"
      >
        <div className="mb-3">
          <label className="form-label">
            Job Title
          </label>

          <input
            type="text"
            name="job_title"
            className="form-control"
            value={formData.job_title}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Company Name
          </label>

          <input
            type="text"
            name="company_name"
            className="form-control"
            value={formData.company_name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Job Description
          </label>

          <textarea
            name="job_description"
            className="form-control"
            value={formData.job_description}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Required Skills
          </label>

          <textarea
            name="required_skills"
            className="form-control"
            value={formData.required_skills}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Required Experience
          </label>

          <input
            type="text"
            name="required_experience"
            className="form-control"
            value={formData.required_experience}
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Location
          </label>

          <input
            type="text"
            name="location"
            className="form-control"
            value={formData.location}
            onChange={handleChange}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">
            Application Deadline (Optional)
          </label>

          <input
            type="datetime-local"
            name="application_deadline"
            className="form-control"
            value={formData.application_deadline}
            onChange={handleChange}
          />
          <small className="text-muted">
            Leave blank to allow indefinite applications.
          </small>
        </div>

        <div className="mb-3 form-check">
          <input
            type="checkbox"
            id="application_form_enabled"
            name="application_form_enabled"
            className="form-check-input"
            checked={formData.application_form_enabled}
            onChange={handleChange}
          />
          <label
            className="form-check-label"
            htmlFor="application_form_enabled"
          >
            Enable Application Form
          </label>
          <small className="d-block text-muted mt-1">
            Candidates can submit applications through the public link when
            enabled.
          </small>
        </div>

        <div className="mb-3">
          <label className="form-label">
            Status
          </label>

          <select
            name="status"
            className="form-select"
            value={formData.status}
            onChange={handleChange}
          >
            <option value="open">
              Open
            </option>

            <option value="closed">
              Closed
            </option>
          </select>
        </div>

        <div className="d-flex gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditJob;