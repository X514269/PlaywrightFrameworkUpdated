
const express = require('express');
const fs = require('fs');
const path = require('path');

const { spawn } = require('child_process');
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/scenarios', (req, res) => {
  const scenarioPath = path.join(__dirname, '../utils/ScenarioNumbers.json');
  const scenarios = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
  res.json(scenarios);
});

let clients = [];
let currentProc = null;

app.get('/events', (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('\n');
  const id = Date.now();
  clients.push(res);
  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

app.post('/select', (req, res) => {
  // Save selected scenarios to a file
  const selected = req.body.selected || [];
  const selectedPath = path.join(__dirname, '../utils/selectedScenarios.json');
  fs.writeFileSync(selectedPath, JSON.stringify(selected, null, 2));

  // Spawn Playwright and stream output via SSE to connected clients
  const scenarioNames = selected.join(',');
  if (currentProc) {
    // if a process is already running, return busy
    return res.json({ selected, status: 'busy', message: 'A test run is already in progress' });
  }

  const env = Object.assign({}, process.env);
  if (process.platform === 'win32') {
    env.SCN_TEMP = scenarioNames; // keep original env intact, set a helper for Windows shell use
  } else {
    env.SCN_TEMP = scenarioNames;
  }

  // Use shell spawn so the SCENARIO_NAME environment is respected by the spawned process
  // We'll set SCENARIO_NAME in-line on non-windows shells; on Windows, set via env and run through powershell cmd
  let proc;
  if (process.platform === 'win32') {
    // Use powershell to set env for the spawned process
    const cmd = `cmd.exe`;
    const args = ['/c', `set SCENARIO_NAME=${scenarioNames} && npx playwright test`];
    proc = spawn(cmd, args, { cwd: path.join(__dirname, '..'), shell: false, env });
  } else {
    // POSIX: prefix env var
    const cmd = 'sh';
    const args = ['-c', `SCENARIO_NAME='${scenarioNames}' npx playwright test`];
    proc = spawn(cmd, args, { cwd: path.join(__dirname, '..'), shell: false, env });
  }

  currentProc = proc;

  // Broadcast helper
  const broadcast = (data) => {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    clients.forEach(c => c.write(`data: ${msg.replace(/\n/g, '\\n')}\n\n`));
  };

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text); // still print to server terminal
    broadcast({ type: 'stdout', text });
  });
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    broadcast({ type: 'stderr', text });
  });
  proc.on('close', (code) => {
    broadcast({ type: 'exit', code });
    currentProc = null;
  });

  res.json({ selected, status: 'started' });
});

app.listen(PORT, () => {
  console.log(`UI server running at http://localhost:${PORT}`);
});
