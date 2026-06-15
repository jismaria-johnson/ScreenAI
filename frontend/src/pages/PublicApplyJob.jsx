import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/PublicApplyJob.css";

export default function PublicApplyJob() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    candidate_name: "",
    candidate_email: "",
    candidate_phone: "",
    candidate_education: "",
    resume: null,
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchJobDetails();
  }, [token]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `http://localhost:8000/api/jobs/public/${token}/`
      );
      setJob(response.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) {
        setError("Job not found. The link may be invalid.");
      } else if (err.response?.status === 400) {
        setError(
          err.response.data?.detail ||
            "This job is no longer accepting applications."
        );
      } else {
        setError("Failed to load job details. Please try again later.");
      }
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null,
      });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (file.type !== "application/pdf") {
        setFormErrors({
          ...formErrors,
          resume: "Only PDF files are accepted.",
        });
        return;
      }

      // Validate file size (5 MB)
      if (file.size > 5 * 1024 * 1024) {
        setFormErrors({
          ...formErrors,
          resume: "Resume size must not exceed 5 MB.",
        });
        return;
      }

      setFormData({
        ...formData,
        resume: file,
      });
      setFormErrors({
        ...formErrors,
        resume: null,
      });
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.candidate_name.trim()) {
      errors.candidate_name = "Full name is required.";
    }

    if (!formData.candidate_email.trim()) {
      errors.candidate_email = "Email is required.";
    } else if (!isValidEmail(formData.candidate_email)) {
      errors.candidate_email = "Please enter a valid email address.";
    }

    if (!formData.candidate_phone.trim()) {
      errors.candidate_phone = "Phone number is required.";
    }

    if (!formData.resume) {
      errors.resume = "Please upload a resume.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const formDataToSend = new FormData();
      formDataToSend.append("candidate_name", formData.candidate_name);
      formDataToSend.append("candidate_email", formData.candidate_email);
      formDataToSend.append("candidate_phone", formData.candidate_phone);
      formDataToSend.append("candidate_education", formData.candidate_education);
      formDataToSend.append("resume", formData.resume);

      const response = await axios.post(
        `http://localhost:8000/api/applications/public/${token}/`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.status === 201) {
        setSubmitted(true);
      }
    } catch (err) {
      if (err.response?.data) {
        // Handle various error responses
        const responseData = err.response.data;
        if (typeof responseData === "object") {
          setError(
            Object.entries(responseData)
              .map(([key, value]) => {
                if (Array.isArray(value)) {
                  return `${value.join(" ")}`;
                }
                return `${value}`;
              })
              .join(" ")
          );
        } else {
          setError(responseData);
        }
      } else {
        setError("Failed to submit application. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-apply-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="public-apply-container">
        <div className="error-card">
          <h2>Unable to Load Application</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/")} className="btn btn-primary">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-apply-container">
        <div className="success-card">
          <div className="success-icon">✓</div>
          <h2>Application Submitted Successfully!</h2>
          <p>Thank you for applying to this position.</p>
          <p>The HR team will review your application and contact you soon.</p>
          <button onClick={() => navigate("/")} className="btn btn-primary">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-apply-container">
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="job-header">
        <h1>{job?.job_title}</h1>
        {job?.company_name && <p className="company">{job.company_name}</p>}
      </div>

      <form onSubmit={handleSubmit} className="application-form">
        <div className="form-group">
          <label htmlFor="candidate_name">Full Name *</label>
          <input
            type="text"
            id="candidate_name"
            name="candidate_name"
            value={formData.candidate_name}
            onChange={handleInputChange}
            placeholder="Enter your full name"
            className={`form-control ${formErrors.candidate_name ? "is-invalid" : ""}`}
          />
          {formErrors.candidate_name && (
            <small className="error-text">{formErrors.candidate_name}</small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="candidate_email">Email Address *</label>
          <input
            type="email"
            id="candidate_email"
            name="candidate_email"
            value={formData.candidate_email}
            onChange={handleInputChange}
            placeholder="Enter your email"
            className={`form-control ${formErrors.candidate_email ? "is-invalid" : ""}`}
          />
          {formErrors.candidate_email && (
            <small className="error-text">{formErrors.candidate_email}</small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="candidate_phone">Phone Number *</label>
          <input
            type="tel"
            id="candidate_phone"
            name="candidate_phone"
            value={formData.candidate_phone}
            onChange={handleInputChange}
            placeholder="Enter your phone number"
            className={`form-control ${formErrors.candidate_phone ? "is-invalid" : ""}`}
          />
          {formErrors.candidate_phone && (
            <small className="error-text">{formErrors.candidate_phone}</small>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="candidate_education">Education (Optional)</label>
          <input
            type="text"
            id="candidate_education"
            name="candidate_education"
            value={formData.candidate_education}
            onChange={handleInputChange}
            placeholder="e.g., Bachelor's in Computer Science"
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="resume">Resume (PDF) *</label>
          <input
            type="file"
            id="resume"
            name="resume"
            accept=".pdf"
            onChange={handleFileChange}
            className={`form-control ${formErrors.resume ? "is-invalid" : ""}`}
          />
          <small className="text-muted">
            Maximum file size: 5 MB. PDF format only.
          </small>
          {formErrors.resume && (
            <small className="error-text">{formErrors.resume}</small>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary btn-block"
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </button>
      </form>

      {job && (
        <div className="job-details-preview">
          <h3>Job Details</h3>
          {job.job_description && (
            <div className="detail-section">
              <h4>Description</h4>
              <p>{job.job_description}</p>
            </div>
          )}
          {job.required_skills && (
            <div className="detail-section">
              <h4>Required Skills</h4>
              <p>{job.required_skills}</p>
            </div>
          )}
          {job.required_experience && (
            <div className="detail-section">
              <h4>Required Experience</h4>
              <p>{job.required_experience}</p>
            </div>
          )}
          {job.location && (
            <div className="detail-section">
              <h4>Location</h4>
              <p>{job.location}</p>
            </div>
          )}
          {job.application_deadline && (
            <div className="detail-section">
              <h4>Application Deadline</h4>
              <p>{new Date(job.application_deadline).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
