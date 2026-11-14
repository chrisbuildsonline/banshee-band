// App entry. The listening station mounts here in a later feature and starts this capture from a
// user action. Creating it starts nothing: no microphone, no audio context, no request.
import { createCapture } from './audio';

export const capture = createCapture();
