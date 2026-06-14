import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  getDashboardPath,
  getUserRole,
  isLoggedIn,
} from "../utils/auth";

function ProtectedRoute({
  children,
  allowedRoles = [],
}) {
  const location = useLocation();

  if (!isLoggedIn()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  const role = getUserRole();

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(role)
  ) {
    return (
      <Navigate
        to={getDashboardPath()}
        replace
      />
    );
  }

  return children;
}

export default ProtectedRoute;