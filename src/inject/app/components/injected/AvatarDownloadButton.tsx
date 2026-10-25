import { App, Avatar, Spin, Tooltip } from "antd";
import { useState, type ReactNode } from "react";
import { sanitizeFolderName } from "@/shared/filename";
import { appIconUrl } from "../../env";
import { useBusyAction } from "../../hooks/use-busy-action";
import { fetchUserInfo } from "../../ig/instapi";
import { background } from "../../messaging";
import { AppProviders } from "../AppProviders";

function AvatarDownloadIcon({ userId, hovered }: { userId: string; hovered: boolean }) {
  const { busy, run } = useBusyAction("Unable to download the avatar.");
  const { message } = App.useApp();

  const download = () =>
    run(async () => {
      const user = await fetchUserInfo(userId);
      const url = user?.hd_profile_pic_url_info?.url ?? user?.profile_pic_url;
      if (!user || !url) return void message.error("Unable to find user avatar.");
      await background.downloadFile(url, `${sanitizeFolderName(user.full_name || user.username)}/avatar.jpg`);
    });

  if (busy) return <Spin />;
  return (
    <Tooltip title="Download this HD avatar">
      <Avatar
        style={{ cursor: "pointer", opacity: hovered ? 1 : 0.6 }}
        src={appIconUrl()}
        shape="square"
        size={24}
        onClick={() => void download()}
      />
    </Tooltip>
  );
}

/** Small icon over a profile picture that saves the HD version. */
export function AvatarDownloadButton({ userId, children }: { userId: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      {children}
      <div
        style={{ position: "absolute", top: 0, left: 0 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <AppProviders>
          <AvatarDownloadIcon userId={userId} hovered={hovered} />
        </AppProviders>
      </div>
    </div>
  );
}
