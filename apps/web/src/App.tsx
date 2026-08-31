import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { OperationsPage } from "./pages/OperationsPage";
import { RequestsPage } from "./pages/RequestsPage";
import { TimeTrackingPage } from "./pages/TimeTrackingPage";
import { PnLPage } from "./pages/PnLPage";
import { DDSPage } from "./pages/DDSPage";
import { DictionariesPage } from "./pages/admin/DictionariesPage";
import { UsersPage } from "./pages/admin/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/time-tracking" element={<TimeTrackingPage />} />
        <Route path="/reports/pnl" element={<PnLPage />} />
        <Route path="/reports/dds" element={<DDSPage />} />
        <Route path="/admin/dictionaries" element={<DictionariesPage />} />
        <Route path="/admin/users" element={<UsersPage />} />
      </Route>
    </Routes>
  );
}
