/**
 * Simple debug logger with levels
 */
const config = require('./config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
let currentLevel = config.verbose ? LEVELS.debug : LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] <= currentLevel) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}]`;
    console.log(prefix, ...args);
  }
}

module.exports = {
  setLevel: (level) => { currentLevel = LEVELS[level] || LEVELS.info; },
  error: (...args) => log('error', ...args),
  warn: (...args) => log('warn', ...args),
  info: (...args) => log('info', ...args),
  debug: (...args) => log('debug', ...args),
  trace: (...args) => log('trace', ...args),

  // Progress reporting
  progress: (current, total, label) => {
    const pct = ((current / total) * 100).toFixed(1);
    log('info', `${label}: ${current}/${total} (${pct}%)`);
  }
};
