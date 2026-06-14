import {
  Route,
  Routes,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import AddJob from "./pages/AddJob";
import ApplyJob from "./pages/ApplyJob";
import CandidateDashboard from "./pages/CandidateDashboard";
import EditJob from "./pages/EditJob";
import EditProfile from "./pages/EditProfile";
import Home from "./pages/Home";
import HRApplications from "./pages/HRApplications";
import HRDashboard from "./pages/HRDashboard";
import JobList from "./pages/JobList";
import Login from "./pages/Login";
import MyApplications from "./pages/MyApplications";
import MyJobs from "./pages/MyJobs";
import Profile from "./pages/Profile";
import Register from "./pages/Register";

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
          path="/jobs"
          element={<JobList />}
        />

        <Route
          path="/candidate-dashboard"
          element={
            <ProtectedRoute
              allowedRoles={[
                "candidate",
              ]}
            >
              <CandidateDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-applications"
          element={
            <ProtectedRoute
              allowedRoles={[
                "candidate",
              ]}
            >
              <MyApplications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/apply/:jobId"
          element={
            <ProtectedRoute
              allowedRoles={[
                "candidate",
              ]}
            >
              <ApplyJob />
            </ProtectedRoute>
          }
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
              allowedRoles={[
                "candidate",
                "hr",
              ]}
            >
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-profile"
          element={
            <ProtectedRoute
              allowedRoles={[
                "candidate",
                "hr",
              ]}
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