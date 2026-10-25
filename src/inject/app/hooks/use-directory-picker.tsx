import { App } from "antd";
import { useCallback } from "react";
import { errorMessage } from "@/shared/logger";
import { hasDownloadDirectory, pickDownloadDirectory } from "../download/filesystem";

function describePickerError(error: unknown) {
  const text = errorMessage(error);
  if (text.includes("NotAllowedError") || text.includes("not allowed")) {
    return (
      <div>
        Unable to open the folder picker. This may be because:
        <br />
        1. The previously selected folder is on a disconnected network drive.
        <br />
        2. The website is not allowed to download files (check the site settings).
      </div>
    );
  }
  if (text.includes("showDirectoryPicker")) {
    return "Your browser has the File System Access API disabled (e.g. Brave: enable brave://flags/#file-system-access-api).";
  }
  return "Permission denied";
}

/** Asks for (or reuses) the folder bulk downloads are written to. */
export function useDirectoryPicker() {
  const { message } = App.useApp();

  const requestDirectory = useCallback(async (): Promise<boolean> => {
    try {
      await pickDownloadDirectory();
      return true;
    } catch (error) {
      console.error(error);
      // Closing the picker is not an error worth reporting.
      if ((error as DOMException | undefined)?.name !== "AbortError") void message.error(describePickerError(error));
      return false;
    }
  }, [message]);

  return { requestDirectory, hasDirectory: hasDownloadDirectory };
}
