"use client";

import { Toaster as SonnerToaster } from "sonner";

/** App-wide toast host, styled with the SIRI tokens (light only). */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="light"
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-pop !text-sm",
          description: "!text-ink-3",
        },
      }}
    />
  );
}
