import { App, Button, Space } from "antd";
import { useDownloaderModal } from "../../state/downloader-modal";
import { useSettings } from "../../state/settings";
import { ModalSettingsForm } from "../ModalSettingsForm";
import { ViewLayout } from "../ViewLayout";

/** Edit and save the download settings. */
export function OptionsView() {
  const { save } = useSettings();
  const { close } = useDownloaderModal();
  const { message } = App.useApp();

  const saveSettings = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await save();
    void message.success("Saved successfully.");
  };

  return (
    <ViewLayout
      footer={
        <Space size={12}>
          <Button type="text" onClick={close}>
            Close
          </Button>
          <Button type="primary" onClick={() => void saveSettings()}>
            Save
          </Button>
        </Space>
      }
    >
      <ModalSettingsForm />
    </ViewLayout>
  );
}
