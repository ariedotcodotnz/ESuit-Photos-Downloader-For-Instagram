import { useSyncExternalStore } from "react";

/**
 * "Download selected posts": while select mode is on, every patched grid item
 * shows a checkbox; the chosen media ids are collected here.
 */
interface SelectionSnapshot {
  isSelectMode: boolean;
  selectedIds: readonly string[];
}

let snapshot: SelectionSnapshot = { isSelectMode: false, selectedIds: [] };
const listeners = new Set<() => void>();

function update(next: Partial<SelectionSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const selectionStore = {
  getSnapshot: (): SelectionSnapshot => snapshot,
  subscribe,
  /** Entering or leaving select mode starts with an empty selection. */
  setSelectMode(isSelectMode: boolean): void {
    update({ isSelectMode, selectedIds: [] });
  },
  setSelected(id: string, selected: boolean): void {
    const ids = snapshot.selectedIds.filter((existing) => existing !== id);
    update({ selectedIds: selected ? [...ids, id] : ids });
  },
  clear(): void {
    update({ isSelectMode: false, selectedIds: [] });
  },
};

export function useSelection(): SelectionSnapshot {
  return useSyncExternalStore(selectionStore.subscribe, selectionStore.getSnapshot);
}
