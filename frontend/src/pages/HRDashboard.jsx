/* eslint-disable react-hooks/preserve-manual-memoization */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API, { MEDIA_BASE_URL } from "../api/axiosConfig";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { clearAuthData } from "../utils/auth";
import { DataGrid } from "@mui/x-data-grid";
import { Popper, Paper, MenuList, MenuItem, ClickAwayListener, Dialog, DialogTitle, DialogContent, DialogActions, useTheme, useMediaQuery, Tooltip, Chip, IconButton, Menu } from "@mui/material";


const getCandidateName = (app) => {
  if (!app) return "";
  const name = [app.candidate_first_name, app.candidate_last_name].filter(Boolean).join(" ").trim();
  return name || app.candidate_username || "Unknown Candidate";
};

const getResumeUrl = (path) => {
  if (!path) return "#";
  if (path.startsWith("http")) return path;
  const base = MEDIA_BASE_URL.endsWith("/") ? MEDIA_BASE_URL.slice(0, -1) : MEDIA_BASE_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const getStatusBadgeStyle = (status) => {
  const s = status ? status.toLowerCase() : "";
  if (s === "hired" || s === "shortlisted") {
    return {
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      color: "#10b981",
      border: "1px solid #10b981",
    };
  }
  if (s === "rejected") {
    return {
      backgroundColor: "rgba(240, 93, 94, 0.12)",
      color: "#f05d5e",
      border: "1px solid #f05d5e",
    };
  }
  return {
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    color: "#94a3b8",
    border: "1px solid #94a3b8",
  };
};

const SCORE_COMPONENTS = [
  { key: "skills_score", label: "Skills Match", max: 30 },
  { key: "experience_score", label: "Experience Match", max: 25 },
  { key: "projects_score", label: "Projects Match", max: 20 },
  { key: "company_role_score", label: "Company/Role Fit", max: 10 },
  { key: "education_score", label: "Education Match", max: 5 },
  { key: "relevance_score", label: "Overall Relevance", max: 10 },
];

const renderScoreBreakdownGrid = (appData) => {
  if (!appData) return null;
  return (
    <div className="row g-3">
      {SCORE_COMPONENTS.map((comp) => {
        const score = appData[comp.key];
        const isAvailable = score !== null && score !== undefined;
        const percentage = isAvailable 
          ? Math.max(0, Math.min(100, (Number(score) / comp.max) * 100)) 
          : 0;

        return (
          <div key={comp.key} className="col-lg-4 col-md-6 col-12">
            <div className="p-3 rounded" style={{ backgroundColor: "#1e293b", border: "1px solid #475569" }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong style={{ color: "#cbd5e1", fontSize: "0.85rem" }}>{comp.label}</strong>
                <span style={{ color: "#f8fafc", fontWeight: "bold", fontSize: "0.95rem" }}>
                  {isAvailable ? `${score}/${comp.max}` : "Not available"}
                </span>
              </div>
              {isAvailable && (
                <div className="progress" style={{ height: "8px", backgroundColor: "#334155", borderRadius: "4px" }}>
                  <div 
                    className="progress-bar bg-success" 
                    style={{ width: `${percentage}%`, borderRadius: "4px" }} 
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const hasScoreContent = (appData) => {
  if (!appData) return false;
  const fields = [
    appData.skills_score,
    appData.experience_score,
    appData.projects_score,
    appData.company_role_score,
    appData.education_score,
    appData.relevance_score,
  ];
  return fields.some((val) => val !== null && val !== undefined);
};

const hasDetailedContent = (appData) => {
  if (!appData) return false;
  const fields = [
    appData.experience_summary,
    appData.experience_score_reason,
    appData.project_summary,
    appData.projects_score_reason,
    appData.skills_reason,
    appData.company_role_score_reason,
    appData.relevance_score_reason,
    appData.education_summary,
    appData.education_score_reason,
  ];
  return fields.some((val) => val && val.trim());
};

const JobsNoRowsOverlay = () => (
  <div className="d-flex flex-column align-items-center justify-content-center h-100 bg-dark text-secondary p-4">
    <span className="fs-6 fw-semibold text-muted">No jobs match current filter criteria.</span>
  </div>
);


const renderDetailedEvaluationContent = (appData, isCompact) => {
  if (!appData) return null;

  const groups = [
    {
      title: "Experience Details",
      items: [
        { label: "Experience Summary", val: appData.experience_summary },
        { label: "Experience Explanation", val: appData.experience_score_reason },
      ],
    },
    {
      title: "Project Details",
      items: [
        { label: "Project Summary", val: appData.project_summary },
        { label: "Projects Explanation", val: appData.projects_score_reason },
      ],
    },
    {
      title: "Skills and Job Fit",
      items: [
        { label: "Skills Match Explanation", val: appData.skills_reason },
        { label: "Company/Role Fit Explanation", val: appData.company_role_score_reason },
        { label: "Overall Relevance Explanation", val: appData.relevance_score_reason },
      ],
    },
    {
      title: "Education Details",
      items: [
        { label: "Education Summary", val: appData.education_summary },
        { label: "Education Explanation", val: appData.education_score_reason },
      ],
    },
  ];

  return (
    <div className="d-flex flex-column gap-3">
      {groups.map((group) => {
        const activeItems = group.items.filter((item) => item.val && item.val.trim());
        if (activeItems.length === 0) return null;

        const cardStyle = {
          backgroundColor: "#1e293b",
          border: "1px solid #475569",
          borderRadius: "8px",
          padding: isCompact ? "12px" : "16px",
        };

        const titleStyle = {
          color: "#6366f1",
          fontWeight: "bold",
          textTransform: "uppercase",
          fontSize: isCompact ? "0.75rem" : "0.8rem",
          letterSpacing: "0.5px",
          marginBottom: isCompact ? "8px" : "12px",
        };

        const itemGap = isCompact ? "gap-2" : "gap-3";

        return (
          <div key={group.title} style={cardStyle}>
            <div style={titleStyle}>{group.title}</div>
            <div className={`d-flex flex-column ${itemGap}`}>
              {activeItems.map((item) => (
                <div key={item.label}>
                  <strong style={{ color: "#94a3b8", display: "block", fontSize: isCompact ? "0.7rem" : "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>
                    {item.label}
                  </strong>
                  <p style={{ color: "#cbd5e1", fontSize: isCompact ? "0.8rem" : "0.85rem", lineHeight: "1.5", margin: 0, whiteSpace: "pre-line" }}>
                    {item.val.trim()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

function CandidateWorkspaceContent({
  application,
  interviews,
  loadingInterviews,
  showToast,
  onApplicationUpdate,
  fetchDashboardData,
  setShowScheduleModal,
  handleCompleteClick,
  handleRescheduleClick,
  handleCancelInterview,
  handleStatusChangeRequest,
  getResumeUrl,
  hasScoreContent,
  renderScoreBreakdownGrid,
  hasDetailedContent,
  renderDetailedEvaluationContent,
  initialSection = null
}) {
  const [expandedSections, setExpandedSections] = useState(() => {
    const sections = {
      summary: false,
      aiEvaluation: false,
      interviews: false,
      decision: false,
      progression: false,
    };
    if (initialSection === "interviews") {
      sections.interviews = true;
    } else if (initialSection === "progression") {
      sections.progression = true;
    } else if (initialSection === "decision") {
      sections.decision = true;
    } else if (initialSection === "aiEvaluation") {
      sections.aiEvaluation = true;
    } else {
      // Default to summary
      sections.summary = true;
    }
    return sections;
  });

  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [showDetailedEvaluation, setShowDetailedEvaluation] = useState(false);

  const [progStage, setProgStage] = useState(application?.application_status === "hired" ? "Onboarding" : "Offer Extended");
  const [progNotes, setProgNotes] = useState("");
  const [updatingProg, setUpdatingProg] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgStage(application?.application_status === "hired" ? "Onboarding" : "Offer Extended");
  }, [application?.application_status]);

  const toggleSection = (sec) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const handleAddProgressionLocal = async (e) => {
    e.preventDefault();
    if (!progStage.trim()) return;

    setUpdatingProg(true);
    try {
      const response = await API.post(
        `/applications/admin/${application.id}/progression/`,
        { stage: progStage.trim(), notes: progNotes.trim() }
      );
      showToast(`Progression stage "${progStage}" added`, "success");
      setProgNotes("");
      if (onApplicationUpdate) {
        onApplicationUpdate(response.data);
      }
      fetchDashboardData(true);
    } catch (err) {
      console.error("Progression error:", err);
      showToast("Failed to add progression stage.", "error");
    } finally {
      setUpdatingProg(false);
    }
  };

  if (!application) return null;

  const aiScoreVal = application.ai_score;
  const aiRecVal = application.recommendation;
  const hasAiData = aiScoreVal !== null && aiScoreVal !== undefined;

  const getAiRecStyle = (rec) => {
    const r = rec ? rec.toLowerCase() : "";
    if (r === "shortlist") {
      return {
        backgroundColor: "rgba(16, 185, 129, 0.12)",
        color: "#10b981",
        border: "1px solid #10b981",
      };
    }
    if (r === "reject") {
      return {
        backgroundColor: "rgba(240, 93, 94, 0.12)",
        color: "#f05d5e",
        border: "1px solid #f05d5e",
      };
    }
    return {
      backgroundColor: "rgba(148, 163, 184, 0.12)",
      color: "#94a3b8",
      border: "1px solid #94a3b8",
    };
  };

  const formattedAiRec = aiRecVal
    ? (aiRecVal.toLowerCase() === "shortlist"
        ? "SHORTLIST"
        : aiRecVal.toLowerCase() === "reject"
        ? "REJECT"
        : aiRecVal.toLowerCase() === "review"
        ? "REVIEW"
        : aiRecVal.toUpperCase())
    : "Not evaluated";

  return (
    <div className="d-flex flex-column gap-3">
      {/* Prominent AI Summary Row */}
      <div 
        className="p-3 rounded border text-start d-flex justify-content-between align-items-center flex-wrap gap-3 mb-2"
        style={{ 
          backgroundColor: "#0f172a", 
          borderColor: "#475569" 
        }}
      >
        <div className="d-flex flex-column gap-1">
          <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "bold" }}>
            AI-generated guidance
          </span>
          <div className="d-flex align-items-center gap-2">
            <span style={{ color: "#cbd5e1", fontSize: "0.95rem" }}>AI Compatibility Score:</span>
            <strong style={{ color: "#f8fafc", fontSize: "1.1rem" }}>
              {hasAiData ? `${aiScoreVal}/100` : "Not evaluated"}
            </strong>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span style={{ color: "#cbd5e1", fontSize: "0.95rem" }}>AI Recommendation:</span>
          <span
            style={{
              ...getAiRecStyle(aiRecVal),
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "0.85rem",
              fontWeight: "bold",
              textTransform: "uppercase",
            }}
          >
            {formattedAiRec}
          </span>
        </div>
      </div>
      {/* Section 1: Candidate Summary */}
      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
        <h5 
          onClick={() => toggleSection("summary")}
          className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
        >
          <span>1. Candidate Summary</span>
          <span className="small text-muted" style={{ fontSize: "11px" }}>{expandedSections.summary ? "Hide" : "Show"}</span>
        </h5>
        {expandedSections.summary && (
          <div className="mt-3">
            <div className="row g-3 mb-3">
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Email:</span>
                <span className="text-white fw-semibold" style={{ wordBreak: "break-all" }}>{application.candidate_email || "Not provided"}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Phone:</span>
                <span className="text-white fw-semibold">{application.candidate_phone || "Not provided"}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Education:</span>
                <span className="text-white fw-semibold" style={{ wordBreak: "break-word" }}>{application.candidate_education || application.education_summary || "Not provided"}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Total Experience:</span>
                <span className="text-white fw-semibold">{application.total_experience_years !== null && application.total_experience_years !== undefined ? `${application.total_experience_years} year(s)` : "Not provided"}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Previous Companies:</span>
                <span className="text-white fw-semibold" style={{ wordBreak: "break-word" }}>{application.worked_companies || "None listed"}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Applied Job:</span>
                <span className="text-white fw-semibold">{application.job_title} at {application.company_name}</span>
              </div>
              <div className="col-sm-6">
                <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Applied Date:</span>
                <span className="text-white fw-semibold">
                  {application.submitted_at ? new Date(application.submitted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "Not provided"}
                </span>
              </div>
            </div>
            <div className="d-flex gap-2">
              <a
                href={getResumeUrl(application.resume)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-xs btn-outline-primary flex-fill fw-bold py-1.5 text-center text-decoration-none"
              >
                Open PDF Resume
              </a>
              <a
                href={getResumeUrl(application.resume)}
                download
                className="btn btn-xs btn-outline-light flex-fill py-1.5 text-center text-decoration-none"
              >
                Download Resume
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Resume and AI Evaluation */}
      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
        <h5 
          onClick={() => toggleSection("aiEvaluation")}
          className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
        >
          <span>2. Resume & AI Evaluation</span>
          <span className="small text-muted" style={{ fontSize: "11px" }}>{expandedSections.aiEvaluation ? "Hide" : "Show"}</span>
        </h5>

        {expandedSections.aiEvaluation && (
          <div className="mt-3">
            {application.skills_score === null ? (
              <p className="text-muted small mb-0">No AI evaluation available</p>
            ) : (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3 p-2.5 rounded screenai-evaluation-card">
                  <div>
                    <span className="text-secondary fw-semibold">Overall Compatibility:</span>
                    <span className="fs-5 text-primary fw-bold ms-2">{application.ai_score}/100</span>
                  </div>
                  {application.recommendation && (
                    <span
                      style={{
                        backgroundColor:
                          application.recommendation === "shortlist"
                            ? "rgba(16, 185, 129, 0.12)"
                            : application.recommendation === "reject"
                            ? "rgba(240, 93, 94, 0.12)"
                            : "rgba(148, 163, 184, 0.12)",
                        color:
                          application.recommendation === "shortlist"
                            ? "#10b981"
                            : application.recommendation === "reject"
                            ? "#f05d5e"
                            : "#94a3b8",
                        border:
                          application.recommendation === "shortlist"
                            ? "1px solid #10b981"
                            : application.recommendation === "reject"
                            ? "1px solid #f05d5e"
                            : "1px solid #94a3b8",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                      }}
                    >
                      {application.recommendation.replace("_", " ")}
                    </span>
                  )}
                </div>

                {hasScoreContent(application) ? (
                  <div className="mb-3">
                    <button
                      type="button"
                      onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
                      aria-expanded={showScoreBreakdown}
                      aria-controls="workspace-score-breakdown"
                      className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1 mb-2"
                      style={{ 
                        color: "var(--screenai-text-muted, #94a3b8)", 
                        fontWeight: "bold", 
                        fontSize: "11px",
                        textTransform: "uppercase",
                        boxShadow: "none",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.target.style.textDecoration = "underline";
                        e.target.style.color = "var(--screenai-text, #f8fafc)";
                      }}
                      onBlur={(e) => {
                        e.target.style.textDecoration = "none";
                        e.target.style.color = "var(--screenai-text-muted, #94a3b8)";
                      }}
                    >
                      {showScoreBreakdown ? "Hide Score Breakdown" : "View Score Breakdown"}
                      <span style={{ fontSize: "9px" }}>
                        {showScoreBreakdown ? " ▲" : " ▼"}
                      </span>
                    </button>

                    {showScoreBreakdown && (
                      <div id="workspace-score-breakdown" className="mt-2">
                        {renderScoreBreakdownGrid(application)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-3 text-muted small" style={{ fontStyle: "italic", fontSize: "11px" }}>
                    Detailed score breakdown is unavailable.
                  </div>
                )}

                <div className="p-2.5 rounded text-secondary small mb-3 screenai-summary-box">
                  <strong>AI Feedback Summary:</strong>
                  <p className="mb-0 mt-1" style={{ whiteSpace: "pre-line", color: "#f8fafc" }}>
                    {application.ai_feedback || "Not evaluated"}
                  </p>
                </div>

                {hasDetailedContent(application) && (
                  <div className="border-top pt-2" style={{ borderColor: "var(--screenai-border)" }}>
                    <button
                      type="button"
                      onClick={() => setShowDetailedEvaluation(!showDetailedEvaluation)}
                      aria-expanded={showDetailedEvaluation}
                      aria-controls="workspace-detailed-evaluation"
                      className="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-1"
                      style={{ 
                        color: "var(--screenai-text-muted, #94a3b8)", 
                        fontWeight: "bold", 
                        fontSize: "11px",
                        textTransform: "uppercase",
                        boxShadow: "none",
                        outline: "none"
                      }}
                      onFocus={(e) => {
                        e.target.style.textDecoration = "underline";
                        e.target.style.color = "var(--screenai-text, #f8fafc)";
                      }}
                      onBlur={(e) => {
                        e.target.style.textDecoration = "none";
                        e.target.style.color = "var(--screenai-text-muted, #94a3b8)";
                      }}
                    >
                      {showDetailedEvaluation ? "Hide Detailed AI Evaluation" : "View Detailed AI Evaluation"}
                      <span style={{ fontSize: "9px" }}>
                        {showDetailedEvaluation ? " ▲" : " ▼"}
                      </span>
                    </button>

                    {showDetailedEvaluation && (
                      <div 
                        id="workspace-detailed-evaluation" 
                        className="mt-2"
                      >
                        {renderDetailedEvaluationContent(application, false)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Interviews */}
      <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
        <h5 
          onClick={() => toggleSection("interviews")}
          className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
        >
          <span>3. Interviews Pipeline</span>
          <span className="small text-muted" style={{ fontSize: "11px" }}>{expandedSections.interviews ? "Hide" : "Show"}</span>
        </h5>

        {expandedSections.interviews && (
          <div className="mt-3">
            {application.application_status === "shortlisted" && (
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="btn btn-xs btn-primary w-100 mb-3 fw-semibold text-white"
                style={{ fontSize: "11.5px" }}
              >
                Schedule Round
              </button>
            )}

            {loadingInterviews ? (
              <p className="text-muted small">Loading interviews...</p>
            ) : interviews.length === 0 ? (
              <div className="text-center py-3 text-secondary small">
                No interview rounds scheduled yet. Candidate must be shortlisted to schedule rounds.
              </div>
            ) : (
              <div className="screenai-timeline">
                {interviews.map((interview) => (
                  <div key={interview.id} className="screenai-timeline-item text-start">
                    <div
                      className={`screenai-timeline-dot ${interview.status === "completed"
                          ? "completed"
                          : interview.status === "cancelled"
                            ? "cancelled"
                            : "scheduled"
                        }`}
                    />
                    <div className="p-3 rounded screenai-interview-card">
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
                          className="badge text-capitalize"
                          style={{
                            fontSize: "10px",
                            backgroundColor:
                              interview.status === "completed"
                                ? "var(--screenai-success)"
                                : interview.status === "cancelled"
                                ? "var(--screenai-danger)"
                                : "var(--screenai-text-muted)",
                            color: "var(--screenai-bg)"
                          }}
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
                              style={{ color: "var(--screenai-primary)", textDecoration: "underline" }}
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
                          <div className="small fw-bold text-capitalize mt-1" style={{ color: "var(--screenai-text-muted)" }}>
                            Recommendation: {interview.recommendation?.replace("_", " ")}
                          </div>
                        </div>
                      )}

                      {interview.status === "scheduled" && (
                        <div className="mt-3 d-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCompleteClick(interview)}
                            className="btn btn-xs btn-success py-1 px-2 fw-semibold text-white"
                            style={{ fontSize: "11px" }}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRescheduleClick(interview)}
                            className="btn btn-xs btn-outline-secondary py-1 px-2 fw-semibold"
                            style={{ fontSize: "11px" }}
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelInterview(interview.id)}
                            className="btn btn-xs btn-danger py-1 px-2 fw-semibold text-white"
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
        )}
      </div>

      {/* Section 4: Recruitment Decision (Only visible if status is NOT hired) */}
      {application.application_status !== "hired" && (
        <div className="p-3 rounded border text-start" style={{ backgroundColor: "var(--screenai-bg)", borderColor: "var(--screenai-border)" }}>
          <h5 
            onClick={() => toggleSection("decision")}
            className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
          >
            <span>4. Recruitment Decision</span>
            <span className="small text-muted" style={{ fontSize: "11px" }}>{expandedSections.decision ? "Hide" : "Show"}</span>
          </h5>

          {expandedSections.decision && (
            <div className="mt-3">
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="text-secondary small">Current Status:</span>
                <span className="badge bg-secondary text-uppercase py-1 px-2">
                  {application.application_status}
                </span>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleStatusChangeRequest("hired")}
                  className="btn btn-sm btn-success fw-bold flex-fill text-white"
                >
                  Hire Candidate
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChangeRequest("shortlisted")}
                  disabled={application.application_status === "shortlisted"}
                  className="btn btn-sm btn-primary flex-fill fw-bold text-white"
                >
                  Shortlist
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChangeRequest("rejected")}
                  disabled={application.application_status === "rejected"}
                  className="btn btn-sm btn-danger flex-fill fw-bold"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChangeRequest("pending")}
                  disabled={application.application_status === "pending"}
                  className="btn btn-sm btn-secondary flex-fill fw-bold"
                >
                  Mark Pending
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 5: Post-Hire Progression (Only visible if status is hired) */}
      {application.application_status === "hired" && (
        <div className="p-3 rounded border text-start" style={{ backgroundColor: "#0f172a", borderColor: "#475569" }}>
          <h5 
            onClick={() => toggleSection("progression")}
            className="fw-bold text-white mb-0 pb-2 border-bottom border-secondary small text-uppercase tracking-wider cursor-pointer d-flex justify-content-between align-items-center"
          >
            <span>5. Post-Hire Progression</span>
            <span className="small text-muted" style={{ fontSize: "11px" }}>{expandedSections.progression ? "Hide" : "Show"}</span>
          </h5>

          {expandedSections.progression && (
            <div className="mt-3 progression-form">
              <style>{`
                .progression-form select.progression-select, .progression-form input.progression-input {
                  background-color: #0f172a !important;
                  border: 1px solid #475569 !important;
                  color: #f8fafc !important;
                }
                .progression-form select.progression-select:focus, .progression-form input.progression-input:focus {
                  border-color: #6366f1 !important;
                  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25) !important;
                  outline: none !important;
                }
                .progression-form input.progression-input::placeholder {
                  color: #64748b !important;
                }
                .progression-form button.progression-submit {
                  background-color: #6366f1 !important;
                  border-color: #6366f1 !important;
                  color: #f8fafc !important;
                  transition: background-color 0.2s ease !important;
                }
                .progression-form button.progression-submit:hover:not(:disabled) {
                  background-color: #4f46e5 !important;
                }
                .progression-form button.progression-submit:disabled {
                  background-color: rgba(99, 102, 241, 0.5) !important;
                  border-color: rgba(99, 102, 241, 0.5) !important;
                  cursor: not-allowed;
                }
              `}</style>

              <div className="py-2 px-3 mb-3 small fw-bold text-center" style={{ backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid #10b981", borderRadius: "6px" }}>
                Candidate Hired. Log placement progressions below.
              </div>

              <form onSubmit={handleAddProgressionLocal} className="p-3 rounded mb-3 small border" style={{ backgroundColor: "#1e293b", borderColor: "#475569" }}>
                <label className="form-label small fw-bold mb-2" style={{ color: "#cbd5e1" }}>Record Onboarding Update</label>
                <div className="row g-2">
                  <div className="col-sm-5">
                    <select
                      className="form-select form-select-sm progression-select"
                      value={progStage}
                      onChange={(e) => setProgStage(e.target.value)}
                      disabled={updatingProg}
                    >
                      <option value="Offer Extended" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Offer Extended</option>
                      <option value="Onboarding" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Onboarding</option>
                      <option value="Active Employee" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Active Employee</option>
                      <option value="Promoted" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Promoted</option>
                      <option value="Resigned" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Resigned</option>
                      <option value="Terminated" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Terminated</option>
                    </select>
                  </div>
                  <div className="col-sm-7">
                    <input
                      type="text"
                      className="form-control form-control-sm progression-input"
                      placeholder="Add progress notes..."
                      value={progNotes}
                      onChange={(e) => setProgNotes(e.target.value)}
                      disabled={updatingProg}
                    />
                  </div>
                  <div className="col-12 mt-2">
                    <button
                      type="submit"
                      className="btn btn-sm progression-submit w-100 fw-bold"
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
                    className="position-absolute h-100 border-start"
                    style={{ left: "8px", top: "0", borderColor: "#475569" }}
                  />
                  {!application.progressions ||
                    application.progressions.length === 0 ? (
                    <p className="text-secondary small">No onboarding progression logs recorded yet.</p>
                  ) : (
                    application.progressions.map((log) => {
                      let dotColor = "var(--screenai-success)"; // default success green
                      const stage = log.stage ? log.stage.toLowerCase() : "";
                      if (stage.includes("terminated") || stage.includes("resigned")) {
                        dotColor = "var(--screenai-danger)";
                      } else if (stage.includes("extended")) {
                        dotColor = "var(--screenai-primary)";
                      } else if (stage.includes("onboarding")) {
                        dotColor = "var(--screenai-text-muted)";
                      }

                      return (
                        <div 
                          key={log.id} 
                          className="position-relative mb-3 small p-3 rounded" 
                          style={{ 
                            backgroundColor: "#1e293b", 
                            border: "1px solid #475569", 
                            marginLeft: "15px" 
                          }}
                        >
                          <div
                            className="position-absolute rounded-circle"
                            style={{ 
                              left: "-21px", 
                              top: "18px", 
                              width: "8px", 
                              height: "8px", 
                              backgroundColor: dotColor, 
                              border: "2px solid #0f172a", 
                              boxSizing: "content-box", 
                              zIndex: 2 
                            }}
                          />
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong style={{ color: "#f8fafc" }}>{log.stage}</strong>
                            <span style={{ color: "#94a3b8", fontSize: "10px" }}>
                              {new Date(log.updated_at).toLocaleString()}
                            </span>
                          </div>
                          {log.notes && <div style={{ color: "#cbd5e1", marginBottom: "4px" }}>{log.notes}</div>}
                          <div style={{ color: "#94a3b8", fontSize: "9px" }}>
                            Recorded by: {log.updated_by_username ? `@${log.updated_by_username}` : "System"}{" "}
                            ({log.updater_role === "admin" ? "Admin" : "HR"})
                          </div>
                        </div>
                      );
                    })
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

function HRDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJobId = searchParams.get("jobId") || "";
  const navigate = useNavigate();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [activePopup, setActivePopup] = useState({
    cardName: null,
    anchorEl: null,
  });
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimeoutRef = useRef(null);

  const handleOpenPopup = (cardName, event, isKeyboard = false) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenedByKeyboard(isKeyboard);
    setActivePopup({
      cardName,
      anchorEl: event.currentTarget,
    });
  };

  const handleClosePopup = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setActivePopup({ cardName: null, anchorEl: null });
      setOpenedByKeyboard(false);
    }, 200);
  };

  const handleMouseEnterPopup = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handlePopupKeyDown = (e) => {
    if (e.key === "Escape") {
      setActivePopup({ cardName: null, anchorEl: null });
      setOpenedByKeyboard(false);
      if (activePopup.anchorEl) {
        activePopup.anchorEl.focus();
      }
    }
  };

  const handlePreviewJobPointerDown = (event) => {
    event.stopPropagation();

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handlePreviewJobSelect = (event, job) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedPreviewJob(job);
    setActivePopup({ cardName: null, anchorEl: null });
    setOpenedByKeyboard(false);
  };

  const handlePreviewApplicationPointerDown = (event) => {
    event.stopPropagation();

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handlePreviewApplicationSelect = (event, app) => {
    event.preventDefault();
    event.stopPropagation();

    openCandidatePreviewWorkspace(app, "summary");
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Tab State & Safe Mapping
  const rawTab = searchParams.get("tab") || "overview";
  const activeTab = useMemo(() => {
    if (["overview", "jobs", "profile"].includes(rawTab)) {
      return rawTab;
    }
    if (["applications", "candidates", "recruitment", "shortlisted", "pending"].includes(rawTab)) {
      return "candidates";
    }
    return "overview"; // Fallback to overview for any unsupported tab
  }, [rawTab]);

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

  const [selectedPreviewJob, setSelectedPreviewJob] = useState(null);
  const activePreviewJobData = selectedPreviewJob
    ? jobs.find((job) => job.id === selectedPreviewJob.id) || selectedPreviewJob
    : null;

  const activePreviewJobDeadlinePassed = activePreviewJobData?.application_deadline
    ? new Date(activePreviewJobData.application_deadline) < new Date()
    : false;

  const activePreviewJobHasApps = activePreviewJobData
    ? (activePreviewJobData.applicant_count ?? 0) > 0
    : false;

  const activePreviewJobShareLink = activePreviewJobData
    ? `${window.location.origin}/apply/public/${activePreviewJobData.application_token}`
    : "";

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

  // Job Search / Filter States
  const [jobSearch, setJobSearch] = useState("");
  const [jobAppStatus, setJobAppStatus] = useState("all"); // all, enabled, disabled
  const [jobDeadlineFilter, setJobDeadlineFilter] = useState("all"); // all, active, passed, none
  const [jobLocationFilter, setJobLocationFilter] = useState("all");
  const [jobPaginationModel, setJobPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });
  const [jobMenuAnchor, setJobMenuAnchor] = useState({ anchorEl: null, job: null });
  const [copiedJobToken, setCopiedJobToken] = useState(null);
  const [togglingJobFormId, setTogglingJobFormId] = useState(null);

  const handleJobSearchChange = (val) => {
    setJobSearch(val);
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleJobFilterChange = (val) => {
    setJobFilter(val);
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleJobAppStatusChange = (val) => {
    setJobAppStatus(val);
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleJobDeadlineFilterChange = (val) => {
    setJobDeadlineFilter(val);
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleJobLocationFilterChange = (val) => {
    setJobLocationFilter(val);
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleClearFilters = () => {
    setJobSearch("");
    setJobFilter("all");
    setJobAppStatus("all");
    setJobDeadlineFilter("all");
    setJobLocationFilter("all");
    setJobPaginationModel((prev) => ({ ...prev, page: 0 }));
  };



  // Applications Filter States
  const [appSearch, setAppSearch] = useState("");
  const [appFilters, setAppFilters] = useState({
    min_score: "",
    experience: "",
    company: "",
    recommendation: "",
    status: (() => {
      const tabVal = searchParams.get("tab");
      if (tabVal === "shortlisted" || tabVal === "pending") {
        return tabVal;
      }
      return "";
    })(),
  });

  // Unified Candidate Workspace States
  const [activeWorkspaceAppId, setActiveWorkspaceAppId] = useState(null);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState("summary");
  const lastActiveElementRef = useRef(null);

  const activeWorkspaceApp = useMemo(() => {
    if (!activeWorkspaceAppId) return null;
    return allApplications.find((app) => String(app.id) === String(activeWorkspaceAppId)) || null;
  }, [activeWorkspaceAppId, allApplications]);

  const handleApplicationUpdate = useCallback((updatedApp) => {
    if (updatedApp && updatedApp.id) {
      setAllApplications((prev) =>
        prev.map((app) => (app.id === updatedApp.id ? updatedApp : app))
      );
    }
  }, []);

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

  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });

  const openCandidateWorkspace = useCallback((applicationOrId, initialSection) => {
    lastActiveElementRef.current = document.activeElement;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const id = (applicationOrId && typeof applicationOrId === "object") ? applicationOrId.id : applicationOrId;
    setActiveWorkspaceAppId(id);
    setActiveWorkspaceSection(initialSection || "summary");
    setActivePopup({ cardName: null, anchorEl: null });
    setOpenedByKeyboard(false);
  }, []);

  const closeCandidateWorkspace = useCallback(() => {
    setActiveWorkspaceAppId(null);
    setActiveWorkspaceSection("summary");
    if (lastActiveElementRef.current && lastActiveElementRef.current.isConnected) {
      try {
        lastActiveElementRef.current.focus();
      } catch (e) {
        console.warn("Could not restore focus:", e);
      }
    }
    lastActiveElementRef.current = null;
  }, []);

  const clearCandidateFilters = useCallback(() => {
    setAppSearch("");
    setAppFilters({
      min_score: "",
      experience: "",
      company: "",
      recommendation: "",
      status: "",
    });
    closeCandidateWorkspace();
    setPaginationModel({ page: 0, pageSize: 10 });
    setSearchParams((prev) => {
      prev.delete("jobId");
      return prev;
    });
  }, [setSearchParams, closeCandidateWorkspace]);

  const openAllCandidates = useCallback(() => {
    clearCandidateFilters();
    setSearchParams((prev) => {
      prev.set("tab", "candidates");
      prev.delete("jobId");
      return prev;
    });
  }, [clearCandidateFilters, setSearchParams]);

  const openCandidatesForJob = useCallback((jobId) => {
    clearCandidateFilters();
    const normalized = jobId ? String(jobId) : "";
    setSearchParams((prev) => {
      prev.set("tab", "candidates");
      if (normalized) {
        prev.set("jobId", normalized);
      } else {
        prev.delete("jobId");
      }
      return prev;
    });
  }, [clearCandidateFilters, setSearchParams]);

  const openCandidatesWithStatus = useCallback((status) => {
    clearCandidateFilters();
    if (status) {
      setAppFilters((prev) => ({ ...prev, status }));
    }
    setSearchParams((prev) => {
      prev.set("tab", "candidates");
      prev.delete("jobId");
      return prev;
    });
  }, [clearCandidateFilters, setSearchParams]);

  const handleClearAllCandidateFilters = () => {
    clearCandidateFilters();
  };

  // URL validation effect for Candidates tab jobId parameter
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "candidates" && jobs.length > 0) {
      const urlJobId = searchParams.get("jobId") || "";
      if (urlJobId) {
        const isValid = jobs.some((j) => String(j.id) === urlJobId);
        if (!isValid) {
          setSearchParams((prev) => {
            prev.delete("jobId");
            return prev;
          });
        }
      }
    }
  }, [searchParams, jobs, setSearchParams]);

  const openCandidatePreviewWorkspace = useCallback((app, initialSection = null) => {
    openCandidateWorkspace(app, initialSection);
  }, [openCandidateWorkspace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close workspace when active tab changes
    closeCandidateWorkspace();
  }, [activeTab, closeCandidateWorkspace]);

  // Load Dashboard Data
  const fetchDashboardData = useCallback(async (silent = false) => {
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
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to fetch recruiter dashboard data.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rawTab === "shortlisted" || rawTab === "pending") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAppFilters((prev) => ({ ...prev, status: rawTab }));
    }
  }, [rawTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (showEditJobModal) {
          setShowEditJobModal(false);
        } else if (selectedPreviewJob) {
          setSelectedPreviewJob(null);
        } else if (activeWorkspaceAppId) {
          closeCandidateWorkspace();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showEditJobModal, selectedPreviewJob, activeWorkspaceAppId, closeCandidateWorkspace]);


  // Sync tab navigation query parameters
  const handleTabChange = (tabName) => {
    setSearchParams({ tab: tabName });
    closeCandidateWorkspace();
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const closeConfirmModal = useCallback(() => {
    setConfirmModal({
      isOpen: false,
      title: "",
      message: "",
      onConfirm: null,
    });
  }, []);

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
        `Application form ${!job.application_form_enabled ? "enabled" : "disabled"
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
          setSelectedPreviewJob(null);
        } catch (err) {
          console.error(err);
          showToast(err.response?.data?.detail || "Could not delete job", "error");
        }
      },
    });
  };

  // --- Interview Timeline & Management ---
  const fetchInterviews = useCallback(async (applicationId) => {
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
  }, []);

  const handleSelectApplication = useCallback((app) => {
    if (app) {
      openCandidateWorkspace(app, "summary");
    } else {
      closeCandidateWorkspace();
    }
  }, [openCandidateWorkspace, closeCandidateWorkspace]);

  useEffect(() => {
    if (activeWorkspaceAppId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch candidate interviews when active workspace candidate changes
      fetchInterviews(activeWorkspaceAppId);
    } else {
      setInterviews([]);
    }
  }, [activeWorkspaceAppId, fetchInterviews]);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!activeWorkspaceApp) return;
    try {
      const payload = {
        ...scheduleForm,
        round_number: Number(scheduleForm.round_number),
        duration_minutes: Number(scheduleForm.duration_minutes),
      };
      await API.post(`/applications/${activeWorkspaceApp.id}/interviews/`, payload);
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
      fetchInterviews(activeWorkspaceApp.id);
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
          if (activeWorkspaceApp) {
            fetchInterviews(activeWorkspaceApp.id);
          }
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
      if (activeWorkspaceApp) {
        fetchInterviews(activeWorkspaceApp.id);
      }
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
      if (activeWorkspaceApp) {
        fetchInterviews(activeWorkspaceApp.id);
      }
      fetchDashboardData(true);
    } catch (err) {
      console.error(err);
      showToast("Failed to complete interview evaluation. Fill all ratings and feedback.", "error");
    }
  };

  // --- Grid Row Action Helpers ---
  const updateGridStatusDirect = useCallback(async (appId, newStatus) => {
    try {
      await API.patch(`/applications/${appId}/status/`, {
        application_status: newStatus,
      });
      showToast(`Candidate status changed to ${newStatus}`, "success");
      fetchDashboardData(true);
      setAllApplications((prev) =>
        prev.map((app) =>
          app.id === appId ? { ...app, application_status: newStatus } : app
        )
      );
    } catch (err) {
      console.error(err);
      showToast("Failed to update candidate status", "error");
    }
  }, [fetchDashboardData]);

  const handleGridStatusChange = useCallback((appRow, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `${newStatus.toUpperCase()} Candidate`,
      message: `Change recruitment status for candidate ${getCandidateName(appRow)} to "${newStatus}"?`,
      onConfirm: () => {
        closeConfirmModal();
        updateGridStatusDirect(appRow.id, newStatus);
      },
    });
  }, [closeConfirmModal, updateGridStatusDirect]);

  const handleGridInterviewClick = useCallback((appRow) => {
    setActiveWorkspaceAppId(appRow.id);
    setShowScheduleModal(true);
  }, []);

  // --- Recruitment Status & Hire Warnings ---
  const updateStatusDirect = async (newStatus) => {
    if (!activeWorkspaceApp) return;
    try {
      await API.patch(`/applications/${activeWorkspaceApp.id}/status/`, {
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
    if (!activeWorkspaceApp) return;
    if (newStatus !== "hired") {
      setConfirmModal({
        isOpen: true,
        title: `${newStatus.toUpperCase()} Candidate`,
        message: `Change recruitment status for candidate ${getCandidateName(
          activeWorkspaceApp
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
          activeWorkspaceApp
        )}? Interviews are audited and complete.`,
        onConfirm: () => {
          closeConfirmModal();
          updateStatusDirect("hired");
        },
      });
    }
  };

  // --- Progression Logs ---

  // --- Filters / Utilities ---

  const uniqueJobLocations = useMemo(() => {
    const locs = jobs.map((job) => job.location).filter(Boolean);
    return Array.from(new Set(locs));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // 1. Job Status
      if (jobFilter === "open" && job.status !== "open") return false;
      if (jobFilter === "closed" && job.status !== "closed") return false;

      // 2. Search (title / company)
      if (jobSearch) {
        const query = jobSearch.toLowerCase();
        const title = (job.job_title || "").toLowerCase();
        const company = (job.company_name || "").toLowerCase();
        if (!title.includes(query) && !company.includes(query)) return false;
      }

      // 3. Application Status
      if (jobAppStatus !== "all") {
        if (jobAppStatus === "enabled" && !job.application_form_enabled) return false;
        if (jobAppStatus === "disabled" && job.application_form_enabled) return false;
      }

      // 4. Deadline
      if (jobDeadlineFilter !== "all") {
        const hasDeadline = Boolean(job.application_deadline);
        const isPassed = hasDeadline && new Date(job.application_deadline) < new Date();
        if (jobDeadlineFilter === "active" && (!hasDeadline || isPassed)) return false;
        if (jobDeadlineFilter === "passed" && (!hasDeadline || !isPassed)) return false;
        if (jobDeadlineFilter === "none" && hasDeadline) return false;
      }

      // 5. Location
      if (jobLocationFilter !== "all") {
        const loc = job.location || "Remote";
        const filterLoc = jobLocationFilter;
        if (loc !== filterLoc) return false;
      }

      return true;
    });
  }, [jobs, jobSearch, jobFilter, jobAppStatus, jobDeadlineFilter, jobLocationFilter]);

  const handleCellKeyDown = useCallback((params, event) => {
    if (params.field === "actions") {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedPreviewJob(params.row);
    }
  }, []);

  const jobColumns = useMemo(() => [
    {
      field: "job_title",
      headerName: "Job Title",
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => {
        const title = params.value || "";
        return (
          <Tooltip title={title} placement="top-start">
            <span className="text-truncate d-inline-block w-100" style={{ cursor: "pointer", color: "#f8fafc" }}>
              {title}
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "company_name",
      headerName: "Company",
      flex: 1.2,
      minWidth: 120,
      renderCell: (params) => {
        const company = params.value || "";
        return (
          <Tooltip title={company} placement="top-start">
            <span className="text-truncate d-inline-block w-100">
              {company}
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "location",
      headerName: "Location",
      flex: 1,
      minWidth: 100,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.location || "Remote";
      },
    },
    {
      field: "required_experience",
      headerName: "Experience Required",
      flex: 1,
      minWidth: 110,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.required_experience || "Any exp";
      },
    },
    {
      field: "applicant_count",
      headerName: "Applicants",
      width: 100,
      type: "number",
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.applicant_count ?? 0;
      },
      renderCell: (params) => {
        const count = params.value ?? 0;
        return (
          <span style={{ fontWeight: "semibold", color: "#cbd5e1" }}>
            {count}
          </span>
        );
      },
    },
    {
      field: "status",
      headerName: "Job Status",
      width: 110,
      renderCell: (params) => {
        const status = params.value || "open";
        const isOpen = status === "open";
        return (
          <Chip
            label={isOpen ? "Open" : "Closed"}
            size="small"
            variant="outlined"
            sx={{
              fontWeight: "bold",
              color: isOpen ? "#10b981" : "#cbd5e1",
              borderColor: isOpen ? "#10b981" : "#475569",
              backgroundColor: isOpen ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
            }}
          />
        );
      },
    },
    {
      field: "application_form_enabled",
      headerName: "Application Status",
      width: 160,
      renderCell: (params) => {
        const enabled = params.value;
        return (
          <Chip
            label={enabled ? "Enabled" : "Disabled"}
            size="small"
            variant="outlined"
            sx={{
              fontWeight: "bold",
              color: enabled ? "#10b981" : "#94a3b8",
              borderColor: enabled ? "#10b981" : "#94a3b8",
              backgroundColor: enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
            }}
          />
        );
      },
    },
    {
      field: "application_deadline",
      headerName: "Deadline",
      width: 200,
      renderCell: (params) => {
        const deadline = params.value;
        if (!deadline) {
          return <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No deadline</span>;
        }
        const formatted = new Date(deadline).toLocaleString();
        const isPassed = new Date(deadline) < new Date();
        return (
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: "0.85rem", color: isPassed ? "#ef4444" : "#f8fafc" }}>
              {formatted}
            </span>
            {isPassed && (
              <Chip
                label="Passed"
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: "bold",
                  height: "20px",
                  fontSize: "9px",
                  color: "#ef4444",
                  borderColor: "#ef4444",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                }}
              />
            )}
          </div>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      renderCell: (params) => {
        const job = params.row;
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setJobMenuAnchor({ anchorEl: e.currentTarget, job });
            }}
            sx={{ color: "#cbd5e1" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </IconButton>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [copyApplicationLink, toggleApplicationForm, updateJobStatus, deleteJob, togglingJobFormId]);



  const filteredApplications = useMemo(() => {
    return allApplications.filter((app) => {
      // Text search (name, email, job title)
      const name = getCandidateName(app).toLowerCase();
      const email = (app.candidate_email || "").toLowerCase();
      const search = appSearch.toLowerCase();
      const matchesSearch =
        name.includes(search) ||
        email.includes(search) ||
        (app.job_title || "").toLowerCase().includes(search);

      // Filters
      const matchesJob = !selectedJobId || String(app.job) === String(selectedJobId);
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
  }, [allApplications, appSearch, appFilters, selectedJobId]);

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
    if (!selectedJobId) return null;
    return jobs.find((j) => String(j.id) === String(selectedJobId)) || null;
  }, [jobs, selectedJobId]);

  const candidateColumns = useMemo(() => [
    {
      field: "candidateName",
      headerName: "Candidate",
      flex: 1.2,
      minWidth: 130,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow ? getCandidateName(actualRow) : "";
      },
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return "";
        const app = row.raw || row;
        return (
          <span
            style={{
              color: "#6366f1",
              fontWeight: "600",
              cursor: "pointer",
              textDecoration: "underline",
            }}
            onClick={(e) => {
              e.stopPropagation();
              openCandidateWorkspace(app, "summary");
            }}
          >
            {getCandidateName(app)}
          </span>
        );
      }
    },
    {
      field: "job_title",
      headerName: "Job Role",
      flex: 1.2,
      minWidth: 130,
    },
    {
      field: "candidate_email",
      headerName: "Email",
      flex: 1.2,
      minWidth: 130,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.candidate_email || "N/A";
      },
    },
    {
      field: "candidate_phone",
      headerName: "Phone",
      flex: 1,
      minWidth: 110,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.candidate_phone || "N/A";
      },
    },
    {
      field: "total_experience_years",
      headerName: "Experience",
      width: 90,
      type: "number",
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.total_experience_years || 0;
      },
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return `${actualValue ?? 0} yrs`;
      },
    },
    {
      field: "worked_companies",
      headerName: "Worked Companies",
      flex: 1.2,
      minWidth: 140,
      valueGetter: (value, row) => {
        const actualRow = row || value?.row || value;
        return actualRow?.worked_companies || "None";
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
      renderCell: (params) => {
        const status = params?.value;
        let badgeColor = "bg-secondary";
        if (status === "hired") badgeColor = "bg-success";
        else if (status === "rejected") badgeColor = "bg-danger";
        else if (status === "shortlisted") badgeColor = "bg-primary";
        return (
          <span className={`badge ${badgeColor} text-capitalize`}>
            {status || "N/A"}
          </span>
        );
      },
    },
    {
      field: "submitted_at",
      headerName: "Applied Date",
      width: 110,
      valueFormatter: (value) => {
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        return actualValue ? new Date(actualValue).toLocaleDateString() : "N/A";
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 260,
      sortable: false,
      renderCell: (params) => {
        const row = params?.row;
        if (!row) return null;
        const status = row.application_status;
        return (
          <div className="d-flex align-items-center gap-1 h-100">
            <button
              className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
              style={{ fontSize: "10px" }}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectApplication(row?.raw || row);
              }}
            >
              View
            </button>
            {row.resume && (
              <a
                href={getResumeUrl(row.resume)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-xs btn-outline-secondary py-0.5 px-1.5 small text-decoration-none"
                style={{ fontSize: "10px" }}
                onClick={(e) => e.stopPropagation()}
              >
                Resume
              </a>
            )}
            {status === "pending" && (
              <>
                <button
                  className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small text-white"
                  style={{ fontSize: "10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridStatusChange(row, "shortlisted");
                  }}
                >
                  Shortlist
                </button>
                <button
                  className="btn btn-xs btn-outline-danger py-0.5 px-1.5 small"
                  style={{ fontSize: "10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridStatusChange(row, "rejected");
                  }}
                >
                  Reject
                </button>
              </>
            )}
            {status === "shortlisted" && (
              <>
                <button
                  className="btn btn-xs btn-outline-primary py-0.5 px-1.5 small"
                  style={{ fontSize: "10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridInterviewClick(row);
                  }}
                >
                  Interview
                </button>
                <button
                  className="btn btn-xs btn-outline-success py-0.5 px-1.5 small text-white"
                  style={{ fontSize: "10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridStatusChange(row, "hired");
                  }}
                >
                  Hire
                </button>
                <button
                  className="btn btn-xs btn-outline-danger py-0.5 px-1.5 small"
                  style={{ fontSize: "10px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGridStatusChange(row, "rejected");
                  }}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        );
      }
    }
  ], [handleGridStatusChange, handleGridInterviewClick, handleSelectApplication, openCandidateWorkspace]);

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
          <h5 className="fw-bold mb-0 text-white mt-2">
            {profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : profile?.username || "Recruiter"}
          </h5>
          <span className="badge bg-primary text-capitalize mt-1 small">HR Recruiter</span>
        </div>

        <button
          onClick={() => handleTabChange("overview")}
          className={`screenai-sidebar-item ${activeTab === "overview" ? "active" : ""}`}
        >
          Overview
        </button>

        <button
          onClick={openAllCandidates}
          className={`screenai-sidebar-item ${activeTab === "candidates" ? "active" : ""}`}
        >
          Candidates
        </button>

        <button
          onClick={() => handleTabChange("jobs")}
          className={`screenai-sidebar-item ${activeTab === "jobs" ? "active" : ""}`}
        >
          Jobs
        </button>

        <button
          onClick={() => handleTabChange("profile")}
          className={`screenai-sidebar-item ${activeTab === "profile" ? "active" : ""}`}
        >
          Profile
        </button>

        <div className="mt-auto p-2 border-top pt-3 text-center" style={{ borderColor: "var(--screenai-border)" }}>
          <button
            onClick={() => fetchDashboardData()}
            className="btn btn-sm btn-outline-secondary w-100 py-1"
          >
            Sync Data
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
              {activeTab === "candidates" ? "Candidates" : activeTab}
            </span>
          </div>
          <div className="d-flex align-items-center gap-3">
            <button onClick={() => fetchDashboardData()} className="btn btn-xs btn-outline-secondary py-1 px-3 d-flex align-items-center gap-1">
              Sync Platform Data
            </button>
            <span className="text-secondary small fw-bold">
              {profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : "Recruiter"}
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
              Logout
            </button>
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
                <>
                  <div className="row g-3 mb-5 row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-5">
                    {/* Card 1: Active Jobs */}
                    <div className="col">
                      <div
                        className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0"
                        style={{ borderLeft: "4px solid var(--screenai-primary)", background: "var(--screenai-surface)" }}
                        tabIndex="0"
                        aria-label={`Active Jobs: ${openJobsCount} open, total ${totalJobsCount}. Focus or hover to preview active jobs list. Click to open jobs page.`}
                        onClick={() => {
                          handleJobFilterChange("open");
                          handleTabChange("jobs");
                        }}
                        onKeyDown={(e) => handleKeyDown(e, () => {
                          handleJobFilterChange("open");
                          handleTabChange("jobs");
                        })}

                        onMouseEnter={(e) => handleOpenPopup('jobs', e)}
                        onMouseLeave={handleClosePopup}
                        onFocus={(e) => handleOpenPopup('jobs', e, true)}
                        onBlur={handleClosePopup}
                      >
                        <div className="screenai-metric-label">Active Jobs</div>
                        <div className="screenai-metric-val">{openJobsCount}</div>
                        <small className="text-muted">Total: {totalJobsCount}</small>
                      </div>
                    </div>

                    {/* Card 2: New Applications */}
                    <div className="col">
                      <div
                        className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0"
                        style={{ borderLeft: "4px solid var(--screenai-text-muted)", background: "var(--screenai-surface)" }}
                        tabIndex="0"
                        aria-label={`New Applications: ${newApplicationsCount} awaiting review. Focus or hover to preview new applications list. Click to open recruitment page.`}
                        onClick={() => openCandidatesWithStatus("pending")}
                        onKeyDown={(e) => handleKeyDown(e, () => openCandidatesWithStatus("pending"))}
                        onMouseEnter={(e) => handleOpenPopup('new_apps', e)}
                        onMouseLeave={handleClosePopup}
                        onFocus={(e) => handleOpenPopup('new_apps', e, true)}
                        onBlur={handleClosePopup}
                      >
                        <div className="screenai-metric-label">New Applications</div>
                        <div className="screenai-metric-val">{newApplicationsCount}</div>
                        <small className="text-muted">Need review</small>
                      </div>
                    </div>

                    {/* Card 3: Shortlisted */}
                    <div className="col">
                      <div
                        className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0"
                        style={{ borderLeft: "4px solid var(--screenai-primary)", background: "var(--screenai-surface)" }}
                        tabIndex="0"
                        aria-label={`Shortlisted Candidates: ${shortlistedCount} in pipeline. Focus or hover to preview shortlisted list. Click to open recruitment page.`}
                        onClick={() => openCandidatesWithStatus("shortlisted")}
                        onKeyDown={(e) => handleKeyDown(e, () => openCandidatesWithStatus("shortlisted"))}
                        onMouseEnter={(e) => handleOpenPopup('shortlisted', e)}
                        onMouseLeave={handleClosePopup}
                        onFocus={(e) => handleOpenPopup('shortlisted', e, true)}
                        onBlur={handleClosePopup}
                      >
                        <div className="screenai-metric-label">Shortlisted</div>
                        <div className="screenai-metric-val">{shortlistedCount}</div>
                        <small className="text-muted">In pipeline</small>
                      </div>
                    </div>

                    {/* Card 4: Scheduled Rounds */}
                    <div className="col">
                      <div
                        className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0"
                        style={{ borderLeft: "4px solid var(--screenai-primary)", background: "var(--screenai-surface)" }}
                        tabIndex="0"
                        aria-label={`Scheduled Rounds: ${upcomingInterviewsCount} upcoming interviews. Focus or hover to preview upcoming rounds list. Click to open candidates interviews page.`}
                        onClick={() => {
                          const firstSched = allInterviews.find((i) => i.status === "scheduled");
                          clearCandidateFilters();
                          if (firstSched) {
                            const app = allApplications.find((a) => a.id === firstSched.applicationId);
                            if (app) {
                              setAppFilters({
                                min_score: "",
                                experience: "",
                                company: "",
                                recommendation: "",
                                status: app.application_status
                              });
                            }
                          } else {
                            setAppFilters({
                              min_score: "",
                              experience: "",
                              company: "",
                              recommendation: "",
                              status: ""
                            });
                          }
                          setSearchParams({ tab: "candidates" });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, () => {
                          const firstSched = allInterviews.find((i) => i.status === "scheduled");
                          clearCandidateFilters();
                          if (firstSched) {
                            const app = allApplications.find((a) => a.id === firstSched.applicationId);
                            if (app) {
                              setAppFilters({
                                min_score: "",
                                experience: "",
                                company: "",
                                recommendation: "",
                                status: app.application_status
                              });
                            }
                          } else {
                            setAppFilters({
                              min_score: "",
                              experience: "",
                              company: "",
                              recommendation: "",
                              status: ""
                            });
                          }
                          setSearchParams({ tab: "candidates" });
                        })}
                        onMouseEnter={(e) => handleOpenPopup('interviews', e)}
                        onMouseLeave={handleClosePopup}
                        onFocus={(e) => handleOpenPopup('interviews', e, true)}
                        onBlur={handleClosePopup}
                      >
                        <div className="screenai-metric-label">Scheduled Rounds</div>
                        <div className="screenai-metric-val">{upcomingInterviewsCount}</div>
                        <small className="text-muted">Upcoming interviews</small>
                      </div>
                    </div>

                    {/* Card 5: Placed Hires */}
                    <div className="col">
                      <div
                        className="screenai-card screenai-card-hover screenai-card-interactive h-100 text-start border-0"
                        style={{ borderLeft: "4px solid var(--screenai-success)", background: "var(--screenai-surface)" }}
                        tabIndex="0"
                        aria-label={`Placed Hires: ${hiredAppsCount} placements total. Focus or hover to preview placed hires list. Click to open hired candidates details.`}
                        onClick={() => openCandidatesWithStatus("hired")}
                        onKeyDown={(e) => handleKeyDown(e, () => openCandidatesWithStatus("hired"))}
                        onMouseEnter={(e) => handleOpenPopup('placed_hires', e)}
                        onMouseLeave={handleClosePopup}
                        onFocus={(e) => handleOpenPopup('placed_hires', e, true)}
                        onBlur={handleClosePopup}
                      >
                        <div className="screenai-metric-label">Placed Hires</div>
                        <div className="screenai-metric-val">{hiredAppsCount}</div>
                        <small className="text-muted">Total placements</small>
                      </div>
                    </div>
                  </div>

                  {/* Reusable Popper */}
                  <Popper
                    open={activePopup.cardName !== null}
                    anchorEl={activePopup.anchorEl}
                    placement="bottom-start"
                    style={{ zIndex: 1300 }}
                    modifiers={[
                      {
                        name: 'preventOverflow',
                        options: {
                          boundary: 'viewport',
                        },
                      },
                    ]}
                  >
                    {activePopup.cardName && (
                      <ClickAwayListener onClickAway={() => setActivePopup({ cardName: null, anchorEl: null })}>
                        <Paper
                          elevation={3}
                          onMouseEnter={handleMouseEnterPopup}
                          onMouseLeave={handleClosePopup}
                          onKeyDown={handlePopupKeyDown}
                          style={{
                            background: "var(--screenai-surface)",
                            border: "1px solid var(--screenai-border)",
                            color: "white",
                            minWidth: "250px",
                            maxHeight: "300px",
                            overflowY: "auto"
                          }}
                        >
                          <MenuList autoFocusItem={openedByKeyboard}>
                            {activePopup.cardName === "jobs" && (
                              <>
                                <MenuItem disabled style={{ opacity: 0.8, color: "var(--screenai-primary)", fontWeight: "bold" }}>
                                  Active Jobs Preview
                                </MenuItem>
                                {activeJobsPreview.length === 0 ? (
                                  <MenuItem disabled onClick={(e) => e.stopPropagation()}>No active jobs found</MenuItem>
                                ) : (
                                  activeJobsPreview.map((j) => (
                                    <MenuItem
                                      key={j.id}
                                      onPointerDown={handlePreviewJobPointerDown}
                                      onClick={(event) => handlePreviewJobSelect(event, j)}
                                      onFocus={handleMouseEnterPopup}
                                      onBlur={handleClosePopup}
                                    >
                                      {j.job_title} at {j.company_name}
                                    </MenuItem>
                                  ))
                                )}
                              </>
                            )}

                            {activePopup.cardName === "new_apps" && (
                              <>
                                <MenuItem disabled style={{ opacity: 0.8, color: "var(--screenai-text-muted)", fontWeight: "bold" }}>
                                  New Applications Preview
                                </MenuItem>
                                {newAppsPreview.length === 0 ? (
                                  <MenuItem disabled onClick={(e) => e.stopPropagation()}>No new applications found</MenuItem>
                                ) : (
                                  newAppsPreview.map((a) => (
                                    <MenuItem
                                      key={a.id}
                                      onPointerDown={handlePreviewApplicationPointerDown}
                                      onClick={(event) => handlePreviewApplicationSelect(event, a)}
                                      onFocus={handleMouseEnterPopup}
                                      onBlur={handleClosePopup}
                                    >
                                      {getCandidateName(a)} - {a.job_title}
                                    </MenuItem>
                                  ))
                                )}
                              </>
                            )}

                            {activePopup.cardName === "shortlisted" && (
                              <>
                                <MenuItem disabled style={{ opacity: 0.8, color: "var(--screenai-primary)", fontWeight: "bold" }}>
                                  Shortlisted Candidates
                                </MenuItem>
                                {shortlistedPreview.length === 0 ? (
                                  <MenuItem disabled onClick={(e) => e.stopPropagation()}>No shortlisted candidates found</MenuItem>
                                ) : (
                                  shortlistedPreview.map((a) => (
                                    <MenuItem
                                      key={a.id}
                                      onPointerDown={handlePreviewApplicationPointerDown}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openCandidatePreviewWorkspace(a, "decision");
                                      }}
                                      onFocus={handleMouseEnterPopup}
                                      onBlur={handleClosePopup}
                                    >
                                      {getCandidateName(a)} - {a.job_title}
                                    </MenuItem>
                                  ))
                                )}
                              </>
                            )}

                            {activePopup.cardName === "interviews" && (
                              <>
                                <MenuItem disabled style={{ opacity: 0.8, color: "var(--screenai-primary)", fontWeight: "bold" }}>
                                  Upcoming Interviews
                                </MenuItem>
                                {upcomingInterviewsPreview.length === 0 ? (
                                  <MenuItem disabled onClick={(e) => e.stopPropagation()}>No scheduled interviews found</MenuItem>
                                ) : (
                                  upcomingInterviewsPreview.map((i) => {
                                    const app = allApplications.find((a) => a.id === i.applicationId) || i.appObject;
                                    return (
                                      <MenuItem
                                        key={i.id}
                                        onPointerDown={handlePreviewApplicationPointerDown}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (app) {
                                            openCandidatePreviewWorkspace(app, "interviews");
                                          }
                                        }}
                                        onFocus={handleMouseEnterPopup}
                                        onBlur={handleClosePopup}
                                      >
                                        <div className="d-flex flex-column text-start">
                                          <span>{i.candidateName} - {i.round_name}</span>
                                          <small style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                                            {new Date(i.scheduled_at).toLocaleDateString()} at {new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </small>
                                        </div>
                                      </MenuItem>
                                    );
                                  })
                                )}
                              </>
                            )}

                            {activePopup.cardName === "placed_hires" && (
                              <>
                                <MenuItem disabled style={{ opacity: 0.8, color: "var(--screenai-success)", fontWeight: "bold" }}>
                                  Recent Placed Hires
                                </MenuItem>
                                {placedHiresPreview.length === 0 ? (
                                  <MenuItem disabled onClick={(e) => e.stopPropagation()}>No placed hires found</MenuItem>
                                ) : (
                                  placedHiresPreview.map((a) => (
                                    <MenuItem
                                      key={a.id}
                                      onPointerDown={handlePreviewApplicationPointerDown}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        openCandidatePreviewWorkspace(a, "progression");
                                      }}
                                      onFocus={handleMouseEnterPopup}
                                      onBlur={handleClosePopup}
                                    >
                                      {getCandidateName(a)} - {a.job_title}
                                    </MenuItem>
                                  ))
                                )}
                              </>
                            )}
                        </MenuList>
                      </Paper>
                    </ClickAwayListener>
                  )}
                </Popper>

                {/* Quick Actions Panel */}
                <div className="screenai-card mb-5">
                  <h5 className="fw-bold text-white mb-3">Quick Actions</h5>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <button onClick={() => setShowAddJobModal(true)} className="btn btn-primary w-100 py-3 fw-bold shadow-sm text-white">
                        Create Job Opening
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
                          handleTabChange("candidates");
                        }}
                        className="btn btn-outline-primary w-100 py-3 fw-bold shadow-sm"
                      >
                        Review New Applications
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
                          handleTabChange("candidates");
                        }}
                        className="btn btn-outline-primary w-100 py-3 fw-bold shadow-sm"
                      >
                        View Upcoming Interviews
                      </button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        )}

        {/* JOBS DIRECTORY TAB */}
        {activeTab === "jobs" && (() => {
          try {
            return (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div>
                    <h2 className="fw-bold text-white">Jobs Directory</h2>
                    <p className="text-secondary">Publish and govern all hiring positions and application links.</p>
                  </div>
                  <button onClick={() => setShowAddJobModal(true)} className="btn btn-primary px-4 fw-bold text-white">
                    Add New Job
                  </button>
                </div>

                {/* Filter counts using compact MUI chips */}
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span className="text-secondary small fw-bold">Status Count:</span>
                  <Chip
                    label={`All Jobs (${jobs.length})`}
                    onClick={() => setJobFilter("all")}
                    variant={jobFilter === "all" ? "filled" : "outlined"}
                    size="small"
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      color: jobFilter === "all" ? "#fff" : "#cbd5e1",
                      borderColor: "#475569",
                      backgroundColor: jobFilter === "all" ? "#6366f1" : "rgba(30, 41, 59, 0.5)",
                      "&:hover": {
                        backgroundColor: jobFilter === "all" ? "#4f46e5" : "rgba(255,255,255,0.08)"
                      }
                    }}
                  />
                  <Chip
                    label={`Open (${jobs.filter((j) => j.status === "open").length})`}
                    onClick={() => setJobFilter("open")}
                    variant={jobFilter === "open" ? "filled" : "outlined"}
                    size="small"
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      color: jobFilter === "open" ? "#fff" : "#cbd5e1",
                      borderColor: "#475569",
                      backgroundColor: jobFilter === "open" ? "#10b981" : "rgba(30, 41, 59, 0.5)",
                      "&:hover": {
                        backgroundColor: jobFilter === "open" ? "#059669" : "rgba(255,255,255,0.08)"
                      }
                    }}
                  />
                  <Chip
                    label={`Closed (${jobs.filter((j) => j.status === "closed").length})`}
                    onClick={() => setJobFilter("closed")}
                    variant={jobFilter === "closed" ? "filled" : "outlined"}
                    size="small"
                    sx={{
                      fontWeight: "bold",
                      cursor: "pointer",
                      color: jobFilter === "closed" ? "#fff" : "#cbd5e1",
                      borderColor: "#475569",
                      backgroundColor: jobFilter === "closed" ? "#ef4444" : "rgba(30, 41, 59, 0.5)",
                      "&:hover": {
                        backgroundColor: jobFilter === "closed" ? "#dc2626" : "rgba(255,255,255,0.08)"
                      }
                    }}
                  />
                </div>

                {/* Horizontal Search & Filter Row */}
                <div className="mb-3 border-bottom border-secondary pb-3">
                  <div className="row g-2 align-items-center">
                    {/* 1. Search */}
                    <div className="col-md-3">
                      <input
                        type="text"
                        className="form-control form-control-sm w-100"
                        placeholder="Search title/company..."
                        value={jobSearch}
                        onChange={(e) => handleJobSearchChange(e.target.value)}
                        style={{ fontSize: "11px" }}
                      />
                    </div>
                    {/* 2. Job Status Select */}
                    <div className="col-md-2">
                      <select
                        className="form-select form-select-sm w-100"
                        value={jobFilter}
                        onChange={(e) => handleJobFilterChange(e.target.value)}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="all">Status: All</option>
                        <option value="open">Status: Open</option>
                        <option value="closed">Status: Closed</option>
                      </select>
                    </div>
                    {/* 3. Application Status Select */}
                    <div className="col-md-2">
                      <select
                        className="form-select form-select-sm w-100"
                        value={jobAppStatus}
                        onChange={(e) => handleJobAppStatusChange(e.target.value)}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="all">Applications: All</option>
                        <option value="enabled">Applications: Enabled</option>
                        <option value="disabled">Applications: Disabled</option>
                      </select>
                    </div>
                    {/* 4. Deadline Select */}
                    <div className="col-md-2">
                      <select
                        className="form-select form-select-sm w-100"
                        value={jobDeadlineFilter}
                        onChange={(e) => handleJobDeadlineFilterChange(e.target.value)}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="all">Deadline: All</option>
                        <option value="active">Deadline: Active</option>
                        <option value="passed">Deadline: Passed</option>
                        <option value="none">Deadline: None</option>
                      </select>
                    </div>
                    {/* 5. Location Select */}
                    <div className="col-md-2">
                      <select
                        className="form-select form-select-sm w-100"
                        value={jobLocationFilter}
                        onChange={(e) => handleJobLocationFilterChange(e.target.value)}
                        style={{ fontSize: "11px" }}
                      >
                        <option value="all">Location: All</option>
                        {uniqueJobLocations.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                    {/* 6. Clear & Count */}
                    <div className="col-md-1 d-flex align-items-center justify-content-between gap-2">
                      <span className="text-secondary small" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                        Found <strong>{filteredJobs.length}</strong>
                      </span>
                      {(jobSearch || jobFilter !== "all" || jobAppStatus !== "all" || jobDeadlineFilter !== "all" || jobLocationFilter !== "all") && (
                        <button
                          onClick={handleClearFilters}
                          className="btn btn-link p-0 text-decoration-none small"
                          style={{ fontSize: "11px", color: "var(--screenai-primary)" }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                  </div>
                </div>

                {/* MUI X Data Grid Table */}
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <div style={{ minWidth: "900px", height: "auto", minHeight: "350px" }}>
                    <DataGrid
                      rows={filteredJobs}
                      columns={jobColumns}
                      pagination
                      paginationModel={jobPaginationModel}
                      onPaginationModelChange={setJobPaginationModel}
                      pageSizeOptions={[10, 25, 50]}
                      getRowId={(row) => row.id}
                      disableRowSelectionOnClick
                      onRowClick={(params) => setSelectedPreviewJob(params.row)}
                      onCellKeyDown={handleCellKeyDown}
                      autoHeight
                      slots={{
                        noRowsOverlay: JobsNoRowsOverlay,
                      }}
                      sx={{
                        backgroundColor: "#1e293b !important",
                        border: "1px solid #475569 !important",
                        "& .MuiDataGrid-cell": {
                          borderColor: "#475569 !important",
                          color: "#cbd5e1 !important",
                        },
                        "& .MuiDataGrid-columnHeaders": {
                          backgroundColor: "#334155 !important",
                          borderColor: "#475569 !important",
                        },
                        "& .MuiDataGrid-columnHeader": {
                          backgroundColor: "#334155 !important",
                          color: "#f8fafc !important",
                        },
                        "& .MuiDataGrid-columnHeaderTitle": {
                          fontWeight: "600 !important",
                        },
                        "& .MuiDataGrid-row:hover": {
                          backgroundColor: "rgba(99, 102, 241, 0.12) !important",
                        },
                        "& .MuiDataGrid-row.Mui-selected": {
                          backgroundColor: "rgba(99, 102, 241, 0.25) !important",
                        },
                        "& .MuiDataGrid-row.Mui-selected:hover": {
                          backgroundColor: "rgba(99, 102, 241, 0.3) !important",
                        },
                        "& .MuiTablePagination-root": {
                          color: "#cbd5e1 !important",
                        },
                        "& .MuiIconButton-root": {
                          color: "#cbd5e1 !important",
                        },
                        "& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus": {
                          outline: "1px solid #6366f1 !important",
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          } catch (e) {
            console.error("Jobs render crash:", e);
            return (
              <div className="alert alert-danger my-4 p-4 text-center bg-dark border-secondary text-white">
                <h4 className="fw-bold text-danger">Unable to load jobs directory</h4>
                <p>Please refresh the page or try again.</p>
              </div>
            );
          }
        })()}


        {/* CANDIDATES & APPLICATIONS TAB */}
        {activeTab === "candidates" && (() => {
          try {
            const seenIds = new Set();
            const candidateRows = Array.isArray(filteredApplications)
              ? filteredApplications.map((app) => {
                  if (!app || typeof app !== "object") return null;
                  const rawId = app.id ?? Math.random().toString();
                  const rowId = seenIds.has(rawId) ? `${rawId}_${Math.random()}` : rawId;
                  seenIds.add(rowId);
                  return {
                    ...app,
                    id: rowId,
                    candidateName: getCandidateName(app),
                    jobRole: app.job_title || "Not specified",
                    email: app.candidate_email || "Not provided",
                    phone: app.candidate_phone || "Not provided",
                    experience: app.total_experience_years || 0,
                    aiScore: app.ai_score ?? "Pending",
                    status: app.application_status || "pending",
                    appliedDate: app.submitted_at || null,
                    raw: app,
                  };
                }).filter(Boolean)
              : [];

            return (
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
                    value={selectedJobId}
                    onChange={(e) => {
                      const newJobId = e.target.value ? String(e.target.value) : "";
                      // eslint-disable-next-line react-hooks/refs
                      closeCandidateWorkspace();
                      setSearchParams((prev) => {
                        if (newJobId) {
                          prev.set("jobId", newJobId);
                        } else {
                          prev.delete("jobId");
                        }
                        return prev;
                      });
                    }}
                  >
                    <option value="">All Jobs (View All Candidates)</option>
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
                          <span className={`badge ${activeJobObj.status === "open" ? "bg-success" : "bg-danger"}`}>
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
                          {copiedJobToken === activeJobObj.application_token ? "Copied" : "Copy Public Link"}
                        </button>

                        {/* Toggle public form */}
                        <button
                          onClick={() => toggleApplicationForm(activeJobObj)}
                          disabled={togglingJobFormId === activeJobObj.id}
                          className={`btn btn-sm ${activeJobObj.application_form_enabled ? "btn-outline-success" : "btn-outline-secondary"}`}
                        >
                          {activeJobObj.application_form_enabled ? "Form Enabled" : "Form Disabled"}
                        </button>

                        {/* Edit Job */}
                        <button
                          onClick={() => handleOpenEditJob(activeJobObj)}
                          className="btn btn-sm btn-outline-primary"
                        >
                          Edit
                        </button>

                        {/* Close / Reopen Job */}
                        {activeJobObj.status === "open" ? (
                          <button
                            onClick={() => updateJobStatus(activeJobObj, "closed")}
                            className="btn btn-sm btn-outline-danger"
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

            {/* Unified Applications Explorer */}
            <div style={{ height: "auto", minHeight: "550px", display: "flex", flexDirection: "column", width: "100%" }}>
              <div 
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column"
                }}
              >
                {/* Horizontal Search & Filter Row */}
                <div className="mb-3 border-bottom border-secondary pb-3">
                  <div className="row g-2 align-items-center">
                    <div className="col-md-2">
                      <input
                        type="text"
                        className="form-control form-control-sm w-100"
                        placeholder="Search candidate..."
                        value={appSearch}
                        onChange={(e) => setAppSearch(e.target.value)}
                        style={{ fontSize: "11px" }}
                      />
                    </div>
                    <div className="col-md-2">
                      <input
                        type="text"
                        className="form-control form-control-sm w-100"
                        placeholder="Worked company..."
                        value={appFilters.company}
                        onChange={(e) => setAppFilters({ ...appFilters, company: e.target.value })}
                        style={{ fontSize: "11px" }}
                      />
                    </div>
                    <div className="col-md-2">
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
                    <div className="col-md-2">
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
                    <div className="col-md-2">
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
                    <div className="col-md-2 d-flex align-items-center justify-content-between gap-2">
                      <span className="text-secondary small" style={{ fontSize: "11px", whiteSpace: "nowrap" }}>
                        Found <strong>{filteredApplications.length}</strong>
                      </span>
                      {Boolean(appSearch || selectedJobId || appFilters.min_score || appFilters.status || appFilters.experience || appFilters.company) && (
                        <button
                          onClick={handleClearAllCandidateFilters}
                          className="btn btn-link p-0 text-decoration-none small"
                          style={{ fontSize: "11px", color: "var(--screenai-primary)" }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* MUI X Data Grid Table */}
                <div style={{ flex: 1, width: "100%", minHeight: "450px" }}>
                  {candidateRows.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 border border-secondary rounded p-5 bg-dark text-secondary">
                      <p className="fs-5 mb-0">No candidates found</p>
                    </div>
                  ) : (
                    <DataGrid
                      rows={candidateRows}
                      columns={candidateColumns}
                      paginationModel={paginationModel}
                      onPaginationModelChange={setPaginationModel}
                      pageSizeOptions={[5, 10, 20]}
                      getRowId={(row) => row.id}
                      disableRowSelectionOnClick
                      getRowClassName={(params) => String(params.row?.raw?.id || params.row?.id) === String(activeWorkspaceAppId) ? "screenai-selected-row" : ""}
                      onRowClick={(params) => {
                        handleSelectApplication(params.row?.raw || params.row);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      } catch (e) {
        console.error("Candidates render crash:", e);
        return (
          <div className="alert alert-danger my-4 p-4 text-center bg-dark border-secondary text-white">
            <h4 className="fw-bold text-danger">Unable to load candidates</h4>
            <p>Please refresh the page or try again.</p>
          </div>
        );
      }
    })()}

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
                        Edit Profile
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
                  Submit Evaluations
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
                <button type="submit" className="btn btn-primary fw-bold flex-fill">
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
            <div className="d-flex align-items-center gap-2 mb-3 border-bottom border-secondary pb-3" style={{ color: "var(--screenai-text-muted)" }}>
              <h4 className="fw-bold mb-0 text-white">Pending Requirements Audit</h4>
            </div>

            <p className="text-secondary small mb-4">
              Hiring requirements have not been completed for candidate{" "}
              <strong className="text-white">{getCandidateName(activeWorkspaceApp)}</strong>. Please review the
              following pending audits before proceeding:
            </p>

            <ul className="list-group list-group-flush bg-transparent border-0 mb-4 text-start small">
              {hireWarningReasons.map((reason, index) => (
                <li
                  key={index}
                  className="list-group-item bg-transparent border-0 px-0 d-flex gap-2 align-items-start"
                  style={{ color: "var(--screenai-text-muted)" }}
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

      {/* --- JOB DETAILS PREVIEW DIALOG --- */}
      <Dialog
        open={activePreviewJobData !== null && !showEditJobModal}
        onClose={() => setSelectedPreviewJob(null)}
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#1e293b !important",
              backgroundImage: "none !important",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "12px",
              padding: "16px",
              height: "auto",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        {activePreviewJobData && (
          <>
            <DialogTitle style={{ borderBottom: "1px solid #475569", paddingBottom: "12px", color: "#f8fafc", backgroundColor: "transparent", flexShrink: 0 }}>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="fw-bold mb-1 fs-4" style={{ color: "#f8fafc" }}>{activePreviewJobData.job_title}</h3>
                  <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{activePreviewJobData.company_name}</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span
                    style={
                      activePreviewJobData.status === "open"
                        ? { backgroundColor: "rgba(16, 185, 129, 0.2)", color: "#10b981", border: "1px solid #10b981", padding: "4px 10px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: "bold" }
                        : { backgroundColor: "rgba(148, 163, 184, 0.2)", color: "#cbd5e1", border: "1px solid #475569", padding: "4px 10px", borderRadius: "4px", fontSize: "0.8rem", fontWeight: "bold" }
                    }
                  >
                    {activePreviewJobData.status.toUpperCase()}
                  </span>
                  <button
                    onClick={() => setSelectedPreviewJob(null)}
                    className="btn-close btn-close-white ms-2"
                    aria-label="Close job details"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
              </div>
            </DialogTitle>

            <DialogContent 
              style={{ 
                color: "#f8fafc", 
                paddingTop: "16px", 
                paddingBottom: "4px", 
                backgroundColor: "transparent", 
                minHeight: 0,
                flex: "0 1 auto",
                overflowY: "auto" 
              }}
            >
              {/* Full-width Job Facts Card */}
              <div className="mb-3" style={{ backgroundColor: "#0f172a", padding: "16px", borderRadius: "8px", border: "1px solid #475569" }}>
                <div 
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "16px"
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>Location</strong>
                    <span className="text-truncate d-block" style={{ color: "#cbd5e1", fontSize: "0.85rem" }} title={activePreviewJobData.location || "Remote"}>
                      {activePreviewJobData.location || "Remote"}
                    </span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>Experience Required</strong>
                    <span className="text-truncate d-block" style={{ color: "#cbd5e1", fontSize: "0.85rem" }} title={activePreviewJobData.required_experience || "Any experience"}>
                      {activePreviewJobData.required_experience || "Any experience"}
                    </span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>Applicant Count</strong>
                    <div>
                      <span
                        style={{
                          backgroundColor: "rgba(148, 163, 184, 0.15)",
                          color: "var(--screenai-text-muted)",
                          border: "1px solid var(--screenai-border)",
                          padding: "2px 6px",
                          fontWeight: "bold",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          display: "inline-block",
                        }}
                      >
                        {activePreviewJobData.applicant_count ?? 0} Candidate(s)
                      </span>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>Submission Status</strong>
                    <div>
                      {activePreviewJobData.status === "open" ? (
                        activePreviewJobData.application_form_enabled && !activePreviewJobDeadlinePassed ? (
                          <span
                            style={{
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              border: "1px solid #10b981",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: "600",
                              fontSize: "0.75rem",
                              display: "inline-block",
                            }}
                          >
                            Accepting Submissions
                          </span>
                        ) : (
                          <span
                            style={{
                              backgroundColor: "rgba(148, 163, 184, 0.15)",
                              color: "var(--screenai-text-muted)",
                              border: "1px solid var(--screenai-border)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: "600",
                              fontSize: "0.75rem",
                              display: "inline-block",
                            }}
                          >
                            Applications Disabled
                          </span>
                        )
                      ) : (
                        <span
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.15)",
                            color: "#ef4444",
                            border: "1px solid #ef4444",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: "600",
                            fontSize: "0.75rem",
                            display: "inline-block",
                          }}
                        >
                          Position Closed
                        </span>
                      )}
                    </div>
                  </div>

                  {activePreviewJobData.application_deadline && (
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "2px" }}>Application Deadline</strong>
                      <span className="text-truncate d-block" style={{ fontSize: "0.85rem", fontWeight: "600", color: activePreviewJobDeadlinePassed ? "var(--screenai-danger)" : "var(--screenai-text-muted)" }} title={new Date(activePreviewJobData.application_deadline).toLocaleString()}>
                        {new Date(activePreviewJobData.application_deadline).toLocaleString()}
                        {activePreviewJobDeadlinePassed && " (Passed)"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Role Details Row */}
              <div className="row g-3 align-items-start mb-3">
                {/* Left side — Required Skills */}
                <div className="col-md-4 col-12" style={{ minWidth: 0 }}>
                  <h5 className="fw-bold mb-2" style={{ color: "#6366f1", textTransform: "uppercase", fontSize: "0.8rem", fontWeight: "bold", letterSpacing: "1px" }}>
                    Required Skills
                  </h5>
                  <div className="d-flex flex-wrap gap-2">
                    {activePreviewJobData.required_skills ? (
                      activePreviewJobData.required_skills
                        .split(",")
                        .map((skill, index) => (
                          <span
                            key={index}
                            style={{
                              backgroundColor: "#334155",
                              color: "#f8fafc",
                              border: "1px solid #475569",
                              padding: "4px 10px",
                              borderRadius: "50px",
                              fontSize: "0.75rem",
                            }}
                          >
                            {skill.trim()}
                          </span>
                        ))
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No specific skills listed</span>
                    )}
                  </div>
                </div>

                {/* Right side — Job Description */}
                <div className="col-md-8 col-12" style={{ minWidth: 0 }}>
                  <h5 className="fw-bold mb-2" style={{ color: "#6366f1", textTransform: "uppercase", fontSize: "0.8rem", fontWeight: "bold", letterSpacing: "1px" }}>
                    Job Description
                  </h5>
                  <p
                    style={{
                      whiteSpace: "pre-line",
                      maxHeight: "220px",
                      overflowY: "auto",
                      color: "#cbd5e1",
                      fontSize: "0.9rem",
                      lineHeight: "1.5",
                      margin: 0,
                      paddingRight: "4px",
                      wordBreak: "break-word"
                    }}
                  >
                    {activePreviewJobData.job_description || "No description provided."}
                  </p>
                </div>
              </div>

              {/* Public Application Link Row */}
              <div className="border-top pt-3" style={{ borderColor: "#475569" }}>
                <strong style={{ color: "#94a3b8", display: "block", fontSize: "0.75rem", fontWeight: "bold", marginBottom: "6px" }}>Public Application Link</strong>
                {activePreviewJobData.application_token && activePreviewJobData.application_form_enabled && activePreviewJobData.status === "open" && !activePreviewJobDeadlinePassed ? (
                  <div className="input-group">
                    <input
                      type="text"
                      readOnly
                      value={activePreviewJobShareLink}
                      className="form-control form-control-sm text-white"
                      style={{ backgroundColor: "#1e293b", border: "1px solid #475569", color: "#f8fafc", fontSize: "0.8rem" }}
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => copyApplicationLink(activePreviewJobData.application_token)}
                      className="btn btn-sm btn-outline-secondary text-nowrap fw-bold"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: "0.8rem", fontStyle: "italic" }}>
                    Unavailable (
                    {!activePreviewJobData.application_token
                      ? "No token generated"
                      : !activePreviewJobData.application_form_enabled
                      ? "Submissions disabled"
                      : activePreviewJobData.status !== "open"
                      ? "Job closed"
                      : "Deadline passed"}
                    )
                  </div>
                )}
              </div>
            </DialogContent>

            <DialogActions 
              style={{ 
                borderTop: "1px solid #475569", 
                paddingTop: "12px", 
                marginTop: "4px", 
                backgroundColor: "transparent", 
                flexShrink: 0 
              }} 
              className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100"
            >
              {/* Left/Middle Action Groups (Primary and Management) */}
              <div className="d-flex flex-wrap align-items-center gap-3">
                {/* Primary Group */}
                <div className="d-flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedPreviewJob(null);
                      openCandidatesForJob(activePreviewJobData.id);
                    }}
                    className="btn btn-primary btn-sm fw-bold text-white px-3"
                  >
                    View Candidates
                  </button>

                  <button
                    onClick={() => handleOpenEditJob(activePreviewJobData)}
                    className="btn btn-outline-primary btn-sm fw-bold px-3"
                  >
                    Edit Job
                  </button>
                </div>

                {/* Divider (Hidden on stack/wrap) */}
                <div className="d-none d-sm-block border-start border-secondary mx-1" style={{ height: "24px" }} />

                {/* Management Group */}
                <div className="d-flex gap-2">
                  <button
                    onClick={() => toggleApplicationForm(activePreviewJobData)}
                    disabled={togglingJobFormId === activePreviewJobData.id}
                    className="btn btn-outline-primary btn-sm fw-bold"
                  >
                    {activePreviewJobData.application_form_enabled ? "Disable Form" : "Enable Form"}
                  </button>

                  <button
                    onClick={() =>
                      updateJobStatus(
                        activePreviewJobData,
                        activePreviewJobData.status === "open" ? "closed" : "open"
                      )
                    }
                    className={`btn btn-sm fw-bold ${activePreviewJobData.status === "open" ? "btn-outline-danger" : "btn-outline-success"}`}
                  >
                    {activePreviewJobData.status === "open" ? "Close Job" : "Reopen Job"}
                  </button>
                </div>
              </div>

              {/* Destructive Group (Delete Job) */}
              <div className="ms-auto ms-sm-0">
                <button
                  onClick={() => deleteJob(activePreviewJobData)}
                  disabled={activePreviewJobHasApps}
                  className="btn btn-danger btn-sm fw-bold"
                  title={activePreviewJobHasApps ? "Cannot delete job with applications" : "Delete Job Posting"}
                >
                  Delete Job
                </button>
              </div>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* --- CANDIDATE DETAILS PREVIEW DIALOG (WORKSPACE MODAL) --- */}
      <Dialog
        open={activeWorkspaceApp !== null}
        onClose={closeCandidateWorkspace}
        maxWidth="xl"
        fullWidth
        fullScreen={isMobile}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#1e293b !important",
              backgroundImage: "none !important",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "12px",
              padding: "16px",
              height: "94vh",
              maxHeight: "94vh",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        {activeWorkspaceApp && (
          <>
            <DialogTitle style={{ borderBottom: "1px solid #475569", paddingBottom: "12px", color: "#f8fafc", backgroundColor: "transparent", position: "relative", flexShrink: 0 }}>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 pe-5">
                <div>
                  <h3 className="fw-bold mb-1 fs-4" style={{ color: "#f8fafc" }}>
                    {getCandidateName(activeWorkspaceApp)}
                  </h3>
                  <span style={{ color: "#cbd5e1", fontSize: "0.95rem" }}>
                    Applied for: <strong style={{ color: "#6366f1" }}>{activeWorkspaceApp.job_title}</strong> at {activeWorkspaceApp.company_name}
                  </span>
                </div>
                <span
                  style={{
                    ...getStatusBadgeStyle(activeWorkspaceApp.application_status),
                    padding: "6px 12px",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                  }}
                >
                  {activeWorkspaceApp.application_status.toUpperCase()}
                </span>
              </div>
              <IconButton
                aria-label="Close candidate workspace"
                onClick={closeCandidateWorkspace}
                sx={{
                  position: "absolute",
                  right: 8,
                  top: 8,
                  color: "#94a3b8",
                  "&:hover": {
                    color: "#f8fafc",
                  },
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </IconButton>
            </DialogTitle>

            <DialogContent 
              style={{ 
                color: "#f8fafc", 
                padding: "24px 16px", 
                backgroundColor: "transparent", 
                overflowY: "auto",
                flex: 1
              }}
            >
              <CandidateWorkspaceContent
                key={`${activeWorkspaceApp.id}:${activeWorkspaceSection}`}
                application={activeWorkspaceApp}
                interviews={interviews}
                loadingInterviews={loadingInterviews}
                showToast={showToast}
                onApplicationUpdate={handleApplicationUpdate}
                fetchDashboardData={fetchDashboardData}
                setShowScheduleModal={setShowScheduleModal}
                handleCompleteClick={handleCompleteClick}
                handleRescheduleClick={handleRescheduleClick}
                handleCancelInterview={handleCancelInterview}
                handleStatusChangeRequest={handleStatusChangeRequest}
                getResumeUrl={getResumeUrl}
                hasScoreContent={hasScoreContent}
                renderScoreBreakdownGrid={renderScoreBreakdownGrid}
                hasDetailedContent={hasDetailedContent}
                renderDetailedEvaluationContent={renderDetailedEvaluationContent}
                initialSection={activeWorkspaceSection}
              />
            </DialogContent>

            <DialogActions style={{ borderTop: "1px solid #475569", paddingTop: "16px", marginTop: "12px", backgroundColor: "transparent", flexShrink: 0 }} className="d-flex justify-content-between flex-wrap gap-2">
              <div className="d-flex gap-2">
                {activeWorkspaceApp.resume && (
                  <a
                    href={getResumeUrl(activeWorkspaceApp.resume)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline-secondary fw-bold px-3 py-2 text-decoration-none d-flex align-items-center justify-content-center"
                  >
                    Open Resume
                  </a>
                )}
              </div>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* --- SHARED JOBS ACTION MENU --- */}
      <Menu
        anchorEl={jobMenuAnchor.anchorEl}
        open={Boolean(jobMenuAnchor.anchorEl)}
        onClose={() => setJobMenuAnchor({ anchorEl: null, job: null })}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: {
            backgroundColor: "#1e293b",
            border: "1px solid #475569",
            color: "#f8fafc",
            "& .MuiMenuItem-root:hover": {
              backgroundColor: "#334155",
            },
            "& .MuiMenuItem-root.Mui-disabled": {
              opacity: 0.5,
              color: "#94a3b8",
            },
          },
        }}
      >
        {jobMenuAnchor.job && (() => {
          const job = jobMenuAnchor.job;
          const hasApps = (job.applicant_count ?? 0) > 0;
          const deadlinePassed = job.application_deadline && new Date(job.application_deadline) < new Date();
          const showCopyLink = job.application_token && job.application_form_enabled && job.status === "open" && !deadlinePassed;
          let explanation = "";
          if (!job.application_token) explanation = " (No Link Available)";
          else if (!job.application_form_enabled) explanation = " (Submissions Disabled)";
          else if (job.status !== "open") explanation = " (Position Closed)";
          else if (deadlinePassed) explanation = " (Deadline Passed)";

          return [
            <MenuItem
              key="view-details"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPreviewJob(job);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
            >
              View Details
            </MenuItem>,
            <MenuItem
              key="view-candidates"
              onClick={(e) => {
                e.stopPropagation();
                openCandidatesForJob(job.id);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
            >
              View Candidates
            </MenuItem>,
            <MenuItem
              key="edit-job"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEditJob(job);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
            >
              Edit Job
            </MenuItem>,
            <MenuItem
              key="copy-link"
              disabled={!showCopyLink}
              onClick={(e) => {
                e.stopPropagation();
                copyApplicationLink(job.application_token);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
              title={!showCopyLink ? `Copy Link Unavailable${explanation}` : "Copy public application URL"}
            >
              Copy Application Link
            </MenuItem>,
            <MenuItem
              key="toggle-apps"
              disabled={togglingJobFormId === job.id}
              onClick={(e) => {
                e.stopPropagation();
                toggleApplicationForm(job);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
            >
              {job.application_form_enabled ? "Disable Applications" : "Enable Applications"}
            </MenuItem>,
            <MenuItem
              key="toggle-status"
              onClick={(e) => {
                e.stopPropagation();
                updateJobStatus(job, job.status === "open" ? "closed" : "open");
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
            >
              {job.status === "open" ? "Close Job" : "Reopen Job"}
            </MenuItem>,
            <div key="divider" className="dropdown-divider border-secondary my-1" />,
            <MenuItem
              key="delete-job"
              disabled={hasApps}
              onClick={(e) => {
                e.stopPropagation();
                deleteJob(job);
                setJobMenuAnchor({ anchorEl: null, job: null });
              }}
              className="text-danger"
              title={hasApps ? "Cannot delete job with applications" : "Delete Job"}
            >
              Delete Job
            </MenuItem>
          ];
        })()}
      </Menu>

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