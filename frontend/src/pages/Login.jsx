import {
  useEffect,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import API from "../api/axiosConfig";

import {
  clearAuthData,
  isLoggedIn,
  saveAuthData,
  getDashboardPath,
} from "../utils/auth";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] =
    useSearchParams();

  const [formData, setFormData] =
    useState({
      username: "",
      password: "",
    });

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      navigate(
        getDashboardPath(),
        {
          replace: true,
        }
      );

      return;
    }

    if (
      searchParams.get("session") ===
      "expired"
    ) {
      setTimeout(() => {
        setMessage(
          "Your session expired. Please log in again."
        );
      }, 0);
    }
  }, [
    navigate,
    searchParams,
  ]);

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setError("");

    setFormData(
      (previousData) => ({
        ...previousData,
        [name]: value,
      })
    );
  };

  const getLoginError = (
    requestError
  ) => {
    const responseData =
      requestError.response?.data;

    if (!requestError.response) {
      return (
        "Could not connect to the backend server."
      );
    }

    if (
      responseData?.non_field_errors?.length
    ) {
      return (
        responseData.non_field_errors[0]
      );
    }

    if (responseData?.detail) {
      return responseData.detail;
    }

    return (
      "Invalid username or password."
    );
  };

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await API.post(
        "/accounts/login/",
        formData
      );

      const userRole = response.data.role || "hr";

      saveAuthData({
        access: response.data.access,
        refresh: response.data.refresh,
        role: userRole,
      });

      const requestedPath =
        location.state?.from;

      navigate(
        requestedPath ||
          getDashboardPath(),
        {
          replace: true,
        }
      );
    } catch (requestError) {
      console.error(
        "Login failed:",
        requestError
      );

      clearAuthData();

      setError(
        getLoginError(
          requestError
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="text-center mb-4">
            <h2 className="fw-bold mb-2">Login</h2>
            <p className="text-muted small">
              HR recruiters and system administrators can sign in here. Candidates do not need accounts and apply through shared application links.
            </p>
          </div>

          {message && (
            <div className="alert alert-info border-0 shadow-sm">
              {message}
            </div>
          )}

          {error && (
            <div className="alert alert-danger border-0 shadow-sm">
              {error}
            </div>
          )}

          <div className="card border-0 shadow-lg p-4 rounded-4">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label
                  htmlFor="username"
                  className="form-label fw-semibold"
                >
                  Username
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0">
                    👤
                  </span>
                  <input
                    id="username"
                    type="text"
                    name="username"
                    className="form-control bg-light border-start-0"
                    placeholder="Enter username"
                    value={formData.username}
                    onChange={handleChange}
                    autoComplete="username"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label
                  htmlFor="password"
                  className="form-label fw-semibold"
                >
                  Password
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-end-0">
                    🔒
                  </span>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    className="form-control bg-light border-start-0"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </button>
            </form>
          </div>

          <div className="card bg-light border-0 p-3 mt-4 text-center rounded-3">
            <p className="text-muted small mb-0">
              <strong>Are you a candidate?</strong> Candidates do not need to register or log in. Please use the unique application link shared directly by the hiring manager.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;