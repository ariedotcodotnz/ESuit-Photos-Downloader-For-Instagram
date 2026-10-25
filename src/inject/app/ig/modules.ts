/**
 * Typed access to the Instagram-internal modules the app relies on. These are
 * private implementation details of instagram.com and can change at any time;
 * keeping every dependency listed here makes breakage easy to locate.
 */
import type { ComponentType, Context, ReactNode } from "react";
import { getHook } from "../env";

export interface IgRouteContextValue {
  rootView?: {
    props?: {
      id?: string;
      page_logging?: { name?: string };
    };
  };
  params?: Record<string, string | undefined>;
}

export interface IgApiGetOptions {
  query?: Record<string, unknown>;
  path?: Record<string, string>;
}

export interface IgXhrRequest {
  setMethod(method: string): IgXhrRequest;
  setData(data: Record<string, unknown>): IgXhrRequest;
  setRequestHeader(name: string, value: string): IgXhrRequest;
  setErrorHandler(
    handler: (error: { errorCode?: number; errorType?: string; errorMsg?: string }) => void,
  ): IgXhrRequest;
  setResponseHandler(handler: unknown): IgXhrRequest;
  setTimeout(ms: number): IgXhrRequest;
  setTimeoutHandler(handler: () => void): IgXhrRequest;
  send(): void;
}

export interface IgResponseChunk {
  responseText: string;
  isComplete: boolean;
}

export interface IgGraphqlError {
  code?: number;
  message?: string;
  description?: string;
  severity?: string;
}

export interface IgGraphqlPayload {
  data?: unknown;
  errors?: IgGraphqlError[];
}

export interface IgErrorRecord {
  message?: string;
  name?: string;
  type?: string;
  project?: string;
  script?: string;
  line?: number;
  clientTime?: number;
  loggingSource?: string;
  windowLocationURL?: string;
  stackFrames?: { script?: string; line?: number; column?: number }[];
}

export interface IgGraphqlModule {
  params?: {
    id?: string;
    providedVariables?: Record<string, { get?: () => unknown }>;
  };
}

export interface IgModuleMap {
  PolarisConfig: { getViewerId(): string | null; getCSRFToken(): string; getIGAppID(): string };
  "PolarisIGTheme.react": { isDarkMode(): boolean };
  "CometErrorBoundary.react": ComponentType<{ fallback?: (error: unknown) => ReactNode; children?: ReactNode }>;
  PolarisInstapi: { apiGet<T = unknown>(path: string, options?: IgApiGetOptions): Promise<{ data: T }> };
  PolarisMediaConstants: { MediaTypes: { IMAGE: number; VIDEO: number; CAROUSEL_V2: number } };
  CometRouterRouteContext: Context<IgRouteContextValue | null>;
  "PolarisNavigationItem.react": ComponentType<{ icon: ReactNode; label: ReactNode; onClick: () => void }>;
  XHRRequest: new (uri: string) => IgXhrRequest;
  getAsyncParams: (method: string) => Record<string, string>;
  RelayAPIConfig: { actorID: string };
  createRelayChunkedResponseParser: (onChunks: (chunks: IgResponseChunk[]) => void) => unknown;
  RelayGraphQLRequestUtils: { parsePayload(text: string): IgGraphqlPayload };
  WebBloksVersioningID: { versioningID: string };
  WebPixelRatio: { get(): number };
  Bootloader: { loadModules(modules: string[], callback: () => void, reference?: string): void };
  __debug: { modulesMap: Record<string, { exports?: unknown }> };
  ErrorPubSub: { history: IgErrorRecord[] };
}

export function requireIg<K extends keyof IgModuleMap>(name: K): IgModuleMap[K] {
  return getHook().require<IgModuleMap[K]>(name);
}

/** True when Instagram has defined the module (e.g. a lazily loaded `*.graphql` document). */
export function isModuleDefined(name: string): boolean {
  return getHook().isModuleDefined(name);
}

/** Exports of a module that may not have been required yet. */
export function loadDefinedModule<T>(name: string): T {
  const record = requireIg("__debug").modulesMap[name];
  if (!record) throw new Error(`Module ${name} is not loaded`);
  return (record.exports ?? getHook().require<T>(name)) as T;
}

export function isLoggedIn(): boolean {
  try {
    return !!requireIg("PolarisConfig").getViewerId();
  } catch {
    // If the config module moved, do not block the UI on it.
    return true;
  }
}

export function isDarkMode(): boolean {
  try {
    return requireIg("PolarisIGTheme.react").isDarkMode();
  } catch {
    return false;
  }
}
