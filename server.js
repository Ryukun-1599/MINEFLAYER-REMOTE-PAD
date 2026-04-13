/**
 * Mineflayer bot controlled via WebSocket from web UI (virtual pad / keyboard).
 * Set MC_HOST, MC_PORT, MC_USERNAME (optional: MC_VERSION, MC_AUTH, PAD_TOKEN).
 */
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const mineflayer = require("mineflayer");

const PORT = parseInt(process.env.PAD_HTTP_PORT || "3847", 10);
const PAD_TOKEN = process.env.PAD_TOKEN || "";

const MC_HOST = process.env.MC_HOST || "localhost";
const MC_PORT = parseInt(process.env.MC_PORT || "25565", 10);
const MC_USERNAME = process.env.MC_USERNAME || "RemotePad";
const MC_VERSION = process.env.MC_VERSION || undefined;
const MC_AUTH = process.env.MC_AUTH || "offline";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** @type {import('mineflayer').Bot | null} */
let bot = null;

const controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  sneak: false,
};

let jumpReleaseTimer = null;

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(s);
  }
}

function applyControlStates() {
  if (!bot || !bot.entity) return;
  const keys = ["forward", "back", "left", "right", "jump", "sprint", "sneak"];
  for (const k of keys) {
    try {
      bot.setControlState(k, !!controls[k]);
    } catch {
      /* ignore */
    }
  }
}

function pulseJump() {
  if (jumpReleaseTimer) clearTimeout(jumpReleaseTimer);
  controls.jump = true;
  applyControlStates();
  jumpReleaseTimer = setTimeout(() => {
    controls.jump = false;
    jumpReleaseTimer = null;
    applyControlStates();
  }, 140);
}

async function doAttack() {
  if (!bot || !bot.entity) return;
  try {
    const entity = bot.entityAtCursor(4);
    if (entity) {
      bot.attack(entity);
      return;
    }
    const block = bot.blockAtCursor(5);
    if (block && block.name !== "air" && block.name !== "cave_air" && block.name !== "void_air") {
      await bot.dig(block).catch(() => {});
    }
  } catch (e) {
    broadcast({ type: "log", level: "warn", text: String(e && e.message ? e.message : e) });
  }
}

function doUse() {
  if (!bot || !bot.entity) return;
  try {
    bot.activateItem();
  } catch (e) {
    broadcast({ type: "log", level: "warn", text: String(e && e.message ? e.message : e) });
  }
}

function connectBot() {
  if (bot) {
    try {
      bot.quit("reconnect");
    } catch {
      /* */
    }
    bot = null;
  }

  const opts = {
    host: MC_HOST,
    port: MC_PORT,
    username: MC_USERNAME,
    auth: MC_AUTH,
  };
  if (MC_VERSION) opts.version = MC_VERSION;

  bot = mineflayer.createBot(opts);

  bot.on("login", () => {
    broadcast({ type: "status", state: "login", username: bot.username });
  });

  bot.on("spawn", () => {
    broadcast({
      type: "spawn",
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch,
      pos: bot.entity.position,
    });
    broadcast({ type: "status", state: "spawned" });
  });

  bot.on("end", (reason) => {
    broadcast({ type: "status", state: "ended", reason: String(reason || "") });
    bot = null;
  });

  bot.on("kicked", (reason) => {
    broadcast({ type: "status", state: "kicked", reason: String(reason) });
  });

  bot.on("error", (err) => {
    broadcast({ type: "status", state: "error", message: err.message });
  });

  bot.on("messagestr", (message) => {
    broadcast({ type: "chat", text: message });
  });
}

function handleMessage(ws, data) {
  if (data.type === "controls" && data.keys && typeof data.keys === "object") {
    const k = data.keys;
    for (const name of ["forward", "back", "left", "right", "sprint", "sneak"]) {
      if (typeof k[name] === "boolean") controls[name] = k[name];
    }
    if (typeof k.jump === "boolean") {
      controls.jump = k.jump;
    }
    applyControlStates();
    return;
  }

  if (data.type === "jump") {
    pulseJump();
    return;
  }

  if (data.type === "lookDelta" && bot && bot.entity) {
    const dy = Number(data.dy) || 0;
    const dp = Number(data.dp) || 0;
    const pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, bot.entity.pitch + dp));
    bot.look(bot.entity.yaw + dy, pitch, true);
    return;
  }

  if (data.type === "look" && bot && bot.entity) {
    const yaw = Number(data.yaw);
    const pitch = Number(data.pitch);
    if (Number.isFinite(yaw) && Number.isFinite(pitch)) {
      const p = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      bot.look(yaw, p, true);
    }
    return;
  }

  if (data.type === "attack") {
    void doAttack();
    return;
  }

  if (data.type === "use") {
    doUse();
    return;
  }

  if (data.type === "chat" && data.text) {
    const t = String(data.text).slice(0, 256);
    if (bot) bot.chat(t);
    return;
  }

  if (data.type === "slot" && bot) {
    const slot = parseInt(data.slot, 10);
    if (slot >= 0 && slot <= 8) bot.setQuickBarSlot(slot);
  }
}

wss.on("connection", (ws) => {
  let authed = !PAD_TOKEN;

  ws.send(
    JSON.stringify({
      type: "hello",
      needAuth: !!PAD_TOKEN,
      mcHost: MC_HOST,
      mcPort: MC_PORT,
      username: MC_USERNAME,
    })
  );

  if (bot && bot.entity) {
    ws.send(
      JSON.stringify({
        type: "spawn",
        yaw: bot.entity.yaw,
        pitch: bot.entity.pitch,
        pos: bot.entity.position,
      })
    );
  }

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (!authed) {
      if (data.type === "auth" && data.token === PAD_TOKEN) {
        authed = true;
        ws.send(JSON.stringify({ type: "auth_ok" }));
      } else {
        ws.send(JSON.stringify({ type: "auth_fail" }));
        ws.close();
      }
      return;
    }

    handleMessage(ws, data);
  });

  ws.on("close", () => {
    for (const k of Object.keys(controls)) {
      controls[k] = false;
    }
    applyControlStates();
  });
});

setInterval(() => applyControlStates(), 40);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Remote pad: http://0.0.0.0:${PORT}`);
  console.log(`→ Minecraft ${MC_HOST}:${MC_PORT} as ${MC_USERNAME} (${MC_AUTH})`);
  if (PAD_TOKEN) console.log("PAD_TOKEN is set (clients must auth).");
  connectBot();
});
