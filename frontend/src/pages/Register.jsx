import { useNavigate } from "react-router-dom";

function Register() {
  const navigate = useNavigate();

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-6 col-md-8">
          <div className="card shadow-sm text-center bg-dark border-secondary">
            <div className="card-body p-5">
              <div className="mb-4">
                <span className="display-4 text-warning">⚠️</span>
              </div>
              <h2 className="mb-3 text-white">Registration Deactivated</h2>
              <p className="text-muted mb-4">
                Public recruiter registration has been deactivated. HR accounts are now provisioned exclusively by the System Administrator.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="btn btn-primary px-4"
              >
                Return to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;