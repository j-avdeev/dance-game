import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

/**
 * `getUserMedia` requires a secure context, so a phone opening
 * `http://<lan-ip>:5173` gets no camera at all. Dev therefore serves HTTPS by
 * default. Set `DANCE_GAME_DEV_HTTPS=false` when running behind a tunnel that
 * already terminates TLS (cloudflared, ngrok), which is the friendlier path on
 * iOS where self-signed certificates are painful.
 */
const useDevHttps = process.env["DANCE_GAME_DEV_HTTPS"] !== "false";

export default defineConfig(({ command, isPreview }) => {
  const plugins: PluginOption[] = [
    react(),
    VitePWA({
      registerType: "prompt",
      // The controller must work from a plain QR-scanned URL, so installation
      // stays optional and offline caching is deliberately minimal in M0.
      // Choreography and video assets are NOT precached yet; see PLAN.md.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        globIgnores: ["**/content/**"],
      },
      manifest: {
        name: "Dance Game",
        short_name: "Dance Game",
        description:
          "Browser dance game. The phone is the motion controller; camera video never leaves the device.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b0b12",
        theme_color: "#0b0b12",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        // Keep the service worker out of the way during development.
        enabled: false,
      },
    }),
  ];

  // Dev only. `vite preview` also runs under `command === "serve"`, and it is
  // meant to mirror production, where TLS is terminated upstream (Cloudflare
  // Pages, a tunnel, or the platform). Serving HTTPS there would also break
  // the Playwright web server, which polls over HTTP.
  if (command === "serve" && !isPreview && useDevHttps) {
    plugins.push(basicSsl());
  }

  return {
    plugins,
    server: {
      port: 5173,
      // `pnpm dev --host` then exposes the LAN address a phone can reach.
      host: false,
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
