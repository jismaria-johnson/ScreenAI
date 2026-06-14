import axios from "axios";

import {
  clearAuthData,
  getAccessToken,
  getRefreshToken,
} from "../utils/auth";

const API_BASE_URL =
  "http://127.0.0.1:8000/api";

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
    const originalRequest =
      error.config;

    const status =
      error.response?.status;

    const isLoginRequest =
      originalRequest?.url?.includes(
        "/accounts/login/"
      );

    const isRegisterRequest =
      originalRequest?.url?.includes(
        "/accounts/register/"
      );

    const isRefreshRequest =
      originalRequest?.url?.includes(
        "/accounts/token/refresh/"
      );

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
        refreshRequest =
          refreshAccessToken().finally(
            () => {
              refreshRequest = null;
            }
          );
      }

      const newAccessToken =
        await refreshRequest;

      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      return API(originalRequest);
    } catch (refreshError) {
      clearAuthData();

      if (
        window.location.pathname !==
        "/login"
      ) {
        window.location.replace(
          "/login?session=expired"
        );
      }

      return Promise.reject(
        refreshError
      );
    }
  }
);

export default API;