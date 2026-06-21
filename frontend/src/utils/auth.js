export const getAccessToken = () => {
  return localStorage.getItem("access");
};

export const getRefreshToken = () => {
  return localStorage.getItem("refresh");
};

export const getUserRole = () => {
  return localStorage.getItem("role");
};

export const getMustChangePassword = () => {
  return localStorage.getItem("must_change_password") === "true";
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
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("role");
  localStorage.removeItem("must_change_password");
};

export const saveAuthData = ({
  access,
  refresh,
  role,
  must_change_password,
}) => {
  if (access) {
    localStorage.setItem(
      "access",
      access
    );
  }

  if (refresh) {
    localStorage.setItem(
      "refresh",
      refresh
    );
  }

  if (role) {
    localStorage.setItem(
      "role",
      role
    );
  }

  if (must_change_password !== undefined) {
    localStorage.setItem(
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