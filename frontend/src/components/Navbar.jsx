import {
  Link,
  useNavigate,
} from "react-router-dom";

import {
  clearAuthData,
  getAccessToken,
  getUserRole,
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

  const isUserAdmin = getUserRole() === "admin";
  const userHomePath = token
    ? (isUserAdmin ? "/admin-dashboard" : "/hr-dashboard")
    : "/";

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4">
      <Link
        className="navbar-brand fw-bold"
        to={userHomePath}
      >
        ScreenAI
      </Link>

      <div className="ms-auto d-flex gap-3 align-items-center flex-wrap">
        <Link
          className="nav-link text-white"
          to={userHomePath}
        >
          Home
        </Link>

        {token ? (
          <>
            {isUserAdmin ? (
              <>
                <Link
                  className="nav-link text-white"
                  to="/admin-dashboard"
                >
                  Admin Dashboard
                </Link>
              </>
            ) : (
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
              </>
            )}

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