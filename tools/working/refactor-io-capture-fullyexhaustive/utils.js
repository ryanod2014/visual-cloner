/**
 * Shared utility functions for the visual cloner.
 * Pure, functional-style helpers with no side effects where possible.
 */

import { createHash } from 'crypto';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';

/**
 * Compute SHA-256 hash of a string.
 * @param {string} str - Input string to hash
 * @returns {string} Hexadecimal hash digest
 */
export const sha256 = (str) =>
  createHash('sha256').update(str).digest('hex');

/**
 * Promise-based sleep/delay.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export const sleep = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get current timestamp in ISO format.
 * @returns {string} ISO 8601 timestamp
 */
export const getTimestamp = () =>
  new Date().toISOString();

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} path - Directory path to create
 * @returns {Promise<void>}
 */
export const ensureDir = async (path) =>
  mkdir(path, { recursive: true });

/**
 * Save data as formatted JSON to a file.
 * @param {string} path - File path to write
 * @param {*} data - Data to serialize as JSON
 * @returns {Promise<void>}
 */
export const saveJSON = async (path, data) => {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
};

/**
 * Load and parse a JSON file.
 * @param {string} path - File path to read
 * @returns {Promise<*>} Parsed JSON data
 */
export const loadJSON = async (path) =>
  JSON.parse(await readFile(path, 'utf-8'));

/**
 * Simple logger with timestamp and level.
 * @param {'debug'|'info'|'warn'|'error'} level - Log level
 * @param {string} msg - Log message
 * @param {Object} [data] - Optional structured data
 */
export const log = (level, msg, data = null) => {
  const entry = {
    time: getTimestamp(),
    level: level.toUpperCase().padEnd(5),
    msg
  };
  const line = `[${entry.time}] ${entry.level} ${msg}`;
  console.log(data ? `${line} ${JSON.stringify(data)}` : line);
};

/**
 * Format milliseconds to human-readable duration.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2h 15m 30s")
 */
export const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
};
