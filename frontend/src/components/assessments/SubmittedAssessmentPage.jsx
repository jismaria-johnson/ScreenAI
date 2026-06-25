function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SubmittedAssessmentPage({ assessment, candidateName, submittedAt }) {
  const finalSubmittedAt = submittedAt || assessment?.submitted_at;
  const templateName = assessment?.template_name || assessment?.assessment_snapshot?.template?.name || "Assessment";
  const finalCandidateName = candidateName || assessment?.candidate_name_snapshot || "Candidate";

  return (
    <div className="container py-5 text-white" style={{ maxWidth: "800px" }}>
      <div className="row justify-content-center">
        <div className="col-12">
          <div
            className="screenai-card p-5 text-center shadow-lg"
            style={{
              border: "1px solid var(--screenai-success)",
              backgroundColor: "rgba(10, 15, 26, 0.95)",
              position: "relative",
              overflow: "hidden",
              borderRadius: "12px",
            }}
          >
            {/* Header border stripe */}
            <div
              style={{
                height: "4px",
                background: "linear-gradient(90deg, var(--screenai-success) 0%, #10b981 100%)",
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
              }}
            />

            {/* Success Icon */}
            <div className="mb-4 text-success d-flex justify-content-center">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle"
                style={{
                  width: "80px",
                  height: "80px",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  border: "2px solid var(--screenai-success)",
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 className="mb-3" style={{ fontWeight: 800, fontSize: "2rem", color: "#f8fafc" }}>
              Assessment Submitted Successfully
            </h1>

            {/* Subtitle */}
            <p className="text-secondary mb-4 mx-auto" style={{ maxWidth: "550px", fontSize: "15px", lineHeight: "1.6" }}>
              Your responses have been successfully submitted. Your answers are now locked and cannot be edited. The recruiter will review your assessment results shortly.
            </p>

            {/* Details Box */}
            <div
              className="p-4 rounded text-start mb-4 mx-auto"
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.5)",
                border: "1px solid rgba(148, 163, 184, 0.1)",
                maxWidth: "500px",
              }}
            >
              <div className="d-flex justify-content-between mb-3" style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)", paddingBottom: "8px" }}>
                <span className="text-muted small">Assessment:</span>
                <span className="fw-semibold small text-white">{templateName}</span>
              </div>
              <div className="d-flex justify-content-between mb-3" style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)", paddingBottom: "8px" }}>
                <span className="text-muted small">Candidate:</span>
                <span className="fw-semibold small text-white">{finalCandidateName}</span>
              </div>
              <div className="d-flex justify-content-between mb-3" style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.08)", paddingBottom: "8px" }}>
                <span className="text-muted small">Submission Status:</span>
                <span
                  className="badge px-2.5 py-1 text-uppercase fw-bold"
                  style={{
                    fontSize: "10px",
                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                    color: "var(--screenai-success)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    borderRadius: "4px",
                  }}
                >
                  Submitted
                </span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted small">Submitted At:</span>
                <span className="fw-semibold small text-white">{formatDate(finalSubmittedAt)}</span>
              </div>
            </div>

            {/* Navigation button */}
            <div className="mt-4">
              <a
                href="/"
                className="btn btn-outline-primary px-4 py-2 fw-semibold"
                style={{
                  fontSize: "14px",
                  borderRadius: "8px",
                  transition: "all 0.2s",
                }}
              >
                Return to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
