import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onError?: (error: Error, errorInfo: any) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class DatabaseErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('DatabaseErrorBoundary caught an error:', error, errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Check if this is a DuckDB-related error
    const errorMessage = error.message || String(error);
    const isDuckDBError = errorMessage.includes('index out of bounds') ||
                         errorMessage.includes('indirect call to null') ||
                         errorMessage.includes('RuntimeError') ||
                         errorMessage.includes('connection');

    if (isDuckDBError) {
      console.warn('DuckDB error detected in component, may need connection refresh');
    }
  }

  render() {
    if (this.state.hasError) {
      const fallbackMessage = this.props.fallbackMessage || 'This visualization encountered an error';

      return (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-center">
          <div className="text-red-600 mb-2">
            <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-800 text-sm font-medium mb-2">{fallbackMessage}</p>
          <p className="text-red-600 text-xs mb-3">
            {this.state.error?.message || 'Unknown error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default DatabaseErrorBoundary;