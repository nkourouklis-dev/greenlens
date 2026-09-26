import { useEffect, useSyncExternalStore } from "react";

/**
 * Lets a full-screen view (the camera screens) hide the app's own chrome —
 * the floating tab bar and its back button — while it is mounted.
 *
 * A counter rather than a flag, so two views overlapping during a route
 * change can't leave the chrome hidden (or shown) by unmounting in the
 * "wrong" order.
 */
let hiders = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call from a full-screen view: the chrome stays hidden while it is mounted. */
export function useHideAppChrome() {
  useEffect(() => {
    hiders += 1;
    emit();

    return () => {
      hiders -= 1;
      emit();
    };
  }, []);
}

/** True while any full-screen view is mounted. */
export function useAppChromeHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hiders > 0,
    () => false,
  );
}
