import { App } from "antd";
import { useCallback } from "react";
import { APP_SLUG } from "@/shared/constants";
import { SettingsForm } from "@/shared/ui/SettingsForm";
import { background } from "../messaging";
import { useDownloaderModal } from "../state/downloader-modal";
import { useSettings } from "../state/settings";

const FULL_SPEED_ACKNOWLEDGED = `${APP_SLUG}-full-speed-acknowledged`;

// Remember for the page session whether the user expanded the advanced settings.
let advancedExpanded = false;

/** Asks once (persisted) before Full Speed mode is enabled. */
function useFullSpeedConfirm() {
  const { modal } = App.useApp();
  return useCallback(async () => {
    if (await background.getPersistedValue(FULL_SPEED_ACKNOWLEDGED)) return true;
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        content:
          "Full Speed sends API requests without pauses, which makes it more likely that Instagram temporarily restricts your account. Turn it on anyway?",
        okText: "I understand",
        onOk: async () => {
          await background.setPersistedValue(FULL_SPEED_ACKNOWLEDGED, true);
          resolve(true);
        },
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);
}

/** {@link SettingsForm} bound to the modal's settings context. */
export function ModalSettingsForm() {
  const { settings, update } = useSettings();
  const { isDark, isUseQuantityControl } = useDownloaderModal();
  const confirmFullSpeed = useFullSpeedConfirm();

  return (
    <SettingsForm
      settings={settings}
      onChange={update}
      isDark={isDark}
      showQuantityControl={isUseQuantityControl}
      defaultExpanded={advancedExpanded}
      onExpand={() => {
        advancedExpanded = true;
      }}
      confirmFullSpeed={confirmFullSpeed}
    />
  );
}
