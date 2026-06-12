import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../api/axiosConfig";

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access");
    const role = localStorage.getItem("role");

    if (token && role === "hr") {
      navigate("/hr-dashboard", { replace: true });
    } else if (token && role === "candidate") {
      navigate("/candidate-dashboard", { replace: true });
    }
  }, [navigate]);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const loginResponse = await API.post(
        "/accounts/login/",
        formData
      );

      localStorage.setItem(
        "access",
        loginResponse.data.access
      );

      localStorage.setItem(
        "refresh",
        loginResponse.data.refresh
      );

      const profileResponse = await API.get(
        "/accounts/profile/"
      );

      const role = profileResponse.data.role;

      localStorage.setItem("role", role);

      if (role === "hr") {
        navigate("/hr-dashboard", { replace: true });
      } else {
        navigate("/candidate-dashboard", {
          replace: true,
        });
      }
    } catch (err) {
      console.log("Login failed:", err);
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <h2 className="mb-4">Login</h2>

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
              <label className="form-label">
                Username
              </label>

              <input
                type="text"
                name="username"
                className="form-control"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label">
                Password
              </label>

              <input
                type="password"
                name="password"
                className="form-control"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;