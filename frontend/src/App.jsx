import {
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

import Home from "./pages/Home";
import HRDashboard from "./pages/HRDashboard";
import Login from "./pages/Login";
import PublicApplyJob from "./pages/PublicApplyJob";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import CandidateAssessmentPage from "./pages/CandidateAssessmentPage";

function App() {
  const location = useLocation();
  const showNavbar = !location.pathname.startsWith("/hr-dashboard") && !location.pathname.startsWith("/admin-dashboard") && location.pathname !== "/force-password-change";

  return (
    <div className="screenai-app">
      {showNavbar && <Navbar />}

      <Routes>
        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/apply/public/:token"
          element={<PublicApplyJob />}
        />

        <Route
          path="/assessments/take/:token"
          element={
            <ErrorBoundary>
              <CandidateAssessmentPage />
            </ErrorBoundary>
          }
        />

        <Route
          path="/force-password-change"
          element={
            <ProtectedRoute
              allowedRoles={["hr", "admin"]}
            >
              <ErrorBoundary>
                <ForcePasswordChange />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        <Route
          path="/hr-dashboard"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <ErrorBoundary>
                <HRDashboard />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute
              allowedRoles={["admin"]}
            >
              <ErrorBoundary>
                <AdminDashboard />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-jobs"
          element={<Navigate to="/hr-dashboard?tab=jobs" replace />}
        />

        <Route
          path="/add-job"
          element={<Navigate to="/hr-dashboard?tab=jobs" replace />}
        />

        <Route
          path="/edit-job/:jobId"
          element={<Navigate to="/hr-dashboard?tab=jobs" replace />}
        />

        <Route
          path="/hr-applications"
          element={<Navigate to="/hr-dashboard?tab=candidates" replace />}
        />

        <Route
          path="/profile"
          element={<Navigate to="/hr-dashboard?tab=profile" replace />}
        />

        <Route
          path="/edit-profile"
          element={<Navigate to="/hr-dashboard?tab=profile" replace />}
        />

        <Route
          path="*"
          element={
            <div className="container py-5">
              <div className="alert alert-warning">
                Page not found.
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  );
}

export default App;