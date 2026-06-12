import { useEffect, useState } from "react";
import API from "../api/axiosConfig";

function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const response = await API.get("/applications/my/");
      setApplications(response.data);
    } catch (error) {
      console.log("Failed to fetch applications:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">My Applications</h2>

      {loading ? (
        <p>Loading applications...</p>
      ) : applications.length === 0 ? (
        <div className="alert alert-info">
          You have not submitted any applications yet.
        </div>
      ) : (
        <div className="row">
          {applications.map((application) => (
            <div className="col-lg-6 mb-4" key={application.id}>
              <div className="card shadow-sm p-4 h-100">
                <h4>{application.job_title}</h4>

                <p className="text-muted">{application.company_name}</p>

                <hr />

                <p>
                  <strong>Application Status:</strong>{" "}
                  {application.application_status}
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