import { SettingOutlined } from "@ant-design/icons";
import { Alert, Button, Divider, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { APP_NAME, INSTAGRAM_ORIGIN } from "@/shared/constants";
import { getBucket, onBucketChanged } from "@/shared/storage";
import { AppHeader } from "../shared/PageShell";

const HOTKEY = /mac/i.test(navigator.platform) ? "⌘+Shift+D" : "Ctrl+Shift+D";

function useDownloadedCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void getBucket("downloadedFileIds").then((ids) => setCount(ids.length));
    return onBucketChanged("downloadedFileIds", (ids) => setCount(ids.length));
  }, []);
  return count;
}

export function Popup() {
  const downloaded = useDownloadedCount();

  const openInstagram = async () => {
    await chrome.tabs.create({ url: `${INSTAGRAM_ORIGIN}/`, active: true });
    window.close();
  };

  return (
    <div className="popup">
      <AppHeader />
      <Divider style={{ margin: "8px 0 12px" }} />
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type="info"
          showIcon
          message="Everything happens on Instagram itself"
          description={`${APP_NAME} adds its buttons directly to instagram.com. Open Instagram to start downloading.`}
          action={
            <Button type="primary" size="small" onClick={() => void openInstagram()}>
              Open Instagram
            </Button>
          }
        />
        <div>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            How to use
          </Typography.Title>
          <ul>
            <li>
              Click <b>{APP_NAME}</b> in Instagram&apos;s left sidebar to download a whole profile, saved collection or
              search result, or to pick posts one by one.
            </li>
            <li>Use the download icon next to the save button of any post, reel or story.</li>
            <li>
              Press <b>{HOTKEY}</b> (or right-click → &quot;Download with {APP_NAME}&quot;) on a post or reel page.
            </li>
            <li>Hover a profile picture to save it in HD.</li>
          </ul>
        </div>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {downloaded.toLocaleString()} downloaded files remembered
          </Typography.Text>
          <Button icon={<SettingOutlined />} onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
          </Button>
        </Space>
      </Space>
    </div>
  );
}
