/**
 * DonutSMP auction public API — https://donut.auction/api
 * Attribution required: link to donut.auction as data source.
 */

const API_BASE = "https://api.donut.auction/orders";
const STORAGE_KEY_ORDERS = "donutsmp_auction_orders_v1";
const STORAGE_KEY_FULL_FETCH = "donutsmp_auction_last_full_fetch_ms";

const btnFetchPage = document.getElementById("btnFetchPage");
const btnFetchAll = document.getElementById("btnFetchAll");
const fetchHint = document.getElementById("fetchHint");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const tbody = document.getElementById("tbody");
const stats = document.getElementById("stats");

/**
 * @typedef {object} Order
 * @property {{ itemId: string; enchantments: { name?: string; level?: number }[] }} item
 * @property {string} userName
 * @property {number} itemPrice
 * @property {number} amountOrdered
 * @property {number} amountDelivered
 * @property {string} expirationDate
 * @property {string} lastUpdated
 */

/** @type {Order[]} */
let orders = [];

function loadCachedOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      orders = parsed;
      render();
      setHint("キャッシュを表示しています。更新するには取得ボタンを押してください。");
    }
  } catch {
    /* ignore */
  }
}

function saveOrders() {
  try {
    localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
  } catch {
    /* quota */
  }
}

function lastFullFetchMs() {
  const v = localStorage.getItem(STORAGE_KEY_FULL_FETCH);
  return v ? parseInt(v, 10) : 0;
}

function setLastFullFetchNow() {
  localStorage.setItem(STORAGE_KEY_FULL_FETCH, String(Date.now()));
}

const FULL_FETCH_COOLDOWN_MS = 30 * 60 * 1000;

function canFullFetch() {
  const last = lastFullFetchMs();
  if (!last) return { ok: true, waitSec: 0 };
  const elapsed = Date.now() - last;
  if (elapsed >= FULL_FETCH_COOLDOWN_MS) return { ok: true, waitSec: 0 };
  return { ok: false, waitSec: Math.ceil((FULL_FETCH_COOLDOWN_MS - elapsed) / 1000) };
}

/**
 * @param {string} cursor
 * @returns {Promise<{ orders: unknown[]; nextCursor: string | null }>}
 */
