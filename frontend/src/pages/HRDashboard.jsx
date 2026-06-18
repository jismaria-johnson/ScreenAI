import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API from "../api/axiosConfig";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { clearAuthData } from "../utils/auth";

function HRDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const getCandidateName = (app) => {
    if (!app) return "";
    const name = [app.candidate_first_name, app.candidate_last_name].filter(Boolean).join(" ").trim();
    return name || app.candidate_username || "Unknown Candidate";
  };

  const getResumeUrl = (path) => {
    if (!path) return "#";
    if (path.startsWith("http")) return path;
    return `http://127.0.0.1:8000${path}`;
  };

  // Tab State
  const activeTab = searchParams.get("tab") || "overview";

  // Data States
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "success" });

  // Modals / Confirmations
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  // Profile Edit State
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Job Search / Filter States
  const [jobFilter, setJobFilter] = useState("all"); // all, open, closed

  // Add / Edit Job Modal States
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [addJobForm, setAddJobForm] = useState({
    job_title: "",
    company_name: "",
    job_description: "",
    required_skills: "",
    required_experience: "",
    location: "",
    status: "open",
    application_form_enabled: true,
    application_deadline: "",
  });

  const [showEditJobModal, setShowEditJobModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [editJobForm, setEditJobForm] = useState({
    job_title: "",
    company_name: "",
    job_description: "",
    required_skills: "",
    required_experience: "",
    location: "",
    status: "open",
    application_form_enabled: true,
    application_deadline: "",
  });

  const [openJobDropdownId, setOpenJobDropdownId] = useState(null);
  const [hoveredJobId, setHoveredJobId] = useState(null);
  const [showAiBreakdown, setShowAiBreakdown] = useState(false);

  // Applications Filter States
  const [appSearch, setAppSearch] = useState("");
  const [appFilters, setAppFilters] = useState({
    job: searchParams.get("jobId") || "",
    min_score: "",
    experience: "",
    company: "",
    recommendation: "",
    status: "",
  });

  // Selected Application Details States
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [progStage, setProgStage] = useState("Offer Extended");
  const [progNotes, setProgNotes] = useState("");
  const [updatingProg, setUpdatingProg] = useState(false);

  // Interviews States
  const [interviews, setInterviews] = useState([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    round_name: "",
    round_number: 1,
    interview_type: "technical",
    scheduled_at: "",
    duration_minutes: 30,
    location_or_meeting_link: "",
    interviewer_name: "",
    interviewer_email: "",
  });

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completingInterviewId, setCompletingInterviewId] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    technical_rating: 3,
    communication_rating: 3,
    problem_solving_rating: 3,
    culture_fit_rating: 3,
    overall_rating: 3,
    feedback: "",
    recommendation: "hire",
  });

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [reschedulingInterviewId, setReschedulingInterviewId] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState("");

  const [showHireWarningModal, setShowHireWarningModal] = useState(false);
  const [hireWarningReasons, setHireWarningReasons] = useState([]);

  const [copiedJobToken, setCopiedJobToken] = useState(null);
  const [togglingJobFormId, setTogglingJobFormId] = useState(null);

  // Load Dashboard Data
  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [profileResponse, jobsResponse, applicationsResponse] = await Promise.all([
        API.get("/accounts/profile/"),
        API.get("/jobs/"),
        API.get("/applications/hr/"),
      ]);

      setProfile(profileResponse.data);
      setProfileForm({
        first_name: profileResponse.data.first_name || "",
        last_name: profileResponse.data.last_name || "",
        email: profileResponse.data.email || "",
        phone: profileResponse.data.phone || "",
      });
      setJobs(jobsResponse.data);
      setAllApplications(applicationsResponse.data);

      // Refresh selected application details if open
      if (selectedApplication) {
        const updatedApp = applicationsResponse.data.find(
          (app) => app.id === selectedApplication.id
        );
        if (updatedApp) {
          setSelectedApplication(updatedApp);
        }
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to fetch recruiter dashboard data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (openJobDropdownId && !e.target.closest(".dropdown")) {
        setOpenJobDropdownId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpenJobDropdownId(null);
        setHoveredJobId(null);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openJobDropdownId]);

  // Sync tab navigation query parameters
  const handleTabChange = (tabName) => {
    setSearchParams({ tab: tabName });
    // Close detail pane when switching tabs
    if (tabName !== "applications") {
      setSelectedApplication(null);
    }
  };

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

  // --- Profile Actions ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await API.patch("/accounts/profile/", {
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim(),
      });
      setProfile(res.data);
      showToast("Profile details updated successfully", "success");
      setEditingProfile(false);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.detail || "Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Job Listing Actions ---
  const handleAddJobSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...addJobForm };
      if (!payload.application_deadline) {
        delete payload.application_deadline;
      }
      await API.post("/jobs/", payload);
      showToast("New job posting added successfully", "success");
      setShowAddJobModal(false);
      setAddJobForm({
        job_title: "",
        company_name: "",
        job_description: "",
        required_skills: "",
        required_experience: "",
        location: "",
        status: "open",
        application_form_enabled: true,
        application_deadline: "",
      });
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to create job posting. Check fields.", "error");
    }
  };

  const handleOpenEditJob = (job) => {
    setEditingJobId(job.id);
    setEditJobForm({
      job_title: job.job_title || "",
      company_name: job.company_name || "",
      job_description: job.job_description || "",
      required_skills: job.required_skills || "",
      required_experience: job.required_experience || "",
      location: job.location || "",
      status: job.status || "open",
      application_form_enabled: job.application_form_enabled,
      application_deadline: job.application_deadline
        ? new Date(job.application_deadline).toISOString().slice(0, 16)
        : "",
    });
    setShowEditJobModal(true);
  };

  const handleEditJobSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...editJobForm };
      if (!payload.application_deadline) {
        payload.application_deadline = null;
      }
      await API.patch(`/jobs/${editingJobId}/`, payload);
      showToast("Job posting updated successfully", "success");
      setShowEditJobModal(false);
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to update job posting.", "error");
    }
  };

  const copyApplicationLink = (token) => {
    const link = `${window.location.origin}/apply/public/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedJobToken(token);
      showToast("Application link copied to clipboard!", "success");
      setTimeout(() => setCopiedJobToken(null), 2000);
    });
  };

  const toggleApplicationForm = async (job) => {
    try {
      setTogglingJobFormId(job.id);
      await API.patch(`/jobs/${job.id}/`, {
        application_form_enabled: !job.application_form_enabled,
      });
      showToast(
        `Application form ${
          !job.application_form_enabled ? "enabled" : "disabled"
        } successfully.`,
        "success"
      );
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to update form status.", "error");
    } finally {
      setTogglingJobFormId(null);
    }
  };

  const updateJobStatus = async (job, newStatus) => {
    try {
      await API.patch(`/jobs/${job.id}/`, { status: newStatus });
      showToast(`Job status changed to ${newStatus}`, "success");
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to update job status", "error");
    }
  };

  const deleteJob = async (job) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Job Posting",
      message: `Are you sure you want to permanently delete "${job.job_title}"? This cannot be undone.`,
      onConfirm: async () => {
        closeConfirmModal();
        try {
          await API.delete(`/jobs/${job.id}/`);
          showToast("Job posting deleted successfully", "success");
          fetchDashboardData(true);
        } catch (err) {
          console.error(err);
          showToast(err.response?.data?.detail || "Could not delete job", "error");
        }
      },
    });
  };

  // --- Interview Timeline & Management ---
  const fetchInterviews = async (applicationId) => {
    setLoadingInterviews(true);
    try {
      const response = await API.get(`/applications/${applicationId}/interviews/`);
      setInterviews(response.data);
    } catch (err) {
      console.error("Failed to load interviews", err);
      showToast("Could not load candidate interviews.", "error");
    } finally {
      setLoadingInterviews(false);
    }
  };

  const handleSelectApplication = (app) => {
    setSelectedApplication(app);
    setShowAiBreakdown(false);
    setProgStage(app?.application_status === "hired" ? "Onboarding" : "Offer Extended");
    setProgNotes("");
    if (app) {
      fetchInterviews(app.id);
    } else {
      setInterviews([]);
    }
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...scheduleForm,
        round_number: Number(scheduleForm.round_number),
        duration_minutes: Number(scheduleForm.duration_minutes),
      };
      await API.post(`/applications/${selectedApplication.id}/interviews/`, payload);
      showToast("Interview round scheduled successfully", "success");
      setShowScheduleModal(false);
      setScheduleForm({
        round_name: "",
        round_number: 1,
        interview_type: "technical",
        scheduled_at: "",
        duration_minutes: 30,
        location_or_meeting_link: "",
        interviewer_name: "",
        interviewer_email: "",
      });
      fetchInterviews(selectedApplication.id);
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      const msg = err.response?.data
        ? Object.entries(err.response.data)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : "Failed to schedule interview round.";
      showToast(msg, "error");
    }
  };

  const handleCancelInterview = (interviewId) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Interview",
      message: "Are you sure you want to cancel this interview round?",
      onConfirm: async () => {
        closeConfirmModal();
        try {
          await API.patch(`/applications/interviews/${interviewId}/`, {
            status: "cancelled",
          });
          showToast("Interview cancelled successfully", "success");
          fetchInterviews(selectedApplication.id);
        } catch (err) {
          console.error(err);
          showToast("Failed to cancel interview", "error");
        }
      },
    });
  };

  const handleRescheduleClick = (interview) => {
    setReschedulingInterviewId(interview.id);
    setRescheduleTime(
      interview.scheduled_at
        ? new Date(interview.scheduled_at).toISOString().slice(0, 16)
        : ""
    );
    setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.patch(`/applications/interviews/${reschedulingInterviewId}/`, {
        scheduled_at: rescheduleTime,
      });
      showToast("Interview round rescheduled", "success");
      setShowRescheduleModal(false);
      fetchInterviews(selectedApplication.id);
    } catch (err) {
      console.error(err);
      showToast("Failed to reschedule interview", "error");
    }
  };

  const handleCompleteClick = (interview) => {
    setCompletingInterviewId(interview.id);
    setCompleteForm({
      technical_rating: interview.technical_rating || 3,
      communication_rating: interview.communication_rating || 3,
      problem_solving_rating: interview.problem_solving_rating || 3,
      culture_fit_rating: interview.culture_fit_rating || 3,
      overall_rating: interview.overall_rating || 3,
      feedback: interview.feedback || "",
      recommendation: interview.recommendation || "hire",
    });
    setShowCompleteModal(true);
  };

  const handleCompleteSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...completeForm,
        status: "completed",
        technical_rating: Number(completeForm.technical_rating),
        communication_rating: Number(completeForm.communication_rating),
        problem_solving_rating: Number(completeForm.problem_solving_rating),
        culture_fit_rating: Number(completeForm.culture_fit_rating),
        overall_rating: Number(completeForm.overall_rating),
      };
      await API.patch(`/applications/interviews/${completingInterviewId}/`, payload);
      showToast("Interview evaluations submitted", "success");
      setShowCompleteModal(false);
      fetchInterviews(selectedApplication.id);
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to complete interview evaluation. Fill all ratings and feedback.", "error");
    }
  };

  // --- Recruitment Status & Hire Warnings ---
  const updateStatusDirect = async (newStatus) => {
    try {
      await API.patch(`/applications/${selectedApplication.id}/status/`, {
        application_status: newStatus,
      });
      showToast(`Candidate status changed to ${newStatus}`, "success");
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to update candidate status", "error");
    }
  };

  const handleStatusChangeRequest = (newStatus) => {
    if (newStatus !== "hired") {
      setConfirmModal({
        isOpen: true,
        title: `${newStatus.toUpperCase()} Candidate`,
        message: `Change recruitment status for candidate ${getCandidateName(
          selectedApplication
        )} to "${newStatus}"?`,
        onConfirm: () => {
          closeConfirmModal();
          updateStatusDirect(newStatus);
        },
      });
      return;
    }

    // Hiring flow validation checklist
    const reasons = [];
    if (interviews.length === 0) {
      reasons.push("No interview rounds have been scheduled or completed for this candidate.");
    } else {
      const pending = interviews.filter((i) => i.status === "scheduled");
      const incomplete = interviews.filter(
        (i) => i.status === "completed" && (!i.feedback || !i.overall_rating)
      );

      if (pending.length > 0) {
        reasons.push(`${pending.length} scheduled interview round(s) are still pending.`);
      }
      if (incomplete.length > 0) {
        reasons.push(`${incomplete.length} interview round(s) do not contain completed feedback ratings.`);
      }
    }

    if (reasons.length > 0) {
      setHireWarningReasons(reasons);
      setShowHireWarningModal(true);
    } else {
      setConfirmModal({
        isOpen: true,
        title: "Hire Candidate",
        message: `Are you sure you want to hire ${getCandidateName(
          selectedApplication
        )}? Interviews are audited and complete.`,
        onConfirm: () => {
          closeConfirmModal();
          updateStatusDirect("hired");
        },
      });
    }
  };

  // --- Progression Logs ---
  const handleAddProgression = async (e) => {
    e.preventDefault();
    if (!progStage.trim()) return;

    setUpdatingProg(true);
    try {
      const response = await API.post(
        `/applications/admin/${selectedApplication.id}/progression/`,
        { stage: progStage.trim(), notes: progNotes.trim() }
      );
      showToast(`Progression stage "${progStage}" added`, "success");
      setProgNotes("");
      setSelectedApplication(response.data);
      fetchDashboardData(true);
    } catch (err) {
      console.error("Progression error:", err);
      showToast("Failed to add progression stage.", "error");
    } finally {
      setUpdatingProg(false);
    }
  };

  // --- Filters / Utilities ---

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (jobFilter === "open") return job.status === "open";
      if (jobFilter === "closed") return job.status === "closed";
      return true;
    });
  }, [jobs, jobFilter]);

  const filteredApplications = useMemo(() => {
    return allApplications.filter((app) => {
      // Text search (name, email, job title)
      const name = getCandidateName(app).toLowerCase();
      const email = (app.candidate_email || "").toLowerCase();
      const search = appSearch.toLowerCase();
      const matchesSearch =
        name.includes(search) ||
        email.includes(search) ||
        app.job_title.toLowerCase().includes(search);

      // Filters
      const matchesJob = !appFilters.job || app.job === Number(appFilters.job);
      const matchesMinScore =
        !appFilters.min_score || (app.ai_score !== null && app.ai_score >= Number(appFilters.min_score));
      const matchesCompany =
        !appFilters.company ||
        (app.worked_companies &&
          app.worked_companies.toLowerCase().includes(appFilters.company.toLowerCase()));
      const matchesRecommend =
        !appFilters.recommendation || app.recommendation === appFilters.recommendation;
      const matchesStatus = !appFilters.status || app.application_status === appFilters.status;

      let matchesExperience = true;
      if (appFilters.experience) {
        const exp = Number(app.total_experience_years) || 0;
        if (appFilters.experience === "fresher") {
          matchesExperience = exp === 0;
        } else {
          matchesExperience = exp >= Number(appFilters.experience);
        }
      }

      return (
        matchesSearch &&
        matchesJob &&
        matchesMinScore &&
        matchesCompany &&
        matchesRecommend &&
        matchesStatus &&
        matchesExperience
      );
    });
  }, [allApplications, appSearch, appFilters]);

  const allInterviews = useMemo(() => {
    const list = [];
    allApplications.forEach((app) => {
      if (Array.isArray(app.interviews)) {
        app.interviews.forEach((i) => {
          list.push({
            ...i,
            candidateName: getCandidateName(app),
            jobTitle: app.job_title,
            applicationId: app.id,
            appObject: app,
          });
        });
      }
    });
    return list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }, [allApplications]);

  const activeJobObj = useMemo(() => {
    if (!appFilters.job) return null;
    return jobs.find((j) => j.id === Number(appFilters.job)) || null;
  }, [jobs, appFilters.job]);

  // Metric Computations
  const totalJobsCount = jobs.length;
  const openJobsCount = jobs.filter((j) => j.status === "open").length;
  const hiredAppsCount = allApplications.filter((a) => a.application_status === "hired").length;
  const newApplicationsCount = allApplications.filter((a) => a.application_status === "pending").length;
  const shortlistedCount = allApplications.filter((a) => a.application_status === "shortlisted").length;
  const upcomingInterviewsCount = allInterviews.filter((i) => i.status === "scheduled").length;



  if (loading) {
    return (
      <div className="container py-5 text-center text-white">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3">Loading HRRecruiter Command Center...</p>
      </div>
    );
  }

  return (
    <div className="screenai-workspace">
      {/* Sidebar Navigation */}
      <div className="screenai-sidebar">
        <div className="mb-4 px-3 text-center border-bottom pb-3" style={{ borderColor: "var(--screenai-border) !important" }}>
          <div className="fs-1">🏢</div>
          <h5 className="fw-bold mb-0 text-white mt-2">
            {profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : profile?.username || "Recruiter"}
          </h5>
          <span className="badge bg-primary text-capitalize mt-1 small">HR Recruiter</span>
        </div>

        <button
          onClick={() => handleTabChange("overview")}
          className={`screenai-sidebar-item ${activeTab === "overview" ? "active" : ""}`}
        >
          📊 Overview
        </button>

        <button
          onClick={() => handleTabChange("applications")}
          className={`screenai-sidebar-item ${activeTab === "applications" ? "active" : ""}`}
        >
          👥 Recruitment
        </button>

        <button
          onClick={() => handleTabChange("jobs")}
          className={`screenai-sidebar-item ${activeTab === "jobs" ? "active" : ""}`}
        >
          💼 Jobs
        </button>

        <button
          onClick={() => handleTabChange("profile")}
          className={`screenai-sidebar-item ${activeTab === "profile" ? "active" : ""}`}
        >
          👤 Profile
        </button>

        <div className="mt-auto p-2 border-top pt-3 text-center" style={{ borderColor: "var(--screenai-border)" }}>
          <button
            onClick={() => fetchDashboardData()}
            className="btn btn-sm btn-outline-secondary w-100 py-1"
          >
            🔄 Sync Data
          </button>
        </div>
      </div>

      {/* Main Workspace Content Area */}
      <div className="screenai-content">
        {/* Top Bar */}
        <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
          <div className="d-flex align-items-center gap-2">
            <span className="text-secondary small">Recruiter Shell</span>
            <span className="text-muted">/</span>
            <span className="text-white fw-bold text-capitalize small">
              {activeTab === "applications" ? "Recruitment" : activeTab}
            </span>
          </div>
          <div className="d-flex align-items-center gap-3">
            <button onClick={() => fetchDashboardData()} className="btn btn-xs btn-outline-secondary py-1 px-3 d-flex align-items-center gap-1">
              🔄 Sync Platform Data
            </button>
            <div className="dropdown">
              <button 
                className="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2 text-capitalize" 
                type="button" 
                id="hrAccountDropdown" 
                data-bs-toggle="dropdown" 
                aria-expanded="false"
              >
                👤 {profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : "Recruiter"}
              </button>
              <ul className="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow" aria-labelledby="hrAccountDropdown" style={{ backgroundColor: "var(--screenai-surface)", border: "1px solid var(--screenai-border)" }}>
                <li className="dropdown-header text-muted small">{profile?.email || "recruiter@screenai.com"}</li>
                <li><hr className="dropdown-divider" style={{ borderColor: "var(--screenai-border)" }} /></li>
                <li>
                  <button className="dropdown-item" onClick={() => handleTabChange("profile")}>
                    👤 Profile
                  </button>
                </li>
                <li>
                  <button className="dropdown-item text-danger" onClick={() => {
                    clearAuthData();
                    navigate("/", { replace: true });
                  }}>
                    🚪 Logout
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger mb-4 shadow">{error}</div>}

        {/* OVERVIEW PANEL */}
        {activeTab === "overview" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">Recruiter Overview Dashboard</h2>
              <p className="text-secondary">Track active job listings, review new resume applications, check upcoming interview rounds, and manage placed hires.</p>
            </div>

            {/* Metrics Grid */}
            {(() => {
              const activeJobsPreview = jobs.filter((j) => j.status === "open").slice(0, 3);
              const newAppsPreview = allApplications.filter((a) => a.application_status === "pending").slice(0, 3);
              const shortlistedPreview = allApplications.filter((a) => a.application_status === "shortlisted").slice(0, 3);
              const upcomingInterviewsPreview = allInterviews.filter((i) => i.status === "scheduled").slice(0, 3);
              const placedHiresPreview = allApplications.filter((a) => a.application_status === "hired").slice(0, 3);
              
              const handleKeyDown = (e, callback) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  callback();
                }
              };

              return (
                <div className="row g-3 mb-5 row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-5">
                  {/* Card 1: Active Jobs */}
                  <div className="col">
                    <div 
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-primary)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Active Jobs: ${openJobsCount} open, total ${totalJobsCount}. Focus or hover to preview active jobs list. Click to open jobs page.`}
                      onClick={() => {
                        setJobFilter("open");
                        handleTabChange("jobs");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setJobFilter("open");
                        handleTabChange("jobs");
                      })}
                    >
                      <div className="screenai-metric-label">Active Jobs</div>
                      <div className="screenai-metric-val">{openJobsCount}</div>
                      <small className="text-muted">Total: {totalJobsCount}</small>
                      
                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">Active Jobs</div>
                        {activeJobsPreview.length === 0 ? (
                          <div className="text-muted small">No active jobs.</div>
                        ) : (
                          activeJobsPreview.map((j) => (
                            <div key={j.id} className="screenai-preview-item text-secondary small">
                              <strong>{j.job_title}</strong> at {j.company_name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: New Applications */}
                  <div className="col">
                    <div 
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-info)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`New Applications: ${newApplicationsCount} awaiting review. Focus or hover to preview new applications list. Click to open recruitment page.`}
                      onClick={() => {
                        setAppFilters(prev => ({ ...prev, status: "pending" }));
                        handleTabChange("applications");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setAppFilters(prev => ({ ...prev, status: "pending" }));
                        handleTabChange("applications");
                      })}
                    >
                      <div className="screenai-metric-label">New Applications</div>
                      <div className="screenai-metric-val">{newApplicationsCount}</div>
                      <small className="text-muted">Need review</small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">New Applications</div>
                        {newAppsPreview.length === 0 ? (
                          <div className="text-muted small">No new applications.</div>
                        ) : (
                          newAppsPreview.map((a) => (
                            <div key={a.id} className="screenai-preview-item text-secondary small">
                              <strong>{getCandidateName(a)}</strong> - {a.job_title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Shortlisted */}
                  <div className="col">
                    <div 
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-warning)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Shortlisted Candidates: ${shortlistedCount} in pipeline. Focus or hover to preview shortlisted list. Click to open recruitment page.`}
                      onClick={() => {
                        setAppFilters(prev => ({ ...prev, status: "shortlisted" }));
                        handleTabChange("applications");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setAppFilters(prev => ({ ...prev, status: "shortlisted" }));
                        handleTabChange("applications");
                      })}
                    >
                      <div className="screenai-metric-label">Shortlisted</div>
                      <div className="screenai-metric-val">{shortlistedCount}</div>
                      <small className="text-muted">In pipeline</small>

                      <div className="screenai-hover-preview">
                        <div className="fw-bold text-white small mb-2">Shortlisted</div>
                        {shortlistedPreview.length === 0 ? (
                          <div className="text-muted small">No shortlisted candidates.</div>
                        ) : (
                          shortlistedPreview.map((a) => (
                            <div key={a.id} className="screenai-preview-item text-secondary small">
                              <strong>{getCandidateName(a)}</strong> - {a.job_title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Scheduled Rounds */}
                  <div className="col">
                    <div 
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid #a855f7", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Scheduled Rounds: ${upcomingInterviewsCount} upcoming interviews. Focus or hover to preview upcoming rounds list. Click to open candidates interviews page.`}
                      onClick={() => {
                        const firstSched = allInterviews.find((i) => i.status === "scheduled");
                        if (firstSched) {
                          const app = allApplications.find((a) => a.id === firstSched.applicationId);
                          if (app) {
                            setSelectedApplication(app);
                            setAppFilters(prev => ({ ...prev, status: app.application_status }));
                          }
                        } else {
                          setAppFilters(prev => ({ ...prev, status: "" }));
                        }
                        handleTabChange("applications");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        const firstSched = allInterviews.find((i) => i.status === "scheduled");
                        if (firstSched) {
                          const app = allApplications.find((a) => a.id === firstSched.applicationId);
                          if (app) {
                            setSelectedApplication(app);
                            setAppFilters(prev => ({ ...prev, status: app.application_status }));
                          }
                        } else {
                          setAppFilters(prev => ({ ...prev, status: "" }));
                        }
                        handleTabChange("applications");
                      })}
                    >
                      <div className="screenai-metric-label">Scheduled Rounds</div>
                      <div className="screenai-metric-val">{upcomingInterviewsCount}</div>
                      <small className="text-muted">Upcoming interviews</small>

                      <div className="screenai-hover-preview screenai-hover-preview-right">
                        <div className="fw-bold text-white small mb-2">Upcoming Interviews</div>
                        {upcomingInterviewsPreview.length === 0 ? (
                          <div className="text-muted small">No scheduled interviews.</div>
                        ) : (
                          upcomingInterviewsPreview.map((i) => (
                            <div key={i.id} className="screenai-preview-item text-secondary small">
                              <strong>{i.candidateName}</strong> - {i.round_name}
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                {new Date(i.scheduled_at).toLocaleDateString()} at {new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Placed Hires */}
                  <div className="col">
                    <div 
                      className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0" 
                      style={{ borderLeft: "4px solid var(--screenai-success)", background: "var(--screenai-surface)" }}
                      tabIndex="0"
                      aria-label={`Placed Hires: ${hiredAppsCount} placements total. Focus or hover to preview placed hires list. Click to open hired candidates details.`}
                      onClick={() => {
                        setAppFilters(prev => ({ ...prev, status: "hired" }));
                        handleTabChange("applications");
                      }}
                      onKeyDown={(e) => handleKeyDown(e, () => {
                        setAppFilters(prev => ({ ...prev, status: "hired" }));
                        handleTabChange("applications");
                      })}
                    >
                      <div className="screenai-metric-label">Placed Hires</div>
                      <div className="screenai-metric-val">{hiredAppsCount}</div>
                      <small className="text-muted">Total placements</small>

                      <div className="screenai-hover-preview screenai-hover-preview-right">
                        <div className="fw-bold text-white small mb-2">Recent Placed Hires</div>
                        {placedHiresPreview.length === 0 ? (
                          <div className="text-muted small">No hired candidates yet.</div>
                        ) : (
                          placedHiresPreview.map((a) => (
                            <div key={a.id} className="screenai-preview-item text-secondary small">
                              <strong>{getCandidateName(a)}</strong> - {a.job_title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick Actions Panel */}
            <div className="screenai-card mb-5">
              <h5 className="fw-bold text-white mb-3">⚡ Quick Actions</h5>
              <div className="row g-3">
                <div className="col-md-4">
                  <button onClick={() => setShowAddJobModal(true)} className="btn btn-primary w-100 py-3 fw-bold shadow-sm">
                    ➕ Create Job Opening
                  </button>
                </div>
                <div className="col-md-4">
                  <button 
                    onClick={() => {
                      setAppFilters({
                        job: "",
                        min_score: "",
                        experience: "",
                        company: "",
                        recommendation: "",
                        status: "pending",
                      });
                      handleTabChange("applications");
                    }} 
                    className="btn btn-outline-info w-100 py-3 fw-bold shadow-sm"
                  >
                    🔍 Review New Applications
                  </button>
                </div>
                <div className="col-md-4">
                  <button 
                    onClick={() => {
                      setAppFilters({
                        job: "",
                        min_score: "",
                        experience: "",
                        company: "",
                        recommendation: "",
                        status: "shortlisted",
                      });
                      handleTabChange("applications");
                    }} 
                    className="btn btn-outline-warning w-100 py-3 fw-bold shadow-sm"
                  >
                    📅 View Upcoming Interviews
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity Section */}
            <div className="row g-4">
              {/* Latest Applications */}
              <div className="col-lg-4">
                <div className="screenai-card h-100">
                  <h5 className="fw-bold text-white mb-3">👥 Latest Applications</h5>
                  {allApplications.length === 0 ? (
                    <p className="text-muted small">No applications received yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {allApplications.slice(0, 3).map((app) => (
                        <div 
                          key={app.id} 
                          onClick={() => {
                            handleSelectApplication(app);
                            handleTabChange("applications");
                          }}
                          className="p-3 rounded border text-start screenai-card-hover cursor-pointer" 
                          style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}
                        >
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <span className="fw-bold text-white small">{getCandidateName(app)}</span>
                            <span className="badge bg-dark border border-secondary text-primary fw-bold" style={{ fontSize: "10px" }}>
                              Score: {app.ai_score ?? "Pending"}
                            </span>
                          </div>
                          <div className="text-secondary small mb-2" style={{ fontSize: "11px" }}>
                            {app.job_title}
                          </div>
                          <span 
                            className="btn btn-xs btn-outline-primary py-0.5 px-2 small mt-1 d-inline-block fw-semibold"
                            style={{ fontSize: "10px" }}
                          >
                            Inspect Candidate →
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming Interviews */}
              <div className="col-lg-4">
                <div className="screenai-card h-100">
                  <h5 className="fw-bold text-white mb-3">📅 Upcoming Interviews</h5>
                  {allInterviews.filter(i => i.status === 'scheduled').length === 0 ? (
                    <p className="text-muted small">No interviews scheduled yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {allInterviews.filter(i => i.status === 'scheduled').slice(0, 3).map((interview) => (
                        <div 
                          key={interview.id} 
                          onClick={() => {
                            handleSelectApplication(interview.appObject);
                            handleTabChange("applications");
                          }}
                          className="p-3 rounded border text-start screenai-card-hover cursor-pointer" 
                          style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}
                        >
                          <div className="fw-bold text-white small">{interview.candidateName}</div>
                          <div className="text-secondary small mb-1" style={{ fontSize: "11px" }}>
                            {interview.round_name} ({interview.interview_type})
                          </div>
                          <div className="text-warning small" style={{ fontSize: "10px" }}>
                            ⏰ {new Date(interview.scheduled_at).toLocaleString()}
                          </div>
                          <span 
                            className="btn btn-xs btn-outline-primary py-0.5 px-2 small mt-2 d-inline-block fw-semibold"
                            style={{ fontSize: "10px" }}
                          >
                            Manage Timeline →
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recently Hired Candidates */}
              <div className="col-lg-4">
                <div className="screenai-card h-100">
                  <h5 className="fw-bold text-white mb-3">🎉 Placed Hires</h5>
                  {allApplications.filter(a => a.application_status === 'hired').length === 0 ? (
                    <p className="text-muted small">No placed hires recorded yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {allApplications.filter(a => a.application_status === 'hired').slice(0, 3).map((app) => {
                        const latestProg = app.progressions && app.progressions.length > 0
                          ? app.progressions[app.progressions.length - 1].stage
                          : "Offer Extended";
                        return (
                          <div 
                            key={app.id} 
                            onClick={() => {
                              handleSelectApplication(app);
                              handleTabChange("applications");
                            }}
                            className="p-3 rounded border text-start screenai-card-hover cursor-pointer" 
                            style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}
                          >
                            <div className="fw-bold text-white small">{getCandidateName(app)}</div>
                            <div className="text-secondary small mb-1" style={{ fontSize: "11px" }}>
                              {app.job_title}
                            </div>
                            <div className="text-success small fw-semibold" style={{ fontSize: "11px" }}>
                              🟢 Onboarding: {latestProg}
                            </div>
                            <span 
                              className="btn btn-xs btn-outline-primary py-0.5 px-2 small mt-2 d-inline-block fw-semibold"
                              style={{ fontSize: "10px" }}
                            >
                              Track Progress →
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* JOBS DIRECTORY TAB */}
        {activeTab === "jobs" && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="fw-bold text-white">Jobs Directory</h2>
                <p className="text-secondary">Publish and govern all hiring positions and application links.</p>
              </div>
              <button onClick={() => setShowAddJobModal(true)} className="btn btn-primary px-4 fw-bold">
                ➕ Add New Job
              </button>
            </div>

            {/* Filter buttons */}
            <div className="btn-group mb-4" role="group">
              <button
                type="button"
                className={`btn btn-sm ${jobFilter === "all" ? "btn-light" : "btn-outline-light"}`}
                onClick={() => setJobFilter("all")}
              >
                All Jobs ({jobs.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${jobFilter === "open" ? "btn-light" : "btn-outline-light"}`}
                onClick={() => setJobFilter("open")}
              >
                Open ({jobs.filter((j) => j.status === "open").length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${jobFilter === "closed" ? "btn-light" : "btn-outline-light"}`}
                onClick={() => setJobFilter("closed")}
              >
                Closed ({jobs.filter((j) => j.status === "closed").length})
              </button>
            </div>

            {/* Jobs Grid */}
            {filteredJobs.length === 0 ? (
              <div className="alert alert-info bg-dark text-white border-secondary">
                No job postings found matching current status.
              </div>
            ) : (
              <div className="row g-4">
                {filteredJobs.map((job) => {
                  const hasApps = (job.applicant_count ?? 0) > 0;
                  const deadlinePassed =
                    job.application_deadline && new Date(job.application_deadline) < new Date();

                  return (
                    <div className="col-lg-6" key={job.id}>
                      <div className="screenai-card h-100 d-flex flex-column justify-content-between">
                        <div>
                          {/* Title and Badge Row */}
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <h5 className="fw-bold mb-1 text-white">{job.job_title}</h5>
                              <span className="text-secondary small">{job.company_name}</span>
                            </div>
                            <span className={`badge ${job.status === "open" ? "bg-success" : "bg-secondary"}`}>
                              {job.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Quick details */}
                          <div className="d-flex flex-wrap gap-2 align-items-center mb-3 text-secondary small">
                            <span>📍 {job.location || "Remote"}</span>
                            <span>•</span>
                            <span>💼 {job.required_experience || "Any exp"}</span>
                            <span>•</span>
                            <span>👥 {job.applicant_count ?? 0} applied</span>
                          </div>

                          {/* Info Alert/Status Badges */}
                          {job.status === "open" && (
                            <div className="mb-3">
                              {job.application_form_enabled && !deadlinePassed ? (
                                <span className="badge bg-success-subtle text-success border border-success-subtle py-1 px-2 small">
                                  Accepting Submissions
                                </span>
                              ) : (
                                <span className="badge bg-warning-subtle text-warning border border-warning-subtle py-1 px-2 small">
                                  Applications Disabled
                                </span>
                              )}
                              {deadlinePassed && (
                                <span className="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2 ms-2 small">
                                  Deadline Passed
                                </span>
                              )}
                            </div>
                          )}

                          {/* Job description (compact, truncated) */}
                          <p className="text-secondary small mb-3 flex-grow-1 text-truncate" style={{ maxLines: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "normal" }}>
                            {job.job_description}
                          </p>

                          {job.application_deadline && (
                            <div className="text-warning small mb-3">
                              Deadline: {new Date(job.application_deadline).toLocaleString()}
                            </div>
                          )}
                        </div>

                        {/* Bottom Actions Row */}
                        <div className="d-flex gap-2 pt-3 border-top border-secondary align-items-center position-relative flex-wrap">
                          <button
                            onClick={() => {
                              setAppFilters({ ...appFilters, job: job.id });
                              handleTabChange("applications");
                            }}
                            className="btn btn-primary btn-sm flex-grow-1 fw-bold"
                          >
                            👥 View Candidates
                          </button>

                          {/* Copy Link directly on card */}
                          {(() => {
                            const showCopyLink = job.application_token && job.application_form_enabled && job.status === "open" && !deadlinePassed;
                            if (showCopyLink) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => copyApplicationLink(job.application_token)}
                                  className="btn btn-outline-info btn-sm fw-bold"
                                  title="Copy public application URL"
                                >
                                  🔗 Copy Public Link
                                </button>
                              );
                            } else {
                              let explanation = "Link Disabled";
                              if (!job.application_token) explanation = "No Link Available";
                              else if (!job.application_form_enabled) explanation = "Submissions Disabled";
                              else if (job.status !== "open") explanation = "Position Closed";
                              else if (deadlinePassed) explanation = "Deadline Passed";

                              return (
                                <button
                                  type="button"
                                  disabled
                                  className="btn btn-outline-secondary btn-sm text-muted px-2"
                                  style={{ cursor: "not-allowed", fontSize: "0.75rem" }}
                                  title={`Applications link is unavailable: ${explanation}`}
                                >
                                  🔗 {explanation}
                                </button>
                              );
                            }
                          })()}
                          
                          {/* Manage Dropdown with Hover & Click triggers */}
                          <div 
                            className="dropdown position-relative"
                            onMouseEnter={() => setHoveredJobId(job.id)}
                            onMouseLeave={() => setHoveredJobId(null)}
                          >
                            <button
                              onClick={() => setOpenJobDropdownId(openJobDropdownId === job.id ? null : job.id)}
                              className="btn btn-outline-light btn-sm dropdown-toggle"
                              type="button"
                              aria-expanded={openJobDropdownId === job.id || hoveredJobId === job.id}
                            >
                              ⚙️ Manage
                            </button>
                            {(openJobDropdownId === job.id || hoveredJobId === job.id) && (
                              <div 
                                className="screenai-dropdown-menu dropdown-menu-end shadow-lg" 
                                style={{ display: "block", position: "absolute", right: 0, bottom: "100%", zIndex: 1050, minWidth: "200px" }}
                              >
                                <button
                                  onClick={() => {
                                    setOpenJobDropdownId(null);
                                    setHoveredJobId(null);
                                    handleOpenEditJob(job);
                                  }}
                                  className="dropdown-item screenai-dropdown-item small py-2 text-start btn w-100 border-0"
                                >
                                  ✏️ Edit Job Posting
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenJobDropdownId(null);
                                    setHoveredJobId(null);
                                    toggleApplicationForm(job);
                                  }}
                                  disabled={togglingJobFormId === job.id}
                                  className="dropdown-item screenai-dropdown-item small py-2 text-start btn w-100 border-0"
                                >
                                  {job.application_form_enabled ? "🔴 Disable Submissions" : "🟢 Enable Submissions"}
                                </button>
                                {job.status === "open" ? (
                                  <button
                                    onClick={() => {
                                      setOpenJobDropdownId(null);
                                      setHoveredJobId(null);
                                      updateJobStatus(job, "closed");
                                    }}
                                    className="dropdown-item screenai-dropdown-item small py-2 text-start btn w-100 border-0"
                                  >
                                    🔒 Close Position
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setOpenJobDropdownId(null);
                                      setHoveredJobId(null);
                                      updateJobStatus(job, "open");
                                    }}
                                    className="dropdown-item screenai-dropdown-item small py-2 text-start btn w-100 border-0"
                                  >
                                    🔓 Reopen Position
                                  </button>
                                )}
                                <div className="dropdown-divider border-secondary my-1"></div>
                                <button
                                  onClick={() => {
                                    setOpenJobDropdownId(null);
                                    setHoveredJobId(null);
                                    deleteJob(job);
                                  }}
                                  disabled={hasApps}
                                  className="dropdown-item screenai-dropdown-item text-danger small py-2 text-start btn w-100 border-0"
                                  title={hasApps ? "Cannot delete job with applications" : "Delete Job"}
                                >
                                  🗑️ Delete posting
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CANDIDATES & APPLICATIONS TAB */}
        {activeTab === "applications" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">Recruitment Workspace</h2>
              <p className="text-secondary">Verify candidate profiles, score breakdowns, and schedule interview rounds.</p>
            </div>

            {/* A. Job Context Header */}
            <div className="screenai-card mb-4 bg-dark border-secondary">
              <div className="row align-items-center g-3">
                <div className="col-lg-4">
                  <label className="form-label text-secondary small fw-bold">Active Recruitment Workspace</label>
                  <select
                    className="form-select form-select-sm"
                    value={appFilters.job}
                    onChange={(e) => {
                      setAppFilters({ ...appFilters, job: e.target.value });
                      setSelectedApplication(null);
                    }}
                  >
                    <option value="">📁 All Jobs (View All Candidates)</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.job_title} — {j.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                {activeJobObj ? (
                  <div className="col-lg-8 border-start-lg border-secondary-subtle ps-lg-4">
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <h5 className="fw-bold text-white mb-0">{activeJobObj.job_title}</h5>
                          <span className={`badge ${activeJobObj.status === "open" ? "bg-success" : "bg-warning text-dark"}`}>
                            {activeJobObj.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-secondary small mb-0">
                          {activeJobObj.company_name} • {activeJobObj.location || "No Location"} • Deadline: {activeJobObj.application_deadline ? new Date(activeJobObj.application_deadline).toLocaleDateString() : "No Deadline"}
                        </p>
                      </div>

                      <div className="d-flex flex-wrap gap-2">
                        {/* Copy Link */}
                        <button
                          onClick={() => copyApplicationLink(activeJobObj.application_token)}
                          className="btn btn-sm btn-outline-primary"
                        >
                          {copiedJobToken === activeJobObj.application_token ? "✓ Copied" : "🔗 Copy Public Link"}
                        </button>

                        {/* Toggle public form */}
                        <button
                          onClick={() => toggleApplicationForm(activeJobObj)}
                          disabled={togglingJobFormId === activeJobObj.id}
                          className={`btn btn-sm ${activeJobObj.application_form_enabled ? "btn-outline-success" : "btn-outline-secondary"}`}
                        >
                          {activeJobObj.application_form_enabled ? "🟢 Form Enabled" : "🔴 Form Disabled"}
                        </button>

                        {/* Edit Job */}
                        <button
                          onClick={() => handleOpenEditJob(activeJobObj)}
                          className="btn btn-sm btn-outline-info"
                        >
                          ✏️ Edit
                        </button>

                        {/* Close / Reopen Job */}
                        {activeJobObj.status === "open" ? (
                          <button
                            onClick={() => updateJobStatus(activeJobObj, "closed")}
                            className="btn btn-sm btn-outline-warning"
                          >
                            Close Job
                          </button>
                        ) : (
                          <button
                            onClick={() => updateJobStatus(activeJobObj, "open")}
                            className="btn btn-sm btn-outline-success"
                          >
                            Reopen Job
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="col-lg-8 text-secondary small italic">
                    Select a specific job listing from the dropdown to access custom link generators, toggle applications, or adjust status actions.
                  </div>
                )}
              </div>
            </div>

            {/* Split Pane Applications Explorer */}
            <div className="screenai-split-pane">
              {/* B. Left Candidate List Card */}
              <div className="screenai-pane-left">
                {/* Search & Filter Parameters inside the pane */}
                <div className="mb-3 border-bottom border-secondary pb-3">
                  <div className="mb-2">
                    <input
                      type="text"
                      className="form-control form-control-sm w-100"
                      placeholder="🔍 Search candidate name, role..."
                      value={appSearch}
                      onChange={(e) => setAppSearch(e.target.value)}
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <select
                        className="form-select form-select-sm w-100"
                        value={appFilters.min_score}
                        onChange={(e) => setAppFilters({ ...appFilters, min_score: e.target.value })}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="">Any Score</option>
                        <option value="50">50+</option>
                        <option value="70">70+</option>
                        <option value="85">85+</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <select
                        className="form-select form-select-sm w-100"
                        value={appFilters.status}
                        onChange={(e) => setAppFilters({ ...appFilters, status: e.target.value })}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="">Any Status</option>
                        <option value="pending">Pending</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="rejected">Rejected</option>
                        <option value="hired">Hired</option>
                      </select>
                    </div>
                    <div className="col-12">
                      <select
                        className="form-select form-select-sm w-100"
                        value={appFilters.experience}
                        onChange={(e) => setAppFilters({ ...appFilters, experience: e.target.value })}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="">Any Experience</option>
                        <option value="fresher">Fresher</option>
                        <option value="1">1+ Year</option>
                        <option value="3">3+ Years</option>
                        <option value="5">5+ Years</option>
                      </select>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-2" style={{ fontSize: "11px" }}>
                    <span className="text-secondary">
                      Found <strong>{filteredApplications.length}</strong> candidates
                    </span>
                    {(appSearch || appFilters.min_score || appFilters.status || appFilters.experience) && (
                      <button
                        onClick={() => {
                          setAppSearch("");
                          setAppFilters({
                            job: appFilters.job, // preserve selected job workspace!
                            min_score: "",
                            experience: "",
                            company: "",
                            recommendation: "",
                            status: "",
                          });
                        }}
                        className="btn btn-link p-0 text-info text-decoration-none"
                        style={{ fontSize: "11px" }}
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Candidate List Cards */}
                {filteredApplications.length === 0 ? (
                  <div className="text-center text-secondary py-5 small">
                    No candidates match the active filters.
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {filteredApplications.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => handleSelectApplication(app)}
                        className={`application-item ${selectedApplication?.id === app.id ? "selected" : ""}`}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <div>
                            <h6 className="fw-bold text-white mb-0" style={{ fontSize: "13px" }}>
                              {getCandidateName(app)}
                            </h6>
                            <small className="text-secondary" style={{ fontSize: "11px" }}>
                              {app.job_title}
                            </small>
                          </div>
                          <span className={`badge ${app.ai_score >= 80 ? "bg-success" : app.ai_score >= 50 ? "bg-warning text-dark" : "bg-danger"} fw-bold`} style={{ fontSize: "10px" }}>
                            AI: {app.ai_score ?? "P"}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center mt-2">
                          <span className="text-secondary" style={{ fontSize: "10px" }}>
                            Exp: {app.total_experience_years || 0} Yrs
                          </span>
                          <span
                            className={`badge text-capitalize px-2 py-0.5`}
                            style={{
                              fontSize: "10px",
                              backgroundColor:
                                app.application_status === "hired"
                                  ? "var(--screenai-success)"
                                  : app.application_status === "rejected"
                                  ? "var(--screenai-danger)"
                                  : app.application_status === "shortlisted"
                                  ? "var(--screenai-primary)"
                                  : "var(--screenai-text-muted)"
                            }}
                          >
                            {app.application_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* C. Candidate Workspace Drawer / Pane-Right */}
              <div className="screenai-pane-right">
                {!selectedApplication ? (
                  <div className="h-100 d-flex flex-column justify-content-center align-items-center text-secondary py-5">
                    <span className="fs-1 mb-2">👤</span>
                    <h5>No Candidate Selected</h5>
                    <p className="small text-center px-4">
                      Select a candidate application card from the explorer panel on the left to view detailed metrics and interviews pipeline.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Header Details */}
                    <div className="d-flex justify-content-between align-items-start border-bottom border-secondary pb-3 mb-4">
                      <div>
                        <h4 className="fw-bold text-white mb-1">{getCandidateName(selectedApplication)}</h4>
                        <p className="text-secondary small mb-0">
                          {selectedApplication.job_title} — {selectedApplication.company_name}
                        </p>
                      </div>
                      <button
                        onClick={() => handleSelectApplication(null)}
                        className="btn-close btn-close-white"
                        aria-label="Close"
                      />
                    </div>

                    {/* Collapsible/Separated Sections */}
                    <div className="d-flex flex-column gap-4">
                      
                      {/* Section 1: Candidate Summary */}
                      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                        <h5 className="fw-bold text-white mb-3 pb-2 border-bottom border-secondary small text-uppercase tracking-wider">
                          1. Candidate Summary
                        </h5>
                        <div className="row g-3 mb-3">
                          <div className="col-sm-6">
                            <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Email:</span>
                            <span className="text-white fw-semibold">{selectedApplication.candidate_email || "Not provided"}</span>
                          </div>
                          <div className="col-sm-6">
                            <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Phone:</span>
                            <span className="text-white fw-semibold">{selectedApplication.candidate_phone || "Not provided"}</span>
                          </div>
                          <div className="col-sm-6">
                            <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Total Experience:</span>
                            <span className="text-white fw-semibold">{selectedApplication.total_experience_years || 0} years</span>
                          </div>
                          <div className="col-sm-6">
                            <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Previous Companies:</span>
                            <span className="text-white fw-semibold">{selectedApplication.worked_companies || "None listed"}</span>
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          <a
                            href={getResumeUrl(selectedApplication.resume)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-outline-primary flex-fill fw-bold py-1.5"
                          >
                            📄 Open PDF Resume
                          </a>
                          <a
                            href={getResumeUrl(selectedApplication.resume)}
                            download
                            className="btn btn-xs btn-outline-light flex-fill py-1.5"
                          >
                            📥 Download Resume
                          </a>
                        </div>
                      </div>

                      {/* Section 2: Resume and AI Evaluation */}
                      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                        <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary">
                          <h5 className="fw-bold text-white mb-0 small text-uppercase tracking-wider">
                            2. Resume & AI Evaluation
                          </h5>
                          {selectedApplication.skills_score !== null && (
                            <button
                              onClick={() => setShowAiBreakdown(!showAiBreakdown)}
                              className="btn btn-xs btn-outline-info py-0.5 px-2 fw-semibold"
                              style={{ fontSize: "11px" }}
                            >
                              {showAiBreakdown ? "Hide Details ▴" : "Show Details ▾"}
                            </button>
                          )}
                        </div>

                        {selectedApplication.skills_score === null ? (
                          <p className="text-muted small mb-0">No AI evaluation available</p>
                        ) : (
                          <div>
                            <div className="d-flex justify-content-between align-items-center mb-3 p-2.5 rounded bg-dark-subtle border border-secondary">
                              <span className="text-secondary fw-semibold">Overall Compatibility:</span>
                              <span className="fs-5 text-primary fw-bold">{selectedApplication.ai_score}/100</span>
                            </div>

                            {showAiBreakdown && (
                              <div className="row g-2 mb-3 bg-dark-subtle p-2.5 rounded border border-secondary-subtle">
                                <div className="col-sm-6">
                                  <span className="text-secondary small">Skills Match ({selectedApplication.skills_score}/30):</span>
                                  <div className="progress mt-1" style={{ height: "6px" }}>
                                    <div
                                      className="progress-bar bg-success"
                                      style={{ width: `${(selectedApplication.skills_score / 30) * 100}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="col-sm-6">
                                  <span className="text-secondary small">Experience ({selectedApplication.experience_score}/25):</span>
                                  <div className="progress mt-1" style={{ height: "6px" }}>
                                    <div
                                      className="progress-bar bg-success"
                                      style={{ width: `${(selectedApplication.experience_score / 25) * 100}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="col-sm-6">
                                  <span className="text-secondary small">Projects ({selectedApplication.projects_score}/20):</span>
                                  <div className="progress mt-1" style={{ height: "6px" }}>
                                    <div
                                      className="progress-bar bg-success"
                                      style={{ width: `${(selectedApplication.projects_score / 20) * 100}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="col-sm-6">
                                  <span className="text-secondary small">Role Fit ({selectedApplication.company_role_score}/10):</span>
                                  <div className="progress mt-1" style={{ height: "6px" }}>
                                    <div
                                      className="progress-bar bg-success"
                                      style={{ width: `${(selectedApplication.company_role_score / 10) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="bg-dark-subtle p-2.5 rounded text-secondary small mb-2 border border-secondary-subtle">
                              <strong className="text-light">Experience Summary:</strong>
                              <p className="mb-0 mt-1">{selectedApplication.experience_summary || "Not evaluated"}</p>
                            </div>
                            <div className="bg-dark-subtle p-2.5 rounded text-secondary small mb-2 border border-secondary-subtle">
                              <strong className="text-light">Projects Summary:</strong>
                              <p className="mb-0 mt-1">{selectedApplication.project_summary || "Not evaluated"}</p>
                            </div>
                            <div className="bg-dark-subtle p-2.5 rounded text-secondary small border border-secondary-subtle">
                              <strong className="text-light">AI Feedback Summary:</strong>
                              <p className="mb-0 mt-1">{selectedApplication.ai_feedback || "Not evaluated"}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Section 3: Interviews */}
                      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                        <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary">
                          <h5 className="fw-bold text-white mb-0 small text-uppercase tracking-wider">
                            3. Interviews Pipeline
                          </h5>
                          {selectedApplication.application_status === "shortlisted" && (
                            <button
                              onClick={() => setShowScheduleModal(true)}
                              className="btn btn-xs btn-primary py-1 px-2 fw-semibold"
                              style={{ fontSize: "11.5px" }}
                            >
                              📅 Schedule Round
                            </button>
                          )}
                        </div>

                        {loadingInterviews ? (
                          <p className="text-muted small">Loading interviews...</p>
                        ) : interviews.length === 0 ? (
                          <div className="text-center py-3 text-secondary small">
                            No interview rounds scheduled yet. Candidate must be "Shortlisted" to schedule rounds.
                          </div>
                        ) : (
                          <div className="screenai-timeline">
                            {interviews.map((interview) => (
                              <div key={interview.id} className="screenai-timeline-item text-start">
                                <div
                                  className={`screenai-timeline-dot ${
                                    interview.status === "completed"
                                      ? "completed"
                                      : interview.status === "cancelled"
                                      ? "cancelled"
                                      : "scheduled"
                                  }`}
                                />
                                <div className="p-3 rounded border border-secondary bg-dark-subtle">
                                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                    <div>
                                      <h6 className="fw-bold text-white mb-0" style={{ fontSize: "13px" }}>
                                        Round {interview.round_number}: {interview.round_name}
                                      </h6>
                                      <span className="text-secondary text-capitalize small" style={{ fontSize: "11px" }}>
                                        {interview.interview_type} — {interview.duration_minutes} mins
                                      </span>
                                    </div>
                                    <span
                                      className={`badge text-capitalize ${
                                        interview.status === "completed"
                                          ? "bg-success"
                                          : interview.status === "cancelled"
                                          ? "bg-danger"
                                          : "bg-warning text-dark"
                                      }`}
                                      style={{ fontSize: "10px" }}
                                    >
                                      {interview.status}
                                    </span>
                                  </div>

                                  <div className="mt-2 text-secondary small" style={{ fontSize: "11.5px" }}>
                                    <div>
                                      <strong>Time:</strong> {new Date(interview.scheduled_at).toLocaleString()}
                                    </div>
                                    <div>
                                      <strong>Interviewer:</strong> {interview.interviewer_name} ({interview.interviewer_email})
                                    </div>
                                    {interview.location_or_meeting_link && (
                                      <div className="text-truncate">
                                        <strong>Link/Location:</strong>{" "}
                                        <a
                                          href={
                                            interview.location_or_meeting_link.startsWith("http")
                                              ? interview.location_or_meeting_link
                                              : "#"
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-info"
                                        >
                                          {interview.location_or_meeting_link}
                                        </a>
                                      </div>
                                    )}
                                  </div>

                                  {interview.status === "completed" && (
                                    <div className="mt-2 pt-2 border-top border-secondary">
                                      <div className="fw-bold text-white small mb-1">Feedback:</div>
                                      <p className="text-secondary small mb-2">{interview.feedback}</p>
                                      <div className="d-flex flex-wrap gap-2 small">
                                        <span className="badge bg-secondary">Tech: {interview.technical_rating}/5</span>
                                        <span className="badge bg-secondary">Comm: {interview.communication_rating}/5</span>
                                        <span className="badge bg-secondary">Problem: {interview.problem_solving_rating}/5</span>
                                        <span className="badge bg-success">Overall: {interview.overall_rating}/5</span>
                                      </div>
                                      <div className="text-warning small fw-bold text-capitalize mt-1">
                                        Recommendation: {interview.recommendation?.replace("_", " ")}
                                      </div>
                                    </div>
                                  )}

                                  {interview.status === "scheduled" && (
                                    <div className="mt-3 d-flex gap-2">
                                      <button
                                        onClick={() => handleCompleteClick(interview)}
                                        className="btn btn-xs btn-success py-1 px-2 fw-semibold"
                                        style={{ fontSize: "11px" }}
                                      >
                                        ✓ Complete
                                      </button>
                                      <button
                                        onClick={() => handleRescheduleClick(interview)}
                                        className="btn btn-xs btn-warning text-dark py-1 px-2 fw-semibold"
                                        style={{ fontSize: "11px" }}
                                      >
                                        Reschedule
                                      </button>
                                      <button
                                        onClick={() => handleCancelInterview(interview.id)}
                                        className="btn btn-xs btn-danger py-1 px-2 fw-semibold"
                                        style={{ fontSize: "11px" }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section 4: Recruitment Decision (Only visible if status is NOT hired) */}
                      {selectedApplication.application_status !== "hired" && (
                        <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <h5 className="fw-bold text-white mb-3 pb-2 border-bottom border-secondary small text-uppercase tracking-wider">
                            4. Recruitment Decision
                          </h5>
                          <div className="d-flex align-items-center gap-2 mb-3">
                            <span className="text-secondary small">Current Application Status:</span>
                            <span className="badge bg-secondary text-uppercase py-1 px-2">
                              {selectedApplication.application_status}
                            </span>
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            <button
                              onClick={() => handleStatusChangeRequest("hired")}
                              className="btn btn-sm btn-success fw-bold flex-fill"
                            >
                              🎉 Hire Candidate
                            </button>
                            <button
                              onClick={() => handleStatusChangeRequest("shortlisted")}
                              disabled={selectedApplication.application_status === "shortlisted"}
                              className="btn btn-sm btn-primary flex-fill fw-bold"
                            >
                              Shortlist
                            </button>
                            <button
                              onClick={() => handleStatusChangeRequest("rejected")}
                              disabled={selectedApplication.application_status === "rejected"}
                              className="btn btn-sm btn-danger flex-fill fw-bold"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleStatusChangeRequest("pending")}
                              disabled={selectedApplication.application_status === "pending"}
                              className="btn btn-sm btn-secondary flex-fill fw-bold"
                            >
                              Mark Pending
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Section 5: Post-Hire Progression (Only visible if status is hired) */}
                      {selectedApplication.application_status === "hired" && (
                        <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <h5 className="fw-bold text-white mb-3 pb-2 border-bottom border-secondary small text-uppercase tracking-wider">
                            5. Post-Hire Progression
                          </h5>
                          <div className="alert alert-success border-0 py-2 px-3 mb-3 small fw-bold text-dark text-center">
                            🎉 Candidate Hired. Log placement progressions below.
                          </div>

                          <form onSubmit={handleAddProgression} className="p-3 rounded mb-3 small border border-secondary" style={{ backgroundColor: "var(--screenai-surface)" }}>
                            <label className="form-label text-secondary small fw-bold mb-2">Record Onboarding Update</label>
                            <div className="row g-2">
                              <div className="col-sm-5">
                                <select
                                  className="form-select form-select-sm"
                                  value={progStage}
                                  onChange={(e) => setProgStage(e.target.value)}
                                  disabled={updatingProg}
                                >
                                  <option value="Offer Extended">Offer Extended</option>
                                  <option value="Onboarding">Onboarding</option>
                                  <option value="Active Employee">Active Employee</option>
                                  <option value="Promoted">Promoted</option>
                                  <option value="Resigned">Resigned</option>
                                  <option value="Terminated">Terminated</option>
                                </select>
                              </div>
                              <div className="col-sm-7">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="Add progress notes..."
                                  value={progNotes}
                                  onChange={(e) => setProgNotes(e.target.value)}
                                  disabled={updatingProg}
                                />
                              </div>
                              <div className="col-12 mt-2">
                                <button
                                  type="submit"
                                  className="btn btn-sm btn-primary w-100 fw-bold"
                                  disabled={updatingProg || !progStage.trim()}
                                >
                                  {updatingProg ? "Saving Stage..." : "Add Progression Stage"}
                                </button>
                              </div>
                            </div>
                          </form>

                          <div className="timeline-stages small">
                            <div className="position-relative ps-3">
                              <div
                                className="position-absolute h-100 border-start border-secondary"
                                style={{ left: "5px", top: "0" }}
                              />
                              {!selectedApplication.progressions ||
                              selectedApplication.progressions.length === 0 ? (
                                <p className="text-secondary small">No onboarding progression logs recorded yet.</p>
                              ) : (
                                selectedApplication.progressions.map((log) => (
                                  <div key={log.id} className="position-relative mb-3 small">
                                    <div
                                      className="position-absolute bg-success rounded-circle"
                                      style={{ left: "-18px", top: "6px", width: "8px", height: "8px" }}
                                    />
                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                      <strong className="text-white">{log.stage}</strong>
                                      <span className="text-muted" style={{ fontSize: "10px" }}>
                                        {new Date(log.updated_at).toLocaleString()}
                                      </span>
                                    </div>
                                    {log.notes && <div className="text-secondary mb-1">{log.notes}</div>}
                                    <div className="text-muted" style={{ fontSize: "9px" }}>
                                      Recorded by: {log.updated_by_username ? `@${log.updated_by_username}` : "System"}{" "}
                                      ({log.updater_role === "admin" ? "Admin" : "HR"})
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MY PROFILE TAB */}
        {activeTab === "profile" && (
          <div>
            <div className="mb-4">
              <h2 className="fw-bold text-white">My Profile</h2>
              <p className="text-secondary">View and configure your recruiter credentials.</p>
            </div>

            <div className="row">
              <div className="col-lg-8">
                <div className="screenai-card bg-dark border-secondary">
                  <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-secondary pb-3">
                    <div>
                      <h4 className="fw-bold text-white">
                        {profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : profile?.username}
                      </h4>
                      <p className="text-secondary mb-0 text-capitalize">{profile?.role} account</p>
                    </div>
                    {!editingProfile && (
                      <button onClick={() => setEditingProfile(true)} className="btn btn-outline-primary px-3">
                        ✏️ Edit Profile
                      </button>
                    )}
                  </div>

                  {editingProfile ? (
                    <form onSubmit={handleProfileUpdate}>
                      <div className="row g-3">
                        <div className="col-md-6 mb-3">
                          <label className="form-label text-secondary small fw-bold">First Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={profileForm.first_name}
                            onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                            disabled={savingProfile}
                          />
                        </div>
                        <div className="col-md-6 mb-3">
                          <label className="form-label text-secondary small fw-bold">Last Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={profileForm.last_name}
                            onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                            disabled={savingProfile}
                          />
                        </div>
                        <div className="col-md-12 mb-3">
                          <label className="form-label text-secondary small fw-bold">Email Address</label>
                          <input
                            type="email"
                            className="form-control"
                            value={profileForm.email}
                            onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                            required
                            disabled={savingProfile}
                          />
                        </div>
                        <div className="col-md-12 mb-3">
                          <label className="form-label text-secondary small fw-bold">Phone Number</label>
                          <input
                            type="text"
                            className="form-control"
                            value={profileForm.phone}
                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                            disabled={savingProfile}
                          />
                        </div>
                      </div>

                      <div className="d-flex gap-2 mt-4">
                        <button type="submit" className="btn btn-primary px-4 fw-bold" disabled={savingProfile}>
                          {savingProfile ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileForm({
                              first_name: profile?.first_name || "",
                              last_name: profile?.last_name || "",
                              email: profile?.email || "",
                              phone: profile?.phone || "",
                            });
                            setEditingProfile(false);
                          }}
                          className="btn btn-outline-secondary px-3"
                          disabled={savingProfile}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="row g-3">
                      <div className="col-md-6">
                        <div className="border rounded p-3" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <small className="text-secondary d-block">Username</small>
                          <span className="fw-semibold text-white">{profile?.username || "Not set"}</span>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="border rounded p-3" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <small className="text-secondary d-block">Role</small>
                          <span className="fw-semibold text-white text-capitalize">{profile?.role || "Not set"}</span>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="border rounded p-3" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <small className="text-secondary d-block">Email Address</small>
                          <span className="fw-semibold text-white">{profile?.email || "Not set"}</span>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="border rounded p-3" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
                          <small className="text-secondary d-block">Phone Number</small>
                          <span className="fw-semibold text-white">{profile?.phone || "Not set"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- ADD JOB MODAL --- */}
      {showAddJobModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h4 className="fw-bold mb-0">Create Job Opening</h4>
              <button onClick={() => setShowAddJobModal(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleAddJobSubmit}>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Job Title</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={addJobForm.job_title}
                  onChange={(e) => setAddJobForm({ ...addJobForm, job_title: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Company Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={addJobForm.company_name}
                  onChange={(e) => setAddJobForm({ ...addJobForm, company_name: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Location</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Remote, San Francisco"
                  value={addJobForm.location}
                  onChange={(e) => setAddJobForm({ ...addJobForm, location: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Required Skills</label>
                <textarea
                  className="form-control"
                  required
                  rows="2"
                  value={addJobForm.required_skills}
                  onChange={(e) => setAddJobForm({ ...addJobForm, required_skills: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Required Experience</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="e.g. 3+ Years"
                  value={addJobForm.required_experience}
                  onChange={(e) => setAddJobForm({ ...addJobForm, required_experience: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Job Description</label>
                <textarea
                  className="form-control"
                  required
                  rows="4"
                  value={addJobForm.job_description}
                  onChange={(e) => setAddJobForm({ ...addJobForm, job_description: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Deadline (Optional)</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={addJobForm.application_deadline}
                  onChange={(e) => setAddJobForm({ ...addJobForm, application_deadline: e.target.value })}
                />
              </div>
              <div className="mb-4 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="add_app_form_enabled"
                  checked={addJobForm.application_form_enabled}
                  onChange={(e) =>
                    setAddJobForm({ ...addJobForm, application_form_enabled: e.target.checked })
                  }
                />
                <label className="form-check-label text-secondary small" htmlFor="add_app_form_enabled">
                  Accept candidate resume applications immediately
                </label>
              </div>

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary flex-fill fw-bold">
                  Create Job Posting
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddJobModal(false)}
                  className="btn btn-outline-secondary px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT JOB MODAL --- */}
      {showEditJobModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h4 className="fw-bold mb-0">Edit Job Posting</h4>
              <button onClick={() => setShowEditJobModal(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleEditJobSubmit}>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Job Title</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={editJobForm.job_title}
                  onChange={(e) => setEditJobForm({ ...editJobForm, job_title: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Company Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={editJobForm.company_name}
                  onChange={(e) => setEditJobForm({ ...editJobForm, company_name: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Location</label>
                <input
                  type="text"
                  className="form-control"
                  value={editJobForm.location}
                  onChange={(e) => setEditJobForm({ ...editJobForm, location: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Required Skills</label>
                <textarea
                  className="form-control"
                  required
                  rows="2"
                  value={editJobForm.required_skills}
                  onChange={(e) => setEditJobForm({ ...editJobForm, required_skills: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Required Experience</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={editJobForm.required_experience}
                  onChange={(e) => setEditJobForm({ ...editJobForm, required_experience: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Job Description</label>
                <textarea
                  className="form-control"
                  required
                  rows="4"
                  value={editJobForm.job_description}
                  onChange={(e) => setEditJobForm({ ...editJobForm, job_description: e.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label text-secondary small fw-bold">Deadline</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={editJobForm.application_deadline}
                  onChange={(e) => setEditJobForm({ ...editJobForm, application_deadline: e.target.value })}
                />
              </div>
              <div className="mb-4 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="edit_app_form_enabled"
                  checked={editJobForm.application_form_enabled}
                  onChange={(e) =>
                    setEditJobForm({ ...editJobForm, application_form_enabled: e.target.checked })
                  }
                />
                <label className="form-check-label text-secondary small" htmlFor="edit_app_form_enabled">
                  Accept applications through public link
                </label>
              </div>

              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary flex-fill fw-bold">
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditJobModal(false)}
                  className="btn btn-outline-secondary px-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SCHEDULE INTERVIEW MODAL --- */}
      {showScheduleModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h4 className="fw-bold mb-0">Schedule Interview Round</h4>
              <button onClick={() => setShowScheduleModal(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleScheduleSubmit}>
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label text-secondary small fw-bold">Round Name</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Technical Round 1, System Design"
                    value={scheduleForm.round_name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, round_name: e.target.value })}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label text-secondary small fw-bold">Round #</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    min="1"
                    value={scheduleForm.round_number}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, round_number: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-secondary small fw-bold">Interview Type</label>
                  <select
                    className="form-select"
                    value={scheduleForm.interview_type}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, interview_type: e.target.value })}
                  >
                    <option value="phone">Phone Call</option>
                    <option value="video">Video Meeting</option>
                    <option value="in_person">In Person</option>
                    <option value="technical">Technical Test</option>
                    <option value="hr">HR Round</option>
                    <option value="managerial">Managerial Round</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label text-secondary small fw-bold">Duration (Mins)</label>
                  <input
                    type="number"
                    className="form-control"
                    required
                    min="5"
                    max="1440"
                    value={scheduleForm.duration_minutes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label text-secondary small fw-bold">Date & Time</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    required
                    value={scheduleForm.scheduled_at}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_at: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label text-secondary small fw-bold">
                    Meeting Link / Physical Location
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://meet.google.com/abc or Office Floor Room"
                    required={scheduleForm.interview_type === "video" || scheduleForm.interview_type === "in_person"}
                    value={scheduleForm.location_or_meeting_link}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, location_or_meeting_link: e.target.value })
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-secondary small fw-bold">Interviewer Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={scheduleForm.interviewer_name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, interviewer_name: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label text-secondary small fw-bold">Interviewer Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={scheduleForm.interviewer_email}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, interviewer_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="d-flex gap-2 mt-4">
                <button type="submit" className="btn btn-primary flex-fill fw-bold">
                  Schedule Round
                </button>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="btn btn-outline-secondary px-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- COMPLETE INTERVIEW MODAL --- */}
      {showCompleteModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h4 className="fw-bold mb-0">Record Interview Evaluations</h4>
              <button onClick={() => setShowCompleteModal(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleCompleteSubmit}>
              <div className="row g-3 small">
                {/* Rating 1-5 controls */}
                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Technical Rating (1-5)</label>
                  <select
                    className="form-select"
                    value={completeForm.technical_rating}
                    onChange={(e) => setCompleteForm({ ...completeForm, technical_rating: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Star{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Communication Rating (1-5)</label>
                  <select
                    className="form-select"
                    value={completeForm.communication_rating}
                    onChange={(e) => setCompleteForm({ ...completeForm, communication_rating: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Star{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Problem Solving Rating (1-5)</label>
                  <select
                    className="form-select"
                    value={completeForm.problem_solving_rating}
                    onChange={(e) => setCompleteForm({ ...completeForm, problem_solving_rating: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Star{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Culture Fit Rating (1-5)</label>
                  <select
                    className="form-select"
                    value={completeForm.culture_fit_rating}
                    onChange={(e) => setCompleteForm({ ...completeForm, culture_fit_rating: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Star{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Overall Rating (1-5)</label>
                  <select
                    className="form-select"
                    value={completeForm.overall_rating}
                    onChange={(e) => setCompleteForm({ ...completeForm, overall_rating: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} Star{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label text-secondary fw-bold">Recommendation</label>
                  <select
                    className="form-select"
                    value={completeForm.recommendation}
                    onChange={(e) => setCompleteForm({ ...completeForm, recommendation: e.target.value })}
                  >
                    <option value="strong_hire">Strong Hire</option>
                    <option value="hire">Hire</option>
                    <option value="review">Review</option>
                    <option value="no_hire">No Hire</option>
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label text-secondary fw-bold">Feedback Comments</label>
                  <textarea
                    className="form-control"
                    required
                    placeholder="Enter detailed interviewer assessment notes..."
                    rows="3"
                    value={completeForm.feedback}
                    onChange={(e) => setCompleteForm({ ...completeForm, feedback: e.target.value })}
                  />
                </div>
              </div>

              <div className="d-flex gap-2 mt-4">
                <button type="submit" className="btn btn-success flex-fill fw-bold">
                  ✓ Submit Evaluations
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="btn btn-outline-secondary px-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- RESCHEDULE INTERVIEW MODAL --- */}
      {showRescheduleModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content" style={{ maxWidth: "450px" }}>
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h5 className="fw-bold mb-0">Reschedule Interview</h5>
              <button onClick={() => setShowRescheduleModal(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleRescheduleSubmit}>
              <div className="mb-4">
                <label className="form-label text-secondary small fw-bold">New Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-info text-dark fw-bold flex-fill">
                  Save New Time
                </button>
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="btn btn-outline-secondary px-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- HIRE WARNING CHECKLIST MODAL --- */}
      {showHireWarningModal && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content">
            <div className="d-flex align-items-center gap-2 mb-3 text-warning border-bottom border-secondary pb-3">
              <span className="fs-3">⚠️</span>
              <h4 className="fw-bold mb-0 text-white">Pending Requirements Audit</h4>
            </div>

            <p className="text-secondary small mb-4">
              Hiring requirements have not been completed for candidate{" "}
              <strong className="text-white">{getCandidateName(selectedApplication)}</strong>. Please review the
              following pending audits before proceeding:
            </p>

            <ul className="list-group list-group-flush bg-transparent border-0 mb-4 text-start small">
              {hireWarningReasons.map((reason, index) => (
                <li
                  key={index}
                  className="list-group-item bg-transparent text-warning border-0 px-0 d-flex gap-2 align-items-start"
                >
                  <span>•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>

            <div className="alert alert-secondary py-2 mb-4 small text-secondary-subtle">
              Proceeding with "Confirm Hire" will move the candidate to placement tracking, bypass outstanding
              evaluations, and mark them as Hired.
            </div>

            <div className="d-flex gap-2">
              <button
                onClick={() => {
                  setShowHireWarningModal(false);
                  updateStatusDirect("hired");
                }}
                className="btn btn-danger flex-fill fw-bold"
              >
                Confirm Hire Anyway
              </button>
              <button onClick={() => setShowHireWarningModal(false)} className="btn btn-outline-secondary px-4">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION DIALOG --- */}
      {confirmModal.isOpen && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={closeConfirmModal}
        />
      )}

      {/* --- TOAST MESSAGES --- */}
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

export default HRDashboard;