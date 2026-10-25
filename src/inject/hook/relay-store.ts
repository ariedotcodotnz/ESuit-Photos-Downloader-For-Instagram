import type { ModuleHook } from "./module-hook";

/** Minimal surface of Relay's `RelayRecordProxy`. */
interface RelayRecord {
  getValue(name: string, args?: Record<string, unknown>): unknown;
  getLinkedRecord(name: string, args?: Record<string, unknown>): RelayRecord | null | undefined;
  getLinkedRecords(name: string, args?: Record<string, unknown>): (RelayRecord | null)[] | null | undefined;
}

interface RelayRecordSource {
  get(dataId: string): RelayRecord | null | undefined;
}

const SOURCE_GLOBAL = "__igAlbumDownloaderRelaySource";

type WindowWithSource = Window & { [SOURCE_GLOBAL]?: RelayRecordSource };

/**
 * Relay keeps entities Instagram has already loaded (users, media, …) in a
 * record store that is not reachable from outside. This patch makes the
 * publish queue also save the record-source proxy it creates on `window`.
 */
export function captureRelayRecordSource(hook: ModuleHook): void {
  hook.registerSourceRewrite("relay-runtime/store/RelayPublishQueue", (source) =>
    source.replace(
      /,(\w+)=new\((\w+)\("relay-runtime\/mutations\/RelayRecordSourceProxy"/,
      `,$1=window["${SOURCE_GLOBAL}"]=new($2("relay-runtime/mutations/RelayRecordSourceProxy"`,
    ),
  );
}

/**
 * Reads a value from a record, following a dotted path: `name` reads a scalar,
 * `^name` follows a linked record, `^^name` linked records and digits index
 * into a list, e.g. `readRelayRecord("XDTUserDict:1", "full_name")`.
 */
export function readRelayRecord(recordId: string, path: string): unknown {
  const source = (window as WindowWithSource)[SOURCE_GLOBAL];
  let current: unknown = source?.get(recordId);
  for (const segment of path.split(".")) {
    if (current == null) return undefined;
    if (segment.startsWith("^^")) current = (current as RelayRecord).getLinkedRecords(segment.slice(2));
    else if (segment.startsWith("^")) current = (current as RelayRecord).getLinkedRecord(segment.slice(1));
    else if (/^\d+$/.test(segment)) current = (current as unknown[])[Number(segment)];
    else current = (current as RelayRecord).getValue(segment);
  }
  return current ?? undefined;
}
