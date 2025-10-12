// src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import UnifiedDashboard from "./components/UnifiedDashboard";
import AccountSettings from "./components/AccountSettings";
import PrivateRoute from "./components/PrivateRoute";
import SubmissionUnderReview from "./components/SubmissionUnderReview";
import EmailVerification from "./components/EmailVerification";
import PasswordReset from "./components/PasswordReset";
import { ToastContainer } from "./components/ui/toast";

function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />
        <Route path="/verify-email" element={<EmailVerification />} />
        <Route path="/reset-password" element={<PasswordReset />} />
        <Route 
          path="/dashboard/masteradmin" 
          element={
            <PrivateRoute allowedRoles={["MasterAdmin"]}>
              <UnifiedDashboard userRole="masteradmin" />
            </PrivateRoute>
          }
        />
        <Route 
          path="/dashboard/superadmin" 
          element={
            <PrivateRoute allowedRoles={["SuperAdmin"]}>
              <UnifiedDashboard userRole="superadmin" />
            </PrivateRoute>
          }
        />
        <Route 
          path="/dashboard/admin" 
          element={
            <PrivateRoute allowedRoles={["Admin"]}>
              <UnifiedDashboard userRole="admin" />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard/dealer"
          element={
            <PrivateRoute allowedRoles={["Dealer"]}>
              <UnifiedDashboard userRole="dealer" />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard/marketer"
          element={
            <PrivateRoute allowedRoles={["Marketer"]}>
              <UnifiedDashboard userRole="marketer" />
            </PrivateRoute>
          }
        />
        {/* Account Settings Route - Available for all roles */}
        <Route
          path="/dashboard/account-settings"
          element={
            <PrivateRoute allowedRoles={["MasterAdmin", "SuperAdmin", "Admin", "Marketer", "Dealer"]}>
              <AccountSettings />
            </PrivateRoute>
          }
        />
        {/* Updated Submission Under Review Route for Marketers */}
        <Route
          path="/submission-under-review"
          element={
            <PrivateRoute allowedRoles={["Marketer"]}>
              <SubmissionUnderReview />
            </PrivateRoute>
          }
        />
        {/* Catch-all route for SPA routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
