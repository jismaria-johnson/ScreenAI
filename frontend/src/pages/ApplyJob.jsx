import { useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import API from "../api/axiosConfig";
import { getAccessToken, getUserRole } from "../utils/auth";

function ApplyJob() {
  const routeParams = useParams();
  const navigate = useNavigate();

  /*
   * Supports both possible route styles:
   *
   * /apply/:jobId
   * /apply/:id
   */
  const jobId =
    routeParams.jobId || routeParams.id;

  const [resume, setResume] =
    useState(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const handleResumeChange = (event) => {
    setError("");

    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      setResume(null);
      return;
    }

    const fileName =
      selectedFile.name.toLowerCase();

    const isPdf =
      selectedFile.type ===
        "application/pdf" ||
      fileName.endsWith(".pdf");

    if (!isPdf) {
      setResume(null);
      event.target.value = "";

      setError(
        "Please upload a PDF resume only."
      );

      return;
    }

    setResume(selectedFile);
  };

  const getErrorMessage = (
    requestError
  ) => {
    const responseData =
      requestError.response?.data;

    const status =
      requestError.response?.status;

    if (status === 401) {
      return (
        "Your login session has expired. " +
        "Please log in again."
      );
    }

    if (status === 403) {
      return (
        "Only candidate accounts can " +
        "submit job applications."
      );
    }

    if (status === 404) {
      return (
        "This job is no longer available."
      );
    }

    if (!responseData) {
      return (
        "Application submission failed. " +
        "Please check whether the backend " +
        "server is running."
      );
    }

    if (
      typeof responseData === "string"
    ) {
      return responseData;
    }

    if (responseData.detail) {
      if (
        typeof responseData.detail ===
        "string"
      ) {
        return responseData.detail;
      }

      if (
        Array.isArray(
          responseData.detail
        ) &&
        responseData.detail.length > 0
      ) {
        return responseData.detail[0];
      }
    }

    if (
      responseData.non_field_errors &&
      responseData.non_field_errors.length >
        0
    ) {
      return (
        responseData.non_field_errors[0]
      );
    }

    if (
      responseData.resume &&
      responseData.resume.length > 0
    ) {
      return responseData.resume[0];
    }

    if (
      responseData.job &&
      responseData.job.length > 0
    ) {
      return responseData.job[0];
    }

    const firstField =
      Object.keys(responseData)[0];

    if (firstField) {
      const firstError =
        responseData[firstField];

      if (
        Array.isArray(firstError) &&
        firstError.length > 0
      ) {
        return firstError[0];
      }

      if (
        typeof firstError === "string"
      ) {
        return firstError;
      }
    }

    return "Application submission failed.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    const accessToken =
      getAccessToken();

    const role =
      getUserRole();

    if (!accessToken) {
      setError(
        "Your login session is missing. " +
        "Please log in again."
      );

      return;
    }

    if (role !== "candidate") {
      setError(
        "Only candidates can submit " +
        "job applications."
      );

      return;
    }

    if (!jobId) {
      setError(
        "The selected job is invalid."
      );

      return;
    }

    if (!resume) {
      setError(
        "Please select a PDF resume."
      );

      return;
    }

    const formData = new FormData();

    formData.append("job", jobId);
    formData.append(
      "resume",
      resume
    );

    setSubmitting(true);

    try {
      await API.post(
        "/applications/apply/",
        formData
      );

      alert(
        "Application submitted successfully."
      );

      navigate(
        "/my-applications",
        {
          replace: true,
        }
      );
    } catch (requestError) {
      console.error(
        "Application submission failed:",
        requestError
      );

      setError(
        getErrorMessage(requestError)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate("/jobs");
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-9">
          <h2 className="mb-4">
            Submit Application
          </h2>

          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}

          <div className="card shadow-sm">
            <div className="card-body p-4">
              <p className="text-muted">
                Upload your latest resume to
                complete the application.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label
                    htmlFor="resume"
                    className="form-label"
                  >
                    Upload Resume PDF
                  </label>

                  <input
                    id="resume"
                    type="file"
                    className="form-control"
                    accept=".pdf,application/pdf"
                    onChange={
                      handleResumeChange
                    }
                    disabled={submitting}
                  />

                  <div className="form-text">
                    Only PDF resumes are
                    accepted.
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary flex-grow-1"
                    disabled={
                      submitting || !resume
                    }
                  >
                    {submitting
                      ? "Submitting and evaluating resume..."
                      : "Submit Application"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={handleCancel}
                    disabled={submitting}
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

export default ApplyJob;
