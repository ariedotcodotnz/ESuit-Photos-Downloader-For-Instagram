import { App } from "antd";
import { useCallback, useState } from "react";

/**
 * Wraps an async action with a busy flag (for spinners) and reports failures
 * with a toast, so injected buttons never leave unhandled rejections behind.
 */
export function useBusyAction(failureMessage = "Download failed") {
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
      } catch (error) {
        console.error(error);
        void message.error(failureMessage);
      } finally {
        setBusy(false);
      }
    },
    [failureMessage, message],
  );

  return { busy, run };
}
