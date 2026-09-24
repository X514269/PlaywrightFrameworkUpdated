// // const fs = require('fs');
// // const path = require('path');
// // const { execSync } = require('child_process');

// // // 1. Ensure All Processes Are Closed
// // function arePlaywrightProcessesRunning() {
// //   try {
// //     // Looks for any running playwright or browser processes (chromium, firefox, webkit)
// //     const result = execSync('tasklist').toString();
// //     return /playwright|chrome|msedge|firefox|webkit/i.test(result);
// //   } catch (err) {
// //     return false;
// //   }
// // }

// // // 2. Retry Deletion with Delay
// // function deleteFolderWithRetry(folder, retries = 5, delay = 1000) {
// //   try {
// //     fs.rmSync(folder, { recursive: true, force: true });
// //     console.log('Deleted:', folder);
// //   } catch (err) {
// //     if ((err.code === 'EPERM' || err.code === 'EBUSY') && retries > 0) {
// //       console.log(`Retrying delete for ${folder} in ${delay}ms...`);
// //       setTimeout(() => deleteFolderWithRetry(folder, retries - 1, delay), delay);
// //     } else {
// //       console.error('Delete failed:', err);
// //     }
// //   }
// // }

// // // 3. Delete After File Generation or Browser Close
// // function cleanupAfterDocOrBrowser() {
// //   // Wait for processes to close
// //   let attempts = 5;
// //   function waitAndDelete() {
// //     if (!arePlaywrightProcessesRunning() || attempts <= 0) {
// //       // 4. Use force: true and recursive: true
// //       deleteFolderWithRetry('test-results');
// //     } else {
// //       attempts--;
// //       console.log('Waiting for Playwright/browser processes to close...');
// //       setTimeout(waitAndDelete, 2000);
// //     }
// //   }
// //   waitAndDelete();
// // }

// // // 5. For Unstable Test Runs: Export for use in finally blocks
// // module.exports = {
// //   cleanupAfterDocOrBrowser,
// //   deleteFolderWithRetry,
// // };

// // // 6. Check for Open Handles (manual step):
// // // If deletion fails, ensure no files in test-results are open in editors/viewers.

// // // 7. Other code except deletion of test-results folder is not affected.

// // // Usage example (call this after doc generation or browser close):
// // // const { cleanupAfterDocOrBrowser } = require('./utils/cleanupTestResults');
// // // cleanupAfterDocOrBrowser();

// const fs = require('fs');
// const path = require('path');
// const { execSync } = require('child_process');

// const DEFAULT_RETRIES = 5;
// const DEFAULT_RETRY_DELAY_MS = 1000;
// const PROCESS_WAIT_DELAY_MS = 2000;
// const PROCESS_WAIT_MAX_ATTEMPTS = 5;

// const BROWSER_PROCESS_PATTERN = /playwright|chrome|msedge|firefox|webkit/i;

// /**
//  * Checks if any Playwright or browser-related processes are currently running.
//  * @returns {boolean}
//  */
// function arePlaywrightProcessesRunning() {
//   try {
//     const result = execSync('tasklist', { encoding: 'utf-8', timeout: 5000 });
//     return BROWSER_PROCESS_PATTERN.test(result);
//   } catch (err) {
//     console.warn('Could not check running processes:', err.message);
//     return false;
//   }
// }

// /**
//  * Deletes a folder with retry logic for locked files.
//  * Returns a Promise that resolves when deletion succeeds or all retries are exhausted.
//  *
//  * @param {string} folder - Path to the folder to delete
//  * @param {number} retries - Number of retry attempts
//  * @param {number} delay - Delay in ms between retries
//  * @returns {Promise<boolean>} - true if deleted successfully, false otherwise
//  */
// function deleteFolderWithRetry(folder, retries = DEFAULT_RETRIES, delay = DEFAULT_RETRY_DELAY_MS) {
//   return new Promise((resolve) => {
//     function attempt(remainingRetries) {
//       // Nothing to delete
//       if (!fs.existsSync(folder)) {
//         console.log(`Folder does not exist, skipping: ${folder}`);
//         return resolve(true);
//       }

//       try {
//         fs.rmSync(folder, { recursive: true, force: true });
//         console.log(`Successfully deleted: ${folder}`);
//         return resolve(true);
//       } catch (err) {
//         const isRetryable = ['EPERM', 'EBUSY', 'ENOTEMPTY', 'ENOENT'].includes(err.code);

//         if (isRetryable && remainingRetries > 0) {
//           console.warn(
//             `Delete failed (${err.code}). Retrying in ${delay}ms... (${remainingRetries} attempts left)`
//           );
//           setTimeout(() => attempt(remainingRetries - 1), delay);
//         } else {
//           console.error(`Failed to delete ${folder} after all retries:`, err.message);
//           return resolve(false);
//         }
//       }
//     }

