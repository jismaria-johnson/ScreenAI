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

  return (
    <nav className="navbar navbar-expand-lg navbar-dark px-4" style={{ backgroundColor: "var(--screenai-surface)", borderBottom: "1px solid var(--screenai-border)" }}>
      <Link
        className="navbar-brand fw-bold"
        to="/"
      >
        ScreenAI
      </Link>

      <div className="ms-auto d-flex gap-3 align-items-center flex-wrap">
        <Link
          className="nav-link text-white"
          to="/"
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
                  to="/hr-dashboard"
                >
                  HR Dashboard
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
              Login
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;