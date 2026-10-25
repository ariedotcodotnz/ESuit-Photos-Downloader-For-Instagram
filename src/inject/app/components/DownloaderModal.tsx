import { Modal } from "antd";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { isDarkMode } from "../ig/modules";
import {
  DownloaderModalContext,
  ModalView,
  type DownloaderModalContextValue,
  type DownloaderModalHandle,
  type ModalRequest,
} from "../state/downloader-modal";
import { DownloadSessionContext, DownloadSessionStore } from "../state/download-session";
import { SettingsProvider } from "../state/settings";
import { AppProviders } from "./AppProviders";
import { ModalHeader } from "./ModalHeader";
import { DownloadAlbumView } from "./views/DownloadAlbumView";
import { OptionsView } from "./views/OptionsView";
import { SelectToDownloadView } from "./views/SelectToDownloadView";

function ModalBody({ request, onClose }: { request: ModalRequest; onClose(): void }) {
  // A fresh session per opening; the async loop keeps its own reference, so
  // closing must also stop it.
  const session = useMemo(() => new DownloadSessionStore(), []);
  const isAlbum = request.view === ModalView.DOWNLOAD_ALBUM;

  const close = () => {
    session.update({ stopRequested: true });
    onClose();
  };

  const context = useMemo<DownloaderModalContextValue>(
    () => ({
      view: request.view,
      open: true,
      close,
      collectionId: isAlbum ? request.collectionId || undefined : undefined,
      folderName: isAlbum ? request.folderName || undefined : undefined,
      isDark: isDarkMode(),
      fetchQuery: request.view === ModalView.OPTIONS ? null : (request.fetchQuery ?? null),
      isUseQuantityControl: isAlbum && !!request.isUseQuantityControl,
    }),
    // `close` only depends on the stable session and onClose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, isAlbum],
  );

  return (
    <DownloaderModalContext.Provider value={context}>
      <DownloadSessionContext.Provider value={session}>
        <SettingsProvider>
          <Modal open destroyOnClose title={<ModalHeader />} width={900} footer={null} onCancel={close}>
            {request.view === ModalView.OPTIONS && <OptionsView />}
            {request.view === ModalView.SELECT_TO_DOWNLOAD && <SelectToDownloadView />}
            {request.view === ModalView.DOWNLOAD_ALBUM && <DownloadAlbumView />}
          </Modal>
        </SettingsProvider>
      </DownloadSessionContext.Provider>
    </DownloaderModalContext.Provider>
  );
}

/**
 * The downloader dialog (options / select files / download album). Each
 * injected button owns an instance and opens it through the ref handle.
 */
export const DownloaderModal = forwardRef<DownloaderModalHandle>(function DownloaderModal(_props, ref) {
  const [request, setRequest] = useState<ModalRequest | null>(null);

  useImperativeHandle(ref, () => ({ show: setRequest, hide: () => setRequest(null) }), []);

  if (!request) return null;
  return (
    <AppProviders>
      <ModalBody request={request} onClose={() => setRequest(null)} />
    </AppProviders>
  );
});
