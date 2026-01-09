#!/usr/bin/env node
/**
 * Behavior Analyzer
 *
 * Processes recordings from Universal Recorder to extract:
 * - Features (what the app can do)
 * - Trigger-Effect mappings (input → output relationships)
 * - State machine model (states and transitions)
 * - Data flow analysis (how data moves through the app)
 */

import fs from 'fs';
import path from 'path';

// ===== FEATURE EXTRACTION =====

function extractFeatures(recording) {
  const features = [];
  const log = recording.log;
  const snapshots = recording.stateSnapshots;

  // 1. Extract UI features from user events
  const uiFeatures = extractUIFeatures(log);
  features.push(...uiFeatures);

  // 2. Extract data features from storage
  const dataFeatures = extractDataFeatures(log, snapshots);
  features.push(...dataFeatures);

  // 3. Extract canvas features
  const canvasFeatures = extractCanvasFeatures(log);
  features.push(...canvasFeatures);

  // 4. Extract network features
  const networkFeatures = extractNetworkFeatures(log);
  features.push(...networkFeatures);

  // 5. Deduplicate and score
  return deduplicateFeatures(features);
}

function extractUIFeatures(log) {
  const features = [];
  const clickTargets = new Map(); // Track unique click targets
  const keyboardShortcuts = new Map();

  for (const entry of log) {
    if (entry.category !== 'user-event') continue;

    // Click-based features
    if (entry.type === 'click' && entry.target) {
      const key = getTargetKey(entry.target);
      if (!clickTargets.has(key)) {
        clickTargets.set(key, entry);

        const label = getTargetLabel(entry.target);
        if (label) {
          features.push({
            type: 'ui-action',
            name: `Click: ${label}`,
            trigger: { type: 'click', target: entry.target },
            confidence: 0.8,
            source: 'user-event'
          });
        }
      }
    }

    // Keyboard shortcuts
    if (entry.type === 'keydown' && entry.key) {
      const shortcut = formatShortcut(entry);
      if (shortcut && !keyboardShortcuts.has(shortcut)) {
        keyboardShortcuts.set(shortcut, entry);
        features.push({
          type: 'keyboard-shortcut',
          name: `Shortcut: ${shortcut}`,
          trigger: { type: 'keyboard', key: entry.key, modifiers: entry.modifiers },
          confidence: 0.7,
          source: 'user-event'
        });
      }
    }
  }

  return features;
}

function extractDataFeatures(log, snapshots) {
  const features = [];
  const storageKeys = new Map();

  for (const entry of log) {
    if (entry.category !== 'storage') continue;

    const key = entry.key;
    if (!storageKeys.has(key)) {
      storageKeys.set(key, []);
    }
    storageKeys.get(key).push(entry);
  }

  // Analyze storage patterns
  for (const [key, entries] of storageKeys) {
    const setCount = entries.filter(e => e.type.includes('-set')).length;
    const removeCount = entries.filter(e => e.type.includes('-remove')).length;

    // Skip temporary keys (set then immediately removed)
    if (setCount === removeCount && setCount === 1) continue;

    // Identify feature based on key name
    const featureName = inferFeatureFromKey(key);
    if (featureName) {
      features.push({
        type: 'data-persistence',
        name: featureName,
        storageKey: key,
        operations: { sets: setCount, removes: removeCount },
        confidence: 0.7,
        source: 'storage'
      });
    }
  }

  // Extract state structure from snapshots
  if (snapshots.length > 0) {
    const stateKeys = analyzeStateStructure(snapshots);
    for (const stateKey of stateKeys) {
      features.push({
        type: 'state-management',
        name: `State: ${stateKey.name}`,
        path: stateKey.path,
        valueType: stateKey.type,
        variations: stateKey.variations,
        confidence: 0.8,
        source: 'state-snapshot'
      });
    }
  }

  return features;
}

