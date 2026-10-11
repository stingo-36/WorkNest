"use client";

import type { ReactNode } from "react";

import { PwaProvider } from "@/components/pwa/pwa-provider";
import { Toaster } from "@/components/ui/toast";

/**
 * Client-side providers mounted once at the root. Kept in its own file so
 * `app/layout.tsx` stays a server component (it needs `next/font` and metadata).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <PwaProvider>
      {children}
      <Toaster />
    </PwaProvider>
  );
}
