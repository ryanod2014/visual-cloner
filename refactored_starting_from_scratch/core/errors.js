/**
 * Custom Error Classes
 * Provide rich context for debugging
 */

export class ExtractionError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'ExtractionError';
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export class PhaseError extends ExtractionError {
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
}

export class ResourceError extends ExtractionError {
  constructor(url, reason, context = {}) {
    super(`Failed to capture resource: ${url}`, {
      url,
      reason,
      ...context,
    });
    this.name = 'ResourceError';
    this.resourceUrl = url;
    this.reason = reason;
  }
}

export class PatchError extends ExtractionError {
  constructor(patcherName, filePath, reason, context = {}) {
    super(`Patcher "${patcherName}" failed on ${filePath}: ${reason}`, {
      patcher: patcherName,
      file: filePath,
      reason,
      ...context,
    });
    this.name = 'PatchError';
  }
}

export class ConfigError extends ExtractionError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ConfigError';
  }
}

export default {
  ExtractionError,
  PhaseError,
  ResourceError,
  PatchError,
  ConfigError,
};
