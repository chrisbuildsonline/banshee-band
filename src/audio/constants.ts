/** YAMNet input rate in Hz. */
export const YAMNET_RATE = 16000;
/** Mono frame length in samples at 16 kHz (0.975 s). */
export const WINDOW_SIZE = 15600;
/** Distance between the starts of two mono frames (50% overlap). */
export const HOP_SIZE = 7800;
/** Stereo frame length in sample frames posted by the Tap. */
export const STEREO_BLOCK = 1024;

/** Resampler rate limits (Hz, inclusive). */
export const MIN_IN_RATE = 8000;
export const MAX_IN_RATE = 192000;
export const MIN_OUT_RATE = 8000;
export const MAX_OUT_RATE = 48000;
