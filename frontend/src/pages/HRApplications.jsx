import { useEffect, useState } from "react";
import API from "../api/axiosConfig";

function HRApplications() {
  const [applications, setApplications] = useState([]);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const response = await API.get("/applications/hr/");
      setApplications(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const getResumeUrl = (resumePath) => {
    if (!resumePath) {
      return "#";
    }

    if (resumePath.startsWith("http")) {
      return resumePath;
    }

    return `http://127.0.0.1:8000${resumePath}`;
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Candidate Applications</h2>

      {applications.length === 0 ? (
        <p>No applications received yet.</p>
      ) : (
        <div className="row">
          {applications.map((application) => {
            const resumeUrl = getResumeUrl(application.resume);

            return (
              <div className="col-md-6 mb-3" key={application.id}>
                <div className="card shadow-sm p-3">
                  <h5>{application.candidate_username}</h5>

                  <p>
                    <strong>Job:</strong> {application.job_title}
                  </p>

                  <p>
                    <strong>Company:</strong> {application.company_name}
                  </p>

                  <p>
                    <strong>Status:</strong> {application.application_status}
                  </p>

                  <p>
                    <strong>AI Score:</strong>{" "}
                    {application.ai_score ?? "Not evaluated yet"}
                  </p>

                  <p>
                    <strong>Recommendation:</strong>{" "}
                    {application.recommendation}
                  </p>

                  <div className="d-flex gap-2">
                    <a
                      href={resumeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-primary btn-sm"
                    >
                      View Resume
                    </a>

                    <a
                      href={resumeUrl}
                      download
                      className="btn btn-outline-dark btn-sm"
                    >
                      Download Resume
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HRApplications;