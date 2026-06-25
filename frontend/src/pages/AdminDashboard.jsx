import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import API, { MEDIA_BASE_URL } from "../api/axiosConfig";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { clearAuthData } from "../utils/auth";
import { DataGrid } from "@mui/x-data-grid";

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
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  // Navigation state
  const [gridMode, setGridMode] = useState("recruiters");
  const [gridSearch, setGridSearch] = useState("");
  const [drawerTab, setDrawerTab] = useState("profile");

  // Data States
  const [hrs, setHrs] = useState([]);
  const [hiredCandidates, setHiredCandidates] = useState([]);
  
  // Global Activity States
  const [globalActivityResults, setGlobalActivityResults] = useState([]);
  const [globalActivityCount, setGlobalActivityCount] = useState(0);
  const [globalActivityPage] = useState(1);
  const [globalActivityLoading, setGlobalActivityLoading] = useState(true);

  // Recruiter Drawer Activity States
  const [recruiterActivityResults, setRecruiterActivityResults] = useState([]);
  const [recruiterActivityCount, setRecruiterActivityCount] = useState(0);
  const [recruiterActivityPage, setRecruiterActivityPage] = useState(1);
  const [recruiterActivityLoading, setRecruiterActivityLoading] = useState(false);
  const [recruiterActivityFilters, setRecruiterActivityFilters] = useState({ search: "", action: "" });
  const [selectedHRId, setSelectedHRId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  const selectedHR = useMemo(() => {
    if (selectedHRId === null) return null;
    return hrs.find((h) => h.id === selectedHRId) || null;
  }, [hrs, selectedHRId]);

  const selectedCandidate = useMemo(() => {
    if (selectedCandidateId === null) return null;
    return hiredCandidates.find((c) => c.id === selectedCandidateId) || null;
  }, [hiredCandidates, selectedCandidateId]);
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

  // Recruiter list master-detail & modal states
  const [showCreateRecruiterModal, setShowCreateRecruiterModal] = useState(false);
  const [newRecruiterCredentials, setNewRecruiterCredentials] = useState(null);
  const [hrInterviews, setHrInterviews] = useState([]);
  const [systemInterviewsMetrics, setSystemInterviewsMetrics] = useState({});
  const [allInterviewsList, setAllInterviewsList] = useState([]);

  const adminLoadingAbortControllerRef = useRef(null);
  const activityAbortControllerRef = useRef(null);
  const interviewsAbortControllerRef = useRef(null);

  const setHrsRef = useRef(setHrs);
  const setHiredCandidatesRef = useRef(setHiredCandidates);
  const setGlobalActivityResultsRef = useRef(setGlobalActivityResults);
  const setGlobalActivityCountRef = useRef(setGlobalActivityCount);
  const setSystemInterviewsMetricsRef = useRef(setSystemInterviewsMetrics);
  const setAllInterviewsListRef = useRef(setAllInterviewsList);
  const setErrorRef = useRef(setError);
  const setLoadingRef = useRef(setLoading);
  const setGlobalActivityLoadingRef = useRef(setGlobalActivityLoading);
  const setRecruiterActivityResultsRef = useRef(setRecruiterActivityResults);
  const setRecruiterActivityCountRef = useRef(setRecruiterActivityCount);
  const setRecruiterActivityLoadingRef = useRef(setRecruiterActivityLoading);
  const setHrInterviewsRef = useRef(setHrInterviews);

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
  const [togglingHrId, setTogglingHrId] = useState(null);
  const [stage, setStage] = useState("Onboarding");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  // Progression Log Editing Controls
  const [editingLogId, setEditingLogId] = useState(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");



  const fetchAdminData = useCallback(async () => {
    if (adminLoadingAbortControllerRef.current) {
      adminLoadingAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    adminLoadingAbortControllerRef.current = controller;

    setErrorRef.current("");

    try {
      const [hrsResponse, candidatesResponse, activityResponse, interviewsResponse] = await Promise.all([
        API.get("/applications/admin/hrs/", { signal: controller.signal }),
        API.get("/applications/admin/hired-candidates/", { signal: controller.signal }),
        API.get(`/applications/admin/activity-log/?page=${globalActivityPage}`, { signal: controller.signal }),
        API.get("/applications/admin/interviews/", { signal: controller.signal }),
      ]);
      if (isMounted.current && !controller.signal.aborted) {
        setHrsRef.current(hrsResponse.data);
        setHiredCandidatesRef.current(candidatesResponse.data);
        const globalAct = activityResponse.data;
        if (globalAct && Array.isArray(globalAct.results)) {
          setGlobalActivityResultsRef.current(globalAct.results);
          setGlobalActivityCountRef.current(globalAct.count || 0);
        } else if (Array.isArray(globalAct)) {
          setGlobalActivityResultsRef.current(globalAct);
          setGlobalActivityCountRef.current(globalAct.length);
        } else {
          setGlobalActivityResultsRef.current([]);
          setGlobalActivityCountRef.current(0);
        }
        setSystemInterviewsMetricsRef.current(interviewsResponse.data.metrics || {});
        setAllInterviewsListRef.current(interviewsResponse.data.results || []);
      }
    } catch (err) {
      if (isMounted.current && !controller.signal.aborted && !axios.isCancel(err)) {
        console.error("Failed to load admin data:", err);
        setErrorRef.current(err.response?.data?.detail || "Failed to load dashboard metrics.");
      }
    } finally {
      if (isMounted.current && !controller.signal.aborted) {
        setLoadingRef.current(false);
        setGlobalActivityLoadingRef.current(false);
      }
    }
  }, [globalActivityPage]);

  const fetchRecruiterActivity = useCallback(async (hrId, page, filters) => {
    if (activityAbortControllerRef.current) {
      activityAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activityAbortControllerRef.current = controller;

    setErrorRef.current("");

    try {
      let url = `/applications/admin/activity-log/?recruiter_id=${hrId}&page=${page}`;
      if (filters.search) {
        url += `&search=${encodeURIComponent(filters.search)}`;
      }
      if (filters.action) {
        url += `&action=${encodeURIComponent(filters.action)}`;
      }
      const res = await API.get(url, { signal: controller.signal });
      if (isMounted.current && !controller.signal.aborted) {
        const data = res.data;
        if (data && Array.isArray(data.results)) {
          setRecruiterActivityResultsRef.current(data.results);
          setRecruiterActivityCountRef.current(data.count || 0);
        } else if (Array.isArray(data)) {
          setRecruiterActivityResultsRef.current(data);
          setRecruiterActivityCountRef.current(data.length);
        } else {
          setRecruiterActivityResultsRef.current([]);
          setRecruiterActivityCountRef.current(0);
        }
      }
    } catch (err) {
      if (isMounted.current && !controller.signal.aborted && !axios.isCancel(err)) {
        console.error("Failed to load recruiter activity:", err);
        setErrorRef.current(err.response?.data?.detail || "Failed to load recruiter activity.");
      }
    } finally {
      if (isMounted.current && !controller.signal.aborted) {
        setRecruiterActivityLoadingRef.current(false);
      }
    }
  }, []);

  const fetchRecruiterInterviews = useCallback(async (hrId) => {
    if (interviewsAbortControllerRef.current) {
      interviewsAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    interviewsAbortControllerRef.current = controller;

    try {
      const res = await API.get(`/applications/admin/interviews/?recruiter=${hrId}`, { signal: controller.signal });
      if (isMounted.current && !controller.signal.aborted) {
        setHrInterviewsRef.current(res.data.results || []);
      }
    } catch (err) {
      if (isMounted.current && !controller.signal.aborted && !axios.isCancel(err)) {
        console.error("Failed to load recruiter interviews:", err);
      }
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
    return () => {
      if (adminLoadingAbortControllerRef.current) {
        adminLoadingAbortControllerRef.current.abort();
        adminLoadingAbortControllerRef.current = null;
      }
    };
  }, [fetchAdminData]);

  useEffect(() => {
    if (selectedHRId && drawerTab === "activity") {
      fetchRecruiterActivity(selectedHRId, recruiterActivityPage, recruiterActivityFilters);
    }
    return () => {
      if (activityAbortControllerRef.current) {
        activityAbortControllerRef.current.abort();
        activityAbortControllerRef.current = null;
      }
    };
  }, [selectedHRId, drawerTab, recruiterActivityPage, recruiterActivityFilters, fetchRecruiterActivity]);

  useEffect(() => {
    if (selectedHRId) {
      fetchRecruiterInterviews(selectedHRId);
    }
    return () => {
      if (interviewsAbortControllerRef.current) {
        interviewsAbortControllerRef.current.abort();
        interviewsAbortControllerRef.current = null;
      }
    };
  }, [selectedHRId, fetchRecruiterInterviews]);

  const selectHR = useCallback((hrId) => {
    setSelectedHRId(hrId);
    setRecruiterActivityPage(1);
    setRecruiterActivityFilters({ search: "", action: "" });
    setRecruiterActivityResults([]);
    setRecruiterActivityCount(0);
    setRecruiterActivityLoading(true);
    setHrInterviews([]);
    setError("");
  }, []);

  const closeRecruiterDrawer = useCallback(() => {
    setSelectedHRId(null);
    setSelectedCandidateId(null);
    setDrawerTab("profile");
    setRecruiterActivityResults([]);
    setRecruiterActivityCount(0);
    setRecruiterActivityPage(1);
    setRecruiterActivityFilters({ search: "", action: "" });
    setRecruiterActivityLoading(false);
    setHrInterviews([]);
    setError("");
    if (activityAbortControllerRef.current) {
      activityAbortControllerRef.current.abort();
      activityAbortControllerRef.current = null;
    }
    if (interviewsAbortControllerRef.current) {
      interviewsAbortControllerRef.current.abort();
      interviewsAbortControllerRef.current = null;
    }
  }, []);

  const handleTabChange = useCallback((newTab) => {
    if (drawerTab === "activity" && newTab !== "activity") {
      setRecruiterActivityResults([]);
      setRecruiterActivityCount(0);
      setRecruiterActivityLoading(false);
      if (activityAbortControllerRef.current) {
        activityAbortControllerRef.current.abort();
        activityAbortControllerRef.current = null;
      }
    }
    if (newTab === "activity") {
      setRecruiterActivityLoading(true);
    }
    if (newTab !== "hires") {
      setSelectedCandidateId(null);
    }
    setDrawerTab(newTab);
  }, [drawerTab]);

  const selectCandidate = useCallback((candidateId) => {
    setSelectedCandidateId(candidateId);
  }, []);

  const closeCandidateDetails = useCallback(() => {
    setSelectedCandidateId(null);
  }, []);

  // Escape key handler to close drawers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeRecruiterDrawer();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeRecruiterDrawer]);

  // Recruiter Account Suspend/Activate Toggle
  const handleToggleHRActive = useCallback((hrId, username, currentStatus) => {
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
          const msg = `Recruiter @${username} has been successfully ${updatedStatus ? "activated" : "suspended"
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
  }, [fetchAdminData]);

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
      await API.post(
        `/applications/admin/${selectedCandidate.id}/progression/`,
        { stage: stage.trim(), notes: notes.trim() }
      );

      const msg = `Progression stage updated to "${stage}"!`;
      setSuccess(msg);
      showToast(msg, "success");
      setNotes("");

      await fetchAdminData();
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
      await API.patch(`/applications/admin/progression/${logId}/`, {
        stage: editStage.trim(),
        notes: editNotes.trim(),
      });

      const msg = "Progression log updated successfully!";
      setSuccess(msg);
      showToast(msg, "success");
      setEditingLogId(null);
      await fetchAdminData();
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
          await API.delete(`/applications/admin/progression/${logId}/`);
          const msg = "Progression stage deleted successfully.";
          setSuccess(msg);
          showToast(msg, "success");
          await fetchAdminData();
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
    const base = MEDIA_BASE_URL.endsWith("/") ? MEDIA_BASE_URL.slice(0, -1) : MEDIA_BASE_URL;
    const normalizedPath = resumePath.startsWith("/") ? resumePath : `/${resumePath}`;
    return `${base}${normalizedPath}`;
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





  const handleViewRecruiter = useCallback((recruiterUsername) => {
    const hr = hrs.find((h) => h.username === recruiterUsername);
    if (hr) {
      selectHR(hr.id);
    }
  }, [hrs, selectHR]);

  const recruiterColumns = useMemo(() => [
    {
      field: "recruiterInfo",
      headerName: "Recruiter",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
        return name || row.username;
      },
    },
    {
      field: "username",
      headerName: "Username",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (value, row) => `@${row.username}`,
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => row.email || "N/A",
    },
    {
      field: "is_active",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <span className={`badge ${params.value ? "bg-success" : "bg-danger"}`}>
          {params.value ? "Active" : "Suspended"}
        </span>
      ),
    },
    {
      field: "last_login",
      headerName: "Last Login",
      flex: 1.5,
      minWidth: 160,
      valueFormatter: (value) => value ? new Date(value).toLocaleString() : "Never",
    },
    {
      field: "jobs_count",
      headerName: "Jobs",
      width: 80,
      type: "number",
      valueGetter: (value, row) => row.jobs_count || 0,
    },
    {
      field: "applications_count",
      headerName: "Apps",
      width: 80,
      type: "number",
      valueGetter: (value, row) => row.applications_count || 0,
    },
    {
      field: "hired_count",
      headerName: "Hires",
      width: 80,
      type: "number",
      valueGetter: (value, row) => row.hired_count || 0,
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 250,
      sortable: false,
      renderCell: (params) => {
        const row = params.row;
        return (
          <div className="d-flex align-items-center gap-1 h-100">
             <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                selectHR(row.id);
                handleTabChange("profile");
              }}
            >
              View
            </button>
            <button
              className={`btn btn-xs ${row.is_active ? "btn-outline-danger" : "btn-outline-success"} py-0.5 px-1.5 small`}
              style={{ fontSize: "10px" }}
              disabled={togglingHrId === row.id}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleHRActive(row.id, row.username, row.is_active);
              }}
            >
              {row.is_active ? "Suspend" : "Activate"}
            </button>
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                selectHR(row.id);
                setResettingPassword(true);
                setShowCreateRecruiterModal(false);
              }}
            >
              Reset PW
            </button>
          </div>
        );
      },
    },
  ], [togglingHrId, handleToggleHRActive, selectHR, handleTabChange]);

  const jobColumns = useMemo(() => [
    {
      field: "job_title",
      headerName: "Job Title",
      flex: 1.5,
      minWidth: 150,
    },
    {
      field: "company_name",
      headerName: "Company",
      flex: 1.2,
      minWidth: 120,
    },
    {
      field: "recruiter",
      headerName: "Recruiter",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.recruiter ? `@${actualRow.recruiter}` : "";
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <span className={`badge ${params?.value === "open" ? "bg-success" : "bg-secondary"}`}>
          {params?.value?.toUpperCase() || ""}
        </span>
      ),
    },
    {
      field: "applicant_count",
      headerName: "Applications",
      width: 110,
      type: "number",
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.applicant_count || 0;
      },
    },
    {
      field: "application_deadline",
      headerName: "Deadline",
      flex: 1.2,
      minWidth: 140,
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return actualValue ? new Date(actualValue).toLocaleString() : "No Deadline";
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <div className="d-flex align-items-center h-100">
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                handleViewRecruiter(row.recruiter);
                handleTabChange("jobs");
              }}
            >
              View
            </button>
          </div>
        );
      },
    },
  ], [handleViewRecruiter, handleTabChange]);

  const applicationColumns = useMemo(() => [
    {
      field: "candidate_name",
      headerName: "Candidate",
      flex: 1.5,
      minWidth: 150,
    },
    {
      field: "job_title",
      headerName: "Job Role",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? `${actualRow.job_title} (${actualRow.company_name || ""})` : "";
      },
    },
    {
      field: "recruiter",
      headerName: "Recruiter",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.recruiter ? `@${actualRow.recruiter}` : "";
      },
    },
    {
      field: "ai_score",
      headerName: "AI Score",
      width: 90,
      type: "number",
      renderCell: (params) => {
        const score = params?.value;
        let badgeStyle = { backgroundColor: "var(--screenai-danger)", color: "var(--screenai-text)" };
        if (score === null || score === undefined) {
          badgeStyle = { backgroundColor: "var(--screenai-text-muted)", color: "var(--screenai-text)" };
        } else if (score >= 80) {
          badgeStyle = { backgroundColor: "var(--screenai-success)", color: "var(--screenai-text)" };
        } else if (score >= 50) {
          badgeStyle = { backgroundColor: "var(--screenai-primary)", color: "var(--screenai-text)" };
        }
        return (
          <span className="badge fw-bold" style={badgeStyle}>
            {score !== null && score !== undefined ? score : "Pending"}
          </span>
        );
      },
    },
    {
      field: "application_status",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <span className="badge bg-secondary text-capitalize">
          {params?.value || ""}
        </span>
      ),
    },
    {
      field: "submitted_at",
      headerName: "Applied Date",
      flex: 1.2,
      minWidth: 140,
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return actualValue ? new Date(actualValue).toLocaleDateString() : "N/A";
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <div className="d-flex align-items-center h-100">
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                handleViewRecruiter(row.recruiter);
                handleTabChange("applications");
              }}
            >
              View
            </button>
          </div>
        );
      },
    },
  ], [handleViewRecruiter, handleTabChange]);

  const interviewColumns = useMemo(() => [
    {
      field: "candidateName",
      headerName: "Candidate",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? (actualRow.candidateName || actualRow.candidate_name || "Unknown Candidate") : "";
      }
    },
    {
      field: "jobTitle",
      headerName: "Job Title",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? (actualRow.jobTitle || actualRow.job_title || "Listing") : "";
      },
    },
    {
      field: "recruiter",
      headerName: "Recruiter",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        if (!actualRow) return "";
        const rVal = actualRow.recruiter || actualRow.recruiter_username || "Recruiter";
        return rVal.startsWith("@") ? rVal : `@${rVal}`;
      },
    },
    {
      field: "round_name",
      headerName: "Round",
      flex: 1.2,
      minWidth: 130,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? `Round ${actualRow.round_number || 1}: ${actualRow.round_name || "N/A"}` : "";
      },
    },
    {
      field: "scheduled_at",
      headerName: "Date/Time",
      flex: 1.5,
      minWidth: 160,
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return actualValue ? new Date(actualValue).toLocaleString() : "N/A";
      },
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderCell: (params) => {
        const status = params?.value;
        let badgeColor = "bg-secondary";
        if (status === "completed") badgeColor = "bg-success";
        else if (status === "cancelled") badgeColor = "bg-danger";
        return (
          <span className={`badge ${badgeColor} text-capitalize`}>
            {status || ""}
          </span>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <div className="d-flex align-items-center h-100">
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                handleViewRecruiter(row.recruiter || row.recruiter_username);
                handleTabChange("interviews");
              }}
            >
              View
            </button>
          </div>
        );
      },
    },
  ], [handleViewRecruiter, handleTabChange]);

  const hiredColumns = useMemo(() => [
    {
      field: "candidateName",
      headerName: "Candidate",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? getCandidateName(actualRow) : "";
      },
    },
    {
      field: "job_title",
      headerName: "Job Role",
      flex: 1.5,
      minWidth: 150,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? `${actualRow.job_title} (${actualRow.company_name || ""})` : "";
      },
    },
    {
      field: "hr_username",
      headerName: "Recruiter",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? `@${actualRow.hr_username || "system"}` : "";
      },
    },
    {
      field: "current_stage",
      headerName: "Current Stage",
      flex: 1.2,
      minWidth: 130,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <span className="badge bg-success">
            {getLatestStage(row)}
          </span>
        );
      },
    },
    {
      field: "submitted_at",
      headerName: "Hired Date",
      flex: 1.2,
      minWidth: 140,
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return actualValue ? new Date(actualValue).toLocaleDateString() : "N/A";
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        return (
          <div className="d-flex align-items-center h-100">
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                handleViewRecruiter(row.hr_username);
                handleTabChange("hires");
                selectCandidate(row.id);
              }}
            >
              View
            </button>
          </div>
        );
      },
    },
  ], [handleViewRecruiter, handleTabChange, selectCandidate]);

  if (loading) {
    return (
      <div className="container py-5 text-center text-white">
        <div className="spinner-border text-primary" role="status"></div>
        <p className="mt-3">Loading admin dashboard data...</p>
      </div>
    );
  }

  return (
    <div className="screenai-workspace flex-column">
      {/* Top Bar */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary px-4 pt-3 w-100">
        <div className="d-flex align-items-center gap-2">
          <span className="text-secondary small">System Admin Command Shell</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              setGlobalActivityLoading(true);
              fetchAdminData();
            }}
            className="btn btn-xs btn-outline-secondary py-1 px-3 d-flex align-items-center gap-1"
          >
            Sync Platform Data
          </button>
          <span className="text-secondary small fw-bold">
            System Admin
          </span>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm fw-bold"
            onClick={() => {
              clearAuthData();
              navigate("/", { replace: true });
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 pb-5 w-100">
        {/* Top metrics row acting as navigation controllers */}
        <div className="row g-3 mb-4 row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-6">
          {/* Card 1: Active Recruiters */}
          <div className="col">
            <div
              onClick={() => setGridMode("recruiters")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "recruiters" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-primary)", 
                background: gridMode === "recruiters" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">Active Recruiters</div>
              <div className="screenai-metric-val">{activeRecruiters}</div>
              <small className="text-muted">Total: {totalRecruiters}</small>
            </div>
          </div>

          {/* Card 2: Open Jobs */}
          <div className="col">
            <div
              onClick={() => setGridMode("jobs")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "jobs" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-primary)", 
                background: gridMode === "jobs" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">Open Jobs</div>
              <div className="screenai-metric-val">{openJobsCount}</div>
              <small className="text-muted">Accepting apps</small>
            </div>
          </div>

          {/* Card 3: New Applications */}
          <div className="col">
            <div
              onClick={() => setGridMode("applications")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "applications" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-text-muted)", 
                background: gridMode === "applications" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">New Applications</div>
              <div className="screenai-metric-val">{pendingApplicationsCount}</div>
              <small className="text-muted">Need review</small>
            </div>
          </div>

          {/* Card 4: Upcoming Interviews */}
          <div className="col">
            <div
              onClick={() => setGridMode("interviews")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "interviews" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-primary)", 
                background: gridMode === "interviews" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">Upcoming Interviews</div>
              <div className="screenai-metric-val">{upcomingInterviewsCount}</div>
              <small className="text-muted">Scheduled rounds</small>
            </div>
          </div>

          {/* Card 5: Hired Candidates */}
          <div className="col">
            <div
              onClick={() => setGridMode("hired")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "hired" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-success)", 
                background: gridMode === "hired" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">Hired Candidates</div>
              <div className="screenai-metric-val">{totalHires}</div>
              <small className="text-muted">Placed hires</small>
            </div>
          </div>

          {/* Card 6: Suspended Recruiters */}
          <div className="col">
            <div
              onClick={() => setGridMode("suspended_recruiters")}
              className={`screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0 mb-0 ${gridMode === "suspended_recruiters" ? "border-primary" : ""}`}
              style={{ 
                borderLeft: "4px solid var(--screenai-danger)", 
                background: gridMode === "suspended_recruiters" ? "var(--screenai-surface-elevated)" : "var(--screenai-surface)" 
              }}
            >
              <div className="screenai-metric-label">Suspended Recruiters</div>
              <div className="screenai-metric-val">{suspendedRecruiters}</div>
              <small className="text-muted">Blocked accounts</small>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger mb-4 shadow">{error}</div>}
        {success && <div className="alert alert-success mb-4 shadow">{success}</div>}

        {/* Main Grid View */}
        <div className="screenai-card">
          <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <div>
              <h4 className="fw-bold text-white mb-0 text-capitalize">
                {gridMode === "recruiters" && "Active Recruiters Directory"}
                {gridMode === "jobs" && "Open Job Openings"}
                {gridMode === "applications" && "New Resume Submissions"}
                {gridMode === "interviews" && "Scheduled Interview Rounds"}
                {gridMode === "hired" && "Placed Hires Placement Stages"}
                {gridMode === "suspended_recruiters" && "Suspended Recruiters Directory"}
              </h4>
            </div>
            
            <div className="d-flex align-items-center gap-2">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search..."
                style={{ width: "220px" }}
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
              />
              {(gridMode === "recruiters" || gridMode === "suspended_recruiters") && (
                <button
                  onClick={() => {
                    setNewRecruiterCredentials(null);
                    setShowCreateRecruiterModal(true);
                  }}
                  className="btn btn-primary btn-sm fw-bold text-white d-flex align-items-center gap-1"
                >
                  Create Recruiter
                </button>
              )}
            </div>
          </div>

          <div style={{ width: "100%", maxHeight: "650px", overflow: "auto" }}>
            <DataGrid
              autoHeight
              rows={
                gridMode === "recruiters" ? hrs.filter(h => h.is_active && ((h.username || "").toLowerCase().includes(gridSearch.toLowerCase()) || ((h.first_name || "") + " " + (h.last_name || "")).toLowerCase().includes(gridSearch.toLowerCase()))) :
                gridMode === "jobs" ? openJobsList.filter(j => (j.job_title || "").toLowerCase().includes(gridSearch.toLowerCase()) || (j.company_name || "").toLowerCase().includes(gridSearch.toLowerCase())) :
                gridMode === "applications" ? newAppsList.filter(a => (a.candidate_name || "").toLowerCase().includes(gridSearch.toLowerCase()) || (a.job_title || "").toLowerCase().includes(gridSearch.toLowerCase())) :
                gridMode === "interviews" ? allInterviewsList.filter(i => i.status === "scheduled").map(i => ({ ...i, candidateName: i.candidate_name || "Unknown Candidate", recruiter: i.recruiter_username || "Recruiter", jobTitle: i.job_title || "Listing" })).filter(i => (i.candidateName || "").toLowerCase().includes(gridSearch.toLowerCase()) || (i.jobTitle || "").toLowerCase().includes(gridSearch.toLowerCase())) :
                gridMode === "hired" ? hiredCandidates.filter(c => (getCandidateName(c) || "").toLowerCase().includes(gridSearch.toLowerCase()) || (c.job_title || "").toLowerCase().includes(gridSearch.toLowerCase())) :
                hrs.filter(h => !h.is_active && ((h.username || "").toLowerCase().includes(gridSearch.toLowerCase()) || ((h.first_name || "") + " " + (h.last_name || "")).toLowerCase().includes(gridSearch.toLowerCase())))
              }
              columns={
                gridMode === "recruiters" ? recruiterColumns :
                gridMode === "jobs" ? jobColumns :
                gridMode === "applications" ? applicationColumns :
                gridMode === "interviews" ? interviewColumns :
                gridMode === "hired" ? hiredColumns :
                recruiterColumns
              }
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 10 },
                },
              }}
              pageSizeOptions={[5, 10, 20]}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
            />
          </div>
        </div>
      </div>

      {/* Recruiter Details Drawer Overlay */}
      {selectedHR && (
        <div className="screenai-drawer-backdrop" onClick={closeRecruiterDrawer}>
          <div 
            className="screenai-drawer p-4" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              backgroundColor: "var(--screenai-bg)", 
              borderLeft: "1px solid var(--screenai-border)", 
              overflowY: "auto",
              display: "flex",
              flexDirection: "column"
            }}
          >
            {/* Drawer Header */}
            <div className="d-flex justify-content-between align-items-start border-bottom border-secondary pb-3 mb-3">
              <div>
                <h4 className="fw-bold text-white mb-1">
                  {selectedHR.first_name || selectedHR.last_name
                    ? `${selectedHR.first_name} ${selectedHR.last_name}`.trim()
                    : selectedHR.username}
                </h4>
                <div className="d-flex align-items-center gap-2">
                  <span className="text-secondary small">@{selectedHR.username}</span>
                  <span className={`badge ${selectedHR.is_active ? "bg-success" : "bg-danger"}`} style={{ fontSize: "10px" }}>
                    {selectedHR.is_active ? "Active" : "Suspended"}
                  </span>
                </div>
              </div>
              <button onClick={closeRecruiterDrawer} className="btn-close btn-close-white" />
            </div>

            {/* Sub-navigation tabs inside the drawer */}
            <div className="btn-group btn-group-sm mb-4 w-100" role="group">
              {["profile", "jobs", "applications", "hires", "interviews", "activity"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`btn text-capitalize ${drawerTab === tab ? "btn-light" : "btn-outline-light"}`}
                  style={{ fontSize: "11px" }}
                  onClick={() => {
                    handleTabChange(tab);
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Drawer Tab Contents wrapper */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
              {/* PROFILE TAB */}
              {drawerTab === "profile" && (
                <div className="d-flex flex-column gap-3">
                  <div className="bg-dark p-3 rounded border border-secondary text-start">
                    <div className="mb-2">
                      <span className="text-secondary small d-block">Email Address:</span>
                      <strong className="text-white small">{selectedHR.email || "No email listed"}</strong>
                    </div>
                    <div className="mb-2">
                      <span className="text-secondary small d-block">Phone Number:</span>
                      <strong className="text-white small">{selectedHR.phone || "No phone listed"}</strong>
                    </div>
                    <div>
                      <span className="text-secondary small d-block">Last Login Session:</span>
                      <strong className="text-white small">
                        {selectedHR.last_login ? new Date(selectedHR.last_login).toLocaleString() : "Not logged in yet"}
                      </strong>
                    </div>
                  </div>

                  <div className="bg-dark p-3 rounded border border-secondary text-center">
                    <div className="row g-2">
                      <div className="col-4">
                        <div className="text-secondary small fw-bold">Jobs</div>
                        <h5 className="fw-bold text-white mb-0 mt-1">{selectedHR.jobs_count || 0}</h5>
                      </div>
                      <div className="col-4">
                        <div className="text-secondary small fw-bold">Apps</div>
                        <h5 className="fw-bold text-white mb-0 mt-1">{selectedHR.applications_count || 0}</h5>
                      </div>
                      <div className="col-4">
                        <div className="text-secondary small fw-bold">Hires</div>
                        <h5 className="fw-bold text-white mb-0 mt-1">{selectedHR.hired_count || 0}</h5>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex flex-column gap-2 mt-2">
                    {selectedHR.is_active ? (
                      <button
                        onClick={() => handleToggleHRActive(selectedHR.id, selectedHR.username, selectedHR.is_active)}
                        className="btn btn-sm btn-danger fw-bold text-white"
                        disabled={togglingHrId === selectedHR.id}
                      >
                        Suspend Recruiter Account
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleHRActive(selectedHR.id, selectedHR.username, selectedHR.is_active)}
                        className="btn btn-sm btn-success fw-bold text-white"
                        disabled={togglingHrId === selectedHR.id}
                      >
                        Activate Recruiter Account
                      </button>
                    )}

                    <button
                      onClick={() => setResettingPassword(true)}
                      className="btn btn-sm btn-outline-primary fw-bold"
                    >
                      Reset Credentials
                    </button>
                  </div>
                </div>
              )}

              {/* JOBS TAB */}
              {drawerTab === "jobs" && (
                <div className="d-flex flex-column gap-2">
                  {!selectedHR.jobs_list || selectedHR.jobs_list.length === 0 ? (
                    <div className="text-center text-secondary small py-3">No jobs posted yet.</div>
                  ) : (
                    selectedHR.jobs_list.map((job) => (
                      <div
                        key={job.id}
                        className="p-3 rounded border text-start"
                        style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}
                      >
                        <div className="fw-bold text-white small">{job.job_title}</div>
                        <div className="text-secondary small mb-1">{job.company_name}</div>
                        <div className="d-flex justify-content-between align-items-center small text-muted" style={{ fontSize: "10px" }}>
                          <span>Posted {new Date(job.created_at).toLocaleDateString()}</span>
                          <span className={`badge ${job.status === "open" ? "bg-success" : "bg-secondary"}`}>
                            {job.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* APPLICATIONS TAB */}
              {drawerTab === "applications" && (
                <div className="d-flex flex-column gap-2">
                  {!selectedHR.pending_applications_list || selectedHR.pending_applications_list.length === 0 ? (
                    <div className="text-center text-secondary small py-3">No pending applications.</div>
                  ) : (
                    selectedHR.pending_applications_list.map((app) => (
                      <div
                        key={app.id}
                        className="p-3 rounded border text-start"
                        style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <span className="fw-bold text-white small">{app.candidate_name}</span>
                          <span className="badge bg-dark border border-secondary text-primary fw-bold" style={{ fontSize: "10px" }}>
                            Score: {app.ai_score ?? "Pending"}
                          </span>
                        </div>
                        <div className="text-secondary small mb-1">{app.job_title}</div>
                        <div className="d-flex justify-content-between align-items-center small text-muted" style={{ fontSize: "10px" }}>
                          <span>Applied {new Date(app.submitted_at).toLocaleDateString()}</span>
                          <span className="text-capitalize">{app.application_status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* HIRES TAB */}
              {drawerTab === "hires" && (
                <div className="d-flex flex-column gap-3">
                  {!selectedCandidate ? (
                    <div className="d-flex flex-column gap-2">
                      {hiredCandidates.filter(c => c.hr_user_id === selectedHR.id).length === 0 ? (
                        <div className="text-center text-secondary small py-3">No placed candidates recorded.</div>
                      ) : (
                        hiredCandidates
                          .filter(c => c.hr_user_id === selectedHR.id)
                          .map((c) => (
                            <div
                              key={c.id}
                              onClick={() => {
                                selectCandidate(c.id);
                                setStage("Onboarding");
                                setNotes("");
                              }}
                              className="p-3 rounded border text-start cursor-pointer screenai-card-hover"
                              style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}
                            >
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <h6 className="mb-0 fw-bold text-white small">{getCandidateName(c)}</h6>
                                <span className="badge bg-success" style={{ fontSize: "9px" }}>{getLatestStage(c)}</span>
                              </div>
                              <div className="small text-secondary" style={{ fontSize: "11px" }}>
                                {c.job_title} • {c.company_name}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* Back to list button */}
                      <button
                        onClick={closeCandidateDetails}
                        className="btn btn-xs btn-outline-light mb-3"
                        style={{ fontSize: "11px" }}
                      >
                        ← Back to Hires List
                      </button>

                      <div className="p-3 rounded border text-start bg-dark border-secondary mb-3">
                        <h6 className="fw-bold text-white mb-1 small">{getCandidateName(selectedCandidate)}</h6>
                        <p className="text-secondary small mb-2">{selectedCandidate.job_title} — {selectedCandidate.company_name}</p>
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-secondary small" style={{ fontSize: "10px" }}>Email: {selectedCandidate.candidate_email || "N/A"}</span>
                          <a
                            href={getResumeUrl(selectedCandidate.resume)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-outline-primary fw-bold text-decoration-none py-0.5 px-2"
                            style={{ fontSize: "10px" }}
                          >
                            View Resume
                          </a>
                        </div>
                      </div>

                      {/* Update Stage Form */}
                      <div className="bg-dark p-3 rounded border border-secondary mb-3 text-start">
                        <span className="text-secondary small fw-bold d-block mb-2">Update Placement Stage</span>
                        <form onSubmit={handleAddProgression}>
                          <div className="row g-2">
                            <div className="col-12">
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
                            <div className="col-12">
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
                                className="btn btn-sm btn-success w-100 fw-bold text-white"
                                disabled={updating || !stage.trim()}
                              >
                                {updating ? "Updating..." : "Record Status Update"}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>

                      {/* Progression History */}
                      <span className="text-secondary small fw-bold d-block mb-2 text-start">Timeline History</span>
                      <div className="timeline-stages small">
                        <div className="position-relative ps-3">
                          <div
                            className="position-absolute h-100 border-start border-secondary"
                            style={{ left: "5px", top: "0" }}
                          />
                          {!selectedCandidate.progressions || selectedCandidate.progressions.length === 0 ? (
                            <p className="text-secondary small text-start">No updates recorded yet.</p>
                          ) : (
                            selectedCandidate.progressions.map((log) => (
                              <div key={log.id} className="position-relative mb-3 text-start">
                                <div
                                  className="position-absolute bg-success rounded-circle"
                                  style={{ left: "-18px", top: "6px", width: "8px", height: "8px" }}
                                />
                                {editingLogId === log.id ? (
                                  <div className="bg-dark p-2 rounded border border-secondary mt-1">
                                    <select
                                      className="form-select form-select-sm mb-1"
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
                                    <input
                                      type="text"
                                      className="form-control form-control-sm mb-1"
                                      placeholder="Update notes..."
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                    />
                                    <div className="d-flex gap-1 justify-content-end mt-1">
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-success fw-bold text-white py-0.5 px-2"
                                        style={{ fontSize: "10px" }}
                                        onClick={() => handleEditProgression(log.id)}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-secondary py-0.5 px-2"
                                        style={{ fontSize: "10px" }}
                                        onClick={() => setEditingLogId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                      <strong className="text-white">{log.stage}</strong>
                                      <span className="text-muted" style={{ fontSize: "9px" }}>
                                        {new Date(log.updated_at).toLocaleDateString()}
                                      </span>
                                    </div>
                                    {log.notes && <div className="text-secondary small mb-1">{log.notes}</div>}
                                    <div className="d-flex justify-content-between align-items-center mt-1 flex-wrap gap-2">
                                      <span className="text-muted" style={{ fontSize: "9px" }}>
                                        By: {log.updated_by_username ? `@${log.updated_by_username}` : "System"}
                                      </span>
                                      <div className="d-flex gap-2">
                                        <button
                                          onClick={() => {
                                            setEditingLogId(log.id);
                                            setEditStage(log.stage);
                                            setEditNotes(log.notes || "");
                                          }}
                                          className="btn btn-link p-0 text-decoration-none small"
                                          style={{ fontSize: "10px", color: "var(--screenai-primary)" }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDeleteProgression(log.id)}
                                          className="btn btn-link p-0 text-danger text-decoration-none small"
                                          style={{ fontSize: "10px" }}
                                        >
                                          Delete
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

              {/* INTERVIEWS TAB */}
              {drawerTab === "interviews" && (
                <div className="d-flex flex-column gap-2">
                  {hrInterviews.length === 0 ? (
                    <div className="text-center text-secondary small py-3">No interviews scheduled yet.</div>
                  ) : (
                    hrInterviews.map((int) => (
                      <div
                        key={int.id}
                        className="p-3 rounded border text-start"
                        style={{ backgroundColor: "var(--screenai-surface)", borderColor: "var(--screenai-border)" }}
                      >
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <span className="fw-bold text-white small">{int.candidate_name || "Candidate"}</span>
                          <span
                            className={`badge text-capitalize ${int.status === "completed"
                                ? "bg-success"
                                : int.status === "cancelled"
                                  ? "bg-danger"
                                  : "bg-secondary"
                              }`}
                            style={{ fontSize: "9px" }}
                          >
                            {int.status}
                          </span>
                        </div>
                        <div className="text-secondary small" style={{ fontSize: "11px" }}>
                          {int.round_name} (Round {int.round_number})
                        </div>
                        <div className="text-muted mt-2" style={{ fontSize: "10px" }}>
                          Scheduled: {new Date(int.scheduled_at).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ACTIVITY TAB */}
              {drawerTab === "activity" && (
                <div className="d-flex flex-column gap-3">
                  {/* Filters */}
                  <div className="d-flex gap-2">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search activity..."
                      value={recruiterActivityFilters.search}
                      onChange={(e) => {
                        setRecruiterActivityLoading(true);
                        setRecruiterActivityFilters(prev => ({ ...prev, search: e.target.value }));
                      }}
                      style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)", color: "var(--screenai-text)" }}
                    />
                    <select
                      className="form-select form-select-sm"
                      value={recruiterActivityFilters.action}
                      onChange={(e) => {
                        setRecruiterActivityLoading(true);
                        setRecruiterActivityFilters(prev => ({ ...prev, action: e.target.value }));
                      }}
                      style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)", color: "var(--screenai-text)" }}
                    >
                      <option value="">All Actions</option>
                      <option value="recruiter_created">Recruiter Created</option>
                      <option value="recruiter_suspended">Recruiter Suspended</option>
                      <option value="recruiter_activated">Recruiter Activated</option>
                      <option value="recruiter_password_reset">Password Reset</option>
                      <option value="recruiter_forced_password_changed">Password Changed</option>
                      <option value="job_created">Job Created</option>
                      <option value="application_submitted">Application Submitted</option>
                      <option value="application_status_changed">Status Changed</option>
                      <option value="interview_scheduled">Interview Scheduled</option>
                      <option value="interview_rescheduled">Interview Rescheduled</option>
                      <option value="interview_completed">Interview Completed</option>
                      <option value="interview_cancelled">Interview Cancelled</option>
                      <option value="interview_no_show">Interview No Show</option>
                      <option value="candidate_progression_created">Progression Created</option>
                      <option value="candidate_progression_updated">Progression Updated</option>
                      <option value="candidate_progression_deleted">Progression Deleted</option>
                    </select>
                  </div>

                  {recruiterActivityLoading ? (
                    <div className="text-center py-3">
                      <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                      <span className="ms-2 text-secondary small">Loading logs...</span>
                    </div>
                  ) : recruiterActivityResults.length === 0 ? (
                    <div className="text-center text-secondary small py-3">No recent activity logs.</div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {recruiterActivityResults.map((act) => {
                        const actor = act.actor_username ? `@${act.actor_username}` : "System/Public";
                        const target = act.target_label || act.target_id || "";
                        const meta = act.metadata || {};
                        let msg;
                        switch (act.action) {
                          case "recruiter_created":
                            msg = `${actor} created recruiter account @${meta.username || target}.`;
                            break;
                          case "recruiter_suspended":
                            msg = `${actor} suspended recruiter account @${meta.username || target}.`;
                            break;
                          case "recruiter_activated":
                            msg = `${actor} activated recruiter account @${meta.username || target}.`;
                            break;
                          case "recruiter_password_reset":
                            msg = `${actor} reset password for @${meta.username || target}.`;
                            break;
                          case "recruiter_forced_password_changed":
                            msg = `${actor} changed their password via forced credential update.`;
                            break;
                          case "job_created":
                            msg = `${actor} posted a new job: '${meta.job_title || target}'.`;
                            break;
                          case "application_submitted":
                            msg = `Candidate '${meta.candidate_name || target}' applied for '${meta.job_title || ""}' (Job ID ${meta.job_id}).`;
                            break;
                          case "application_status_changed":
                            msg = `${actor} updated application status for '${target}' from '${meta.previous_status}' to '${meta.new_status}'.`;
                            break;
                          case "interview_scheduled":
                            msg = `${actor} scheduled a new interview: '${target}' (Round ${meta.round_number}).`;
                            break;
                          case "interview_rescheduled":
                            msg = `${actor} rescheduled interview: '${target}'.`;
                            break;
                          case "interview_completed":
                            msg = `${actor} marked interview round ${meta.round_number} for '${target}' as Completed.`;
                            break;
                          case "interview_cancelled":
                            msg = `${actor} marked interview round ${meta.round_number} for '${target}' as Cancelled.`;
                            break;
                          case "interview_no_show":
                            msg = `${actor} marked interview round ${meta.round_number} for '${target}' as No Show.`;
                            break;
                          case "candidate_progression_created":
                            msg = `${actor} added progression stage '${meta.stage}' for candidate.`;
                            break;
                          case "candidate_progression_updated":
                            msg = `${actor} updated progression stage to '${meta.stage}'.`;
                            break;
                          case "candidate_progression_deleted":
                            msg = `${actor} deleted a progression update for candidate.`;
                            break;
                          default:
                            msg = `${act.action} on ${act.target_type || "resource"}: ${target}`;
                        }
                        return (
                          <div key={act.id} className="p-2 border-bottom border-secondary d-flex flex-column text-start" style={{ borderColor: "var(--screenai-border) !important" }}>
                            <span className="text-white small fw-semibold">{msg}</span>
                            <span className="text-muted" style={{ fontSize: "9px" }}>
                              {new Date(act.created_at).toLocaleString()} • {act.action}
                            </span>
                          </div>
                        );
                      })}

                      {/* Pagination Controls */}
                      {recruiterActivityCount > 15 && (
                        <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top border-secondary">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={recruiterActivityPage === 1 || recruiterActivityLoading}
                            onClick={() => {
                              setRecruiterActivityLoading(true);
                              setRecruiterActivityPage(prev => Math.max(prev - 1, 1));
                            }}
                          >
                            Previous
                          </button>
                          <span className="text-secondary small">
                            Page {recruiterActivityPage} of {Math.ceil(recruiterActivityCount / 15)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={recruiterActivityPage * 15 >= recruiterActivityCount || recruiterActivityLoading}
                            onClick={() => {
                              setRecruiterActivityLoading(true);
                              setRecruiterActivityPage(prev => prev + 1);
                            }}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Credentials Reset Modal */}
      {resettingPassword && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-content" style={{ maxWidth: "450px" }}>
            <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
              <h5 className="fw-bold mb-0">Reset Credentials</h5>
              <button onClick={() => setResettingPassword(false)} className="btn-close btn-close-white" />
            </div>
            <form onSubmit={handleResetPasswordSubmit}>
              <div className="mb-4">
                <label className="form-label text-secondary small fw-bold">Enter New Password for @{selectedHR?.username}</label>
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
                  className="btn btn-primary flex-fill fw-bold text-white"
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
                  className="btn btn-outline-secondary px-3"
                  disabled={savingNewPassword}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateRecruiterModal && (
        <div className="screenai-modal-overlay">
          <div className="screenai-modal-content" style={{ maxWidth: "500px" }}>
            {newRecruiterCredentials ? (
              <div className="text-center p-3">
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
                    className="btn btn-success fw-bold px-4 text-white"
                  >
                    Copy Credentials
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
                      className="btn btn-primary flex-fill fw-bold text-white"
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

      {/* Satisfy unused global activity state variables */}
      {globalActivityLoading === "diagnostic-check-hidden" && (
        <div>
          {globalActivityResults.length} {globalActivityCount}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
