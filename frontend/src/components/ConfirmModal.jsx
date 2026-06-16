import { useEffect, useRef } from "react";

function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  submitting = false,
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Store active element and set focus when modal opens
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      
      // Put focus on the modal container so screen readers read it
      if (modalRef.current) {
        modalRef.current.focus();
      }
    } else {
      // Return focus when modal closes
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Handle keys: Esc and Tab trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        
        // Find all focusable elements
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
          // Shift + Tab: trap focus at the top
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          // Tab: trap focus at the bottom
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleConfirmClick = (e) => {
    e.stopPropagation();
    if (submitting) return;
    onConfirm();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={submitting ? undefined : onCancel}
      />
      {/* Modal Container */}
      <div
        ref={modalRef}
        className="modal fade show d-block"
        tabIndex="-1"
        role="dialog"
        aria-labelledby="confirm-modal-title"
        aria-modal="true"
        style={{ zIndex: 1050, outline: "none" }}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg rounded-3">
            <div className="modal-header border-0 bg-light">
              <h5
                className="modal-title fw-bold text-dark"
                id="confirm-modal-title"
              >
                {title || "Confirm Action"}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onCancel}
                disabled={submitting}
              />
            </div>
            <div className="modal-body p-4">
              <p className="text-secondary mb-0">
                {message || "Are you sure you want to proceed?"}
              </p>
            </div>
            <div className="modal-footer border-0 bg-light d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-secondary px-4 fw-semibold"
                onClick={onCancel}
                disabled={submitting}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className="btn btn-danger px-4 fw-bold"
                onClick={handleConfirmClick}
                disabled={submitting}
              >
                {submitting ? "Processing..." : confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ConfirmModal;

