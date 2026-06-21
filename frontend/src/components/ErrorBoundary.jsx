import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    try {
      const errMsg = encodeURIComponent(`${error?.message || error}\n${error?.stack || ""}`);
      fetch(`/api/jobs/?error_log=${errMsg.slice(0, 500)}`).catch(() => {});
    } catch (err) {
      console.warn("Could not send error log to backend:", err);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="container py-5 text-center">
          <div className="alert alert-danger p-5 bg-dark border-secondary text-white rounded">
            <h3 className="fw-bold text-danger mb-3">Something went wrong loading this section</h3>
            <p className="text-secondary mb-4">An unexpected rendering error occurred. Please refresh the page or try again.</p>
            {this.state.error && (
              <pre className="text-danger bg-black p-3 rounded text-start mx-auto mt-3 border border-secondary small" style={{ maxWidth: "800px", overflowX: "auto" }}>
                <strong>{this.state.error.toString()}</strong>
                {"\n"}
                {this.state.error.stack}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="btn btn-outline-danger px-4 fw-bold mt-3"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
