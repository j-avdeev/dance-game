import { useEffect, useRef } from "react";
import {
  POSE_SKELETON_EDGES,
  findFrameAtOrBefore,
  toNormalizedLandmarks,
  type Choreography,
} from "@dance-game/core";

/**
 * Draws the extracted skeleton over the source video for validation.
 *
 * This is the check that the extraction is actually correct: if the stored
 * landmarks line up with the dancer while the video plays, the timeline is
 * sound. If they lag, drift or sit on the wrong limbs, it is not.
 */

export type ChoreographyPreviewProps = {
  choreography: Choreography;
  video: HTMLVideoElement | null;
  /** Seconds into the video where the choreography starts. */
  trimStartSeconds: number;
  width: number;
  height: number;
};

export function ChoreographyPreview({
  choreography,
  video,
  trimStartSeconds,
  width,
  height,
}: ChoreographyPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !video) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    let rafHandle = 0;
    const draw = (): void => {
      rafHandle = requestAnimationFrame(draw);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const tMs = (video.currentTime - trimStartSeconds) * 1000;
      const frame = findFrameAtOrBefore(choreography, tMs);
      if (!frame || frame.landmarks.length === 0) {
        return;
      }

      const landmarks = toNormalizedLandmarks(
        frame.landmarks,
        choreography.imageWidth,
        choreography.imageHeight,
      );

      context.strokeStyle = "#2ecc71";
      context.lineWidth = 3;
      for (const [startIndex, endIndex] of POSE_SKELETON_EDGES) {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];
        if (!start || !end) {
          continue;
        }
        context.beginPath();
        context.moveTo(start.x * width, start.y * height);
        context.lineTo(end.x * width, end.y * height);
        context.stroke();
      }

      context.fillStyle = "#e9e9f2";
      for (const landmark of landmarks) {
        context.beginPath();
        context.arc(landmark.x * width, landmark.y * height, 3.5, 0, Math.PI * 2);
        context.fill();
      }
    };

    rafHandle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafHandle);
  }, [choreography, video, trimStartSeconds, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="preview__overlay"
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    />
  );
}
