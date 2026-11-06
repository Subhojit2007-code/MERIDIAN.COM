// Sitemap generator. Turns the live catalogue into the list of public storefront
// URLs a crawler should know about, then renders that list as sitemap XML,
// robots.txt or a CSV of URLs. Loaded by the admin console only.
//
// Everything is derived, never typed in: the URLs come from the categories and
// products the admin has actually saved, so the file cannot drift away from the
// store it describes.

const SITEMAP_HISTORY_KEY = "meridian_sitemap_history_v1";
const SITEMAP_HISTORY_MAX = 8;

// Pages that exist but are never handed to a crawler: they are per-session,
// per-customer or behind the admin lock, so listing them only wastes crawl
// budget and can put a sign-in form in search results.
const SITEMAP_EXCLUDED = [
  { path: "/html/admin.html", label: "Admin console" },
  { path: "/html/login.html", label: "Sign in / register" },
  { path: "/html/profile.html", label: "Customer profile" },
  { path: "/html/cart.html", label: "Cart" },
  { path: "/html/checkout-address.html", label: "Checkout — address" },
  { path: "/html/checkout-payment.html", label: "Checkout — payment" },
  { path: "/html/checkout-success.html", label: "Checkout — confirmation" },
  { path: "/html/checkout-cancel.html", label: "Checkout — cancelled" },
  { path: "/html/orders.html", label: "Order history" },
  { path: "/html/wishlist.html", label: "Wishlist" },
];

// The catalogue as the generator sees it. `model` is passed around explicitly so
// the copy shipped with the site can be built from the built-in defaults instead
// of whatever this browser happens to have saved.
function sitemapModel() {
  const s = getCatalogSettings();
  return {
    products: PRODUCTS,
    categories: s.categories,
    sitemap: s.sitemap,
    savedAt: getCatalogSavedAt(),
  };
}

function sitemapDefaultModel() {
  return {
    products: BASE_PRODUCTS,
    categories: BASE_CATEGORIES.slice(),
    sitemap: normalizeSitemap(null),
    savedAt: "",
  };
}

function sitemapBaseUrl(model) {
  const cfg = (model || sitemapModel()).sitemap || normalizeSitemap(null);
  const base = String(cfg.baseUrl || "").trim().replace(/\/+$/, "");
  return base || String(location.origin || "").replace(/\/+$/, "");
}

// Every URL worth indexing, in a stable order: home, then categories, then
// products. Paths are root-relative and unique; the base URL is applied only
// when the text is rendered, so one list feeds all three output formats.
function collectSitemapUrls(model) {
  const m = model || sitemapModel();
  const cfg = m.sitemap || normalizeSitemap(null);
  const lastmod = cfg.includeLastmod && m.savedAt ? m.savedAt.slice(0, 10) : "";
  const products = Array.isArray(m.products) ? m.products : [];
  const entries = [];
  const seen = new Set();

  function add(path, type, label, extra) {
    if (!path || seen.has(path)) return;
    seen.add(path);
    entries.push(Object.assign({
      path,
      type,
      label,
      lastmod,
      changefreq: cfg.changefreq[type] || "",
      priority: cfg.priority[type] || "",
    }, extra || {}));
  }

  if (cfg.includeHome) add("/", "home", "Home");
  if (cfg.includeCategories) {
    (Array.isArray(m.categories) ? m.categories : []).forEach((c) => {
      add("/?cat=" + encodeURIComponent(c), "category", c + " collection", {
        products: products.filter((p) => p.category === c).length,
      });
    });
  }
  if (cfg.includeProducts) {
    products.forEach((p) => {
      if (!p || !p.id) return;
      const soldOut = typeof p.stock === "number" && p.stock <= 0;
      if (soldOut && !cfg.includeOutOfStock) return;
      add("/html/product.html?id=" + encodeURIComponent(p.id), "product", p.name || p.id, {
        category: p.category || "",
        soldOut,
      });
    });
  }
  if (cfg.includeSearch) add("/html/search.html", "page", "Search results");
  return entries;
}

function sitemapStats(entries) {
  const byType = {};
  (entries || []).forEach((e) => { byType[e.type] = (byType[e.type] || 0) + 1; });
  return { total: (entries || []).length, byType };
}

