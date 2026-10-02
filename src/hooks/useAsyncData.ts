import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { logError, toUserMessage, type ErrorContext } from "@/services/errors";

export interface AsyncData<T> {
  /** null until the first successful load. An EMPTY result is `[]`/`{}`, never an error. */
  data: T | null;
  /** true only for the first load (show skeletons). */
  loading: boolean;
  /** true during pull-to-refresh (keep showing existing data). */
  refreshing: boolean;
  /** Human-readable message (never raw Firebase text) when the last load failed. */
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

/**
 * Loads data with consistent loading / error / refresh handling:
 *  - ignores results that arrive after unmount or after a newer request started
 *  - keeps previously loaded data visible when a refresh fails
 *  - maps failures to user-friendly copy and logs the technical detail
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  options: { enabled?: boolean; context?: ErrorContext } = {}
): AsyncData<T> {
  const { enabled = true, context = "generic" } = options;
  const [state, setState] = useState<{ data: T | null; loading: boolean; refreshing: boolean; error: string | null }>({
    data: null,
    loading: enabled,
    refreshing: false,
    error: null,
  });
  const sequence = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(
    async (mode: "initial" | "refresh") => {
      const mine = ++sequence.current;
      setState((s) => ({ ...s, loading: mode === "initial", refreshing: mode === "refresh", error: null }));
      try {
        const data = await loaderRef.current();
        if (mine !== sequence.current) return;
        setState({ data, loading: false, refreshing: false, error: null });
      } catch (error) {
        if (mine !== sequence.current) return;
        logError(`useAsyncData(${context})`, error);
        setState((s) => ({ data: s.data, loading: false, refreshing: false, error: toUserMessage(error, context) }));
      }
    },
    [context]
  );

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, refreshing: false, error: null });
      return;
    }
    void run("initial");
    return () => {
      sequence.current += 1; // invalidate in-flight work on unmount / dependency change
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setState((s) => ({ ...s, data: typeof updater === "function" ? (updater as (p: T | null) => T | null)(s.data) : updater }));
  }, []);

  return {
    ...state,
    reload: () => run("initial"),
    refresh: () => run("refresh"),
    setData,
  };
}
