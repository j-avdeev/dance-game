import { MilestonePlaceholder } from "./MilestonePlaceholder.js";

export function HostPage() {
  return (
    <MilestonePlaceholder title="Dance Game" milestone="M5">
      <p>The desktop host creates a room, shows a QR code and plays the reference choreography.</p>
      <p>
        Single-device play lands first: <a href="/play">/play</a>.
      </p>
    </MilestonePlaceholder>
  );
}
