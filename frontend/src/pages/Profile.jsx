import {
  useEffect,
  useState,
} from "react";
import {
  Link,
} from "react-router-dom";

import API from "../api/axiosConfig";

function Profile() {
  const [profile, setProfile] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const fetchProfile = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get(
        "/accounts/profile/"
      );

      setProfile(response.data);
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

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchProfile();
  }, []);

  const displayValue = (
    value,
    fallback = "Not provided"
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    return value;
  };

  const getFullName = () => {
    if (!profile) {
      return "";
    }

    const fullName = [
      profile.first_name,
      profile.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return fullName || profile.username;
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
        <div className="alert alert-danger">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-start mb-4">
                <div>
                  <h2 className="mb-1">
                    {getFullName()}
                  </h2>

                  <p className="text-muted text-capitalize mb-0">
                    {profile.role}
                  </p>
                </div>

                <Link
                  to="/edit-profile"
                  className="btn btn-primary"
                >
                  Edit Profile
                </Link>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted">
                      Username
                    </small>

                    <p className="mb-0 fw-semibold">
                      {displayValue(
                        profile.username
                      )}
                    </p>
                  </div>
                </div>

                <div className="col-md-6 mb-3">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted">
                      Role
                    </small>

                    <p className="mb-0 fw-semibold text-capitalize">
                      {displayValue(profile.role)}
                    </p>
                  </div>
                </div>

                <div className="col-md-6 mb-3">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted">
                      Email
                    </small>

                    <p className="mb-0 fw-semibold">
                      {displayValue(
                        profile.email
                      )}
                    </p>
                  </div>
                </div>

                <div className="col-md-6 mb-3">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted">
                      Phone
                    </small>

                    <p className="mb-0 fw-semibold">
                      {displayValue(
                        profile.phone
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;