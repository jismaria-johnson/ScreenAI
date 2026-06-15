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
        "/hr-dashboard",
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
      setMessage(
        "Your session expired. Please log in again."
      );
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
      "Invalid HR username or password."
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

      saveAuthData({
        access: response.data.access,
        refresh: response.data.refresh,
        role: "hr",
      });

      const requestedPath =
        location.state?.from;

      navigate(
        requestedPath ||
          "/hr-dashboard",
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
          <h2 className="mb-2">
            HR Login
          </h2>

          <p className="text-muted mb-4">
            Candidates do not need to log in.
            Use the application link shared by HR.
          </p>

          {message && (
            <div className="alert alert-info">
              {message}
            </div>
          )}

          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="card p-4 shadow-sm"
          >
            <div className="mb-3">
              <label
                htmlFor="username"
                className="form-label"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                name="username"
                className="form-control"
                value={
                  formData.username
                }
                onChange={handleChange}
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>

            <div className="mb-3">
              <label
                htmlFor="password"
                className="form-label"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                name="password"
                className="form-control"
                value={
                  formData.password
                }
                onChange={handleChange}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading
                ? "Logging in..."
                : "HR Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;