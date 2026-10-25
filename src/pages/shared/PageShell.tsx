import { App, Avatar, ConfigProvider, Space, theme, Typography } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { APP_NAME } from "@/shared/constants";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(darkQuery.matches);
  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    darkQuery.addEventListener("change", onChange);
    return () => darkQuery.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export function AppHeader() {
  return (
    <Space size={8} className="header">
      <Avatar size="large" src={chrome.runtime.getURL("icons/icon-128.png")} shape="square" />
      <Typography.Text strong>{APP_NAME}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        v{chrome.runtime.getManifest().version}
      </Typography.Text>
    </Space>
  );
}

/** Theme (following the OS dark mode) and antd App context for extension pages. */
export function PageShell({ children }: { children: (isDark: boolean) => ReactNode }) {
  const dark = usePrefersDark();
  useEffect(() => {
    document.body.style.background = dark ? "#141414" : "#fff";
  }, [dark]);
  return (
    <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <App>{children(dark)}</App>
    </ConfigProvider>
  );
}
