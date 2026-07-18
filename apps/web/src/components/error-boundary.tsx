'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Report to Sentry if available
    if (typeof window !== 'undefined' && 'Sentry' in window) {
      (window as unknown as { Sentry: { captureException: (error: Error, extra: { extra: React.ErrorInfo }) => void } }).Sentry.captureException(error, { extra: errorInfo });
    }
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-error/30 bg-error-container p-6 text-center ">
              <h2 className="text-lg font-semibold text-on-error-container ">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-error ">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="mt-4 rounded-lg bg-error px-4 py-2 text-sm text-white hover:bg-error"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
