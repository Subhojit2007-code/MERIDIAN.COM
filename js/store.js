// Meridian storefront state: cart, wishlist, header badges and toasts.
// All state lives in localStorage and is namespaced with meridian_*_v1.
// Money is handled as whole paise; the free-shipping threshold comes from the
// catalogue settings so the admin console can adjust it for display.

const CART_KEY = "meridian_cart_v1";
const WISHLIST_KEY = "meridian_wishlist_v1";
const NAME_KEY = "meridian_name_v1";

const SHIPPING_FLAT = 9900; // paise (₹99), mirrors functions/catalog.ts
const MAX_QUANTITY = 99;

function freeShippingThreshold() {
  try { return getCatalogSettings().freeShippingThreshold; } catch { return 500000; }
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/unavailable */ }
}

// --- Cart ------------------------------------------------------------------
// A cart key is the product id, optionally followed by the chosen variant
// options so different variants of one product stay on separate lines:
//   "meridian-tee"                             (no variants)
//   "meridian-tee::colour=Olive|size=M"        (variant line, values encoded)
// Legacy carts keyed by a bare product id still parse and work unchanged.
const VARIANT_SEP = "::";
const VARIANT_OPT_SEP = "|";

function variantCartKey(id, options) {
  const parts = [];
  if (options && typeof options === "object") {
    for (const gid of Object.keys(options)) {
      const val = options[gid];
      if (val == null || String(val).trim() === "") continue;
      parts.push(encodeURIComponent(gid) + "=" + encodeURIComponent(String(val)));
    }
  }
  return parts.length ? id + VARIANT_SEP + parts.join(VARIANT_OPT_SEP) : id;
}
function parseCartKey(key) {
  const s = String(key);
  const i = s.indexOf(VARIANT_SEP);
  if (i < 0) return { id: s, options: {} };
  const id = s.slice(0, i);
  const options = {};
  s.slice(i + VARIANT_SEP.length).split(VARIANT_OPT_SEP).forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf("=");
    if (eq < 0) return;
    try { options[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1)); }
    catch { /* ignore malformed pair */ }
  });
  return { id, options };
}

// Full option selection for a product: the caller's picks, defaulting to the
// first choice of any group the product offers that the caller didn't specify.
function resolveSelection(product, options) {
  const groups = productVariantGroups(product);
  if (!groups.length) return {};
  const sel = {};
  for (const g of groups) {
    const pick = options && options[g.id] != null ? String(options[g.id]) : "";
    sel[g.id] = g.options.includes(pick) ? pick : g.options[0];
  }
  return sel;
}

// Human label for a selection, e.g. "Colour: Slate Blue · Size: M".
function variantLabel(product, options) {
  const bits = [];
  for (const g of productVariantGroups(product)) {
    const v = options && options[g.id];
    if (v != null && String(v).trim()) bits.push(g.name + ": " + v);
  }
  return bits.join(" · ");
}

