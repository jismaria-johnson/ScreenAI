import { Link } from "react-router-dom";

function Navbar() {
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

        <Link
          className="nav-link text-white"
          to="/login"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;