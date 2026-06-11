import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../api/axiosConfig";

function JobList() {
  const [jobs, setJobs] = useState([]);
  const [appliedJobIds, setAppliedJobIds] = useState([]);

  const role = localStorage.getItem("role");
  const token = localStorage.getItem("access");

  useEffect(() => {
    fetchJobs();

    if (token && role === "candidate") {
      fetchMyApplications();
    }
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await API.get("/jobs/");
      setJobs(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  const fetchMyApplications = async () => {
    try {
      const response = await API.get("/applications/my/");
      const jobIds = response.data.map((application) => application.job);
      setAppliedJobIds(jobIds);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="container py-5">
      <h2 className="mb-4">Available Jobs</h2>

      {jobs.length === 0 ? (
        <p>No jobs available.</p>
      ) : (
        <div className="row">
          {jobs.map((job) => (
            <div className="col-md-6 mb-3" key={job.id}>
              <div className="card shadow-sm p-3">
                <h5>{job.job_title}</h5>

                <p className="mb-1">
                  <strong>Company:</strong> {job.company_name}
                </p>

                <p className="mb-1">
                  <strong>Skills:</strong> {job.required_skills}
                </p>

                <p className="mb-1">
                  <strong>Experience:</strong> {job.required_experience}
                </p>

                <p className="mb-1">
                  <strong>Location:</strong> {job.location}
                </p>

                <p>{job.job_description}</p>

                {role === "candidate" && (
                  <>
                    {appliedJobIds.includes(job.id) ? (
                      <button className="btn btn-success" disabled>
                        Applied
                      </button>
                    ) : (
                      <Link to={`/apply/${job.id}`} className="btn btn-primary">
                        Apply
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobList;