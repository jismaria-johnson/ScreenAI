import { useEffect, useState } from "react";
import API from "../api/axiosConfig";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";

const getPlaceholderForStage = (stageName) => {
  switch (stageName) {
    case "Hired":
      return "Add notes about the hiring decision";
    case "Offer Extended":
      return "Add offer details, proposed joining date, and acceptance status";
    case "Onboarding":
      return "Add orientation, document verification, or onboarding notes";
    case "Active Employee":
      return "Add joining confirmation, role assignment, or employment notes";
    case "Promoted":
      return "Add promotion details and effective date";
    case "Resigned":
      return "Add resignation details and last working date";
    case "Terminated":
      return "Add termination details and effective date";
    default:
      return "Add notes about this progression update";
  }
};

function AdminDashboard() {
  const [hrs, setHrs] = useState([]);
  const [hiredCandidates, setHiredCandidates] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedHR, setSelectedHR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Custom toast and confirm modal states
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const closeConfirmModal = () => {
    setConfirmModal({
      isOpen: false,
      title: "",
      message: "",
      onConfirm: null,
    });
  };

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState("overview");

  // Recruiter Controls
  const [searchHR, setSearchHR] = useState("");
  const [debouncedSearchHR, setDebouncedSearchHR] = useState("");
  const [togglingHrId, setTogglingHrId] = useState(null);

  // Candidate Controls
  const [searchCandidate, setSearchCandidate] = useState("");
  const [debouncedSearchCandidate, setDebouncedSearchCandidate] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterHRId, setFilterHRId] = useState("all");
  const [stage, setStage] = useState("Onboarding");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchHR(searchHR);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchHR]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchCandidate(searchCandidate);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchCandidate]);
  
  // Progression Log Editing Controls
  const [editingLogId, setEditingLogId] = useState(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fetchAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const [hrsResponse, candidatesResponse, activityResponse] = await Promise.all([
        API.get("/applications/admin/hrs/"),
        API.get("/applications/admin/hired-candidates/"),
        API.get("/applications/admin/activity-log/"),
      ]);
      setHrs(hrsResponse.data);
      setHiredCandidates(candidatesResponse.data);
      setActivityLog(activityResponse.data);
      
      // If a candidate is already selected, update their state
      if (selectedCandidate) {
        const updated = candidatesResponse.data.find(c => c.id === selectedCandidate.id);
        if (updated) setSelectedCandidate(updated);
      }

      // If an HR is already selected, update their state
      if (selectedHR) {
        const updated = hrsResponse.data.find(h => h.id === selectedHR.id);
        if (updated) setSelectedHR(updated);
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

  const handleToggleHRActive = (hrId, username, currentStatus) => {
    const action = currentStatus ? "suspend" : "activate";
    setConfirmModal({
      isOpen: true,
      title: `${currentStatus ? "Suspend" : "Activate"} Recruiter`,
      message: `Are you sure you want to ${action} recruiter account @${username}?`,
      onConfirm: async () => {
        closeConfirmModal();
        setTogglingHrId(hrId);
        setError("");
        setSuccess("");
        try {
          const response = await API.patch(`/applications/admin/hrs/${hrId}/toggle/`);
          const updatedStatus = response.data.is_active;
          const msg = `Recruiter @${username} has been successfully ${updatedStatus ? "activated" : "suspended"}!`;
          setSuccess(msg);
          showToast(msg, "success");
          await fetchAdminData();
        } catch (err) {
          console.error("Failed to toggle recruiter active status:", err);
          const errMsg = err.response?.data?.detail || "Failed to update recruiter active status.";
          setError(errMsg);
          showToast(errMsg, "error");
        } finally {
          setTogglingHrId(null);
        }
      }
    });
  };

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
      
      const msg = `Progression stage updated to "${stage}"!`;
      setSuccess(msg);
      showToast(msg, "success");
      setNotes("");
      
      // Refresh candidates list and selected candidate details
      await fetchAdminData();
      setSelectedCandidate(response.data);
    } catch (err) {
      console.error("Failed to update progression:", err);
      const errMsg = err.response?.data?.detail || "Failed to update candidate progression.";
      setError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleEditProgression = async (logId) => {
    if (!editStage.trim()) return;

    setUpdating(true);
    setError("");
    setSuccess("");

    try {
      const response = await API.patch(
        `/applications/admin/progression/${logId}/`,
        { stage: editStage.trim(), notes: editNotes.trim() }
      );
      
      const msg = "Progression log updated successfully!";
      setSuccess(msg);
      showToast(msg, "success");
      setEditingLogId(null);
      await fetchAdminData();
      setSelectedCandidate(response.data);
    } catch (err) {
      console.error("Failed to edit progression log:", err);
      const errMsg = err.response?.data?.detail || "Failed to edit progression log.";
      setError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteProgression = (logId) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Progression Stage",
      message: "Are you sure you want to permanently delete this progression stage?",
      onConfirm: async () => {
        closeConfirmModal();
        setUpdating(true);
        setError("");
        setSuccess("");

        try {
          const response = await API.delete(`/applications/admin/progression/${logId}/`);
          const msg = "Progression stage deleted successfully.";
          setSuccess(msg);
          showToast(msg, "success");
          await fetchAdminData();
          setSelectedCandidate(response.data);
        } catch (err) {
          console.error("Failed to delete progression log:", err);
          const errMsg = err.response?.data?.detail || "Failed to delete progression log.";
          setError(errMsg);
          showToast(errMsg, "error");
        } finally {
          setUpdating(false);
        }
      }
    });
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
    return candidate.progressions[candidate.progressions.length - 1].stage;
  };

  const getResumeUrl = (resumePath) => {
    if (!resumePath) return "#";
    if (resumePath.startsWith("http")) return resumePath;
    return `http://127.0.0.1:8000${resumePath}`;
  };

  // Metric Computations
  const totalRecruiters = hrs.length;
  const activeRecruiters = hrs.filter(hr => hr.is_active).length;
  const suspendedRecruiters = totalRecruiters - activeRecruiters;
  const totalHires = hiredCandidates.length;
  const totalJobs = hrs.reduce((acc, curr) => acc + (curr.jobs_count || 0), 0);
  const totalApplications = hrs.reduce((acc, curr) => acc + (curr.applications_count || 0), 0);

  const getStageCounts = () => {
    const counts = {
      "Offer Extended": 0,
      "Onboarding": 0,
      "Active Employee": 0,
      "Promoted": 0,
      "Resigned": 0,
      "Terminated": 0,
    };
    hiredCandidates.forEach((candidate) => {
      const stageName = getLatestStage(candidate);
      if (counts[stageName] !== undefined) {
        counts[stageName]++;
      } else {
        counts["Onboarding"]++; // default fallback mapping
      }
    });
    return counts;
  };
  const stageCounts = getStageCounts();

  // Search filtering
  const filteredHrs = hrs.filter((hr) => {
    const name = [hr.first_name, hr.last_name].filter(Boolean).join(" ").toLowerCase();
    const username = (hr.username || "").toLowerCase();
    const email = (hr.email || "").toLowerCase();
    const search = debouncedSearchHR.toLowerCase();
    return name.includes(search) || username.includes(search) || email.includes(search);
  });

  const filteredCandidates = hiredCandidates.filter((candidate) => {
    const name = getCandidateName(candidate).toLowerCase();
    const title = (candidate.job_title || "").toLowerCase();
    const company = (candidate.company_name || "").toLowerCase();
    const search = debouncedSearchCandidate.toLowerCase();
    const matchesSearch = name.includes(search) || title.includes(search) || company.includes(search);
    
    const matchesStage = filterStage === "all" || getLatestStage(candidate) === filterStage;
    const matchesHR = filterHRId === "all" || candidate.hr_user_id === Number(filterHRId);
    
    return matchesSearch && matchesStage && matchesHR;
  });

  const getActivityIcon = (type) => {
    switch (type) {
      case "job_created": return "💼";
      case "application_submitted": return "📄";
      case "progression_updated": return "⚡";
      default: return "🔔";
    }
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
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h2 className="fw-bold text-dark">Admin Control Panel</h2>
          <p className="text-muted mb-0">Monitor recruiter activity, track candidate pipelines, and review system-wide audit logs.</p>
        </div>
        <button className="btn btn-primary btn-sm px-3 shadow-sm fw-semibold" onClick={fetchAdminData}>
          🔄 Refresh Dashboard
        </button>
      </div>

      {error && <div className="alert alert-danger shadow-sm">{error}</div>}
      {success && <div className="alert alert-success shadow-sm">{success}</div>}

      {/* Tab Navigators */}
      <ul className="nav nav-pills mb-4 gap-2 bg-light p-2 rounded-3">
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === "overview" ? "active shadow-sm" : "text-secondary"}`}
            onClick={() => setActiveTab("overview")}
          >
            📊 Analytics Overview
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === "hrs" ? "active shadow-sm" : "text-secondary"}`}
            onClick={() => setActiveTab("hrs")}
          >
            👥 Recruiter Accounts ({totalRecruiters})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === "candidates" ? "active shadow-sm" : "text-secondary"}`}
            onClick={() => setActiveTab("candidates")}
          >
            📈 Candidate Progression ({totalHires})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold px-4 py-2 ${activeTab === "activity" ? "active shadow-sm" : "text-secondary"}`}
            onClick={() => setActiveTab("activity")}
          >
            📜 System Activity Feed ({activityLog.length})
          </button>
        </li>
      </ul>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="row g-4">
          <div className="col-12">
            <div className="row g-3">
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-primary text-white p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-white-50 small fw-bold">Recruiters</h6>
                  <h3 className="fw-bold">{totalRecruiters}</h3>
                  <small className="text-white-50">Active: {activeRecruiters}</small>
                </div>
              </div>
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-success text-white p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-white-50 small fw-bold">Total Hired</h6>
                  <h3 className="fw-bold">{totalHires}</h3>
                  <small className="text-white-50">Candidates placed</small>
                </div>
              </div>
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-info text-white p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-white-50 small fw-bold">Jobs Posted</h6>
                  <h3 className="fw-bold">{totalJobs}</h3>
                  <small className="text-white-50">Total job ads</small>
                </div>
              </div>
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-warning text-dark p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-dark-50 small fw-bold">Applications</h6>
                  <h3 className="fw-bold">{totalApplications}</h3>
                  <small className="text-dark-50">Total resume parses</small>
                </div>
              </div>
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-danger text-white p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-white-50 small fw-bold">Suspended</h6>
                  <h3 className="fw-bold">{suspendedRecruiters}</h3>
                  <small className="text-white-50">Access suspended</small>
                </div>
              </div>
              <div className="col-md-4 col-xl-2">
                <div className="card shadow-sm border-0 bg-secondary text-white p-3 rounded-3 h-100">
                  <h6 className="text-uppercase text-white-50 small fw-bold">Log Size</h6>
                  <h3 className="fw-bold">{activityLog.length}</h3>
                  <small className="text-white-50">Audit log feed items</small>
                </div>
              </div>
            </div>
          </div>

          {/* Candidate Pipeline Progress Bars */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 p-4 rounded-3 h-100">
              <h5 className="fw-bold text-dark mb-4">Placed Candidate Progression Stages</h5>
              {Object.entries(stageCounts).map(([stageName, count]) => {
                const percentage = totalHires > 0 ? (count / totalHires) * 100 : 0;
                let barColor = "bg-primary";
                if (stageName === "Active Employee") barColor = "bg-success";
                if (stageName === "Onboarding") barColor = "bg-info";
                if (stageName === "Resigned") barColor = "bg-warning text-dark";
                if (stageName === "Terminated") barColor = "bg-danger";
                if (stageName === "Promoted") barColor = "bg-secondary";

                return (
                  <div key={stageName} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-semibold text-secondary small">{stageName}</span>
                      <span className="badge bg-light text-dark fw-bold">{count}</span>
                    </div>
                    <div className="progress" style={{ height: "10px" }}>
                      <div
                        className={`progress-bar ${barColor}`}
                        role="progressbar"
                        style={{ width: `${percentage}%` }}
                        aria-valuenow={percentage}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HR Recruiter Performance & Workload Breakdown */}
          <div className="col-lg-6">
            <div className="card shadow-sm border-0 p-4 rounded-3 h-100">
              <h5 className="fw-bold text-dark mb-3">HR Recruiter Performance & Workload</h5>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-bold text-muted">Recruiter</th>
                      <th className="small fw-bold text-muted text-center">Status</th>
                      <th className="small fw-bold text-muted text-center">Jobs</th>
                      <th className="small fw-bold text-muted text-center">Applications</th>
                      <th className="small fw-bold text-muted text-center">Hires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hrs.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-3 text-muted small">No recruiters found.</td>
                      </tr>
                    ) : (
                      hrs.map((hr) => (
                        <tr 
                          key={hr.id}
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setSelectedHR(hr);
                            setActiveTab("hrs");
                          }}
                          title="Click to view recruiter profile details"
                        >
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span 
                                className={`d-inline-block rounded-circle ${hr.is_active ? "bg-success" : "bg-danger"}`}
                                style={{ width: "8px", height: "8px" }}
                                title={hr.is_active ? "Active" : "Suspended"}
                              />
                              <div>
                                <div className="fw-semibold text-dark small">
                                  {hr.first_name || hr.last_name
                                    ? `${hr.first_name} ${hr.last_name}`.trim()
                                    : hr.username}
                                </div>
                                <div className="text-muted" style={{ fontSize: "10px" }}>@{hr.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            {hr.is_active ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill" style={{ fontSize: "10px", padding: "2px 8px" }}>Active</span>
                            ) : (
                              <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill" style={{ fontSize: "10px", padding: "2px 8px" }}>Suspended</span>
                            )}
                          </td>
                          <td className="text-center">
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill" style={{ fontSize: "11px", padding: "2px 8px" }}>{hr.jobs_count || 0}</span>
                          </td>
                          <td className="text-center">
                            <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill fw-bold" style={{ fontSize: "11px", padding: "2px 8px", color: "#856404", backgroundColor: "#fff3cd" }}>{hr.applications_count || 0}</span>
                          </td>
                          <td className="text-center">
                            <span 
                              className="badge bg-success text-white border border-success rounded-pill fw-bold" 
                              style={{ fontSize: "11px", padding: "3px 10px", cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click select
                                setFilterHRId(hr.id);
                                setFilterStage("all");
                                setSearchCandidate("");
                                setActiveTab("candidates");
                              }}
                              title="Click to view hired candidates and progression"
                            >
                              {hr.hired_count || 0}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HR DIRECTORY TAB */}
      {activeTab === "hrs" && (
        <div className="row g-4">
          <div className={selectedHR ? "col-lg-5" : "col-12"}>
            <div className="card shadow-sm border-0 p-4 rounded-3">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                <h5 className="fw-bold text-dark mb-0">Registered HR Recruiters</h5>
                <div className="d-flex gap-2 align-items-center">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="🔍 Search recruiters..."
                    style={{ maxWidth: "250px" }}
                    value={searchHR}
                    onChange={(e) => setSearchHR(e.target.value)}
                  />
                  {searchHR && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setSearchHR("");
                        setDebouncedSearchHR("");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>HR Recruiter</th>
                      <th className="text-center">Hired</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHrs.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="text-center py-4 text-muted">
                          No matching recruiters found.
                        </td>
                      </tr>
                    ) : (
                      filteredHrs.map((hr) => (
                        <tr 
                          key={hr.id}
                          style={{ cursor: "pointer" }}
                          className={selectedHR?.id === hr.id ? "table-primary" : ""}
                          onClick={() => setSelectedHR(hr)}
                        >
                          <td>
                            <strong>
                              {hr.first_name || hr.last_name
                                ? `${hr.first_name} ${hr.last_name}`.trim()
                                : hr.username}
                            </strong>
                            <div className="small text-muted">@{hr.username}</div>
                          </td>
                          <td className="text-center">
                            <span 
                              className="badge bg-success rounded-pill px-3 py-1 text-white shadow-sm fw-bold"
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilterHRId(hr.id);
                                setFilterStage("all");
                                setSearchCandidate("");
                                setActiveTab("candidates");
                              }}
                              title="Click to view hired candidates"
                            >
                              {hr.hired_count}
                            </span>
                          </td>
                          <td className="text-center">
                            <button
                              className={`btn btn-sm fw-semibold ${hr.is_active ? "btn-outline-danger" : "btn-success"}`}
                              disabled={togglingHrId === hr.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleHRActive(hr.id, hr.username, hr.is_active);
                              }}
                            >
                              {togglingHrId === hr.id ? "Updating..." : hr.is_active ? "Suspend" : "Activate"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recruiter Details Panel */}
          {selectedHR && (
            <div className="col-lg-7">
              <div className="card shadow-sm border-0 p-4 rounded-3">
                <div className="d-flex justify-content-between align-items-start border-bottom pb-3 mb-4">
                  <div>
                    <h4 className="mb-1 fw-bold text-dark">
                      {selectedHR.first_name || selectedHR.last_name
                        ? `${selectedHR.first_name} ${selectedHR.last_name}`.trim()
                        : selectedHR.username}
                    </h4>
                    <p className="text-muted mb-0">@{selectedHR.username} — HR Recruiter</p>
                  </div>
                  <button 
                    type="button" 
                    className="btn-close" 
                    aria-label="Close"
                    onClick={() => setSelectedHR(null)}
                  />
                </div>

                <div className="row g-4 mb-4">
                  <div className="col-sm-6">
                    <h6 className="text-uppercase text-muted small fw-bold">Contact Info</h6>
                    <div className="fw-semibold text-dark">{selectedHR.email || "No email listed"}</div>
                    <div className="small text-secondary">{selectedHR.phone || "No phone listed"}</div>
                  </div>
                  <div className="col-sm-6">
                    <h6 className="text-uppercase text-muted small fw-bold">Account status</h6>
                    <div>
                      {selectedHR.is_active ? (
                        <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 rounded-pill">
                          Active Recruiter
                        </span>
                      ) : (
                        <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-1 rounded-pill">
                          Suspended Account
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recruiter stats metrics */}
                <div className="row g-3 mb-4">
                  <div className="col-4">
                    <div className="p-3 bg-light rounded-3 text-center border">
                      <div className="text-muted small">Jobs Posted</div>
                      <h5 className="fw-bold text-primary mb-0 mt-1">{selectedHR.jobs_count || 0}</h5>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-3 bg-light rounded-3 text-center border">
                      <div className="text-muted small">Applications</div>
                      <h5 className="fw-bold text-warning mb-0 mt-1">{selectedHR.applications_count || 0}</h5>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-3 bg-light rounded-3 text-center border">
                      <div className="text-muted small">Hires</div>
                      <h5 className="fw-bold text-success mb-0 mt-1">{selectedHR.hired_count || 0}</h5>
                    </div>
                  </div>
                </div>

                {/* Jobs Posted List */}
                <h5 className="fw-bold text-dark mb-3">Jobs Posted</h5>
                <div className="list-group list-group-flush border rounded-3 mb-4 overflow-hidden shadow-sm" style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {!selectedHR.jobs_list || selectedHR.jobs_list.length === 0 ? (
                    <div className="p-3 text-center text-muted small">No jobs posted yet.</div>
                  ) : (
                    selectedHR.jobs_list.map((job) => (
                      <div key={job.id} className="list-group-item p-3 d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-semibold text-dark small">{job.job_title}</div>
                          <div className="text-muted small" style={{ fontSize: "11px" }}>
                            Posted: {new Date(job.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <span className={`badge ${job.status === "open" ? "bg-success-subtle text-success border border-success-subtle" : "bg-secondary-subtle text-secondary"}`}>
                          {job.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Hired Candidates list */}
                <h5 className="fw-bold text-dark mb-3">Hired Candidates & Progression</h5>
                <div className="list-group list-group-flush border rounded-3 overflow-hidden shadow-sm" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {hiredCandidates.filter(c => c.hr_user_id === selectedHR.id).length === 0 ? (
                    <div className="p-3 text-center text-muted small">No candidates hired yet.</div>
                  ) : (
                    hiredCandidates.filter(c => c.hr_user_id === selectedHR.id).map((candidate) => {
                      const latestStage = getLatestStage(candidate);
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          className="list-group-item list-group-item-action p-3 d-flex justify-content-between align-items-center text-start"
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setFilterHRId(selectedHR.id);
                            setFilterStage("all");
                            setSearchCandidate("");
                            setActiveTab("candidates");
                          }}
                          title="Click to view candidate progression details"
                        >
                          <div>
                            <div className="fw-semibold text-primary">{getCandidateName(candidate)}</div>
                            <div className="text-muted small" style={{ fontSize: "11px" }}>{candidate.job_title}</div>
                          </div>
                          <span className="badge bg-info-subtle text-info border border-info-subtle rounded-pill px-3 py-1 fw-bold">
                            ⚡ {latestStage}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CANDIDATE PROGRESSION TAB */}
      {activeTab === "candidates" && (
        <div className="row g-4">
          <div className={selectedCandidate ? "col-lg-5" : "col-12"}>
            <div className="card shadow-sm border-0 p-4 rounded-3">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
                <h5 className="fw-bold text-dark mb-0">Hired Placements</h5>
                <div className="d-flex gap-2">
                  <select
                    className="form-select form-select-sm"
                    style={{ width: "140px" }}
                    value={filterHRId}
                    onChange={(e) => setFilterHRId(e.target.value)}
                  >
                    <option value="all">All Recruiters</option>
                    {hrs.map((hr) => (
                      <option key={hr.id} value={hr.id}>
                        {hr.first_name || hr.last_name
                          ? `${hr.first_name} ${hr.last_name}`.trim()
                          : hr.username}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: "120px" }}
                    value={filterStage}
                    onChange={(e) => setFilterStage(e.target.value)}
                  >
                    <option value="all">All Stages</option>
                    <option value="Offer Extended">Offer Extended</option>
                    <option value="Onboarding">Onboarding</option>
                    <option value="Active Employee">Active Employee</option>
                    <option value="Promoted">Promoted</option>
                    <option value="Resigned">Resigned</option>
                    <option value="Terminated">Terminated</option>
                  </select>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="🔍 Search name/title..."
                    style={{ width: "180px" }}
                    value={searchCandidate}
                    onChange={(e) => setSearchCandidate(e.target.value)}
                  />
                  {(filterHRId !== "all" || filterStage !== "all" || searchCandidate !== "") && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setFilterHRId("all");
                        setFilterStage("all");
                        setSearchCandidate("");
                        setDebouncedSearchCandidate("");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="list-group list-group-flush border rounded-3 overflow-hidden">
                {filteredCandidates.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    No matching hired candidates found.
                  </div>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`list-group-item list-group-item-action text-start p-3 ${
                        selectedCandidate?.id === candidate.id ? "active text-white bg-primary" : ""
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
              <div className="card shadow-sm border-0 p-4 rounded-3">
                <div className="d-flex justify-content-between align-items-start border-bottom pb-3 mb-4">
                  <div>
                    <h4 className="mb-1 fw-bold text-dark">{getCandidateName(selectedCandidate)}</h4>
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
                      className="btn btn-outline-primary btn-sm px-3 fw-semibold"
                    >
                      📄 View Resume
                    </a>
                  </div>
                </div>

                {/* Progression Logger Form */}
                <div className="card bg-light border-0 p-4 mb-4 rounded-3">
                  <h5 className="mb-3 fw-bold text-dark">Update Progression Stage</h5>
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
                          placeholder={getPlaceholderForStage(stage)}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          disabled={updating}
                        />
                      </div>
                      <div className="col-12">
                        <button
                          type="submit"
                          className="btn btn-success px-4"
                          disabled={updating || !stage.trim()}
                        >
                          {updating ? "Updating..." : "Record Status Update"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Historical Timeline */}
                <h5 className="fw-bold text-dark mb-3">Progression Timeline</h5>
                <div className="position-relative ps-4 mt-3">
                  <div
                    className="position-absolute h-100 border-start border-2 border-secondary"
                    style={{ left: "9px", top: "0" }}
                  />

                  {selectedCandidate.progressions && selectedCandidate.progressions.length > 0 ? (
                    selectedCandidate.progressions.map((log) => (
                      <div key={log.id} className="position-relative mb-4 text-start">
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
                        {editingLogId === log.id ? (
                          <div className="bg-light p-3 rounded border">
                            <div className="row g-2">
                              <div className="col-sm-4">
                                <select
                                  className="form-select form-select-sm"
                                  value={editStage}
                                  onChange={(e) => setEditStage(e.target.value)}
                                >
                                  <option value="Offer Extended">Offer Extended</option>
                                  <option value="Onboarding">Onboarding</option>
                                  <option value="Active Employee">Active Employee</option>
                                  <option value="Promoted">Promoted</option>
                                  <option value="Resigned">Resigned</option>
                                  <option value="Terminated">Terminated</option>
                                </select>
                              </div>
                              <div className="col-sm-8">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="Update notes..."
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                />
                              </div>
                              <div className="col-12 d-flex gap-2 justify-content-end mt-2">
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm px-3 fw-bold"
                                  onClick={() => handleEditProgression(log.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm px-3"
                                  onClick={() => setEditingLogId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <h6 className="mb-0 fw-bold text-dark">{log.stage}</h6>
                              <small className="text-muted">
                                {new Date(log.updated_at).toLocaleString()}
                              </small>
                            </div>
                            {log.notes && <p className="text-muted small mb-0">{log.notes}</p>}
                            <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                              <div className="text-secondary" style={{ fontSize: "10px" }}>
                                Recorded by: {log.updated_by_username ? `@${log.updated_by_username}` : "System"} ({log.updater_role === "admin" ? "Admin" : "HR"})
                              </div>
                              <div className="d-flex gap-2">
                                <button
                                  type="button"
                                  className="btn btn-link p-0 text-decoration-none small text-primary"
                                  style={{ fontSize: "11px" }}
                                  onClick={() => {
                                    setEditingLogId(log.id);
                                    setEditStage(log.stage);
                                    setEditNotes(log.notes || "");
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-link p-0 text-danger text-decoration-none small"
                                  style={{ fontSize: "11px" }}
                                  onClick={() => handleDeleteProgression(log.id)}
                                >
                                  ❌ Delete
                                </button>
                              </div>
                            </div>
                          </>
                        )}
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

      {/* SYSTEM ACTIVITY LOG TAB */}
      {activeTab === "activity" && (
        <div className="card shadow-sm border-0 p-4 rounded-3">
          <h5 className="fw-bold text-dark mb-4">System Activity Feed</h5>
          
          <div className="position-relative ps-4">
            <div
              className="position-absolute h-100 border-start border-2 border-light-subtle"
              style={{ left: "9px", top: "0" }}
            />

            {activityLog.length === 0 ? (
              <div className="text-muted small">No recent system activities recorded.</div>
            ) : (
              activityLog.map((activity) => (
                <div key={activity.id} className="position-relative mb-4">
                  {/* Icon point */}
                  <div
                    className="position-absolute bg-white border border-light-subtle d-flex align-items-center justify-content-center rounded-circle text-center"
                    style={{
                      left: "-35px",
                      top: "2px",
                      width: "24px",
                      height: "24px",
                    }}
                  >
                    <span className="small">{getActivityIcon(activity.type)}</span>
                  </div>
                  
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-1">
                    <span className="fw-semibold text-dark">{activity.message}</span>
                    <small className="text-muted">
                      {new Date(activity.timestamp).toLocaleString()}
                    </small>
                  </div>
                  <div className="small text-secondary">
                    Event Log: {activity.type} — ID: {activity.id}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={closeConfirmModal}
        />
      )}

      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "success" })}
        />
      )}
    </div>
  );
}

export default AdminDashboard;
