/**
 * Trigger Registry
 * Export all available triggers
 */

export { ITrigger } from './interface.js';
export { KeyboardTrigger } from './keyboard.js';
export { MenuTrigger } from './menu.js';
export { ViewportTrigger } from './viewport.js';

// Get all triggers in recommended order
export function getAllTriggers() {
  return [
    new KeyboardTrigger(),
    new MenuTrigger(),
    new ViewportTrigger(),
  ];
}
