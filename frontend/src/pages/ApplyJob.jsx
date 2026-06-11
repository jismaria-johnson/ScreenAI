import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api/axiosConfig";

function ApplyJob() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [resume, setResume] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    setResume(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!resume) {
      setError("Please upload a resume.");
      return;
    }

    const formData = new FormData();
    formData.append("job", jobId);
    formData.append("resume", resume);

    try {
      await API.post("/applications/apply/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      alert("Application submitted successfully.");
      navigate("/my-applications");
    } catch (err) {
      console.log(err);
      setError("Application failed. Please login as candidate.");
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Apply for Job</h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="card p-4 shadow-sm">
        <div className="mb-3">
          <label>Upload Resume PDF</label>
          <input
            type="file"
            className="form-control"
            accept=".pdf"
            onChange={handleFileChange}
            required
          />
        </div>

        <button className="btn btn-primary">Submit Application</button>
      </form>
    </div>
  );
}

export default ApplyJob;