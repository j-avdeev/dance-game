import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { PROTOCOL_VERSION } from "@dance-game/core";
import { loadServerConfig, type ServerConfig } from "./config.js";

/**
 * M0 relay: a health endpoint and TLS-capable startup only.
 *
 * Rooms, pairing and pose relaying arrive in M5 (see PLAN.md, "Network
 * protocol v1"). The server must never receive camera images or video.
 */
function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", protocolVersion: PROTOCOL_VERSION }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not-found" }));
}

function createServer(config: ServerConfig) {
  if (config.tlsKeyPath && config.tlsCertPath) {
    return createHttpsServer(
      {
        key: readFileSync(config.tlsKeyPath),
        cert: readFileSync(config.tlsCertPath),
      },
      handleRequest,
    );
  }
  return createHttpServer(handleRequest);
}

export function startServer(config: ServerConfig = loadServerConfig()) {
  const server = createServer(config);
  const scheme = config.tlsKeyPath && config.tlsCertPath ? "https" : "http";

  server.listen(config.port, config.host, () => {
    console.log(`[realtime] listening on ${scheme}://${config.host}:${config.port}`);
    console.log(`[realtime] protocol version ${PROTOCOL_VERSION}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[realtime] ${signal} received, closing`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

startServer();
