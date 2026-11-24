import { CircularProgress, Box } from '@mui/material';
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { DesignsPage } from './pages/DesignsPage';
import { EditorPage } from './pages/EditorPage';
import { LoginPage } from './pages/LoginPage';

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} role="status" aria-label="Loading">
        <CircularProgress />
      </Box>
    );
  }
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DesignsPage /> },
          { path: 'design/new', element: <EditorPage /> },
          { path: 'design/:id', element: <EditorPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
], { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });
