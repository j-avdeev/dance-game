import { useEffect, useRef, type RefObject } from "react";
import {
  POSE_SKELETON_EDGES,
  toNormalizedLandmarks,
  type Landmark,
  type PoseFrame,
} from "@dance-game/core";

/**
 * Draws the 33-point skeleton over the camera preview.
 *
 * Reads the latest frame from a ref on every animation frame rather than
 * taking it as a prop, so drawing runs at camera rate without re-rendering
 * React at the same speed.
 */

export type SkeletonOverlayProps = {
  frameRef: RefObject<PoseFrame | undefined>;
  /** Display width in CSS pixels. */
  width: number;
  /** Display height in CSS pixels. */
  height: number;
  /**
   * Mirrors the drawing horizontally, to match a mirrored front-camera
   * preview. Display only: the landmarks themselves are never flipped.
   */
  mirrored?: boolean;
  className?: string;
};

const JOINT_RADIUS = 4;
const LOW_VISIBILITY = 0.5;

function drawSkeleton(
  context: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
): void {
  context.lineWidth = 3;
  context.strokeStyle = "#6c5ce7";

  for (const [startIndex, endIndex] of POSE_SKELETON_EDGES) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end) {
      continue;
    }
    // Dim uncertain limbs rather than hiding them, so the user can see that
    // tracking is struggling instead of watching the skeleton lose an arm.
    const confident = start.visibility >= LOW_VISIBILITY && end.visibility >= LOW_VISIBILITY;
    context.globalAlpha = confident ? 1 : 0.25;
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  }

  for (const landmark of landmarks) {
    context.globalAlpha = landmark.visibility >= LOW_VISIBILITY ? 1 : 0.25;
    context.fillStyle = landmark.visibility >= LOW_VISIBILITY ? "#e9e9f2" : "#9a9ab0";
    context.beginPath();
    context.arc(landmark.x * width, landmark.y * height, JOINT_RADIUS, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
}

export function SkeletonOverlay({
  frameRef,
  width,
  height,
  mirrored = false,
  className,
}: SkeletonOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    // Render at device resolution so the skeleton is not blurry on phones.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    let rafHandle = 0;
    const draw = (): void => {
      rafHandle = requestAnimationFrame(draw);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const frame = frameRef.current;
      if (!frame || frame.landmarks.length === 0) {
        return;
      }

      // Landmarks are aspect-corrected; undo that to map onto the preview box.
      const normalized = toNormalizedLandmarks(
        frame.landmarks,
        frame.imageWidth,
        frame.imageHeight,
      );

      if (mirrored) {
        context.translate(width, 0);
        context.scale(-1, 1);
      }
      drawSkeleton(context, normalized, width, height);
    };

    rafHandle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafHandle);
  }, [frameRef, width, height, mirrored]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-hidden="true"
    />
  );
}
