/**
 * Parallel browser worker for processing states from a queue.
 */
const puppeteer = require('puppeteer');

async function createWorker(id, options = {}) {
  const { headless = true, onTaskComplete = () => {}, onError = () => {} } = options;

  let browser = await puppeteer.launch({ headless });
  let page = await browser.newPage();
  let running = false;
  const stats = { statesProcessed: 0, actionsExecuted: 0, errors: 0 };

  async function restoreState(state) {
    if (state.url) await page.goto(state.url, { waitUntil: 'networkidle2' });
    if (state.actions) {
      for (const action of state.actions) await executeAction(action);
    }
  }

  async function executeAction(action) {
    switch (action.type) {
      case 'click': await page.click(action.selector); break;
      case 'input': await page.type(action.selector, action.value); break;
      case 'keypress': await page.keyboard.press(action.key); break;
      case 'scroll': await page.evaluate((x, y) => window.scrollTo(x, y), action.x, action.y); break;
    }
    await page.waitForTimeout(100);
  }

  function getAvailableActions(state, manifest) {
    const actions = [];
    if (manifest.elements) {
      for (const el of manifest.elements) {
        if (el.clickable) actions.push({ type: 'click', selector: el.selector });
        if (el.inputtable) actions.push({ type: 'input', selector: el.selector, value: 'test' });
      }
    }
    if (manifest.shortcuts) {
      for (const s of manifest.shortcuts) actions.push({ type: 'keypress', key: s.key });
    }
    return actions;
  }

  async function captureIO(action, beforeState) {
    return {
      action, beforeState,
      afterState: await page.evaluate(() => ({
        url: window.location.href, title: document.title,
        scroll: { x: window.scrollX, y: window.scrollY }
      }))
    };
  }

  async function processState(state, manifest) {
    const newStates = [], transitions = [], ios = [];
    try {
      await restoreState(state);
      const actions = getAvailableActions(state, manifest);

      for (const action of actions) {
        try {
          const beforeState = await page.evaluate(() => ({
            url: window.location.href, html: document.documentElement.outerHTML.substring(0, 1000)
          }));
          await executeAction(action);
          stats.actionsExecuted++;

          ios.push(await captureIO(action, beforeState));
          const newState = {
            id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: await page.url(), parentStateId: state.id, actionTaken: action
          };
          newStates.push(newState);
          transitions.push({ fromState: state.id, toState: newState.id, action });
          await restoreState(state);
        } catch (e) {
          stats.errors++;
          onError({ type: 'action', action, error: e.message });
        }
      }
      stats.statesProcessed++;
      onTaskComplete({ stateId: state.id, actionsProcessed: actions.length });
    } catch (e) {
      stats.errors++;
      onError({ type: 'state', state, error: e.message });
    }
    return { newStates, transitions, ios };
  }

  async function start(stateQueue, resultsCallback) {
    running = true;
    while (running && stateQueue.length > 0) {
      const state = stateQueue.shift();
      if (!state) break;
      resultsCallback(await processState(state, state.manifest || {}));
    }
    running = false;
  }

  async function stop() {
    running = false;
    if (browser) { await browser.close(); browser = null; page = null; }
  }

  function getStats() { return { ...stats }; }

  return { id, processState, start, stop, getStats };
}

module.exports = { createWorker };
