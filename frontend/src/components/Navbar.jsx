import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();

  const token = localStorage.getItem("access");
  const role = localStorage.getItem("role");

  const getHomePath = () => {
    if (token && role === "candidate") {
      return "/candidate-dashboard";
    }

    if (token && role === "hr") {
      return "/hr-dashboard";
    }

    return "/";
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4">
      <Link
        className="navbar-brand fw-bold"
        to={getHomePath()}
      >
        ScreenAI
      </Link>

      <div className="ms-auto d-flex gap-3 align-items-center flex-wrap">
        <Link
          className="nav-link text-white"
          to={getHomePath()}
        >
          Home
        </Link>

        {token && role === "candidate" && (
          <>
            <Link
              className="nav-link text-white"
              to="/jobs"
            >
              Jobs
            </Link>

            <Link
              className="nav-link text-white"
              to="/my-applications"
            >
              My Applications
            </Link>
          </>
        )}

        {token && role === "hr" && (
          <>
            <Link
              className="nav-link text-white"
              to="/my-jobs"
            >
              My Jobs
            </Link>

            <Link
              className="nav-link text-white"
              to="/add-job"
            >
              Add Job
            </Link>

            <Link
              className="nav-link text-white"
              to="/hr-applications"
            >
              Applications
            </Link>
          </>
        )}

        {!token && (
          <Link
            className="nav-link text-white"
            to="/jobs"
          >
            Jobs
          </Link>
        )}

        {token && (
          <Link
            className="nav-link text-white"
            to="/profile"
          >
            Profile
          </Link>
        )}

        {!token ? (
          <>
            <Link
              className="nav-link text-white"
              to="/login"
            >
              Login
            </Link>

            <Link
              className="btn btn-outline-light btn-sm"
              to="/register"
            >
              Register
            </Link>
          </>
        ) : (
          <button
            className="btn btn-outline-light btn-sm"
            onClick={handleLogout}
          >
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;