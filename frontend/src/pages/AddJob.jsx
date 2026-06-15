import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";

function AddJob() {
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

  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Only send application_deadline if it's provided
      const dataToSend = { ...formData };
      if (!dataToSend.application_deadline) {
        delete dataToSend.application_deadline;
      }

      await API.post("/jobs/", dataToSend);
      alert("Job added successfully.");
      navigate("/my-jobs");
    } catch (err) {
      console.log(err);
      setError("Only HR users can add jobs. Please login as HR.");
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Add Job</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="card p-4 shadow-sm">
        <div className="mb-3">
          <label>Job Title</label>
          <input
            type="text"
            name="job_title"
            className="form-control"
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label>Company Name</label>
          <input
            type="text"
            name="company_name"
            className="form-control"
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label>Job Description</label>
          <textarea
            name="job_description"
            className="form-control"
            onChange={handleChange}
            required
          ></textarea>
        </div>

        <div className="mb-3">
          <label>Required Skills</label>
          <textarea
            name="required_skills"
            className="form-control"
            onChange={handleChange}
            required
          ></textarea>
        </div>

        <div className="mb-3">
          <label>Required Experience</label>
          <input
            type="text"
            name="required_experience"
            className="form-control"
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label>Location</label>
          <input
            type="text"
            name="location"
            className="form-control"
            onChange={handleChange}
          />
        </div>

        <div className="mb-3">
          <label>Application Deadline (Optional)</label>
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
          <label className="form-check-label" htmlFor="application_form_enabled">
            Enable Application Form
          </label>
          <small className="d-block text-muted mt-1">
            Candidates can submit applications through the public link when enabled.
          </small>
        </div>

        <button className="btn btn-primary">Add Job</button>
      </form>
    </div>
  );
}

export default AddJob;