import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Last-resort net for render-time crashes (a malformed record, a field
// that's missing on an older cached item) so the user sees a friendly
// screen instead of a blank page or a raw JS error. It cannot catch
// errors from event handlers or async code (e.g. inside a .then()) —
// those are handled locally where they're thrown.
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("render_crash", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="bg-canvas px-5 py-12 text-ink">
          <section className="mx-auto max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-accent-strong">
              GreenLens
            </p>

            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-400/40 bg-red-950/40 p-4 leading-6 text-red-100"
            >
              Κάτι πήγε στραβά. Δοκιμάστε ξανά.
            </p>

            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.assign("/");
              }}
              className="mt-5 h-14 w-full rounded-xl bg-accent font-bold text-on-accent"
            >
              Αρχική οθόνη
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
