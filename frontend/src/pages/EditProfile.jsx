import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import API from "../api/axiosConfig";

function EditProfile() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    education: "",
    skills: "",
    experience: "",
  });

  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await API.get("/accounts/profile/");
      const profile = response.data;

      setUsername(profile.username || "");
      setRole(profile.role || "");

      setFormData({
        email: profile.email || "",
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        education: profile.education || "",
        skills: profile.skills || "",
        experience: profile.experience || "",
      });
    } catch (err) {
      console.log("Failed to fetch profile:", err);
      setError("Could not load profile details.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      await API.patch("/accounts/profile/", formData);

      alert("Profile updated successfully.");

      navigate("/profile", {
        replace: true,
      });
    } catch (err) {
      console.log("Failed to update profile:", err);
      setError("Could not update profile. Please check the details.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/profile", {
      replace: true,
    });
  };

  if (loading) {
    return (
      <div className="container py-5">
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <h2 className="mb-2">Edit Profile</h2>

      <p className="text-muted mb-4">
        Update your personal and professional details.
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="card shadow-sm p-4">
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="form-label">Username</label>

            <input
              type="text"
              className="form-control"
              value={username}
              disabled
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">Role</label>

            <input
              type="text"
              className="form-control text-capitalize"
              value={role}
              disabled
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">First Name</label>

            <input
              type="text"
              name="first_name"
              className="form-control"
              value={formData.first_name}
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">Last Name</label>

            <input
              type="text"
              name="last_name"
              className="form-control"
              value={formData.last_name}
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">Email</label>

            <input
              type="email"
              name="email"
              className="form-control"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className="col-md-6 mb-3">
            <label className="form-label">Phone</label>

            <input
              type="text"
              name="phone"
              className="form-control"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div className="col-12 mb-3">
            <label className="form-label">Education</label>

            <textarea
              name="education"
              className="form-control"
              value={formData.education}
              onChange={handleChange}
            />
          </div>

          <div className="col-12 mb-3">
            <label className="form-label">Skills</label>

            <textarea
              name="skills"
              className="form-control"
              value={formData.skills}
              onChange={handleChange}
            />
          </div>

          <div className="col-12 mb-3">
            <label className="form-label">Experience</label>

            <textarea
              name="experience"
              className="form-control"
              value={formData.experience}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditProfile;