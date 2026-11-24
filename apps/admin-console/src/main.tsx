import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { isApiError } from '@tgs/api-client';
// Figtree variable, the phone's family (D-150, docs/25).
import '@fontsource-variable/figtree';
import '@juspay/blend-design-system/style.css';
import './index.css';
import { AuthProvider } from './app/auth';
import { router } from './app/router';
import { AppThemeProvider } from './app/theme';
import { FileViewerHost } from './components/FileViewer';

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
        <AppThemeProvider>
          <RouterProvider router={router} />
          <FileViewerHost />
        </AppThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
