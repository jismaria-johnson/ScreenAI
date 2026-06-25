export const getAccessToken = () => {
  return sessionStorage.getItem("access");
};

export const getRefreshToken = () => {
  return sessionStorage.getItem("refresh");
};

export const getUserRole = () => {
  return sessionStorage.getItem("role");
};

export const getMustChangePassword = () => {
  return sessionStorage.getItem("must_change_password") === "true";
};

export const isLoggedIn = () => {
  /*
   * The access token may temporarily be missing
   * or expired.
   *
   * As long as a refresh token and role exist,
   * protected pages can open and Axios can request
   * a new access token automatically.
   */
  return Boolean(
    getRefreshToken() &&
      getUserRole()
  );
};

export const clearAuthData = () => {
  sessionStorage.removeItem("access");
  sessionStorage.removeItem("refresh");
  sessionStorage.removeItem("role");
  sessionStorage.removeItem("must_change_password");
};

export const saveAuthData = ({
  access,
  refresh,
  role,
  must_change_password,
}) => {
  if (access) {
    sessionStorage.setItem(
      "access",
      access
    );
  }

  if (refresh) {
    sessionStorage.setItem(
      "refresh",
      refresh
    );
  }

  if (role) {
    sessionStorage.setItem(
      "role",
      role
    );
  }

  if (must_change_password !== undefined) {
    sessionStorage.setItem(
      "must_change_password",
      String(must_change_password)
    );
  }
};

export const getDashboardPath = () => {
  const role = getUserRole();

  if (role === "hr") {
    return "/hr-dashboard";
  }

  if (role === "admin") {
    return "/admin-dashboard";
  }

  return "/";
};
