import { useEffect, type RefObject } from "react";

export type CameraPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | undefined;
  width: number;
  height: number;
  /** Mirrors the preview so it reads like a mirror. Display only. */
  mirrored?: boolean;
};

/**
 * Camera preview element.
 *
 * `playsInline` is what stops iOS Safari from hijacking the video into
 * fullscreen playback, which would break the overlay entirely.
 */
export function CameraPreview({
  videoRef,
  stream,
  width,
  height,
  mirrored = true,
}: CameraPreviewProps) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream ?? null;
    if (stream) {
      void video.play().catch((error: unknown) => {
        console.warn("[camera] autoplay rejected", error);
      });
    }
  }, [videoRef, stream]);

  return (
    <video
      ref={videoRef}
      playsInline
      muted
      autoPlay
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        objectFit: "cover",
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    />
  );
}
