const fs = require('fs');
const path = require('path');
const { clearDirectoryContents, forceKillPlaywrightProcesses } = require('./utils/cleanupTestResults');

const MAX_DELETE_ATTEMPTS = 5;
const DELETE_RETRY_DELAY_MS = 1000;
const RETRYABLE_ERRORS = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY', 'EBADF']);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 1; attempt <= MAX_DELETE_ATTEMPTS; attempt++) {
    try {
      clearDirectoryContents(directory);
      console.log(`global-setup: Cleared directory: ${directory}`);
      return true;
    } catch (err) {
      console.warn(
        `global-setup: Failed to remove ${directory} (${err.code}). Retrying in ${DELETE_RETRY_DELAY_MS}ms... (${attempt}/${MAX_DELETE_ATTEMPTS})`
      );
      if (!RETRYABLE_ERRORS.has(err.code) || attempt === MAX_DELETE_ATTEMPTS) {
        throw err;
      }
      forceKillPlaywrightProcesses();
      await wait(DELETE_RETRY_DELAY_MS);
    }
  }
  return false;
}

module.exports = async () => {
  const root = path.resolve(__dirname);
  const testResultsDir = path.join(root, 'test-results');
  const tempTracesDir = path.join(root, 'temp-traces');
  const runResultDir = path.join(root, 'RunResult');

  try {
    forceKillPlaywrightProcesses();
    await removeDirectoryWithRetry(testResultsDir);
  } catch (err) {
    console.warn(`global-setup: Could not remove test-results: ${err.message}`);
    try {
      const archiveDir = path.join(root, `test-results-archived-${Date.now()}`);
      fs.renameSync(testResultsDir, archiveDir);
      console.log(`global-setup: Renamed existing test-results to ${archiveDir}`);
    } catch (renameErr) {
      console.warn(`global-setup: Could not rename test-results: ${renameErr.message}`);
    }
  }

  try {
    if (!fs.existsSync(tempTracesDir)) {
      fs.mkdirSync(tempTracesDir);
      console.log('global-setup: Created temp-traces dir');
    }
  } catch (err) {
    console.warn(`global-setup: Could not ensure temp-traces: ${err.message}`);
  }

  try {
    if (!fs.existsSync(runResultDir)) {
      fs.mkdirSync(runResultDir, { recursive: true });
      console.log('global-setup: Created RunResult dir');
    }
  } catch (err) {
    console.warn(`global-setup: Could not ensure RunResult dir: ${err.message}`);
  }

  console.log('global-setup: finished');
};
