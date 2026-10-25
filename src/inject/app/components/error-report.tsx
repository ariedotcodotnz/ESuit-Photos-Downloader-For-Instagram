import { Button, type App } from "antd";
import { downloadErrorReport, extractErrorMessage, friendlyErrorMessage } from "../download/errors";

type ModalApi = ReturnType<typeof App.useApp>["modal"];

/** Explains a failed bulk download and offers a JSON error report for bug reports. */
export function showDownloadErrorModal(modal: ModalApi, error: unknown): void {
  const message = extractErrorMessage(error);
  modal.error({
    title: "Api Request Error",
    width: 530,
    content: (
      <div>
        <code style={{ fontSize: 10 }}>{friendlyErrorMessage(message)}</code>
        <div style={{ marginTop: 24 }}>
          <Button size="small" type="text" onClick={() => downloadErrorReport(error)}>
            Download error report
          </Button>
        </div>
      </div>
    ),
    okText: "Close",
    okButtonProps: { type: "default" },
  });
}
