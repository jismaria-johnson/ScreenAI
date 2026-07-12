export const getApplicationStatusBadgeClass = (status) => {
  switch (status) {
    case "hired":
      return "badge bg-success fs-6 px-3 py-2";
    case "shortlisted":
      return "badge bg-primary fs-6 px-3 py-2";
    case "rejected":
      return "badge bg-danger fs-6 px-3 py-2";
    case "pending":
    default:
      return "badge bg-secondary fs-6 px-3 py-2";
  }
};

export const getApplicationStatusColorClass = (status) => {
  if (status === "hired") return "bg-success";
  if (status === "rejected") return "bg-danger";
  if (status === "shortlisted") return "bg-primary";
  return "bg-secondary";
};

export const getApplicationStatusBadgeStyle = (status) => {
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
