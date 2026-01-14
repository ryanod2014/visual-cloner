/**
 * Configuration Management
 *
 * Handles configuration from multiple sources:
 * - CLI flags (highest priority)
 * - Environment variables
 * - Config file (.extractrc.json)
 * - Defaults (lowest priority)
 *
 * Provides validation and type coercion for all options.
 */

import fs from 'fs/promises';
import path from 'path';
import { ConfigError } from './errors.js';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  // Browser settings
  headless: true,
  timeout: 60000,
  viewport: { width: 1920, height: 1080 },
  userAgent: null, // Use browser default

  // Output settings
  output: null, // Auto-generated if not specified
  port: 3333,

  // Logging
  debug: false,
  verbose: false,
  quiet: false,

  // Behavior flags
  dryRun: false,
  force: false, // Overwrite existing output
  resume: true, // Resume from checkpoint if available

  // Phase control
  phase: null, // Run specific phase only
  startPhase: null, // Start from specific phase

  // Resource handling
  maxResourceSize: 50 * 1024 * 1024, // 50MB max per resource
  includeDataUrls: true,
  captureServiceWorker: true,

  // Network
  waitUntil: 'networkidle',
  navigationTimeout: 30000,
  requestTimeout: 10000,

  // App detection
  appPlugins: [], // Custom app plugins to load
};

/**
 * CLI flag definitions for parsing
 * Each entry: [longFlag, shortFlag, type, description]
 */
export const CLI_FLAGS = [
  // Browser
  ['--headless', '-H', 'boolean', 'Run browser in headless mode'],
  ['--timeout', '-t', 'number', 'Page load timeout in ms'],
  ['--viewport', null, 'string', 'Viewport size (WxH)'],

  // Output
  ['--output', '-o', 'string', 'Output directory'],
  ['--port', '-p', 'number', 'Server port'],

  // Logging
  ['--debug', '-d', 'boolean', 'Enable debug logging'],
  ['--verbose', '-v', 'boolean', 'Enable verbose output'],
  ['--quiet', '-q', 'boolean', 'Suppress non-error output'],

  // Behavior
  ['--dry-run', null, 'boolean', 'Simulate without writing files'],
  ['--force', '-f', 'boolean', 'Overwrite existing output'],
  ['--no-resume', null, 'boolean', 'Ignore existing checkpoint'],

  // Phase control
  ['--phase', null, 'string', 'Run specific phase only'],
  ['--start-phase', null, 'string', 'Start from specific phase'],

  // Help
  ['--help', '-h', 'boolean', 'Show help message'],
  ['--version', '-V', 'boolean', 'Show version'],
];

/**
 * Valid phase names
 */
export const VALID_PHASES = [
  '01-detect',
  '02-capture',
  '03-trigger',
  '04-discover',
  '05-patch',
  '06-assemble',
  '07-validate',
  // Also support short names
  'detect',
  'capture',
  'trigger',
  'discover',
  'patch',
  'assemble',
  'validate',
  // Legacy names
  'init',
];

/**
 * Parse command line arguments
 * @param {Array<string>} args - CLI arguments (process.argv.slice(2))
 * @returns {Object} Parsed options and positional arguments
 */
