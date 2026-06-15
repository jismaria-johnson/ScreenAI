import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  clearAuthData,
  getAccessToken,
} from "../utils/auth";

function Navbar() {
  const navigate = useNavigate();

  const token = getAccessToken();

  const handleLogout = () => {
    clearAuthData();

    navigate("/", {
      replace: true,
    });
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4">
      <Link
        className="navbar-brand fw-bold"
        to={
          token
            ? "/hr-dashboard"
            : "/"
        }
      >
        ScreenAI
      </Link>

      <div className="ms-auto d-flex gap-3 align-items-center flex-wrap">
        <Link
          className="nav-link text-white"
          to={
            token
              ? "/hr-dashboard"
              : "/"
          }
        >
          Home
        </Link>

        {token ? (
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

            <Link
              className="nav-link text-white"
              to="/profile"
            >
              Profile
            </Link>

            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link
              className="nav-link text-white"
              to="/login"
            >
              HR Login
            </Link>

            <Link
              className="btn btn-outline-light btn-sm"
              to="/register"
            >
              HR Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;