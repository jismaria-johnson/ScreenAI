import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import API from "../api/axiosConfig";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await API.get("/accounts/profile/");
      setProfile(response.data);
    } catch (err) {
      console.log("Failed to fetch profile:", err);
      setError("Could not load profile details.");
    } finally {
      setLoading(false);
    }
  };

  const displayValue = (value) => {
    return value && value.trim() ? value : "Not provided";
  };

  if (loading) {
    return (
      <div className="container py-5">
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">My Profile</h2>
          <p className="text-muted mb-0">
            View your account and profile information.
          </p>
        </div>

        <Link to="/edit-profile" className="btn btn-primary">
          Edit Profile
        </Link>
      </div>

      <div className="card shadow-sm p-4">
        <div className="row">
          <div className="col-md-6 mb-3">
            <strong>Username</strong>
            <p className="mb-0">
              {displayValue(profile.username)}
            </p>
          </div>

          <div className="col-md-6 mb-3">
            <strong>Role</strong>
            <p className="mb-0 text-capitalize">
              {displayValue(profile.role)}
            </p>
          </div>

          <div className="col-md-6 mb-3">
            <strong>First Name</strong>
            <p className="mb-0">
              {displayValue(profile.first_name)}
            </p>
          </div>

          <div className="col-md-6 mb-3">
            <strong>Last Name</strong>
            <p className="mb-0">
              {displayValue(profile.last_name)}
            </p>
          </div>

          <div className="col-md-6 mb-3">
            <strong>Email</strong>
            <p className="mb-0">
              {displayValue(profile.email)}
            </p>
          </div>

          <div className="col-md-6 mb-3">
            <strong>Phone</strong>
            <p className="mb-0">
              {displayValue(profile.phone)}
            </p>
          </div>

          <div className="col-12 mb-3">
            <strong>Education</strong>
            <p className="mb-0">
              {displayValue(profile.education)}
            </p>
          </div>

          <div className="col-12 mb-3">
            <strong>Skills</strong>
            <p className="mb-0">
              {displayValue(profile.skills)}
            </p>
          </div>

          <div className="col-12">
            <strong>Experience</strong>
            <p className="mb-0">
              {displayValue(profile.experience)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;