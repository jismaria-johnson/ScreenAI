import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import API from "../api/axiosConfig";

function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] =
    useState({
      username: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      password: "",
      confirm_password: "",
    });

  const [error, setError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

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

  const getErrorMessage = (
    requestError
  ) => {
    const responseData =
      requestError.response?.data;

    if (!responseData) {
      return (
        "Registration failed. Check whether " +
        "the backend server is running."
      );
    }

    if (
      typeof responseData === "string"
    ) {
      return responseData;
    }

    if (responseData.detail) {
      return responseData.detail;
    }

    if (
      responseData.non_field_errors?.length
    ) {
      return (
        responseData.non_field_errors[0]
      );
    }

    const fieldLabels = {
      username: "Username",
      first_name: "First name",
      last_name: "Last name",
      email: "Email",
      phone: "Phone number",
      password: "Password",
      confirm_password: "Confirm password",
    };

    for (
      const [field, messages]
      of Object.entries(responseData)
    ) {
      const label =
        fieldLabels[field] || field;

      if (Array.isArray(messages)) {
        return `${label}: ${messages[0]}`;
      }

      if (
        typeof messages === "string"
      ) {
        return `${label}: ${messages}`;
      }
    }

    return "Registration failed.";
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      return "Username is required.";
    }

    if (!formData.first_name.trim()) {
      return "First name is required.";
    }

    if (!formData.last_name.trim()) {
      return "Last name is required.";
    }

    if (!formData.email.trim()) {
      return "Email is required.";
    }

    if (
      formData.password.length < 6
    ) {
      return (
        "Password must contain at least 6 characters."
      );
    }

    if (
      formData.password !==
      formData.confirm_password
    ) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    setError("");

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await API.post(
        "/accounts/register/",
        formData
      );

      alert(
        "HR account registered successfully."
      );

      navigate("/login", {
        replace: true,
      });
    } catch (requestError) {
      console.error(
        "Registration failed:",
        requestError
      );

      setError(
        getErrorMessage(
          requestError
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-7 col-md-9">
          <div className="card shadow-sm">
            <div className="card-body p-4">
              <h2 className="mb-2">
                Register as HR
              </h2>

              <p className="text-muted mb-4">
                Registration is available for HR recruiters only. System administrator accounts are created by the project owner. Candidates do not need accounts.
              </p>

              {error && (
                <div className="alert alert-danger">
                  {error}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
              >
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
                      value={
                        formData.first_name
                      }
                      onChange={handleChange}
                      required
                      disabled={submitting}
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
                      value={
                        formData.last_name
                      }
                      onChange={handleChange}
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="username"
                    className="form-label"
                  >
                    Username
                  </label>

                  <input
                    id="username"
                    name="username"
                    type="text"
                    className="form-control"
                    value={
                      formData.username
                    }
                    onChange={handleChange}
                    required
                    disabled={submitting}
                  />
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
                    value={
                      formData.email
                    }
                    onChange={handleChange}
                    required
                    disabled={submitting}
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
                    value={
                      formData.phone
                    }
                    onChange={handleChange}
                    disabled={submitting}
                  />
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label
                      htmlFor="password"
                      className="form-label"
                    >
                      Password
                    </label>

                    <input
                      id="password"
                      name="password"
                      type="password"
                      className="form-control"
                      value={
                        formData.password
                      }
                      onChange={handleChange}
                      minLength="6"
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label
                      htmlFor="confirm_password"
                      className="form-label"
                    >
                      Confirm Password
                    </label>

                    <input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      className="form-control"
                      value={
                        formData.confirm_password
                      }
                      onChange={handleChange}
                      minLength="6"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={submitting}
                >
                  {submitting
                    ? "Registering..."
                    : "Register"}
                </button>
              </form>

              <p className="text-center mt-3 mb-0">
                Already have an account?{" "}
                <Link to="/login">
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;