function extractCanvasFeatures(log) {
  const features = [];
  const canvasEntries = log.filter(e => e.category === 'canvas');

  if (canvasEntries.length === 0) return features;

  // Identify canvas patterns
  const methods = new Set(canvasEntries.map(e => e.method));

  // Drawing detection
  if (methods.has('beginPath') || methods.has('stroke') || methods.has('fill')) {
    features.push({
      type: 'canvas-drawing',
      name: 'Vector Drawing',
      methods: Array.from(methods).filter(m =>
        ['beginPath', 'moveTo', 'lineTo', 'arc', 'stroke', 'fill', 'bezierCurveTo'].includes(m)
      ),
      confidence: 0.9,
      source: 'canvas'
    });
  }

  // Image manipulation
  if (methods.has('drawImage')) {
    features.push({
      type: 'canvas-image',
      name: 'Image Rendering',
      confidence: 0.9,
      source: 'canvas'
    });
  }

  // Transform operations
  if (methods.has('translate') || methods.has('rotate') || methods.has('scale')) {
    features.push({
      type: 'canvas-transform',
      name: 'Canvas Transforms (Pan/Zoom/Rotate)',
      methods: Array.from(methods).filter(m =>
        ['translate', 'rotate', 'scale', 'setTransform', 'resetTransform'].includes(m)
      ),
      confidence: 0.9,
      source: 'canvas'
    });
  }

  // Clear/redraw pattern (animation or interactive)
  const clearCount = canvasEntries.filter(e => e.method === 'clearRect').length;
  if (clearCount > 5) {
    features.push({
      type: 'canvas-animation',
      name: 'Canvas Animation/Redraw',
      clearOperations: clearCount,
      confidence: 0.8,
      source: 'canvas'
    });
  }

  return features;
}

function extractNetworkFeatures(log) {
  const features = [];
  const networkEntries = log.filter(e => e.category === 'network');

  if (networkEntries.length === 0) return features;

  // Group by URL pattern
  const endpoints = new Map();
  for (const entry of networkEntries) {
    if (!entry.url) continue;
    const pattern = normalizeEndpoint(entry.url);
    if (!endpoints.has(pattern)) {
      endpoints.set(pattern, []);
    }
    endpoints.get(pattern).push(entry);
  }

  for (const [pattern, entries] of endpoints) {
    const methods = new Set(entries.map(e => e.method));
    features.push({
      type: 'api-endpoint',
      name: `API: ${pattern}`,
      methods: Array.from(methods),
      callCount: entries.length,
      confidence: 0.9,
      source: 'network'
    });
  }

  return features;
}

// ===== TRIGGER-EFFECT ANALYSIS =====

function analyzeTriggerEffects(recording) {
  const triggerEffects = [];
  const log = recording.log;

  // Window for correlating events (ms)
  const CORRELATION_WINDOW = 100;

  for (let i = 0; i < log.length; i++) {
    const trigger = log[i];

    // Only user events can be triggers
    if (trigger.category !== 'user-event') continue;

    const effects = [];

    // Look for effects in the correlation window
    for (let j = i + 1; j < log.length; j++) {
      const effect = log[j];
      const timeDiff = effect.timestamp - trigger.timestamp;

      if (timeDiff > CORRELATION_WINDOW) break;

      // Collect effects
      if (effect.category === 'dom-mutation') {
        effects.push({ type: 'dom-change', summary: effect.summary });
      } else if (effect.category === 'storage') {
        effects.push({ type: 'storage-change', key: effect.key, operation: effect.type });
      } else if (effect.category === 'canvas') {
        effects.push({ type: 'canvas-update', method: effect.method });
      } else if (effect.category === 'network') {
        effects.push({ type: 'api-call', url: effect.url, method: effect.method });
      }
    }

    if (effects.length > 0) {
      triggerEffects.push({
        trigger: {
          type: trigger.type,
          target: trigger.target,
          key: trigger.key,
          modifiers: trigger.modifiers
        },
        effects: deduplicateEffects(effects),
        timestamp: trigger.timestamp
      });
    }
  }

  // Aggregate similar trigger-effect pairs
  return aggregateTriggerEffects(triggerEffects);
}

