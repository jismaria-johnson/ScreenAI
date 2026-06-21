import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";
import { clearAuthData } from "../utils/auth";
import Toast from "../components/Toast";

function ForcePasswordChange() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name] || errors.non_field_errors) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        delete copy.non_field_errors;
        return copy;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    if (formData.new_password !== formData.confirm_password) {
      setErrors({ confirm_password: "New passwords do not match." });
      setLoading(false);
      return;
    }

    if (formData.new_password === formData.current_password) {
      setErrors({ new_password: "New password cannot be the same as current password." });
      setLoading(false);
      return;
    }

    try {
      await API.post("/accounts/change-password/", {
        current_password: formData.current_password,
        new_password: formData.new_password,
        confirm_password: formData.confirm_password,
      });

      // Clear all authentication data on success
      clearAuthData();

      // Redirect to login with success param
      navigate("/login?password=changed", { replace: true });
    } catch (err) {
      console.error("Password change failed:", err);
      if (err.response && err.response.data) {
        setErrors(err.response.data);
        const detailMsg = err.response.data.detail || "Please correct the errors below.";
        showToast(detailMsg, "error");
      } else {
        showToast("An unexpected error occurred. Please try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5 d-flex flex-column align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
      <div className="col-md-6 col-lg-5">
        <div className="text-center mb-4">
          <h2 className="fw-bold mb-2 text-white">Change Password</h2>
          <p className="text-muted small">
            You must change your temporary password to secure your account before proceeding.
          </p>
        </div>

        {errors.non_field_errors && (
          <div className="alert alert-danger border-0 shadow-sm mb-3">
            {errors.non_field_errors[0]}
          </div>
        )}

        <div className="card p-4 rounded-4" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="current_password" className="form-label fw-semibold text-white small">
                Current Temporary Password
              </label>
              <input
                id="current_password"
                type="password"
                name="current_password"
                className={`form-control ${errors.current_password ? "is-invalid" : ""}`}
                placeholder="Enter current password"
                value={formData.current_password}
                onChange={handleChange}
                required
                disabled={loading}
              />
              {errors.current_password && (
                <div className="invalid-feedback" style={{ color: "var(--screenai-danger)" }}>
                  {errors.current_password[0]}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label htmlFor="new_password" className="form-label fw-semibold text-white small">
                New Secure Password
              </label>
              <input
                id="new_password"
                type="password"
                name="new_password"
                className={`form-control ${errors.new_password ? "is-invalid" : ""}`}
                placeholder="Enter new password"
                value={formData.new_password}
                onChange={handleChange}
                required
                disabled={loading}
              />
              {errors.new_password && (
                <div className="invalid-feedback mt-1" style={{ color: "var(--screenai-danger)" }}>
                  {Array.isArray(errors.new_password) ? errors.new_password.join(" ") : errors.new_password}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="confirm_password" className="form-label fw-semibold text-white small">
                Confirm New Password
              </label>
              <input
                id="confirm_password"
                type="password"
                name="confirm_password"
                className={`form-control ${errors.confirm_password ? "is-invalid" : ""}`}
                placeholder="Confirm new password"
                value={formData.confirm_password}
                onChange={handleChange}
                required
                disabled={loading}
              />
              {errors.confirm_password && (
                <div className="invalid-feedback" style={{ color: "var(--screenai-danger)" }}>
                  {errors.confirm_password}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Updating Password...
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        </div>
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "success" })} />
    </div>
  );
}

export default ForcePasswordChange;
