import { MilestonePlaceholder } from "./MilestonePlaceholder.js";

export function NotFoundPage() {
  return (
    <MilestonePlaceholder title="Not found" milestone="—">
      <p>
        No such page. Go to <a href="/">the host</a>.
      </p>
    </MilestonePlaceholder>
  );
}
