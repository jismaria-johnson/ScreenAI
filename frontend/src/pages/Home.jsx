import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="container py-5">
      <div className="text-center">
        <h1 className="fw-bold mb-3">ScreenAI</h1>
        <p className="lead">
          AI-powered resume screening and HR shortlisting system.
        </p>

        <div className="mt-4">
          <Link to="/register" className="btn btn-primary me-3">
            Get Started
          </Link>
          <Link to="/jobs" className="btn btn-outline-primary">
            View Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;