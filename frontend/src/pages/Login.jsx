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
  getDashboardPath,
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
      responseData?.detail
    ) {
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
      const loginResponse =
        await API.post(
          "/accounts/login/",
          formData
        );

      const access =
        loginResponse.data.access;

      const refresh =
        loginResponse.data.refresh;

      localStorage.setItem(
        "access",
        access
      );

      localStorage.setItem(
        "refresh",
        refresh
      );

      const profileResponse =
        await API.get(
          "/accounts/profile/"
        );

      const role =
        profileResponse.data.role;

      saveAuthData({
        access,
        refresh,
        role,
      });

      const requestedPath =
        location.state?.from;

      if (requestedPath) {
        navigate(
          requestedPath,
          {
            replace: true,
          }
        );

        return;
      }

      navigate(
        role === "hr"
          ? "/hr-dashboard"
          : "/candidate-dashboard",
        {
          replace: true,
        }
      );
    } catch (requestError) {
      console.error(
        "Login failed:",
        requestError
      );

      localStorage.removeItem(
        "access"
      );

      localStorage.removeItem(
        "refresh"
      );

      localStorage.removeItem(
        "role"
      );

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
          <h2 className="mb-4">
            Login
          </h2>

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
                onChange={
                  handleChange
                }
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
                onChange={
                  handleChange
                }
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
                : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;