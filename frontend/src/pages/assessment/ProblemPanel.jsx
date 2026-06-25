/**
 * ProblemPanel.jsx
 * Left panel showing problem description, examples, and sample test cases.
 * Pure presentation component - no side effects.
 */
export default function ProblemPanel({ question, questionIndex, totalQuestions }) {
  if (!question) return null;

  const visibleTests = question.visible_test_cases || [];

  return (
    <div className="d-flex flex-column gap-3 h-100">
      {/* Title + marks */}
      <div className="screenai-card p-3">
        <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
          <div>
            <h5 className="fw-bold mb-1 text-white">{question.title}</h5>
            <div className="small text-secondary">
              Question {questionIndex + 1} of {totalQuestions}
            </div>
          </div>
          <div className="d-flex flex-column align-items-end gap-1">
            <span
              className="badge px-2 py-2 fw-bold"
              style={{
                fontSize: "0.75rem",
                backgroundColor: "rgba(99,102,241,0.15)",
                color: "var(--screenai-primary)",
                border: "1px solid rgba(99,102,241,0.35)",
              }}
            >
              {question.marks} Marks
            </span>
            {question.execution_mode === "function" && question.function_name && (
              <span
                className="badge"
                style={{
                  fontSize: "0.68rem",
                  backgroundColor: "rgba(16,185,129,0.1)",
                  color: "#10b981",
                  border: "1px solid rgba(16,185,129,0.3)",
                  fontFamily: "monospace",
                }}
              >
                fn: {question.function_name}()
              </span>
            )}
          </div>
        </div>

        {/* Problem description */}
        <div
          className="text-light"
          style={{
            whiteSpace: "pre-line",
            lineHeight: 1.65,
            fontSize: "0.9rem",
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {question.prompt}
        </div>
      </div>

      {/* Sample test cases (visible tests) */}
      {visibleTests.length > 0 && (
        <div className="screenai-card p-3">
          <h6
            className="fw-bold mb-2 text-uppercase"
            style={{ fontSize: "0.75rem", color: "var(--screenai-text-secondary)", letterSpacing: "0.08em" }}
          >
            Examples
          </h6>
          <div className="d-flex flex-column gap-2">
            {visibleTests.map((tc, idx) => (
              <div
                key={idx}
                className="rounded p-3"
                style={{
                  backgroundColor: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(148,163,184,0.12)",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                <div className="mb-1">
                  <span className="text-muted" style={{ fontSize: "11px" }}>Example {tc.order ?? idx + 1}</span>
                </div>
                <div>
                  <span className="text-secondary">Input:</span>{" "}
                  <span style={{ color: "#a6e22e" }}>{tc.input}</span>
                </div>
                <div>
                  <span className="text-secondary">Output:</span>{" "}
                  <span style={{ color: "#66d9e8" }}>{tc.expected_output}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      {question.time_limit_seconds && (
        <div
          className="screenai-card p-3"
          style={{ backgroundColor: "rgba(30,41,59,0.4)", borderColor: "#334155" }}
        >
          <h6
            className="fw-bold mb-2 text-uppercase"
            style={{ fontSize: "0.75rem", color: "var(--screenai-text-secondary)", letterSpacing: "0.08em" }}
          >
            Constraints
          </h6>
          <div className="text-secondary small" style={{ lineHeight: "1.65" }}>
            <div>⏱ Time limit: <strong className="text-white">{question.time_limit_seconds}s</strong></div>
            <div>🔐 Hidden tests are used for final grading only.</div>
          </div>
        </div>
      )}
    </div>
  );
}
