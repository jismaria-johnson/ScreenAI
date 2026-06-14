import {
  useEffect,
  useState,
} from "react";
import {
  useNavigate,
} from "react-router-dom";

import API from "../api/axiosConfig";

function EditProfile() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: "",
    role: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    education: "",
  });

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get(
        "/accounts/profile/"
      );

      setFormData({
        username:
          response.data.username || "",
        role:
          response.data.role || "",
        first_name:
          response.data.first_name || "",
        last_name:
          response.data.last_name || "",
        email:
          response.data.email || "",
        phone:
          response.data.phone || "",
        education:
          response.data.education || "",
      });
    } catch (requestError) {
      console.error(
        "Failed to load profile:",
        requestError
      );

      setError(
        requestError.response?.data?.detail ||
          "Failed to load profile."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setError("");

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));
  };

  const getErrorMessage = (requestError) => {
    const responseData =
      requestError.response?.data;

    if (!responseData) {
      return "Failed to update profile.";
    }

    if (responseData.detail) {
      return responseData.detail;
    }

    for (const [field, messages] of Object.entries(
      responseData
    )) {
      if (Array.isArray(messages)) {
        return `${field}: ${messages[0]}`;
      }

      if (typeof messages === "string") {
        return `${field}: ${messages}`;
      }
    }

    return "Failed to update profile.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSaving(true);

    try {
      await API.patch(
        "/accounts/profile/",
        {
          first_name:
            formData.first_name.trim(),
          last_name:
            formData.last_name.trim(),
          email:
            formData.email.trim(),
          phone:
            formData.phone.trim(),
          education:
            formData.education.trim(),
        }
      );

      alert("Profile updated successfully.");

      navigate("/profile", {
        replace: true,
      });
    } catch (requestError) {
      console.error(
        "Failed to update profile:",
        requestError
      );

      setError(
        getErrorMessage(requestError)
      );
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
      <div className="row justify-content-center">
        <div className="col-lg-7 col-md-9">
          <div className="card shadow-sm">
            <div className="card-body p-4">
              <h2 className="mb-4">
                Edit Profile
              </h2>

              {error && (
                <div className="alert alert-danger">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
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
                    className="form-control"
                    value={formData.username}
                    disabled
                  />
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="role"
                    className="form-label"
                  >
                    Role
                  </label>

                  <input
                    id="role"
                    type="text"
                    className="form-control text-capitalize"
                    value={formData.role}
                    disabled
                  />
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label
                      htmlFor="first_name"
                      className="form-label"
                    >
                      First Name
                    </label>

                    <input
                      id="first_name"
                      name="first_name"
                      type="text"
                      className="form-control"
                      value={formData.first_name}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label
                      htmlFor="last_name"
                      className="form-label"
                    >
                      Last Name
                    </label>

                    <input
                      id="last_name"
                      name="last_name"
                      type="text"
                      className="form-control"
                      value={formData.last_name}
                      onChange={handleChange}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="email"
                    className="form-label"
                  >
                    Email
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="form-control"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={saving}
                  />
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="phone"
                    className="form-label"
                  >
                    Phone Number
                  </label>

                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    className="form-control"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={saving}
                  />
                </div>

                {formData.role === "candidate" && (
                  <div className="mb-3">
                    <label
                      htmlFor="education"
                      className="form-label"
                    >
                      Education
                    </label>

                    <textarea
                      id="education"
                      name="education"
                      className="form-control"
                      rows="4"
                      value={formData.education}
                      onChange={handleChange}
                      placeholder={
                        "Example: B.Tech Computer Science"
                      }
                      disabled={saving}
                    />
                  </div>
                )}

                <div className="alert alert-info">
                  Skills, work experience and
                  previous companies are extracted
                  automatically from the resume when
                  applying for a job.
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : "Save Changes"}
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditProfile;