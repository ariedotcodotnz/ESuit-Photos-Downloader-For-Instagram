import { App, Avatar, Spin, Tooltip } from "antd";
import { useRef, useState, type ReactNode } from "react";
import { sanitizeFolderName } from "@/shared/filename";
import { appIconUrl } from "../../env";
import { useBusyAction } from "../../hooks/use-busy-action";
import type { IgUserInfo } from "../../ig/instapi";
import { fetchProfileAvatar } from "../../ig/profile-avatar";
import { background } from "../../messaging";
import { AppProviders } from "../AppProviders";

function AvatarDownloadIcon({
  userId,
  user,
  hovered,
  getDisplayedPicture,
}: {
  userId: string;
  user?: Partial<IgUserInfo>;
  hovered: boolean;
  getDisplayedPicture(): string | undefined;
}) {
  const { busy, run } = useBusyAction("Unable to download the avatar.");
  const { message } = App.useApp();

  const download = () =>
    run(async () => {
      const avatar = await fetchProfileAvatar(userId, user, getDisplayedPicture());
      if (!avatar) return void message.error("Unable to find user avatar.");
      await background.downloadFile(avatar.url, `${sanitizeFolderName(avatar.folderName)}/avatar.jpg`);
      void message.success("Download Successful");
    });

  if (busy) return <Spin />;
  return (
    <Tooltip title="Download this profile picture">
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

/** Small icon over a profile picture that saves the best available version. */
export function AvatarDownloadButton({
  userId,
  user,
  children,
}: {
  userId: string;
  user?: Partial<IgUserInfo>;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  const getDisplayedPicture = () => {
    const images = profileRef.current?.querySelectorAll("img") ?? [];
    // Stay inside this avatar and exclude the extension's own icon.
    const image = [...images].find((candidate) => !controlsRef.current?.contains(candidate));
    return image?.currentSrc || image?.src || undefined;
  };

  return (
    <div ref={profileRef} style={{ position: "relative" }}>
      {children}
      <div
        ref={controlsRef}
        style={{ position: "absolute", top: 0, left: 0 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <AppProviders>
          <AvatarDownloadIcon userId={userId} user={user} hovered={hovered} getDisplayedPicture={getDisplayedPicture} />
        </AppProviders>
      </div>
    </div>
  );
}
