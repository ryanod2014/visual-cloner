/**
 * Serialization utilities for I/O data
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Serialize I/O spec to JSON file
 */
function serializeIOSpec(spec, outputPath) {
  const json = JSON.stringify(spec, null, 2);
  fs.writeFileSync(outputPath, json);
  logger.debug(`Saved: ${outputPath}`);
}

/**
 * Serialize state graph
 */
function serializeStateGraph(stateGraph, outputDir) {
  const graphPath = path.join(outputDir, 'state-machine.json');

  // Convert Map to object for JSON
  const serializable = {
    initialState: stateGraph.initialState,
    states: Object.fromEntries(stateGraph.states),
    transitions: stateGraph.transitions.map(t => ({
      from: t.from,
      action: {
        type: t.action.type,
        selector: t.action.selector
      },
      to: t.to
    }))
  };

  fs.writeFileSync(graphPath, JSON.stringify(serializable, null, 2));
  logger.info(`Saved state machine: ${graphPath}`);
}

/**
 * Serialize all I/O specs
 */
function serializeAllIO(transitions, outputDir) {
  const ioDir = path.join(outputDir, 'io-specs');
  if (!fs.existsSync(ioDir)) {
    fs.mkdirSync(ioDir, { recursive: true });
  }

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    if (!t.io) continue;

    const filename = `${i.toString().padStart(5, '0')}-${t.from.slice(0, 8)}-${t.action.type}-${t.to.slice(0, 8)}.json`;
    const filepath = path.join(ioDir, filename);

    serializeIOSpec(t.io, filepath);
  }

  logger.info(`Saved ${transitions.length} I/O specs to ${ioDir}`);
}

/**
 * Create summary file
 */
function createSummary(discovery, exploration, outputDir) {
  const summary = {
    timestamp: new Date().toISOString(),
    discovery: discovery.summary,
    exploration: {
      totalStates: exploration.metrics.totalStates,
      totalTransitions: exploration.metrics.totalTransitions
    },
    files: {
      manifest: 'manifest.json',
      stateMachine: 'state-machine.json',
      ioSpecs: 'io-specs/'
    }
  };

  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  logger.info(`Saved summary: ${summaryPath}`);

  return summary;
}

module.exports = {
  serializeIOSpec,
  serializeStateGraph,
  serializeAllIO,
  createSummary
};
