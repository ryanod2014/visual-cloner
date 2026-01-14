/**
 * Extract ALL event listeners using Chrome DevTools Protocol
 */
const logger = require('../utils/logger');

async function discoverEventListeners(page) {
  logger.info('Discovering all event listeners via CDP...');

  const client = await page.context().newCDPSession(page);
  const listeners = [];

  try {
    // Get document
    const { root } = await client.send('DOM.getDocument', { depth: -1 });

    // Get all nodes
    const { nodeIds } = await client.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: '*'
    });

    // Get listeners for each node
    for (const nodeId of nodeIds) {
      try {
        const { object } = await client.send('DOM.resolveNode', { nodeId });
        if (!object.objectId) continue;

        const { listeners: els } = await client.send('DOMDebugger.getEventListeners', {
          objectId: object.objectId
        });

        if (els.length > 0) {
          // Get node description
          const { node } = await client.send('DOM.describeNode', { nodeId });

          listeners.push({
            nodeId,
            tag: node.nodeName.toLowerCase(),
            selector: node.attributes ? buildSelector(node) : null,
            events: els.map(e => ({
              type: e.type,
              useCapture: e.useCapture,
              passive: e.passive,
              once: e.once
            }))
          });
        }
      } catch (e) {
        // Node may have been removed
      }
    }

    // Also check window and document
    const windowListeners = await getWindowListeners(client);
    const documentListeners = await getDocumentListeners(client);

    listeners.push(...windowListeners, ...documentListeners);

  } finally {
    await client.detach();
  }

  logger.info(`Found ${listeners.length} elements with event listeners`);
  return listeners;
}

function buildSelector(node) {
  const attrs = node.attributes || [];
  const attrMap = {};
  for (let i = 0; i < attrs.length; i += 2) {
    attrMap[attrs[i]] = attrs[i + 1];
  }

  if (attrMap.id) return `#${attrMap.id}`;
  if (attrMap['data-testid']) return `[data-testid="${attrMap['data-testid']}"]`;
  return node.nodeName.toLowerCase();
}

async function getWindowListeners(client) {
  try {
    const { result } = await client.send('Runtime.evaluate', {
      expression: 'window',
      returnByValue: false
    });
    const { listeners } = await client.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId
    });
    if (listeners.length > 0) {
      return [{ target: 'window', events: listeners.map(e => ({ type: e.type })) }];
    }
  } catch (e) {}
  return [];
}

async function getDocumentListeners(client) {
  try {
    const { result } = await client.send('Runtime.evaluate', {
      expression: 'document',
      returnByValue: false
    });
    const { listeners } = await client.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId
    });
    if (listeners.length > 0) {
      return [{ target: 'document', events: listeners.map(e => ({ type: e.type })) }];
    }
  } catch (e) {}
  return [];
}

module.exports = { discoverEventListeners };
