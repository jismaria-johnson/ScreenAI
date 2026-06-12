import { Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CandidateDashboard from "./pages/CandidateDashboard";
import HRDashboard from "./pages/HRDashboard";
import JobList from "./pages/JobList";
import AddJob from "./pages/AddJob";
import EditJob from "./pages/EditJob";
import MyJobs from "./pages/MyJobs";
import ApplyJob from "./pages/ApplyJob";
import MyApplications from "./pages/MyApplications";
import HRApplications from "./pages/HRApplications";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/register"
          element={<Register />}
        />

        <Route
          path="/candidate-dashboard"
          element={<CandidateDashboard />}
        />

        <Route
          path="/hr-dashboard"
          element={<HRDashboard />}
        />

        <Route
          path="/jobs"
          element={<JobList />}
        />

        <Route
          path="/my-jobs"
          element={<MyJobs />}
        />

        <Route
          path="/add-job"
          element={<AddJob />}
        />

        <Route
          path="/edit-job/:jobId"
          element={<EditJob />}
        />

        <Route
          path="/apply/:jobId"
          element={<ApplyJob />}
        />

        <Route
          path="/my-applications"
          element={<MyApplications />}
        />

        <Route
          path="/hr-applications"
          element={<HRApplications />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

        <Route
          path="/edit-profile"
          element={<EditProfile />}
        />
      </Routes>
    </>
  );
}

export default App;