export function parseArgs(args) {
  const result = {
    url: null,
    command: null,
    options: {},
    positional: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle flags
    if (arg.startsWith('--')) {
      // Long flag
      if (arg.includes('=')) {
        // --flag=value format
        const [flag, value] = arg.split('=');
        result.options[flagToKey(flag)] = parseValue(value, getFlagType(flag));
      } else if (arg === '--no-resume') {
        result.options.resume = false;
      } else {
        // --flag value format
        const type = getFlagType(arg);
        if (type === 'boolean') {
          result.options[flagToKey(arg)] = true;
        } else {
          const value = args[++i];
          if (value === undefined) {
            throw new ConfigError(`Missing value for ${arg}`, { flag: arg });
          }
          result.options[flagToKey(arg)] = parseValue(value, type);
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag
      const longFlag = shortToLong(arg);
      if (!longFlag) {
        throw new ConfigError(`Unknown flag: ${arg}`, { flag: arg });
      }
      const type = getFlagType(longFlag);
      if (type === 'boolean') {
        result.options[flagToKey(longFlag)] = true;
      } else {
        const value = args[++i];
        if (value === undefined) {
          throw new ConfigError(`Missing value for ${arg}`, { flag: arg });
        }
        result.options[flagToKey(longFlag)] = parseValue(value, type);
      }
    } else if (arg === 'serve' || arg === 'validate' || arg === 'diagnose') {
      // Commands
      result.command = arg;
      // Next arg is the target
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.positional.push(args[++i]);
      }
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      // URL
      result.url = arg;
    } else if (!arg.startsWith('-')) {
      // Positional argument or URL without protocol
      if (!result.url && !arg.includes('/') && arg.includes('.')) {
        // Looks like a domain
        result.url = `https://${arg}`;
      } else {
        result.positional.push(arg);
      }
    }
  }

  return result;
}

/**
 * Convert flag to camelCase key
 * @param {string} flag - CLI flag (e.g., '--dry-run')
 * @returns {string} camelCase key (e.g., 'dryRun')
 */
function flagToKey(flag) {
  return flag
    .replace(/^--?/, '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Get flag type from CLI_FLAGS
 * @param {string} flag - Long flag name
 * @returns {string} Type ('boolean', 'number', 'string')
 */
function getFlagType(flag) {
  const entry = CLI_FLAGS.find(([long]) => long === flag);
  return entry ? entry[2] : 'string';
}

/**
 * Convert short flag to long flag
 * @param {string} short - Short flag (e.g., '-d')
 * @returns {string|null} Long flag or null
 */
function shortToLong(short) {
  const entry = CLI_FLAGS.find(([, s]) => s === short);
  return entry ? entry[0] : null;
}

/**
 * Parse value to correct type
 * @param {string} value - String value
 * @param {string} type - Target type
 * @returns {any} Parsed value
 */
function parseValue(value, type) {
  switch (type) {
    case 'boolean':
      return value !== 'false' && value !== '0';
    case 'number':
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        throw new ConfigError(`Invalid number: ${value}`, { value });
      }
      return num;
    default:
      return value;
  }
}

/**
 * Load configuration from file
 * @param {string} dir - Directory to search for config file
 * @returns {Promise<Object>} Configuration object or empty object
 */
export async function loadConfigFile(dir) {
  const configNames = ['.extractrc.json', '.extractrc', 'extract.config.json'];

  for (const name of configNames) {
    const configPath = path.join(dir, name);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw new ConfigError(`Error reading config file ${name}: ${e.message}`, {
          file: configPath,
          error: e.message,
        });
      }
    }
  }

  return {};
}

/**
 * Load configuration from environment variables
 * @returns {Object} Configuration from env vars
 */
export function loadEnvConfig() {
  const config = {};

  // Map env vars to config keys
  const envMap = {
    EXTRACT_HEADLESS: ['headless', 'boolean'],
    EXTRACT_TIMEOUT: ['timeout', 'number'],
    EXTRACT_OUTPUT: ['output', 'string'],
    EXTRACT_DEBUG: ['debug', 'boolean'],
    EXTRACT_VERBOSE: ['verbose', 'boolean'],
    EXTRACT_PORT: ['port', 'number'],
  };

  for (const [envKey, [configKey, type]] of Object.entries(envMap)) {
    if (process.env[envKey] !== undefined) {
      config[configKey] = parseValue(process.env[envKey], type);
    }
  }

  return config;
}

/**
 * Merge configurations with priority: cli > env > file > defaults
 * @param {Object} cliOptions - Options from CLI
 * @param {Object} envConfig - Options from environment
 * @param {Object} fileConfig - Options from config file
 * @returns {Object} Merged configuration
 */
export function mergeConfig(cliOptions = {}, envConfig = {}, fileConfig = {}) {
  return {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...cliOptions,
  };
}

/**
 * Validate configuration
 * @param {Object} config - Configuration to validate
 * @throws {ConfigError} If validation fails
 */
