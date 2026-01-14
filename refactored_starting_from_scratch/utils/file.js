/**
 * File System Utilities
 * Safe file operations with automatic directory creation
 */

import { mkdir, writeFile as fsWriteFile, readFile as fsReadFile } from 'fs/promises';
import { dirname, join, normalize, basename, extname } from 'path';
import { existsSync } from 'fs';

/**
 * Ensure a directory exists, creating it and parents if necessary
 * @param {string} dirPath - The directory path to ensure exists
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Invalid directory path');
  }

  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore EEXIST errors (directory already exists)
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Write content to a file, creating parent directories if needed
 * @param {string} filePath - The file path to write to
 * @param {string|Buffer} content - The content to write
 * @returns {Promise<void>}
 */
export async function writeFile(filePath, content) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  // Ensure parent directory exists
  const dir = dirname(filePath);
  await ensureDir(dir);

  // Write the file
  await fsWriteFile(filePath, content);
}

/**
 * Read a file, returning null if it doesn't exist
 * @param {string} filePath - The file path to read
 * @param {BufferEncoding} [encoding='utf8'] - The encoding to use (null for Buffer)
 * @returns {Promise<string|Buffer|null>} - The file content, or null if not found
 */
export async function readFile(filePath, encoding = 'utf8') {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  try {
    return await fsReadFile(filePath, encoding);
  } catch (error) {
    // Return null for file not found errors
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

/**
 * Map a URL to a local file path within the output directory
 * Preserves directory structure from URL pathname
 * @param {string} url - The URL to map
 * @param {string} outputDir - The base output directory
 * @returns {string|null} - The local file path, or null if invalid
 */
export function getOutputPath(url, outputDir) {
  if (!url || typeof url !== 'string' || !outputDir) {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Start with the pathname
    let pathname = parsed.pathname;

    // Handle root path
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    // Handle paths without extension (likely HTML routes)
    const ext = extname(pathname);
    if (!ext || ext === '.') {
      pathname = pathname.endsWith('/')
        ? `${pathname}index.html`
        : `${pathname}.html`;
    }

    // Remove leading slash for joining
    pathname = pathname.replace(/^\/+/, '');

    // Sanitize the pathname
    const sanitized = sanitizeFilename(pathname);

    // Build output path: outputDir/hostname/pathname
    const hostDir = sanitizeFilename(parsed.hostname);
    const fullPath = join(outputDir, hostDir, sanitized);

    // Normalize to prevent directory traversal
    const normalized = normalize(fullPath);

    // Security check: ensure path is within outputDir
    const normalizedOutputDir = normalize(outputDir);
    if (!normalized.startsWith(normalizedOutputDir)) {
      return null;
    }

    return normalized;
  } catch (error) {
    return null;
  }
}

/**
 * Sanitize a filename/path by removing or replacing invalid characters
 * @param {string} name - The filename to sanitize
 * @returns {string} - The sanitized filename
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') {
    return 'unnamed';
  }

  // Replace invalid characters with underscores
  // Invalid chars: < > : " | ? * and control characters
  let sanitized = name
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    // Replace multiple consecutive underscores/spaces
    .replace(/[_\s]+/g, '_')
    // Remove leading/trailing whitespace and dots
    .trim()
    .replace(/^\.+|\.+$/g, '');

  // Handle Windows reserved names
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  const baseName = basename(sanitized, extname(sanitized));
  if (reserved.test(baseName)) {
    sanitized = `_${sanitized}`;
  }

  // Ensure we have something
  if (!sanitized || sanitized === '_') {
    return 'unnamed';
  }

  // Limit length (preserve extension)
  const ext = extname(sanitized);
  const nameWithoutExt = sanitized.slice(0, -ext.length || undefined);
  const maxNameLength = 200; // Leave room for extension and path

  if (nameWithoutExt.length > maxNameLength) {
    sanitized = nameWithoutExt.slice(0, maxNameLength) + ext;
  }

  return sanitized;
}

/**
 * Check if a path exists
 * @param {string} path - The path to check
 * @returns {boolean} - True if the path exists
 */
export function pathExists(path) {
  if (!path || typeof path !== 'string') {
    return false;
  }
  return existsSync(path);
}

export default {
  ensureDir,
  writeFile,
  readFile,
  getOutputPath,
  sanitizeFilename,
  pathExists,
};
