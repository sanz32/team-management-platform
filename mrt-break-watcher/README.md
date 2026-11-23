# mrt-break-watcher

Small Node.js companion that tails the World of Warcraft `Chat.log` and notifies the portal
when a raid break is announced with the MRT add-on (for example `/break 15`), so the dashboard
switches from "Active" to "Break" automatically. The manual break button in the dashboard keeps
working without it.

It only reads the chat log file written by the game client (enabled in-game with `/chatlog`).

## Usage

```bash
cp .env.example .env   # fill in CHAT_LOG_PATH, PORTAL_URL and BREAK_SECRET
npm start
```

`BREAK_SECRET` must match the portal's `BREAK_WATCHER_SECRET`. Requests go to
`POST /api/activity/break` with the `x-break-secret` header.

## Standalone executable (Windows)

```bash
npm run build:exe
```

Builds `mrt-break-watcher.exe` using Node Single Executable Applications; place it next to a
filled-in `.env` file.
