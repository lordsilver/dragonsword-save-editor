import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-svh items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
          <div className="flex size-11 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <h1 className="mt-4 font-heading text-lg font-semibold tracking-tight">The interface hit an error</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing was written to your save. Reload the window to start from the last successful state.
          </p>
          <pre className="scroll-thin mt-4 max-h-40 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px] whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            <RefreshCw />
            Reload the editor
          </Button>
        </div>
      </div>
    );
  }
}
