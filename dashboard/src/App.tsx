import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DASHBOARD_NAV_ITEMS, ROUTES } from './config/routes';
import { AuthProvider } from './features/auth/AuthProvider';
import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { TenantProvider } from './features/businesses/TenantProvider';
import { useSystemStatus } from './hooks/useSystemStatus';
import { useTheme } from './hooks/useTheme';
import { AppShell } from './layouts/AppShell';
import { BusinessProfilePage } from './pages/BusinessProfilePage';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { LocationsPage } from './pages/LocationsPage';
import { LoginPage } from './pages/LoginPage';
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage';
import { AssistantsPage } from './pages/AssistantsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { StaffPage } from './pages/StaffPage';

function DashboardRoutes() {
  const { pathname } = useLocation();
  const { preference, setPreference } = useTheme();
  const system = useSystemStatus();

  const currentNav = DASHBOARD_NAV_ITEMS.find((item) => item.path === pathname);
  const pageTitle =
    pathname === ROUTES.login
      ? 'Sign in'
      : currentNav
        ? currentNav.label
        : 'Overview';

  useEffect(() => {
    document.title = `${pageTitle} · ${system.branding.productName}`;
  }, [pageTitle, system.branding.productName]);

  return (
    <Routes>
      <Route
        path={ROUTES.login}
        element={
          <LoginPage
            branding={system.branding}
            themePreference={preference}
            onSelectTheme={setPreference}
          />
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route
          path={ROUTES.overview}
          element={
            <AppShell
              branding={system.branding}
              themePreference={preference}
              onSelectTheme={setPreference}
              pageTitle={pageTitle}
            >
              <DashboardHomePage />
            </AppShell>
          }
        />

        <Route
          path={ROUTES.businesses}
          element={
            <AppShell
              branding={system.branding}
              themePreference={preference}
              onSelectTheme={setPreference}
              pageTitle="Business Profile"
            >
              <BusinessProfilePage />
            </AppShell>
          }
        />

        <Route
          path={ROUTES.locations}
          element={
            <AppShell
              branding={system.branding}
              themePreference={preference}
              onSelectTheme={setPreference}
              pageTitle="Locations"
            >
              <LocationsPage />
            </AppShell>
          }
        />

        <Route path={ROUTES.conversations} element={<AppShell branding={system.branding} themePreference={preference} onSelectTheme={setPreference} pageTitle="Conversations"><ConversationsPage /></AppShell>} />

        <Route path={ROUTES.assistants} element={<AppShell branding={system.branding} themePreference={preference} onSelectTheme={setPreference} pageTitle="AI Assistants"><AssistantsPage /></AppShell>} />

        <Route path={ROUTES.knowledge} element={<AppShell branding={system.branding} themePreference={preference} onSelectTheme={setPreference} pageTitle="Knowledge Base"><KnowledgePage /></AppShell>} />

        <Route
          path={ROUTES.staff}
          element={
            <AppShell
              branding={system.branding}
              themePreference={preference}
              onSelectTheme={setPreference}
              pageTitle="Staff & Access"
            >
              <StaffPage />
            </AppShell>
          }
        />

        <Route
          path={ROUTES.diagnostics}
          element={
            <AppShell
              branding={system.branding}
              themePreference={preference}
              onSelectTheme={setPreference}
              pageTitle="System Diagnostics"
            >
              <DiagnosticsPage system={system} onRefreshStatus={system.refresh} />
            </AppShell>
          }
        />

        {DASHBOARD_NAV_ITEMS.filter((item) => !item.implemented).map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={
              <AppShell
                branding={system.branding}
                themePreference={preference}
                onSelectTheme={setPreference}
                pageTitle={item.label}
              >
                <ModulePlaceholderPage module={item} />
              </AppShell>
            }
          />
        ))}
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.overview} replace />} />
    </Routes>
  );
}

function DashboardProviders() {
  return (
    <>
      <AuthProvider>
        <TenantProvider>
          <DashboardRoutes />
        </TenantProvider>
      </AuthProvider>
    </>
  );
}

const router = createBrowserRouter([{ path: '*', element: <DashboardProviders /> }]);

export function App() { return <RouterProvider router={router} />; }

export default App;
