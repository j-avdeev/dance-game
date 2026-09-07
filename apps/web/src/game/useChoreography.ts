import { useEffect, useState } from "react";
import { parseChoreography, type Choreography } from "@dance-game/core";

/** Loads and validates a choreography JSON served by the app. */
export function useChoreography(url: string): {
  choreography: Choreography | undefined;
  error: string | undefined;
  loading: boolean;
} {
  const [choreography, setChoreography] = useState<Choreography | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        // Validate on load: a malformed file must fail here with a clear
        // message rather than inside the scoring loop.
        return parseChoreography(await response.json());
      })
      .then((parsed) => {
        if (!cancelled) {
          setChoreography(parsed);
          setLoading(false);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? `Could not load the choreography: ${caught.message}`
              : "Could not load the choreography.",
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { choreography, error, loading };
}