function xmlEscape(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

function sitemapXml(entries, model) {
  const base = sitemapBaseUrl(model);
  const body = (entries || []).map((e) => [
    "  <url>",
    "    <loc>" + xmlEscape(base + e.path) + "</loc>",
    e.lastmod ? "    <lastmod>" + xmlEscape(e.lastmod) + "</lastmod>" : "",
    e.changefreq ? "    <changefreq>" + xmlEscape(e.changefreq) + "</changefreq>" : "",
    e.priority ? "    <priority>" + xmlEscape(e.priority) + "</priority>" : "",
    "  </url>",
  ].filter(Boolean).join("\n")).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + (body ? body + "\n" : "")
    + "</urlset>\n";
}

// The Disallow list mirrors SITEMAP_EXCLUDED so the robots file and the sitemap
// can never contradict each other.
function sitemapRobots(model) {
  const base = sitemapBaseUrl(model);
  const lines = ["User-agent: *", "Allow: /"];
  SITEMAP_EXCLUDED.forEach((x) => lines.push("Disallow: " + x.path));
  lines.push("", "Sitemap: " + base + "/sitemap.xml", "");
  return lines.join("\n");
}

function sitemapCsv(entries, model) {
  const base = sitemapBaseUrl(model);
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = (entries || []).map((e) => [base + e.path, e.type, e.label, e.lastmod, e.changefreq, e.priority].map(cell).join(","));
  return ["url,type,label,lastmod,changefreq,priority"].concat(rows).join("\n") + "\n";
}

// What the dashboard reports. Levels drive the icon and colour: "ok" means
// nothing needs doing, "info" is a consequence of a setting the admin chose,
// "warn" and "error" are things that would make a crawler drop the file.
function sitemapChecks(entries, model) {
  const m = model || sitemapModel();
  const cfg = m.sitemap || normalizeSitemap(null);
  const base = sitemapBaseUrl(m);
  const out = [];

  if (!base) {
    out.push({ level: "error", text: "No store address — set the base URL so every <loc> is absolute." });
  } else if (!/^https:\/\//i.test(base)) {
    out.push({ level: "warn", text: "The store address is not https (" + base + "). Search engines reject a sitemap that is not served over https." });
  } else if (/^https:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(base)) {
    out.push({ level: "warn", text: "The store address points at this computer, so no crawler can reach it." });
  }

  if (!entries || !entries.length) {
    out.push({ level: "error", text: "Nothing to list — every page type is switched off below." });
    return out;
  }

  const empty = (m.categories || []).filter((c) => !(m.products || []).some((p) => p && p.category === c));
  if (cfg.includeCategories && empty.length) {
    out.push({ level: "warn", text: empty.length + " listed collection" + (empty.length === 1 ? " has" : "s have") + " no products: " + empty.join(", ") + "." });
  }

  const soldOut = entries.filter((e) => e.soldOut).length;
  if (soldOut) {
    out.push({
      level: "info",
      text: soldOut + " out-of-stock product" + (soldOut === 1 ? " is" : "s are") + (cfg.includeOutOfStock ? " still listed." : " excluded."),
    });
  }
  if (!cfg.includeLastmod) {
    out.push({ level: "info", text: "<lastmod> is switched off, so crawlers re-fetch every URL on their own schedule." });
  } else if (!m.savedAt) {
    out.push({ level: "info", text: "No <lastmod> yet: the catalogue has not been saved in this browser, so there is no edit date to publish." });
  }
  if (entries.length > 50000) {
    out.push({ level: "error", text: entries.length + " URLs exceeds the 50,000 limit — split them behind a sitemap index." });
  }
  if (!out.length) out.push({ level: "ok", text: "Every URL is absolute, unique and reachable. Nothing to fix." });
  return out;
}

function sitemapBytes(text) {
  try { return new Blob([text]).size; } catch { return String(text || "").length; }
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 1024) return n + " B";
  if (n < 1048576) return (Math.round((n / 1024) * 10) / 10) + " KB";
  return (Math.round((n / 1048576) * 10) / 10) + " MB";
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Run history ------------------------------------------------------------
// Kept in this browser like every other admin record: it answers "when did I
// last download a sitemap and what was in it", nothing more.
function readSitemapHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(SITEMAP_HISTORY_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function recordSitemapRun(entry) {
  const list = [entry].concat(readSitemapHistory()).slice(0, SITEMAP_HISTORY_MAX);
  try { localStorage.setItem(SITEMAP_HISTORY_KEY, JSON.stringify(list)); } catch { /* storage full — history is not essential */ }
  return list;
}

function clearSitemapHistory() {
  try { localStorage.removeItem(SITEMAP_HISTORY_KEY); } catch { /* ignore */ }
  return [];
}
