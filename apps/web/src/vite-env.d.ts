/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Public base URL of the web app, encoded into the pairing QR code. */
  readonly VITE_PUBLIC_WEB_URL?: string;
  /** Public WebSocket URL of the realtime relay. */
  readonly VITE_PUBLIC_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