function readCart() {
  const raw = readJSON(CART_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}
function writeCart(cart) { writeJSON(CART_KEY, cart); updateHeaderBadges(); }

// Cart entries with the product resolved; unknown ids are dropped. Each entry
// carries its full cart key, the parsed variant options and a display label.
function cartEntries() {
  const cart = readCart();
  const out = [];
  for (const key of Object.keys(cart)) {
    const qty = cart[key];
    if (!Number.isInteger(qty) || qty < 1) continue;
    const parsed = parseCartKey(key);
    const p = getProduct(parsed.id);
    if (!p) continue;
    out.push({ key, product: p, quantity: qty, options: parsed.options, variantLabel: variantLabel(p, parsed.options) });
  }
  return out;
}
function cartCount() { return cartEntries().reduce((n, e) => n + e.quantity, 0); }
function cartSubtotal() { return cartEntries().reduce((sum, e) => sum + priceOf(e.product) * e.quantity, 0); }

function addToCart(id, qty, options) {
  const p = getProduct(id);
  if (!p) return 0;
  const stock = productStock(p);
  if (stock === 0) return 0;
  const min = productMinQty(p);
  let n = Number.isInteger(qty) ? qty : 1;
  if (n < min) n = min;
  const key = variantCartKey(p.id, resolveSelection(p, options));
  const cart = readCart();
  // Stock is shared across every variant line of the same product.
  const baseTotal = Object.keys(cart).reduce((s, k) => s + (parseCartKey(k).id === id ? (cart[k] || 0) : 0), 0);
  const cap = Math.min(MAX_QUANTITY, stock == null ? MAX_QUANTITY : Math.max(0, stock - baseTotal));
  const added = Math.min(n, cap);
  if (added <= 0) return cart[key] || 0;
  cart[key] = Math.min(MAX_QUANTITY, (cart[key] || 0) + added);
  writeCart(cart);
  return cart[key];
}
function setQty(key, qty) {
  const cart = readCart();
  const n = Number.isInteger(qty) ? qty : 0;
  if (n <= 0) delete cart[key];
  else cart[key] = Math.min(MAX_QUANTITY, n);
  writeCart(cart);
}
function removeFromCart(key) { setQty(key, 0); }
function clearCart() { writeJSON(CART_KEY, {}); updateHeaderBadges(); }

// --- Wishlist --------------------------------------------------------------
function readWishlist() {
  const list = readJSON(WISHLIST_KEY, []);
  return Array.isArray(list) ? list : [];
}
function inWishlist(id) { return readWishlist().includes(id); }
function toggleWishlist(id) {
  let list = readWishlist();
  const now = !list.includes(id);
  list = now ? list.concat([id]) : list.filter((x) => x !== id);
  writeJSON(WISHLIST_KEY, list);
  updateHeaderBadges();
  return now;
}
function wishlistCount() { return readWishlist().length; }

// --- Header badges ---------------------------------------------------------
function updateHeaderBadges() {
  const c = cartCount();
  const w = wishlistCount();
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(c);
    el.setAttribute("data-count", String(c));
  });
  document.querySelectorAll("[data-wishlist-count]").forEach((el) => {
    el.textContent = String(w);
    el.setAttribute("data-count", String(w));
  });
}

// --- Toast -----------------------------------------------------------------
function toast(msg) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2200);
}

// --- Accounts & session (client-side demo auth) ----------------------------
// No server accounts exist; credentials are stored in this browser only and
// passwords are kept as a salted SHA-256 hash (never plaintext).
const ACCOUNTS_KEY = "meridian_accounts_v1";
const SESSION_KEY = "meridian_session_v1";

function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }

// Live password rules, driven by the admin-configurable policy. Defaults match
// the original rule set: >8 chars, one uppercase letter, one special character.
function currentPolicy() {
  try { return getPasswordPolicy(); } catch { return { minLength: 9, requireUpper: true, requireSpecial: true, requireNumber: false }; }
}
function passwordChecks(pw) {
  const s = String(pw || "");
  const p = currentPolicy();
  const min = Number.isFinite(p.minLength) ? p.minLength : 9;
  const out = { length: s.length >= min };
  if (p.requireUpper) out.upper = /[A-Z]/.test(s);
  if (p.requireSpecial) out.special = /[^A-Za-z0-9]/.test(s);
  if (p.requireNumber) out.number = /[0-9]/.test(s);
  return out;
}
// Human-readable labels for each active requirement, in display order.
function passwordRequirementLabels() {
  const p = currentPolicy();
  const min = Number.isFinite(p.minLength) ? p.minLength : 9;
  const items = [{ key: "length", label: `At least ${min} characters` }];
  if (p.requireUpper) items.push({ key: "upper", label: "One uppercase letter (A–Z)" });
  if (p.requireSpecial) items.push({ key: "special", label: "One special character (@, #, $, …)" });
  if (p.requireNumber) items.push({ key: "number", label: "One number (0–9)" });
  return items;
}
function passwordValid(pw) {
  const c = passwordChecks(pw);
  return Object.keys(c).every((k) => c[k]);
}

