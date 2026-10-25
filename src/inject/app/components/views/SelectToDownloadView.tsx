import { CheckOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Col, Row, Spin } from "antd";
import { useEffect, useState } from "react";
import { downloadMediaItem, resetFilenameCounter } from "../../download/download-media";
import { useDirectoryPicker } from "../../hooks/use-directory-picker";
import type { MediaItem } from "../../media/types";
import { useDownloaderModal } from "../../state/downloader-modal";
import { useSettings } from "../../state/settings";
import { ViewLayout } from "../ViewLayout";

/** Shows every file of a post/story set as a grid to pick from. */
export function SelectToDownloadView() {
  const { fetchQuery } = useDownloaderModal();
  const { settingsRef } = useSettings();
  const { requestDirectory } = useDirectoryPicker();
  const { message } = App.useApp();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [downloaded, setDownloaded] = useState<string[]>([]);

  useEffect(() => {
    if (!fetchQuery) return;
    let cancelled = false;
    fetchQuery({ nextParams: null })
      .then(({ items: fetched }) => {
        if (cancelled) return;
        setItems(fetched);
        setSelected(fetched.map((item) => item.id));
      })
      .catch((error: unknown) => {
        console.error(error);
        void message.error("Failed to load the files.");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchQuery, message]);

  const download = async () => {
    if (!items || !(await requestDirectory())) return;
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
        viaBrowserDownloads: false,
        isDownloadVideoThumbnail: settings.isDownloadVideoThumbnail,
        isMergingVideo: settings.isMergingVideo,
      });
      setDownloaded((ids) => [...ids, item.id]);
    }
    void message.success("Download Successful");
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((ids) => (checked ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)));

  const total = items?.length ?? 0;
  return (
    <ViewLayout
      title="Select to Download"
      footer={
        <Button disabled={selected.length === 0} type="primary" onClick={() => void download()}>
          Select a Folder to Download
        </Button>
      }
    >
      {!items ? (
        <div style={{ paddingTop: 120, display: "flex", justifyContent: "center" }}>
          <Spin />
        </div>
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
