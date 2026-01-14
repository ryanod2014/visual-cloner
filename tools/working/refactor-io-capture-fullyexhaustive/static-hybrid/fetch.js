/**
 * PHASE 0: Asset Fetch
 *
 * One-time browser interaction to fetch all assets.
 * Goal: Get HTML, CSS, JS, and event bindings in < 10 seconds.
 */

const { chromium } = require('playwright');

/**
 * Fetch all assets from a URL
 */
async function fetchAssets(url) {
  const startTime = Date.now();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Collect network responses
  const scripts = [];
  const styles = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    try {
      if (contentType.includes('javascript') || url.endsWith('.js')) {
        const content = await response.text().catch(() => '');
        if (content) {
          scripts.push({
            url,
            content,
            size: content.length
          });
        }
      } else if (contentType.includes('css') || url.endsWith('.css')) {
        const content = await response.text().catch(() => '');
        if (content) {
          styles.push({
            url,
            content,
            size: content.length
          });
        }
      }
    } catch (e) {
      // Ignore failed resource fetches
    }
  });

  // Navigate and wait for load
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Get HTML content
  const html = await page.content();

  // Get inline scripts
  const inlineScripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script:not([src])')).map(s => ({
      url: 'inline',
      content: s.textContent,
      size: s.textContent.length
    }));
  });
  scripts.push(...inlineScripts);

  // Get inline styles
  const inlineStyles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('style')).map(s => ({
      url: 'inline',
      content: s.textContent,
      size: s.textContent.length
    }));
  });
  styles.push(...inlineStyles);

  // Extract event listeners via CDP
  const eventListeners = await extractEventListeners(page);

  // Get initial DOM state
  const initialDOM = await page.evaluate(() => {
    function serializeElement(el, depth = 0) {
      if (depth > 10) return null;

      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);

      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        visible: rect.width > 0 && rect.height > 0 &&
                 cs.display !== 'none' && cs.visibility !== 'hidden',
        interactive: ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
                     el.onclick || el.getAttribute('role') === 'button',
        children: Array.from(el.children).map(c => serializeElement(c, depth + 1)).filter(Boolean)
      };
    }

    return serializeElement(document.body);
  });

  await browser.close();

  return {
    url,
    html,
    scripts,
    styles,
    eventListeners,
    initialDOM,
    timing: Date.now() - startTime
  };
}

/**
 * Extract event listeners via Chrome DevTools Protocol
 */
async function extractEventListeners(page) {
  const listeners = [];

  // Get CDP session
  const client = await page.context().newCDPSession(page);

  // Get all nodes in the document
  const { root } = await client.send('DOM.getDocument', { depth: -1 });

  // Recursive function to process nodes
  async function processNode(nodeId, path = '') {
    try {
      // Get event listeners for this node
      const { listeners: nodeListeners } = await client.send('DOMDebugger.getEventListeners', {
        objectId: await getObjectIdForNode(client, nodeId)
      }).catch(() => ({ listeners: [] }));

      for (const listener of nodeListeners) {
        listeners.push({
          path,
          nodeId,
          type: listener.type,
          handler: listener.handler?.description?.substring(0, 200) || 'anonymous',
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          scriptId: listener.scriptId,
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber
        });
      }

      // Get children
      const { node } = await client.send('DOM.describeNode', { nodeId }).catch(() => ({ node: {} }));
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          const childPath = path + '/' + (child.localName || child.nodeName);
          await processNode(child.nodeId, childPath);
        }
      }
    } catch (e) {
      // Node might have been removed, skip it
    }
  }

  // Helper to get object ID for a node
  async function getObjectIdForNode(client, nodeId) {
    const { object } = await client.send('DOM.resolveNode', { nodeId });
    return object.objectId;
  }

  // Start processing from document
  await processNode(root.nodeId, '');

  return listeners;
}

module.exports = { fetchAssets, extractEventListeners };
