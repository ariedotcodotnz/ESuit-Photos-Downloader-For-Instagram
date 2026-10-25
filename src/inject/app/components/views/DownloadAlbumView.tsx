import { App, Button, Space } from "antd";
import { useEffect } from "react";
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
  resumeCursor: ResumeCursor | null;
  onStart(resumeFrom?: ResumeCursor): void;
  onStop(): void;
  onRestart(): void;
}

function AlbumFooter({ step, resumeCursor, onStart, onStop, onRestart }: AlbumFooterProps) {
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
        <Button type="primary" danger onClick={onStop}>
          Stop
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
  const { step, downloadCount } = useDownloadSession();
  const { save } = useSettings();
  const { collectionId } = useDownloaderModal();
  const { modal } = App.useApp();
  const { resumeCursor, saveProgress, clearProgress } = useResumeCursor(collectionId, session);
  const { run } = useAlbumDownload({ saveProgress, clearProgress });

  useEffect(() => {
    if (step === DownloadStep.DONE) closeProgressSoon();
  }, [step]);

  const start = (resumeFrom?: ResumeCursor) => {
    void save();
    resetFilenameCounter();
    session.update({ stopRequested: false, step: DownloadStep.DOWNLOADING, resumedFrom: resumeFrom ?? null });
    run(resumeFrom?.lastCursor)
      .then(() => session.update({ step: DownloadStep.DONE }))
      .catch((error: unknown) => {
        console.error(error);
        // Stays on the progress view; the user can press Stop to finish.
        session.update({ stopRequested: true });
        showDownloadErrorModal(modal, error);
      });
  };

  const restart = () => {
    resetFilenameCounter();
    session.reset();
  };

  return (
    <ViewLayout
      footer={
        <AlbumFooter
          step={step}
          resumeCursor={resumeCursor}
          onStart={start}
          onStop={() => session.update({ stopRequested: true, step: DownloadStep.DONE })}
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
