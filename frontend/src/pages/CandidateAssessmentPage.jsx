import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  getAssessmentAccess,
  submitAssessment,
  saveAnswers,
  runCode,
  runTestCases,
} from "../api/assessments";
import ProblemPanel from "./assessment/ProblemPanel";
import TestCasesPanel from "./assessment/TestCasesPanel";
import SubmittedAssessmentPage from "../components/assessments/SubmittedAssessmentPage";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const SUPPORTED_LANGUAGES = [
  { value: "python", label: "Python 3", monacoLang: "python" },
  { value: "javascript", label: "JavaScript (Node)", monacoLang: "javascript" },
];

const AUTO_SAVE_DEBOUNCE_MS = 1200; // 1.2 seconds after last keystroke

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function formatCountdown(diffMs) {
  if (diffMs <= 0) return "00:00:00";
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Returns starter code for a given question + language
function getStarterCode(question, language) {
  if (!question) return "";
  // Prefer structured per-language starter code
  if (question.starter_code_per_language && question.starter_code_per_language[language]) {
    return question.starter_code_per_language[language];
  }
  // Fall back to legacy single-language starter_code if language matches
  if (question.starter_code) return question.starter_code;
  return "";
}

// ──────────────────────────────────────────────────────────────────────────────
// AutoSave status indicator
// ──────────────────────────────────────────────────────────────────────────────
function AutoSaveStatus({ status }) {
  const styles = {
    saving: { color: "#94a3b8", icon: "⏳" },
    saved: { color: "#10b981", icon: "✓" },
    failed: { color: "#f05d5e", icon: "✗" },
    idle: { color: "transparent", icon: "" },
  };
  const s = styles[status] || styles.idle;
  if (status === "idle") return null;
  return (
    <span style={{ color: s.color, fontSize: "12px", fontWeight: 600, transition: "opacity 0.3s" }}>
      {s.icon} {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed"}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Run Output Panel (legacy free-run code output, kept for backward compat)
// ──────────────────────────────────────────────────────────────────────────────
function RunOutputPanel({ result, running }) {
  if (!result && !running) return null;

  if (running) {
    return (
      <div
        className="p-3 rounded border"
        style={{
          backgroundColor: "#050a12",
          borderColor: "#1e293b",
          fontFamily: "monospace",
          fontSize: "13px",
        }}
      >
        <div className="d-flex align-items-center gap-2 text-secondary">
          <span
            className="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"
          />
          Running code in sandbox…
        </div>
      </div>
    );
  }

  const hasStdout = result.stdout && result.stdout.trim().length > 0;
  const hasStderr = result.stderr && result.stderr.trim().length > 0;
  const isOk = result.exit_code === 0 && !result.is_timeout;
  const isTimeout = result.is_timeout;
  const isError = result.exit_code !== 0 && !result.is_timeout;
  const sandboxUnavailable = result.error;

  let borderColor = "#334155";
  let headerColor = "var(--screenai-text-secondary)";
  let label = "Run Result";
  if (sandboxUnavailable) { borderColor = "#7c3aed"; headerColor = "#7c3aed"; label = "Sandbox Unavailable"; }
  else if (isTimeout) { borderColor = "#f59e0b"; headerColor = "#f59e0b"; label = "Execution Timeout"; }
  else if (isError) { borderColor = "#f05d5e"; headerColor = "#f05d5e"; label = `Runtime Error (exit ${result.exit_code})`; }
  else if (isOk) { borderColor = "#10b981"; headerColor = "#10b981"; label = `Run Complete (${result.duration_seconds}s)`; }

  return (
    <div
      className="rounded border"
      style={{ backgroundColor: "#050a12", borderColor, fontSize: "13px" }}
    >
      <div
        className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
        style={{ borderColor, fontFamily: "monospace" }}
      >
        <span style={{ color: headerColor, fontWeight: 700, fontSize: "11px", textTransform: "uppercase" }}>
          {label}
        </span>
        <span className="text-muted" style={{ fontSize: "11px" }}>
          {result.duration_seconds != null ? `${result.duration_seconds}s` : ""}
        </span>
      </div>

      {sandboxUnavailable ? (
        <div className="px-3 py-3 text-warning" style={{ fontFamily: "monospace" }}>
          {result.error}
        </div>
      ) : (
        <div className="px-3 py-3">
          <div
            className="rounded border px-3 py-2 mb-3"
            style={{
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              borderColor: "rgba(99, 102, 241, 0.25)",
            }}
          >
            <div
              className="fw-bold mb-1"
              style={{ color: "var(--screenai-primary)", fontSize: "11px", textTransform: "uppercase" }}
            >
              Run Summary
            </div>
            <div className="small text-secondary">
              {isOk && !hasStdout && !hasStderr
                ? "Your code ran successfully, but it did not print anything."
                : isOk
                ? "Your code ran successfully."
                : isTimeout
                ? "Your code took too long to finish."
                : "Your code stopped with an error."}
            </div>
          </div>

          <div className="mb-3" style={{ fontFamily: "monospace" }}>
            <div className="text-muted mb-1" style={{ fontSize: "10px", textTransform: "uppercase" }}>
              Console Output
            </div>
            <div
              className="rounded border p-3"
              style={{
                borderColor: "rgba(148, 163, 184, 0.15)",
                backgroundColor: "#020617",
                minHeight: "82px",
              }}
            >
              {hasStdout ? (
                <pre
                  style={{
                    color: "#a6e22e",
                    background: "transparent",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "220px",
                    overflowY: "auto",
                  }}
                >
                  {result.stdout}
                </pre>
              ) : (
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  Nothing was printed. If you want to inspect a value, add{" "}
                  <span style={{ color: "#f8fafc" }}>print(...)</span> in your code and run again.
                </div>
              )}
            </div>
          </div>

          <div style={{ fontFamily: "monospace" }}>
            <div className="text-muted mb-1" style={{ fontSize: "10px", textTransform: "uppercase" }}>
              Errors
            </div>
            <div
              className="rounded border p-3"
              style={{
                borderColor: hasStderr ? "rgba(240, 93, 94, 0.3)" : "rgba(148, 163, 184, 0.15)",
                backgroundColor: "#020617",
                minHeight: "82px",
              }}
            >
              {hasStderr ? (
                <pre
                  style={{
                    color: "#f05d5e",
                    background: "transparent",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "220px",
                    overflowY: "auto",
                  }}
                >
                  {result.stderr}
                </pre>
              ) : (
                <div className="text-muted" style={{ fontSize: "12px" }}>
                  No errors were reported in this run.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────────────
export default function CandidateAssessmentPage() {
  const { token } = useParams();
  return <CandidateAssessmentPageContent key={token} token={token} />;
}

function CandidateAssessmentPageContent({ token }) {
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // answers: {questionId: {code: string, language: string}}
  const [answers, setAnswers] = useState({});
  const [activeQuestionId, setActiveQuestionId] = useState("");

  // Language per question (derived from answers, but tracked separately for UX)
  // selectedLanguages: {questionId: "python"|"javascript"}
  const [selectedLanguages, setSelectedLanguages] = useState({});

  // Auto-save
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "failed"
  const autoSaveTimer = useRef(null);
  const pendingSaveRef = useRef(null); // latest answers to flush

  // Timers
  const [sessionTimeLeft, setSessionTimeLeft] = useState("");
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Run Code (legacy free-run)
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);

  // Run Tests (structured test cases)
  const [testResults, setTestResults] = useState(null);
  const [runningTests, setRunningTests] = useState(false);

  // Test cases panel state
  const [testPanelTab, setTestPanelTab] = useState("testcase"); // "testcase" | "result"
  const [selectedTestCaseIndex, setSelectedTestCaseIndex] = useState(0);

  // Track previous question for clearing run output
  const prevQuestionId = useRef("");

  const activeQuestionIdRef = useRef("");
  useEffect(() => {
    activeQuestionIdRef.current = activeQuestionId;
  }, [activeQuestionId]);

  const resetWorkspaceState = () => {
    setAssessment(null);
    setAnswers({});
    setActiveQuestionId("");
    setSelectedLanguages({});
    setRunResult(null);
    setTestResults(null);
    setTestPanelTab("testcase");
    setSelectedTestCaseIndex(0);
  };

  // ── Data Fetching ──────────────────────────────────────────────────────────
  const fetchAssessmentData = useCallback(async (showLoading = true, forceSetQuestion = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getAssessmentAccess(token);
      setAssessment(data);

      const normalized = {};
      const langs = {};
      if (data.answers) {
        // New format: {questionId: {code, language}}
        // Legacy format: {questionId: string}
        Object.entries(data.answers).forEach(([qId, val]) => {
          if (typeof val === "string") {
            normalized[qId] = { code: val, language: "python" };
            langs[qId] = "python";
          } else {
            normalized[qId] = val;
            langs[qId] = val.language || "python";
          }
        });
      }
      if (data.questions) {
        data.questions.forEach((q) => {
          if (!normalized[q.id]) {
            const defaultLang = q.language || "python";
            const code = getStarterCode(q, defaultLang);
            normalized[q.id] = { code: code, language: defaultLang };
            langs[q.id] = defaultLang;
          }
        });
      }
      setAnswers(normalized);
      setSelectedLanguages(langs);

      if (data.questions && data.questions.length > 0 && (forceSetQuestion || !activeQuestionIdRef.current)) {
        setActiveQuestionId(data.questions[0].id);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      const resp = err.response?.data;
      setError({
        code: resp?.code || "unknown_error",
        detail: resp?.detail || "An error occurred while loading the assessment workspace.",
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAssessmentData(true, true);
  }, [fetchAssessmentData]);

  // ── Timers ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sessionEnd = assessment?.session_end_at;
    if (!sessionEnd) return;
    const tick = () => {
      const diff = new Date(sessionEnd) - new Date();
      if (diff <= 0) {
        setSessionTimeLeft("00:00:00");
        setSessionExpired(true);
      } else {
        setSessionTimeLeft(formatCountdown(diff));
        setSessionExpired(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [assessment?.session_end_at]);

  useEffect(() => {
    const deadline = assessment?.assessment_deadline;
    if (!deadline) return;
    const tick = () => {
      const diff = new Date(deadline) - new Date();
      setDeadlinePassed(diff <= 0);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [assessment?.assessment_deadline]);

  // ── Locking ────────────────────────────────────────────────────────────────
  const terminalStatuses = ["submitted", "graded", "evaluating", "queued", "failed", "expired", "cancelled"];
  const isStatusLocked = assessment ? terminalStatuses.includes(assessment.status) : false;
  const isEditorLocked = isStatusLocked || sessionExpired || deadlinePassed;
  const isSubmitLocked = isStatusLocked || deadlinePassed;

  // ── Auto-save logic ────────────────────────────────────────────────────────
  const flushSave = useCallback(async (answersToSave) => {
    if (!answersToSave || Object.keys(answersToSave).length === 0) return;
    setAutoSaveStatus("saving");
    try {
      await saveAnswers(token, answersToSave);
      setAutoSaveStatus("saved");
      // Clear "saved" indicator after 2s
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("[AutoSave] Failed:", err);
      setAutoSaveStatus("failed");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, [token]);

  const scheduleAutoSave = useCallback((latestAnswers) => {
    if (isEditorLocked) return;
    pendingSaveRef.current = latestAnswers;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        flushSave(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [isEditorLocked, flushSave]);

  // Flush pending save on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (pendingSaveRef.current && !isEditorLocked) {
        // Best-effort sync send (may be blocked by browser)
        const payload = JSON.stringify({ answers: pendingSaveRef.current });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(`/api/assessments/access/${token}/save-answers/`, blob);
        }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [token, isEditorLocked]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Get current code for active question
  const getCurrentCode = () => {
    if (!activeQuestionId) return "";
    const activeQuestion = assessment?.questions?.find((q) => q.id === activeQuestionId);
    const saved = answers[activeQuestionId];
    if (saved && saved.code !== undefined) return saved.code;
    return getStarterCode(activeQuestion, selectedLanguages[activeQuestionId] || "python");
  };

  const getCurrentLanguage = () => {
    return selectedLanguages[activeQuestionId] || "python";
  };

  const handleCodeChange = (newCode) => {
    if (isEditorLocked) return;
    const lang = getCurrentLanguage();
    const updated = {
      ...answers,
      [activeQuestionId]: { code: newCode || "", language: lang },
    };
    setAnswers(updated);
    scheduleAutoSave(updated);
  };

  const handleLanguageChange = async (qId, newLang) => {
    if (isEditorLocked) return;
    const currentCode = answers[qId]?.code || "";
    const currentLang = selectedLanguages[qId] || "python";
    if (newLang === currentLang) return;

    const activeQuestion = assessment?.questions?.find((q) => q.id === qId);
    const starterCode = getStarterCode(activeQuestion, newLang);
    const hasCustomCode = currentCode.trim() && currentCode !== getStarterCode(activeQuestion, currentLang);

    if (hasCustomCode) {
      const confirmed = window.confirm(
        `Switching to ${newLang === "python" ? "Python 3" : "JavaScript (Node)"} will replace your current editor content with the starter code for that language.\n\nYour current ${currentLang} code is saved automatically — you can switch back to recover it.\n\nProceed?`
      );
      if (!confirmed) return;
    }

    // Flush pending save for current language before switching
    if (pendingSaveRef.current) {
      clearTimeout(autoSaveTimer.current);
      await flushSave(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }

    setSelectedLanguages((prev) => ({ ...prev, [qId]: newLang }));
    const updated = {
      ...answers,
      [qId]: { code: starterCode, language: newLang },
    };
    setAnswers(updated);
    // Auto-save the language switch immediately
    scheduleAutoSave(updated);
  };

  const handleQuestionSwitch = async (newQId) => {
    if (newQId === activeQuestionId) return;
    // Flush pending save before switching questions
    if (pendingSaveRef.current) {
      clearTimeout(autoSaveTimer.current);
      await flushSave(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }
    setActiveQuestionId(newQId);
    setTestResults(null);
    setRunResult(null);
    setTestPanelTab("testcase");
    setSelectedTestCaseIndex(0);
  };

  const handleRunTests = async () => {
    const activeQuestion = assessment?.questions?.find((q) => q.id === activeQuestionId);
    if (!activeQuestion) return;

    // Flush pending save first
    if (pendingSaveRef.current) {
      clearTimeout(autoSaveTimer.current);
      await flushSave(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }

    const code = getCurrentCode();
    const language = getCurrentLanguage();

    setRunningTests(true);
    setTestResults(null);
    setTestPanelTab("result");

    try {
      const result = await runTestCases(token, activeQuestionId, code, language);
      setTestResults(result);
    } catch (err) {
      const resp = err.response?.data;
      if (err.response?.status === 503) {
        setTestResults({
          status: "error",
          total: 0,
          passed: 0,
          failed: 0,
          runtime_ms: 0,
          test_results: [],
          message: "Docker sandbox is not available. Please ensure Docker is running.",
        });
      } else if (err.response?.status === 409) {
        setTestResults({
          status: "error",
          total: 0,
          passed: 0,
          failed: 0,
          runtime_ms: 0,
          test_results: [],
          message: "Cannot run tests after the assessment has been submitted.",
        });
      } else {
        setTestResults({
          status: "error",
          total: 0,
          passed: 0,
          failed: 0,
          runtime_ms: 0,
          test_results: [],
          message: resp?.detail || "An error occurred while running tests.",
        });
      }
    } finally {
      setRunningTests(false);
    }
  };

  const handleRunCode = async () => {
    const activeQuestion = assessment?.questions?.find((q) => q.id === activeQuestionId);
    if (!activeQuestion) return;
    const code = getCurrentCode();

    setRunning(true);
    setRunResult(null);
    try {
      const result = await runCode(token, code);
      setRunResult(result);
    } catch (err) {
      const resp = err.response?.data;
      if (err.response?.status === 503) {
        setRunResult({
          stdout: "",
          stderr: "",
          exit_code: -1,
          duration_seconds: 0,
          is_timeout: false,
          error: "Docker sandbox is not available. Please ensure Docker is running.",
        });
      } else {
        setRunResult({
          stdout: "",
          stderr: resp?.detail || "An unexpected error occurred.",
          exit_code: -1,
          duration_seconds: 0,
          is_timeout: false,
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const handleRun = async () => {
    if (!activeQuestion) return;

    // Temporary logs to verify fields on run
    console.log("activeQuestion", activeQuestion);
    console.log("execution_mode", activeQuestion?.execution_mode);
    console.log("function_name", activeQuestion?.function_name);
    console.log("visible_test_cases", activeQuestion?.visible_test_cases);
    console.log("isStructuredQuestion", isStructuredQuestion);

    if (isStructuredQuestion) {
      await handleRunTests();
      return;
    }

    await handleRunCode();
  };

  const handleSubmitAssessment = async () => {
    setSubmitting(true);
    try {
      // Flush pending auto-save and explicitly save all current answers
      if (pendingSaveRef.current) {
        clearTimeout(autoSaveTimer.current);
        pendingSaveRef.current = null;
      }
      await saveAnswers(token, answers);
      const response = await submitAssessment(token);
      setShowConfirmSubmit(false);
      setAssessment((prev) => ({
        ...prev,
        status: response.status || "submitted",
        submitted_at: response.submitted_at,
      }));
      fetchAssessmentData(false);
    } catch (err) {
      console.error(err);
      const resp = err.response?.data;
      alert(resp?.detail || "Submission failed. Make sure you have entered at least one answer.");
    } finally {
      setSubmitting(false);
    }
  };

  // Clear run output when switching questions
  useEffect(() => {
    if (prevQuestionId.current !== activeQuestionId) {
      setRunResult(null);
      setTestResults(null);
      prevQuestionId.current = activeQuestionId;
    }
  }, [activeQuestionId]);

  // ── Loading/Error States ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="container py-5 d-flex flex-column align-items-center justify-content-center"
        style={{ minHeight: "60vh" }}
      >
        <div
          className="spinner-border text-primary mb-3"
          role="status"
          style={{ width: "3rem", height: "3rem" }}
        >
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-secondary">Securing connection and loading your assessment workspace…</p>
      </div>
    );
  }

  if (error) {
    const errorMessages = {
      expired_token: {
        title: "Assessment Link Expired",
        msg: "The submission deadline or access lifetime for this link has expired. Contact your recruiter if you need an extension.",
        type: "danger",
      },
      superseded_token: {
        title: "Invitation Link Rotated",
        msg: "This link is no longer active. A newer invitation was sent to you — please check your inbox.",
        type: "warning",
      },
      invalid_token: {
        title: "Invalid Access Token",
        msg: "This link is invalid or has been modified. Make sure the URL matches the email link exactly.",
        type: "danger",
      },
      assessment_not_accessible: {
        title: "Assessment Closed",
        msg: "This assessment has been cancelled or closed.",
        type: "danger",
      },
    };
    const em = errorMessages[error.code] || {
      title: "Access Denied",
      msg: error.detail,
      type: "danger",
    };

    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div
              className="screenai-card text-center"
              style={{ border: `1px solid var(--screenai-${em.type})` }}
            >
              <div className="mb-4">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: `var(--screenai-${em.type})` }}
                >
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="mb-3" style={{ fontWeight: 700 }}>
                {em.title}
              </h2>
              <p className="text-secondary mb-4">{em.msg}</p>
              <a href="/" className="btn btn-outline-primary">
                Return to Homepage
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isSubmittedState = assessment && ["submitted", "graded", "evaluating", "queued"].includes(assessment.status);
  
  if (isSubmittedState) {
    return (
      <SubmittedAssessmentPage
        assessment={assessment}
        candidateName={assessment.candidate_name_snapshot}
        submittedAt={assessment.submitted_at}
      />
    );
  }

  const activeQuestion = assessment.questions?.find((q) => q.id === activeQuestionId);
  const activeQuestionIndex = assessment.questions?.findIndex((q) => q.id === activeQuestionId) ?? -1;
  const hasSessionEnd = !!assessment.session_end_at;
  const visibleTestCases = activeQuestion?.visible_test_cases || [];
  const currentLanguage = getCurrentLanguage();
  const currentCode = getCurrentCode();

  // Check if question uses function-based execution (new system)
  const hasVisibleTests =
    Array.isArray(activeQuestion?.visible_test_cases) &&
    activeQuestion.visible_test_cases.length > 0;

  const isStructuredQuestion =
    activeQuestion?.execution_mode === "function" &&
    Boolean(activeQuestion?.function_name) &&
    hasVisibleTests;

  return (
    <div className="container-fluid px-lg-4 py-3 text-white" style={{ maxWidth: "1800px", margin: "0 auto" }}>

      {/* ── Top Banner ─────────────────────────────────────────────────────── */}
      <div className="row mb-3">
        <div className="col-12">
          <div
            className="screenai-card py-3 px-4"
            style={{ position: "relative", overflow: "hidden" }}
          >
            <div
              style={{
                height: "4px",
                background:
                  isEditorLocked
                    ? "linear-gradient(90deg, var(--screenai-danger) 0%, #7c3aed 100%)"
                    : "linear-gradient(90deg, var(--screenai-primary) 0%, var(--screenai-success) 100%)",
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              }}
            />
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div>
                <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>
                  {assessment.template_name}
                </h1>
                <p className="text-secondary small mb-0 mt-1">
                  Candidate:{" "}
                  <strong className="text-white">{assessment.candidate_name_snapshot}</strong>
                  {" · "}
                  Duration:{" "}
                  <strong className="text-white">{assessment.duration_minutes || 0} min</strong>
                </p>
              </div>

              {/* Timer cluster */}
              <div className="d-flex flex-wrap align-items-center gap-2">
                {/* Exam session countdown */}
                {hasSessionEnd && (
                  <div
                    className="d-flex align-items-center gap-2 px-3 py-2 rounded"
                    style={{
                      backgroundColor: sessionExpired
                        ? "rgba(240, 93, 94, 0.12)"
                        : "rgba(16, 185, 129, 0.08)",
                      border: `1px solid ${sessionExpired ? "var(--screenai-danger)" : "rgba(16, 185, 129, 0.3)"}`,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: sessionExpired ? "var(--screenai-danger)" : "#10b981", flexShrink: 0 }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div>
                      <div
                        className="fw-bold"
                        style={{
                          fontSize: "17px",
                          letterSpacing: "1px",
                          fontFamily: "monospace",
                          color: sessionExpired ? "var(--screenai-danger)" : "#10b981",
                        }}
                      >
                        {sessionExpired ? "TIME UP" : sessionTimeLeft}
                      </div>
                      <div className="text-muted" style={{ fontSize: "9px", textTransform: "uppercase" }}>
                        Exam Time Remaining
                      </div>
                    </div>
                  </div>
                )}

                {/* Submission cutoff */}
                <div
                  className="px-3 py-2 rounded"
                  style={{
                    backgroundColor: deadlinePassed
                      ? "rgba(240, 93, 94, 0.08)"
                      : "rgba(148, 163, 184, 0.06)",
                    border: `1px solid ${deadlinePassed ? "var(--screenai-danger)" : "rgba(148, 163, 184, 0.15)"}`,
                  }}
                >
                  <div className="text-muted" style={{ fontSize: "9px", textTransform: "uppercase" }}>
                    {deadlinePassed ? "Cutoff Passed" : "Submission Cutoff"}
                  </div>
                  <div
                    className="fw-semibold"
                    style={{
                      fontSize: "12px",
                      color: deadlinePassed ? "var(--screenai-danger)" : "var(--screenai-text)",
                    }}
                  >
                    {formatDate(assessment.assessment_deadline)}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className="badge"
                  style={{
                    backgroundColor: isStatusLocked
                      ? "rgba(240, 93, 94, 0.15)"
                      : "rgba(16, 185, 129, 0.15)",
                    color: isStatusLocked
                      ? "var(--screenai-danger)"
                      : "var(--screenai-success)",
                    border: `1px solid ${isStatusLocked ? "var(--screenai-danger)" : "var(--screenai-success)"}`,
                    padding: "0.5rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {isStatusLocked
                    ? assessment.status === "submitted"
                      ? "✓ Submitted"
                      : assessment.status.toUpperCase()
                    : sessionExpired
                    ? "Session Ended"
                    : "Active Exam"}
                </span>
              </div>
            </div>

            {/* Session expired warning bar */}
            {sessionExpired && !isStatusLocked && (
              <div
                className="mt-3 px-3 py-2 rounded small d-flex align-items-center gap-2"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#f59e0b",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>
                  <strong>Exam time has ended.</strong> You can still submit your saved answers before the submission cutoff.
                  Editing is no longer available.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Workspace (3-column LeetCode-style) ─────────────────────── */}
      <div className="row g-3">

        {/* LEFT: Problem panel */}
        <div className="col-12 col-lg-4 col-xl-3">
          {/* Question navigation tabs */}
          <div
            className="d-flex gap-1 mb-2 flex-wrap"
            style={{ overflowX: "auto" }}
          >
            {assessment.questions?.map((q, idx) => {
              const answerData = answers[q.id];
              const hasCode = typeof answerData === "object"
                ? answerData?.code?.trim().length > 0
                : typeof answerData === "string"
                ? answerData.trim().length > 0
                : false;
              const isActive = q.id === activeQuestionId;
              return (
                <button
                  key={q.id}
                  id={`question-nav-${idx + 1}`}
                  onClick={() => handleQuestionSwitch(q.id)}
                  className="btn"
                  style={{
                    padding: "5px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backgroundColor: isActive
                      ? "rgba(99,102,241,0.2)"
                      : "rgba(15,23,42,0.4)",
                    color: isActive ? "#fff" : "var(--screenai-text-secondary)",
                    border: isActive
                      ? "1px solid rgba(99,102,241,0.5)"
                      : "1px solid rgba(148,163,184,0.15)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {hasCode && (
                    <span style={{ color: "#10b981", marginRight: "4px", fontSize: "10px" }}>●</span>
                  )}
                  Q{idx + 1}
                </button>
              );
            })}
          </div>

          <ProblemPanel
            question={activeQuestion}
            questionIndex={activeQuestionIndex}
            totalQuestions={assessment.questions?.length || 0}
          />
        </div>

        {/* RIGHT: Code editor + test panel */}
        <div className="col-12 col-lg-8 col-xl-9">
          {activeQuestion ? (
            <div className="d-flex flex-column gap-3">

              {/* Editor card */}
              <div
                className="screenai-card d-flex flex-column"
                style={{ overflow: "hidden" }}
              >
                {/* Editor toolbar */}
                <div
                  className="d-flex align-items-center justify-content-between gap-2 px-3 py-2"
                  style={{
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                    backgroundColor: "rgba(15,23,42,0.6)",
                  }}
                >
                  <div className="d-flex align-items-center gap-3">
                    {/* Language selector */}
                    <div className="d-flex align-items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#94a3b8" }}>
                        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                      </svg>
                      <select
                        id="language-selector"
                        value={currentLanguage}
                        onChange={(e) => handleLanguageChange(activeQuestionId, e.target.value)}
                        disabled={isEditorLocked}
                        className="form-select form-select-sm"
                        style={{
                          backgroundColor: "rgba(15,23,42,0.8)",
                          border: "1px solid rgba(148,163,184,0.2)",
                          color: "#f8fafc",
                          fontSize: "13px",
                          padding: "4px 28px 4px 10px",
                          minWidth: "170px",
                        }}
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-save status */}
                    <AutoSaveStatus status={autoSaveStatus} />

                    {isEditorLocked && !isStatusLocked && (
                      <span className="small fw-bold text-uppercase" style={{ color: "#f59e0b", fontSize: "11px" }}>
                        Editing Locked
                      </span>
                    )}
                    {isStatusLocked && (
                      <span className="small fw-bold text-uppercase text-danger" style={{ fontSize: "11px" }}>
                        Read-Only
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="d-flex align-items-center gap-2">
                    {/* Run Code button */}
                    <button
                      id="run-code-btn"
                      onClick={handleRun}
                      disabled={isEditorLocked || running || runningTests}
                      className="btn px-3 py-1 fw-bold d-flex align-items-center gap-2"
                      style={{
                        fontSize: "13px",
                        backgroundColor:
                          isEditorLocked || running || runningTests
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(16,185,129,0.12)",
                        color:
                          isEditorLocked || running || runningTests
                            ? "var(--screenai-text-muted)"
                            : "#10b981",
                        border: `1px solid ${
                          isEditorLocked || running || runningTests
                            ? "rgba(148,163,184,0.15)"
                            : "rgba(16,185,129,0.4)"
                        }`,
                      }}
                    >
                      {running || runningTests ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                          Running…
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                          Run Code
                        </>
                      )}
                    </button>

                    {/* Final Submit */}
                    {assessment.status === "submitted" ? (
                      <button
                        className="btn px-3 py-1 fw-bold d-flex align-items-center gap-2"
                        disabled
                        style={{
                          fontSize: "13px",
                          backgroundColor: "rgba(16,185,129,0.15)",
                          color: "var(--screenai-success)",
                          border: "1px solid var(--screenai-success)",
                        }}
                      >
                        ✓ Submitted
                      </button>
                    ) : (
                      <button
                        id="final-submit-btn"
                        onClick={() => setShowConfirmSubmit(true)}
                        disabled={isSubmitLocked || submitting}
                        className="btn btn-success px-3 py-1 fw-bold"
                        style={{ fontSize: "13px" }}
                      >
                        {submitting ? "Submitting…" : "Submit"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Monaco Editor */}
                <div style={{ height: "420px", position: "relative" }}>
                  <Editor
                    key={`${assessment?.id || "assessment"}:${activeQuestionId || "question"}:${currentLanguage}`}
                    height="420px"
                    path={`${assessment?.id || "assessment"}/${activeQuestionId || "question"}.${currentLanguage || "python"}`}
                    language={
                      SUPPORTED_LANGUAGES.find((l) => l.value === currentLanguage)?.monacoLang || "python"
                    }
                    value={currentCode}
                    onChange={handleCodeChange}
                    options={{
                      readOnly: isEditorLocked,
                      fontSize: 14,
                      lineHeight: 22,
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 4,
                      insertSpaces: true,
                      wordWrap: "on",
                      padding: { top: 12, bottom: 12 },
                      renderLineHighlight: "line",
                      scrollbar: { verticalScrollbarSize: 6 },
                    }}
                    theme="vs-dark"
                    loading={
                      <div className="d-flex align-items-center justify-content-center h-100 text-secondary">
                        <span className="spinner-border spinner-border-sm me-2" role="status" />
                        Loading editor…
                      </div>
                    }
                  />
                </div>
              </div>

              {/* Test Cases / Results Panel (new-style questions) */}
              {isStructuredQuestion ? (
                <TestCasesPanel
                  visibleTestCases={visibleTestCases}
                  testResults={testResults}
                  running={runningTests}
                  activeTab={testPanelTab}
                  onTabChange={setTestPanelTab}
                  selectedTestCaseIndex={selectedTestCaseIndex}
                  onSelectTestCase={setSelectedTestCaseIndex}
                />
              ) : (
                /* Legacy Run Output Panel for non-structured questions */
                <RunOutputPanel result={runResult} running={running} />
              )}

            </div>
          ) : (
            <div
              className="screenai-card p-5 text-center text-secondary d-flex flex-column align-items-center justify-content-center"
              style={{ minHeight: "500px" }}
            >
              <p>Select a question from the left panel to begin.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm Submit Modal ────────────────────────────────────────────── */}
      {showConfirmSubmit && (
        <div className="screenai-modal-overlay">
          <div className="screenai-modal-content">
            <h3 className="mb-3" style={{ fontWeight: 700 }}>
              Confirm Final Submission
            </h3>
            <p className="text-secondary small mb-3">
              You are about to finalize and lock your assessment workspace. This cannot be undone.
            </p>

            <div
              className="p-3 rounded mb-3 text-start"
              style={{
                backgroundColor: "var(--screenai-bg)",
                border: "1px solid var(--screenai-border)",
              }}
            >
              <p className="mb-2 small text-secondary fw-bold text-uppercase">
                Workspace Summary:
              </p>
              <ul className="mb-0 ps-3 small text-secondary">
                {assessment.questions?.map((q, idx) => {
                  const answerData = answers[q.id];
                  const code = typeof answerData === "object" ? answerData?.code : answerData;
                  const isAnswered = code && code.trim().length > 0;
                  const lang = typeof answerData === "object" ? answerData?.language : "python";
                  return (
                    <li key={q.id} className="mb-1">
                      Q{idx + 1}: {q.title} —{" "}
                      {isAnswered ? (
                        <span className="text-success fw-bold">Answered ({lang})</span>
                      ) : (
                        <span className="text-danger fw-bold">Empty</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="alert alert-warning p-2 small text-start">
              <strong>Warning:</strong> Once submitted, you will not be able to edit or re-access the
              workspace.
            </div>

            <div className="d-flex justify-content-end gap-3 mt-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                disabled={submitting}
                className="btn btn-outline-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAssessment}
                disabled={submitting}
                className="btn btn-success d-flex align-items-center gap-2"
              >
                {submitting ? "Submitting…" : "Yes, Submit Solution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
