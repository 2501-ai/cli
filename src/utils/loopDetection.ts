import { createHash } from 'crypto';
import { FunctionAction } from './types';

const REPETITION_THRESHOLD = 3;

const actionHashes = new Map<string, number>();

// hash an action
function hashAction(action: FunctionAction): string {
  return createHash('sha256')
    .update(JSON.stringify(<FunctionAction>{ ...action, id: '' })) // id is unique per action, so we remove it
    .digest('hex');
}

export function isLooping(actions: FunctionAction[]): boolean {
  let isLooping = false;

  for (const action of actions) {
    const actionHash = hashAction(action);
    if (actionHashes.has(actionHash)) {
      const count = actionHashes.get(actionHash)!;
      actionHashes.set(actionHash, count + 1);
      isLooping ||= count + 1 >= REPETITION_THRESHOLD;
    } else {
      actionHashes.set(actionHash, 1);
    }
  }

  return isLooping;
}
