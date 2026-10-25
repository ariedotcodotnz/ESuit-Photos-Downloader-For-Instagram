import { CheckOutlined } from "@ant-design/icons";
import { Alert, App, Button, Checkbox, Col, Empty, Row, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { downloadMediaItem, resetFilenameCounter } from "../../download/download-media";
import { extractErrorMessage, friendlyErrorMessage } from "../../download/errors";
import { useDirectoryPicker } from "../../hooks/use-directory-picker";
import type { MediaItem } from "../../media/types";
import { downloadHistory } from "../../state/download-history";
import { useDownloaderModal } from "../../state/downloader-modal";
import { useSettings } from "../../state/settings";
import { ViewLayout } from "../ViewLayout";

/** Shows every file of a post/story set as a grid to pick from. */
export function SelectToDownloadView() {
  const { fetchQuery, folderName } = useDownloaderModal();
  const { settingsRef } = useSettings();
  const { requestDirectory } = useDirectoryPicker();
  const { message } = App.useApp();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!fetchQuery) return;
    let cancelled = false;
    setItems(null);
    setSelected([]);
    setDownloaded([]);
    setLoadError(null);
    fetchQuery({ nextParams: null })
      .then(({ items: fetched }) => {
        if (cancelled) return;
        setItems(fetched);
        setSelected(fetched.map((item) => item.id));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setLoadError(friendlyErrorMessage(extractErrorMessage(error)));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchQuery, loadAttempt]);

  const download = async () => {
    if (downloadingRef.current || !items || !(await requestDirectory())) return;
    downloadingRef.current = true;
    setDownloading(true);
    try {
      resetFilenameCounter();
      const settings = settingsRef.current;
      const chosen = items.filter((item) => selected.includes(item.id));
      for (const [i, item] of chosen.entries()) {
        await downloadMediaItem({
          item,
          index: i + 1,
          filenameTemplate: settings.filenameFormats,
          imageFormat: settings.formatType,
          isGenFolder: settings.isGenFolder,
          isSplitFolder: settings.isSplitFolder,
          folderName,
          viaBrowserDownloads: false,
          isDownloadVideoThumbnail: settings.isDownloadVideoThumbnail,
          isMergingVideo: settings.isMergingVideo,
        });
        setDownloaded((ids) => [...ids, item.id]);
      }
      void message.success("Download Successful");
    } catch (error) {
      console.error(error);
      void message.error(friendlyErrorMessage(extractErrorMessage(error)));
    } finally {
      downloadHistory.flush?.();
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((ids) => (checked ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)));

  const total = items?.length ?? 0;
  return (
    <ViewLayout
      title="Select to Download"
      footer={
        <Button
          disabled={selected.length === 0 || downloading}
          loading={downloading}
          type="primary"
          onClick={() => void download()}
        >
          Select a Folder to Download
        </Button>
      }
    >
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="Failed to load the files."
          description={loadError}
          action={<Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}
        />
      ) : !items ? (
        <div style={{ paddingTop: 120, display: "flex", justifyContent: "center" }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="No files are available to download." />
      ) : (
        <Row gutter={[12, 12]} style={{ maxHeight: 400, overflow: "auto", overflowX: "hidden" }}>
          <Col span={24}>
            <Checkbox
              indeterminate={selected.length > 0 && selected.length < total}
              checked={total > 0 && selected.length === total}
              onChange={(e) => setSelected(e.target.checked ? items.map((item) => item.id) : [])}
            >
              Select All
            </Checkbox>
          </Col>
          {items.map((item) => (
            <Col span={4} key={item.id}>
              <div
                style={{ paddingBottom: "100%", position: "relative", background: "rgba(0,0,0,.2)", borderRadius: 4 }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url(${item.thumbnail})`,
                    backgroundPosition: "center",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    borderRadius: 4,
                    zIndex: 1,
                  }}
                />
                <div style={{ position: "absolute", left: 8, top: 8, transform: "scale(1.4)", zIndex: 2 }}>
                  <Checkbox checked={selected.includes(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} />
                </div>
                {downloaded.includes(item.id) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "rgba(0,0,0,0.4)",
                      zIndex: 3,
                    }}
                  >
                    <CheckOutlined style={{ color: "#A3E636", fontSize: 24 }} />
                  </div>
                )}
              </div>
            </Col>
          ))}
        </Row>
      )}
    </ViewLayout>
  );
}
