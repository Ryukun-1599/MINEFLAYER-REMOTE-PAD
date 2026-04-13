/* global nipplejs */

(function () {
  const MOVE_DEAD = 0.22;
  const LOOK_SENS = 2.35;

  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    sneak: false,
  };

  let sprintToggle = false;
  let ws = null;
  let needAuth = false;
  let lookRaf = 0;
  let pendingLook = { dy: 0, dp: 0 };

  const el = {
    authGate: document.getElementById("authGate"),
    app: document.getElementById("app"),
    authToken: document.getElementById("authToken"),
    authBtn: document.getElementById("authBtn"),
    wsDot: document.getElementById("wsDot"),
    statusText: document.getElementById("statusText"),
    zoneMove: document.getElementById("zoneMove"),
    zoneLook: document.getElementById("zoneLook"),
    btnJump: document.getElementById("btnJump"),
    btnAttack: document.getElementById("btnAttack"),
    btnUse: document.getElementById("btnUse"),
    btnSneak: document.getElementById("btnSneak"),
    btnSprint: document.getElementById("btnSprint"),
    hotbarRow: document.getElementById("hotbarRow"),
    chatInput: document.getElementById("chatInput"),
    chatSend: document.getElementById("chatSend"),
    tapAttack: document.getElementById("tapAttack"),
  };

  let activeSlot = 0;

  function setDot(kind) {
    el.wsDot.className = "bar__dot";
    if (kind === "ok") el.wsDot.classList.add("bar__dot--ok");
    else if (kind === "warn") el.wsDot.classList.add("bar__dot--warn");
    else if (kind === "bad") el.wsDot.classList.add("bar__dot--bad");
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function flushControls() {
    send({
      type: "controls",
      keys: {
        forward: keys.forward,
        back: keys.back,
        left: keys.left,
        right: keys.right,
        jump: keys.jump,
        sprint: keys.sprint || sprintToggle,
        sneak: keys.sneak,
      },
    });
  }

  function flushLookDelta() {
    if (pendingLook.dy === 0 && pendingLook.dp === 0) return;
    send({ type: "lookDelta", dy: pendingLook.dy, dp: pendingLook.dp });
    pendingLook.dy = 0;
    pendingLook.dp = 0;
  }

  function scheduleLookFlush() {
    if (lookRaf) return;
    lookRaf = requestAnimationFrame(() => {
      lookRaf = 0;
      flushLookDelta();
    });
  }

  function applyMoveVector(x, y) {
    keys.forward = y < -MOVE_DEAD;
    keys.back = y > MOVE_DEAD;
    keys.left = x < -MOVE_DEAD;
    keys.right = x > MOVE_DEAD;
    flushControls();
  }

  function resetMove() {
    keys.forward = false;
    keys.back = false;
    keys.left = false;
    keys.right = false;
    flushControls();
  }

  function buildHotbar() {
    el.hotbarRow.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (i === activeSlot ? " slot--active" : "");
      b.textContent = String(i + 1);
      b.dataset.slot = String(i);
      b.addEventListener("click", () => {
        activeSlot = i;
        send({ type: "slot", slot: i });
        buildHotbar();
      });
      el.hotbarRow.appendChild(b);
    }
  }

  function connectSocket() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onopen = () => {
      setDot("warn");
      el.statusText.textContent = "WebSocket 接続済み";
      if (needAuth) {
        const token = el.authToken.value.trim();
        ws.send(JSON.stringify({ type: "auth", token }));
      }
    };

    ws.onclose = () => {
      setDot("bad");
      el.statusText.textContent = "切断されました。ページを再読み込みしてください。";
    };

    ws.onerror = () => {
      setDot("bad");
      el.statusText.textContent = "接続エラー";
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "hello") {
        if (msg.needAuth) {
          needAuth = true;
          el.authGate.classList.remove("hidden");
          el.app.classList.add("hidden");
        } else {
          ensureNippleAfterVisible();
        }
        el.statusText.textContent = `MC: ${msg.mcHost}:${msg.mcPort} / ${msg.username}`;
      }
      if (msg.type === "auth_ok") {
        el.authGate.classList.add("hidden");
        el.app.classList.remove("hidden");
        setDot("ok");
        ensureNippleAfterVisible();
      }
      if (msg.type === "auth_fail") {
        el.statusText.textContent = "認証に失敗しました";
      }
      if (msg.type === "spawn") {
        setDot("ok");
        el.statusText.textContent = "ボットがワールドにいます";
      }
      if (msg.type === "status") {
        if (msg.state === "error") el.statusText.textContent = `エラー: ${msg.message || ""}`;
        if (msg.state === "kicked") el.statusText.textContent = `キック: ${msg.reason || ""}`;
        if (msg.state === "ended") el.statusText.textContent = `終了: ${msg.reason || ""}`;
        if (msg.state === "spawned") {
          setDot("ok");
          el.statusText.textContent = "スポーンしました";
        }
      }
    };
  }

  let nippleInited = false;

  function setupNipple() {
    if (nippleInited) return;
    if (typeof nipplejs === "undefined") {
      el.statusText.textContent += "（nipplejs 未読込: スティック無効）";
      return;
    }
    nippleInited = true;

    const joyMove = nipplejs.create({
      zone: el.zoneMove,
      mode: "static",
      position: { left: "50%", top: "50%" },
      color: "rgba(91, 159, 212, 0.55)",
      size: 100,
    });

    joyMove.on("move", (_evt, data) => {
      const v = data.vector || { x: 0, y: 0 };
      applyMoveVector(v.x, v.y);
    });
    joyMove.on("end", () => resetMove());

    const joyLook = nipplejs.create({
      zone: el.zoneLook,
      mode: "static",
      position: { left: "50%", top: "50%" },
      color: "rgba(232, 179, 57, 0.5)",
      size: 100,
    });

    joyLook.on("move", (_evt, data) => {
      const v = data.vector || { x: 0, y: 0 };
      const force = typeof data.force === "number" ? Math.min(1, data.force / 50) : 0.5;
      const scale = LOOK_SENS * 0.012 * (0.4 + force);
      pendingLook.dy += -v.x * scale;
      pendingLook.dp += v.y * scale;
      scheduleLookFlush();
    });
  }

  function ensureNippleAfterVisible() {
    requestAnimationFrame(() => {
      setupNipple();
    });
  }

  function bindButtons() {
    const jumpDown = () => {
      send({ type: "jump" });
    };
    el.btnJump.addEventListener("click", jumpDown);

    el.btnAttack.addEventListener("click", () => send({ type: "attack" }));
    el.btnUse.addEventListener("click", () => send({ type: "use" }));

    const sneakOn = () => {
      keys.sneak = true;
      flushControls();
    };
    const sneakOff = () => {
      keys.sneak = false;
      flushControls();
    };
    el.btnSneak.addEventListener("touchstart", (e) => {
      e.preventDefault();
      sneakOn();
    });
    el.btnSneak.addEventListener("touchend", sneakOff);
    el.btnSneak.addEventListener("touchcancel", sneakOff);
    el.btnSneak.addEventListener("mousedown", sneakOn);
    el.btnSneak.addEventListener("mouseup", sneakOff);
    el.btnSneak.addEventListener("mouseleave", sneakOff);

    el.btnSprint.addEventListener("click", () => {
      sprintToggle = !sprintToggle;
      el.btnSprint.setAttribute("aria-pressed", sprintToggle ? "true" : "false");
      flushControls();
    });
  }

  function bindKeyboard() {
    const map = {
      KeyW: "forward",
      KeyS: "back",
      KeyA: "left",
      KeyD: "right",
      Space: "jump",
      ShiftLeft: "sneak",
      ShiftRight: "sneak",
      ControlLeft: "sprint",
      ControlRight: "sprint",
    };

    window.addEventListener("keydown", (e) => {
      if (e.target === el.chatInput) return;
      const k = map[e.code];
      if (k === "jump") {
        e.preventDefault();
        send({ type: "jump" });
        return;
      }
      if (k && keys[k] !== undefined && k !== "sprint") {
        e.preventDefault();
        keys[k] = true;
        flushControls();
      }
      if ((e.code === "ControlLeft" || e.code === "ControlRight") && map[e.code] === "sprint") {
        keys.sprint = true;
        flushControls();
      }
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        const slot = parseInt(e.code.replace("Digit", ""), 10) - 1;
        activeSlot = slot;
        send({ type: "slot", slot });
        buildHotbar();
      }
      if (e.code === "KeyF") {
        e.preventDefault();
        send({ type: "attack" });
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.target === el.chatInput) return;
      const k = map[e.code];
      if (k && keys[k] !== undefined && k !== "jump") {
        keys[k] = false;
        flushControls();
      }
      if (e.code === "ControlLeft" || e.code === "ControlRight") {
        keys.sprint = false;
        flushControls();
      }
    });
  }

  /** 右パネル: マウスドラッグで視点 */
  function bindMouseLook() {
    const zone = el.zoneLook;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    zone.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      pendingLook.dy += -dx * 0.0045;
      pendingLook.dp += dy * 0.0045;
      scheduleLookFlush();
    });
  }

  el.tapAttack.addEventListener("click", () => send({ type: "attack" }));

  el.chatSend.addEventListener("click", () => {
    const t = el.chatInput.value.trim();
    if (!t) return;
    send({ type: "chat", text: t });
    el.chatInput.value = "";
  });

  el.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.chatSend.click();
    }
  });

  el.authBtn.addEventListener("click", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "auth", token: el.authToken.value.trim() }));
    } else {
      connectSocket();
    }
  });

  buildHotbar();
  bindButtons();
  bindKeyboard();
  bindMouseLook();
  connectSocket();
})();
