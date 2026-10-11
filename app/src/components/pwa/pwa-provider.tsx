"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type InstallInstructions = "ios" | "browser";

type PwaContextValue = {
  canInstall: boolean;
  instructions: InstallInstructions;
  instructionsOpen: boolean;
  install: () => Promise<void>;
  closeInstructions: () => void;
};

const PwaContext = createContext<PwaContextValue | null>(null);

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Registers the network-only service worker and owns the cross-browser install
 * state. Chromium can show its native prompt; iOS and other browsers get short
 * instructions because `beforeinstallprompt` is not a web standard there.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructions, setInstructions] = useState<InstallInstructions>("browser");

  useEffect(() => {
    if (!window.isSecureContext || isStandalone()) return;

    let cancelled = false;
    const instructionKind = isAppleMobile() ? "ios" : "browser";
    queueMicrotask(() => {
      if (cancelled) return;
      setCanInstall(true);
      setInstructions(instructionKind);
    });

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstructionsOpen(false);
      setCanInstall(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Installation remains optional; a registration failure must never
        // interfere with loading or using the signed-in app.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall,
      instructions,
      instructionsOpen,
      install: async () => {
        if (!promptEvent) {
          setInstructionsOpen(true);
          return;
        }

        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        setPromptEvent(null);
        if (choice.outcome === "accepted") setCanInstall(false);
      },
      closeInstructions: () => setInstructionsOpen(false),
    }),
    [canInstall, instructions, instructionsOpen, promptEvent],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("usePwaInstall must be used inside PwaProvider");
  return context;
}
