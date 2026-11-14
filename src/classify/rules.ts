import type { SoundClass } from '../events';

export type SpecificClass = Exclude<SoundClass, 'other'>;
export type Rules = Readonly<Record<SpecificClass, readonly string[]>>;

/**
 * Exact AudioSet display names per specific class. Any name not listed maps to `other`.
 * Placement choices (by meaning, see docs/yamnet.md): household and warning sirens are alarm,
 * emergency vehicle sirens are vehicle; `Car alarm` is alarm; `Babbling` is baby; generic `Door`,
 * `Slam` and `Thump, thud` stay other.
 */
export const RULES: Rules = {
  knock: ['Knock', 'Tap'],
  doorbell: ['Doorbell', 'Ding-dong'],
  alarm: [
    'Alarm',
    'Car alarm',
    'Alarm clock',
    'Siren',
    'Civil defense siren',
    'Buzzer',
    'Smoke detector, smoke alarm',
    'Fire alarm',
    'Beep, bleep',
  ],
  baby: ['Baby laughter', 'Crying, sobbing', 'Baby cry, infant cry', 'Whimper', 'Babbling'],
  vehicle: [
    'Vehicle',
    'Motor vehicle (road)',
    'Car',
    'Vehicle horn, car horn, honking',
    'Toot',
    'Skidding',
    'Tire squeal',
    'Car passing by',
    'Race car, auto racing',
    'Truck',
    'Air brake',
    'Air horn, truck horn',
    'Reversing beeps',
    'Ice cream truck, ice cream van',
    'Bus',
    'Emergency vehicle',
    'Police car (siren)',
    'Ambulance (siren)',
    'Fire engine, fire truck (siren)',
    'Motorcycle',
    'Traffic noise, roadway noise',
    'Bicycle',
    'Accelerating, revving, vroom',
  ],
  voice: [
    'Speech',
    'Child speech, kid speaking',
    'Conversation',
    'Narration, monologue',
    'Speech synthesizer',
    'Shout',
    'Bellow',
    'Whoop',
    'Yell',
    'Children shouting',
    'Screaming',
    'Whispering',
    'Chatter',
    'Hubbub, speech noise, speech babble',
  ],
};
