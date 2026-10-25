import { Button, Popover, Space, Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useRef } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { useDirectoryPicker } from "../hooks/use-directory-picker";

dayjs.extend(relativeTime);

function blurActiveElement(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/** Asks for the target folder, then starts the download. Enter works as a shortcut. */
export function SelectFolderButton({ onStart }: { onStart(): void }) {
  const { requestDirectory } = useDirectoryPicker();

  const start = async () => {
    blurActiveElement();
    if (await requestDirectory()) onStart();
  };

  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    const onKeyPress = (event: KeyboardEvent) => {
      if (event.code !== "Enter") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"], .ant-modal-confirm')) return;
      void startRef.current();
    };
    document.body.addEventListener("keypress", onKeyPress);
    return () => document.body.removeEventListener("keypress", onKeyPress);
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
    blurActiveElement();
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
