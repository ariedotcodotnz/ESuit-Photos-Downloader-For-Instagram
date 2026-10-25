import { ThunderboltOutlined } from "@ant-design/icons";
import { Avatar, Badge, Space, Tooltip } from "antd";
import { APP_NAME } from "@/shared/constants";
import { appIconUrl, getPageContext } from "../env";
import { HOTKEY_LABEL } from "../features/hotkey";

/** App name and version. */
export function AppTitle({ showName = true }: { showName?: boolean }) {
  return (
    <span>
      {showName ? APP_NAME : ""} <span style={{ color: "#999", fontSize: 12 }}>v{getPageContext().version}</span>
    </span>
  );
}

export function ModalHeader() {
  return (
    <Space size={8}>
      <Avatar style={{ marginRight: 8 }} src={appIconUrl()} shape="square" />
      <AppTitle />
      <Tooltip
        title={
          <span>
            Press <b>{HOTKEY_LABEL}</b> on any post/reel page to download it instantly
          </span>
        }
      >
        <Badge dot offset={[-2, 2]}>
          <ThunderboltOutlined style={{ fontSize: 14, color: "#faad14", cursor: "pointer" }} />
        </Badge>
      </Tooltip>
    </Space>
  );
}
