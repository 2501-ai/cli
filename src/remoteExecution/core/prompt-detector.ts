/**
 * The prompt detector is responsible for triggering the prompt callback upon receiving stdout or stderr.
 * Features :
 * - Static prompt detection patterns
 * - Fallback timeout to trigger the prompt callback if no prompt is detected first.
 * - Debounce prompt check to avoid checking for prompts if output is changing too fast.
 */

import { PromptDetectionResult } from '../types';
import { OutputBuffer } from './output-buffer';
import Logger from '../../utils/logger';

const HIGH_CONFIDENCE_PATTERNS = [
  // Authentication prompts - these ALWAYS need user input
  {
    pattern: /(password|passphrase|username|login)[\s:]*$/i,
    confidence: 0.95,
    description: 'Authentication prompt',
  },

  // Choice prompts - clear user decisions required
  {
    pattern: /[\[\(][yYnN]\/[yYnN][\]\)][\s:]*$/i,
    confidence: 0.9,
    description: 'Y/n choice prompt',
  },

  // End with a question mark
  {
    pattern: /\?[\s:]*$/i,
    confidence: 0.8,
    description: 'Question prompt',
  },
];
// Main prompt callback timeout
let promptTimeout: NodeJS.Timeout | null = null;
function clearPromptTimeout() {
  if (promptTimeout) {
    Logger.debug('Clearing prompt timeout');
    clearTimeout(promptTimeout);
    promptTimeout = null;
  }
}

// Debounced static prompt check timeout
let debouncePromptCheckTimeout: NodeJS.Timeout | null = null;
const clearDebouncePromptCheckTimeout = () => {
  if (debouncePromptCheckTimeout) {
    Logger.debug('Clearing debounce prompt check timeout');
    clearTimeout(debouncePromptCheckTimeout);
    debouncePromptCheckTimeout = null;
  }
};

export const clearAllPromptTimeouts = () => {
  clearPromptTimeout();
  clearDebouncePromptCheckTimeout();
};

// ⚠️ Debounce prompt check to avoid checking for prompts if output is changing too fast
export const debouncePromptCheck = (
  outputBuffer: OutputBuffer,
  handlePrompt: () => any
) => {
  clearDebouncePromptCheckTimeout();
  debouncePromptCheckTimeout = setTimeout(() => {
    checkForPrompt(outputBuffer, handlePrompt);
  }, 1000);
};

/**
 * Detects prompts in the output of a command.
 */
function detectPrompt(outputBuffer: OutputBuffer): PromptDetectionResult {
  const lastLine = outputBuffer.getLastLine();

  // Check high-confidence patterns first
  for (const { pattern, confidence, description } of HIGH_CONFIDENCE_PATTERNS) {
    if (pattern.test(lastLine)) {
      Logger.debug('Prompt detected via pattern', {
        pattern: description,
        confidence: confidence.toFixed(2),
        lastLine: lastLine.slice(-100), // Last 100 chars for context
      });

      return {
        isPrompt: true,
        confidence,
        reasons: [description],
        method: 'pattern',
      };
    }
  }

  // If no strong patterns found, it's not a prompt
  Logger.debug('No prompt patterns detected', {
    lastLine: lastLine.slice(-100),
  });

  return {
    isPrompt: false,
    confidence: 0,
    reasons: ['No matching prompt patterns'],
    method: 'pattern',
  };
}

/**
 * Triggers the prompt callback if a prompt is detected, or sets a timeout to trigger it if no prompt is detected.
 */
function checkForPrompt(outputBuffer: OutputBuffer, promptCallback: () => any) {
  clearPromptTimeout();
  const detection = detectPrompt(outputBuffer);

  // If we detected a prompt pattern, handle it immediately
  if (detection.isPrompt) {
    promptCallback();
    return;
  }

  // Fallback: Set new timeout to detect if command is waiting for input
  promptTimeout = setTimeout(() => {
    Logger.debug('Prompt timeout triggered');
    promptCallback();
  }, 15_000); // 15 seconds timeout for prompt detection
}
