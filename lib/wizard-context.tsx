"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hairSurveySchema, type HairSurveyInput } from "@/lib/validation";
import {
  deleteCachedSelfie,
  loadCachedSelfie,
  saveCachedSelfie,
} from "@/lib/selfie-cache";

interface WizardState {
  designerSlug: string | null;
  selfieDataUrl: string | null;
  selfieConsent: boolean;
  survey: HairSurveyInput | null;
  styleId: string | null;
}

interface WizardContextValue extends WizardState {
  // False until the browser storage restore effect has run once on the
  // client. Consumers must wait for this before deciding to redirect,
  // otherwise they'd bounce users away during the one-frame gap between
  // the (always-empty) SSR/hydration render and the restored state.
  isHydrated: boolean;
  setDesignerSlug: (slug: string) => void;
  setSelfieConsent: (consented: boolean) => void;
  setSelfie: (dataUrl: string) => void;
  clearSelfie: () => void;
  setSurvey: (survey: HairSurveyInput) => void;
  setStyleId: (styleId: string) => void;
  reset: () => void;
}

const EMPTY_STATE: WizardState = {
  designerSlug: null,
  selfieDataUrl: null,
  selfieConsent: false,
  survey: null,
  styleId: null,
};

const STORAGE_KEY = "hair-mvp-wizard-state";

const WizardContext = createContext<WizardContextValue | null>(null);

function loadFromBrowserStorage(): WizardState {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }
  try {
    // localStorage makes the cached photo reusable after closing the tab.
    // Fall back to the former sessionStorage entry for a one-time migration.
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const loaded = { ...EMPTY_STATE, ...JSON.parse(raw) } as WizardState;
    // The survey schema can gain required questions as the MVP learns from
    // stylists. An older saved session must restart at the survey rather than
    // failing later at an API boundary with incomplete data.
    const survey = hairSurveySchema.safeParse(loaded.survey).success
      ? loaded.survey
      : null;
    return loaded.selfieConsent
      ? { ...loaded, survey, styleId: survey ? loaded.styleId : null }
      : { ...loaded, selfieDataUrl: null, survey, styleId: survey ? loaded.styleId : null };
  } catch {
    return EMPTY_STATE;
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  // Always start from EMPTY_STATE so the client's hydration render matches
  // the server's — browser storage doesn't exist on the server, so reading
  // it inside useState's initializer made the client's first paint diverge
  // from the SSR output and threw a hydration-mismatch error.
  const [state, setState] = useState<WizardState>(EMPTY_STATE);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreState() {
      const restored = loadFromBrowserStorage();
      let cachedSelfie: string | null = null;

      if (restored.selfieConsent) {
        try {
          cachedSelfie = await loadCachedSelfie();
          // Migrate photos saved by the older sessionStorage implementation
          // before the lightweight session state overwrites that entry.
          if (!cachedSelfie && restored.selfieDataUrl) {
            cachedSelfie = restored.selfieDataUrl;
            await saveCachedSelfie(cachedSelfie);
          }
        } catch {
          // Private browsing modes can disable IndexedDB. The wizard remains
          // usable for the current tab through its in-memory state.
        }
      }

      if (cancelled) return;
      // Deliberate one-time post-hydration sync from browser storage, not a
      // derived-state effect. This avoids an SSR hydration mismatch.
      setState({
        ...restored,
        selfieDataUrl: cachedSelfie ?? restored.selfieDataUrl,
      });
      setIsHydrated(true);
    }

    void restoreState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Keep the large, sensitive image out of Web Storage. IndexedDB is used
    // for the photo; localStorage only holds lightweight consent/wizard fields
    // so a later browser visit can restore the local photo deliberately saved
    // by the user.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, selfieDataUrl: null })
    );
  }, [isHydrated, state]);

  const value = useMemo<WizardContextValue>(() => {
    return {
      ...state,
      isHydrated,
      setDesignerSlug: (designerSlug) =>
        setState((previous) => ({ ...previous, designerSlug })),
      setSelfieConsent: (selfieConsent) =>
        setState((previous) => {
          if (!selfieConsent) void deleteCachedSelfie().catch(() => undefined);
          return {
            ...previous,
            selfieConsent,
            selfieDataUrl: selfieConsent ? previous.selfieDataUrl : null,
          };
        }),
      setSelfie: (selfieDataUrl) => {
        setState((previous) => ({ ...previous, selfieDataUrl }));
        void saveCachedSelfie(selfieDataUrl).catch(() => undefined);
      },
      clearSelfie: () => {
        setState((previous) => ({ ...previous, selfieDataUrl: null }));
        void deleteCachedSelfie().catch(() => undefined);
      },
      setSurvey: (survey) =>
        setState((previous) => ({ ...previous, survey })),
      setStyleId: (styleId) =>
        setState((previous) => ({ ...previous, styleId })),
      reset: () => {
        setState(EMPTY_STATE);
        void deleteCachedSelfie().catch(() => undefined);
      },
    };
  }, [state, isHydrated]);

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return ctx;
}
