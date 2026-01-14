/**
 * Patcher Registry
 * Export all available patchers
 */

export { IPatcher, PatchResult } from './interface.js';
export { DomainBypassPatcher } from './domain-bypass.js';
export { PhotopeaPatcher } from './photopea.js';

import { DomainBypassPatcher } from './domain-bypass.js';
import { PhotopeaPatcher } from './photopea.js';

// Get all patchers in recommended order
export function getAllPatchers() {
  return [
    new PhotopeaPatcher(),
    new DomainBypassPatcher(),
  ];
}
