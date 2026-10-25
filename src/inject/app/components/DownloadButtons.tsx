import { Button, Popover, Space, Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { useDirectoryPicker } from "../hooks/use-directory-picker";

dayjs.extend(relativeTime);

/** Asks for the target folder, then starts the download. Enter works as a shortcut. */
export function SelectFolderButton({ onStart }: { onStart(): void }) {
  const { requestDirectory } = useDirectoryPicker();

  const start = async () => {
    if (await requestDirectory()) onStart();
  };

  useEffect(() => {
    const onKeyPress = (event: KeyboardEvent) => {
      if (event.code === "Enter") void start();
    };
    document.body.addEventListener("keypress", onKeyPress);
    return () => document.body.removeEventListener("keypress", onKeyPress);
    // Registered once while the options step is shown, like the original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tooltip
      title={
        <div>
          Hotkey: <b>Enter</b>
        </div>
      }
    >
      <Button type="primary" onClick={() => void start()}>
        Select a Folder to Download
      </Button>
    </Tooltip>
  );
}

/** Offers to continue an interrupted download of the same album. */
export function ResumeButton({
  cursor,
  onResume,
}: {
  cursor: ResumeCursor | null;
  onResume(cursor: ResumeCursor): void;
}) {
  const { requestDirectory, hasDirectory } = useDirectoryPicker();
  if (!cursor) return null;

  const resume = async () => {
    if (hasDirectory() || (await requestDirectory())) onResume(cursor);
  };

  const updatedAt = dayjs.unix(cursor.lastUpdateAt);
  return (
    <Popover
      title="Resume downloading"
      content={
        <Space direction="vertical" size={8} style={{ whiteSpace: "nowrap", fontSize: 14 }}>
          <div>From: {updatedAt.fromNow()}</div>
          <div>Date: {updatedAt.format("MM/DD/YYYY hh:mm:ss")}</div>
          <div>Index: {cursor.lastIndex}</div>
        </Space>
      }
    >
      <Button type="primary" ghost onClick={() => void resume()}>
        Resume downloading?
      </Button>
    </Popover>
  );
}
