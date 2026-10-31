import { App, Avatar, Button, Tooltip } from "antd";
import { useRef } from "react";
import { appIconUrl } from "../../env";
import { createHighlightsFetcher } from "../../fetchers/stories";
import { quickDownload } from "../../download/quick-download";
import { useBusyAction } from "../../hooks/use-busy-action";
import { fetchMediaInfo, fetchReelsMedia } from "../../ig/instapi";
import { isLoggedIn } from "../../ig/modules";
import { getCurrentStoryId } from "../../ig/route";
import { ModalView, type DownloaderModalHandle } from "../../state/downloader-modal";
import { AppProviders } from "../AppProviders";
import { DownloaderModal } from "../DownloaderModal";
import { actionIcons, QuickDownloadPopover, type QuickAction } from "./QuickDownloadPopover";

function StoryDownloadButtonContent({ reelId }: { reelId: string }) {
  const modalRef = useRef<DownloaderModalHandle>(null);
  const { busy, run } = useBusyAction();
  const { message } = App.useApp();

  const loadItems = async () => (await fetchReelsMedia([reelId])).items;

  const downloadAll = () =>
    run(async () => {
      const items = await loadItems();
      if (!items.length) return void message.error("No story files are available to download.");
      await quickDownload(items, { viaBrowserDownloads: true, respectDownloadType: true });
      void message.success("Download Successful");
    });

  const downloadCurrent = () => {
    const itemId = getCurrentStoryId();
    if (!itemId) return void message.error("Unable to find the current story item.");
    void run(async () => {
      // Highlight items carry the title used by Split-Folder. Current stories
      // can be fetched directly even when their reel feed is unavailable.
      const current = reelId.startsWith("highlight:")
        ? (await loadItems()).filter((item) => item.id === itemId || item.id === itemId.split("_")[0])
        : [];
      const items = current.length ? current : await fetchMediaInfo(itemId);
      if (!items.length) return void message.error("No story files are available to download.");
      await quickDownload(items, { viaBrowserDownloads: true });
      void message.success("Download Successful");
    });
  };

  const actions: QuickAction[] = [
    { label: "Download Current Story", icon: actionIcons.download, onClick: downloadCurrent },
    {
      label: "Select to Download",
      icon: actionIcons.select,
      primary: true,
      onClick: () =>
        modalRef.current?.show({
          view: ModalView.SELECT_TO_DOWNLOAD,
          fetchQuery: async () => ({ items: await loadItems(), hasMore: false, nextParams: null }),
        }),
    },
    {
      label: "Options",
      icon: actionIcons.settings,
      onClick: () => modalRef.current?.show({ view: ModalView.OPTIONS }),
    },
  ];

  return (
    <div style={{ position: "absolute", zIndex: 99999, right: 13, bottom: 72 }}>
      <QuickDownloadPopover
        busy={busy}
        actions={actions}
        onIconClick={() => void downloadAll()}
        tooltipPlacement="left"
      />
      <DownloaderModal ref={modalRef} />
    </div>
  );
}

/** Download icon in the story/highlight viewer. */
export function StoryDownloadButton({ reelId }: { reelId: string }) {
  if (!isLoggedIn()) return null;
  return (
    <AppProviders>
      <StoryDownloadButtonContent reelId={reelId} />
    </AppProviders>
  );
}

function HighlightsDownloadButtonContent({ highlightIds }: { highlightIds: string[] }) {
  const modalRef = useRef<DownloaderModalHandle>(null);

  const open = () =>
    modalRef.current?.show({ view: ModalView.DOWNLOAD_ALBUM, fetchQuery: createHighlightsFetcher(highlightIds) });

  return (
    <>
      <Tooltip title="Download all highlights of this user">
        <Button type="primary" style={{ position: "fixed", top: 12, left: 147, zIndex: 9 }} onClick={open}>
          <Avatar src={appIconUrl()} size={24} shape="square" style={{ marginRight: 8 }} />
          <span style={{ alignSelf: "unset" }}>Download Highlights</span>
        </Button>
      </Tooltip>
      <DownloaderModal ref={modalRef} />
    </>
  );
}

/** "Download Highlights" button shown while the highlights viewer is open. */
export function HighlightsDownloadButton({ highlightIds }: { highlightIds: string[] }) {
  if (!isLoggedIn()) return null;
  return (
    <AppProviders>
      <HighlightsDownloadButtonContent highlightIds={highlightIds} />
    </AppProviders>
  );
}
