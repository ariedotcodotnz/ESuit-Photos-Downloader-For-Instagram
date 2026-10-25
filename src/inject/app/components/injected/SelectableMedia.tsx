import { Checkbox } from "antd";
import type { InjectedComponent, InjectedComponentProps } from "@/inject/shared/hook-api";
import { selectionStore, useSelection } from "../../state/selection";
import { AppProviders } from "../AppProviders";

interface MediaPayload {
  id?: string;
  clip?: { media?: { pk?: string } };
  clipFragmentKey?: { media?: { id?: string } };
  queryReference?: { pk?: string };
  mediaFragmentKey?: { pk?: string };
}

/** The media id, wherever the particular grid/media component keeps it. */
function mediaIdFromPayload(payload: MediaPayload | undefined): string | undefined {
  return (
    payload?.id ||
    payload?.clip?.media?.pk ||
    payload?.clipFragmentKey?.media?.id ||
    payload?.queryReference?.pk ||
    payload?.mediaFragmentKey?.pk ||
    undefined
  );
}

/** Adds a selection checkbox to grid items and posts while select mode is on. */
export function createSelectableMedia(checkboxOffsetTop = 0): InjectedComponent<MediaPayload> {
  return function SelectableMedia({ payload, lastElement }: InjectedComponentProps<MediaPayload>) {
    const { isSelectMode, selectedIds } = useSelection();
    const id = mediaIdFromPayload(payload);
    if (!id) return <>{lastElement}</>;

    // Instagram's element always stays at the same position in the tree, so
    // toggling select mode never remounts it.
    return (
      <div style={{ position: "relative", width: "100%" }}>
        {isSelectMode && (
          <div style={{ position: "absolute", left: 0, top: checkboxOffsetTop, zIndex: 2 }}>
            <AppProviders>
              <Checkbox
                style={{ padding: 8, transform: "scale(1.5)" }}
                checked={selectedIds.includes(id)}
                onChange={(event) => selectionStore.setSelected(id, event.target.checked)}
              />
            </AppProviders>
          </div>
        )}
        {lastElement}
      </div>
    );
  };
}
