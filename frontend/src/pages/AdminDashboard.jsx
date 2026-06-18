import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { clearAuthData } from "../utils/auth";

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
  const navigate = useNavigate();
  // Navigation tab state
  const [activeTab, setActiveTab] = useState("overview");

  // Data States
  const [hrs, setHrs] = useState([]);
  const [hiredCandidates, setHiredCandidates] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedHR, setSelectedHR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Recruiter account creation form state
  const [recruiterForm, setRecruiterForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
  });
  const [creatingRecruiter, setCreatingRecruiter] = useState(false);

  // Recruiter credentials reset states
  const [resettingPassword, setResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingNewPassword, setSavingNewPassword] = useState(false);

  // Global Interviews Auditor states
  const [auditedInterviews, setAuditedInterviews] = useState([]);
  const [auditorFilters, setAuditorFilters] = useState({
    recruiter: "",
    status: "",
    type: "",
    search: "",
  });
  const [loadingAuditor, setLoadingAuditor] = useState(false);

  // Recruiter list master-detail & modal states
  const [hrStatusFilter, setHrStatusFilter] = useState("all");
  const [showCreateRecruiterModal, setShowCreateRecruiterModal] = useState(false);
  const [newRecruiterCredentials, setNewRecruiterCredentials] = useState(null);
  const [hrInterviews, setHrInterviews] = useState([]);
  const [loadingHrInterviews, setLoadingHrInterviews] = useState(false);
  const [systemInterviewsMetrics, setSystemInterviewsMetrics] = useState({});
  const [allInterviewsList, setAllInterviewsList] = useState([]);
  const [adminJobsDrawer, setAdminJobsDrawer] = useState(false);
  const [adminAppsDrawer, setAdminAppsDrawer] = useState(false);

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

  // Search/Filter Controls
  const [searchHR, setSearchHR] = useState("");
  const [debouncedSearchHR, setDebouncedSearchHR] = useState("");
  const [togglingHrId, setTogglingHrId] = useState(null);

  const [searchCandidate, setSearchCandidate] = useState("");
  const [debouncedSearchCandidate, setDebouncedSearchCandidate] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterHRId, setFilterHRId] = useState("all");
  const [stage, setStage] = useState("Onboarding");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  // Progression Log Editing Controls
  const [editingLogId, setEditingLogId] = useState(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");

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

  const fetchAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const [hrsResponse, candidatesResponse, activityResponse, interviewsResponse] = await Promise.all([
        API.get("/applications/admin/hrs/"),
        API.get("/applications/admin/hired-candidates/"),
        API.get("/applications/admin/activity-log/"),
        API.get("/applications/admin/interviews/"),
      ]);
      setHrs(hrsResponse.data);
      setHiredCandidates(candidatesResponse.data);
      setActivityLog(activityResponse.data);
      setSystemInterviewsMetrics(interviewsResponse.data.metrics || {});
      setAllInterviewsList(interviewsResponse.data.results || []);

      if (selectedCandidate) {
        const updated = candidatesResponse.data.find((c) => c.id === selectedCandidate.id);
        if (updated) setSelectedCandidate(updated);
      }

      if (selectedHR) {
        const updated = hrsResponse.data.find((h) => h.id === selectedHR.id);
        if (updated) setSelectedHR(updated);
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
      setError(err.response?.data?.detail || "Failed to load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditedInterviews = async () => {
    setLoadingAuditor(true);
    try {
      const params = {};
      if (auditorFilters.recruiter) params.recruiter = auditorFilters.recruiter;
      if (auditorFilters.status) params.status = auditorFilters.status;
      if (auditorFilters.type) params.type = auditorFilters.type;
      if (auditorFilters.search) params.search = auditorFilters.search;

      const response = await API.get("/applications/admin/interviews/", { params });
      setAuditedInterviews(response.data.results || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch interviews audit feed.", "error");
    } finally {
      setLoadingAuditor(false);
    }
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fetchAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedHR) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setLoadingHrInterviews(true);
      API.get(`/applications/admin/interviews/?recruiter=${selectedHR.id}`)
        .then((res) => setHrInterviews(res.data.results || []))
        .catch((err) => console.error(err))
        .finally(() => setLoadingHrInterviews(false));
    } else {
      setHrInterviews([]);
    }
  }, [selectedHR]);

  // Fetch auditor interviews on filters change or when auditor tab becomes active
  useEffect(() => {
    if (activeTab === "interviews") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAuditedInterviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    auditorFilters.recruiter,
    auditorFilters.status,
    auditorFilters.type,
    auditorFilters.search,
  ]);

  // Escape key handler to close drawers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setAdminJobsDrawer(false);
        setAdminAppsDrawer(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Recruiter Account Suspend/Activate Toggle
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
          const msg = `Recruiter @${username} has been successfully ${
            updatedStatus ? "activated" : "suspended"
          }!`;
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
      },
    });
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }
    setSavingNewPassword(true);
    try {
      await API.post(`/applications/admin/hrs/${selectedHR.id}/reset-password/`, {
        password: newPassword,
      });
      showToast(`Password for @${selectedHR.username} has been reset successfully.`, "success");
      setNewPassword("");
      setResettingPassword(false);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to reset password.", "error");
    } finally {
      setSavingNewPassword(false);
    }
  };

  // Admin Recruiter Creation Form Submission
  const handleCreateRecruiterSubmit = async (e) => {
    e.preventDefault();
    if (recruiterForm.password !== recruiterForm.confirm_password) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setCreatingRecruiter(true);
    setError("");
    setSuccess("");

    try {
      await API.post("/accounts/register/", recruiterForm);
      const msg = `Recruiter @${recruiterForm.username} successfully provisioned!`;
      setSuccess(msg);
      showToast(msg, "success");
      setNewRecruiterCredentials({
        username: recruiterForm.username,
        password: recruiterForm.password,
      });
      // Reset form
      setRecruiterForm({
        username: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        password: "",
        confirm_password: "",
      });
      await fetchAdminData();
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data
        ? Object.entries(err.response.data)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : "Failed to create recruiter account.";
      setError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setCreatingRecruiter(false);
    }
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
      const response = await API.patch(`/applications/admin/progression/${logId}/`, {
        stage: editStage.trim(),
        notes: editNotes.trim(),
      });

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
      },
    });
  };

  const getCandidateName = (application) => {
    const fullName = [application.candidate_first_name, application.candidate_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    return fullName || application.candidate_name || application.candidate_username || "Unknown Candidate";
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

  // Metrics Calculations
  const totalRecruiters = hrs.length;
  const activeRecruiters = hrs.filter((hr) => hr.is_active).length;
  const suspendedRecruiters = totalRecruiters - activeRecruiters;
  const totalHires = hiredCandidates.length;
  const openJobsCount = hrs.reduce((acc, curr) => acc + (curr.jobs_list ? curr.jobs_list.filter(j => j.status === 'open').length : 0), 0);
  const pendingApplicationsCount = hrs.reduce((acc, curr) => acc + (curr.pending_applications_count || 0), 0);
  const upcomingInterviewsCount = systemInterviewsMetrics.upcoming || 0;

  const openJobsList = hrs.flatMap((hr) => 
    (hr.jobs_list || [])
      .filter((j) => j.status === "open")
      .map((j) => ({ ...j, recruiter: hr.username }))
  );
  const newAppsList = hrs.flatMap((hr) => 
    (hr.pending_applications_list || [])
      .map((a) => ({ ...a, recruiter: hr.username }))
  );

  const getStageCounts = () => {
    const counts = {
      "Offer Extended": 0,
      Onboarding: 0,
      "Active Employee": 0,
      Promoted: 0,
      Resigned: 0,
      Terminated: 0,
    };
    hiredCandidates.forEach((candidate) => {
      const stageName = getLatestStage(candidate);
      if (counts[stageName] !== undefined) {
        counts[stageName]++;
      } else {
        counts["Onboarding"]++;
      }
    });
    return counts;
  };
  const stageCounts = getStageCounts();

  // Search filtering
  const filteredHrs = hrs.filter((hr) => {
    if (hrStatusFilter === "active" && !hr.is_active) return false;
    if (hrStatusFilter === "suspended" && hr.is_active) return false;

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
    const matchesSearch =
      name.includes(search) || title.includes(search) || company.includes(search);

    const matchesStage = filterStage === "all" || getLatestStage(candidate) === filterStage;
    const matchesHR = filterHRId === "all" || candidate.hr_user_id === Number(filterHRId);

    return matchesSearch && matchesStage && matchesHR;
  });

  const getActivityIcon = (type) => {
    switch (type) {
      case "job_created":
        return "💼";
      case "application_submitted":
        return "📄";
      case "progression_updated":
        return "⚡";
      default:
        return "🔔";
    }
  };

  if (loading) {
    return (
      <div className="container py-5 text-center text-white">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3">Loading admin dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="screenai-workspace">
      {/* Sidebar Navigation */}
      <div className="screenai-sidebar">
        <div className="mb-4 px-3 text-center border-bottom border-secondary pb-3">
          <div className="fs-1">⚙️</div>
          <h5 className="fw-bold mb-0 text-white mt-2">Admin Control</h5>
          <span className="badge bg-danger mt-1 small">SYSTEM ADMIN</span>
        </div>

        <button
          onClick={() => setActiveTab("overview")}
          className={`screenai-sidebar-item ${activeTab === "overview" ? "active" : ""}`}
        >
          📊 Analytics Overview
        </button>

        <button
          onClick={() => setActiveTab("hrs")}
          className={`screenai-sidebar-item ${activeTab === "hrs" ? "active" : ""}`}
        >
          👥 Recruiter Accounts ({totalRecruiters})
        </button>

        <button
          onClick={() => setActiveTab("candidates")}
          className={`screenai-sidebar-item ${activeTab === "candidates" ? "active" : ""}`}
        >
          📈 Placed Candidates
        </button>

        <button
          onClick={() => setActiveTab("interviews")}
          className={`screenai-sidebar-item ${activeTab === "interviews" ? "active" : ""}`}
        >
          📅 Interviews Auditor
        </button>

        <button
          onClick={() => setActiveTab("activity")}
          className={`screenai-sidebar-item ${activeTab === "activity" ? "active" : ""}`}
        >
          📜 Activity Feed
        </button>

        <div className="mt-auto p-2 border-top border-secondary pt-3 text-center">
          <button onClick={fetchAdminData} className="btn btn-sm btn-outline-secondary w-100 py-1">
            🔄 Refresh Data
          </button>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="screenai-content">
        {/* Top Bar */}
        <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small">System Admin</span>
            <span className="text-muted">/</span>
            <span className="text-white fw-bold text-capitalize small">
              {activeTab === "hrs" ? "Recruiter Accounts" : activeTab === "candidates" ? "Placed Candidates" : activeTab === "interviews" ? "Interviews Auditor" : activeTab}
            </span>
          </div>
          <div className="d-flex align-items-center gap-3">
            <button onClick={fetchAdminData} className="btn btn-xs btn-outline-secondary py-1 px-3 d-flex align-items-center gap-1">
              🔄 Sync Platform Data
            </button>
            <span className="text-secondary small fw-bold">
              👤 System Admin
            </span>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm fw-bold"
              onClick={() => {
                clearAuthData();
                localStorage.clear();
                sessionStorage.clear();
                navigate("/", { replace: true });
              }}
            >
              🚪 Logout
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger mb-4 shadow">{error}</div>}
        {success && <div className="alert alert-success mb-4 shadow">{success}</div>}

        {/* ANALYTICS TAB */}
        {activeTab === "overview" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">Admin Overview</h2>
              <p className="text-secondary">Track recruiters performance, global jobs postings, and candidates status.</p>
            </div>

            {/* Derived Previews */}
            {(() => {
              const activeRecruitersList = hrs.filter((h) => h.is_active).slice(0, 3);
              const suspendedRecruitersList = hrs.filter((h) => !h.is_active).slice(0, 3);
              const openJobsPreview = openJobsList.slice(0, 3);
              const newAppsPreview = newAppsList.slice(0, 3);
              const upcomingInterviewsList = allInterviewsList
                .filter((i) => i.status === "scheduled")
                .map((i) => ({
                  ...i,
                  candidateName: i.application?.candidate_name || "Unknown Candidate",
                  recruiter: i.application?.job?.hr_user_username || "Recruiter",
                }));
              const upcomingInterviewsPreview = upcomingInterviewsList.slice(0, 3);
              const placedHiresPreview = hiredCandidates.slice(0, 3);

              const handleKeyDown = (e, callback) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  callback();
                }
              };

              return (
                <div className="row g-3 mb-5 row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-6">
                  {/* Card 1: Active Recruiters */}
                  <div className="col">
                    <div 
                      onClick={() => {
                        setHrStatusFilter("active");
                        setActiveTab("hrs");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setHrStatusFilter("active");
                        setActiveTab("hrs");
                      })}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-primary)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Active Recruiters: ${activeRecruiters} of ${totalRecruiters} active. Click to view active recruiters list.`}
                    >
                      <div className="screenai-metric-label">Active Recruiters</div>
                      <div className="screenai-metric-val">{activeRecruiters}</div>
                      <small className="text-muted">
                        {hrs.length === 0 || activeRecruiters === 0 ? "No active accounts" : `${activeRecruiters} of ${hrs.length} active`}
                      </small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">Active Recruiters</div>
                        {activeRecruitersList.length === 0 ? (
                          <div className="text-muted small">No active recruiters.</div>
                        ) : (
                          activeRecruitersList.map((hr) => (
                            <div key={hr.id} className="screenai-preview-item text-secondary small">
                              👤 {hr.first_name || hr.username} (@{hr.username})
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Suspended Recruiters */}
                  <div className="col">
                    <div 
                      onClick={() => {
                        setHrStatusFilter("suspended");
                        setActiveTab("hrs");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setHrStatusFilter("suspended");
                        setActiveTab("hrs");
                      })}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-danger)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Suspended Recruiters: ${suspendedRecruiters} suspended. Click to view suspended recruiters list.`}
                    >
                      <div className="screenai-metric-label">Suspended Recruiters</div>
                      <div className="screenai-metric-val">{suspendedRecruiters}</div>
                      <small className="text-muted">
                        {suspendedRecruiters === 0 ? "No suspended accounts" : `${suspendedRecruiters} account${suspendedRecruiters > 1 ? "s" : ""} blocked`}
                      </small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">Suspended Recruiters</div>
                        {suspendedRecruitersList.length === 0 ? (
                          <div className="text-muted small">No suspended recruiters.</div>
                        ) : (
                          suspendedRecruitersList.map((hr) => (
                            <div key={hr.id} className="screenai-preview-item text-secondary small">
                              👤 {hr.first_name || hr.username} (@{hr.username})
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Open Jobs */}
                  <div className="col">
                    <div 
                      onClick={() => setAdminJobsDrawer(true)}
                      onKeyDown={(e) => handleKeyDown(e, () => setAdminJobsDrawer(true))}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-info)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Open Jobs: ${openJobsCount} active. Click to view open jobs list drawer.`}
                    >
                      <div className="screenai-metric-label">Open Jobs</div>
                      <div className="screenai-metric-val">{openJobsCount}</div>
                      <small className="text-muted">
                        {openJobsCount === 0 ? "No active jobs" : `${openJobsCount} job${openJobsCount > 1 ? "s" : ""} accepting apps`}
                      </small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">Open Jobs Preview</div>
                        {openJobsPreview.length === 0 ? (
                          <div className="text-muted small">No active jobs.</div>
                        ) : (
                          openJobsPreview.map((j) => (
                            <div key={j.id} className="screenai-preview-item text-secondary small">
                              <strong>{j.job_title}</strong> at {j.company_name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 4: New Applications */}
                  <div className="col">
                    <div 
                      onClick={() => setAdminAppsDrawer(true)}
                      onKeyDown={(e) => handleKeyDown(e, () => setAdminAppsDrawer(true))}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-warning)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`New Applications: ${pendingApplicationsCount} awaiting review. Click to view pending applications list drawer.`}
                    >
                      <div className="screenai-metric-label">New Applications</div>
                      <div className="screenai-metric-val">{pendingApplicationsCount}</div>
                      <small className="text-muted">
                        {pendingApplicationsCount === 0 ? "No applications awaiting review" : `${pendingApplicationsCount} awaiting review`}
                      </small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">New Applications</div>
                        {newAppsPreview.length === 0 ? (
                          <div className="text-muted small">No new applications.</div>
                        ) : (
                          newAppsPreview.map((a) => (
                            <div key={a.id} className="screenai-preview-item text-secondary small">
                              <strong>{a.candidate_name}</strong> - {a.job_title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Upcoming Interviews */}
                  <div className="col">
                    <div 
                      onClick={() => {
                        setAuditorFilters({ ...auditorFilters, status: "scheduled" });
                        setActiveTab("interviews");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setAuditorFilters({ ...auditorFilters, status: "scheduled" });
                        setActiveTab("interviews");
                      })}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid #a855f7", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Upcoming Interviews: ${upcomingInterviewsCount} scheduled rounds. Click to view interviews list tab.`}
                    >
                      <div className="screenai-metric-label">Upcoming Interviews</div>
                      <div className="screenai-metric-val">{upcomingInterviewsCount}</div>
                      <small className="text-muted">
                        {upcomingInterviewsCount === 0 ? "No interviews scheduled" : `${upcomingInterviewsCount} scheduled round${upcomingInterviewsCount > 1 ? "s" : ""}`}
                      </small>

                      <div className="screenai-hover-preview screenai-hover-preview-right">
                        <div className="fw-bold text-white small mb-2">Upcoming Interviews</div>
                        {upcomingInterviewsPreview.length === 0 ? (
                          <div className="text-muted small">No scheduled interviews.</div>
                        ) : (
                          upcomingInterviewsPreview.map((i) => (
                            <div key={i.id} className="screenai-preview-item text-secondary small">
                              <strong>{i.candidateName}</strong> - {i.round_name}
                              <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                {new Date(i.scheduled_at).toLocaleDateString()} at {new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 6: Hired Candidates */}
                  <div className="col">
                    <div 
                      onClick={() => {
                        setActiveTab("candidates");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setActiveTab("candidates");
                      })}
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-success)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Hired Candidates: ${totalHires} candidates placed. Click to view placed candidates tab.`}
                    >
                      <div className="screenai-metric-label">Hired Candidates</div>
                      <div className="screenai-metric-val">{totalHires}</div>
                      <small className="text-muted">
                        {totalHires === 0 ? "No hired candidates yet" : `${totalHires} candidate${totalHires > 1 ? "s" : ""} placed`}
                      </small>

                      <div className="screenai-hover-preview screenai-hover-preview-right">
                        <div className="fw-bold text-white small mb-2">Placed Hires</div>
                        {placedHiresPreview.length === 0 ? (
                          <div className="text-muted small">No placed hires recorded yet.</div>
                        ) : (
                          placedHiresPreview.map((a) => (
                            <div key={a.id} className="screenai-preview-item text-secondary small">
                              <strong>{[a.candidate_first_name, a.candidate_last_name].filter(Boolean).join(" ") || a.candidate_name || "Placed Candidate"}</strong> - {a.job_title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="row g-4">
              {/* Placed Candidates Progression progress bars */}
              <div className="col-lg-6">
                <div className="screenai-card h-100">
                  <h5 className="fw-bold text-white mb-4">Candidate Progression Distributions</h5>
                  {Object.entries(stageCounts).map(([stageName, count]) => {
                    const percentage = totalHires > 0 ? (count / totalHires) * 100 : 0;
                    let barColor = "bg-primary";
                    if (stageName === "Active Employee") barColor = "bg-success";
                    if (stageName === "Onboarding") barColor = "bg-info";
                    if (stageName === "Resigned") barColor = "bg-warning";
                    if (stageName === "Terminated") barColor = "bg-danger";
                    if (stageName === "Promoted") barColor = "bg-secondary";

                    return (
                      <div key={stageName} className="mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold text-secondary small">{stageName}</span>
                          <span className="badge bg-dark text-white fw-bold">{count}</span>
                        </div>
                        <div className="progress" style={{ height: "10px" }}>
                          <div
                            className={`progress-bar ${barColor}`}
                            role="progressbar"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recruiter Performance Table */}
              <div className="col-lg-6">
                <div className="screenai-card h-100">
                  <h5 className="fw-bold text-white mb-3">Recruiter Workloads</h5>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover table-borderless align-middle mb-0 small">
                      <thead>
                        <tr className="border-bottom border-secondary text-secondary">
                          <th>Recruiter</th>
                          <th className="text-center">Status</th>
                          <th className="text-center">Jobs</th>
                          <th className="text-center">Apps</th>
                          <th className="text-center">Hires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hrs.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="text-center py-3 text-secondary">
                              No recruiters registered.
                            </td>
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
                              title="Click to view details"
                            >
                              <td className="fw-bold">
                                {hr.first_name || hr.last_name
                                  ? `${hr.first_name} ${hr.last_name}`.trim()
                                  : hr.username}
                                <div className="text-secondary small" style={{ fontSize: "10px" }}>
                                  @{hr.username}
                                </div>
                              </td>
                              <td className="text-center">
                                <span className={`badge ${hr.is_active ? "bg-success" : "bg-danger"}`}>
                                  {hr.is_active ? "Active" : "Suspended"}
                                </span>
                              </td>
                              <td className="text-center">{hr.jobs_count || 0}</td>
                              <td className="text-center">{hr.applications_count || 0}</td>
                              <td className="text-center">
                                <span className="badge bg-success">{hr.hired_count || 0}</span>
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

            {/* Open Jobs Drawer */}
            {adminJobsDrawer && (
              <div className="screenai-drawer-backdrop" onClick={() => setAdminJobsDrawer(false)}>
                <div className="screenai-drawer p-4" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "var(--screenai-bg)", borderLeft: "1px solid var(--screenai-border)", overflowY: "auto" }}>
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h4 className="fw-bold text-white mb-0">💼 Open Job Positions</h4>
                    <button className="btn-close btn-close-white" onClick={() => setAdminJobsDrawer(false)} aria-label="Close drawer"></button>
                  </div>
                  {openJobsList.length === 0 ? (
                    <p className="text-muted">No open jobs at the moment.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {openJobsList.map((job) => (
                        <div key={job.id} className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}>
                          <div className="fw-bold text-white mb-1">{job.job_title}</div>
                          <div className="text-secondary small mb-2">{job.company_name}</div>
                          <div className="d-flex justify-content-between align-items-center small text-muted">
                            <span>Posted by: @{job.recruiter}</span>
                            <span className="badge bg-secondary">{job.candidates_count} applicants</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* New Applications Drawer */}
            {adminAppsDrawer && (
              <div className="screenai-drawer-backdrop" onClick={() => setAdminAppsDrawer(false)}>
                <div className="screenai-drawer p-4" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "var(--screenai-bg)", borderLeft: "1px solid var(--screenai-border)", overflowY: "auto" }}>
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h4 className="fw-bold text-white mb-0">📄 New Applications Awaiting Review</h4>
                    <button className="btn-close btn-close-white" onClick={() => setAdminAppsDrawer(false)} aria-label="Close drawer"></button>
                  </div>
                  {newAppsList.length === 0 ? (
                    <p className="text-muted">No new applications at the moment.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {newAppsList.map((app) => (
                        <div key={app.id} className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}>
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <span className="fw-bold text-white">{app.candidate_name}</span>
                            <span className="badge bg-dark border border-secondary text-primary fw-bold" style={{ fontSize: "10px" }}>
                              Score: {app.ai_score ?? "Pending"}
                            </span>
                          </div>
                          <div className="text-secondary small mb-2">{app.job_title} at {app.company_name}</div>
                          <div className="d-flex justify-content-between align-items-center small text-muted">
                            <span>Recruiter: @{app.recruiter}</span>
                            <span>{new Date(app.submitted_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECRUITER ACCOUNTS TAB */}
        {activeTab === "hrs" && (
          <div>
            <div className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2 border-bottom border-secondary pb-3">
              <div>
                <h2 className="fw-bold text-white mb-1">Recruiter Accounts Governance</h2>
                <p className="text-secondary mb-0">Provision recruiter accounts, toggle activation status, reset credentials, and inspect workloads.</p>
              </div>
              <button
                onClick={() => {
                  setNewRecruiterCredentials(null);
                  setShowCreateRecruiterModal(true);
                }}
                className="btn btn-primary fw-bold px-3 py-2 d-flex align-items-center gap-1 shadow"
              >
                ➕ Create Recruiter
              </button>
            </div>

            <div className="row g-4">
              {/* Recruiter List */}
              <div className={selectedHR ? "col-lg-5 col-12" : "col-lg-12 col-12"}>
                <div className="screenai-card">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                    <h5 className="fw-bold text-white mb-0">Directory List</h5>
                    <div className="d-flex gap-2 align-items-center flex-wrap">
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "140px" }}
                        value={hrStatusFilter}
                        onChange={(e) => setHrStatusFilter(e.target.value)}
                      >
                        <option value="all">All Accounts</option>
                        <option value="active">Active Only</option>
                        <option value="suspended">Suspended Only</option>
                      </select>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="🔍 Search recruiters..."
                        style={{ width: "180px" }}
                        value={searchHR}
                        onChange={(e) => setSearchHR(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-dark table-hover table-borderless align-middle mb-0 small">
                      <thead>
                        <tr className="border-bottom border-secondary text-secondary">
                          <th>Recruiter Info</th>
                          {!selectedHR && <th className="text-center d-none d-md-table-cell">Last Login</th>}
                          <th className="text-center">Workload</th>
                          <th className="text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHrs.length === 0 ? (
                          <tr>
                            <td colSpan={selectedHR ? 3 : 4} className="text-center py-4 text-secondary">
                              No matching recruiters found.
                            </td>
                          </tr>
                        ) : (
                          filteredHrs.map((hr) => (
                            <tr
                              key={hr.id}
                              style={{ cursor: "pointer" }}
                              className={selectedHR?.id === hr.id ? "table-active" : ""}
                              onClick={() => setSelectedHR(hr)}
                            >
                              <td>
                                <div className="fw-bold text-white">
                                  {hr.first_name || hr.last_name
                                    ? `${hr.first_name} ${hr.last_name}`.trim()
                                    : hr.username}
                                </div>
                                <div className="text-secondary small" style={{ fontSize: "11px" }}>
                                  @{hr.username}
                                </div>
                              </td>
                              {!selectedHR && (
                                <td className="text-center text-secondary d-none d-md-table-cell">
                                  {hr.last_login ? new Date(hr.last_login).toLocaleString() : "Never"}
                                </td>
                              )}
                              <td className="text-center">
                                <span className="badge bg-secondary me-1" title="Jobs count">{hr.jobs_count || 0} Jobs</span>
                                <span className="badge bg-success" title="Hires count">{hr.hired_count || 0} Hires</span>
                              </td>
                              <td className="text-center">
                                <span className={`badge ${hr.is_active ? "bg-success" : "bg-danger"}`}>
                                  {hr.is_active ? "Active" : "Suspended"}
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

              {/* Recruiter Details Panel */}
              {selectedHR && (
                <div className="col-lg-7 col-12">
                  <div className="screenai-card">
                    {/* Header */}
                    <div className="d-flex justify-content-between align-items-start border-bottom border-secondary pb-3 mb-4">
                      <div>
                        <h4 className="fw-bold text-white mb-1">
                          {selectedHR.first_name || selectedHR.last_name
                            ? `${selectedHR.first_name} ${selectedHR.last_name}`.trim()
                            : selectedHR.username}
                        </h4>
                        <div className="d-flex align-items-center gap-2">
                          <span className="text-secondary small">@{selectedHR.username} — HR Recruiter</span>
                          <span className={`badge ${selectedHR.is_active ? "bg-success" : "bg-danger"}`} style={{ fontSize: "10px" }}>
                            {selectedHR.is_active ? "Active" : "Suspended"}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => setSelectedHR(null)} className="btn-close btn-close-white" />
                    </div>

                    {/* Contact & Status */}
                    <div className="bg-dark p-3 rounded border border-secondary mb-4">
                      <div className="row g-3 small">
                        <div className="col-sm-6">
                          <span className="text-secondary d-block fw-bold mb-1">Email Address:</span>
                          <strong className="text-white">{selectedHR.email || "No email listed"}</strong>
                        </div>
                        <div className="col-sm-6">
                          <span className="text-secondary d-block fw-bold mb-1">Phone Number:</span>
                          <strong className="text-white">{selectedHR.phone || "No phone listed"}</strong>
                        </div>
                        <div className="col-12 border-top border-secondary pt-2 mt-2">
                          <span className="text-secondary d-block fw-bold mb-1">Last Login Session:</span>
                          <strong className="text-white">
                            {selectedHR.last_login ? new Date(selectedHR.last_login).toLocaleString() : "Never logged in"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Stats Cards Row */}
                    <div className="row g-2 mb-4">
                      <div className="col-4">
                        <div className="p-3 bg-dark border border-secondary rounded text-center">
                          <div className="text-secondary small fw-bold uppercase">Jobs</div>
                          <h4 className="fw-bold text-white mb-0 mt-1">{selectedHR.jobs_count || 0}</h4>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="p-3 bg-dark border border-secondary rounded text-center">
                          <div className="text-secondary small fw-bold uppercase">Applications</div>
                          <h4 className="fw-bold text-white mb-0 mt-1">{selectedHR.applications_count || 0}</h4>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="p-3 bg-dark border border-secondary rounded text-center">
                          <div className="text-secondary small fw-bold uppercase">Hires</div>
                          <h4 className="fw-bold text-white mb-0 mt-1">{selectedHR.hired_count || 0}</h4>
                        </div>
                      </div>
                    </div>

                    {/* Nested Sections */}
                    <div className="accordion-custom d-flex flex-column gap-3 mb-4">
                      {/* Section 1: Jobs Posted */}
                      <div className="p-3 bg-dark border border-secondary rounded">
                        <h6 className="fw-bold text-white mb-3 d-flex justify-content-between">
                          <span>💼 Jobs Posted ({selectedHR.jobs_list?.length || 0})</span>
                        </h6>
                        <div className="list-group list-group-flush rounded overflow-hidden" style={{ maxHeight: "200px", overflowY: "auto" }}>
                          {!selectedHR.jobs_list || selectedHR.jobs_list.length === 0 ? (
                            <div className="p-2 text-center text-secondary small">No jobs posted yet.</div>
                          ) : (
                            selectedHR.jobs_list.map((job) => (
                              <div
                                key={job.id}
                                className="list-group-item bg-dark text-white border-secondary px-2 py-3 d-flex justify-content-between align-items-center"
                              >
                                <div>
                                  <div className="fw-bold text-white small">{job.job_title}</div>
                                  <div className="text-secondary small" style={{ fontSize: "11px" }}>
                                    {job.company_name} • Posted {new Date(job.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                                <span className={`badge ${job.status === "open" ? "bg-success" : "bg-secondary"}`}>
                                  {job.status}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Section 2: Placed Hires */}
                      <div className="p-3 bg-dark border border-secondary rounded">
                        <h6 className="fw-bold text-white mb-3">
                          📈 Placed Candidates ({hiredCandidates.filter(c => c.hr_user_id === selectedHR.id).length})
                        </h6>
                        <div className="list-group list-group-flush rounded overflow-hidden" style={{ maxHeight: "200px", overflowY: "auto" }}>
                          {hiredCandidates.filter(c => c.hr_user_id === selectedHR.id).length === 0 ? (
                            <div className="p-2 text-center text-secondary small">No placed candidates recorded.</div>
                          ) : (
                            hiredCandidates
                              .filter(c => c.hr_user_id === selectedHR.id)
                              .map((c) => (
                                <div
                                  key={c.id}
                                  className="list-group-item bg-dark text-white border-secondary px-2 py-3 d-flex justify-content-between align-items-center"
                                >
                                  <div>
                                    <div className="fw-bold text-white small">{getCandidateName(c)}</div>
                                    <div className="text-secondary small" style={{ fontSize: "11px" }}>
                                      Role: {c.job_title} • Company: {c.company_name}
                                    </div>
                                  </div>
                                  <span className="badge bg-success">{getLatestStage(c)}</span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Section 3: Interviews Managed */}
                      <div className="p-3 bg-dark border border-secondary rounded">
                        <h6 className="fw-bold text-white mb-3">
                          📅 Scheduled Round Audits ({hrInterviews.length})
                        </h6>
                        {loadingHrInterviews ? (
                          <div className="text-center py-3 text-secondary small">
                            <span className="spinner-border spinner-border-sm me-2" role="status" />
                            Loading interviews...
                          </div>
                        ) : hrInterviews.length === 0 ? (
                          <div className="p-2 text-center text-secondary small">No interviews scheduled yet.</div>
                        ) : (
                          <div className="table-responsive" style={{ maxHeight: "200px", overflowY: "auto" }}>
                            <table className="table table-dark table-hover table-borderless align-middle mb-0 small">
                              <tbody>
                                {hrInterviews.map((int) => (
                                  <tr key={int.id} className="border-bottom border-secondary">
                                    <td className="px-1 py-2">
                                      <div className="fw-bold text-white">{int.candidate_name || "Candidate"}</div>
                                      <div className="text-secondary" style={{ fontSize: "10px" }}>
                                        {int.round_name} (Round {int.round_number})
                                      </div>
                                    </td>
                                    <td className="px-1 py-2 text-secondary" style={{ fontSize: "11px" }}>
                                      {new Date(int.scheduled_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-1 py-2 text-end">
                                      <span
                                        className={`badge ${
                                          int.status === "completed"
                                            ? "bg-success"
                                            : int.status === "cancelled"
                                            ? "bg-danger"
                                            : "bg-warning text-dark"
                                        }`}
                                        style={{ fontSize: "10px" }}
                                      >
                                        {int.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Section 4: Recruiter Activity Feed */}
                      <div className="p-3 bg-dark border border-secondary rounded">
                        <h6 className="fw-bold text-white mb-3">📜 Activity Feed Logs</h6>
                        <div className="list-group list-group-flush rounded overflow-hidden" style={{ maxHeight: "250px", overflowY: "auto" }}>
                          {activityLog.filter(act => 
                            act.message.toLowerCase().includes(selectedHR.username.toLowerCase()) ||
                            (selectedHR.jobs_list && selectedHR.jobs_list.some(j => act.message.toLowerCase().includes(j.job_title.toLowerCase())))
                          ).length === 0 ? (
                            <div className="p-2 text-center text-secondary small">No recent logs.</div>
                          ) : (
                            activityLog
                              .filter(act => 
                                act.message.toLowerCase().includes(selectedHR.username.toLowerCase()) ||
                                (selectedHR.jobs_list && selectedHR.jobs_list.some(j => act.message.toLowerCase().includes(j.job_title.toLowerCase())))
                              )
                              .map((act) => (
                                <div key={act.id} className="py-2 border-bottom border-secondary d-flex flex-column">
                                  <span className="text-white small fw-semibold">{act.message}</span>
                                  <span className="text-muted" style={{ fontSize: "9px" }}>
                                    {new Date(act.timestamp).toLocaleString()} • {act.type}
                                  </span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Governance Action Row */}
                    <div className="border-top border-secondary pt-4 d-flex flex-column gap-3">
                      <div className="d-flex gap-2">
                        {selectedHR.is_active ? (
                          <button
                            onClick={() => handleToggleHRActive(selectedHR.id, selectedHR.username, selectedHR.is_active)}
                            className="btn btn-sm btn-danger fw-bold flex-fill"
                            disabled={togglingHrId === selectedHR.id}
                          >
                            🔒 Suspend Recruiter Account
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleHRActive(selectedHR.id, selectedHR.username, selectedHR.is_active)}
                            className="btn btn-sm btn-success fw-bold flex-fill"
                            disabled={togglingHrId === selectedHR.id}
                          >
                            🔓 Activate Recruiter Account
                          </button>
                        )}

                        <button
                          onClick={() => setResettingPassword(!resettingPassword)}
                          className={`btn btn-sm ${resettingPassword ? "btn-secondary" : "btn-outline-warning"} fw-bold flex-fill`}
                        >
                          🔑 Reset Credentials
                        </button>
                      </div>

                      {resettingPassword && (
                        <form onSubmit={handleResetPasswordSubmit} className="bg-dark p-3 rounded border border-secondary small">
                          <label className="form-label text-secondary small fw-bold mb-1">Enter New Password</label>
                          <div className="input-group input-group-sm mb-2">
                            <input
                              type="password"
                              className="form-control"
                              placeholder="Min 6 characters required"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              disabled={savingNewPassword}
                              required
                            />
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              type="submit"
                              className="btn btn-sm btn-primary flex-fill fw-bold"
                              disabled={savingNewPassword}
                            >
                              {savingNewPassword ? "Saving..." : "Save Password"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNewPassword("");
                                setResettingPassword(false);
                              }}
                              className="btn btn-sm btn-outline-secondary"
                              disabled={savingNewPassword}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CANDIDATE PROGRESSION TAB */}
        {activeTab === "candidates" && (
          <div className="row g-4">
            <div className={selectedCandidate ? "col-lg-5" : "col-lg-12"}>
              <div className="screenai-card">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
                  <h5 className="fw-bold text-white mb-0">Hired Placements</h5>
                  <div className="d-flex gap-2">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: "130px" }}
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
                      placeholder="🔍 Search candidates..."
                      style={{ width: "150px" }}
                      value={searchCandidate}
                      onChange={(e) => setSearchCandidate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="list-group list-group-flush border border-secondary rounded overflow-hidden">
                  {filteredCandidates.length === 0 ? (
                    <div className="p-4 text-center text-secondary">No matching hired placements found.</div>
                  ) : (
                    filteredCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className={`list-group-item list-group-item-action bg-dark text-white border-secondary p-3 ${
                          selectedCandidate?.id === candidate.id ? "active text-white bg-primary border-primary" : ""
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
                          <span className="badge bg-success">{getLatestStage(candidate)}</span>
                        </div>
                        <div className="small text-secondary mb-1">
                          Role: {candidate.job_title} — Hired By: {candidate.company_name}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Selected candidate progression details */}
            {selectedCandidate && (
              <div className="col-lg-7">
                <div className="screenai-card">
                  <div className="d-flex justify-content-between align-items-start border-bottom border-secondary pb-3 mb-4">
                    <div>
                      <h4 className="fw-bold text-white mb-1">{getCandidateName(selectedCandidate)}</h4>
                      <p className="text-secondary mb-0">
                        {selectedCandidate.job_title} — {selectedCandidate.company_name}
                      </p>
                    </div>
                    <button onClick={() => setSelectedCandidate(null)} className="btn-close btn-close-white" />
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <div className="small text-secondary">
                      Email: <strong>{selectedCandidate.candidate_email || "Not provided"}</strong>
                    </div>
                    <a
                      href={getResumeUrl(selectedCandidate.resume)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-outline-primary fw-bold"
                    >
                      📄 View Resume
                    </a>
                  </div>

                  {/* Progression updates logs form */}
                  <div className="bg-dark p-3 rounded border border-secondary mb-4">
                    <h5 className="fw-bold text-white mb-3 small">Update Placement Stage</h5>
                    <form onSubmit={handleAddProgression}>
                      <div className="row g-2">
                        <div className="col-sm-4">
                          <select
                            className="form-select form-select-sm"
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
                        <div className="col-sm-8">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder={getPlaceholderForStage(stage)}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={updating}
                          />
                        </div>
                        <div className="col-12 mt-2">
                          <button
                            type="submit"
                            className="btn btn-sm btn-success w-100 fw-bold"
                            disabled={updating || !stage.trim()}
                          >
                            {updating ? "Updating..." : "Record Status Update"}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>

                  {/* Progression History Timeline */}
                  <h5 className="fw-bold text-white mb-3">Progression History Timeline</h5>
                  <div className="timeline-line">
                    {!selectedCandidate.progressions || selectedCandidate.progressions.length === 0 ? (
                      <p className="text-secondary small">No updates recorded yet.</p>
                    ) : (
                      selectedCandidate.progressions.map((log) => (
                        <div key={log.id} className="position-relative mb-4 text-start small">
                          <div
                            className="position-absolute bg-success rounded-circle animate-pulse"
                            style={{ left: "-22px", top: "5px", width: "10px", height: "10px" }}
                          />

                          {editingLogId === log.id ? (
                            <div className="bg-dark p-3 rounded border border-secondary">
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
                                    className="btn btn-sm btn-success px-3 fw-bold"
                                    onClick={() => handleEditProgression(log.id)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
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
                                <strong className="text-white">{log.stage}</strong>
                                <span className="text-muted" style={{ fontSize: "10px" }}>
                                  {new Date(log.updated_at).toLocaleString()}
                                </span>
                              </div>
                              {log.notes && <div className="text-secondary mb-2">{log.notes}</div>}
                              <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                                <div className="text-muted" style={{ fontSize: "9px" }}>
                                  Recorded by: {log.updated_by_username ? `@${log.updated_by_username}` : "System"}{" "}
                                  ({log.updater_role === "admin" ? "Admin" : "HR"})
                                </div>
                                <div className="d-flex gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingLogId(log.id);
                                      setEditStage(log.stage);
                                      setEditNotes(log.notes || "");
                                    }}
                                    className="btn btn-xs btn-outline-info px-2 py-0"
                                    style={{ fontSize: "11px" }}
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProgression(log.id)}
                                    className="btn btn-xs btn-outline-danger px-2 py-0"
                                    style={{ fontSize: "11px" }}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GLOBAL INTERVIEWS AUDITOR TAB */}
        {activeTab === "interviews" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">Global Interviews Auditor</h2>
              <p className="text-secondary">Audit, filter, and inspect scheduled/completed candidate interview rounds system-wide.</p>
            </div>

            {/* Auditor Filters Pane */}
            <div className="screenai-card mb-4 bg-dark">
              <div className="row g-3 small">
                <div className="col-md-3">
                  <label className="form-label text-secondary fw-bold">Recruiter</label>
                  <select
                    className="form-select form-select-sm"
                    value={auditorFilters.recruiter}
                    onChange={(e) => setAuditorFilters({ ...auditorFilters, recruiter: e.target.value })}
                  >
                    <option value="">All Recruiters</option>
                    {hrs.map((hr) => (
                      <option key={hr.id} value={hr.id}>
                        {hr.first_name || hr.last_name
                          ? `${hr.first_name} ${hr.last_name}`.trim()
                          : hr.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-3">
                  <label className="form-label text-secondary fw-bold">Status</label>
                  <select
                    className="form-select form-select-sm"
                    value={auditorFilters.status}
                    onChange={(e) => setAuditorFilters({ ...auditorFilters, status: e.target.value })}
                  >
                    <option value="">All Statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>

                <div className="col-md-2">
                  <label className="form-label text-secondary fw-bold">Type</label>
                  <select
                    className="form-select form-select-sm"
                    value={auditorFilters.type}
                    onChange={(e) => setAuditorFilters({ ...auditorFilters, type: e.target.value })}
                  >
                    <option value="">All Types</option>
                    <option value="phone">Phone</option>
                    <option value="video">Video</option>
                    <option value="in_person">In Person</option>
                    <option value="technical">Technical</option>
                    <option value="hr">HR</option>
                    <option value="managerial">Managerial</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label text-secondary fw-bold">Candidate Search</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Search candidate or interviewer..."
                    value={auditorFilters.search}
                    onChange={(e) => setAuditorFilters({ ...auditorFilters, search: e.target.value })}
                  />
                </div>

                <div className="col-12 mt-2 d-flex justify-content-between align-items-center">
                  <span className="text-secondary small">
                    Audited <strong>{auditedInterviews.length}</strong> interview round records.
                  </span>
                  <button
                    onClick={() =>
                      setAuditorFilters({
                        recruiter: "",
                        status: "",
                        type: "",
                        search: "",
                      })
                    }
                    className="btn btn-sm btn-outline-secondary px-3"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Interviews Auditor Table Feed */}
            <div className="screenai-card">
              {loadingAuditor ? (
                <div className="text-center py-4 text-secondary small">Loading audit feed...</div>
              ) : auditedInterviews.length === 0 ? (
                <div className="text-center py-4 text-secondary small">
                  No interview records match the filters.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-hover table-borderless align-middle mb-0 small">
                    <thead>
                      <tr className="border-bottom border-secondary text-secondary">
                        <th>Candidate</th>
                        <th>Position & Recruiter</th>
                        <th>Round & Type</th>
                        <th>Scheduled Time</th>
                        <th>Status</th>
                        <th>Evaluation Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditedInterviews.map((interview) => (
                        <tr key={interview.id}>
                          <td className="fw-bold">
                            {interview.candidate_name || "Unknown Candidate"}
                            <div className="text-secondary small" style={{ fontSize: "10px" }}>
                              Interviewer: {interview.interviewer_name || "Not set"}
                            </div>
                          </td>
                          <td>
                            {interview.job_title || "Job Listing"}
                            <div className="text-secondary small" style={{ fontSize: "10px" }}>
                              HR: @{interview.recruiter_username || "system"}
                            </div>
                          </td>
                          <td className="text-capitalize">
                            Round {interview.round_number}: {interview.round_name}
                            <div className="text-secondary small" style={{ fontSize: "10px" }}>
                              {interview.interview_type}
                            </div>
                          </td>
                          <td>{new Date(interview.scheduled_at).toLocaleString()}</td>
                          <td>
                            <span
                              className={`badge text-capitalize ${
                                interview.status === "completed"
                                  ? "bg-success"
                                  : interview.status === "cancelled"
                                  ? "bg-danger"
                                  : "bg-warning text-dark"
                              }`}
                            >
                              {interview.status}
                            </span>
                          </td>
                          <td>
                            {interview.status === "completed" ? (
                              <div>
                                <span className="badge bg-success">{interview.overall_rating}/5 Stars</span>
                                <div className="text-capitalize text-warning small mt-1" style={{ fontSize: "10px" }}>
                                  {interview.recommendation?.replace("_", " ")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-secondary small">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SYSTEM ACTIVITY LOG FEED TAB */}
        {activeTab === "activity" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">System Activity Feed</h2>
              <p className="text-secondary">Inspect real-time system activities and event triggers.</p>
            </div>

            <div className="screenai-card">
              <div className="timeline-line">
                {activityLog.length === 0 ? (
                  <div className="text-muted small">No recent system activities recorded.</div>
                ) : (
                  activityLog.map((activity) => (
                    <div key={activity.id} className="position-relative mb-4 text-start">
                      <div
                        className="position-absolute bg-white border border-light-subtle d-flex align-items-center justify-content-center rounded-circle text-center"
                        style={{
                          left: "-28px",
                          top: "2px",
                          width: "20px",
                          height: "20px",
                        }}
                      >
                        <span style={{ fontSize: "10px" }}>{getActivityIcon(activity.type)}</span>
                      </div>

                      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-1 small">
                        <span className="fw-semibold text-white">{activity.message}</span>
                        <small className="text-muted">{new Date(activity.timestamp).toLocaleString()}</small>
                      </div>
                      <div className="text-secondary" style={{ fontSize: "10px" }}>
                        Event Log: {activity.type} — ID: {activity.id}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreateRecruiterModal && (
        <div className="screenai-modal-overlay">
          <div className="screenai-modal-content" style={{ maxWidth: "500px" }}>
            {newRecruiterCredentials ? (
              <div className="text-center p-3">
                <div className="fs-1 text-success mb-3">✅</div>
                <h4 className="fw-bold text-white mb-3">Account Created</h4>
                <p className="text-secondary small mb-4">
                  The recruiter account has been provisioned. Please copy these credentials now. For security, they will not be shown again.
                </p>
                <div className="bg-dark p-3 rounded border border-secondary mb-4 text-start">
                  <div className="mb-2">
                    <span className="text-secondary small d-block">Username:</span>
                    <strong className="text-white fs-5">{newRecruiterCredentials.username}</strong>
                  </div>
                  <div>
                    <span className="text-secondary small d-block">Temporary Password:</span>
                    <strong className="text-white fs-5">{newRecruiterCredentials.password}</strong>
                  </div>
                </div>
                <div className="d-flex gap-2 justify-content-center">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `Username: ${newRecruiterCredentials.username}\nPassword: ${newRecruiterCredentials.password}`
                      );
                      showToast("Credentials copied to clipboard!", "success");
                    }}
                    className="btn btn-success fw-bold px-4"
                  >
                    📋 Copy Credentials
                  </button>
                  <button
                    onClick={() => {
                      setNewRecruiterCredentials(null);
                      setShowCreateRecruiterModal(false);
                    }}
                    className="btn btn-outline-secondary px-4"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-secondary pb-2">
                  <h4 className="fw-bold text-white mb-0">Provision Recruiter Account</h4>
                  <button
                    onClick={() => setShowCreateRecruiterModal(false)}
                    className="btn-close btn-close-white"
                  />
                </div>
                <p className="text-secondary small mb-4">
                  Create a new HR recruiter account. Credential permissions will be granted immediately.
                </p>

                <form onSubmit={handleCreateRecruiterSubmit}>
                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold">Username</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      required
                      value={recruiterForm.username}
                      onChange={(e) => setRecruiterForm({ ...recruiterForm, username: e.target.value })}
                      disabled={creatingRecruiter}
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-6 mb-3">
                      <label className="form-label text-secondary small fw-bold">First Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={recruiterForm.first_name}
                        onChange={(e) => setRecruiterForm({ ...recruiterForm, first_name: e.target.value })}
                        disabled={creatingRecruiter}
                      />
                    </div>
                    <div className="col-6 mb-3">
                      <label className="form-label text-secondary small fw-bold">Last Name</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={recruiterForm.last_name}
                        onChange={(e) => setRecruiterForm({ ...recruiterForm, last_name: e.target.value })}
                        disabled={creatingRecruiter}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold">Email Address</label>
                    <input
                      type="email"
                      className="form-control form-control-sm"
                      required
                      value={recruiterForm.email}
                      onChange={(e) => setRecruiterForm({ ...recruiterForm, email: e.target.value })}
                      disabled={creatingRecruiter}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold">Phone Number</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={recruiterForm.phone}
                      onChange={(e) => setRecruiterForm({ ...recruiterForm, phone: e.target.value })}
                      disabled={creatingRecruiter}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold">Password</label>
                    <input
                      type="password"
                      className="form-control form-control-sm"
                      required
                      minLength="6"
                      value={recruiterForm.password}
                      onChange={(e) => setRecruiterForm({ ...recruiterForm, password: e.target.value })}
                      disabled={creatingRecruiter}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="form-label text-secondary small fw-bold">Confirm Password</label>
                    <input
                      type="password"
                      className="form-control form-control-sm"
                      required
                      value={recruiterForm.confirm_password}
                      onChange={(e) => setRecruiterForm({ ...recruiterForm, confirm_password: e.target.value })}
                      disabled={creatingRecruiter}
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary flex-fill fw-bold"
                      disabled={creatingRecruiter}
                    >
                      {creatingRecruiter ? "Provisioning..." : "Provision Recruiter"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateRecruiterModal(false)}
                      className="btn btn-outline-secondary"
                      disabled={creatingRecruiter}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
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
