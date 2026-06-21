import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  getDashboardPath,
  getUserRole,
  isLoggedIn,
  getMustChangePassword,
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

  const mustChange = getMustChangePassword();

  if (mustChange) {
    if (location.pathname !== "/force-password-change") {
      return (
        <Navigate
          to="/force-password-change"
          replace
        />
      );
    }
  } else {
    if (location.pathname === "/force-password-change") {
      return (
        <Navigate
          to={getDashboardPath()}
          replace
        />
      );
    }
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