/**
 * Phase Registry
 * Exports all phases in order for the extraction pipeline
 */

import { DetectPhase } from './01-detect.js';
import { CapturePhase } from './02-capture.js';
import { DiscoverPhase } from './03-discover.js';
import { TriggerPhase } from './04-trigger.js';
import { PatchPhase } from './05-patch.js';
import { NormalizePhase } from './05b-normalize.js';
import { AssemblePhase } from './06-assemble.js';
import { ValidatePhase } from './07-validate.js';

// Phase order
export const PHASE_ORDER = [
  'detect',
  'capture',
  'discover',
  'trigger',
  'patch',
  'normalize',
  'assemble',
  'validate',
];

// Export individual phases
export {
  DetectPhase,
  CapturePhase,
  DiscoverPhase,
  TriggerPhase,
  PatchPhase,
  NormalizePhase,
  AssemblePhase,
  ValidatePhase,
};

/**
 * Get all phases in order as instances
 * @param {Object} config - Configuration object for phases
 * @returns {Array} - Array of phase instances
 */
export function getPhases(config = {}) {
  return [
    new DetectPhase(config),
    new CapturePhase(config),
    new DiscoverPhase(config),
    new TriggerPhase(config),
    new PatchPhase(config),
    new NormalizePhase(config),
    new AssemblePhase(config),
    new ValidatePhase(config),
  ];
}

/**
 * Get a specific phase by name
 * @param {string} name - Phase name
 * @param {Object} config - Configuration object
 * @returns {Object|null} - Phase instance or null
 */
export function getPhase(name, config = {}) {
  const phases = {
    detect: DetectPhase,
    capture: CapturePhase,
    discover: DiscoverPhase,
    trigger: TriggerPhase,
    patch: PatchPhase,
    normalize: NormalizePhase,
    assemble: AssemblePhase,
    validate: ValidatePhase,
  };

  const PhaseClass = phases[name];
  return PhaseClass ? new PhaseClass(config) : null;
}

/**
 * Get phases up to (and including) a specific phase
 * @param {string} untilPhase - Name of the last phase to include
 * @param {Object} config - Configuration object
 * @returns {Array} - Array of phase instances
 */
export function getPhasesUntil(untilPhase, config = {}) {
  const allPhases = getPhases(config);
  const index = PHASE_ORDER.indexOf(untilPhase);

  if (index === -1) {
    throw new Error(`Unknown phase: ${untilPhase}`);
  }

  return allPhases.slice(0, index + 1);
}

/**
 * Get phases starting from a specific phase
 * @param {string} fromPhase - Name of the first phase to include
 * @param {Object} config - Configuration object
 * @returns {Array} - Array of phase instances
 */
export function getPhasesFrom(fromPhase, config = {}) {
  const allPhases = getPhases(config);
  const index = PHASE_ORDER.indexOf(fromPhase);

  if (index === -1) {
    throw new Error(`Unknown phase: ${fromPhase}`);
  }

  return allPhases.slice(index);
}

export default {
  PHASE_ORDER,
  getPhases,
  getPhase,
  getPhasesUntil,
  getPhasesFrom,
};