async function fetchPage(cursor = "") {
  const url = new URL(API_BASE);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function setHint(text) {
  fetchHint.textContent = text;
}

function setLoading(loading) {
  btnFetchPage.disabled = loading;
  btnFetchAll.disabled = loading;
}

/**
 * @param {unknown} o
 * @returns {o is { item?: { itemId?: string; enchantments?: { name?: string; level?: number }[] }; userName?: string; itemPrice?: number; amountOrdered?: number; amountDelivered?: number; expirationDate?: string; lastUpdated?: string }}
 */
function isOrderShape(o) {
  return o !== null && typeof o === "object";
}

function normalizeOrder(o) {
  if (!isOrderShape(o)) return null;
  const item = o.item && typeof o.item === "object" ? o.item : {};
  const itemId = typeof item.itemId === "string" ? item.itemId : "";
  const enchantments = Array.isArray(item.enchantments) ? item.enchantments : [];
  return {
    item: { itemId, enchantments },
    userName: typeof o.userName === "string" ? o.userName : "",
    itemPrice: typeof o.itemPrice === "number" ? o.itemPrice : 0,
    amountOrdered: typeof o.amountOrdered === "number" ? o.amountOrdered : 0,
    amountDelivered: typeof o.amountDelivered === "number" ? o.amountDelivered : 0,
    expirationDate: typeof o.expirationDate === "string" ? o.expirationDate : "",
    lastUpdated: typeof o.lastUpdated === "string" ? o.lastUpdated : "",
  };
}

async function fetchOnePageReplace() {
  setLoading(true);
  setHint("取得中…");
  try {
    const data = await fetchPage("");
    const list = Array.isArray(data.orders) ? data.orders.map(normalizeOrder).filter(Boolean) : [];
    orders = list;
    saveOrders();
    setHint(`1ページ取得完了（${orders.length} 件）。`);
    render();
  } catch (e) {
    console.error(e);
    setHint(
      e instanceof Error && e.message.includes("Failed to fetch")
        ? "取得に失敗しました（CORSやネットワークの可能性）。ローカルサーバーで開いて再試行してください。"
        : `エラー: ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    setLoading(false);
  }
}

async function fetchAllPages() {
  const gate = canFullFetch();
  if (!gate.ok) {
    const m = Math.floor(gate.waitSec / 60);
    const s = gate.waitSec % 60;
    setHint(`全ページ取得は約 ${m}分${s}秒後に再試行できます（APIの推奨）。`);
    return;
  }
  if (!confirm("全ページを順に取得します。APIの案内では全ページは30分に1回までです。続けますか？")) return;

  setLoading(true);
  setHint("全ページ取得中…");
  const acc = [];
  let cursor = "";
  try {
    for (;;) {
      const data = await fetchPage(cursor);
      const list = Array.isArray(data.orders) ? data.orders.map(normalizeOrder).filter(Boolean) : [];
      acc.push(...list);
      const next = data.nextCursor;
      if (!next || typeof next !== "string") break;
      cursor = next;
    }
    orders = acc;
    setLastFullFetchNow();
    saveOrders();
    setHint(`全 ${orders.length} 件を取得しました。`);
    render();
  } catch (e) {
    console.error(e);
    setHint(e instanceof Error ? e.message : String(e));
  } finally {
    setLoading(false);
  }
}

function remaining(order) {
  return Math.max(0, order.amountOrdered - order.amountDelivered);
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatPrice(n) {
  return n.toLocaleString("ja-JP");
}

function filterOrders(list, q) {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((o) => {
    const id = o.item.itemId.toLowerCase();
    const user = o.userName.toLowerCase();
    const ench = o.item.enchantments
      .map((e) => (typeof e.name === "string" ? e.name : "").toLowerCase())
      .join(" ");
    return id.includes(t) || user.includes(t) || ench.includes(t);
  });
}

function sortOrders(list, mode) {
  const copy = [...list];
  switch (mode) {
    case "price-asc":
      copy.sort((a, b) => a.itemPrice - b.itemPrice);
      break;
    case "price-desc":
      copy.sort((a, b) => b.itemPrice - a.itemPrice);
      break;
    case "remaining-desc":
      copy.sort((a, b) => remaining(b) - remaining(a));
      break;
    case "updated-desc":
      copy.sort((a, b) => {
        const ta = new Date(a.lastUpdated).getTime();
        const tb = new Date(b.lastUpdated).getTime();
        return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
      });
      break;
    default:
      break;
  }
  return copy;
}

function render() {
  const q = searchInput.value;
  const mode = sortSelect.value;
  let rows = filterOrders(orders, q);
  rows = sortOrders(rows, mode);

  stats.innerHTML =
    orders.length === 0
      ? ""
      : `表示 <strong>${rows.length}</strong> / 保持 <strong>${orders.length}</strong> 件` +
        (q.trim() ? `（検索: "${escapeHtml(q.trim())}"）` : "");

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr class="table__empty"><td colspan="6">' +
      (orders.length === 0 ? "データがありません。取得ボタンで読み込んでください。" : "条件に一致する注文がありません。") +
      "</td></tr>";
    return;
  }

  tbody.innerHTML = rows
    .map(
      (o) => `
    <tr>
      <td><span class="item-id">${escapeHtml(o.item.itemId)}</span></td>
      <td>${enchCell(o)}</td>
      <td>${escapeHtml(o.userName)}</td>
      <td class="num"><span class="price-tag">${formatPrice(o.itemPrice)}</span></td>
      <td class="num">${o.amountDelivered} / ${o.amountOrdered}</td>
      <td>${escapeHtml(formatDate(o.expirationDate))}</td>
    </tr>`
    )
    .join("");
}

function enchCell(o) {
  const en = o.item.enchantments;
  if (!en.length) return "—";
  const items = en
    .map((e) => {
      const n = typeof e.name === "string" ? e.name : "";
      const lv = typeof e.level === "number" ? e.level : "";
      if (!n) return "";
      const label = lv !== "" ? `${n} ${lv}` : n;
      return `<li>${escapeHtml(label)}</li>`;
    })
    .filter(Boolean)
    .join("");
  return `<ul class="ench-list">${items}</ul>`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

btnFetchPage.addEventListener("click", () => fetchOnePageReplace());
btnFetchAll.addEventListener("click", () => fetchAllPages());
searchInput.addEventListener("input", () => render());
sortSelect.addEventListener("change", () => render());

loadCachedOrders();
