import { DownloadOutlined, SelectOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Popover, Space, Spin, Tooltip, type PopoverProps } from "antd";
import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/constants";
import { appIconUrl } from "../../env";

export interface QuickAction {
  label: ReactNode;
  icon: ReactNode;
  onClick(): void;
  primary?: boolean;
}

export const actionIcons = {
  download: <DownloadOutlined />,
  select: <SelectOutlined />,
  settings: <SettingOutlined />,
};

const spinnerBox = { width: 40, display: "flex", justifyContent: "center", alignItems: "center" } as const;
const iconStyle = { width: 24, height: 24, display: "block", margin: "0 8px", cursor: "pointer" } as const;

interface QuickDownloadPopoverProps {
  busy: boolean;
  actions: QuickAction[];
  /** Clicking the icon itself. */
  onIconClick(): void;
  tooltipPlacement?: "bottom" | "left";
  placement?: PopoverProps["placement"];
}

/** The extension icon next to Instagram's buttons: click to download, hover for more actions. */
export function QuickDownloadPopover({
  busy,
  actions,
  onIconClick,
  tooltipPlacement = "bottom",
  placement = "top",
}: QuickDownloadPopoverProps) {
  return (
    <Popover
      destroyTooltipOnHide
      autoAdjustOverflow={false}
      placement={placement}
      title={<span style={{ fontSize: 12 }}>{APP_NAME}</span>}
      content={
        <Spin spinning={busy}>
          <Space direction="vertical" size={8}>
            {actions.map((action, i) => (
              <Button
                key={i}
                block
                type={action.primary ? "primary" : "default"}
                icon={action.icon}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        </Spin>
      }
    >
      {busy ? (
        <div style={spinnerBox}>
          <Spin />
        </div>
      ) : (
        <Tooltip autoAdjustOverflow={false} title="Click it to download directly" placement={tooltipPlacement}>
          <img src={appIconUrl()} style={iconStyle} onClick={onIconClick} alt="Download" />
        </Tooltip>
      )}
    </Popover>
  );
}

export const quickDownloadSpinnerBox = spinnerBox;
