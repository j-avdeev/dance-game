/**
 * The host must never assume `window.location` is reachable from the phone.
 * A laptop serving on a LAN address, a tunnel, and a production deploy all
 * differ, so the QR code and the pose transport read these values instead.
 *
 * Both default to the current origin, which is correct in production and when
 * the phone reaches the dev server directly over the LAN.
 */

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

/** Base URL encoded into the pairing QR code. */
export function getPublicWebUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }
  return trimTrailingSlash(window.location.origin);
}

/** WebSocket URL of the realtime relay. */
export function getPublicWsUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_WS_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }
  // Default to the same host on the relay's port, upgrading the scheme so an
  // HTTPS page never tries to open an insecure socket.
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8080`;
}
