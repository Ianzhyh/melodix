import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const DEFAULT_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 45000;

let sidecarProcess: ChildProcess | null = null;
let stderrBuffer = '';

const cleanupOrphan = () => {
  if (sidecarProcess) {
    try {
      sidecarProcess.kill('SIGKILL');
    } catch {
      // ignore
    }
    sidecarProcess = null;
  }
};

process.on('exit', cleanupOrphan);
process.on('SIGINT', () => {
  cleanupOrphan();
  process.exit(130);
});

/**
 * Ping the Express sidecar server on the given port.
 * Returns true if the server is up and responsive, false otherwise.
 */
export function ping(port: number = DEFAULT_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/?server=tencent&type=search&keywords=ping`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

/**
 * Start the sidecar process on the specified port.
 * Detects real sidecar files, or creates and runs a dummy mock sidecar.
 */
export async function start(port: number = DEFAULT_PORT): Promise<void> {
  if (sidecarProcess) {
    throw new Error('Sidecar process is already running');
  }

  const serverJsPath = path.join(projectRoot, 'meting-server/index.js');
  const exePath = path.join(projectRoot, 'src-tauri/binaries/meting-server-x86_64-pc-windows-msvc.exe');

  let runCommand = 'node';
  let runArgs: string[] = [];

  if (process.env.FORCE_MOCK_SIDECAR !== 'true' && fs.existsSync(serverJsPath)) {
    runCommand = 'node';
    runArgs = [serverJsPath, port.toString()];
  } else if (process.env.FORCE_MOCK_SIDECAR !== 'true' && fs.existsSync(exePath)) {
    runCommand = exePath;
    runArgs = [port.toString()];
  } else {
    // Generate the dummy sidecar file
    const dummyDir = path.join(projectRoot, 'e2e-tests/src/fixtures');
    if (!fs.existsSync(dummyDir)) {
      fs.mkdirSync(dummyDir, { recursive: true });
    }
    const dummyPath = path.join(dummyDir, 'dummy-sidecar.cjs');
    if (!fs.existsSync(dummyPath)) {
      const dummyCode = `
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const { server, type, id, keywords } = req.query;
  if (server !== 'tencent') {
    return res.status(400).json({ error: 'Unsupported server' });
  }

  if (type === 'search') {
    return res.json([
      {
        id: '35847388',
        name: keywords || '晴天',
        artist: '周杰伦',
        album: '叶惠美',
        pic: \`http://localhost:\${port}/?server=tencent&type=pic&id=35847388&size=800\`,
        url: \`http://localhost:\${port}/mock-song.mp3\`
      }
    ]);
  }

  if (type === 'url') {
    return res.json([
      {
        url: \`http://localhost:\${port}/mock-song.mp3\`
      }
    ]);
  }

  if (type === 'lrc') {
    // Return the encrypted hex lyric text from qrcFixture
    return res.send('7d0e90f006801f32021c30512a3e23cb8eb6fac399d339ba00c2b90fce0ff0b3937a892d93fce43fe184ce918e35d9a53ec12bd294efe293b0148bba31ceb55a3d49f0f79fc9d689fedbed98a2e7f2da157f0deffc6258d8ce92f8162b10acc9701b52ea39949cc83cf456c931d16df843a308d83593ef19f4a15d4ccba45f650527f6ae818a0482a2c76b6036205820f2cec1d4f5bbe59a615d4664bd11e03f8f1f16c06e2ebd41');
  }

  if (type === 'pic') {
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length
    });
    return res.end(img);
  }

  return res.status(404).send('Not Found');
});

app.get('/mock-song.mp3', (req, res) => {
  res.send('dummy mp3 binary content');
});

app.listen(port, () => {
  console.log(\`Mock sidecar listening on port \${port}\`);
});
`;
      fs.writeFileSync(dummyPath, dummyCode.trim(), 'utf-8');
    }
    runCommand = 'node';
    runArgs = [dummyPath];
  }

  stderrBuffer = '';
  sidecarProcess = spawn(runCommand, runArgs, {
    env: { ...process.env, PORT: port.toString() },
    stdio: 'pipe',
    detached: false
  });

  if (sidecarProcess.stderr) {
    sidecarProcess.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });
  }
  if (sidecarProcess.stdout) {
    sidecarProcess.stdout.resume();
  }

  // Wait for the sidecar process to respond to ping
  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    if (!sidecarProcess || sidecarProcess.exitCode !== null) {
      break;
    }
    if (await ping(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // If timeout, stop the process and throw
  const capturedStderr = stderrBuffer;
  await stop();
  throw new Error(`Sidecar process failed to start within 5 seconds. Stderr:\n${capturedStderr}`);
}

/**
 * Stop the running sidecar process.
 */
export async function stop(): Promise<void> {
  const proc = sidecarProcess;
  if (!proc) {
    return;
  }

  sidecarProcess = null;

  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  return new Promise<void>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      proc.off('exit', onExitOrClose);
      proc.off('close', onExitOrClose);
      resolve();
    };

    const onExitOrClose = () => {
      cleanup();
    };

    proc.on('exit', onExitOrClose);
    proc.on('close', onExitOrClose);

    proc.kill();

    const timer = setTimeout(() => {
      if (!resolved) {
        proc.kill('SIGKILL');
        cleanup();
      }
    }, 1000);
  });
}
