import { useEffect } from "react";

function Toast({ message, type = "success", onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  let bgClass = "bg-success text-white shadow";
  if (type === "error") bgClass = "bg-danger text-white shadow";
  if (type === "info") bgClass = "bg-info text-white shadow";

  return (
    <div
      className="position-fixed top-0 end-0 p-3"
      style={{ zIndex: 2000, maxWidth: "100%", boxSizing: "border-box" }}
    >
      <div
        className={`toast show align-items-center ${bgClass} border-0`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={{ maxWidth: "calc(100vw - 2rem)", wordBreak: "break-word" }}
      >
        <div className="d-flex">
          <div className="toast-body fw-bold" style={{ whiteSpace: "pre-line" }}>{message}</div>
          <button
            type="button"
            className="btn-close btn-close-white me-2 m-auto"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}

export default Toast;

