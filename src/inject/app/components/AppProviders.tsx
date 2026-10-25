import { App, ConfigProvider, theme } from "antd";
import { useMemo, type ReactNode } from "react";
import { isDarkMode, isLoggedIn, requireIg } from "../ig/modules";
import { NotWorkingNotice } from "./NotWorkingNotice";

function renderFallback(error: unknown) {
  console.error(error);
  return <NotWorkingNotice isLoggedIn={isLoggedIn()} />;
}

/**
 * Wraps every piece of injected UI: an Instagram error boundary (so a crash
 * never takes Instagram's own UI down), antd theming that follows Instagram's
 * dark mode, and antd's App context for message/modal hooks.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const ErrorBoundary = useMemo(() => requireIg("CometErrorBoundary.react"), []);
  const dark = isDarkMode();

  return (
    <ErrorBoundary fallback={renderFallback}>
      <ConfigProvider
        theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { motion: false } }}
      >
        {/* component={false}: no wrapper element, so Instagram's layout is untouched. */}
        <App component={false}>{children}</App>
      </ConfigProvider>
    </ErrorBoundary>
  );
}
