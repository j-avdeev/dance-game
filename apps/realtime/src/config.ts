/** Runtime configuration for the relay, read once at startup. */
export type ServerConfig = {
  port: number;
  host: string;
  /**
   * Paths to a TLS key/cert pair. When both are set the relay serves `wss://`
   * itself; otherwise it serves `ws://` and is expected to sit behind a TLS
   * terminator (Cloudflare Tunnel in development, the platform in production).
   */
  tlsKeyPath: string | undefined;
  tlsCertPath: string | undefined;
};

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return parsed;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: readPort(env["PORT"], 8080),
    host: env["HOST"] ?? "0.0.0.0",
    tlsKeyPath: env["TLS_KEY_PATH"],
    tlsCertPath: env["TLS_CERT_PATH"],
  };
}
