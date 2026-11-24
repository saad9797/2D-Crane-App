import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { NotifyProvider } from '../components/Notify';
import { EditorPage } from '../pages/EditorPage';
import { buildTheme } from '../theme';

export function withProviders(ui: ReactElement): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <ThemeProvider theme={buildTheme('light')}>
      <QueryClientProvider client={client}>
        <NotifyProvider>{ui}</NotifyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** Renders the editor routes (data router, because the editor uses useBlocker). */
export function renderEditorAt(path: string) {
  const routes: RouteObject[] = [
    { path: '/', element: <div>designs list</div> },
    { path: '/design/new', element: <EditorPage /> },
    { path: '/design/:id', element: <EditorPage /> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [path], future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } });
  const utils = render(
    withProviders(
      <AuthProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AuthProvider>,
    ),
  );
  return { router, ...utils };
}
