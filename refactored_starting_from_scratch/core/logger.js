/**
 * Structured Logger
 * Provides clear phase-aware logging with levels
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

export class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.dryRun = options.dryRun || false;
    this.currentPhase = null;
    this.events = [];
    this.startTime = Date.now();
  }

  setPhase(phaseName) {
    this.currentPhase = phaseName;
  }

  shouldLog(level) {
    return LEVELS[level] >= LEVELS[this.level];
  }

  formatTime() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `${COLORS.dim}[${elapsed}s]${COLORS.reset}`;
  }

  formatPhase() {
    if (!this.currentPhase) return '';
    return `${COLORS.cyan}[${this.currentPhase}]${COLORS.reset}`;
  }

  formatDryRun() {
    if (!this.dryRun) return '';
    return `${COLORS.yellow}[DRY RUN]${COLORS.reset}`;
  }

  log(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      level,
      phase: this.currentPhase,
      message,
      context,
    };
    this.events.push(entry);

    if (!this.shouldLog(level)) return;

    const color = level === 'error' ? COLORS.red
      : level === 'warn' ? COLORS.yellow
      : level === 'debug' ? COLORS.dim
      : COLORS.reset;

    const levelTag = level === 'error' ? `${COLORS.red}[ERROR]${COLORS.reset}`
      : level === 'warn' ? `${COLORS.yellow}[WARN]${COLORS.reset}`
      : level === 'debug' ? `${COLORS.dim}[DEBUG]${COLORS.reset}`
      : '';

    const prefix = `${this.formatTime()} ${this.formatDryRun()} ${this.formatPhase()}`.trim();
    console.log(`${prefix} ${levelTag} ${color}${message}${COLORS.reset}`);

    if (Object.keys(context).length > 0 && this.level === 'debug') {
      console.log(`${COLORS.dim}         ${JSON.stringify(context)}${COLORS.reset}`);
    }
  }

  // Convenience methods
  debug(message, context) { this.log('debug', message, context); }
  info(message, context) { this.log('info', message, context); }
  warn(message, context) { this.log('warn', message, context); }
  error(message, context) { this.log('error', message, context); }

  // Phase markers
  phase(phaseName, description) {
    this.setPhase(phaseName);
    console.log('');
    console.log(`${COLORS.blue}${'='.repeat(50)}${COLORS.reset}`);
    console.log(`${COLORS.blue}  PHASE: ${phaseName.toUpperCase()}${COLORS.reset}`);
    if (description) {
      console.log(`${COLORS.dim}  ${description}${COLORS.reset}`);
    }
    console.log(`${COLORS.blue}${'='.repeat(50)}${COLORS.reset}`);
    console.log('');
  }

  // Progress indicator
  progress(current, total, item) {
    const pct = Math.round((current / total) * 100);
    const bar = '='.repeat(Math.floor(pct / 5)) + '-'.repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total}) ${item || ''}`);
    if (current === total) console.log('');
  }

  // Summary
  summary(title, items) {
    console.log('');
    console.log(`${COLORS.green}${'='.repeat(50)}${COLORS.reset}`);
    console.log(`${COLORS.green}  ${title}${COLORS.reset}`);
    console.log(`${COLORS.green}${'='.repeat(50)}${COLORS.reset}`);
    for (const [key, value] of Object.entries(items)) {
      console.log(`  ${key}: ${COLORS.cyan}${value}${COLORS.reset}`);
    }
    console.log('');
  }

  // Get all logs for debug report
  getFullLog() {
    return this.events;
  }
}

export default Logger;
