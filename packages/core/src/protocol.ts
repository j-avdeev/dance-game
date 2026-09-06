/**
 * Wire protocol constants shared by the web app and the realtime relay.
 *
 * The message schemas themselves arrive in M5; M0 only fixes the version and
 * the limits the server will enforce, so both sides agree from the start.
 */

/** Version stamped on every protocol message. */
export const PROTOCOL_VERSION = 1 as const;

/** Target rate at which the controller sends pose packets. */
export const TARGET_POSE_RATE_HZ = 15;

/** Rooms survive a disconnect this long, so a reload can rejoin. */
export const ROOM_GRACE_MS = 5 * 60 * 1000;

/** The host pauses when no pose or heartbeat arrives within this window. */
export const CONTROLLER_TIMEOUT_MS = 2000;

/** Maximum accepted size of a single relayed message. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** Decimal places pose coordinates are rounded to before transmission. */
export const POSE_COORDINATE_PRECISION = 4;
