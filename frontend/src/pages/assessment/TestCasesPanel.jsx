/**
 * TestCasesPanel.jsx
 * Bottom-right panel showing sample test case inputs (Testcase tab)
 * and structured per-test execution results (Test Result tab).
 *
 * NEVER shows hidden test cases or expected outputs of hidden tests.
 * For visible tests: shows input, expected output, function output,
 * console output, status, and runtime.
 */

const STATUS_COLORS = {
  passed: { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", label: "Passed" },
  failed: { color: "#f05d5e", bg: "rgba(240,93,94,0.1)", border: "rgba(240,93,94,0.3)", label: "Wrong Answer" },
  runtime_error: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", label: "Runtime Error" },
  syntax_error: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", label: "Syntax Error" },
  time_limit_exceeded: { color: "#7c3aed", bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", label: "Time Limit Exceeded" },
  memory_limit_exceeded: { color: "#7c3aed", bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", label: "Memory Limit Exceeded" },
  no_code: { color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", label: "No Code" },
};

function statusStyle(s) {
  return STATUS_COLORS[s] || { color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", label: s };
}

export default function TestCasesPanel({
  visibleTestCases = [],
  testResults = null,
  running = false,
  activeTab,
  onTabChange,
  selectedTestCaseIndex,
  onSelectTestCase,
}) {
  const hasResults = testResults !== null && testResults.test_results !== undefined;
  const selectedVisibleCase = visibleTestCases[selectedTestCaseIndex] || null;
  const selectedResultCase = hasResults
    ? testResults.test_results[selectedTestCaseIndex] || testResults.test_results[0] || null
    : null;

  return (
    <div
      className="d-flex flex-column"
      style={{
        backgroundColor: "#0a0f1a",
        border: "1px solid rgba(148,163,184,0.12)",
        borderRadius: "10px",
        overflow: "hidden",
        minHeight: "220px",
      }}
    >
      {/* Tab bar */}
      <div
        className="d-flex"
        style={{
          borderBottom: "1px solid rgba(148,163,184,0.12)",
          backgroundColor: "rgba(15,23,42,0.6)",
        }}
      >
        {["testcase", "result"].map((tab) => {
          const label = tab === "testcase" ? "Testcase" : "Test Result";
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className="btn"
              style={{
                borderRadius: 0,
                padding: "10px 20px",
                fontSize: "13px",
                fontWeight: 600,
                color: active ? "#fff" : "var(--screenai-text-muted)",
                borderBottom: active ? "2px solid var(--screenai-primary)" : "2px solid transparent",
                backgroundColor: "transparent",
                transition: "all 0.15s ease",
              }}
            >
              {label}
              {tab === "result" && hasResults && (
                <span
                  className="ms-2 badge"
                  style={{
                    fontSize: "10px",
                    backgroundColor:
                      testResults.passed === testResults.total
                        ? "rgba(16,185,129,0.2)"
                        : "rgba(240,93,94,0.2)",
                    color:
                      testResults.passed === testResults.total
                        ? "#10b981"
                        : "#f05d5e",
                    border: `1px solid ${
                      testResults.passed === testResults.total
                        ? "rgba(16,185,129,0.4)"
                        : "rgba(240,93,94,0.4)"
                    }`,
                  }}
                >
                  {testResults.passed}/{testResults.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel body */}
      <div className="flex-grow-1 p-3" style={{ overflowY: "auto" }}>
        {/* ── Testcase Tab ─────────────────────────────────────────────────── */}
        {activeTab === "testcase" && (
          <div>
            {visibleTestCases.length === 0 ? (
              <div className="text-muted small">
                No sample test cases are available for this question.
              </div>
            ) : (
              <>
                {/* Test case selector tabs */}
                <div className="d-flex gap-2 mb-3 flex-wrap">
                  {visibleTestCases.map((tc, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSelectTestCase(idx)}
                      className="btn btn-sm"
                      style={{
                        fontSize: "12px",
                        padding: "4px 12px",
                        borderRadius: "6px",
                        backgroundColor:
                          selectedTestCaseIndex === idx
                            ? "rgba(99,102,241,0.2)"
                            : "rgba(148,163,184,0.06)",
                        color:
                          selectedTestCaseIndex === idx
                            ? "var(--screenai-primary)"
                            : "var(--screenai-text-muted)",
                        border: `1px solid ${
                          selectedTestCaseIndex === idx
                            ? "rgba(99,102,241,0.4)"
                            : "rgba(148,163,184,0.12)"
                        }`,
                      }}
                    >
                      Case {tc.order ?? idx + 1}
                    </button>
                  ))}
                </div>

                {/* Selected test case details */}
                {visibleTestCases[selectedTestCaseIndex] && (
                  <div className="d-flex flex-column gap-2">
                    <div>
                      <div
                        className="text-muted mb-1"
                        style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                      >
                        Input
                      </div>
                      <div
                        className="rounded p-2"
                        style={{
                          backgroundColor: "rgba(15,23,42,0.8)",
                          border: "1px solid rgba(148,163,184,0.1)",
                          fontFamily: "monospace",
                          fontSize: "13px",
                          color: "#a6e22e",
                        }}
                      >
                        {visibleTestCases[selectedTestCaseIndex].input}
                      </div>
                    </div>
                    <div>
                      <div
                        className="text-muted mb-1"
                        style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}
                      >
                        Expected Output
                      </div>
                      <div
                        className="rounded p-2"
                        style={{
                          backgroundColor: "rgba(15,23,42,0.8)",
                          border: "1px solid rgba(148,163,184,0.1)",
                          fontFamily: "monospace",
                          fontSize: "13px",
                          color: "#66d9e8",
                        }}
                      >
                        {visibleTestCases[selectedTestCaseIndex].expected_output}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Test Result Tab ───────────────────────────────────────────────── */}
        {activeTab === "result" && (
          <div>
            {running && (
              <div className="d-flex align-items-center gap-2 text-secondary small">
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Running against test cases…
              </div>
            )}
            {!running && !hasResults && (
              <div className="text-muted small">
                Click <strong className="text-white">Run Code</strong> to execute your code against the sample test cases.
              </div>
            )}
            {!running && testResults && testResults.status === "error" && (
              <div
                className="rounded p-3 mb-2"
                style={{
                  backgroundColor: "rgba(240, 93, 94, 0.1)",
                  border: "1px solid rgba(240, 93, 94, 0.3)",
                  color: "#f05d5e",
                  fontSize: "13px",
                  fontFamily: "monospace",
                }}
              >
                <div className="fw-bold mb-1">Sandbox Error:</div>
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {testResults.message || testResults.detail || "Unable to run sample tests."}
                </div>
              </div>
            )}
            {!running && hasResults && testResults.status !== "error" && (
              <div className="d-flex flex-column gap-2">
                {/* Summary row */}
                <div
                  className="d-flex align-items-center gap-3 rounded p-2 mb-1"
                  style={{
                    backgroundColor:
                      testResults.passed === testResults.total
                        ? "rgba(16,185,129,0.06)"
                        : "rgba(240,93,94,0.06)",
                    border: `1px solid ${
                      testResults.passed === testResults.total
                        ? "rgba(16,185,129,0.2)"
                        : "rgba(240,93,94,0.2)"
                    }`,
                  }}
                >
                  <span
                    style={{
                      color:
                        testResults.passed === testResults.total ? "#10b981" : "#f05d5e",
                      fontWeight: 700,
                      fontSize: "14px",
                    }}
                  >
                    {testResults.passed === testResults.total
                      ? "✓ Accepted"
                      : `✗ ${testResults.failed} Failed`}
                  </span>
                  <span className="text-muted small ms-auto">
                    {testResults.passed}/{testResults.total} passed · {testResults.runtime_ms}ms
                  </span>
                </div>

                {/* Result case selector */}
                <div className="d-flex gap-2 mb-2 flex-wrap">
                  {testResults.test_results.map((tc, idx) => {
                    const tcStyle = statusStyle(tc.status);
                    const isSelected = selectedTestCaseIndex === idx;
                    return (
                      <button
                        key={`${tc.test_case}-${idx}`}
                        onClick={() => onSelectTestCase(idx)}
                        className="btn btn-sm"
                        style={{
                          fontSize: "12px",
                          padding: "4px 12px",
                          borderRadius: "6px",
                          backgroundColor: isSelected ? tcStyle.bg : "rgba(148,163,184,0.06)",
                          color: isSelected ? tcStyle.color : "var(--screenai-text-muted)",
                          border: `1px solid ${isSelected ? tcStyle.border : "rgba(148,163,184,0.12)"}`,
                          fontWeight: isSelected ? 700 : 500,
                        }}
                      >
                        Case {tc.test_case ?? idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Selected result details */}
                {selectedResultCase && (() => {
                  const st = statusStyle(selectedResultCase.status);
                  return (
                    <div
                      className="rounded p-3"
                      style={{
                        backgroundColor: st.bg,
                        border: `1px solid ${st.border}`,
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <span style={{ color: st.color, fontWeight: 700, fontSize: "12px" }}>
                          Case {selectedResultCase.test_case ?? selectedTestCaseIndex + 1}: {st.label}
                        </span>
                        <span className="text-muted" style={{ fontSize: "11px" }}>
                          {selectedResultCase.runtime_ms}ms
                        </span>
                      </div>

                      <div className="row g-3">
                        <div className="col-12 col-lg-4">
                          <div className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase" }}>
                            Input
                          </div>
                          <div
                            className="rounded p-2"
                            style={{
                              backgroundColor: "rgba(15,23,42,0.8)",
                              border: "1px solid rgba(148,163,184,0.1)",
                              color: "#a6e22e",
                              minHeight: "56px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedResultCase.input ?? selectedVisibleCase?.input ?? "—"}
                          </div>
                        </div>

                        <div className="col-12 col-lg-4">
                          <div className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase" }}>
                            Function Output
                          </div>
                          <div
                            className="rounded p-2"
                            style={{
                              backgroundColor: "rgba(15,23,42,0.8)",
                              border: "1px solid rgba(148,163,184,0.1)",
                              color: selectedResultCase.status === "passed" ? "#10b981" : "#f05d5e",
                              minHeight: "56px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedResultCase.actual_output !== undefined && selectedResultCase.actual_output !== ""
                              ? selectedResultCase.actual_output
                              : "(no return value)"}
                          </div>
                        </div>

                        <div className="col-12 col-lg-4">
                          <div className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase" }}>
                            Expected Output
                          </div>
                          <div
                            className="rounded p-2"
                            style={{
                              backgroundColor: "rgba(15,23,42,0.8)",
                              border: "1px solid rgba(148,163,184,0.1)",
                              color: "#66d9e8",
                              minHeight: "56px",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedResultCase.expected_output ?? selectedVisibleCase?.expected_output ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase" }}>
                          Console Output
                        </div>
                        <div
                          className="rounded p-2"
                          style={{
                            backgroundColor: "rgba(15,23,42,0.8)",
                            border: "1px solid rgba(148,163,184,0.1)",
                            color: "#e2e8f0",
                            minHeight: "56px",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {selectedResultCase.console_output !== undefined && selectedResultCase.console_output !== ""
                            ? selectedResultCase.console_output
                            : "(nothing printed)"}
                        </div>
                      </div>

                      {selectedResultCase.error && (
                        <div className="mt-3">
                          <div className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase" }}>
                            Error
                          </div>
                          <div
                            className="rounded p-2"
                            style={{
                              backgroundColor: "rgba(15,23,42,0.8)",
                              border: "1px solid rgba(245,158,11,0.25)",
                              color: "#f59e0b",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedResultCase.error}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
