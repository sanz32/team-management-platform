"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

let isSea = false;
try {
  isSea = require("node:sea").isSea();
} catch {
  isSea = false;
}
const baseDir = isSea ? path.dirname(process.execPath) : __dirname;

function loadDotEnv(envPath) {
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(baseDir, ".env"));

function fatal(message) {
  console.error(`[mrt-break-watcher] ${message}`);
  console.error("[mrt-break-watcher] Presioná ENTER para cerrar esta ventana.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("", () => {
    rl.close();
    process.exit(1);
  });
}

const CHAT_LOG_PATH = process.env.CHAT_LOG_PATH;
const PORTAL_URL = (process.env.PORTAL_URL || "https://portal.example.com").replace(/\/+$/, "");
const BREAK_SECRET = process.env.BREAK_SECRET;
const POLL_MS = Number(process.env.POLL_MS) || 2000;

const BREAK_MESSAGE_REGEX = process.env.BREAK_MESSAGE_REGEX
  ? new RegExp(process.env.BREAK_MESSAGE_REGEX, "i")
  : /\bbreak\b[^\d]{0,15}(\d+)/i;

let lastSize = 0;

function initPosition() {
  try {
    lastSize = fs.statSync(CHAT_LOG_PATH).size;
    console.log(`[mrt-break-watcher] Listo. Vigilando ${CHAT_LOG_PATH} desde el byte ${lastSize}.`);
  } catch (err) {
    fatal(`No se pudo abrir ${CHAT_LOG_PATH}: ${err.message}`);
    throw err;
  }
}

async function sendBreak(minutes) {
  try {
    const res = await fetch(`${PORTAL_URL}/api/activity/break`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-break-secret": BREAK_SECRET,
      },
      body: JSON.stringify({ minutes }),
    });
    if (res.ok) {
      console.log(`[mrt-break-watcher] Break de ${minutes} min avisado al portal.`);
    } else {
      const text = await res.text().catch(() => "");
      console.error(`[mrt-break-watcher] El portal respondió ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error("[mrt-break-watcher] No se pudo avisar al portal:", err.message);
  }
}

function checkForNewLines() {
  let stats;
  try {
    stats = fs.statSync(CHAT_LOG_PATH);
  } catch {
    return;
  }

  if (stats.size < lastSize) {
    lastSize = 0;
  }
  if (stats.size === lastSize) return;

  const start = lastSize;
  const end = stats.size - 1;
  lastSize = stats.size;

  const stream = fs.createReadStream(CHAT_LOG_PATH, { start, end, encoding: "utf8" });
  let chunk = "";
  stream.on("data", (data) => {
    chunk += data;
  });
  stream.on("error", (err) => {
    console.error("[mrt-break-watcher] Error leyendo el log:", err.message);
  });
  stream.on("end", () => {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const match = line.match(BREAK_MESSAGE_REGEX);
      if (!match) continue;
      const minutes = Number(match[1]);
      if (Number.isFinite(minutes) && minutes > 0) {
        console.log(`[mrt-break-watcher] Detectado: "${line.trim()}"`);
        sendBreak(minutes);
      }
    }
  });
}

function main() {
  initPosition();
  setInterval(checkForNewLines, POLL_MS);
  console.log("[mrt-break-watcher] Corriendo. Cerrá esta ventana para salir.");
}

if (!CHAT_LOG_PATH) {
  fatal("Falta CHAT_LOG_PATH en el archivo .env (ruta al Chat.log de WoW). Ver README.md.");
} else if (!BREAK_SECRET) {
  fatal("Falta BREAK_SECRET en el archivo .env (mismo valor que BREAK_WATCHER_SECRET del portal). Ver README.md.");
} else {
  main();
}
