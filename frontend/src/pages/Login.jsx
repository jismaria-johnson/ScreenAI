import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";

function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    password: "",
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
      const loginResponse = await API.post("/accounts/login/", formData);

      localStorage.setItem("access", loginResponse.data.access);
      localStorage.setItem("refresh", loginResponse.data.refresh);

      const profileResponse = await API.get("/accounts/profile/");
      localStorage.setItem("role", profileResponse.data.role);

      if (profileResponse.data.role === "hr") {
        navigate("/hr-dashboard");
      } else {
        navigate("/candidate-dashboard");
      }
    } catch (err) {
      console.log(err);
      setError("Invalid username or password.");
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Login</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="card p-4 shadow-sm">
        <div className="mb-3">
          <label>Username</label>
          <input
            type="text"
            name="username"
            className="form-control"
            onChange={handleChange}
            required
          />
        </div>

        <div className="mb-3">
          <label>Password</label>
          <input
            type="password"
            name="password"
            className="form-control"
            onChange={handleChange}
            required
          />
        </div>

        <button className="btn btn-primary">Login</button>
      </form>
    </div>
  );
}

export default Login;