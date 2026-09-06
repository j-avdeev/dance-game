import { useParams } from "react-router-dom";
import { MilestonePlaceholder } from "./MilestonePlaceholder.js";

export function ControllerPage() {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <MilestonePlaceholder title="Controller" milestone="M5">
      <p>Pairing with room {roomId ?? "(unknown)"}.</p>
      <p>The camera stays on this device; only pose landmarks are sent.</p>
    </MilestonePlaceholder>
  );
}
