import { App, Spin, Tooltip } from "antd";
import { quickDownload } from "../../download/quick-download";
import { useBusyAction } from "../../hooks/use-busy-action";
import { fetchMediaInfo } from "../../ig/instapi";
import { isLoggedIn } from "../../ig/modules";
import { AppProviders } from "../AppProviders";
import { quickDownloadSpinnerBox } from "./QuickDownloadPopover";

function AudioIcon({ onClick }: { onClick(): void }) {
  return (
    <svg
      onClick={onClick}
      style={{ width: 24, height: 24, display: "block", margin: "0 8px", cursor: "pointer" }}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="igdl-audio-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4FC3F7" />
          <stop offset="50%" stopColor="#AB47BC" />
          <stop offset="100%" stopColor="#FF6090" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#igdl-audio-gradient)" />
      <path d="M65 25v33a11 11 0 1 1-6-9.8V35H47v27a11 11 0 1 1-6-9.8V25h24z" fill="white" fillRule="evenodd" />
    </svg>
  );
}

function AudioDownloadButtonContent({ postId }: { postId: string }) {
  const { busy, run } = useBusyAction("Audio download failed");
  const { message } = App.useApp();

  const download = () =>
    run(async () => {
      const video = (await fetchMediaInfo(postId)).find((item) => item.isVideo);
      if (!video) return void message.warning("No video found in this post");
      if (!video.audioUrl && !video.highestSource?.audio)
        return void message.warning("No audio available for this reel");
      await quickDownload([video], { isAudioOnly: true, viaBrowserDownloads: true });
      void message.success("Audio download successful");
    });

  return (
    <div className="download-single-button">
      {busy ? (
        <div style={quickDownloadSpinnerBox}>
          <Spin />
        </div>
      ) : (
        <Tooltip autoAdjustOverflow={false} title="Download audio only" placement="bottom">
          <AudioIcon onClick={() => void download()} />
        </Tooltip>
      )}
    </div>
  );
}

/** Downloads just the soundtrack of a reel or video post. */
export function AudioDownloadButton({ postId }: { postId: string }) {
  if (!isLoggedIn()) return null;
  return (
    <AppProviders>
      <AudioDownloadButtonContent postId={postId} />
    </AppProviders>
  );
}
