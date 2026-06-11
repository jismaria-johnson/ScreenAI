import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "candidate",
    phone: "",
    education: "",
    skills: "",
    experience: "",
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
      await API.post("/accounts/register/", formData);
      alert("Registration successful. Please login.");
      navigate("/login");
    } catch (err) {
      console.log(err);
      setError("Registration failed. Please check the details.");
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Register</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="card p-4 shadow-sm">
        <div className="row">
          <div className="col-md-6 mb-3">
            <label>Username</label>
            <input
              type="text"
              name="username"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Email</label>
            <input
              type="email"
              name="email"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Password</label>
            <input
              type="password"
              name="password"
              className="form-control"
              onChange={handleChange}
              required
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Role</label>
            <select
              name="role"
              className="form-control"
              value={formData.role}
              onChange={handleChange}
            >
              <option value="candidate">Candidate</option>
              <option value="hr">HR</option>
            </select>
          </div>

          <div className="col-md-6 mb-3">
            <label>First Name</label>
            <input
              type="text"
              name="first_name"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Last Name</label>
            <input
              type="text"
              name="last_name"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Phone</label>
            <input
              type="text"
              name="phone"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Education</label>
            <input
              type="text"
              name="education"
              className="form-control"
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label>Skills</label>
            <textarea
              name="skills"
              className="form-control"
              onChange={handleChange}
            ></textarea>
          </div>

          <div className="col-md-6 mb-3">
            <label>Experience</label>
            <textarea
              name="experience"
              className="form-control"
              onChange={handleChange}
            ></textarea>
          </div>
        </div>

        <button className="btn btn-primary">Register</button>
      </form>
    </div>
  );
}

export default Register;