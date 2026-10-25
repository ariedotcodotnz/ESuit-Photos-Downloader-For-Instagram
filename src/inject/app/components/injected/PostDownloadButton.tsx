import { App } from "antd";
import { useRef } from "react";
import { downloadPost } from "../../download/quick-download";
import { useBusyAction } from "../../hooks/use-busy-action";
import { fetchMediaInfo } from "../../ig/instapi";
import { isLoggedIn } from "../../ig/modules";
import { ModalView, type DownloaderModalHandle } from "../../state/downloader-modal";
import { AppProviders } from "../AppProviders";
import { DownloaderModal } from "../DownloaderModal";
import { actionIcons, QuickDownloadPopover, type QuickAction } from "./QuickDownloadPopover";

/** Class added around Instagram's carousel dots (see the PolarisStepIndicator patch). */
export const STEP_INDICATOR_CLASS = "igdl-step-indicator";

/** Index of the carousel slide currently shown in the post containing `element`. */
function currentSlideIndex(element: HTMLElement): number {
  const indicator = element.closest("article,[role='dialog'],main")?.querySelector(`.${STEP_INDICATOR_CLASS}`);
  const dots = Array.from(indicator?.firstChild?.childNodes ?? []) as Element[];
  const index = dots.findIndex((dot) => window.getComputedStyle(dot).opacity === "1");
  return Math.max(0, index);
}

interface PostDownloadButtonProps {
  postId: string;
  isReel?: boolean;
}

function PostDownloadButtonContent({ postId, isReel = false }: PostDownloadButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<DownloaderModalHandle>(null);
  const { busy, run } = useBusyAction();
  const { message } = App.useApp();

  const download = (slideIndex?: number) =>
    run(async () => {
      await downloadPost(postId, slideIndex, { viaBrowserDownloads: true });
      void message.success("Download Successful");
    });

  const actions: QuickAction[] = [
    {
      label: isReel ? "Download Current Reel" : "Download Current Image",
      icon: actionIcons.download,
      onClick: () => void download(containerRef.current ? currentSlideIndex(containerRef.current) : undefined),
    },
    ...(!isReel
      ? [
          {
            label: "Select to Download",
            icon: actionIcons.select,
            primary: true,
            onClick: () =>
              modalRef.current?.show({
                view: ModalView.SELECT_TO_DOWNLOAD,
                fetchQuery: async () => ({ items: await fetchMediaInfo(postId), hasMore: false, nextParams: null }),
              }),
          },
        ]
      : []),
    {
      label: "Options",
      icon: actionIcons.settings,
      onClick: () => modalRef.current?.show({ view: ModalView.OPTIONS }),
    },
  ];

  return (
    <div ref={containerRef} className="download-single-button">
      <QuickDownloadPopover busy={busy} actions={actions} onIconClick={() => void download()} />
      <DownloaderModal ref={modalRef} />
    </div>
  );
}

/** Download icon next to the save button of posts and reels. */
export function PostDownloadButton(props: PostDownloadButtonProps) {
  if (!isLoggedIn()) return null;
  return (
    <AppProviders>
      <PostDownloadButtonContent {...props} />
    </AppProviders>
  );
}
