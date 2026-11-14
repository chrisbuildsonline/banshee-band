import type { ClassifyErrorCode } from './types';

/** Fixed, plain-language messages. They never hold a URL, the cause's message, scores or samples. */
const MESSAGES: Record<ClassifyErrorCode, string> = {
  'model-load-failed':
    'The sound recognition model could not be loaded. Reload the page. If it keeps happening, the app files may be incomplete.',
  'class-map-invalid':
    'The list of sound names that comes with the app could not be read. Reload the page. If it keeps happening, the app files may be damaged.',
  'invalid-frame': 'A piece of audio had the wrong length or bad values, so it was not checked. Listening goes on.',
  'inference-failed': 'The model could not check a piece of audio, so it was skipped. Listening goes on.',
  disposed: 'Sound recognition is switched off. Start listening again to turn it back on.',
};

export class ClassifyError extends Error {
  readonly code: ClassifyErrorCode;

  constructor(code: ClassifyErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ClassifyError';
    this.code = code;
  }
}
