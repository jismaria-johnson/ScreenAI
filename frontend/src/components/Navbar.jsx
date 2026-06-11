import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem("access");
  const role = localStorage.getItem("role");

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-4">
      <Link className="navbar-brand fw-bold" to="/">
        ScreenAI
      </Link>

      <div className="ms-auto d-flex gap-3 align-items-center">
        <Link className="nav-link text-white" to="/">
          Home
        </Link>

        <Link className="nav-link text-white" to="/jobs">
          Jobs
        </Link>

        {token && role === "hr" && (
          <Link className="nav-link text-white" to="/add-job">
            Add Job
          </Link>
        )}

        {!token ? (
          <>
            <Link className="nav-link text-white" to="/login">
              Login
            </Link>
            <Link className="btn btn-outline-light btn-sm" to="/register">
              Register
            </Link>
          </>
        ) : (
          <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;