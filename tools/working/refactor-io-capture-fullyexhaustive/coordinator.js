/**
 * Coordinator that orchestrates multiple workers and manages exploration.
 */
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { createWorker } = require('./worker');

async function createCoordinator(options = {}) {
  const {
    workers: workerCount = 4, maxStates = 10000,
    convergenceThreshold = 100, outputDir = './output'
  } = options;

  const stateQueue = [], visitedStates = new Set(), allTransitions = [], allIOs = [];
  const workerInstances = [];
  let manifest = null, phase = 'idle', startTime = null;
  let statesWithoutNew = 0, running = false;

  async function runDiscovery(page) {
    phase = 'discovery';
    const elements = await page.evaluate(() => {
      const els = [];
      document.querySelectorAll('a,button,input,select,textarea,[onclick],[role="button"]').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          els.push({
            selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
            tagName: el.tagName.toLowerCase(), clickable: true,
            inputtable: ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())
          });
        }
      });
      return els;
    });
    const shortcuts = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'].map(key => ({ key }));
    const apis = await page.evaluate(() =>
      ['fetch', 'localStorage', 'sessionStorage'].filter(a => window[a]).map(a => ({ name: a }))
    );
    manifest = { url: page.url(), timestamp: new Date().toISOString(), elements, shortcuts, apis };
    return manifest;
  }

  async function runExploration(existingManifest) {
    phase = 'exploration';
    manifest = existingManifest;
    for (let i = 0; i < workerCount; i++) {
      workerInstances.push(await createWorker(`worker-${i}`, {
        headless: true,
        onTaskComplete: () => {},
        onError: (e) => console.error(`Worker ${i} error:`, e)
      }));
    }
    running = true;
    workerInstances.forEach(w => w.start(stateQueue, aggregateResults));
    while (running && !hasConverged()) await new Promise(r => setTimeout(r, 100));
    await Promise.all(workerInstances.map(w => w.stop()));
    return { transitions: allTransitions, ios: allIOs };
  }

  async function run(url) {
    startTime = Date.now();
    running = true;
    await fs.mkdir(outputDir, { recursive: true });

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await runDiscovery(page);
    await saveFile('manifest.json', manifest);

    addState({ id: 'initial', url, actions: [], manifest });
    await browser.close();
    await runExploration(manifest);

    await saveFile('state-machine.json', { states: Array.from(visitedStates), transitions: allTransitions });
    await saveFile('io-specs.json', allIOs);
    const summary = await generateSummary();
    phase = 'complete';
    return { manifest, transitions: allTransitions, ios: allIOs, summary };
  }

  function addState(state) {
    const key = JSON.stringify({ url: state.url, actions: state.actions });
    if (!visitedStates.has(key) && visitedStates.size < maxStates) {
      visitedStates.add(key);
      stateQueue.push({ ...state, manifest });
      statesWithoutNew = 0;
    } else statesWithoutNew++;
  }

  function aggregateResults({ newStates, transitions, ios }) {
    newStates.forEach(s => addState(s));
    allTransitions.push(...transitions);
    allIOs.push(...ios);
  }

  function hasConverged() {
    return statesWithoutNew >= convergenceThreshold ||
           visitedStates.size >= maxStates ||
           (stateQueue.length === 0 && visitedStates.size > 0);
  }

  function getProgress() {
    return {
      phase, statesDiscovered: visitedStates.size, transitionsRecorded: allTransitions.length,
      workersActive: workerInstances.length, queueSize: stateQueue.length,
      convergenceProgress: Math.min(100, (statesWithoutNew / convergenceThreshold) * 100),
      elapsedTime: startTime ? Date.now() - startTime : 0
    };
  }

  async function stop() {
    running = false;
    await Promise.all(workerInstances.map(w => w.stop()));
    await saveFile('checkpoint.json', { progress: getProgress(), manifest, transitions: allTransitions, ios: allIOs });
  }

  async function saveFile(name, data) {
    await fs.writeFile(path.join(outputDir, name), JSON.stringify(data, null, 2));
  }

  async function generateSummary() {
    const summary = {
      timestamp: new Date().toISOString(), url: manifest?.url, duration: getProgress().elapsedTime,
      statesExplored: visitedStates.size, transitionsFound: allTransitions.length, iosCapture: allIOs.length,
      workerStats: workerInstances.map(w => ({ id: w.id, ...w.getStats() }))
    };
    await saveFile('summary.json', summary);
    return summary;
  }

  return { run, runDiscovery, runExploration, getProgress, stop };
}

module.exports = { createCoordinator };