function deduplicateEffects(effects) {
  const seen = new Set();
  return effects.filter(e => {
    const key = JSON.stringify(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateTriggerEffects(pairs) {
  const aggregated = new Map();

  for (const pair of pairs) {
    const triggerKey = getTriggerKey(pair.trigger);

    if (!aggregated.has(triggerKey)) {
      aggregated.set(triggerKey, {
        trigger: pair.trigger,
        effectSets: [],
        occurrences: 0
      });
    }

    const agg = aggregated.get(triggerKey);
    agg.effectSets.push(pair.effects);
    agg.occurrences++;
  }

  // Return with common effects identified
  return Array.from(aggregated.values()).map(agg => ({
    trigger: agg.trigger,
    commonEffects: findCommonEffects(agg.effectSets),
    occurrences: agg.occurrences
  }));
}

function getTriggerKey(trigger) {
  if (trigger.type === 'click') {
    return `click:${getTargetKey(trigger.target)}`;
  }
  if (trigger.type === 'keydown') {
    return `key:${formatShortcut({ key: trigger.key, modifiers: trigger.modifiers })}`;
  }
  return `${trigger.type}:${JSON.stringify(trigger)}`;
}

function findCommonEffects(effectSets) {
  if (effectSets.length === 0) return [];
  if (effectSets.length === 1) return effectSets[0];

  // Find effects that appear in all sets
  const firstSet = effectSets[0];
  return firstSet.filter(effect => {
    const effectKey = JSON.stringify(effect);
    return effectSets.every(set =>
      set.some(e => JSON.stringify(e) === effectKey)
    );
  });
}

// ===== STATE MACHINE EXTRACTION =====

function extractStateMachine(recording) {
  const snapshots = recording.stateSnapshots;
  if (snapshots.length < 2) return null;

  const states = [];
  const transitions = [];

  // Identify unique states
  const stateSignatures = new Map();

  for (const snapshot of snapshots) {
    const signature = computeStateSignature(snapshot);

    if (!stateSignatures.has(signature)) {
      const stateId = `state-${stateSignatures.size}`;
      stateSignatures.set(signature, stateId);
      states.push({
        id: stateId,
        label: snapshot.label,
        signature,
        example: {
          url: snapshot.url,
          activeElement: snapshot.activeElement,
          visibleModals: snapshot.visibleModals
        }
      });
    }
  }

  // Identify transitions between states
  for (let i = 0; i < snapshots.length - 1; i++) {
    const fromSig = computeStateSignature(snapshots[i]);
    const toSig = computeStateSignature(snapshots[i + 1]);

    if (fromSig !== toSig) {
      const fromId = stateSignatures.get(fromSig);
      const toId = stateSignatures.get(toSig);

      // Find the trigger (user event between snapshots)
      const trigger = findTriggerBetweenSnapshots(
        recording.log,
        snapshots[i].timestamp,
        snapshots[i + 1].timestamp
      );

      transitions.push({
        from: fromId,
        to: toId,
        trigger,
        timestamp: snapshots[i + 1].timestamp
      });
    }
  }

  return {
    states,
    transitions: deduplicateTransitions(transitions),
    initialState: stateSignatures.get(computeStateSignature(snapshots[0]))
  };
}

function computeStateSignature(snapshot) {
  // Create a signature based on key state attributes
  const parts = [
    snapshot.url,
    snapshot.hash,
    JSON.stringify(snapshot.visibleModals || []),
    snapshot.activeElement?.classes?.join(',') || ''
  ];

  // Include key localStorage values that indicate state
  if (snapshot.localStorage) {
    const stateIndicators = ['theme', 'state', 'mode', 'view', 'page'];
    for (const key of Object.keys(snapshot.localStorage)) {
      if (stateIndicators.some(ind => key.toLowerCase().includes(ind))) {
        parts.push(`${key}:${snapshot.localStorage[key]?.substring(0, 50)}`);
      }
    }
  }

  return parts.join('|');
}

function findTriggerBetweenSnapshots(log, startTime, endTime) {
  const triggers = log.filter(e =>
    e.category === 'user-event' &&
    e.timestamp >= startTime &&
    e.timestamp <= endTime &&
    ['click', 'keydown'].includes(e.type)
  );

  if (triggers.length === 0) return null;

  // Return the most significant trigger
  const clickTrigger = triggers.find(t => t.type === 'click');
  if (clickTrigger) {
    return {
      type: 'click',
      target: getTargetLabel(clickTrigger.target)
    };
  }

  const keyTrigger = triggers.find(t => t.type === 'keydown');
  if (keyTrigger) {
    return {
      type: 'keyboard',
      key: formatShortcut(keyTrigger)
    };
  }

  return null;
}

function deduplicateTransitions(transitions) {
  const seen = new Set();
  return transitions.filter(t => {
    const key = `${t.from}→${t.to}:${JSON.stringify(t.trigger)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===== HELPER FUNCTIONS =====

function getTargetKey(target) {
  if (!target) return 'unknown';
  return [
    target.tag,
    target.id,
    target.classes?.slice(0, 2).join('.'),
    target.ariaLabel?.substring(0, 20),
    target.textContent?.substring(0, 20)
  ].filter(Boolean).join(':');
}

function getTargetLabel(target) {
  if (!target) return null;
  return target.ariaLabel ||
         target.title ||
         target.name ||
         (target.textContent?.substring(0, 30)) ||
         target.id;
}

function formatShortcut(entry) {
  if (!entry.key) return null;

  const parts = [];
  if (entry.modifiers?.ctrl) parts.push('Ctrl');
  if (entry.modifiers?.alt) parts.push('Alt');
  if (entry.modifiers?.shift) parts.push('Shift');
  if (entry.modifiers?.meta) parts.push('Cmd');

  // Skip lone modifier keys
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(entry.key)) {
    return null;
  }

  parts.push(entry.key);
  return parts.join('+');
}

function inferFeatureFromKey(key) {
  const keyLower = key.toLowerCase();

  const patterns = {
    theme: 'Theme Selection',
    language: 'Language/i18n',
    lang: 'Language/i18n',
    i18n: 'Language/i18n',
    state: 'App State Persistence',
    settings: 'User Settings',
    preferences: 'User Preferences',
    token: 'Authentication',
    auth: 'Authentication',
    session: 'Session Management',
    cart: 'Shopping Cart',
    recent: 'Recent Items',
    history: 'History',
    draft: 'Draft Saving',
    undo: 'Undo/Redo'
  };

  for (const [pattern, feature] of Object.entries(patterns)) {
    if (keyLower.includes(pattern)) {
      return feature;
    }
  }

  return null;
}

function analyzeStateStructure(snapshots) {
  const stateKeys = [];
  const localStorageKeys = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot.localStorage) continue;

    for (const [key, value] of Object.entries(snapshot.localStorage)) {
      if (!localStorageKeys.has(key)) {
        localStorageKeys.set(key, new Set());
      }
      localStorageKeys.get(key).add(value);
    }
  }

  for (const [key, values] of localStorageKeys) {
    // Parse JSON values to find structure
    let valueType = 'string';
    let structure = null;

    for (const value of values) {
      try {
        const parsed = JSON.parse(value);
        valueType = Array.isArray(parsed) ? 'array' : typeof parsed;
        if (valueType === 'object') {
          structure = Object.keys(parsed).slice(0, 10);
        }
        break;
      } catch {
        // Not JSON, keep as string
      }
    }

    stateKeys.push({
      name: key,
      path: `localStorage.${key}`,
      type: valueType,
      variations: values.size,
      structure
    });
  }

  return stateKeys.filter(k => k.variations > 1 || k.type !== 'string');
}

function normalizeEndpoint(url) {
  try {
    const parsed = new URL(url);
    // Remove query params and normalize path
    return `${parsed.host}${parsed.pathname.replace(/\/\d+/g, '/:id')}`;
  } catch {
    return url;
  }
}

function deduplicateFeatures(features) {
  const seen = new Map();

  for (const feature of features) {
    const key = `${feature.type}:${feature.name}`;
    if (!seen.has(key) || seen.get(key).confidence < feature.confidence) {
      seen.set(key, feature);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence);
}

// ===== GENERATE BEHAVIOR MODEL =====

function generateBehaviorModel(recording) {
  const features = extractFeatures(recording);
  const triggerEffects = analyzeTriggerEffects(recording);
  const stateMachine = extractStateMachine(recording);

  return {
    metadata: {
      url: recording.metadata.url,
      title: recording.metadata.title,
      duration: recording.metadata.duration,
      eventCount: recording.metadata.eventCount,
      analyzedAt: new Date().toISOString()
    },
    features,
    triggerEffects,
    stateMachine,
    summary: {
      featureCount: features.length,
      triggerEffectCount: triggerEffects.length,
      stateCount: stateMachine?.states.length || 0,
      transitionCount: stateMachine?.transitions.length || 0
    }
  };
}

// ===== GENERATE HUMAN-READABLE REPORT =====

function generateReport(model) {
  const lines = [];

  lines.push('═'.repeat(65));
  lines.push('  BEHAVIOR ANALYSIS REPORT');
  lines.push('═'.repeat(65));
  lines.push('');
  lines.push(`URL: ${model.metadata.url}`);
  lines.push(`Title: ${model.metadata.title}`);
  lines.push(`Duration: ${(model.metadata.duration / 1000).toFixed(1)}s`);
  lines.push(`Events Analyzed: ${model.metadata.eventCount}`);
  lines.push('');

  // Features
  lines.push('─── Detected Features ─────────────────────────────────────────');
  const featuresByType = {};
  for (const f of model.features) {
    if (!featuresByType[f.type]) featuresByType[f.type] = [];
    featuresByType[f.type].push(f);
  }

  for (const [type, features] of Object.entries(featuresByType)) {
    lines.push(`\n  ${type.toUpperCase()}:`);
    for (const f of features.slice(0, 10)) {
      const confidence = Math.round(f.confidence * 100);
      lines.push(`    • ${f.name} (${confidence}% confidence)`);
    }
    if (features.length > 10) {
      lines.push(`    ... and ${features.length - 10} more`);
    }
  }
  lines.push('');

  // Trigger-Effects
  lines.push('─── Trigger-Effect Mappings ───────────────────────────────────');
  for (const te of model.triggerEffects.slice(0, 15)) {
    const trigger = te.trigger.type === 'click'
      ? `Click: ${getTargetLabel(te.trigger.target) || 'unknown'}`
      : `Key: ${formatShortcut({ key: te.trigger.key, modifiers: te.trigger.modifiers })}`;

    lines.push(`\n  ${trigger} (${te.occurrences}x)`);
    for (const effect of te.commonEffects.slice(0, 3)) {
      lines.push(`    → ${effect.type}: ${JSON.stringify(effect).substring(0, 60)}`);
    }
  }
  lines.push('');

  // State Machine
  if (model.stateMachine) {
    lines.push('─── State Machine ─────────────────────────────────────────────');
    lines.push(`\n  States: ${model.stateMachine.states.length}`);
    for (const state of model.stateMachine.states) {
      lines.push(`    • ${state.id}: ${state.label || 'unnamed'}`);
    }

    lines.push(`\n  Transitions: ${model.stateMachine.transitions.length}`);
    for (const t of model.stateMachine.transitions.slice(0, 10)) {
      const trigger = t.trigger
        ? `[${t.trigger.type}: ${t.trigger.key || t.trigger.target}]`
        : '[auto]';
      lines.push(`    ${t.from} → ${t.to} ${trigger}`);
    }
  }
  lines.push('');

  // Summary
  lines.push('─── Summary ───────────────────────────────────────────────────');
  lines.push(`  Features Detected: ${model.summary.featureCount}`);
  lines.push(`  Trigger-Effect Pairs: ${model.summary.triggerEffectCount}`);
  lines.push(`  States Identified: ${model.summary.stateCount}`);
  lines.push(`  Transitions: ${model.summary.transitionCount}`);
  lines.push('');

  return lines.join('\n');
}

// ===== CLI =====

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node analyze-behavior.js <recording-dir>');
    console.log('');
    console.log('Example:');
    console.log('  node analyze-behavior.js output/behavior-recordings/excalidraw-com-2026-01-08/');
    process.exit(1);
  }

  const recordingDir = args[0];
  const recordingPath = path.join(recordingDir, 'recording.json');

  if (!fs.existsSync(recordingPath)) {
    console.error(`Recording not found: ${recordingPath}`);
    process.exit(1);
  }

  console.log('═'.repeat(65));
  console.log('  BEHAVIOR ANALYZER');
  console.log('═'.repeat(65));
  console.log(`\nLoading: ${recordingPath}`);

  const recording = JSON.parse(fs.readFileSync(recordingPath, 'utf-8'));

  console.log(`Events: ${recording.log.length}`);
  console.log(`Snapshots: ${recording.stateSnapshots.length}`);
  console.log('\nAnalyzing...');

  const model = generateBehaviorModel(recording);
  const report = generateReport(model);

  // Save outputs
  const modelPath = path.join(recordingDir, 'behavior-model.json');
  const reportPath = path.join(recordingDir, 'behavior-report.txt');

  fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
  fs.writeFileSync(reportPath, report);

  console.log('\n' + report);
  console.log('═'.repeat(65));
  console.log('  OUTPUT FILES');
  console.log('═'.repeat(65));
  console.log(`  behavior-model.json - Structured behavior model`);
  console.log(`  behavior-report.txt - Human-readable report`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
