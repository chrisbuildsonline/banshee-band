import type { Urgency } from '../events';
import { CLASS_WEIGHT, URGENCY_RANK, URGENCY_RANK_STEP } from './constants';
import type { HapticClass } from './types';

/**
 * The priority of an event: `urgencyRank * 10 + classWeight`. Higher wins. Any higher urgency outranks
 * any lower one; at one urgency the class weights decide (alarm first, voice last).
 */
export function priorityOf(urgency: Urgency, cls: HapticClass): number {
  return URGENCY_RANK[urgency] * URGENCY_RANK_STEP + CLASS_WEIGHT[cls];
}
