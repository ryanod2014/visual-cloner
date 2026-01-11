#!/usr/bin/env node
/**
 * JavaScript Beautifier CLI
 *
 * Deobfuscate and beautify JavaScript code.
 *
 * Usage:
 *   js-beautify <input.js> [output.js] [options]
 *   js-beautify --help
 */

const path = require('path');

// Forward to the main beautify script
const beautifyPath = path.join(__dirname, 'lib', 'beautify.js');
require(beautifyPath);
