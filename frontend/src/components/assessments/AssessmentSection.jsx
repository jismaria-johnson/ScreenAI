import { useState, useEffect, useCallback, useRef } from "react";
import API from "../../api/axiosConfig";
import {
  sendAssessment,
  resendAssessment,
  getAssignmentsForApplication,
  getAssignmentDetails,
  getDevAccessLink,
  queueAssessment,
  retryAssessment,
  getAssessmentResult,
} from "../../api/assessments";

export default function AssessmentSection({
  application,
  showToast,
  isExpanded,
  onToggle,
}) {
  const applicationId = application?.id;
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);

  const invitationsEnabled = import.meta.env.VITE_ASSESSMENT_INVITATIONS_ENABLED === "true";
  const evaluationEnabled = import.meta.env.VITE_EVALUATION_ENABLED !== "false";
  const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";

  // Fetch active templates
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await API.get("/assessments/templates/?status=active");
      // Standard response might be paginated or array. StandardPageNumberPagination is used in view.
      // Let's handle both array and paginated format:
      if (response.data && Array.isArray(response.data)) {
        setTemplates(response.data);
      } else if (response.data && Array.isArray(response.data.results)) {
        setTemplates(response.data.results);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
      showToast("Failed to load active assessment templates.", "error");
    } finally {
      setLoadingTemplates(false);
    }
  }, [showToast]);

  // Fetch assignments for this application
  const fetchAssignments = useCallback(async () => {
    if (!applicationId) return;
    setLoadingAssignments(true);
    try {
      const data = await getAssignmentsForApplication(applicationId);
      setAssignments(data);
    } catch (err) {
      console.error("Failed to fetch assignments:", err);
      showToast("Failed to load assessment assignment details.", "error");
    } finally {
      setLoadingAssignments(false);
    }
  }, [applicationId, showToast]);

  useEffect(() => {
    if (isExpanded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTemplates();
      fetchAssignments();
    }
  }, [isExpanded, fetchTemplates, fetchAssignments]);

  const activeAssignment = assignments && assignments.length > 0 ? assignments[0] : null;

  // Selected template details
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Load detailed assignment delivery history on expand/select
  const [detailedAssignment, setDetailedAssignment] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [detailedResult, setDetailedResult] = useState(null);
  const [expandedResultAssignmentId, setExpandedResultAssignmentId] = useState(null);
  const [submittedAnswers, setSubmittedAnswers] = useState(null);
  const pollingRef = useRef(null);

  const fetchDetailedHistory = useCallback(async (assignmentId) => {
    setLoadingDetails(true);
    try {
      const data = await getAssignmentDetails(assignmentId);
      setDetailedAssignment(data);
    } catch (err) {
      console.error("Failed to fetch assignment details:", err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (activeAssignment?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchDetailedHistory(activeAssignment.id);
    } else {
      setDetailedAssignment(null);
    }
  }, [activeAssignment?.id, fetchDetailedHistory]);

  // Poll for status updates while evaluation is in progress
  const POLLING_STATUSES = ["queued", "evaluating"];

  useEffect(() => {
    const currentStatus = activeAssignment?.status;
    if (currentStatus && POLLING_STATUSES.includes(currentStatus)) {
      // Start polling every 3 seconds
      if (!pollingRef.current) {
        pollingRef.current = setInterval(async () => {
          try {
            const data = await getAssignmentsForApplication(applicationId);
            setAssignments(data);
            const active = data && data.length > 0 ? data[0] : null;
            if (active?.id) {
              const detail = await getAssignmentDetails(active.id);
              setDetailedAssignment(detail);
              // Stop polling when terminal state reached
              if (!POLLING_STATUSES.includes(active.status)) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
            }
          } catch (err) {
            console.error("Polling error:", err);
          }
        }, 3000);
      }
    } else {
      // Not in polling state — clear any running poll
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAssignment?.status, applicationId]);

  // Translate backend error codes to human-readable text
  const translateError = (code, detail) => {
    if (code === "assessment_invitations_disabled") {
      return "Invitation delivery will be available after candidate assessment access is configured.";
    }
    if (code === "assessment_delivery_in_progress") {
      return "An invitation send attempt is currently in progress. Please wait.";
    }
    if (code === "permission_denied") {
      return "You do not have permission to assign assessments for this candidate.";
    }
    return detail || "An unexpected error occurred. Please try again.";
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedTemplateId) {
      showToast("Please select an assessment template.", "error");
      return;
    }
    if (!selectedTemplate) {
      showToast("Selected template not found.", "error");
      return;
    }
    if (!deadline) {
      showToast("Please specify a completion deadline.", "error");
      return;
    }

    const confirmSend = window.confirm(
      `Are you sure you want to assign the assessment "${selectedTemplate?.name || ""}" to this candidate?`
    );
    if (!confirmSend) return;

    setSending(true);
    try {
      const formattedDeadline = new Date(deadline).toISOString();
      await sendAssessment(applicationId, selectedTemplateId, formattedDeadline);
      showToast("Assessment assigned and invitation email request recorded.", "success");
      setSelectedTemplateId("");
      setDeadline("");
      fetchAssignments();
    } catch (err) {
      const errorData = err.response?.data || {};
      const msg = translateError(errorData.code, errorData.detail);
      showToast(msg, "error");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (!activeAssignment) return;

    const confirmResend = window.confirm(
      "Resending the assessment will immediately rotate the secure token and invalidate the link in the previous email. Are you sure you want to proceed?"
    );
    if (!confirmResend) return;

    setSending(true);
    try {
      await resendAssessment(activeAssignment.id);
      showToast("Assessment invitation rotated and resend request recorded.", "success");
      fetchAssignments();
    } catch (err) {
      const errorData = err.response?.data || {};
      const msg = translateError(errorData.code, errorData.detail);
      showToast(msg, "error");
    } finally {
      setSending(false);
    }
  };

  const handleDevAccessLink = async (action) => {
    if (!activeAssignment) return;
    try {
      const data = await getDevAccessLink(activeAssignment.id);
      if (action === "copy") {
        await navigator.clipboard.writeText(data.dev_access_url);
        showToast("Assessment link copied to clipboard (Development Only).", "success");
      } else if (action === "open") {
        window.open(data.dev_access_url, "_blank");
      }
    } catch (err) {
      const errorData = err.response?.data || {};
      if (errorData.code === "development_only_endpoint") {
        showToast("This feature is only available in development mode.", "error");
      } else {
        showToast(errorData.detail || "Failed to retrieve development access link.", "error");
      }
    }
  };

  const refreshAssessmentData = async () => {
    try {
      const data = await getAssignmentsForApplication(applicationId);
      setAssignments(data);
      const active = data && data.length > 0 ? data[0] : null;
      if (active?.id) {
        await fetchDetailedHistory(active.id);
      }
    } catch (err) {
      console.error("Failed to refresh assessment data:", err);
    }
  };

  const handleQueue = async () => {
    if (!activeAssignment) return;
    setQueuing(true);
    try {
      await queueAssessment(activeAssignment.id);
      showToast("Assessment queued for evaluation.", "success");
      await refreshAssessmentData();
    } catch (err) {
      const errorData = err.response?.data || {};
      showToast(errorData.detail || "Failed to queue the assessment.", "error");
    } finally {
      setQueuing(false);
    }
  };

  const handleRetry = async () => {
    if (!activeAssignment) return;
    setRetrying(true);
    try {
      await retryAssessment(activeAssignment.id);
      showToast("Assessment queued again for evaluation.", "success");
      await refreshAssessmentData();
    } catch (err) {
      const errorData = err.response?.data || {};
      showToast(errorData.detail || "Failed to retry the assessment.", "error");
    } finally {
      setRetrying(false);
    }
  };

  const handleToggleDetailedResult = async () => {
    if (!activeAssignment) return;

    if (expandedResultAssignmentId === activeAssignment.id) {
      setExpandedResultAssignmentId(null);
      return;
    }

    if (activeAssignment.status === "submitted" && !evaluationEnabled) {
      setLoadingResult(true);
      try {
        const response = await API.get(`/assessments/assignments/${activeAssignment.id}/submitted-answers/`);
        setSubmittedAnswers(response.data);
      } catch (err) {
        const errorData = err.response?.data || {};
        showToast(errorData.detail || "Failed to load submitted answers.", "error");
        return;
      } finally {
        setLoadingResult(false);
      }
      setExpandedResultAssignmentId(activeAssignment.id);
      return;
    }

    if (detailedResult?.assignmentId !== activeAssignment.id) {
      setLoadingResult(true);
      try {
        const resultData = await getAssessmentResult(activeAssignment.id);
        setDetailedResult({
          assignmentId: activeAssignment.id,
          data: resultData,
        });
      } catch (err) {
        const errorData = err.response?.data || {};
        showToast(errorData.detail || "Failed to load detailed assessment results.", "error");
        return;
      } finally {
        setLoadingResult(false);
      }
    }

    setExpandedResultAssignmentId(activeAssignment.id);
  };

  // Helper for Status Badge styling matching ScreenAI tokens
  const getStatusBadgeStyle = (statusVal) => {
    const s = statusVal ? statusVal.toLowerCase() : "";
    if (s === "invited" || s === "delivered") {
      return {
        backgroundColor: "rgba(16, 185, 129, 0.12)",
        color: "var(--screenai-success)",
        border: "1px solid var(--screenai-success)",
      };
    }
    if (s === "started" || s === "submitted" || s === "queued" || s === "evaluating") {
      return {
        backgroundColor: "rgba(79, 70, 229, 0.12)",
        color: "var(--screenai-primary)",
        border: "1px solid var(--screenai-primary)",
      };
    }
    if (s === "failed" || s === "expired" || s === "cancelled") {
      return {
        backgroundColor: "rgba(240, 93, 94, 0.12)",
        color: "var(--screenai-danger)",
        border: "1px solid var(--screenai-danger)",
      };
    }
    return {
      backgroundColor: "rgba(148, 163, 184, 0.12)",
      color: "var(--screenai-text-muted)",
      border: "1px solid var(--screenai-text-muted)",
    };
  };

  const formatScoreValue = (value) => {
    if (value === null || value === undefined || value === "") return "0";
    const numberVal = Number(value);
    if (Number.isNaN(numberVal)) return String(value);
    return Number.isInteger(numberVal) ? String(numberVal) : numberVal.toFixed(2);
  };

  const getTimelineSteps = (statusVal) => {
    const s = statusVal?.toLowerCase();
    let activeIndex = 0;
    if (s === "email_pending" || s === "invited") activeIndex = 0;
    else if (s === "started") activeIndex = 1;
    else if (s === "submitted") activeIndex = 2;
    else if (s === "queued" || s === "evaluating") activeIndex = 3;
    else if (s === "graded" || s === "failed" || s === "expired" || s === "cancelled") activeIndex = 4;

    const steps = [
    { label: "Assigned", desc: s === "email_pending" ? "Pending" : "Sent" },
      { label: "Started", desc: "Accessed" },
      { label: "Submitted", desc: "Received" },
      { label: "Evaluating", desc: s === "queued" ? "Queued" : s === "evaluating" ? "Running" : "Pending" },
      { 
        label: s === "failed" ? "Failed" : s === "expired" ? "Expired" : s === "cancelled" ? "Cancelled" : "Completed",
        isError: ["failed", "expired", "cancelled"].includes(s)
      }
    ];

    return { steps, activeIndex };
  };

  const renderTimeline = (statusVal) => {
    const { steps, activeIndex } = getTimelineSteps(statusVal);
    const s = statusVal?.toLowerCase();
    const isTerminated = ["failed", "expired", "cancelled"].includes(s);
    const fillPercent = (activeIndex / 4) * 100;

    return (
      <div className="mb-4 pt-1 pb-2">
        <div className="position-relative d-flex justify-content-between align-items-center" style={{ minHeight: "32px" }}>
          {/* Connector Line Background */}
          <div
            style={{
              position: "absolute",
              top: "11px",
              left: "10%",
              right: "10%",
              height: "2px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              zIndex: 1,
            }}
          />
          {/* Active Filled Line */}
          <div
            style={{
              position: "absolute",
              top: "11px",
              left: "10%",
              width: `${fillPercent * 0.8}%`,
              height: "2px",
              backgroundColor: isTerminated ? "var(--screenai-danger)" : "var(--screenai-primary)",
              zIndex: 1,
              transition: "width 0.3s ease",
            }}
          />

          {/* Stepper circles */}
          {steps.map((step, idx) => {
            const isCompleted = idx < activeIndex;
            const isActive = idx === activeIndex;

            let circleBg = "rgba(15, 23, 42, 0.9)";
            let circleBorder = "2px solid rgba(255, 255, 255, 0.12)";
            let labelColor = "var(--screenai-text-muted)";

            if (isActive) {
              circleBg = step.isError ? "var(--screenai-danger)" : "var(--screenai-primary)";
              circleBorder = `2px solid ${step.isError ? "var(--screenai-danger)" : "var(--screenai-primary)"}`;
              labelColor = "var(--screenai-text)";
            } else if (isCompleted) {
              circleBg = (isTerminated && idx === 4) ? "var(--screenai-danger)" : "var(--screenai-primary)";
              circleBorder = `2px solid ${(isTerminated && idx === 4) ? "var(--screenai-danger)" : "var(--screenai-primary)"}`;
              labelColor = "rgba(255, 255, 255, 0.4)";
            }

            return (
              <div
                key={idx}
                className="d-flex flex-column align-items-center text-center position-relative"
                style={{ zIndex: 2, width: "20%" }}
              >
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center"
                  style={{
                    width: "22px",
                    height: "22px",
                    backgroundColor: circleBg,
                    border: circleBorder,
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: (isActive || isCompleted) ? "#fff" : "rgba(255,255,255,0.25)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isCompleted || (isActive && !step.isError && s === "graded") ? "✓" : (isActive && step.isError) ? "✗" : idx + 1}
                </div>
                <span
                  className="fw-bold mt-2"
                  style={{
                    fontSize: "10px",
                    color: labelColor,
                    letterSpacing: "0.2px",
                  }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStatusExplanation = (statusVal) => {
    const status = statusVal?.toLowerCase();
    let title;
    let message;
    let borderStyle;
    let bgStyle;

    switch (status) {
      case "email_pending":
        title = "Invitation Email Pending";
        message = "The assessment invitation email is queued and will be sent automatically to the candidate shortly.";
        borderStyle = "1px solid rgba(148, 163, 184, 0.2)";
        bgStyle = "rgba(148, 163, 184, 0.04)";
        break;
      case "invited":
        title = "Invitation Delivered";
        message = "The candidate has been invited and sent the secure assessment access link. Waiting for the candidate to access the page.";
        borderStyle = "1px solid rgba(16, 185, 129, 0.2)";
        bgStyle = "rgba(16, 185, 129, 0.04)";
        break;
      case "started":
        title = "Assessment Started";
        message = "The candidate has opened the assessment workspace and started working on their solution.";
        borderStyle = "1px solid rgba(99, 102, 241, 0.2)";
        bgStyle = "rgba(99, 102, 241, 0.04)";
        break;
      case "submitted":
        title = "Solution Submitted";
        message = "The candidate has submitted their final solution from the assessment workspace. Evaluation should start automatically shortly; use Start Evaluation only if it remains here.";
        borderStyle = "1px solid rgba(16, 185, 129, 0.2)";
        bgStyle = "rgba(16, 185, 129, 0.04)";
        break;
      case "queued":
        title = "Evaluation Queued";
        message = "The submitted solution is queued for grading. The evaluation worker will pick it up and run the hidden checks.";
        borderStyle = "1px solid rgba(99, 102, 241, 0.2)";
        bgStyle = "rgba(99, 102, 241, 0.04)";
        break;
      case "evaluating":
        title = "Evaluation In Progress";
        message = "The candidate's submitted solution is currently being checked inside the secure evaluation sandbox. Results will be ready shortly.";
        borderStyle = "1px solid rgba(99, 102, 241, 0.2)";
        bgStyle = "rgba(99, 102, 241, 0.04)";
        break;
      case "failed":
        title = "Evaluation Failed";
        message = "A system error or container timeout occurred during execution. Review failure details below to resolve or retry.";
        borderStyle = "1px solid rgba(240, 93, 94, 0.2)";
        bgStyle = "rgba(240, 93, 94, 0.04)";
        break;
      case "graded":
        title = "Evaluation Completed";
        message = "The submitted solution was graded successfully against hidden test suites. The score summary is shown below.";
        borderStyle = "1px solid rgba(16, 185, 129, 0.2)";
        bgStyle = "rgba(16, 185, 129, 0.04)";
        break;
      case "expired":
        title = "Assessment Expired";
        message = "The candidate did not submit the assessment before time expired. The secure access link is now deactivated.";
        borderStyle = "1px solid rgba(240, 93, 94, 0.2)";
        bgStyle = "rgba(240, 93, 94, 0.04)";
        break;
      case "cancelled":
        title = "Assignment Cancelled";
        message = "This assessment assignment was manually cancelled by a recruiter. Access for this candidate is blocked.";
        borderStyle = "1px solid rgba(148, 163, 184, 0.2)";
        bgStyle = "rgba(148, 163, 184, 0.04)";
        break;
      default:
        return null;
    }

    return (
      <div className="p-3 rounded mb-3 small" style={{ border: borderStyle, backgroundColor: bgStyle }}>
        <div className="fw-bold text-white mb-1" style={{ fontSize: "12px", letterSpacing: "0.2px" }}>
          {title}
        </div>
        <div style={{ color: "var(--screenai-text-muted)", fontSize: "11px", lineHeight: "1.5" }}>
          {message}
        </div>
      </div>
    );
  };

  const getReadableFailureCode = (code) => {
    const c = String(code || "").toLowerCase();
    switch (c) {
      case "docker_unavailable":
        return "Sandbox Offline";
      case "sandbox_timeout":
        return "Timeout Exceeded";
      case "sandbox_memory_exceeded":
        return "Memory Limit Exceeded";
      case "candidate_runtime_error":
        return "Runtime Error in Code";
      case "candidate_syntax_error":
        return "Syntax Error in Code";
      case "hidden_test_execution_failed":
        return "Grading Setup Error";
      case "submission_missing":
        return "No Answers Submitted";
      case "evaluator_internal_error":
        return "Internal Pipeline Error";
      default:
        return code || "Unknown System Error";
    }
  };

  const resultSummary = (activeAssignment?.id && detailedAssignment?.id === activeAssignment.id) ? detailedAssignment?.result_summary : null;
  const isShowingDetailedResult = !!(activeAssignment?.id && expandedResultAssignmentId === activeAssignment.id);
  const currentDetailedResult =
    (activeAssignment?.id && detailedResult?.assignmentId === activeAssignment.id) ? detailedResult?.data : null;
  const canRetryEvaluation =
    activeAssignment?.status === "failed" &&
    (activeAssignment?.evaluation_attempt_count || 0) < 3;

  const isDetailedAssignmentValid = !!(activeAssignment?.id && detailedAssignment?.id === activeAssignment.id);
  const deliveries = isDetailedAssignmentValid ? (detailedAssignment?.email_deliveries || []) : [];
  const examEndsAt = activeAssignment?.session_end_at || null;

  return (
    <div
      className="p-3 rounded border text-start"
      style={{
        backgroundColor: "var(--screenai-bg)",
        borderColor: "var(--screenai-border)",
      }}
    >
      <h5
        onClick={onToggle}
        className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
      >
        <span>4. Take-Home Assessment</span>
        <span className="small text-muted" style={{ fontSize: "11px" }}>
          {isExpanded ? "Hide" : "Show"}
        </span>
      </h5>

      {isExpanded && (
        <div className="mt-3">
          {/* Feature Gate Alert */}
          {!invitationsEnabled && (
            <div
              className="p-2 rounded mb-3 small"
              style={{
                backgroundColor: "rgba(240, 93, 94, 0.12)",
                color: "var(--screenai-danger)",
                border: "1px solid var(--screenai-danger)",
              }}
            >
              <strong>Notice:</strong> Invitation delivery will be available after candidate assessment access is configured.
            </div>
          )}

          {loadingAssignments || loadingTemplates ? (
            <div className="text-center py-3 text-secondary small">
              Loading assessment details...
            </div>
          ) : activeAssignment ? (
            /* ACTIVE ASSIGNMENT STATE */
            <div className="d-flex flex-column gap-3">
              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--screenai-border)",
                }}
              >
                {/* Visual Progress Stepper */}
                {renderTimeline(activeAssignment?.status)}

                {/* State Callout Alert */}
                {renderStatusExplanation(activeAssignment?.status)}

                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold text-white mb-0" style={{ fontSize: "14px" }}>
                    {activeAssignment?.template_name || "N/A"} (v{activeAssignment?.template_version || 1})
                  </h6>
                  <span
                    className="badge text-capitalize px-2 py-1"
                    style={{
                      ...getStatusBadgeStyle(activeAssignment?.status),
                      fontSize: "10px",
                    }}
                  >
                    {activeAssignment?.status || "unknown"}
                  </span>
                </div>

                <div className="row g-2 small text-secondary">
                  <div className="col-sm-6">
                    <strong>Assigned:</strong>{" "}
                    {activeAssignment?.assigned_at ? new Date(activeAssignment.assigned_at).toLocaleString() : "N/A"}
                  </div>
                  <div className="col-sm-6">
                    <strong>Submission Cutoff:</strong>{" "}
                    {activeAssignment?.assessment_deadline ? new Date(activeAssignment.assessment_deadline).toLocaleString() : "N/A"}
                  </div>
                  <div className="col-sm-6">
                    <strong>Duration:</strong>{" "}
                    <span className="text-white">
                      {activeAssignment?.duration_minutes ? `${activeAssignment.duration_minutes} minutes` : "N/A"}
                    </span>
                  </div>
                  <div className="col-sm-6">
                    <strong>Exam Ends:</strong>{" "}
                    <span className="text-white">
                      {examEndsAt ? new Date(examEndsAt).toLocaleString() : "Starts when candidate opens the assessment"}
                    </span>
                  </div>
                  <div className="col-sm-6">
                    <strong>Email Status:</strong>{" "}
                    <span className="text-capitalize text-white">
                      {activeAssignment?.email_status || "N/A"}
                    </span>
                  </div>
                  <div className="col-sm-6">
                    <strong>Send Attempts:</strong>{" "}
                    <span className="text-white">{activeAssignment?.send_attempt_count ?? 0}</span>
                  </div>
                </div>

                {/* Resend button */}
                <div className="mt-3 d-flex flex-wrap gap-2 align-items-center">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={
                      !invitationsEnabled ||
                      sending ||
                      activeAssignment?.email_status === "pending" ||
                      ["started", "submitted", "queued", "evaluating", "graded"].includes(
                        activeAssignment?.status
                      )
                    }
                    className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                    style={{
                      backgroundColor:
                        !invitationsEnabled ||
                        sending ||
                        activeAssignment?.email_status === "pending" ||
                        ["started", "submitted", "queued", "evaluating", "graded"].includes(
                          activeAssignment?.status
                        )
                          ? "rgba(255, 255, 255, 0.05)"
                          : "var(--screenai-primary)",
                      cursor:
                        !invitationsEnabled ||
                        sending ||
                        activeAssignment?.email_status === "pending" ||
                        ["started", "submitted", "queued", "evaluating", "graded"].includes(
                          activeAssignment?.status
                        )
                          ? "not-allowed"
                          : "pointer",
                      border: "none",
                    }}
                  >
                    {sending ? "Resending Invitation..." : "Resend Invitation Link"}
                  </button>

                  {activeAssignment?.status === "submitted" && evaluationEnabled && (
                    <button
                      type="button"
                      onClick={handleQueue}
                      disabled={queuing}
                      className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                      style={{
                        backgroundColor: queuing
                          ? "rgba(255, 255, 255, 0.05)"
                          : "var(--screenai-success)",
                        cursor: queuing ? "not-allowed" : "pointer",
                        border: "none",
                      }}
                    >
                      {queuing ? "Starting Evaluation…" : "Start Evaluation"}
                    </button>
                  )}

                  {activeAssignment?.status === "queued" && (
                    <button
                      type="button"
                      disabled
                      className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        cursor: "not-allowed",
                        border: "none",
                      }}
                    >
                      Queued for Evaluation...
                    </button>
                  )}

                  {activeAssignment?.status === "evaluating" && (
                    <button
                      type="button"
                      disabled
                      className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        cursor: "not-allowed",
                        border: "none",
                      }}
                    >
                      Evaluating in Progress...
                    </button>
                  )}

                  {activeAssignment?.status === "failed" && evaluationEnabled && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      disabled={!canRetryEvaluation || retrying}
                      className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                      style={{
                        backgroundColor:
                          !canRetryEvaluation || retrying
                            ? "rgba(255, 255, 255, 0.05)"
                            : "var(--screenai-danger)",
                        cursor:
                          !canRetryEvaluation || retrying ? "not-allowed" : "pointer",
                        border: "none",
                      }}
                    >
                      {retrying ? "Retrying..." : "Retry Evaluation"}
                    </button>
                  )}
                  {!evaluationEnabled && activeAssignment?.status === "submitted" && (
                    <div className="text-warning small fw-semibold" style={{ fontSize: "12px", marginTop: "4px" }}>
                      Evaluation is temporarily unavailable.
                    </div>
                  )}
                </div>

                {isDev && (
                  <div className="mt-3 pt-3 border-top border-secondary d-flex flex-wrap gap-2 align-items-center">
                    <span className="text-warning fw-bold" style={{ fontSize: "10.5px", letterSpacing: "0.5px" }}>
                      [DEV ONLY]:
                    </span>
                    <button
                      id="dev-copy-link-btn"
                      type="button"
                      onClick={() => handleDevAccessLink("copy")}
                      className="btn btn-xs fw-semibold px-2 py-1"
                      style={{
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        color: "#f59e0b",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      Copy Assessment Link
                    </button>
                    <button
                      id="dev-open-page-btn"
                      type="button"
                      onClick={() => handleDevAccessLink("open")}
                      className="btn btn-xs fw-semibold px-2 py-1"
                      style={{
                        backgroundColor: "rgba(59, 130, 246, 0.15)",
                        color: "#3b82f6",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      Open Assessment Page
                    </button>
                  </div>
                )}

                {activeAssignment?.status === "failed" && (
                  <div
                    className="mt-3 p-3 rounded small"
                    style={{
                      backgroundColor: "rgba(240, 93, 94, 0.04)",
                      border: "1px solid rgba(240, 93, 94, 0.2)",
                      color: "var(--screenai-text)",
                    }}
                  >
                    <div className="fw-bold mb-2 text-white d-flex align-items-center gap-2" style={{ fontSize: "12px" }}>
                      <span className="rounded-circle d-inline-block" style={{ width: "6px", height: "6px", backgroundColor: "var(--screenai-danger)" }}></span>
                      Evaluation Failure Summary
                    </div>
                    <div className="row g-3 mb-2">
                      <div className="col-sm-6">
                        <span className="text-secondary small d-block mb-0.5">Error Category:</span>
                        <div className="text-white fw-semibold small">
                          {getReadableFailureCode(activeAssignment?.failure_code)}
                        </div>
                      </div>
                      <div className="col-sm-6">
                        <span className="text-secondary small d-block mb-0.5">System Code:</span>
                        <div className="text-muted small font-monospace">
                          {activeAssignment?.failure_code || "N/A"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-top border-secondary">
                      <span className="text-secondary small d-block mb-1">Safe Failure Details:</span>
                      <div className="text-secondary small bg-dark p-2 rounded border border-secondary font-monospace" style={{ fontSize: "11px", whiteSpace: "pre-wrap", color: "#e2e8f0" }}>
                        {activeAssignment?.safe_failure_message || "No safe failure details were recorded. Please trigger a manual retry or contact system administrators."}
                      </div>
                    </div>
                    {!canRetryEvaluation && (
                      <div className="mt-3 p-2 rounded text-danger small d-flex align-items-center gap-2" style={{ backgroundColor: "rgba(240, 93, 94, 0.06)", border: "1px solid rgba(240, 93, 94, 0.2)" }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" x2="12" y1="8" y2="12"/>
                          <line x1="12" x2="12.01" y1="16" y2="16"/>
                        </svg>
                        <span>Maximum evaluation attempts reached (3/3 attempts used). Further automatic retries are blocked for this assessment.</span>
                      </div>
                    )}
                  </div>
                )}                {activeAssignment?.status === "submitted" && !evaluationEnabled && (
                  <div
                    className="mt-3 p-3 rounded"
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.04)",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                    }}
                  >
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                      <div>
                        <span className="text-warning small text-uppercase fw-bold tracking-wider" style={{ fontSize: "10px", opacity: 0.6 }}>
                          Submitted Answers
                        </span>
                        <h6 className="fw-bold text-white mb-0" style={{ fontSize: "15px" }}>
                          Status: Graded (Manual Review Only)
                        </h6>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleDetailedResult}
                        disabled={loadingResult}
                        className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                        style={{
                          backgroundColor: loadingResult
                            ? "rgba(255, 255, 255, 0.05)"
                            : "var(--screenai-primary)",
                          cursor: loadingResult ? "not-allowed" : "pointer",
                          border: "none",
                        }}
                      >
                        {loadingResult
                          ? "Loading Answers..."
                          : isShowingDetailedResult
                            ? "Hide Submitted Answers"
                            : "View Submitted Answers"}
                      </button>
                    </div>

                    {isShowingDetailedResult && (
                      <div className="mt-3 pt-3 border-top border-secondary">
                        {submittedAnswers?.length ? (
                          <div className="d-flex flex-column gap-3">
                            <div className="p-3 rounded mb-2 text-warning bg-dark small" style={{ border: "1px dashed var(--screenai-border)" }}>
                              <strong>Evaluation is disabled. Below are the candidate's submitted answers for manual review.</strong>
                            </div>
                            {submittedAnswers.map((answer, index) => (
                              <div
                                key={index}
                                className="p-3 rounded text-start bg-dark"
                                style={{ border: "1px solid var(--screenai-border)" }}
                              >
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                  <div className="fw-bold text-white small">
                                    {answer.question_title || `Question ${index + 1}`}
                                  </div>
                                  <span className="badge text-uppercase text-secondary" style={{ fontSize: "10px" }}>
                                    {answer.selected_language}
                                  </span>
                                </div>
                                <pre className="p-3 rounded text-light font-monospace small bg-black overflow-auto" style={{ maxHeight: "250px", border: "1px solid rgba(255,255,255,0.05)", whiteSpace: "pre-wrap" }}>
                                  <code>{answer.candidate_code || "# No code submitted"}</code>
                                </pre>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-secondary small py-2">No submitted answers found.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}                {activeAssignment?.status === "graded" && (
                  <div
                    className="mt-3 p-3 rounded"
                    style={{
                      backgroundColor: "rgba(99, 102, 241, 0.04)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                    }}
                  >
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                      <div>
                        <span className="text-secondary small text-uppercase fw-bold tracking-wider" style={{ fontSize: "10px", opacity: 0.6 }}>
                          Graded Results
                        </span>
                        <h6 className="fw-bold text-white mb-0" style={{ fontSize: "15px" }}>
                          Status:{" "}
                          <span
                            style={{
                              color: resultSummary?.passed
                                ? "var(--screenai-success)"
                                : "var(--screenai-danger)",
                            }}
                          >
                            {resultSummary?.passed ? "Passed" : "Needs Review"}
                          </span>
                        </h6>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleDetailedResult}
                        disabled={loadingResult}
                        className="btn btn-xs fw-semibold text-white px-3 py-1.5"
                        style={{
                          backgroundColor: loadingResult
                            ? "rgba(255, 255, 255, 0.05)"
                            : "var(--screenai-primary)",
                          cursor: loadingResult ? "not-allowed" : "pointer",
                          border: "none",
                        }}
                      >
                        {loadingResult
                          ? "Loading Results..."
                          : isShowingDetailedResult
                            ? "Hide Question Breakdown"
                            : "View Question Breakdown"}
                      </button>
                    </div>

                    {resultSummary ? (
                      <div className="row g-2 mb-3 text-center">
                        <div className="col-6 col-sm-3">
                          <div className="p-2 rounded" style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div className="text-secondary small mb-1" style={{ fontSize: "10px" }}>Total Score</div>
                            <div className="text-white fw-bold" style={{ fontSize: "14px" }}>
                              {formatScoreValue(resultSummary?.total_score)} / {formatScoreValue(resultSummary?.maximum_score)}
                            </div>
                          </div>
                        </div>
                        <div className="col-6 col-sm-3">
                          <div className="p-2 rounded" style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div className="text-secondary small mb-1" style={{ fontSize: "10px" }}>Percentage</div>
                            <div className="text-white fw-bold" style={{ fontSize: "14px" }}>
                              {formatScoreValue(resultSummary?.percentage)}%
                            </div>
                          </div>
                        </div>
                        <div className="col-6 col-sm-3">
                          <div className="p-2 rounded" style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div className="text-secondary small mb-1" style={{ fontSize: "10px" }}>Tests Passed</div>
                            <div className="text-white fw-bold" style={{ fontSize: "14px" }}>
                              {resultSummary?.passed_tests ?? 0} / {resultSummary?.total_tests ?? 0}
                            </div>
                          </div>
                        </div>
                        <div className="col-6 col-sm-3">
                          <div className="p-2 rounded" style={{ backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div className="text-secondary small mb-1" style={{ fontSize: "10px" }}>Wall Time</div>
                            <div className="text-white fw-bold" style={{ fontSize: "14px" }}>
                              {resultSummary?.execution_wall_seconds !== null && resultSummary?.execution_wall_seconds !== undefined
                                ? `${formatScoreValue(resultSummary.execution_wall_seconds)}s`
                                : "N/A"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="small text-secondary text-center py-2">
                        Result summary is not available yet.
                      </div>
                    )}

                    {resultSummary && (
                      <div className="d-flex justify-content-between align-items-center text-muted mb-1 px-1" style={{ fontSize: "9.5px", opacity: 0.6 }}>
                        <span>Evaluator: v{resultSummary?.evaluator_version || "1.0"}</span>
                        <span>Sandbox Image: {resultSummary?.docker_image_tag || "unknown"}</span>
                      </div>
                    )}

                    {isShowingDetailedResult && (
                      <div className="mt-3 pt-3 border-top border-secondary">
                        {currentDetailedResult?.question_results?.length ? (
                          <div className="d-flex flex-column gap-2">
                            {currentDetailedResult.safe_summary && (
                              <div className="p-3 rounded mb-2 text-secondary bg-dark small" style={{ border: "1px dashed var(--screenai-border)", whiteSpace: "pre-line" }}>
                                <strong className="text-white d-block mb-1">Execution Summary:</strong>
                                {currentDetailedResult.safe_summary}
                              </div>
                            )}
                            {currentDetailedResult.question_results.map((questionResult, index) => (
                              <div
                                key={questionResult?.id || `${questionResult?.question_id}-${index}`}
                                className="p-3 rounded text-start"
                                style={{
                                  backgroundColor: "rgba(255, 255, 255, 0.01)",
                                  border: "1px solid var(--screenai-border)",
                                }}
                              >
                                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                                  <div>
                                    <div className="fw-bold text-white" style={{ fontSize: "12.5px" }}>
                                      {questionResult?.question_title || `Question ${index + 1}`}
                                    </div>
                                    <div className="small text-secondary" style={{ fontSize: "10.5px" }}>
                                      ID: {questionResult?.question_id || "N/A"}
                                    </div>
                                  </div>
                                  <span
                                    className="px-2 py-0.5 rounded small text-capitalize"
                                    style={{
                                      ...getStatusBadgeStyle(questionResult?.execution_status),
                                      fontSize: "9.5px",
                                    }}
                                  >
                                    {questionResult?.execution_status || "unknown"}
                                  </span>
                                </div>

                                <div className="row g-2 small mb-2">
                                  <div className="col-4">
                                    <div className="text-secondary" style={{ fontSize: "10px" }}>Score</div>
                                    <div className="text-white fw-bold">
                                      {formatScoreValue(questionResult?.score_awarded)} / {formatScoreValue(questionResult?.maximum_score)}
                                    </div>
                                  </div>
                                  <div className="col-4">
                                    <div className="text-secondary" style={{ fontSize: "10px" }}>Passed</div>
                                    <div className="text-white fw-bold">{questionResult?.passed_tests ?? 0}</div>
                                  </div>
                                  <div className="col-4">
                                    <div className="text-secondary" style={{ fontSize: "10px" }}>Failed</div>
                                    <div className="text-white fw-bold">{questionResult?.failed_tests ?? 0}</div>
                                  </div>
                                </div>

                                <div className="small bg-dark p-2 rounded border border-secondary">
                                  <div className="text-secondary mb-0.5" style={{ fontSize: "10px" }}>Feedback Details:</div>
                                  <div className="text-white" style={{ fontSize: "11px" }}>
                                    {questionResult?.safe_feedback || questionResult?.safe_stdout_summary || "No safe feedback details were recorded."}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="small text-secondary text-center py-2">
                            No per-question results are available for this evaluation.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery History Table */}
              <div>
                <h6 className="fw-bold text-white small text-uppercase tracking-wider mb-2">
                  Delivery History
                </h6>
                {loadingDetails ? (
                  <div className="text-muted small">Loading history...</div>
                ) : deliveries.length > 0 ? (
                  <div className="table-responsive">
                    <table
                      className="table table-sm table-dark table-borderless mb-0 small"
                      style={{ fontSize: "11.5px" }}
                    >
                      <thead>
                        <tr className="text-secondary border-bottom border-secondary">
                          <th>Attempt</th>
                          <th>Sent At</th>
                          <th>Status</th>
                          <th>Updated</th>
                          <th>Details / Failure</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries.map((delivery, idx) => (
                          <tr key={delivery?.send_attempt || idx} className="border-bottom border-secondary">
                            <td className="text-white fw-bold">#{delivery?.send_attempt ?? idx}</td>
                            <td>{delivery?.requested_at ? new Date(delivery.requested_at).toLocaleString() : "—"}</td>
                            <td>
                              <span
                                className="px-1.5 py-0.5 rounded text-capitalize"
                                style={{
                                  ...getStatusBadgeStyle(delivery?.status),
                                  fontSize: "10px",
                                }}
                              >
                                {delivery?.status || "unknown"}
                              </span>
                            </td>
                            <td>
                              {delivery?.last_event_at
                                ? new Date(delivery.last_event_at).toLocaleTimeString()
                                : "—"}
                            </td>
                            <td className="text-secondary">
                              {delivery?.failure_code ? (
                                <span className="text-danger">
                                  [{delivery.failure_code}] {delivery.safe_failure_message || "Delivery failed"}
                                </span>
                              ) : (
                                "Accepted by provider"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-secondary small">No delivery attempts recorded.</div>
                )}
              </div>
            </div>
          ) : (
            /* NO ASSIGNMENT STATE (SEND FORM) */
            <form onSubmit={handleSend} className="d-flex flex-column gap-3">
              <div className="row g-3">
                {/* Selector */}
                <div className="col-12">
                  <label className="form-label text-secondary small mb-1">
                    Select Active Template
                  </label>
                  {templates.length === 0 ? (
                    <div className="text-muted small">
                      No active templates available. Please activate a template in Assessments Manager.
                    </div>
                  ) : (
                    <select
                      className="form-select bg-dark text-white border-secondary small"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                      <option value="">-- Choose Template --</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (v{t.version}) — {t.duration_minutes} mins
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Template Preview */}
                {selectedTemplate && (
                  <div className="col-12">
                    <div
                      className="p-3 rounded small"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--screenai-border)",
                      }}
                    >
                      <div className="fw-bold text-white mb-1">Template Preview Details</div>
                      <div className="text-secondary mb-1">
                        <strong>Description:</strong> {selectedTemplate.description || "No description"}
                      </div>
                      <div className="text-secondary">
                        <strong>Instructions:</strong> {selectedTemplate.instructions || "No instructions"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Deadline input */}
                <div className="col-12">
                  <label className="form-label text-secondary small mb-1">
                    Completion Deadline (Timezone: Local / UTC)
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control bg-dark text-white border-secondary small"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit button */}
              <div>
                <button
                  type="submit"
                  disabled={!invitationsEnabled || sending || !selectedTemplateId || !deadline}
                  className="btn btn-xs fw-semibold text-white px-4 py-2"
                  style={{
                    backgroundColor:
                      !invitationsEnabled || sending || !selectedTemplateId || !deadline
                        ? "rgba(255, 255, 255, 0.05)"
                        : "var(--screenai-primary)",
                    cursor:
                      !invitationsEnabled || sending || !selectedTemplateId || !deadline
                        ? "not-allowed"
                        : "pointer",
                    border: "none",
                  }}
                >
                  {sending ? "Sending Invitation..." : "Send Assessment Invitation"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
