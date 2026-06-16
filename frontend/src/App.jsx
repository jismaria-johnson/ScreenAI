import {
  Route,
  Routes,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import AddJob from "./pages/AddJob";
import EditJob from "./pages/EditJob";
import EditProfile from "./pages/EditProfile";
import Home from "./pages/Home";
import HRApplications from "./pages/HRApplications";
import HRDashboard from "./pages/HRDashboard";
import Login from "./pages/Login";
import MyJobs from "./pages/MyJobs";
import Profile from "./pages/Profile";
import PublicApplyJob from "./pages/PublicApplyJob";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <>
      <Navbar />

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
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <MyJobs />
            </ProtectedRoute>
          }
        />

        <Route
          path="/add-job"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <AddJob />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-job/:jobId"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <EditJob />
            </ProtectedRoute>
          }
        />

        <Route
          path="/hr-applications"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <HRApplications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-profile"
          element={
            <ProtectedRoute
              allowedRoles={["hr"]}
            >
              <EditProfile />
            </ProtectedRoute>
          }
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
    </>
  );
}

export default App;