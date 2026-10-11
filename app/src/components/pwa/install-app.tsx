"use client";

import { Download, MoreVertical, Share } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { usePwaInstall } from "@/components/pwa/pwa-provider";
import { menuItemClass } from "@/components/shell/menu";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function InstallAppMenuItem() {
  const { canInstall, install } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      role="menuitem"
      className={menuItemClass}
      onClick={() => void install()}
    >
      <Download aria-hidden="true" />
      Install WorkNest
    </button>
  );
}

export function InstallAppDialog() {
  const { instructions, instructionsOpen, closeInstructions } = usePwaInstall();
  const ios = instructions === "ios";

  return (
    <Modal
      open={instructionsOpen}
      onClose={closeInstructions}
      eyebrow="Mobile web app"
      title="Install WorkNest"
      footer={<Button onClick={closeInstructions}>Got it</Button>}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={80}
            height={80}
            className="size-20 rounded-2xl"
          />
          <p className="text-md leading-relaxed text-text-muted">
            Add WorkNest to your home screen. It opens in its own window and
            feels like an app.
          </p>
        </div>

        <ol className="space-y-4" aria-label="Installation steps">
          <InstallStep
            number="1"
            icon={
              ios ? (
                <Share aria-hidden="true" />
              ) : (
                <MoreVertical aria-hidden="true" />
              )
            }
            text={ios ? "Open the browser Share menu." : "Open your browser menu."}
          />
          <InstallStep
            number="2"
            text={
              ios
                ? "Choose Add to Home Screen."
                : "Choose Install app or Add to Home Screen."
            }
          />
          <InstallStep number="3" text="Confirm by tapping Add or Install." />
        </ol>

        <p className="rounded-lg border border-border bg-surface-2 p-4 text-sm leading-relaxed text-text-muted">
          The service worker never saves signed-in pages. If your connection
          drops, it shows a safe offline screen instead of storing private work
          data in its cache.
        </p>
      </div>
    </Modal>
  );
}

function InstallStep({
  number,
  icon,
  text,
}: {
  number: string;
  icon?: ReactNode;
  text: string;
}) {
  return (
    <li className="flex items-center gap-3 text-md text-text">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar text-sm font-semibold text-sidebar-fg">
        {number}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span className="grid size-8 place-items-center [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <span>{text}</span>
      </span>
    </li>
  );
}
