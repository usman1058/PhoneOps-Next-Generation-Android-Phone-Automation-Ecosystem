const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const DEV = process.argv.includes("--dev");
const SERVER_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(__dirname, "dist", "server");
const PORT = Number(process.env.PORT || 3199);

let serverProc = null;
let win = null;

function waitForServer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Next.js server did not start in time"));
          return;
        }
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function startServer() {
  const nodeBin = process.platform === "win32" ? "node.exe" : "node";
  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    ALLOW_INSECURE_HTTP: "1",
  };
  serverProc = spawn(nodeBin, ["server.js"], {
    cwd: SERVER_DIR,
    env,
    stdio: "inherit",
  });
  serverProc.on("exit", (code) => {
    if (win) win.loadURL(`http://127.0.0.1:${PORT}/login`);
  });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/login`, 30_000);
  } catch (err) {
    console.error("Failed to start the panel server:", err.message);
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    autoHideMenuBar: true,
  });
  if (DEV) win.webContents.openDevTools();
  win.loadURL(`http://127.0.0.1:${PORT}/login`);
  win.on("closed", () => {
    win = null;
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("quit", () => {
  if (serverProc) {
    serverProc.kill();
  }
});