function getAccounts() {
  const a = readJSON(ACCOUNTS_KEY, {});
  return a && typeof a === "object" && !Array.isArray(a) ? a : {};
}
function findAccount(email) { return getAccounts()[normalizeEmail(email)] || null; }

function randomSalt() {
  if (globalThis.crypto && crypto.getRandomValues) {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2);
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(salt + "::" + password);
  if (globalThis.crypto && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for non-secure contexts (demo only; not cryptographically strong).
  const s = salt + "::" + password;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return "fb" + (h >>> 0).toString(16);
}

async function createAccount(email, password, name) {
  const key = normalizeEmail(email);
  const accounts = getAccounts();
  if (accounts[key]) return { ok: false, code: "exists" };
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  accounts[key] = { email: key, name: name || "", salt, hash, createdAt: new Date().toISOString() };
  writeJSON(ACCOUNTS_KEY, accounts);
  setSession(key);
  return { ok: true, account: accounts[key] };
}

async function verifyAccount(email, password) {
  const acc = findAccount(email);
  if (!acc) return { ok: false, code: "no_account" };
  const hash = await hashPassword(password, acc.salt);
  if (hash !== acc.hash) return { ok: false, code: "bad_password" };
  setSession(acc.email);
  return { ok: true, account: acc };
}

function getSession() {
  try { return localStorage.getItem(SESSION_KEY) || null; } catch { return null; }
}
function setSession(email) {
  try { localStorage.setItem(SESSION_KEY, normalizeEmail(email)); } catch { /* ignore */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
function currentAccount() {
  const s = getSession();
  return s ? findAccount(s) : null;
}

// --- Orders (shared local history used by storefront + admin) --------------
// NOTE: the storage keys are used as literals (not global consts) so pages that
// declare their own ORDERS_KEY don't collide with this shared script.
// Fulfilment pipeline: Pending → Placed → Confirmed → Proceeded → Shipped →
// Delivered. Legacy values map forward ("Paid" → Placed, "Processing" →
// Proceeded) so older records keep counting in the right bucket.
const ORDER_STATUSES = ["Pending", "Placed", "Confirmed", "Proceeded", "Shipped", "Delivered", "Cancelled", "Refunded"];
const LEGACY_STATUS_MAP = { Paid: "Placed", Processing: "Proceeded" };
const REAL_ORDERS_KEY = "meridian_orders_v1";
const DEMO_ORDERS_KEY = "meridian_demo_orders_v1";
const DEMO_SEED_FLAG = "meridian_demo_seeded_v1";
// Statuses that count toward revenue (cancellations and refunds do not).
const REVENUE_STATUSES = ["Pending", "Placed", "Confirmed", "Proceeded", "Shipped", "Delivered"];

function readOrdersKey(key) {
  const o = readJSON(key, []);
  return Array.isArray(o) ? o : [];
}
function writeOrdersKey(key, list) { writeJSON(key, Array.isArray(list) ? list.slice(0, 200) : []); }

// "09/10/2026, 10:30:45 am" (en-IN) → epoch ms; falls back to Date.parse.
function parseOrderDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(s || "").trim());
  if (m) {
    let h = parseInt(m[4], 10) % 12;
    if (/pm/i.test(m[7] || "")) h += 12;
    return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), h, parseInt(m[5], 10), parseInt(m[6] || "0", 10)).getTime();
  }
  const t = Date.parse(String(s || ""));
  return Number.isFinite(t) ? t : 0;
}
// "₹10,999" / "₹10,999.00" → whole paise.
function parseMoneyPaise(s) {
  const m = /([\d,]+(?:\.\d+)?)/.exec(String(s || "").replace(/₹/g, ""));
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
}
// Normalized view of a stored order: epoch ts, pipeline status, paise total.
function orderRecord(o) {
  if (!o || typeof o !== "object") return null;
  const ts = Number.isFinite(o.ts) ? o.ts : parseOrderDate(o.date);
  const status = LEGACY_STATUS_MAP[o.status] || (ORDER_STATUSES.includes(o.status) ? o.status : "Placed");
  const totalPaise = Number.isFinite(o.totalPaise) ? o.totalPaise : parseMoneyPaise(o.total);
  return Object.assign({}, o, { ts, status, totalPaise });
}
function getOrders() {
  return readOrdersKey(REAL_ORDERS_KEY).concat(readOrdersKey(DEMO_ORDERS_KEY))
    .map(orderRecord).filter(Boolean)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
function saveOrders(list) {
  writeOrdersKey(REAL_ORDERS_KEY, (Array.isArray(list) ? list : []).filter((o) => o && !o.demo).slice(0, 50));
}
function findOrder(id) { return getOrders().find((o) => o && o.id === id) || null; }
function mutateOrder(id, fn) {
  for (const key of [REAL_ORDERS_KEY, DEMO_ORDERS_KEY]) {
    const list = readOrdersKey(key);
    const o = list.find((x) => x && x.id === id);
    if (o) { fn(o); writeOrdersKey(key, list); return orderRecord(o); }
  }
  return null;
}
function updateOrderStatus(id, status) {
  return mutateOrder(id, (o) => { o.status = ORDER_STATUSES.includes(status) ? status : o.status; });
}
function deleteOrder(id) {
  for (const key of [REAL_ORDERS_KEY, DEMO_ORDERS_KEY]) {
    writeOrdersKey(key, readOrdersKey(key).filter((o) => o && o.id !== id));
  }
}
// Append a freshly placed order to the real (non-demo) history.
function addOrder(order) {
  const list = readOrdersKey(REAL_ORDERS_KEY);
  list.unshift(order);
  writeOrdersKey(REAL_ORDERS_KEY, list.slice(0, 50));
}

// --- Order bills (admin invoice numbers) ------------------------------------
// Each order that has had a bill generated gets a stable sequential invoice
// number plus a first-generated timestamp, so re-downloading a bill always
// shows the same number. Stored separately from orders so deleting an order
// or clearing demo history never renumbers existing invoices.
const BILLS_KEY = "meridian_bills_v1";
function readBills() { const b = readJSON(BILLS_KEY, []); return Array.isArray(b) ? b : []; }
function writeBills(list) { writeJSON(BILLS_KEY, (Array.isArray(list) ? list : []).slice(0, 200)); }
// Assign (once) the next sequential invoice number to an order.
function recordBill(orderId) {
  const list = readBills();
  const existing = list.find((b) => b && b.orderId === orderId);
  if (existing) return existing;
  const seq = list.reduce((m, b) => Math.max(m, (b && b.seq) || 0), 0) + 1;
  const rec = { orderId, seq, billNo: "INV-" + String(seq).padStart(5, "0"), generatedAt: Date.now() };
  list.push(rec);
  writeBills(list);
  return rec;
}

// --- Customers & sales analytics source -------------------------------------
function orderEmail(o) {
  const e = (o && o.customer && o.customer.email) || (o && o.email) || "";
  return normalizeEmail(e);
}
// Registered accounts plus every distinct customer email seen on an order.
function totalCustomers() {
  const set = new Set(Object.keys(getAccounts()));
  for (const o of getOrders()) {
    const e = orderEmail(o);
    if (e && e !== "guest") set.add(e);
  }
  return set.size;
}
function revenueOrders(list) {
  let revenue = 0, orders = 0;
  for (const o of list) {
    if (REVENUE_STATUSES.includes(o.status)) { revenue += o.totalPaise || 0; orders++; }
  }
  return { revenue, orders };
}
function ordersBetween(fromTs, toTs) { return getOrders().filter((o) => o.ts >= fromTs && o.ts < toTs); }

// --- Demo order history ------------------------------------------------------
// The analytics dashboard needs multi-year history to mean anything; a fresh
// device has none. A deterministic seeded history is stored separately
// (demo:true) so it can be cleared without touching real orders, and is only
// created once per browser.
function demoOrdersSeeded() { try { return localStorage.getItem(DEMO_SEED_FLAG) === "1"; } catch { return false; } }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DEMO_CUSTOMERS = [
  { email: "aanya.sharma@example.com", name: "Aanya Sharma" },
  { email: "rohan.mehta@example.com", name: "Rohan Mehta" },
  { email: "isha.iyer@example.com", name: "Isha Iyer" },
  { email: "kabir.nair@example.com", name: "Kabir Nair" },
  { email: "meera.pillai@example.com", name: "Meera Pillai" },
  { email: "arjun.rao@example.com", name: "Arjun Rao" },
  { email: "diya.bose@example.com", name: "Diya Bose" },
  { email: "vikram.sethi@example.com", name: "Vikram Sethi" },
  { email: "naina.kapoor@example.com", name: "Naina Kapoor" },
  { email: "aditya.gill@example.com", name: "Aditya Gill" },
  { email: "tara.dsouza@example.com", name: "Tara D'Souza" },
  { email: "neel.chandra@example.com", name: "Neel Chandra" },
];
// Older orders sit further down the fulfilment pipeline.
function demoStatusFor(rnd, ageDays) {
  const r = rnd();
  if (ageDays > 30) return r < 0.82 ? "Delivered" : r < 0.9 ? "Shipped" : r < 0.95 ? "Refunded" : "Cancelled";
  if (ageDays > 7) return r < 0.5 ? "Delivered" : r < 0.8 ? "Shipped" : r < 0.92 ? "Proceeded" : "Cancelled";
  if (ageDays > 2) return r < 0.35 ? "Shipped" : r < 0.65 ? "Proceeded" : r < 0.88 ? "Confirmed" : "Pending";
  return r < 0.4 ? "Confirmed" : r < 0.7 ? "Placed" : "Pending";
}
function seedDemoOrders() {
  if (demoOrdersSeeded()) return;
  const rnd = mulberry32(20261009);
  const now = new Date();
  const orders = [];
  const push = (d, status) => {
    const cust = DEMO_CUSTOMERS[Math.floor(rnd() * DEMO_CUSTOMERS.length)];
    const lines = 1 + Math.floor(rnd() * 3);
    let total = 0; const items = [];
    for (let i = 0; i < lines; i++) {
      const p = BASE_PRODUCTS[Math.floor(rnd() * BASE_PRODUCTS.length)];
      const q = 1 + Math.floor(rnd() * 2);
      items.push({ id: p.id, name: p.name, quantity: q, total: money(p.price * q) });
      total += p.price * q;
    }
    total += total >= freeShippingThreshold() ? 0 : SHIPPING_FLAT;
    orders.push({
      id: "Order demo-" + orders.length.toString(36) + "-" + Math.floor(rnd() * 1e6).toString(36),
      demo: true,
      ts: d.getTime(),
      date: d.toLocaleString("en-IN"),
      status,
      total: money(total),
      totalPaise: total,
      customer: { email: cust.email, name: cust.name },
      items,
    });
  };
  // Five calendar years of history with a gentle festive-season lift.
  for (let y = now.getFullYear() - 4; y <= now.getFullYear(); y++) {
    const months = y === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let m = 0; m < months; m++) {
      const lastDay = (y === now.getFullYear() && m === now.getMonth()) ? now.getDate() : new Date(y, m + 1, 0).getDate();
      const count = 1 + Math.floor(rnd() * 3) + (m >= 9 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const d = new Date(y, m, 1 + Math.floor(rnd() * lastDay), 9 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
        if (d.getTime() > now.getTime()) continue;
        push(d, demoStatusFor(rnd, (now.getTime() - d.getTime()) / 86400000));
      }
    }
  }
  // Guarantee activity "today" so the Today tile is never empty on a demo,
  // even when the dashboard is opened in the small hours.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayOffsets = [20 * 60000, 3 * 3600000, 6 * 3600000];
  const todayStatuses = ["Pending", "Placed", "Confirmed"];
  let todayPushed = 0;
  for (let k = 0; k < todayOffsets.length; k++) {
    const d = new Date(now.getTime() - todayOffsets[k]);
    if (d.getTime() >= dayStart) { push(d, todayStatuses[k]); todayPushed++; }
  }
  if (!todayPushed && now.getTime() - dayStart >= 5 * 60000) push(new Date(dayStart + 5 * 60000), "Pending");

  // Make sure every pipeline stage has visible volume in the demo history by
  // re-labelling some delivered orders (most recent first).
  const want = { Pending: 3, Placed: 4, Confirmed: 4, Proceeded: 4, Shipped: 5 };
  const countOf = (s) => orders.filter((o) => o.status === s).length;
  for (const s of Object.keys(want)) {
    let deficit = want[s] - countOf(s);
    for (let i = orders.length - 1; i >= 0 && deficit > 0; i--) {
      if (orders[i].status === "Delivered") { orders[i].status = s; deficit--; }
    }
  }

  writeOrdersKey(DEMO_ORDERS_KEY, orders);
  try { localStorage.setItem(DEMO_SEED_FLAG, "1"); } catch { /* ignore */ }
}
function clearDemoOrders() { writeOrdersKey(DEMO_ORDERS_KEY, []); }

// --- Customers (admin dashboard) --------------------------------------------
// A customer is a registered account or any distinct email seen on an order;
// guest checkouts are not identifiable people and are excluded.
function customerInitials(c) {
  const src = (c && c.name ? String(c.name).trim() : "") || String((c && c.email) || "").split("@")[0].replace(/[._-]+/g, " ");
  const words = src.split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words[1] ? words[1][0] : "")).toUpperCase();
}
// Stable hue per email so each customer logo keeps its colour across renders.
function customerHue(email) {
  let h = 0;
  const s = String(email || "");
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0) % 360;
}
function getCustomers() {
  const map = new Map();
  for (const email of Object.keys(getAccounts())) {
    const acc = getAccounts()[email];
    map.set(email, { email, name: acc.name || "", registered: true, joined: acc.createdAt ? Date.parse(acc.createdAt) : 0, orders: 0, spent: 0, firstOrder: 0, lastOrder: 0 });
  }
  for (const o of getOrders()) {
    const e = orderEmail(o);
    if (!e || e === "guest") continue;
    let c = map.get(e);
    if (!c) { c = { email: e, name: "", registered: false, joined: 0, orders: 0, spent: 0, firstOrder: 0, lastOrder: 0 }; map.set(e, c); }
    if (!c.name && o.customer && o.customer.name) c.name = o.customer.name;
    c.orders++;
    if (REVENUE_STATUSES.includes(o.status)) c.spent += o.totalPaise || 0;
    const ts = o.ts || 0;
    if (ts) {
      if (!c.firstOrder || ts < c.firstOrder) c.firstOrder = ts;
      if (ts > c.lastOrder) c.lastOrder = ts;
      if (!c.joined) c.joined = ts;
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.lastOrder || b.joined || 0) - (a.lastOrder || a.joined || 0));
}
// Removing a customer deletes their login account (if any) and every order
// attributed to their email, across both the real and demo histories.
function deleteCustomer(email) {
  const key = normalizeEmail(email);
  if (!key) return { accounts: 0, orders: 0 };
  const accounts = getAccounts();
  let accountsRemoved = 0;
  if (accounts[key]) { delete accounts[key]; writeJSON(ACCOUNTS_KEY, accounts); accountsRemoved = 1; }
  let ordersRemoved = 0;
  for (const k of [REAL_ORDERS_KEY, DEMO_ORDERS_KEY]) {
    const list = readOrdersKey(k);
    const kept = list.filter((o) => orderEmail(o) !== key);
    ordersRemoved += list.length - kept.length;
    writeOrdersKey(k, kept);
  }
  // A signed-in session for a deleted account must not survive.
  if (normalizeEmail(getSession()) === key) clearSession();
  return { accounts: accountsRemoved, orders: ordersRemoved };
}

document.addEventListener("DOMContentLoaded", updateHeaderBadges);
