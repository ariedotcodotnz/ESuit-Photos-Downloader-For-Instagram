import { DeleteOutlined } from "@ant-design/icons";
import { App, Button, Card, Empty, List, Popconfirm, Space, Spin, Typography } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useRef, useState } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { applySettingsPatch, DEFAULT_SETTINGS, type UserSettings } from "@/shared/settings";
import { getBucket, onBucketChanged, setBucket, updateBucket } from "@/shared/storage";
import { SettingsForm } from "@/shared/ui/SettingsForm";
import { AppHeader } from "../shared/PageShell";

dayjs.extend(relativeTime);

function SettingsCard({ isDark }: { isDark: boolean }) {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const settingsRef = useRef<UserSettings | null>(null);
  settingsRef.current = settings;

  const applySettings = (next: UserSettings) => {
    settingsRef.current = next;
    setSettings(next);
  };

  useEffect(() => {
    void getBucket("settings").then(applySettings);
    return onBucketChanged("settings", applySettings);
  }, []);

  if (!settings) return <Spin />;

  const save = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!settingsRef.current) return;
    await setBucket("settings", settingsRef.current);
    void message.success("Saved successfully.");
  };

  return (
    <Card
      title="Download settings"
      extra={
        <Space>
          <Button onClick={() => applySettings({ ...DEFAULT_SETTINGS })}>Reset to defaults</Button>
          <Button type="primary" onClick={() => void save()}>
            Save
          </Button>
        </Space>
      }
    >
      <SettingsForm
        settings={settings}
        onChange={(patch) => {
          if (!settingsRef.current) return;
          applySettings(applySettingsPatch(settingsRef.current, patch));
        }}
        isDark={isDark}
        showQuantityControl
        defaultExpanded
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
        The quantity control applies when downloading a profile. These settings are also editable from the
        &quot;Options&quot; button inside Instagram.
      </Typography.Paragraph>
    </Card>
  );
}

function HistoryCard() {
  const { message } = App.useApp();
  const [count, setCount] = useState(0);

  useEffect(() => {
    void getBucket("downloadedFileIds").then((ids) => setCount(ids.length));
    return onBucketChanged("downloadedFileIds", (ids) => setCount(ids.length));
  }, []);

  const clear = async () => {
    await setBucket("downloadedFileIds", []);
    void message.success("Cleanup successful.");
  };

  return (
    <Card title="Download history">
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <span>{count.toLocaleString()} downloaded file ids are remembered for &quot;Skip Downloaded&quot;.</span>
        <Popconfirm title="Forget all downloaded files?" onConfirm={() => void clear()}>
          <Button danger disabled={count === 0}>
            Clear
          </Button>
        </Popconfirm>
      </Space>
    </Card>
  );
}

function ResumeCursorsCard() {
  const [cursors, setCursors] = useState<ResumeCursor[]>([]);

  useEffect(() => {
    void getBucket("resumeCursors").then(setCursors);
    return onBucketChanged("resumeCursors", setCursors);
  }, []);

  const remove = (token: string) =>
    void updateBucket("resumeCursors", (current) => current.filter((c) => c.collectionToken !== token));

  return (
    <Card title="Interrupted downloads">
      {cursors.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to resume" />
      ) : (
        <List
          dataSource={cursors}
          renderItem={(cursor) => (
            <List.Item
              actions={[
                <Button
                  key="delete"
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => remove(cursor.collectionToken)}
                />,
              ]}
            >
              <List.Item.Meta
                title={cursor.collectionToken}
                description={`${cursor.lastIndex} files downloaded · ${dayjs.unix(cursor.lastUpdateAt).fromNow()}`}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

export function Options({ isDark }: { isDark: boolean }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px" }}>
      <AppHeader />
      <Space direction="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
        <SettingsCard isDark={isDark} />
        <HistoryCard />
        <ResumeCursorsCard />
      </Space>
    </div>
  );
}
