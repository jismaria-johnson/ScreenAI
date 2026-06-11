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
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await API.post("/jobs/", formData);
      alert("Job added successfully.");
      navigate("/jobs");
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

        <button className="btn btn-primary">Add Job</button>
      </form>
    </div>
  );
}

export default AddJob;