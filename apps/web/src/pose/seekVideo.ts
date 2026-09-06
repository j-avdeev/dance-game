/**
 * Seeks a video element to an exact time and waits for the frame to be ready.
 *
 * Extraction must not sample from live playback: playback delivers whatever
 * frame happens to be showing when inference runs, so timestamps drift and a
 * re-run produces different data. Seeking pins each sample to an exact time.
 */

/** Seeking past the end, or into a gap, can leave `seeked` unfired. */
const SEEK_TIMEOUT_MS = 10_000;

export class VideoSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoSeekError";
  }
}

export async function seekTo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  // Already there: `seeked` would never fire, so waiting would hang.
  if (Math.abs(video.currentTime - timeSeconds) < 1e-6 && video.readyState >= 2) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new VideoSeekError(`Timed out seeking to ${timeSeconds.toFixed(3)}s`));
    }, SEEK_TIMEOUT_MS);

    function cleanup(): void {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
    }

    const onSeeked = (): void => {
      cleanup();
      resolve();
    };

    const onError = (): void => {
      cleanup();
      reject(new VideoSeekError(`Failed to seek to ${timeSeconds.toFixed(3)}s`));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timeSeconds;
  });

  // `seeked` fires when the seek completes, but the decoded frame is not
  // always painted yet. Without this, inference can read the previous frame.
  if ("requestVideoFrameCallback" in video) {
    await new Promise<void>((resolve) => {
      // Guard against a browser that never fires the callback for this frame.
      const frameTimer = setTimeout(resolve, 200);
      (video as HTMLVideoElement).requestVideoFrameCallback(() => {
        clearTimeout(frameTimer);
        resolve();
      });
    });
  }
}

/** Waits until the video has dimensions and duration available. */
export async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new VideoSeekError("The video could not be loaded. Is the format supported?"));
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}
