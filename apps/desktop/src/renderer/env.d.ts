/// <reference types="vite/client" />

import type { GlazeBridge } from "@glaze/contracts";

declare global {
  interface Window {
    glaze: GlazeBridge;
  }
}
