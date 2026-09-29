import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import CameraWallPage from "./pages/CameraWallPage";
import IncidentsPage from "./pages/IncidentsPage";
import LoginPage from "./pages/LoginPage";
import MonitoringPage from "./pages/MonitoringPage";
import RecordsPage from "./pages/RecordsPage";
import ReportsPage from "./pages/ReportsPage";
import RoomsPage from "./pages/RoomsPage";
import RulesPage from "./pages/RulesPage";
import TenantsPage from "./pages/TenantsPage";

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginRoute />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="/rooms" element={<RoomsPage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/incidents" element={<IncidentsPage />} />
      <Route path="/records" element={<RecordsPage />} />
      <Route path="/monitoring" element={<MonitoringPage />} />
      <Route path="/camera-wall" element={<CameraWallPage />} />
      <Route path="/reports" element={<ReportsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
