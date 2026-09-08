import { spawn } from "node:child_process";

const role = process.env.SERVICE_ROLE ?? "web";

if (role === "api") {
  startProcess("api", ["apps/api/dist/server.js"]);
} else if (role === "all") {
  startProcess("api", ["apps/api/dist/server.js"], {
    PORT: process.env.API_PORT ?? "4000",
    HOST: "0.0.0.0"
  });
  startProcess("web", ["apps/web/scripts/start.mjs"]);
} else {
  startProcess("web", ["apps/web/scripts/start.mjs"]);
}

function startProcess(name, args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...env
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      process.exit(code);
    }
  });
}
