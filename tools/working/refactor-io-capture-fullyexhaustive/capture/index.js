/**
 * Capture module - I/O recording and serialization
 */
const { executeAndCapture, captureSnapshot, executeAction, generateActionsForElement } = require('./io');
const { computeDiff, computeDOMDiff, computeStyleDiff } = require('./diff');
const { serializeIOSpec, serializeStateGraph, serializeAllIO, createSummary } = require('./serialize');

module.exports = {
  executeAndCapture,
  captureSnapshot,
  executeAction,
  generateActionsForElement,
  computeDiff,
  computeDOMDiff,
  computeStyleDiff,
  serializeIOSpec,
  serializeStateGraph,
  serializeAllIO,
  createSummary
};
