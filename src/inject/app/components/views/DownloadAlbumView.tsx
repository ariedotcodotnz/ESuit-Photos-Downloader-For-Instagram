import { App, Button, Space } from "antd";
import { useEffect, useRef } from "react";
import type { ResumeCursor } from "@/shared/messaging";
import { resetFilenameCounter } from "../../download/download-media";
import { closeProgressSoon } from "../../download/toast";
import { useAlbumDownload } from "../../hooks/use-album-download";
import { useDownloaderModal } from "../../state/downloader-modal";
import { DownloadStep, useDownloadSession, useDownloadSessionStore } from "../../state/download-session";
import { useResumeCursor } from "../../state/resume-cursor";
import { useSettings } from "../../state/settings";
import { ResumeButton, SelectFolderButton } from "../DownloadButtons";
import { DownloadFailed, DownloadProgress, DownloadSucceeded } from "../DownloadProgress";
import { showDownloadErrorModal } from "../error-report";
import { ModalSettingsForm } from "../ModalSettingsForm";
import { ViewLayout } from "../ViewLayout";

interface AlbumFooterProps {
  step: DownloadStep;
  stopping: boolean;
  resumeCursor: ResumeCursor | null;
  onStart(resumeFrom?: ResumeCursor): void;
  onStop(): void;
  onRestart(): void;
}

function AlbumFooter({ step, stopping, resumeCursor, onStart, onStop, onRestart }: AlbumFooterProps) {
  const { close } = useDownloaderModal();
  const closeButton = (
    <Button type="text" onClick={close}>
      Close
    </Button>
  );

  return (
    <Space size={12}>
      {step === DownloadStep.OPTIONS && (
        <>
          {closeButton}
          <SelectFolderButton onStart={() => onStart()} />
          <ResumeButton cursor={resumeCursor} onResume={onStart} />
        </>
      )}
      {step === DownloadStep.DOWNLOADING && (
        <Button type="primary" danger disabled={stopping} onClick={onStop}>
          {stopping ? "Stopping…" : "Stop"}
        </Button>
      )}
      {step === DownloadStep.DONE && (
        <>
          {closeButton}
          <Button onClick={onRestart}>ReDownload</Button>
        </>
      )}
    </Space>
  );
}

/** Settings → progress → result flow for downloading a whole album. */
export function DownloadAlbumView() {
  const session = useDownloadSessionStore();
  const { step, downloadCount, stopRequested } = useDownloadSession();
  const activeRun = useRef(false);
  const { save } = useSettings();
  const { collectionId } = useDownloaderModal();
  const { modal } = App.useApp();
  const { resumeCursor, saveProgress, clearProgress } = useResumeCursor(collectionId);
  const { run } = useAlbumDownload({ saveProgress, clearProgress });

  useEffect(() => {
    if (step === DownloadStep.DONE) closeProgressSoon();
  }, [step]);

  const start = (resumeFrom?: ResumeCursor) => {
    if (activeRun.current) return;
    activeRun.current = true;
    void save();
    resetFilenameCounter();
    session.update({ stopRequested: false, step: DownloadStep.DOWNLOADING, resumedFrom: resumeFrom ?? null });
    run(resumeFrom?.lastCursor)
      .catch((error: unknown) => {
        console.error(error);
        session.update({ stopRequested: true });
        showDownloadErrorModal(modal, error);
      })
      .finally(() => {
        activeRun.current = false;
        session.update({ step: DownloadStep.DONE });
      });
  };

  const restart = () => {
    if (activeRun.current) return;
    resetFilenameCounter();
    session.reset();
  };

  return (
    <ViewLayout
      footer={
        <AlbumFooter
          step={step}
          stopping={stopRequested}
          resumeCursor={resumeCursor}
          onStart={start}
          onStop={() => session.update({ stopRequested: true })}
          onRestart={restart}
        />
      }
    >
      {step === DownloadStep.OPTIONS && <ModalSettingsForm />}
      {step === DownloadStep.DOWNLOADING && <DownloadProgress />}
      {step === DownloadStep.DONE &&
        (downloadCount === 0 ? <DownloadFailed /> : <DownloadProgress overlay={<DownloadSucceeded />} />)}
    </ViewLayout>
  );
}
