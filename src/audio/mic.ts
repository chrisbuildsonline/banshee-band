// Microphone input: raw stereo constraints, error mapping and the settings the browser reports.
import { CaptureFailure, captureError, toCaptureError } from './errors';

/** Raw stereo: no browser processing, since it breaks the timing and level differences between channels. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
};

async function hasAudioInput(devices: MediaDevices): Promise<boolean> {
  try {
    return (await devices.enumerateDevices()).some((d) => d.kind === 'audioinput');
  } catch {
    return true; // cannot tell, so do not claim there is no device
  }
}

/** Opens the microphone. Call only from `start`, after a user action. Throws `CaptureFailure`. */
export async function openMic(): Promise<MediaStream> {
  const devices: MediaDevices | undefined = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const env = {
    hasMediaDevices: devices !== undefined && typeof devices.getUserMedia === 'function',
    isSecureContext: globalThis.isSecureContext === true,
  };
  if (!devices || !env.hasMediaDevices) throw new CaptureFailure(toCaptureError(undefined, env));
  try {
    return await devices.getUserMedia(MIC_CONSTRAINTS);
  } catch (thrown) {
    const error = toCaptureError(thrown, env);
    if (error.code === 'unknown' && !(await hasAudioInput(devices))) throw new CaptureFailure(captureError('no-device'));
    throw new CaptureFailure(error);
  }
}

/** Channel count and whether the browser reports all three processing steps as off. */
export function describeMic(stream: MediaStream): { channels: 1 | 2; rawProcessing: boolean } {
  const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  return {
    channels: settings.channelCount === 1 ? 1 : 2,
    rawProcessing: settings.echoCancellation === false && settings.noiseSuppression === false && settings.autoGainControl === false,
  };
}
