/** Samples per Frame. Equals WINDOW_SIZE in src/audio; kept local so classify has no runtime import from audio. */
export const FRAME_SIZE = 15600;
/** Number of AudioSet classes YAMNet scores. */
export const SCORE_COUNT = 521;
/**
 * Minimum Aggregate a specific class needs to be chosen over `other`. One global value for all classes.
 * Measured on the six clips (docs/yamnet.md): real target frames reach 0.208 and up, frames with
 * no relevant sound stay at 0.074 or below; 0.15 sits between with margin on both sides.
 */
export const DEFAULT_THRESHOLD = 0.15;
/** Tie-break order for specific classes: classes that need a fast reaction first. */
export const CLASS_PRIORITY = ['alarm', 'baby', 'doorbell', 'knock', 'vehicle', 'voice'] as const;
