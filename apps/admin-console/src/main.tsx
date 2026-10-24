import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { isApiError } from '@tgs/api-client';
import '@fontsource-variable/inter';
import './index.css';
import { AuthProvider } from './app/auth';
import { router } from './app/router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry only transient failures; never retry auth or permission errors.
      retry: (count, error) => count < 2 && (!isApiError(error) || error.code === 'NETWORK'),
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root missing in index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
