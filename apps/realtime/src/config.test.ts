import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config.js";

describe("loadServerConfig", () => {
  it("falls back to the documented defaults", () => {
    const config = loadServerConfig({});
    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.tlsKeyPath).toBeUndefined();
    expect(config.tlsCertPath).toBeUndefined();
  });

  it("reads the port from the environment", () => {
    expect(loadServerConfig({ PORT: "9001" }).port).toBe(9001);
  });

  it("rejects a port that is not a usable number", () => {
    // Hosting platforms inject PORT; a silent fallback would bind the wrong
    // port and look like a networking bug much later.
    expect(() => loadServerConfig({ PORT: "not-a-port" })).toThrow(/Invalid PORT/);
    expect(() => loadServerConfig({ PORT: "0" })).toThrow(/Invalid PORT/);
    expect(() => loadServerConfig({ PORT: "70000" })).toThrow(/Invalid PORT/);
  });
});
