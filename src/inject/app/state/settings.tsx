import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applySettingsPatch, DEFAULT_SETTINGS, type UserSettings } from "@/shared/settings";
import { background } from "../messaging";

interface SettingsContextValue {
  settings: UserSettings;
  /** Latest settings, for async code that must not capture a stale render. */
  settingsRef: { readonly current: UserSettings };
  loaded: boolean;
  update(patch: Partial<UserSettings>): void;
  replace(settings: UserSettings): void;
  /** Persists the current settings through the background. */
  save(): Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Loads the user's settings from the extension and keeps an editable copy. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    background
      .getSettings()
      .then((stored) => {
        if (cancelled) return;
        setSettings(stored);
        setLoaded(true);
      })
      .catch((error: unknown) => console.error("Failed to load settings", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<UserSettings>) => {
    // A filename edit can flush on blur immediately before Save's click.
    // Keep the value used by save() current before React renders again.
    const next = applySettingsPatch(settingsRef.current, patch);
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const save = useCallback(() => background.saveSettings(settingsRef.current), []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, settingsRef, loaded, update, replace: setSettings, save }),
    [settings, loaded, update, save],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("SettingsProvider is missing");
  return context;
}