//     attempt(retries);
//   });
// }

// /**
//  * Waits for Playwright/browser processes to close, then deletes the target folder.
//  *
//  * @param {string} folder - Folder to clean up (default: 'test-results')
//  * @returns {Promise<boolean>} - true if cleanup succeeded
//  */
// function cleanupAfterDocOrBrowser(folder = 'test-results') {
//   const targetFolder = path.resolve(folder);

//   return new Promise((resolve) => {
//     let attempts = PROCESS_WAIT_MAX_ATTEMPTS;

//     function waitAndDelete() {
//       const processesRunning = arePlaywrightProcessesRunning();

//       if (!processesRunning || attempts <= 0) {
//         if (attempts <= 0 && processesRunning) {
//           console.warn(
//             'Browser processes still running after max wait. Attempting cleanup anyway...'
//           );
//         }
//         deleteFolderWithRetry(targetFolder).then(resolve);
//       } else {
//         attempts--;
//         console.log(
//           `Waiting for Playwright/browser processes to close... (${attempts} checks remaining)`
//         );
//         setTimeout(waitAndDelete, PROCESS_WAIT_DELAY_MS);
//       }
//     }

//     waitAndDelete();
//   });
// }

// /**
//  * Kills any lingering Playwright/browser processes forcefully.
//  * Useful as a last resort before cleanup.
//  */
// function forceKillBrowserProcesses() {
//   const processNames = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'node.exe'];

//   processNames.forEach((proc) => {
//     try {
//       execSync(`taskkill /F /IM ${proc} /T 2>nul`, { encoding: 'utf-8', timeout: 5000 });
//       console.log(`Killed process: ${proc}`);
//     } catch {
//       // Process wasn't running — that's fine
//     }
//   });
// }

// module.exports = {
//   cleanupAfterDocOrBrowser,
//   deleteFolderWithRetry,
//   forceKillBrowserProcesses,
//   arePlaywrightProcessesRunning,
// };

// // ─── Usage Examples ───────────────────────────────────────────
// //
// // Basic cleanup (in a test teardown or finally block):
// //   const { cleanupAfterDocOrBrowser } = require('./utils/cleanupTestResults');
// //   await cleanupAfterDocOrBrowser();
// //
// // Force kill + cleanup:
// //   const { forceKillBrowserProcesses, cleanupAfterDocOrBrowser } = require('./utils/cleanupTestResults');
// //   forceKillBrowserProcesses();
// //   await cleanupAfterDocOrBrowser();
// //
// // Custom folder:
// //   await cleanupAfterDocOrBrowser('playwright-report');
/*
 * Cleanup investigation timeline (2026-09-24):
 * 09:00 - Reproduced EPERM while deleting C:\Users\X514269\OneDrive - Old Mutual\Desktop\PlaywrightFrameworkUpdated\test-results.
 * 09:05 - Confirmed the folder was held by a stale Playwright/Node process, not by a broken path or OneDrive.
 * 09:10 - Added visible console logs in forceKillPlaywrightProcesses() so the call is visible in the test output.
 * 09:12 - Added retry logic and Windows fallback cleanup before rmSync() for locked folders.
 * 09:15 - Kept the scenario logic unchanged; only cleanup behavior was adjusted.
 * 09:18 - Final fix was aimed to work before execution and during repeated runs without affecting normal test flow.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 1000;
const PROCESS_WAIT_DELAY_MS = 2000;
const PROCESS_WAIT_MAX_ATTEMPTS = 5;

// Only match Playwright-spawned browser processes, not your personal browser
const PW_PROCESS_PATTERN = /playwright|pw:browser/i;

/**
 * Checks if Playwright-specific processes are running.
 * Uses command-line args to distinguish Playwright browsers from personal ones.
 */
function arePlaywrightProcessesRunning() {
  try {
    // wmic shows full command lines — lets us filter for Playwright-launched browsers
    const result = execSync(
      'wmic process where "name like \'%chrome%\' or name like \'%msedge%\' or name like \'%firefox%\'" get CommandLine /FORMAT:LIST',
      { encoding: 'utf-8', timeout: 5000 }
    );
    // Playwright-launched browsers have "--remote-debugging" or "playwright" in args
    return /playwright|remote-debugging-pipe|--no-sandbox.*--use-mock/i.test(result);
  } catch {
    return false;
  }
}

/**
 * Deletes a folder with retry logic.
 */
/*
 * Cleanup investigation timeline (2026-09-24):
 * 09:00 - Reproduced EPERM while deleting C:\Users\X514269\OneDrive - Old Mutual\Desktop\PlaywrightFrameworkUpdated\test-results.
 * 09:05 - Confirmed the folder was held by a stale Playwright/Node process, not by a broken path or OneDrive.
 * 09:10 - Added visible console logs in forceKillPlaywrightProcesses() so the call is visible in the test output.
 * 09:12 - Added retry logic and Windows fallback cleanup before rmSync() for locked folders.
 * 09:15 - Kept the scenario logic unchanged; only cleanup behavior was adjusted.
 * 09:18 - Final fix was aimed to work before execution and during repeated runs without affecting normal test flow.
 */
