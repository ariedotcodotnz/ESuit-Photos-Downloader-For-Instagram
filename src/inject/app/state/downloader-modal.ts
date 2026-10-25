import { createContext, useContext } from "react";
import type { FetchQuery } from "../media/types";

export enum ModalView {
  /** Edit and save settings. */
  OPTIONS = "options",
  /** Pick individual files from a fixed list. */
  SELECT_TO_DOWNLOAD = "select",
  /** Page through an album and download everything. */
  DOWNLOAD_ALBUM = "album",
}

/** What a caller passes when opening the downloader modal. */
export interface ModalRequest {
  view: ModalView;
  fetchQuery?: FetchQuery | null;
  /** Album id for resumable downloads. */
  collectionId?: string;
  /** Folder used by "Gen-Folder" instead of each post's author. */
  folderName?: string;
  /** Show the fetch-quantity controls. */
  isUseQuantityControl?: boolean;
}

export interface DownloaderModalContextValue {
  view: ModalView;
  open: boolean;
  close(): void;
  collectionId?: string;
  folderName?: string;
  isDark: boolean;
  fetchQuery: FetchQuery | null;
  isUseQuantityControl: boolean;
}

export const DownloaderModalContext = createContext<DownloaderModalContextValue | null>(null);

export function useDownloaderModal(): DownloaderModalContextValue {
  const context = useContext(DownloaderModalContext);
  if (!context) throw new Error("DownloaderModalContext is missing");
  return context;
}

/** Imperative handle of a mounted {@link DownloaderModal}. */
export interface DownloaderModalHandle {
  show(request: ModalRequest): void;
  hide(): void;
}
