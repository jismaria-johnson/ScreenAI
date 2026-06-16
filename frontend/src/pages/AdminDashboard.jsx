import { useEffect, useState } from "react";
import API from "../api/axiosConfig";

function AdminDashboard() {
  const [hrs, setHrs] = useState([]);
  const [hiredCandidates, setHiredCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("hrs");

  // Progression update form state
  const [stage, setStage] = useState("Onboarding");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const [hrsResponse, candidatesResponse] = await Promise.all([
        API.get("/applications/admin/hrs/"),
        API.get("/applications/admin/hired-candidates/"),
      ]);
      setHrs(hrsResponse.data);
      setHiredCandidates(candidatesResponse.data);
      
      // If a candidate is already selected, update their state
      if (selectedCandidate) {
        const updated = candidatesResponse.data.find(c => c.id === selectedCandidate.id);
        if (updated) setSelectedCandidate(updated);
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
      setError(
        err.response?.data?.detail || "Failed to load dashboard metrics."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddProgression = async (e) => {
    e.preventDefault();
    if (!stage.trim()) return;

    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const response = await API.post(
        `/applications/admin/${selectedCandidate.id}/progression/`,
        { stage: stage.trim(), notes: notes.trim() }
      );
      
      setSuccess(`Progression stage updated to "${stage}"!`);
      setNotes("");
      
      // Refresh candidates list and selected candidate details
      await fetchAdminData();
      setSelectedCandidate(response.data);
    } catch (err) {
      console.error("Failed to update progression:", err);
      setError(
        err.response?.data?.detail || "Failed to update candidate progression."
      );
    } finally {
      setUpdating(false);
    }
  };

  const getCandidateName = (application) => {
    const fullName = [
      application.candidate_first_name,
      application.candidate_last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return (
      fullName ||
      application.candidate_name ||
      application.candidate_username ||
      "Unknown Candidate"
    );
  };

  const getLatestStage = (candidate) => {
    if (!candidate.progressions || candidate.progressions.length === 0) {
      return "Hired";
    }
    // API returns list of progressions, latest is usually last
    return candidate.progressions[candidate.progressions.length - 1].stage;
  };

  const getResumeUrl = (resumePath) => {
    if (!resumePath) return "#";
    if (resumePath.startsWith("http")) return resumePath;
    return `http://127.0.0.1:8000${resumePath}`;
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3">Loading admin dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Admin Monitoring Dashboard</h2>
        <button className="btn btn-outline-primary btn-sm" onClick={fetchAdminData}>
          Refresh Metrics
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stats Cards */}
      <div className="row g-4 mb-4">
        <div className="col-md-6 col-xl-4">
          <div className="card shadow-sm border-0 bg-primary text-white p-3">
            <h6 className="text-uppercase text-white-50">Total Registered HRs</h6>
            <h3>{hrs.length}</h3>
          </div>
        </div>
        <div className="col-md-6 col-xl-4">
          <div className="card shadow-sm border-0 bg-success text-white p-3">
            <h6 className="text-uppercase text-white-50">Total Candidates Hired</h6>
            <h3>{hiredCandidates.length}</h3>
          </div>
        </div>
      </div>

      {/* Tab Selectors */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === "hrs" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("hrs");
              setSelectedCandidate(null);
            }}
          >
            HR Directory
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === "candidates" ? "active" : ""}`}
            onClick={() => setActiveTab("candidates")}
          >
            Hired Candidates Progression
          </button>
        </li>
      </ul>

      {/* HR Directory Tab */}
      {activeTab === "hrs" && (
        <div className="card shadow-sm border-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>HR User</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th className="text-center">Jobs Posted</th>
                  <th className="text-center">Candidates Hired</th>
                </tr>
              </thead>
              <tbody>
                {hrs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-4 text-muted">
                      No HR users registered in the system.
                    </td>
                  </tr>
                ) : (
                  hrs.map((hr) => (
                    <tr key={hr.id}>
                      <td>
                        <strong>
                          {hr.first_name || hr.last_name
                            ? `${hr.first_name} ${hr.last_name}`.trim()
                            : hr.username}
                        </strong>
                        <div className="small text-muted">@{hr.username}</div>
                      </td>
                      <td>{hr.email || "No email provided"}</td>
                      <td>{hr.phone || "No phone provided"}</td>
                      <td className="text-center">
                        <span className="badge bg-primary rounded-pill px-3">
                          {hr.jobs_count}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-success rounded-pill px-3">
                          {hr.hired_count}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hired Candidates Tab */}
      {activeTab === "candidates" && (
        <div className="row g-4">
          {/* Candidates List Column */}
          <div className={selectedCandidate ? "col-lg-5" : "col-12"}>
            <div className="card shadow-sm border-0">
              <div className="card-header bg-light">
                <h5 className="mb-0">Hired Employees</h5>
              </div>
              <div className="list-group list-group-flush">
                {hiredCandidates.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    No hired candidates found.
                  </div>
                ) : (
                  hiredCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`list-group-item list-group-item-action text-start p-3 ${
                        selectedCandidate?.id === candidate.id ? "active text-white" : ""
                      }`}
                      onClick={() => {
                        setSelectedCandidate(candidate);
                        setStage("Onboarding");
                        setNotes("");
                        setSuccess("");
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <h6 className="mb-1 fw-bold">{getCandidateName(candidate)}</h6>
                        <span
                          className={`badge ${
                            selectedCandidate?.id === candidate.id
                              ? "bg-light text-primary"
                              : "bg-success"
                          }`}
                        >
                          {getLatestStage(candidate)}
                        </span>
                      </div>
                      <p className="mb-1 small">
                        <strong>Role:</strong> {candidate.job_title}
                      </p>
                      <small className={selectedCandidate?.id === candidate.id ? "text-white-50" : "text-muted"}>
                        <strong>Hired By:</strong> {candidate.company_name}
                      </small>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Selected Candidate Progression & History Column */}
          {selectedCandidate && (
            <div className="col-lg-7">
              <div className="card shadow-sm border-0 p-4">
                <div className="d-flex justify-content-between align-items-start border-bottom pb-3 mb-4">
                  <div>
                    <h4 className="mb-1">{getCandidateName(selectedCandidate)}</h4>
                    <p className="text-muted mb-0">
                      {selectedCandidate.job_title} — {selectedCandidate.company_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setSelectedCandidate(null)}
                  />
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <p className="mb-2">
                      <strong>Email:</strong> {selectedCandidate.candidate_email || "Not provided"}
                    </p>
                    <p className="mb-2">
                      <strong>Phone:</strong> {selectedCandidate.candidate_phone || "Not provided"}
                    </p>
                  </div>
                  <div className="col-md-6 text-md-end">
                    <a
                      href={getResumeUrl(selectedCandidate.resume)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-primary btn-sm me-2"
                    >
                      View Resume
                    </a>
                  </div>
                </div>

                {/* Progression Logger Form */}
                <div className="card bg-light border-0 p-3 mb-4">
                  <h5 className="mb-3">Update Progression Stage</h5>
                  <form onSubmit={handleAddProgression}>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label small fw-bold">Stage</label>
                        <select
                          className="form-select"
                          value={stage}
                          onChange={(e) => setStage(e.target.value)}
                          disabled={updating}
                        >
                          <option value="Offer Extended">Offer Extended</option>
                          <option value="Onboarding">Onboarding</option>
                          <option value="Active Employee">Active Employee</option>
                          <option value="Promoted">Promoted</option>
                          <option value="Resigned">Resigned</option>
                          <option value="Terminated">Terminated</option>
                        </select>
                      </div>
                      <div className="col-12">
                        <label className="form-label small fw-bold">Notes</label>
                        <textarea
                          className="form-control"
                          rows="2"
                          placeholder="Add details (e.g. Promoted to Lead DevOps, completed orientation)"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          disabled={updating}
                        />
                      </div>
                      <div className="col-12">
                        <button
                          type="submit"
                          className="btn btn-success"
                          disabled={updating || !stage.trim()}
                        >
                          {updating ? "Updating..." : "Record Status Update"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Historical Timeline */}
                <h5>Progression History</h5>
                <div className="position-relative ps-4 mt-3">
                  {/* Timeline track */}
                  <div
                    className="position-absolute h-100 border-start border-2 border-secondary"
                    style={{ left: "9px", top: "0" }}
                  />

                  {selectedCandidate.progressions && selectedCandidate.progressions.length > 0 ? (
                    selectedCandidate.progressions.map((log) => (
                      <div key={log.id} className="position-relative mb-4">
                        {/* Timeline point */}
                        <div
                          className="position-absolute bg-success rounded-circle"
                          style={{
                            left: "-31px",
                            top: "4px",
                            width: "12px",
                            height: "12px",
                            border: "2px solid white",
                          }}
                        />
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <h6 className="mb-0 fw-bold">{log.stage}</h6>
                          <small className="text-muted">
                            {new Date(log.updated_at).toLocaleString()}
                          </small>
                        </div>
                        {log.notes && <p className="text-muted small mb-0">{log.notes}</p>}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted small">No progression logs recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
