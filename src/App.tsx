import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, ProtectedRoute, AdminRoute, SuperAdminRoute } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import News from "./pages/News";
import Payments from "./pages/Payments";
import Reservations from "./pages/Reservations";
import Tickets from "./pages/Tickets";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import AccessQR from "./pages/AccessQR";
import MyAccess from "./pages/MyAccess";
import Dues from "./pages/Dues";
import NotFound from "./pages/NotFound";

// Admin Pages
import ManagePayments from "./pages/admin/ManagePayments";
import ManageTickets from "./pages/admin/ManageTickets";
import ManageUsers from "./pages/admin/ManageUsers";
import ManageReservations from "./pages/admin/ManageReservations";
import ManageResources from "./pages/admin/ManageResources";
import ManageDues from "./pages/admin/ManageDues";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminOverview from "./pages/admin/AdminOverview";
import VerifyQR from "./pages/admin/VerifyQR";
import ReservationReports from "./pages/admin/ReservationReports";
import ManageAccess from "./pages/admin/ManageAccess";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />

              {/* Resident Routes (require authentication) */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/news" element={<ProtectedRoute><News /></ProtectedRoute>} />
              <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
              <Route path="/reservations" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/dues" element={<ProtectedRoute><Dues /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/access" element={<ProtectedRoute><AccessQR /></ProtectedRoute>} />
              <Route path="/my-access" element={<ProtectedRoute><MyAccess /></ProtectedRoute>} />

              {/* Admin Routes (require admin role) */}
              <Route path="/admin" element={<AdminRoute><AdminOverview /></AdminRoute>} />
              <Route path="/admin/payments" element={<AdminRoute><ManagePayments /></AdminRoute>} />
              <Route path="/admin/tickets" element={<AdminRoute><ManageTickets /></AdminRoute>} />
              <Route path="/admin/reservations" element={<AdminRoute><ManageReservations /></AdminRoute>} />
              <Route path="/admin/resources" element={<AdminRoute><ManageResources /></AdminRoute>} />
              <Route path="/admin/dues" element={<AdminRoute><ManageDues /></AdminRoute>} />
              <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
              <Route path="/admin/reports" element={<AdminRoute><ReservationReports /></AdminRoute>} />
              <Route path="/admin/access" element={<AdminRoute><ManageAccess /></AdminRoute>} />

              {/* Admin Access Control */}
              <Route path="/admin/users" element={<AdminRoute><ManageUsers /></AdminRoute>} />
              <Route path="/admin/verify-qr" element={<AdminRoute><VerifyQR /></AdminRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
