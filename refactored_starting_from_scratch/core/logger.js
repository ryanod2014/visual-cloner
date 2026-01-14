/**
 * Structured Logger for Extraction Pipeline
 *
 * Provides phase-aware logging with:
 * - Log levels: debug, info, warn, error
 * - Phase tracking and timestamps
 * - Progress bars for long operations
 * - Colored console output
 * - Event capture for post-mortem analysis
 *
 * Usage:
 *   const logger = new Logger({ level: 'debug', verbose: true });
 *   logger.setPhase('01-detect');
 *   logger.info('Starting detection');
 *   logger.progress(5, 100, 'Processing files...');
 */

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Log level numeric values for comparison
const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Level display configuration
const LEVEL_CONFIG = {
  debug: { color: COLORS.dim, label: '[DEBUG]' },
  info: { color: COLORS.reset, label: '' },
  warn: { color: COLORS.yellow, label: '[WARN]' },
  error: { color: COLORS.red, label: '[ERROR]' },
};

/**
 * Main Logger class
 * Provides structured, phase-aware logging with progress tracking
 */
export class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} options - Logger configuration
   * @param {string} options.level - Minimum log level ('debug', 'info', 'warn', 'error')
   * @param {boolean} options.verbose - Enable verbose output with context details
   * @param {boolean} options.dryRun - Show [DRY RUN] prefix when true
   * @param {boolean} options.timestamps - Show elapsed time (default: true)
   * @param {boolean} options.colors - Enable colored output (default: true)
   */
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.timestamps = options.timestamps !== false;
    this.colors = options.colors !== false;

    // Current phase being executed
    this.currentPhase = null;

    // Event log for post-mortem analysis
    this.events = [];

    // Track timing
    this.startTime = Date.now();

    // Progress bar state
    this._progressActive = false;
    this._lastProgressLine = '';
  }

  /**
   * Set the current phase name
   * @param {string} phaseName - Name of the current phase
   */
  setPhase(phaseName) {
    this.currentPhase = phaseName;
  }

  /**
   * Check if a log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if level should be logged
   */
  shouldLog(level) {
    return LEVELS[level] >= LEVELS[this.level];
  }

  /**
   * Format elapsed time string
   * @returns {string} Formatted time like "[1.2s]"
   */
  formatTime() {
    if (!this.timestamps) return '';
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return this._color(COLORS.dim, `[${elapsed}s]`);
  }

  /**
   * Format current phase string
   * @returns {string} Formatted phase like "[01-detect]"
   */
  formatPhase() {
    if (!this.currentPhase) return '';
    return this._color(COLORS.cyan, `[${this.currentPhase}]`);
  }

  /**
   * Format dry run indicator
   * @returns {string} "[DRY RUN]" if in dry run mode
   */
  formatDryRun() {
    if (!this.dryRun) return '';
    return this._color(COLORS.yellow, '[DRY RUN]');
  }

  /**
   * Apply color if colors are enabled
   * @param {string} color - ANSI color code
   * @param {string} text - Text to colorize
   * @returns {string} Colorized text or plain text
   */
  _color(color, text) {
    if (!this.colors) return text;
    return `${color}${text}${COLORS.reset}`;
  }

  /**
   * Clear progress bar line if active
   */
  _clearProgress() {
    if (this._progressActive) {
      process.stdout.write('\r' + ' '.repeat(this._lastProgressLine.length) + '\r');
      this._progressActive = false;
    }
  }

  /**
   * Core logging method
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context data
   */
  log(level, message, context = {}) {
    // Record event for post-mortem analysis
    const entry = {
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      level,
      phase: this.currentPhase,
      message,
      context,
    };
    this.events.push(entry);

    // Check if we should output this level
    if (!this.shouldLog(level)) return;

    // Clear any active progress bar
    this._clearProgress();

    // Build log line
    const config = LEVEL_CONFIG[level];
    const parts = [
      this.formatTime(),
      this.formatDryRun(),
      this.formatPhase(),
      config.label ? this._color(config.color, config.label) : '',
      this._color(config.color, message),
    ].filter(Boolean);

    console.log(parts.join(' '));

    // Show context in verbose/debug mode
    if (Object.keys(context).length > 0 && (this.verbose || this.level === 'debug')) {
      const contextStr = JSON.stringify(context, null, 2)
        .split('\n')
        .map(line => '         ' + line)
        .join('\n');
      console.log(this._color(COLORS.dim, contextStr));
    }
  }

  // Convenience methods for each log level
  debug(message, context) { this.log('debug', message, context); }
  info(message, context) { this.log('info', message, context); }
  warn(message, context) { this.log('warn', message, context); }
  error(message, context) { this.log('error', message, context); }

  /**
   * Display a prominent phase header
   * @param {string} phaseName - Phase name
   * @param {string} description - Phase description
   */
  phase(phaseName, description = '') {
    this.setPhase(phaseName);
    this._clearProgress();

    const width = 60;
    const line = '='.repeat(width);

    console.log('');
    console.log(this._color(COLORS.blue, line));
    console.log(this._color(COLORS.blue + COLORS.bold, `  PHASE: ${phaseName.toUpperCase()}`));
    if (description) {
      console.log(this._color(COLORS.dim, `  ${description}`));
    }
    console.log(this._color(COLORS.blue, line));
    console.log('');
  }

  /**
   * Display a progress bar
   * @param {number} current - Current progress value
   * @param {number} total - Total value for 100%
   * @param {string} item - Description of current item (optional)
   */
  progress(current, total, item = '') {
    if (!this.shouldLog('info')) return;

    const pct = Math.round((current / total) * 100);
    const barWidth = 20;
    const filled = Math.floor(pct / (100 / barWidth));
    const empty = barWidth - filled;
    const bar = '='.repeat(filled) + '-'.repeat(empty);

    // Truncate item name if too long
    const maxItemLen = 40;
    const displayItem = item.length > maxItemLen
      ? item.substring(0, maxItemLen - 3) + '...'
      : item;

    const line = `  [${bar}] ${pct.toString().padStart(3)}% (${current}/${total}) ${displayItem}`;
    this._lastProgressLine = line;
    this._progressActive = true;

    process.stdout.write('\r' + line);

    // Complete the line when done
    if (current >= total) {
      console.log('');
      this._progressActive = false;
    }
  }

  /**
   * Display a spinner for indeterminate progress
   * @param {string} message - Message to show
   * @returns {Function} Stop function to call when done
   */
  spinner(message) {
    const frames = ['|', '/', '-', '\\'];
    let frameIndex = 0;
    let running = true;

    const interval = setInterval(() => {
      if (!running) return;
      const frame = frames[frameIndex % frames.length];
      process.stdout.write(`\r  ${frame} ${message}`);
      frameIndex++;
    }, 100);

    // Return stop function
    return (finalMessage) => {
      running = false;
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 10) + '\r');
      if (finalMessage) {
        this.info(finalMessage);
      }
    };
  }

  /**
   * Display a summary box
   * @param {string} title - Summary title
   * @param {Object} items - Key-value pairs to display
   */
  summary(title, items) {
    this._clearProgress();

    const width = 60;
    const line = '='.repeat(width);

    console.log('');
    console.log(this._color(COLORS.green, line));
    console.log(this._color(COLORS.green + COLORS.bold, `  ${title}`));
    console.log(this._color(COLORS.green, line));

    for (const [key, value] of Object.entries(items)) {
      const keyStr = key.padEnd(15);
      console.log(`  ${keyStr} ${this._color(COLORS.cyan, String(value))}`);
    }

    console.log('');
  }

  /**
   * Display a section header (smaller than phase)
   * @param {string} title - Section title
   */
  section(title) {
    this._clearProgress();
    console.log('');
    console.log(this._color(COLORS.cyan, `--- ${title} ---`));
  }

  /**
   * Display a list of items
   * @param {string} title - List title
   * @param {Array} items - Items to list
   * @param {number} maxItems - Maximum items to show (default: 10)
   */
  list(title, items, maxItems = 10) {
    this._clearProgress();
    console.log(`  ${title}:`);

    const displayItems = items.slice(0, maxItems);
    for (const item of displayItems) {
      console.log(this._color(COLORS.dim, `    - ${item}`));
    }

    if (items.length > maxItems) {
      console.log(this._color(COLORS.dim, `    ... and ${items.length - maxItems} more`));
    }
  }

  /**
   * Display a table
   * @param {Array<Object>} rows - Array of row objects
   * @param {Array<string>} columns - Column keys to display
   */
  table(rows, columns) {
    this._clearProgress();

    if (rows.length === 0) {
      console.log('  (no data)');
      return;
    }

    // Calculate column widths
    const widths = {};
    for (const col of columns) {
      widths[col] = Math.max(
        col.length,
        ...rows.map(row => String(row[col] || '').length)
      );
    }

    // Header
    const header = columns.map(col => col.padEnd(widths[col])).join('  ');
    console.log(this._color(COLORS.bold, `  ${header}`));
    console.log('  ' + '-'.repeat(header.length));

    // Rows
    for (const row of rows) {
      const line = columns.map(col =>
        String(row[col] || '').padEnd(widths[col])
      ).join('  ');
      console.log(`  ${line}`);
    }
  }

  /**
   * Display success message with checkmark
   * @param {string} message - Success message
   */
  success(message) {
    this._clearProgress();
    console.log(this._color(COLORS.green, `  [OK] ${message}`));
  }

  /**
   * Display a horizontal rule
   */
  hr() {
    this._clearProgress();
    console.log(this._color(COLORS.dim, '-'.repeat(60)));
  }

  /**
   * Get all logged events for analysis
   * @returns {Array} Array of log events
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * Get events filtered by level
   * @param {string} level - Minimum level to include
   * @returns {Array} Filtered events
   */
  getEventsByLevel(level) {
    const minLevel = LEVELS[level];
    return this.events.filter(e => LEVELS[e.level] >= minLevel);
  }

  /**
   * Get events for a specific phase
   * @param {string} phaseName - Phase name to filter by
   * @returns {Array} Events for that phase
   */
  getEventsByPhase(phaseName) {
    return this.events.filter(e => e.phase === phaseName);
  }

  /**
   * Export events as JSON string
   * @returns {string} JSON string of all events
   */
  exportJSON() {
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * Create a child logger for a specific phase
   * @param {string} phaseName - Phase name
   * @returns {Logger} New logger with phase set
   */
  child(phaseName) {
    const child = new Logger({
      level: this.level,
      verbose: this.verbose,
      dryRun: this.dryRun,
      timestamps: this.timestamps,
      colors: this.colors,
    });
    child.startTime = this.startTime;
    child.events = this.events; // Share event log
    child.setPhase(phaseName);
    return child;
  }
}

/**
 * Create a logger instance with common defaults
 * @param {Object} options - Logger options
 * @returns {Logger} Configured logger instance
 */
export function createLogger(options = {}) {
  return new Logger(options);
}

// Export default instance
export default Logger;
