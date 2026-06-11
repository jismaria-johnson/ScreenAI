import { useEffect, useState } from "react";
import API from "../api/axiosConfig";

function MyApplications() {
  const [applications, setApplications] = useState([]);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const response = await API.get("/applications/my/");
      setApplications(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">My Applications</h2>

      {applications.length === 0 ? (
        <p>No applications submitted yet.</p>
      ) : (
        <div className="row">
          {applications.map((application) => (
            <div className="col-md-6 mb-3" key={application.id}>
              <div className="card shadow-sm p-3">
                <h5>{application.job_title}</h5>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MyApplications;