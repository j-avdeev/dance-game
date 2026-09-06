import { MilestonePlaceholder } from "./MilestonePlaceholder.js";

export function ChoreographyToolPage() {
  return (
    <MilestonePlaceholder title="Choreography extractor" milestone="M2">
      <p>
        Select a local video, extract reference poses with seek-based sampling and export
        choreography JSON. Video never leaves the browser.
      </p>
    </MilestonePlaceholder>
  );
}
