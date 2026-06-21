import axios from "axios";

import {
  clearAuthData,
  getAccessToken,
  getRefreshToken,
} from "../utils/auth";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, "");
export const MEDIA_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/+$/, "");

const API = axios.create({
  baseURL: API_BASE_URL,
});

let refreshRequest = null;

API.interceptors.request.use(
  (config) => {
    const accessToken =
      getAccessToken();

    if (accessToken) {
      config.headers.Authorization =
        `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const refreshAccessToken = async () => {
  const refreshToken =
    getRefreshToken();

  if (!refreshToken) {
    throw new Error(
      "Refresh token is unavailable."
    );
  }

  const response = await axios.post(
    `${API_BASE_URL}/accounts/token/refresh/`,
    {
      refresh: refreshToken,
    }
  );

  const newAccessToken =
    response.data.access;

  if (!newAccessToken) {
    throw new Error(
      "A new access token was not returned."
    );
  }

  localStorage.setItem(
    "access",
    newAccessToken
  );

  return newAccessToken;
};

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const responseData = error.response?.data;
    const errorCode = responseData?.code;

    // 1. Password change required (HTTP 403)
    if (status === 403 && errorCode === "password_change_required") {
      localStorage.setItem("must_change_password", "true");
      if (window.location.pathname !== "/force-password-change") {
        window.location.replace("/force-password-change");
      }
      return Promise.reject(error);
    }

    // 2. Session revoked (HTTP 401)
    if (status === 401 && errorCode === "session_revoked") {
      clearAuthData();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login?session=revoked");
      }
      return Promise.reject(error);
    }

    // 3. Inactive account (HTTP 401)
    if (status === 401 && errorCode === "inactive_account") {
      clearAuthData();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login?session=suspended");
      }
      return Promise.reject(error);
    }

    const isLoginRequest = originalRequest?.url?.includes("/accounts/login/");
    const isRegisterRequest = originalRequest?.url?.includes("/accounts/register/");
    const isRefreshRequest = originalRequest?.url?.includes("/accounts/token/refresh/");

    if (
      status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isLoginRequest ||
      isRegisterRequest ||
      isRefreshRequest
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshRequest) {
        refreshRequest = refreshAccessToken().finally(() => {
          refreshRequest = null;
        });
      }

      const newAccessToken = await refreshRequest;
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      // Await retry so failures are caught in the catch block
      return await API(originalRequest);
    } catch (refreshError) {
      clearAuthData();

      const refreshStatus = refreshError.response?.status;
      const refreshCode = refreshError.response?.data?.code;

      if (refreshStatus === 401 && refreshCode === "session_revoked") {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login?session=revoked");
        }
      } else if (refreshStatus === 401 && refreshCode === "inactive_account") {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login?session=suspended");
        }
      } else {
        if (window.location.pathname !== "/login") {
          window.location.replace("/login?session=expired");
        }
      }

      return Promise.reject(refreshError);
    }
  }
);

export default API;