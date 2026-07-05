function AiScoreBadge({ score }) {
  let badgeStyle = {
    backgroundColor: "var(--screenai-danger)",
    color: "var(--screenai-text)",
  };

  if (score === null || score === undefined) {
    badgeStyle = {
      backgroundColor: "var(--screenai-text-muted)",
      color: "var(--screenai-text)",
    };
  } else if (score >= 80) {
    badgeStyle = {
      backgroundColor: "var(--screenai-success)",
      color: "var(--screenai-text)",
    };
  } else if (score >= 50) {
    badgeStyle = {
      backgroundColor: "var(--screenai-primary)",
      color: "var(--screenai-text)",
    };
  }

  return (
    <span className="badge fw-bold" style={badgeStyle}>
      {score !== null && score !== undefined ? score : "Pending"}
    </span>
  );
}

export default AiScoreBadge;
