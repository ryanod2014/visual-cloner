/**
 * Discovery module - enumerate all interactive elements
 */
const { discoverElements } = require('./elements');
const { discoverEventListeners } = require('./events');
const { discoverKeyboardShortcuts } = require('./keyboard');
const { discoverAPIFunctions } = require('./api');
const logger = require('../utils/logger');

async function runFullDiscovery(page, hashStateFn) {
  logger.info('=== PHASE 1: DISCOVERY ===');

  const discovery = {
    timestamp: Date.now(),
    elements: await discoverElements(page),
    eventListeners: await discoverEventListeners(page),
    keyboardShortcuts: await discoverKeyboardShortcuts(page, hashStateFn),
    apiFunctions: await discoverAPIFunctions(page)
  };

  discovery.summary = {
    totalElements: discovery.elements.length,
    totalEventListeners: discovery.eventListeners.length,
    totalShortcuts: discovery.keyboardShortcuts.length,
    totalAPIFunctions: discovery.apiFunctions.length
  };

  logger.info('Discovery complete:', discovery.summary);
  return discovery;
}

module.exports = {
  runFullDiscovery,
  discoverElements,
  discoverEventListeners,
  discoverKeyboardShortcuts,
  discoverAPIFunctions
};
