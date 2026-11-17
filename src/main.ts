// App entry: the listening station. Mounting it loads the clip list only; the sound model loads on the
// first chip press, and nothing asks for a microphone.
import { registerServiceWorker } from './pwa/register';
import { mountStation } from './station';
import { initThemeControl } from './ui/theme';

initThemeControl();
mountStation(document.getElementById('station')!);
registerServiceWorker();
