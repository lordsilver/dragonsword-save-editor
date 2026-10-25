import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app root element');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
        <Toaster position="bottom-right" closeButton />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
