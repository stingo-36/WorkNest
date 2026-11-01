"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { toast } from "@/components/ui/toast";

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
      // `updateViaCache: "none"`: the browser re-checks sw.js itself on every update check.
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
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

  useAppUpdates();

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

/** The deploy id this bundle was built with (next.config.ts). */
const BUNDLE_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "local";
/** How often an open, visible app asks whether a new deploy is out. */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Remembers which server version we last reloaded for, so a mismatch can never loop. */
const RELOADED_FOR = "worknest:reloaded-for";

/**
 * Keeps an installed app (or a long-open tab) on the latest deploy without
 * reinstalling (2026-11-02). Pages already come from the network, but a window
 * left open keeps running the old JavaScript. So the bundle's deploy id is
 * compared with /api/version:
 *  - when the app opens or you come back to it → reload straight away;
 *  - while you're using it (every 5 min, or back online) → a "Refresh" toast,
 *    and the next page change loads fresh — nothing being typed is lost.
 * Off in development (Fast Refresh already updates the page).
 */
function useAppUpdates() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [stalePath, setStalePath] = useState<string | null>(null);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const check = async (reloadNow: boolean) => {
      if (!navigator.onLine) return;
      void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()).catch(() => {});
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = (await response.json()) as { version?: string };
        if (!version || version === BUNDLE_VERSION) return;
        let alreadyTried = false;
        try { alreadyTried = sessionStorage.getItem(RELOADED_FOR) === version; } catch { /* private mode */ }
        if (alreadyTried) return;
        const reload = () => {
          try { sessionStorage.setItem(RELOADED_FOR, version); } catch { /* private mode */ }
          window.location.reload();
        };
        if (reloadNow || document.visibilityState === "hidden") { reload(); return; }
        setStalePath(pathRef.current);
        toast("WorkNest has been updated", {
          id: "app-update",
          duration: Infinity,
          description: "Refresh to get the latest version.",
          action: { label: "Refresh", onClick: reload },
        });
      } catch {
        // Offline or the server is restarting — try again on the next trigger.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const onOnline = () => void check(false);
    void check(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, []);

  // Out of date and moving to another page: load that page fresh from the new deploy.
  useEffect(() => {
    if (stalePath !== null && pathname !== stalePath) window.location.reload();
  }, [stalePath, pathname]);
}

export function usePwaInstall() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("usePwaInstall must be used inside PwaProvider");
  return context;
}
