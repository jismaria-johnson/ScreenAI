import {
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import HRDashboard from "./pages/HRDashboard";
import Login from "./pages/Login";
import PublicApplyJob from "./pages/PublicApplyJob";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  const location = useLocation();
  const showNavbar = !["/hr-dashboard", "/admin-dashboard"].includes(location.pathname);

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
          path="/hr-dashboard"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <HRDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute
              allowedRoles={["admin"]}
            >
              <AdminDashboard />
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
          element={<Navigate to="/hr-dashboard?tab=applications" replace />}
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