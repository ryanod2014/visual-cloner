/**
 * Custom Error Types for Extraction Pipeline
 *
 * Provides rich context for debugging and error handling across all phases.
 * Each error type captures relevant metadata for troubleshooting.
 *
 * Error Hierarchy:
 *   ExtractionError (base)
 *   ├── PhaseError - Phase execution failures
 *   ├── NetworkError - HTTP/fetch failures
 *   ├── ValidationError - Data validation failures
 *   ├── ResourceError - Resource capture failures
 *   ├── ConfigError - Configuration problems
 *   └── PatchError - Code patching failures
 */

/**
 * Base error class for all extraction errors.
 * Provides common functionality like JSON serialization and context tracking.
 */
export class ExtractionError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} context - Additional context for debugging
   */
  constructor(message, context = {}) {
    super(message);
    this.name = 'ExtractionError';
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Capture stack trace properly
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging/checkpointing
   * @returns {Object} JSON-serializable error representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Create formatted string for console output
   * @returns {string} Formatted error string
   */
  toString() {
    const contextStr = Object.keys(this.context).length > 0
      ? `\n  Context: ${JSON.stringify(this.context, null, 2)}`
      : '';
    return `[${this.name}] ${this.message}${contextStr}`;
  }
}

/**
 * Error thrown when a pipeline phase fails.
 * Wraps the original error and tracks which phase failed.
 */
export class PhaseError extends ExtractionError {
  /**
   * @param {string} phaseName - Name of the failed phase (e.g., '01-detect')
   * @param {Error} originalError - The underlying error that caused the failure
   * @param {Object} context - Additional context
   */
  constructor(phaseName, originalError, context = {}) {
    super(`Phase "${phaseName}" failed: ${originalError.message}`, {
      phase: phaseName,
      originalError: originalError.message,
      originalStack: originalError.stack,
      ...context,
    });
    this.name = 'PhaseError';
    this.phaseName = phaseName;
    this.originalError = originalError;
  }

  /**
   * Get the root cause error
   * @returns {Error} The original error that caused this phase failure
   */
  getCause() {
    return this.originalError;
  }
}

/**
 * Error thrown for network-related failures.
 * Tracks URL, status codes, and response details.
 */
export class NetworkError extends ExtractionError {
  /**
   * @param {string} url - The URL that failed to load
   * @param {string} reason - Human-readable failure reason
   * @param {Object} context - Additional context (statusCode, headers, etc.)
   */
  constructor(url, reason, context = {}) {
    super(`Network request failed for ${url}: ${reason}`, {
      url,
      reason,
      ...context,
    });
    this.name = 'NetworkError';
    this.url = url;
    this.reason = reason;
    this.statusCode = context.statusCode || null;
  }

  /**
   * Check if error is retryable (5xx, network issues)
   * @returns {boolean} True if the request might succeed on retry
   */
  isRetryable() {
    // 5xx errors and network issues are retryable
    if (this.statusCode && this.statusCode >= 500) return true;
    if (this.reason.includes('timeout')) return true;
    if (this.reason.includes('ECONNRESET')) return true;
    if (this.reason.includes('ENOTFOUND')) return false; // DNS failure
    if (this.statusCode && this.statusCode >= 400 && this.statusCode < 500) return false;
    return true; // Default to retryable for unknown issues
  }
}

/**
 * Error thrown when data validation fails.
 * Tracks what was validated, expected values, and actual values.
 */
export class ValidationError extends ExtractionError {
  /**
   * @param {string} field - The field or data that failed validation
   * @param {string} reason - Why validation failed
   * @param {Object} context - Additional context (expected, actual, etc.)
   */
  constructor(field, reason, context = {}) {
    super(`Validation failed for "${field}": ${reason}`, {
      field,
      reason,
      ...context,
    });
    this.name = 'ValidationError';
    this.field = field;
    this.reason = reason;
    this.expected = context.expected;
    this.actual = context.actual;
  }
}

/**
 * Error thrown when resource capture fails.
 * Used during asset interception and download phases.
 */
export class ResourceError extends ExtractionError {
  /**
   * @param {string} url - URL of the resource that failed
   * @param {string} reason - Failure reason
   * @param {Object} context - Additional context (contentType, size, etc.)
   */
  constructor(url, reason, context = {}) {
    super(`Failed to capture resource: ${url}`, {
      url,
      reason,
      ...context,
    });
    this.name = 'ResourceError';
    this.resourceUrl = url;
    this.reason = reason;
    this.contentType = context.contentType || null;
  }
}

/**
 * Error thrown for configuration problems.
 * Used when CLI flags, config files, or defaults are invalid.
 */
export class ConfigError extends ExtractionError {
  /**
   * @param {string} message - Description of config problem
   * @param {Object} context - Additional context (option, value, etc.)
   */
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ConfigError';
    this.option = context.option || null;
    this.value = context.value;
  }
}

/**
 * Error thrown when code patching fails.
 * Used during URL rewriting and code transformation phases.
 */
export class PatchError extends ExtractionError {
  /**
   * @param {string} patcherName - Name of the patcher that failed
   * @param {string} filePath - File being patched
   * @param {string} reason - Why patching failed
   * @param {Object} context - Additional context
   */
  constructor(patcherName, filePath, reason, context = {}) {
    super(`Patcher "${patcherName}" failed on ${filePath}: ${reason}`, {
      patcher: patcherName,
      file: filePath,
      reason,
      ...context,
    });
    this.name = 'PatchError';
    this.patcherName = patcherName;
    this.filePath = filePath;
  }
}

/**
 * Error thrown when browser/page operations fail.
 * Used for Playwright-specific errors.
 */
export class BrowserError extends ExtractionError {
  /**
   * @param {string} operation - What browser operation failed
   * @param {string} reason - Why it failed
   * @param {Object} context - Additional context (selector, timeout, etc.)
   */
  constructor(operation, reason, context = {}) {
    super(`Browser operation "${operation}" failed: ${reason}`, {
      operation,
      reason,
      ...context,
    });
    this.name = 'BrowserError';
    this.operation = operation;
  }
}

/**
 * Utility: Check if an error is of a specific type
 * @param {Error} error - Error to check
 * @param {Function} ErrorClass - Error class to check against
 * @returns {boolean}
 */
export function isErrorType(error, ErrorClass) {
  return error instanceof ErrorClass;
}

/**
 * Utility: Wrap any error in an ExtractionError if not already
 * @param {Error} error - Error to wrap
 * @param {Object} context - Additional context to add
 * @returns {ExtractionError}
 */
export function wrapError(error, context = {}) {
  if (error instanceof ExtractionError) {
    // Add additional context to existing error
    Object.assign(error.context, context);
    return error;
  }
  return new ExtractionError(error.message, {
    originalName: error.name,
    originalStack: error.stack,
    ...context,
  });
}

// Default export for convenience
export default {
  ExtractionError,
  PhaseError,
  NetworkError,
  ValidationError,
  ResourceError,
  ConfigError,
  PatchError,
  BrowserError,
  isErrorType,
  wrapError,
};
