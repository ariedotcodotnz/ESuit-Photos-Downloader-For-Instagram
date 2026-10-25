import { App, Avatar, Button, Card, Divider, Popover, Row, Space } from "antd";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/shared/constants";
import { appIconUrl } from "../../env";
import { resolveRouteAlbum } from "../../fetchers/route-album";
import { createSelectedPostsFetcher } from "../../fetchers/stories";
import { requireIg } from "../../ig/modules";
import { setCurrentRoute } from "../../ig/route";
import { ModalView, type DownloaderModalHandle } from "../../state/downloader-modal";
import { selectionStore, useSelection } from "../../state/selection";
import { AppProviders } from "../AppProviders";
import { DownloaderModal } from "../DownloaderModal";
import { AppTitle } from "../ModalHeader";

function SelectPostsCard({ onDownload }: { onDownload(): void }) {
  const { isSelectMode, selectedIds } = useSelection();
  return (
    <Card size="small" title="Download selected posts" style={{ width: "100%" }} bordered>
      <p style={{ marginTop: 0 }}>Select the posts you would like to download</p>
      <Row style={{ width: "100%" }} justify="end">
        {isSelectMode ? (
          <Space>
            <Button type="text" onClick={() => selectionStore.clear()}>
              Cancel
            </Button>
            <Button type="primary" disabled={selectedIds.length === 0} onClick={onDownload}>
              Start Download {selectedIds.length}
            </Button>
          </Space>
        ) : (
          <Button onClick={() => selectionStore.setSelectMode(true)}>Start Select</Button>
        )}
      </Row>
    </Card>
  );
}

function NavDownloaderItemContent() {
  const NavigationItem = useMemo(() => requireIg("PolarisNavigationItem.react"), []);
  const RouteContext = useMemo(() => requireIg("CometRouterRouteContext"), []);
  const route = useContext(RouteContext);
  const { message } = App.useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<DownloaderModalHandle>(null);
  const [open, setOpen] = useState(false);
  const { isSelectMode } = useSelection();

  useEffect(() => {
    setCurrentRoute(route);
  }, [route]);

  // Leaving the component (e.g. a full navigation) ends select mode.
  useEffect(() => () => selectionStore.clear(), []);

  const close = () => {
    setOpen(false);
    selectionStore.clear();
  };

  const downloadSelected = () => {
    const postIds = selectionStore.getSnapshot().selectedIds;
    close();
    modalRef.current?.show({
      view: ModalView.DOWNLOAD_ALBUM,
      folderName: resolveRouteAlbum(route).folderName,
      fetchQuery: createSelectedPostsFetcher(postIds),
    });
  };

  const downloadWholeAlbum = () => {
    const album = resolveRouteAlbum(route);
    if (!album.fetchQuery) {
      void message.warning("Open a profile, a saved collection or search results to download an album.");
      return;
    }
    close();
    modalRef.current?.show({
      view: ModalView.DOWNLOAD_ALBUM,
      collectionId: album.collectionId,
      folderName: album.folderName,
      isUseQuantityControl: album.isProfile,
      fetchQuery: album.fetchQuery,
    });
  };

  const openOptions = () => {
    close();
    modalRef.current?.show({ view: ModalView.OPTIONS });
  };

  return (
    <>
      <div ref={containerRef}>
        <Popover
          open={open}
          placement="bottomLeft"
          autoAdjustOverflow={false}
          getPopupContainer={() => containerRef.current ?? document.body}
          title={
            <Row align="middle" justify="space-between">
              <Row align="middle" justify="start">
                <Avatar src={appIconUrl()} size={24} shape="square" style={{ marginRight: 8 }} />
                <AppTitle showName={false} />
              </Row>
              <Button type="text" size="small" onClick={close}>
                Close
              </Button>
            </Row>
          }
          content={
            <Space direction="vertical" style={{ width: 320 }}>
              <SelectPostsCard onDownload={downloadSelected} />
              <Divider>OR</Divider>
              <Button type="primary" block disabled={isSelectMode} onClick={downloadWholeAlbum}>
                Download Whole Album
              </Button>
              <Row justify="end" style={{ marginTop: 24 }}>
                <Button size="small" onClick={openOptions}>
                  Options
                </Button>
              </Row>
            </Space>
          }
        >
          <NavigationItem
            icon={<Avatar src={appIconUrl()} size={26} shape="square" />}
            label={APP_NAME}
            onClick={() => setOpen(true)}
          />
        </Popover>
      </div>
      <DownloaderModal ref={modalRef} />
    </>
  );
}

/** Entry in Instagram's left navigation that opens the bulk-download menu. */
export function NavDownloaderItem() {
  return (
    <AppProviders>
      <NavDownloaderItemContent />
    </AppProviders>
  );
}
