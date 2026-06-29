import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../api/axiosConfig";
import Toast from "../components/Toast";
import "../styles/PublicApplyJob.css";

export default function PublicApplyJob() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "success" });

  const [formData, setFormData] = useState({
    candidate_name: "",
    candidate_email: "",
    candidate_phone: "",
    candidate_education: "",
    resume: null,
  });

  const [formErrors, setFormErrors] = useState({});

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/jobs/public/${token}/`
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

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchJobDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
        `${API_BASE_URL}/applications/public/${token}/`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.status === 201) {
        setToast({ message: "Application submitted successfully.", type: "success" });
        setSubmitted(true);
      }
    } catch (err) {
      if (err.response?.status === 429) {
        const msg = "Too many attempts have been made. Please wait before trying again.";
        setToast({ message: msg, type: "error" });
        setError(msg);
      } else if (err.response?.status === 400 && err.response?.data) {
        const responseData = err.response.data;
        if (typeof responseData === "object") {
          const newFormErrors = {};
          let hasFieldErrors = false;
          let globalErrorMsg = "";

          Object.entries(responseData).forEach(([key, val]) => {
            const valStr = Array.isArray(val) ? val.join(" ") : String(val);
            if (["candidate_name", "candidate_email", "candidate_phone", "candidate_education", "resume"].includes(key)) {
              newFormErrors[key] = valStr;
              hasFieldErrors = true;
            } else {
              if (globalErrorMsg) globalErrorMsg += " ";
              globalErrorMsg += valStr;
            }
          });

          if (hasFieldErrors) {
            setFormErrors(newFormErrors);
            const msg = "Please correct the errors in the form.";
            setToast({ message: msg, type: "error" });
            setError(globalErrorMsg || msg);
          } else {
            const msg = globalErrorMsg || "Failed to submit application.";
            setToast({ message: msg, type: "error" });
            setError(msg);
          }
        } else {
          const msg = String(responseData) || "Failed to submit application.";
          setToast({ message: msg, type: "error" });
          setError(msg);
        }
      } else {
        const msg = err.response?.data?.detail || "Failed to submit application. Please try again.";
        setToast({ message: msg, type: "error" });
        setError(msg);
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
        {toast.message && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast({ message: "", type: "success" })}
          />
        )}
        <div className="success-card">
          <div className="success-icon" aria-hidden="true" />
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
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "success" })}
        />
      )}
      <main className="public-apply-shell">
      {error && <div className="alert alert-danger">{error}</div>}

      <header className="job-header">
        <span className="job-header-label">Application</span>
        <h1>{job?.job_title}</h1>
        {job?.company_name && <p className="company">{job.company_name}</p>}
      </header>

      <div className="application-layout">
      <form onSubmit={handleSubmit} className="application-form">
        <div className="application-form-heading">
          <h2>Your Application</h2>
        </div>
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

        <div className="form-group resume-field">
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
        <aside className="job-details-preview">
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
        </aside>
      )}
      </div>
      </main>
    </div>
  );
}