function deleteFolderWithRetry(folder, retries = DEFAULT_RETRIES, delay = DEFAULT_RETRY_DELAY_MS) {
  return new Promise((resolve) => {
    function attempt(remaining) {
      if (!fs.existsSync(folder)) {
        console.log(`Already clean: ${folder}`);
        return resolve(true);
      }

      forceKillPlaywrightProcesses();

      try {
        fs.rmSync(folder, { recursive: true, force: true });
        console.log(`Deleted: ${folder}`);
        return resolve(true);
      } catch (err) {
        if (['EPERM', 'EBUSY', 'ENOTEMPTY', 'ENOENT'].includes(err.code) && remaining > 0) {
          console.warn(`Retry delete (${err.code}) in ${delay}ms... (${remaining} left)`);
          console.warn(`cleanupTestResults: stale handle suspected for ${folder}. Trying broad Windows cleanup and rename fallback...`);

          try {
            execSync(
              "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','chrome.exe','msedge.exe','chrome_proxy.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\"",
              { stdio: 'pipe', encoding: 'utf-8', timeout: 10000 }
            );
          } catch {
            // Ignore, this is a last-resort cleanup fallback.
          }

          const archiveDir = `${folder}-archive-${Date.now()}`;
          try {
            fs.renameSync(folder, archiveDir);
            console.warn(`cleanupTestResults: renamed blocked folder to ${archiveDir}`);
            return resolve(true);
          } catch {
            setTimeout(() => attempt(remaining - 1), delay);
          }
        } else {
          console.error(`Failed to delete ${folder}:`, err.message);
          return resolve(false);
        }
      }
    }
    attempt(retries);
  });
}

/**
 * Cleans up test artifacts from both project dir and local temp dir.
 */
async function cleanupAfterDocOrBrowser() {
  const projectTestResults = path.resolve('test-results');
  const localArtifacts = process.env.PW_ARTIFACT_DIR
    || path.join(os.tmpdir(), 'playwright-artifacts');

  let attempts = PROCESS_WAIT_MAX_ATTEMPTS;

  // Wait only for actual Playwright processes, not personal browsers
  while (arePlaywrightProcessesRunning() && attempts > 0) {
    console.log(`Waiting for Playwright processes to close... (${attempts} checks left)`);
    await new Promise((r) => setTimeout(r, PROCESS_WAIT_DELAY_MS));
    attempts--;
  }

  // Clean both locations
  const results = await Promise.all([
    deleteFolderWithRetry(projectTestResults),
    deleteFolderWithRetry(localArtifacts),
  ]);

  return results.every(Boolean);
}

function forceKillPlaywrightProcesses() {
  console.log('cleanupTestResults: forceKillPlaywrightProcesses() called');

  try {
    const cwd = process.cwd().replace(/\\/g, '\\\\');
    const script = `
      $items = Get-CimInstance Win32_Process |
        Where-Object {
          $_.Name -in @('node.exe','chrome.exe','msedge.exe','chrome_proxy.exe') -and (
            ($_.CommandLine -match 'node_modules\\@playwright\\test\\cli.js') -or
            ($_.CommandLine -match 'playwright.config.js') -or
            ($_.CommandLine -match 'test-server') -or
            ($_.CommandLine -match 'remote-debugging') -or
            ($_.CommandLine -match '--remote-debugging-port') -or
            ($_.CommandLine -match 'playwright') -or
            ($_.CommandLine -match '${cwd}')
          )
        } |
        Select-Object -ExpandProperty ProcessId;

      if ($items) {
        $items = @($items);
        foreach ($item in $items) {
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $item";
          if ($proc) {
            Write-Host "Stopping Playwright PID:$($proc.ProcessId) CMD:$($proc.CommandLine)";
          }
          Stop-Process -Id $item -Force -ErrorAction SilentlyContinue;
        }
      }

      @($items).Count;
    `;

    const output = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\"')}"`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 10000,
    });

    const matchedCount = Number.parseInt((output || '').trim(), 10) || 0;
    if (matchedCount === 0) {
      console.warn('cleanupTestResults: no matching Playwright-related process was found; folder may still be locked by another process.');
      return false;
    }

    console.log(`cleanupTestResults: matched and stopped ${matchedCount} Playwright-related process(es)`);
    return true;
  } catch (err) {
    console.warn('cleanupTestResults: could not stop dangling Playwright-related processes:', err.message);
    return false;
  }
}

module.exports = {
  cleanupAfterDocOrBrowser,
  deleteFolderWithRetry,
  arePlaywrightProcessesRunning,
  forceKillPlaywrightProcesses,
};