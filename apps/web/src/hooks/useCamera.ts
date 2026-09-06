import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera access with an explicit, inspectable state machine.
 *
 * Permission denial is a normal outcome on a phone, not an exception, so it
 * gets its own state and a specific message rather than a generic failure.
 */

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export type CameraState = {
  status: CameraStatus;
  stream: MediaStream | undefined;
  error: string | undefined;
};

export type UseCameraResult = CameraState & {
  start: () => Promise<void>;
  stop: () => void;
};

function describeCameraError(error: unknown): { status: CameraStatus; message: string } {
  if (!(error instanceof Error)) {
    return { status: "error", message: "Could not start the camera." };
  }
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        status: "denied",
        message:
          "Camera permission was denied. Allow camera access in your browser settings, then try again.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return { status: "unavailable", message: "No usable camera was found on this device." };
    case "NotReadableError":
      return {
        status: "unavailable",
        message: "The camera is already in use by another app. Close it and try again.",
      };
    default:
      return { status: "error", message: `Could not start the camera: ${error.message}` };
  }
}

export function useCamera(): UseCameraResult {
  const [state, setState] = useState<CameraState>({
    status: "idle",
    stream: undefined,
    error: undefined,
  });
  // Held in a ref as well so cleanup can stop tracks without depending on
  // render state, which would leave the camera light on after unmount.
  const streamRef = useRef<MediaStream | undefined>(undefined);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    setState({ status: "idle", stream: undefined, error: undefined });
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "unavailable",
        stream: undefined,
        // The overwhelmingly common cause is an insecure context.
        error: "This browser cannot access the camera. A secure HTTPS connection is required.",
      });
      return;
    }

    setState({ status: "requesting", stream: undefined, error: undefined });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // Front camera by default: the dancer faces the phone.
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 1280 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setState({ status: "ready", stream, error: undefined });
    } catch (error) {
      const { status, message } = describeCameraError(error);
      setState({ status, stream: undefined, error: message });
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
    };
  }, []);

  return { ...state, start, stop };
}
