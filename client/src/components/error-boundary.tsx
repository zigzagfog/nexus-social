import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string | null; }

/**
 * ErrorBoundary — catches any unhandled React render errors and shows
 * a friendly recovery screen instead of a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err?.message ?? "An unexpected error occurred." };
  }

  componentDidCatch(err: Error, info: { componentStack: string }) {
    // Log to console for debugging; could send to a logging service in future
    console.error("[ErrorBoundary]", err, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {this.state.error}
          </p>
          <Button
            onClick={this.handleReset}
            className="w-full gap-2"
            data-testid="button-error-retry"
          >
            <RefreshCw className="w-4 h-4" />
            Go back to home
          </Button>
          <p className="text-xs text-muted-foreground">
            If this keeps happening, refresh the page.
          </p>
        </div>
      </div>
    );
  }
}