export function validateConfig(config) {
  // Validate timeout
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout < 0) {
      throw new ConfigError('Timeout must be a positive number', {
        option: 'timeout',
        value: config.timeout,
      });
    }
  }

  // Validate port
  if (config.port !== undefined) {
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      throw new ConfigError('Port must be between 1 and 65535', {
        option: 'port',
        value: config.port,
      });
    }
  }

  // Validate phase
  if (config.phase && !VALID_PHASES.includes(config.phase)) {
    throw new ConfigError(`Invalid phase: ${config.phase}`, {
      option: 'phase',
      value: config.phase,
      validPhases: VALID_PHASES,
    });
  }

  // Validate startPhase
  if (config.startPhase && !VALID_PHASES.includes(config.startPhase)) {
    throw new ConfigError(`Invalid start phase: ${config.startPhase}`, {
      option: 'startPhase',
      value: config.startPhase,
      validPhases: VALID_PHASES,
    });
  }

  // Validate viewport
  if (config.viewport && typeof config.viewport === 'string') {
    const match = config.viewport.match(/^(\d+)x(\d+)$/i);
    if (!match) {
      throw new ConfigError('Viewport must be in WxH format (e.g., 1920x1080)', {
        option: 'viewport',
        value: config.viewport,
      });
    }
  }

  return true;
}

/**
 * Normalize viewport string to object
 * @param {string|Object} viewport - Viewport value
 * @returns {Object} Viewport object with width/height
 */
export function normalizeViewport(viewport) {
  if (typeof viewport === 'object') {
    return viewport;
  }

  if (typeof viewport === 'string') {
    const match = viewport.match(/^(\d+)x(\d+)$/i);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  }

  return DEFAULTS.viewport;
}

/**
 * Create full configuration from CLI args
 * Main entry point for configuration
 * @param {Array<string>} args - CLI arguments
 * @param {string} cwd - Current working directory
 * @returns {Promise<Object>} Complete configuration
 */
export async function createConfig(args, cwd = process.cwd()) {
  // Parse CLI arguments
  const parsed = parseArgs(args);

  // Load configs from various sources
  const fileConfig = await loadConfigFile(cwd);
  const envConfig = loadEnvConfig();

  // Merge with priority
  const config = mergeConfig(parsed.options, envConfig, fileConfig);

  // Normalize values
  config.viewport = normalizeViewport(config.viewport);

  // Validate
  validateConfig(config);

  // Add parsed URL and command
  config.url = parsed.url;
  config.command = parsed.command;
  config.positional = parsed.positional;

  return config;
}

/**
 * Print help message
 */
export function printHelp() {
  console.log(`
Visual Cloner - Extract websites for local execution

USAGE:
  extract <url> [options]

EXAMPLES:
  extract https://example.com
  extract https://example.com --output ./my-output
  extract https://example.com --debug --headless false
  extract https://example.com --phase=capture
  extract https://example.com --start-phase=03-trigger

OPTIONS:
  Browser:
    --headless, -H        Run browser in headless mode (default: true)
    --timeout, -t <ms>    Page load timeout (default: 60000)
    --viewport <WxH>      Viewport size (default: 1920x1080)

  Output:
    --output, -o <dir>    Output directory (default: auto-generated)
    --port, -p <port>     Server port (default: 3333)

  Logging:
    --debug, -d           Enable debug logging
    --verbose, -v         Enable verbose output
    --quiet, -q           Suppress non-error output

  Behavior:
    --dry-run             Simulate without writing files
    --force, -f           Overwrite existing output
    --no-resume           Ignore existing checkpoint

  Phase Control:
    --phase <name>        Run specific phase only
    --start-phase <name>  Start from specific phase

  Help:
    --help, -h            Show this help message
    --version, -V         Show version

PHASES:
  01-detect    Detect app type and load plugins
  02-capture   Capture network resources
  03-trigger   Trigger dynamic content loading
  04-discover  Discover additional resources
  05-patch     Apply URL rewrites and patches
  06-assemble  Assemble final output
  07-validate  Validate extraction

COMMANDS:
  serve <dir>           Start local server for extraction
  validate <dir>        Validate extraction output
  diagnose <dir>        Diagnose extraction issues

CONFIG FILE:
  Place .extractrc.json in your project root for persistent configuration.
  CLI flags override config file settings.
`);
}

// Export config class for more complex usage
export class Config {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  get(key) {
    return this.options[key];
  }

  set(key, value) {
    this.options[key] = value;
  }

  merge(options) {
    this.options = { ...this.options, ...options };
    return this;
  }

  validate() {
    validateConfig(this.options);
    return true;
  }

  toJSON() {
    return { ...this.options };
  }
}

export default {
  DEFAULTS,
  CLI_FLAGS,
  VALID_PHASES,
  parseArgs,
  loadConfigFile,
  loadEnvConfig,
  mergeConfig,
  validateConfig,
  normalizeViewport,
  createConfig,
  printHelp,
  Config,
};
