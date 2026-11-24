import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ColorModeProvider } from './components/ColorMode';
import { NotifyProvider } from './components/Notify';
import { PrintStyles } from './components/PrintStyles';
import { router } from './router';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 } } });

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ColorModeProvider>
      <PrintStyles />
      <QueryClientProvider client={queryClient}>
        <NotifyProvider>
          <AuthProvider>
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          </AuthProvider>
        </NotifyProvider>
      </QueryClientProvider>
    </ColorModeProvider>
  </StrictMode>,
);
