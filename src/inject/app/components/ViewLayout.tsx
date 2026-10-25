import { DatabaseOutlined } from "@ant-design/icons";
import { App, Button, Row, Space, Tooltip } from "antd";
import type { ReactNode } from "react";
import { downloadHistory, useDownloadHistorySize } from "../state/download-history";

/** Shows how many downloaded ids are remembered for "Skip Downloaded", and clears them on click. */
function DownloadedIdsButton() {
  const size = useDownloadHistorySize();
  const { message } = App.useApp();
  if (size === 0) return null;

  const clear = async () => {
    await downloadHistory.clear();
    void message.success("Cleanup successful.");
  };

  return (
    <Tooltip
      title={`${size.toLocaleString()} downloaded file ids are stored in the browser and used by "Skip Downloaded". Click to clear them.`}
    >
      <Button icon={<DatabaseOutlined />} size="small" type="text" onClick={() => void clear()}>
        <span style={{ display: "inline-block", minWidth: 50, textAlign: "left", fontSize: 12 }}>
          {size.toLocaleString()}
        </span>
      </Button>
    </Tooltip>
  );
}

interface ViewLayoutProps {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** Common frame of the modal's views: content area plus a footer row. */
export function ViewLayout({ title, footer, children }: ViewLayoutProps) {
  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div>
        {title && <div>{title}</div>}
        <div style={{ minHeight: 420 }}>{children}</div>
      </div>
      <Row justify="space-between" style={{ width: "100%" }}>
        <Space size={4}>
          <DownloadedIdsButton />
        </Space>
        {footer}
      </Row>
    </Space>
  );
}
