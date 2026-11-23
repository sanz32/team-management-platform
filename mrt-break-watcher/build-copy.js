"use strict";

const fs = require("fs");

const target = process.platform === "win32" ? "mrt-break-watcher.exe" : "mrt-break-watcher";
fs.copyFileSync(process.execPath, target);
console.log(`Copiado ${process.execPath} -> ${target}`);
