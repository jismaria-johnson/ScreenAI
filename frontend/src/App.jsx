import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CandidateDashboard from "./pages/CandidateDashboard";
import HRDashboard from "./pages/HRDashboard";
import JobList from "./pages/JobList";
import AddJob from "./pages/AddJob";

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/candidate-dashboard" element={<CandidateDashboard />} />
        <Route path="/hr-dashboard" element={<HRDashboard />} />
        <Route path="/jobs" element={<JobList />} />
        <Route path="/add-job" element={<AddJob />} />
      </Routes>
    </>
  );
}

export default App;