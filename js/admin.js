// Meridian admin console logic.
// Everything persists through the localStorage catalogue overlay written by
// products.js (saveCatalogOverlay). The checkout Edge Function re-prices from
// its own trusted catalogue, so admin edits here never change what the server
// charges — demo-only products are flagged and rejected at payment.
//
// SECURITY: the Stripe *secret* key is never entered or stored here. Only the
// publishable key and display options are configurable; the secret lives in
// Sites Settings (STRIPE_SECRET_KEY) and is read solely by the Edge Function.

(function () {
  "use strict";

  // Ids the checkout Edge Function can actually charge (mirror of functions/catalog.ts).
  const SERVER_IDS = ["aurora-headphones", "pulse-smartwatch", "nimbus-speaker", "lumen-lamp", "terra-mugs", "cove-blanket", "meridian-tee", "trail-hoodie", "drift-chinos", "atlas-backpack", "ridge-bottle", "halo-sunglasses"];
  const ADMIN_EMAIL_KEY = "meridian_admin_email_v1";
  const ADMIN_PASS_KEY = "meridian_admin_pass_v1";
  const UNLOCK_KEY = "meridian_admin_unlocked";
  const DEFAULT_ADMIN_EMAIL = "admin@meridian.store";
  const DEFAULT_ADMIN_PASS = "Admin@12345";
  const BANNER_THEMES = ["a", "b", "c"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function el(id) { return document.getElementById(id); }
  function getAdminEmail() { return localStorage.getItem(ADMIN_EMAIL_KEY) || DEFAULT_ADMIN_EMAIL; }
  function getAdminPass() { return localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_ADMIN_PASS; }

  // --- In-page modal dialogs ------------------------------------------------
  // Native window.prompt()/confirm() are disabled inside sandboxed preview
  // iframes (they return null/false without showing anything), which silently
  // turned rename/delete into no-ops. These in-page dialogs always work.
  const modalBackdrop = el("modal-backdrop");
  const modalTitle = el("modal-title");
  const modalMsg = el("modal-msg");
  const modalInputWrap = el("modal-input-wrap");
  const modalInput = el("modal-input");
  const modalOk = el("modal-ok");
  const modalCancel = el("modal-cancel");
  let modalResolve = null;

  function closeModal(value) {
    if (!modalResolve) return;
    const res = modalResolve;
    modalResolve = null;
    modalBackdrop.hidden = true;
    res(value);
  }
  function openModal(opts) {
    return new Promise((resolve) => {
      modalResolve = resolve;
      modalTitle.textContent = opts.title || "";
      modalMsg.textContent = opts.message || "";
      modalMsg.hidden = !opts.message;
      const withInput = opts.input != null;
      modalInputWrap.hidden = !withInput;
      modalInput.value = withInput ? opts.input : "";
      modalOk.textContent = opts.okLabel || "OK";
      modalOk.classList.toggle("btn-danger", !!opts.danger);
      modalBackdrop.hidden = false;
      if (withInput) { modalInput.focus(); modalInput.select(); } else { modalOk.focus(); }
    });
  }
  // Resolves with the entered string, or null when cancelled.
  function dialogPrompt(title, message, def) { return openModal({ title, message, input: def, okLabel: "Save" }); }
  // Resolves with true when confirmed, false when cancelled.
  function dialogConfirm(title, message, okLabel) { return openModal({ title, message, okLabel: okLabel || "Delete", danger: true }); }

  modalOk.addEventListener("click", () => closeModal(modalInputWrap.hidden ? true : modalInput.value));
  modalCancel.addEventListener("click", () => closeModal(modalInputWrap.hidden ? false : null));
  modalBackdrop.addEventListener("click", (e) => { if (e.target === modalBackdrop) closeModal(modalInputWrap.hidden ? false : null); });
  modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); modalOk.click(); }
    else if (e.key === "Escape") { modalCancel.click(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalBackdrop.hidden) modalCancel.click(); });

  // Read an image file, downscale on a canvas, and hand back a compressed data
  // URL small enough to persist in localStorage. format "image/png" keeps
  // transparency (logos); "image/jpeg" is used for photos.
  function compressImage(file, maxW, format, quality, done) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        done(cv.toDataURL(format, quality), w, h);
      };
      img.onerror = () => toast("Could not read that image file");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Working copies.
  let draft = JSON.parse(JSON.stringify(PRODUCTS));
  let settings = getCatalogSettings();
  let editingId = null;
  let editingBanner = null;
  let galleryDraft = [];

  function persist() {
    try {
      saveCatalogOverlay(draft, settings);
      settings = getCatalogSettings();
      return true;
    } catch (err) {
      toast("Save failed — browser storage is full. Use smaller slide images.");
      return false;
    }
  }

  // --- Gate ----------------------------------------------------------------
  const gate = el("gate");
  const console_ = el("console");
  function isUnlocked() { return sessionStorage.getItem(UNLOCK_KEY) === "1"; }
  function showConsole() { gate.hidden = true; console_.hidden = false; refreshAll(); }
  function showGate() { gate.hidden = false; console_.hidden = true; }

  el("unlock").addEventListener("click", tryUnlock);
  el("pass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  el("admin-email").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  el("admin-pw-toggle").addEventListener("click", () => {
    const p = el("pass");
    const showing = p.type === "text";
    p.type = showing ? "password" : "text";
    const btn = el("admin-pw-toggle");
    btn.textContent = showing ? "Show" : "Hide";
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });
  function tryUnlock() {
    const email = el("admin-email").value.trim().toLowerCase();
    const pass = el("pass").value;
    if (email === getAdminEmail().toLowerCase() && pass === getAdminPass()) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      el("gate-error").hidden = true;
      showConsole();
    } else {
      el("gate-error").hidden = false;
    }
  }

  // --- Tabs ----------------------------------------------------------------
  document.querySelectorAll(".admin-nav [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab === "lock") { sessionStorage.removeItem(UNLOCK_KEY); location.reload(); return; }
      document.querySelectorAll(".admin-nav [data-tab]").forEach((b) => b.setAttribute("aria-current", String(b === btn)));
      document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
      const panel = el("panel-" + tab);
      if (panel) panel.classList.add("active");
    });
  });

  // --- Dashboard -----------------------------------------------------------
  // Sales explorer state: graph granularity and the month the calendar shows.
  const salesView = { gran: "5y", calY: new Date().getFullYear(), calM: new Date().getMonth(), selDay: null };

  // ₹ paise → compact Indian label (₹999 / ₹12.4k / ₹3.2L / ₹1.1Cr).
  function compactMoney(paise) {
    const r = (paise || 0) / 100;
    if (r >= 10000000) return "₹" + (r / 10000000).toFixed(1) + "Cr";
    if (r >= 100000) return "₹" + (r / 100000).toFixed(1) + "L";
    if (r >= 1000) return "₹" + (r / 1000).toFixed(1) + "k";
    return "₹" + Math.round(r);
  }
  function dayStartTs(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function monthStartTs(y, m) { return new Date(y, m, 1).getTime(); }

  function renderDashboard() {
    // Analytics need history; seed the demo set once per browser on first view.
    if (!demoOrdersSeeded()) seedDemoOrders();

    const n = draft.length;
    const cats = settings.categories;
    const checkoutReady = draft.filter((p) => SERVER_IDS.includes(p.id)).length;
    const demoOnly = n - checkoutReady;
    const orders = getOrders();
    const now = new Date();
    const todayStart = dayStartTs(now);
    const todayStats = revenueOrders(ordersBetween(todayStart, todayStart + 86400000));
    const fiveStats = revenueOrders(orders.filter((o) => o.ts >= new Date(now.getFullYear() - 4, 0, 1).getTime()));
    const pending = orders.filter((o) => o.status === "Pending").length;

    el("dash-stats").innerHTML = [
      { n: n, l: "Products" },
      { n: cats.length, l: "Categories" },
      { n: totalCustomers(), l: "Total customers" },
      { n: pending, l: "Pending orders" },
    ].map((s) => `<div class="stat"><div class="n">${esc(s.n)}</div><div class="l">${esc(s.l)}</div></div>`).join("");

    el("dash-pipeline").innerHTML = ["Placed", "Confirmed", "Proceeded", "Shipped"].map((s) => {
      const c = orders.filter((o) => o.status === s).length;
      return `<div class="stat"><div class="n">${c}</div><div class="l">${esc(s)} orders</div></div>`;
    }).join("");

    const c = el("dash-checkout");
    const pay = settings.payments || {};
    const payState = pay.enabled
      ? `Payments are <strong>enabled</strong> (${esc(pay.provider || "stripe")}${pay.testMode ? ", test mode" : ""}). They go live once <strong>STRIPE_SECRET_KEY</strong> is set in Sites Settings.`
      : "Payments are <strong>disabled</strong> in the Payments tab; checkout will not start a session until re-enabled.";
    if (demoOnly > 0) {
      c.className = "callout warn";
      c.innerHTML = `<strong>${demoOnly} demo-only product${demoOnly > 1 ? "s" : ""}.</strong> Only the ${checkoutReady} products whose IDs exist in the server catalogue can be charged at checkout. ${payState}`;
    } else {
      c.className = "callout";
      c.innerHTML = `All ${checkoutReady} products match the server catalogue and can be checked out. ${payState}`;
    }

    const max = Math.max(1, ...cats.map((cat) => draft.filter((p) => p.category === cat).length));
    el("dash-cats").innerHTML = cats.map((cat) => {
      const count = draft.filter((p) => p.category === cat).length;
      return `<div class="bar-row"><span>${esc(cat)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round((count / max) * 100)}%"></span></span><span>${count}</span></div>`;
    }).join("") || '<p class="muted">No categories yet.</p>';

    renderSales(orders, todayStats, fiveStats);
  }

  // --- Sales analytics (graph + calendar) -----------------------------------
  function barChartSVG(buckets) {
    const W = 560, H = 210, padB = 26, padT = 20;
    const max = Math.max(1, ...buckets.map((b) => b.value));
    const step = W / Math.max(1, buckets.length);
    const bw = Math.min(46, step * 0.62);
    const bars = buckets.map((b, i) => {
      const h = Math.round((b.value / max) * (H - padB - padT));
      const x = Math.round(i * step + (step - bw) / 2);
      const y = H - padB - Math.max(2, h);
      const cx = Math.round(i * step + step / 2);
      return `<g><rect x="${x}" y="${y}" width="${Math.round(bw)}" height="${Math.max(2, h)}" rx="4" class="bar${b.active ? " active" : ""}"><title>${esc(b.label)}: ${compactMoney(b.value)}</title></rect>` +
        `<text x="${cx}" y="${H - 8}" class="bar-x">${esc(b.label)}</text>` +
        (b.value > 0 ? `<text x="${cx}" y="${y - 5}" class="bar-v">${compactMoney(b.value)}</text>` : "") +
        `</g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales bar chart">${bars}</svg>`;
  }

  function salesBuckets(orders) {
    const now = new Date();
    const buckets = [];
    const rev = (from, to) => revenueOrders(ordersBetween(from, to)).revenue;
    if (salesView.gran === "5y") {
      for (let y = now.getFullYear() - 4; y <= now.getFullYear(); y++) {
        buckets.push({ label: String(y), value: rev(new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()), active: y === now.getFullYear() });
      }
    } else if (salesView.gran === "year") {
      for (let m = 0; m < 12; m++) {
        buckets.push({ label: new Date(salesView.calY, m, 1).toLocaleDateString("en-IN", { month: "short" }), value: rev(monthStartTs(salesView.calY, m), monthStartTs(salesView.calY, m + 1)), active: salesView.calY === now.getFullYear() && m === now.getMonth() });
      }
    } else {
      const days = new Date(salesView.calY, salesView.calM + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const from = new Date(salesView.calY, salesView.calM, d).getTime();
        buckets.push({ label: String(d), value: rev(from, from + 86400000), active: salesView.selDay === from });
      }
    }
    return buckets;
  }

  function renderCalendar(orders) {
    const y = salesView.calY, m = salesView.calM;
    const now = new Date();
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const perDay = new Array(days + 1).fill(0);
    for (const o of orders) {
      if (!REVENUE_STATUSES.includes(o.status)) continue;
      const d = new Date(o.ts);
      if (d.getFullYear() === y && d.getMonth() === m) perDay[d.getDate()] += o.totalPaise || 0;
    }
    const max = Math.max(1, ...perDay.slice(1));
    let cells = "";
    for (let i = 0; i < first.getDay(); i++) cells += `<span class="cal-blank"></span>`;
    for (let d = 1; d <= days; d++) {
      const ts = new Date(y, m, d).getTime();
      const v = perDay[d];
      const cls = ["cal-day"];
      if (v) cls.push("has");
      if (y === now.getFullYear() && m === now.getMonth() && d === now.getDate()) cls.push("today");
      if (salesView.selDay === ts) cls.push("sel");
      const bg = v ? ` style="background:rgba(31,111,92,${(0.12 + 0.5 * (v / max)).toFixed(2)})"` : "";
      cells += `<button type="button" class="${cls.join(" ")}" data-day="${ts}"${bg} aria-label="${d} ${esc(first.toLocaleDateString("en-IN", { month: "long" }))}, ${compactMoney(v)}"><span class="cd-n">${d}</span>${v ? `<span class="cd-v">${compactMoney(v)}</span>` : ""}</button>`;
    }
    el("sales-cal").innerHTML = `
      <div class="cal-head">
        <button type="button" class="mini-btn" id="cal-prev" aria-label="Previous month">‹</button>
        <strong>${esc(first.toLocaleDateString("en-IN", { month: "long", year: "numeric" }))}</strong>
        <button type="button" class="mini-btn" id="cal-next" aria-label="Next month">›</button>
      </div>
      <div class="cal-dow">${["S", "M", "T", "W", "T", "F", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <p class="hint" style="margin:8px 0 0">Darker days sold more. Click a day to inspect it.</p>`;
  }

  function renderSales(orders, todayStats, fiveStats) {
    const plural = (k) => `${k} order${k === 1 ? "" : "s"}`;
    let selCard = "";
    if (salesView.selDay != null) {
      const st = revenueOrders(ordersBetween(salesView.selDay, salesView.selDay + 86400000));
      const d = new Date(salesView.selDay);
      selCard = `<div class="sale-card sel"><span class="sc-l">${esc(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</span><span class="sc-v">${compactMoney(st.revenue)}</span><span class="sc-s">${plural(st.orders)} · <button type="button" class="link-btn" id="sales-clear-day">clear selection</button></span></div>`;
    }
    el("sales-summary").innerHTML = `
      <div class="sale-card"><span class="sc-l">Today's sales</span><span class="sc-v">${compactMoney(todayStats.revenue)}</span><span class="sc-s">${plural(todayStats.orders)} today</span></div>
      <div class="sale-card"><span class="sc-l">Last 5 years</span><span class="sc-v">${compactMoney(fiveStats.revenue)}</span><span class="sc-s">${plural(fiveStats.orders)} since ${new Date().getFullYear() - 4}</span></div>
      ${selCard}`;

    el("sales-gran").innerHTML = [["5y", "Last 5 years"], ["year", "By month"], ["month", "By day"]]
      .map(([g, l]) => `<button type="button" data-gran="${g}" aria-pressed="${salesView.gran === g}">${l}</button>`).join("");

    el("sales-graph").innerHTML = barChartSVG(salesBuckets(orders));
    renderCalendar(orders);
    el("sales-note").innerHTML = `Revenue excludes cancelled and refunded orders. Seeded demo history illustrates the graphs; real checkouts on this device add to it. <button type="button" class="link-btn" id="sales-clear-demo">Clear demo history</button>`;
    bindSales();
  }

  function bindSales() {
    el("sales-gran").querySelectorAll("[data-gran]").forEach((b) => b.addEventListener("click", () => {
      salesView.gran = b.getAttribute("data-gran");
      renderDashboard();
    }));
    el("cal-prev").addEventListener("click", () => {
      salesView.calM--; if (salesView.calM < 0) { salesView.calM = 11; salesView.calY--; }
      renderDashboard();
    });
    el("cal-next").addEventListener("click", () => {
      salesView.calM++; if (salesView.calM > 11) { salesView.calM = 0; salesView.calY++; }
      renderDashboard();
    });
    el("sales-cal").querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => {
      const ts = Number(b.getAttribute("data-day"));
      salesView.selDay = salesView.selDay === ts ? null : ts;
      if (salesView.selDay != null) { salesView.gran = "month"; salesView.calY = new Date(ts).getFullYear(); salesView.calM = new Date(ts).getMonth(); }
      renderDashboard();
    }));
    const clearDay = el("sales-clear-day");
    if (clearDay) clearDay.addEventListener("click", () => { salesView.selDay = null; renderDashboard(); });
    el("sales-clear-demo").addEventListener("click", async () => {
      const ok = await dialogConfirm("Clear demo history", "Remove the seeded demo orders from the analytics? Real orders on this device are kept.", "Clear");
      if (!ok) return;
      clearDemoOrders();
      renderDashboard();
      renderOrders();
      toast("Demo order history cleared");
    });
  }

  // --- Products ------------------------------------------------------------
  const prodRows = el("prod-rows");
  const productsView = el("products-view");
  const editorView = el("product-editor");

  function renderProducts() {
    el("prod-count").textContent = `(${draft.length})`;
    prodRows.innerHTML = draft.map((p) => {
      const ready = SERVER_IDS.includes(p.id);
      return `<tr>
        <td><span class="swatch" style="background:linear-gradient(135deg, ${esc(p.grad[0])}, ${esc(p.grad[1])})"></span></td>
        <td><strong>${esc(p.name)}</strong><div class="hint">${esc(p.id)}</div></td>
        <td>${esc(p.category)}</td>
        <td>${money(p.price)}${p.was ? `<div class="hint"><s>${money(p.was)}</s></div>` : ""}</td>
        <td>${Number(p.rating).toFixed(1)} ★</td>
        <td>${ready ? '<span class="pill ok">Server</span>' : '<span class="pill demo">Demo only</span>'}</td>
        <td><div class="row-actions"><button class="mini-btn" data-edit="${esc(p.id)}">Edit</button><button class="mini-btn danger" data-del="${esc(p.id)}">Delete</button></div></td>
      </tr>`;
    }).join("");

    prodRows.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openEditor(b.getAttribute("data-edit"))));
    prodRows.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const id = b.getAttribute("data-del");
      const p = draft.find((x) => x.id === id);
      if (confirm(`Delete "${p ? p.name : id}"? This can't be undone (until you reset to defaults).`)) {
        draft = draft.filter((x) => x.id !== id); persist(); refreshAll(); toast("Product deleted");
      }
    }));
  }

  const catSel = el("f-category");
  function fillCategorySelect() {
    catSel.innerHTML = settings.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  }

  function openEditor(id) {
    editingId = id;
    fillCategorySelect();
    const p = id ? draft.find((x) => x.id === id) : null;
    el("editor-title").textContent = p ? "Edit product" : "Add product";
    el("f-id").value = p ? p.id : "";
    el("f-id").disabled = !!p;
    el("f-name").value = p ? p.name : "";
    catSel.value = p ? p.category : (settings.categories[0] || "");
    el("f-price").value = p ? Math.round(p.price / 100) : "";
    el("f-was").value = p && p.was ? Math.round(p.was / 100) : "";
    el("f-badge").value = p && p.badge ? p.badge : "";
    el("f-rating").value = p ? p.rating : "4.5";
    el("f-reviewcount").value = p ? p.reviewCount : "0";
    el("f-grad0").value = p ? p.grad[0] : "#123c33";
    el("f-grad1").value = p ? p.grad[1] : "#1f6f5c";
    el("f-image").value = p && p.image ? p.image : "";
    setProductImagePreview(p && p.image ? p.image : "");
    el("f-thumb").value = p && p.thumb ? p.thumb : "";
    setThumbPreview(p && p.thumb ? p.thumb : "");
    galleryDraft = p && Array.isArray(p.gallery) ? p.gallery.slice() : [];
    renderGalleryList();
    el("f-videos").value = p && Array.isArray(p.videos) ? p.videos.join("\n") : "";
    el("f-specpdf").value = p && p.specPdf ? p.specPdf : "";
    el("f-sku").value = p && p.sku ? p.sku : "";
    el("f-unit").value = p && p.unit ? p.unit : "pc";
    el("f-minqty").value = p && p.minQty ? p.minQty : 1;
    el("f-stock").value = p && Number.isFinite(p.stock) ? p.stock : "";
    el("f-tags").value = p && Array.isArray(p.tags) ? p.tags.join(", ") : "";
    const disc = (p && p.discount) || null;
    el("f-discount-type").value = disc ? disc.type : "";
    el("f-discount-value").value = disc ? (disc.type === "percent" ? disc.value : Math.round(disc.value / 100)) : "";
    el("f-refund-enabled").checked = !!(p && p.refund && p.refund.enabled);
    el("f-refund-note").value = p && p.refund ? p.refund.note : "";
    el("f-warranty-enabled").checked = !!(p && p.warranty && p.warranty.enabled);
    el("f-warranty-note").value = p && p.warranty ? p.warranty.note : "";
    renderFreqInputs(p ? p.frequentlyBought : null, id);
    el("f-desc").value = p ? p.desc : "";
    el("f-blurb").value = p ? p.blurb : "";
    el("f-features").value = p && p.features ? p.features.join("\n") : "";
    renderAttrInputs(p ? p.attrs : null);
    renderVariantInputs(p ? p.variants : null);
    el("editor-note").textContent = p && !SERVER_IDS.includes(p.id)
      ? "This product isn't in the server catalogue, so it can't be charged at checkout (demo only)."
      : (p ? "" : "New products are storefront demos unless their ID also exists in functions/catalog.ts.");
    productsView.hidden = true; editorView.hidden = false;
    el("add-product").hidden = true;
  }
  function closeEditor() { editorView.hidden = true; productsView.hidden = false; el("add-product").hidden = false; editingId = null; setProductImagePreview(""); setThumbPreview(""); galleryDraft = []; }

  function setProductImagePreview(src) {
    const prev = el("f-image-preview");
    if (!prev) return;
    if (src) { prev.src = src; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute("src"); }
  }
  function setThumbPreview(src) {
    const prev = el("f-thumb-preview");
    if (!prev) return;
    if (src) { prev.src = src; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute("src"); }
  }

  // Gallery thumbnails with per-image remove buttons.
  function renderGalleryList() {
    const wrap = el("f-gallery-list");
    if (!wrap) return;
    wrap.innerHTML = galleryDraft.map((src, i) =>
      `<span class="thumb-item"><img src="${esc(src)}" alt="Gallery image ${i + 1}" /><button type="button" class="thumb-del" data-gal-del="${i}" aria-label="Remove gallery image ${i + 1}">×</button></span>`
    ).join("") || '<span class="hint">No gallery images yet.</span>';
    wrap.querySelectorAll("[data-gal-del]").forEach((b) => b.addEventListener("click", () => {
      galleryDraft.splice(Number(b.getAttribute("data-gal-del")), 1);
      renderGalleryList();
    }));
  }

  // Checklist of every other product, for the "frequently purchased" feature.
  function renderFreqInputs(current, excludeId) {
    const chosen = Array.isArray(current) ? current.map(String) : [];
    el("f-freq").innerHTML = draft.filter((x) => x.id !== excludeId).map((x, i) => {
      const cid = "f-freq-" + i;
      const checked = chosen.includes(x.id) ? " checked" : "";
      return `<label class="check-pill" for="${cid}"><input id="${cid}" type="checkbox" data-freq="${esc(x.id)}"${checked} /><span>${esc(x.name)}</span></label>`;
    }).join("") || '<span class="hint">No other products yet.</span>';
  }
  function collectFreqInputs() {
    const out = [];
    el("f-freq").querySelectorAll("[data-freq]").forEach((cb) => { if (cb.checked) out.push(cb.getAttribute("data-freq")); });
    return out;
  }

  el("add-product").addEventListener("click", () => openEditor(null));
  el("cancel-product").addEventListener("click", closeEditor);
  el("f-image-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 1000, "image/jpeg", 0.82, (data) => {
      el("f-image").value = data;
      setProductImagePreview(data);
      toast("Image compressed to ~" + Math.round(data.length / 1024) + " KB");
    });
  });
  el("f-image").addEventListener("input", () => setProductImagePreview(el("f-image").value.trim()));

  el("f-thumb-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 400, "image/jpeg", 0.82, (data) => {
      el("f-thumb").value = data;
      setThumbPreview(data);
      toast("Thumbnail compressed to ~" + Math.round(data.length / 1024) + " KB");
    });
  });
  el("f-thumb").addEventListener("input", () => setThumbPreview(el("f-thumb").value.trim()));

  el("f-gallery-file").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = 8 - galleryDraft.length;
    if (room <= 0) { toast("Gallery holds up to 8 images"); return; }
    let done = 0;
    files.slice(0, room).forEach((file) => {
      compressImage(file, 1000, "image/jpeg", 0.8, (data) => {
        galleryDraft.push(data);
        done++;
        if (done === Math.min(files.length, room)) { renderGalleryList(); toast("Added " + done + " gallery image(s)"); }
      });
    });
    if (files.length > room) toast("Gallery holds up to 8 images — extra files skipped");
  });

  el("f-specpdf-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type && file.type !== "application/pdf") { toast("Choose a PDF file"); return; }
    if (file.size > 700 * 1024) { toast("PDF too large for browser storage — host it and paste a URL instead"); return; }
    const reader = new FileReader();
    reader.onload = () => { el("f-specpdf").value = String(reader.result); toast("PDF attached (~" + Math.round(file.size / 1024) + " KB)"); };
    reader.onerror = () => toast("Could not read that PDF");
    reader.readAsDataURL(file);
  });

  function slugify(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); }

  el("save-product").addEventListener("click", () => {
    let id = el("f-id").value.trim();
    const name = el("f-name").value.trim();
    if (!name) { toast("Name is required"); return; }
    if (!editingId) { id = id ? slugify(id) : slugify(name); }
    if (!id) { toast("ID is required"); return; }
    if (!editingId && draft.some((x) => x.id === id)) { toast("That ID already exists"); return; }

    const priceRupees = parseFloat(el("f-price").value);
    const wasRupees = parseFloat(el("f-was").value);
    const discType = el("f-discount-type").value;
    const discRupees = parseFloat(el("f-discount-value").value);
    let discount;
    if (discType === "percent") {
      if (Number.isFinite(discRupees) && discRupees > 0) discount = { type: "percent", value: Math.min(90, discRupees) };
    } else if (discType === "flat") {
      if (Number.isFinite(discRupees) && discRupees > 0) discount = { type: "flat", value: Math.round(discRupees * 100) };
    }
    const stockRaw = el("f-stock").value.trim();
    const rec = {
      id,
      name,
      category: catSel.value,
      desc: el("f-desc").value.trim(),
      blurb: el("f-blurb").value.trim(),
      price: Number.isFinite(priceRupees) ? Math.max(0, Math.round(priceRupees * 100)) : 0,
      was: Number.isFinite(wasRupees) && wasRupees > 0 ? Math.round(wasRupees * 100) : undefined,
      badge: el("f-badge").value.trim() || undefined,
      rating: Math.min(5, Math.max(0, parseFloat(el("f-rating").value) || 0)),
      reviewCount: Math.max(0, parseInt(el("f-reviewcount").value, 10) || 0),
      grad: [el("f-grad0").value, el("f-grad1").value],
      image: el("f-image").value.trim(),
      thumb: el("f-thumb").value.trim(),
      gallery: galleryDraft.slice(),
      videos: el("f-videos").value.split("\n").map((s) => s.trim()).filter(Boolean),
      specPdf: el("f-specpdf").value.trim(),
      sku: el("f-sku").value.trim(),
      unit: el("f-unit").value.trim() || "pc",
      minQty: Math.max(1, parseInt(el("f-minqty").value, 10) || 1),
      stock: stockRaw === "" ? undefined : Math.max(0, parseInt(stockRaw, 10) || 0),
      tags: el("f-tags").value.split(",").map((s) => s.trim()).filter(Boolean),
      discount,
      refund: { enabled: el("f-refund-enabled").checked, note: el("f-refund-note").value.trim() },
      warranty: { enabled: el("f-warranty-enabled").checked, note: el("f-warranty-note").value.trim() },
      frequentlyBought: collectFreqInputs(),
      features: el("f-features").value.split("\n").map((s) => s.trim()).filter(Boolean),
      attrs: collectAttrInputs(),
      variants: collectVariantInputs(),
      reviews: editingId ? (draft.find((x) => x.id === editingId) || {}).reviews || [] : [],
    };

    if (editingId) { const i = draft.findIndex((x) => x.id === editingId); draft[i] = rec; }
    else { draft.push(rec); }
    persist(); closeEditor(); refreshAll(); toast(editingId ? "Product updated" : "Product added");
  });

  // Per-product attribute inputs, rendered from the attribute definitions.
  function renderAttrInputs(current) {
    const wrap = el("f-attrs");
    const defs = settings.attributes || [];
    el("f-attrs-empty").hidden = defs.length > 0;
    wrap.innerHTML = defs.map((a) => {
      const fid = "f-attr-" + a.id;
      const raw = current ? current[a.id] : "";
      if (a.type === "multi") {
        const chosen = Array.isArray(raw) ? raw.map(String) : (raw != null && String(raw).trim() ? [String(raw).trim()] : []);
        const boxes = (a.options || []).map((o, oi) => {
          const cid = fid + "-" + oi;
          const checked = chosen.includes(o) ? " checked" : "";
          return `<label class="check-pill" for="${cid}"><input id="${cid}" type="checkbox" data-attr-multi="${esc(a.id)}" value="${esc(o)}"${checked} /><span>${esc(o)}</span></label>`;
        }).join("");
        return `<div class="field field-wide"><span class="attr-label">${esc(a.name)}</span><div class="check-group">${boxes || '<span class="hint">No choices defined yet.</span>'}</div></div>`;
      }
      const val = raw != null ? (Array.isArray(raw) ? raw.join(", ") : String(raw)) : "";
      if (a.type === "select") {
        const opts = (a.options || []).map((o) => `<option value="${esc(o)}"${o === val ? " selected" : ""}>${esc(o)}</option>`).join("");
        return `<div class="field"><label for="${fid}">${esc(a.name)}</label><select id="${fid}" data-attr="${esc(a.id)}"><option value="">—</option>${opts}</select></div>`;
      }
      return `<div class="field"><label for="${fid}">${esc(a.name)}</label><input id="${fid}" type="text" data-attr="${esc(a.id)}" value="${esc(val)}" placeholder="—" /></div>`;
    }).join("");
  }
  function collectAttrInputs() {
    const out = {};
    el("f-attrs").querySelectorAll("[data-attr]").forEach((inp) => {
      const v = (inp.value || "").trim();
      if (v) out[inp.getAttribute("data-attr")] = v;
    });
    el("f-attrs").querySelectorAll("[data-attr-multi]").forEach((cb) => {
      if (!cb.checked) return;
      const id = cb.getAttribute("data-attr-multi");
      if (!Array.isArray(out[id])) out[id] = [];
      const v = (cb.value || "").trim();
      if (v) out[id].push(v);
    });
    Object.keys(out).forEach((k) => { if (Array.isArray(out[k]) && !out[k].length) delete out[k]; });
    return out;
  }

  // Per-product variant inputs: a checklist of each global group's choices.
  function renderVariantInputs(current) {
    const wrap = el("f-variants");
    const defs = settings.variantGroups || [];
    el("f-variants-empty").hidden = defs.length > 0;
    wrap.innerHTML = defs.map((g) => {
      const chosen = current && Array.isArray(current[g.id]) ? current[g.id].map(String) : [];
      const boxes = (g.options || []).map((o, oi) => {
        const cid = "f-var-" + g.id + "-" + oi;
        const checked = chosen.includes(o) ? " checked" : "";
        return `<label class="check-pill" for="${cid}"><input id="${cid}" type="checkbox" data-var-opt="${esc(g.id)}" value="${esc(o)}"${checked} /><span>${esc(o)}</span></label>`;
      }).join("");
      return `<div class="field field-wide"><span class="attr-label">${esc(g.name)}</span><div class="check-group">${boxes || '<span class="hint">No choices defined yet.</span>'}</div></div>`;
    }).join("");
  }
  function collectVariantInputs() {
    const out = {};
    el("f-variants").querySelectorAll("[data-var-opt]").forEach((cb) => {
      if (!cb.checked) return;
      const gid = cb.getAttribute("data-var-opt");
      const v = (cb.value || "").trim();
      if (!v) return;
      if (!Array.isArray(out[gid])) out[gid] = [];
      out[gid].push(v);
    });
    return out;
  }

  // --- Categories ----------------------------------------------------------
  function renderCategories() {
    const rows = settings.categories.map((c) => {
      const count = draft.filter((p) => p.category === c).length;
      return `<tr>
        <td><strong>${esc(c)}</strong></td>
        <td>${count} product${count === 1 ? "" : "s"}</td>
        <td><div class="row-actions">
          <button class="mini-btn" data-rename="${esc(c)}">Rename</button>
          <button class="mini-btn danger" data-delcat="${esc(c)}">Delete</button>
        </div></td>
      </tr>`;
    }).join("");
    el("cat-rows").innerHTML = rows || '<tr><td colspan="3" class="muted">No categories.</td></tr>';

    el("cat-rows").querySelectorAll("[data-rename]").forEach((b) => b.addEventListener("click", async () => {
      const old = b.getAttribute("data-rename");
      const next = await dialogPrompt("Rename category", `Choose a new name for "${old}". Products keep their listings under the new name.`, old);
      if (next == null) return;
      const name = next.trim();
      if (!name) { toast("Name can't be empty"); return; }
      if (name !== old && settings.categories.includes(name)) { toast("That category already exists"); return; }
      settings.categories = settings.categories.map((c) => (c === old ? name : c));
      draft.forEach((p) => { if (p.category === old) p.category = name; });
      persist(); refreshAll(); toast("Category renamed");
    }));
    el("cat-rows").querySelectorAll("[data-delcat]").forEach((b) => b.addEventListener("click", async () => {
      const name = b.getAttribute("data-delcat");
      const count = draft.filter((p) => p.category === name).length;
      const fallback = settings.categories.find((c) => c !== name);
      if (!fallback) { toast("Keep at least one category"); return; }
      const msg = count
        ? `Its ${count} product(s) will move to "${fallback}". This can't be undone (until you reset to defaults).`
        : "This can't be undone (until you reset to defaults).";
      const ok = await dialogConfirm(`Delete "${name}"?`, msg);
      if (!ok) return;
      settings.categories = settings.categories.filter((c) => c !== name);
      draft.forEach((p) => { if (p.category === name) p.category = fallback; });
      settings.banners = (settings.banners || []).map((bn) => (bn.linkType === "category" && bn.target === name ? Object.assign({}, bn, { target: fallback }) : bn));
      persist(); refreshAll(); toast("Category deleted");
    }));
  }

  el("add-category").addEventListener("click", () => {
    const name = (el("new-category").value || "").trim();
    if (!name) { toast("Enter a category name"); return; }
    if (settings.categories.some((c) => c.toLowerCase() === name.toLowerCase())) { toast("That category already exists"); return; }
    settings.categories = settings.categories.concat([name]);
    el("new-category").value = "";
    persist(); refreshAll(); toast("Category added");
  });

  // --- Orders --------------------------------------------------------------
  function renderOrders() {
    const orders = getOrders();
    el("orders-count").textContent = `(${orders.length})`;
    if (!orders.length) {
      el("orders-body").innerHTML = '<tr><td colspan="6" class="muted">No orders recorded on this device yet. Orders appear here after a completed checkout.</td></tr>';
      return;
    }
    el("orders-body").innerHTML = orders.map((o) => {
      const items = (o.items || []).map((it) => `${esc(it.name)} × ${esc(it.quantity)}`).join(", ");
      const cust = (o.customer && (o.customer.name || o.customer.email)) || o.email || "";
      const opts = ORDER_STATUSES.map((s) => `<option value="${s}"${s === o.status ? " selected" : ""}>${s}</option>`).join("");
      return `<tr>
        <td><strong>${esc(o.id)}</strong><div class="hint">${esc(o.date || "")}</div></td>
        <td class="hint">${esc(cust || "Guest")}${o.demo ? '<div class="hint">demo</div>' : ""}</td>
        <td class="hint" style="max-width:280px">${items}</td>
        <td>${esc(o.total || "")}</td>
        <td><select class="order-status" data-order="${esc(o.id)}">${opts}</select></td>
        <td style="white-space:nowrap"><button class="mini-btn" data-bill="${esc(o.id)}">Bill</button> <button class="mini-btn danger" data-delorder="${esc(o.id)}">Delete</button></td>
      </tr>`;
    }).join("");

    el("orders-body").querySelectorAll("[data-bill]").forEach((b) => b.addEventListener("click", () => {
      const o = findOrder(b.getAttribute("data-bill"));
      if (o) openBillModal(o);
    }));
    el("orders-body").querySelectorAll(".order-status").forEach((sel) => sel.addEventListener("change", () => {
      updateOrderStatus(sel.getAttribute("data-order"), sel.value);
      toast("Order status updated");
      renderDashboard();
    }));
    el("orders-body").querySelectorAll("[data-delorder]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-delorder");
      const ok = await dialogConfirm("Delete order", `Delete ${id}? This cannot be undone.`, "Delete");
      if (!ok) return;
      deleteOrder(id); renderOrders(); renderDashboard(); toast("Order deleted");
    }));
  }

  // --- Order bills -----------------------------------------------------------
  // Normalize a stored order into bill line items. The stored per-line total
  // (a money string) is authoritative so the bill always matches what was
  // actually charged, even if catalogue prices changed afterwards.
  function buildBillData(order) {
    const bill = recordBill(order.id);
    const lines = (Array.isArray(order.items) ? order.items : []).map((it, i) => {
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      const linePaise = parseMoneyPaise(it.total) || 0;
      return { n: i + 1, name: it.name || it.id || "Item", variant: it.variantLabel || "", qty, unitPaise: Math.round(linePaise / qty), linePaise };
    });
    const subtotal = lines.reduce((s, l) => s + l.linePaise, 0);
    const total = Number.isFinite(order.totalPaise) ? order.totalPaise : subtotal;
    return { bill, order, lines, subtotal, shipping: Math.max(0, total - subtotal), total };
  }

  // A standalone, printable invoice document (also what gets downloaded).
  function billDocumentHTML(d) {
    const s = settings;
    const o = d.order;
    const custName = (o.customer && o.customer.name) || "";
    const custEmail = (o.customer && o.customer.email) || o.email || "";
    const initial = esc(((s.storeName || "M").trim().charAt(0) || "M").toUpperCase());
    const logo = s.logo
      ? `<img src="${esc(s.logo)}" alt="" style="height:36px;border-radius:8px" />`
      : `<span style="display:inline-grid;place-items:center;width:36px;height:36px;border-radius:8px;background:#123c33;color:#fff;font-weight:700;font-size:18px">${initial}</span>`;
    const rows = d.lines.map((l) => `<tr><td>${l.n}</td><td>${esc(l.name)}${l.variant ? `<div style="color:#666;font-size:12px">${esc(l.variant)}</div>` : ""}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${money(l.unitPaise)}</td><td style="text-align:right">${money(l.linePaise)}</td></tr>`).join("");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bill ${esc(d.bill.billNo)} — ${esc(s.storeName)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f4f4f2;color:#16211d}
  .sheet{max-width:760px;margin:24px auto;background:#fff;padding:36px 40px;box-shadow:0 2px 14px rgba(0,0,0,.08)}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:2px solid #123c33;padding-bottom:18px}
  .brand{display:flex;gap:12px;align-items:center}
  .brand h1{font-size:20px;margin:0}
  .brand p{margin:2px 0 0;font-size:12px;color:#666}
  .meta{text-align:right;font-size:13px}
  .meta .no{font-size:18px;font-weight:700}
  h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:26px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:9px 10px;border-bottom:1px solid #e6e4de;text-align:left;vertical-align:top}
  th{background:#f7f6f3;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  .totals{margin-left:auto;width:260px;font-size:14px}
  .totals div{display:flex;justify-content:space-between;padding:6px 0}
  .totals .grand{border-top:2px solid #123c33;font-weight:700;font-size:16px;margin-top:4px;padding-top:10px}
  .two{display:flex;gap:28px;flex-wrap:wrap}
  .two>div{flex:1;min-width:220px;font-size:13px}
  .muted{color:#666}
  footer{margin-top:30px;border-top:1px solid #e6e4de;padding-top:14px;font-size:12px;color:#666;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .status{display:inline-block;padding:3px 10px;border-radius:999px;background:#e8f2ee;color:#123c33;font-weight:600;font-size:12px}
  @media print{body{background:#fff}.sheet{margin:0;box-shadow:none;max-width:none}}
</style></head>
<body><div class="sheet">
  <header>
    <div class="brand">${logo}<div><h1>${esc(s.storeName)}</h1><p>Tax invoice / bill of supply</p></div></div>
    <div class="meta"><div class="no">${esc(d.bill.billNo)}</div><div class="muted">Order ${esc(o.id)}</div><div class="muted">${esc(o.date || (o.ts ? new Date(o.ts).toLocaleString("en-IN") : ""))}</div><div style="margin-top:6px"><span class="status">${esc(o.status)}</span></div></div>
  </header>
  <div class="two">
    <div><h2>Billed to</h2><strong>${esc(custName || "Guest")}</strong>${custEmail ? `<div class="muted">${esc(custEmail)}</div>` : ""}</div>
    <div><h2>Payment</h2><div class="muted">Method: Stripe Checkout</div><div class="muted">Bill generated: ${esc(new Date(d.bill.generatedAt || Date.now()).toLocaleString("en-IN"))}</div></div>
  </div>
  <h2>Items</h2>
  <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" class="muted">No line items recorded.</td></tr>'}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    <div><span>Shipping</span><span>${d.shipping ? money(d.shipping) : "Free"}</span></div>
    <div class="grand"><span>Grand total</span><span>${money(d.total)}</span></div>
  </div>
  <footer><span>Thank you for shopping with ${esc(s.storeName)}.</span><span>Computer-generated bill — no signature required.</span></footer>
</div></body></html>`;
  }

  // Save the invoice as a downloadable .html file (opens & prints anywhere).
  function downloadBill(order) {
    const d = buildBillData(order);
    const blob = new Blob([billDocumentHTML(d)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.bill.billNo + "-" + String(order.id).replace(/[^\w-]+/g, "_") + ".html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Bill " + d.bill.billNo + " downloaded");
    return d;
  }

  let billModalOrderId = null;
  function openBillModal(order) {
    billModalOrderId = order.id;
    const d = buildBillData(order);
    el("bill-no").textContent = d.bill.billNo;
    el("bill-frame").srcdoc = billDocumentHTML(d);
    el("bill-backdrop").hidden = false;
  }
  function closeBillModal() { el("bill-backdrop").hidden = true; el("bill-frame").srcdoc = ""; billModalOrderId = null; }
  el("bill-close").addEventListener("click", closeBillModal);
  el("bill-backdrop").addEventListener("click", (e) => { if (e.target === el("bill-backdrop")) closeBillModal(); });
  el("bill-download").addEventListener("click", () => {
    const o = billModalOrderId ? findOrder(billModalOrderId) : null;
    if (!o) return;
    downloadBill(o);
    renderOrders();
  });
  el("bill-print").addEventListener("click", () => {
    try { const w = el("bill-frame").contentWindow; w.focus(); w.print(); }
    catch { toast("Printing is blocked here — use Download instead"); }
  });

  // --- Customers -------------------------------------------------------------
  function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
  function renderCustomers() {
    const list = getCustomers();
    el("cust-count").textContent = `(${list.length})`;
    const registered = list.filter((c) => c.registered).length;
    el("cust-glance").innerHTML = [
      { n: list.length, l: "Total customers" },
      { n: registered, l: "Registered accounts" },
      { n: list.length - registered, l: "From order history" },
      { n: list.reduce((s, c) => s + c.orders, 0), l: "Orders placed" },
    ].map((s) => `<div class="stat"><div class="n">${esc(s.n)}</div><div class="l">${esc(s.l)}</div></div>`).join("");

    if (!list.length) {
      el("cust-grid").innerHTML = '<p class="muted">No customers yet. Customers appear here when someone creates an account or places an order.</p>';
      return;
    }
    el("cust-grid").innerHTML = list.map((c) => {
      const hue = customerHue(c.email);
      const display = c.name || c.email.split("@")[0];
      return `<article class="cust-card">
        <div class="cust-top">
          <span class="cust-logo" style="background:hsl(${hue} 45% 38%)" aria-hidden="true">${esc(customerInitials(c))}</span>
          <div class="cust-id">
            <strong title="${esc(display)}">${esc(display)}</strong>
            <span class="hint" title="${esc(c.email)}">${esc(c.email)}</span>
          </div>
          <button type="button" class="mini-btn danger" data-delcust="${esc(c.email)}" aria-label="Delete ${esc(c.email)}">Delete</button>
        </div>
        <div class="cust-badges"><span class="cust-tag${c.registered ? " ok" : ""}">${c.registered ? "Registered account" : "Order history"}</span></div>
        <dl class="cust-meta">
          <div><dt>Orders</dt><dd>${c.orders}</dd></div>
          <div><dt>Total spent</dt><dd>${compactMoney(c.spent)}</dd></div>
          <div><dt>Customer since</dt><dd>${fmtDate(c.joined)}</dd></div>
          <div><dt>Last order</dt><dd>${fmtDate(c.lastOrder)}</dd></div>
        </dl>
      </article>`;
    }).join("");

    el("cust-grid").querySelectorAll("[data-delcust]").forEach((b) => b.addEventListener("click", async () => {
      const email = b.getAttribute("data-delcust");
      const c = getCustomers().find((x) => x.email === email);
      const label = c && c.name ? `${c.name} (${email})` : email;
      const ok = await dialogConfirm("Delete customer", `Remove ${label}? This deletes their login account and ${c ? c.orders : 0} order(s). This cannot be undone.`, "Delete");
      if (!ok) return;
      const res = deleteCustomer(email);
      renderCustomers(); renderDashboard(); renderOrders();
      toast(`Deleted ${email} — ${res.accounts} account, ${res.orders} order(s) removed`);
    }));
  }

  // --- Banners -------------------------------------------------------------
  function renderBanners() {
    const list = settings.banners || [];
    el("banner-rows").innerHTML = list.map((b, i) => {
      const themeCls = "banner-" + (BANNER_THEMES.includes(b.theme) ? b.theme : "a");
      const linkLabel = b.linkType === "product" ? "Product: " + b.target
        : b.linkType === "category" ? "Category: " + b.target
        : b.linkType === "url" ? "URL: " + b.target
        : "Anchor: " + (b.target || "#catalogue");
      return `<tr>
        <td><span class="banner-thumb ${themeCls}"${b.image ? ` style="background-image:linear-gradient(rgba(0,0,0,.2),rgba(0,0,0,.4)),url('${esc(b.image)}');background-size:cover;background-position:center"` : ""}></span></td>
        <td><strong>${esc(b.title)}</strong><div class="hint">${esc(b.kicker)}${b.sub ? " · " + esc(b.sub) : ""}</div></td>
        <td class="hint">${esc(linkLabel)}</td>
        <td>${b.enabled === false ? '<span class="pill demo">Hidden</span>' : '<span class="pill ok">Live</span>'}</td>
        <td><div class="row-actions">
          <button class="mini-btn" data-editbanner="${i}">Edit</button>
          <button class="mini-btn" data-togglebanner="${i}">${b.enabled === false ? "Show" : "Hide"}</button>
          <button class="mini-btn danger" data-delbanner="${i}">Delete</button>
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" class="muted">No banners.</td></tr>';

    el("banner-rows").querySelectorAll("[data-editbanner]").forEach((btn) => btn.addEventListener("click", () => openBannerEditor(parseInt(btn.getAttribute("data-editbanner"), 10))));
    el("banner-rows").querySelectorAll("[data-togglebanner]").forEach((btn) => btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-togglebanner"), 10);
      settings.banners[i].enabled = settings.banners[i].enabled === false;
      persist(); refreshAll(); toast(settings.banners[i].enabled ? "Banner shown" : "Banner hidden");
    }));
    el("banner-rows").querySelectorAll("[data-delbanner]").forEach((btn) => btn.addEventListener("click", () => {
      const i = parseInt(btn.getAttribute("data-delbanner"), 10);
      if (!confirm("Delete this banner?")) return;
      settings.banners.splice(i, 1); persist(); refreshAll(); toast("Banner deleted");
    }));
  }

  const bannerListView = el("banners-view");
  const bannerEditor = el("banner-editor");

  function fillBannerTarget() {
    const type = el("f-btype").value;
    const targetWrap = el("f-btarget-wrap");
    if (type === "product") {
      targetWrap.innerHTML = `<label for="f-btarget">Product</label><select id="f-btarget">${draft.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>`;
    } else if (type === "category") {
      targetWrap.innerHTML = `<label for="f-btarget">Category</label><select id="f-btarget">${settings.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>`;
    } else if (type === "url") {
      targetWrap.innerHTML = `<label for="f-btarget">URL</label><input id="f-btarget" type="url" placeholder="https://…" />`;
    } else {
      targetWrap.innerHTML = `<label for="f-btarget">Anchor</label><input id="f-btarget" type="text" placeholder="#catalogue" />`;
    }
  }

  function openBannerEditor(i) {
    editingBanner = Number.isInteger(i) ? i : null;
    const b = editingBanner != null ? settings.banners[editingBanner] : null;
    el("banner-editor-title").textContent = b ? "Edit banner" : "Add banner";
    el("f-bkicker").value = b ? b.kicker : "";
    el("f-btitle").value = b ? b.title : "";
    el("f-bsub").value = b ? b.sub : "";
    el("f-bimage").value = b ? b.image : "";
    setBannerPreview(b && b.image ? b.image : "");
    el("f-btheme").value = b && BANNER_THEMES.includes(b.theme) ? b.theme : "a";
    el("f-btype").value = b ? b.linkType : "product";
    fillBannerTarget();
    if (b && b.target) el("f-btarget").value = b.target;
    bannerListView.hidden = true; bannerEditor.hidden = false; el("add-banner").hidden = true;
  }
  function closeBannerEditor() { bannerEditor.hidden = true; bannerListView.hidden = false; el("add-banner").hidden = false; editingBanner = null; setBannerPreview(""); }

  function setBannerPreview(src) {
    const prev = el("f-bimage-preview");
    if (!prev) return;
    if (src) { prev.src = src; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute("src"); }
  }

  el("add-banner").addEventListener("click", () => openBannerEditor(null));
  el("cancel-banner").addEventListener("click", closeBannerEditor);
  el("f-btype").addEventListener("change", fillBannerTarget);
  el("f-bimage-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 1000, "image/jpeg", 0.82, (data) => {
      el("f-bimage").value = data;
      setBannerPreview(data);
      toast("Image compressed to ~" + Math.round(data.length / 1024) + " KB");
    });
  });

  el("save-banner").addEventListener("click", () => {
    const title = el("f-btitle").value.trim();
    if (!title) { toast("Banner title is required"); return; }
    const type = el("f-btype").value;
    const target = (el("f-btarget").value || "").trim();
    if (type === "product" && !target) { toast("Choose a product to link to"); return; }
    if (type === "url" && target && !/^https?:\/\/|^\//.test(target)) { toast("URL should start with http(s):// or /"); return; }
    const rec = {
      id: editingBanner != null ? settings.banners[editingBanner].id : "b" + Date.now().toString(36),
      kicker: el("f-bkicker").value.trim(),
      title,
      sub: el("f-bsub").value.trim(),
      image: el("f-bimage").value.trim(),
      theme: BANNER_THEMES.includes(el("f-btheme").value) ? el("f-btheme").value : "a",
      linkType: type,
      target: type === "scroll" ? (target || "#catalogue") : target,
      enabled: editingBanner != null ? settings.banners[editingBanner].enabled !== false : true,
    };
    if (editingBanner != null) settings.banners[editingBanner] = rec;
    else settings.banners = (settings.banners || []).concat([rec]);
    persist(); closeBannerEditor(); refreshAll(); toast("Banner saved");
  });

  // --- Slideshow (scrolling hero banner) -----------------------------------
  const slidesView = el("slides-view");
  const slideEditor = el("slide-editor");
  let editingSlide = null;

  function slideLinkLabel(s) {
    if (s.linkType === "product") return "Product: " + s.target;
    if (s.linkType === "category") return "Category: " + s.target;
    if (s.linkType === "url") return "URL: " + s.target;
    return "No link";
  }

  function renderSlideshow() {
    const list = settings.heroSlides || [];
    el("slide-rows").innerHTML = list.map((s, i) => {
      const thumb = s.image
        ? `<span class="banner-thumb" style="background-image:url('${esc(s.image)}');background-size:cover;background-position:center"></span>`
        : `<span class="banner-thumb" style="background:linear-gradient(135deg, ${esc((s.grad || ["#123c33", "#1f6f5c"])[0])}, ${esc((s.grad || ["#123c33", "#1f6f5c"])[1])})"></span>`;
      return `<tr>
        <td>${thumb}</td>
        <td><strong>${esc(s.title || "Slide " + (i + 1))}</strong><div class="hint">${esc(s.kicker || "")}${s.sub ? " · " + esc(s.sub) : ""}</div></td>
        <td class="hint">${esc(slideLinkLabel(s))}</td>
        <td>${s.enabled === false ? '<span class="pill demo">Hidden</span>' : '<span class="pill ok">Live</span>'}</td>
        <td><div class="row-actions">
          <button class="mini-btn" data-slideup="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="mini-btn" data-slidedown="${i}" ${i === list.length - 1 ? "disabled" : ""}>↓</button>
          <button class="mini-btn" data-editslide="${i}">Edit</button>
          <button class="mini-btn" data-toggleslide="${i}">${s.enabled === false ? "Show" : "Hide"}</button>
          <button class="mini-btn danger" data-delslide="${i}">Delete</button>
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" class="muted">No slides. The hero banner will be empty.</td></tr>';

    el("slide-rows").querySelectorAll("[data-slideup]").forEach((b) => b.addEventListener("click", () => moveSlide(parseInt(b.getAttribute("data-slideup"), 10), -1)));
    el("slide-rows").querySelectorAll("[data-slidedown]").forEach((b) => b.addEventListener("click", () => moveSlide(parseInt(b.getAttribute("data-slidedown"), 10), +1)));
    el("slide-rows").querySelectorAll("[data-editslide]").forEach((b) => b.addEventListener("click", () => openSlideEditor(parseInt(b.getAttribute("data-editslide"), 10))));
    el("slide-rows").querySelectorAll("[data-toggleslide]").forEach((b) => b.addEventListener("click", () => {
      const i = parseInt(b.getAttribute("data-toggleslide"), 10);
      settings.heroSlides[i].enabled = settings.heroSlides[i].enabled === false;
      if (persist()) { refreshAll(); toast(settings.heroSlides[i].enabled ? "Slide shown" : "Slide hidden"); }
    }));
    el("slide-rows").querySelectorAll("[data-delslide]").forEach((b) => b.addEventListener("click", () => {
      const i = parseInt(b.getAttribute("data-delslide"), 10);
      if (!confirm("Delete this slide?")) return;
      settings.heroSlides.splice(i, 1);
      if (persist()) { refreshAll(); toast("Slide deleted"); }
    }));
  }

  function moveSlide(i, dir) {
    const j = i + dir;
    const list = settings.heroSlides;
    if (j < 0 || j >= list.length) return;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    if (persist()) { refreshAll(); toast("Slide order updated"); }
  }

  function fillSlideTarget() {
    const type = el("f-s-linktype").value;
    const wrap = el("f-s-target-wrap");
    if (type === "product") wrap.innerHTML = `<label for="f-s-target">Product</label><select id="f-s-target">${draft.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select>`;
    else if (type === "category") wrap.innerHTML = `<label for="f-s-target">Category</label><select id="f-s-target">${settings.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>`;
    else if (type === "url") wrap.innerHTML = `<label for="f-s-target">URL</label><input id="f-s-target" type="url" placeholder="https://…" />`;
    else wrap.innerHTML = `<label for="f-s-target">Target</label><input id="f-s-target" type="text" disabled placeholder="No link" />`;
  }

  function setSlidePreview(src) {
    const prev = el("f-s-preview");
    if (src) { prev.src = src; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute("src"); }
  }

  function openSlideEditor(i) {
    editingSlide = Number.isInteger(i) ? i : null;
    const s = editingSlide != null ? settings.heroSlides[editingSlide] : null;
    el("slide-editor-title").textContent = s ? "Edit slide" : "Add slide";
    el("f-s-image").value = s ? s.image : "";
    setSlidePreview(s && s.image ? s.image : "");
    el("f-s-grad0").value = s && s.grad ? s.grad[0] : "#123c33";
    el("f-s-grad1").value = s && s.grad ? s.grad[1] : "#1f6f5c";
    el("f-s-kicker").value = s ? s.kicker : "";
    el("f-s-title").value = s ? s.title : "";
    el("f-s-sub").value = s ? s.sub : "";
    el("f-s-linktype").value = s ? s.linkType : "none";
    fillSlideTarget();
    if (s && s.target) el("f-s-target").value = s.target;
    slidesView.hidden = true; slideEditor.hidden = false; el("add-slide").hidden = true;
  }
  function closeSlideEditor() { slideEditor.hidden = true; slidesView.hidden = false; el("add-slide").hidden = false; editingSlide = null; setSlidePreview(""); }

  el("add-slide").addEventListener("click", () => openSlideEditor(null));
  el("cancel-slide").addEventListener("click", closeSlideEditor);
  el("f-s-linktype").addEventListener("change", fillSlideTarget);

  // Upload → downscale on a canvas → compressed data URL (fits localStorage).
  el("f-s-image-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 1400, "image/jpeg", 0.82, (data) => {
      el("f-s-image").value = data;
      setSlidePreview(data);
      toast("Image compressed to ~" + Math.round(data.length / 1024) + " KB");
    });
  });

  el("save-slide").addEventListener("click", () => {
    const type = el("f-s-linktype").value;
    const target = type === "none" ? "" : (el("f-s-target").value || "").trim();
    if (type === "product" && !target) { toast("Choose a product to link to"); return; }
    if (type === "url" && target && !/^https?:\/\/|^\//.test(target)) { toast("URL should start with http(s):// or /"); return; }
    const rec = {
      id: editingSlide != null ? settings.heroSlides[editingSlide].id : "s" + Date.now().toString(36),
      image: el("f-s-image").value.trim(),
      grad: [el("f-s-grad0").value, el("f-s-grad1").value],
      kicker: el("f-s-kicker").value.trim(),
      title: el("f-s-title").value.trim(),
      sub: el("f-s-sub").value.trim(),
      linkType: type,
      target,
      enabled: editingSlide != null ? settings.heroSlides[editingSlide].enabled !== false : true,
    };
    if (editingSlide != null) settings.heroSlides[editingSlide] = rec;
    else settings.heroSlides = (settings.heroSlides || []).concat([rec]);
    if (persist()) { closeSlideEditor(); refreshAll(); toast("Slide saved"); }
  });

  // --- Attributes (product specifications) ---------------------------------
  function slugifyAttr(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32); }

  function attrIsFilled(p, id) {
    const v = p.attrs && p.attrs[id];
    if (Array.isArray(v)) return v.length > 0;
    return String(v == null ? "" : v).trim() !== "";
  }
  function attrTypeLabel(t) {
    return t === "select" ? "Choice list" : t === "multi" ? "Multiple choose" : "Free text";
  }

  function renderAttributes() {
    const list = settings.attributes || [];
    el("attr-rows").innerHTML = list.map((a, i) => {
      const filled = draft.filter((p) => attrIsFilled(p, a.id)).length;
      const usesOptions = a.type === "select" || a.type === "multi";
      const choices = usesOptions ? (a.options || []).join(", ") : "—";
      return `<tr>
        <td><strong>${esc(a.name)}</strong><div class="hint">${esc(a.id)}</div></td>
        <td>${attrTypeLabel(a.type)}</td>
        <td class="hint" style="max-width:240px">${esc(choices)}</td>
        <td>${filled} / ${draft.length}</td>
        <td><div class="row-actions">
          <button class="mini-btn" data-renameattr="${i}">Rename</button>
          ${usesOptions ? `<button class="mini-btn" data-editopts="${i}">Edit choices</button>` : ""}
          <button class="mini-btn danger" data-delattr="${i}">Delete</button>
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="5" class="muted">No attributes yet.</td></tr>';

    el("attr-rows").querySelectorAll("[data-renameattr]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-renameattr"), 10);
      const next = await dialogPrompt("Rename attribute", "Choose a new label. Values already saved on products are kept.", settings.attributes[i].name);
      if (next == null) return;
      const name = next.trim();
      if (!name) { toast("Name can't be empty"); return; }
      settings.attributes[i].name = name;
      if (persist()) { refreshAll(); toast("Attribute renamed"); }
    }));
    el("attr-rows").querySelectorAll("[data-editopts]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-editopts"), 10);
      const a = settings.attributes[i];
      const next = await dialogPrompt("Edit choices", "List the choices separated by commas. Removing a choice clears it from every product.", (a.options || []).join(", "));
      if (next == null) return;
      const opts = next.split(",").map((s) => s.trim()).filter(Boolean);
      if (!opts.length) { toast("Add at least one choice"); return; }
      a.options = opts;
      draft.forEach((p) => {
        if (!p.attrs) return;
        const v = p.attrs[a.id];
        if (Array.isArray(v)) {
          const kept = v.filter((x) => opts.includes(String(x)));
          if (kept.length) p.attrs[a.id] = kept; else delete p.attrs[a.id];
        } else if (v != null && String(v).trim() && !opts.includes(String(v).trim())) {
          delete p.attrs[a.id];
        }
      });
      if (persist()) { refreshAll(); toast("Choices updated"); }
    }));
    el("attr-rows").querySelectorAll("[data-delattr]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-delattr"), 10);
      const a = settings.attributes[i];
      const ok = await dialogConfirm(`Delete "${a.name}"?`, "Its values will be removed from every product. This can't be undone (until you reset to defaults).");
      if (!ok) return;
      settings.attributes.splice(i, 1);
      draft.forEach((p) => { if (p.attrs) delete p.attrs[a.id]; });
      if (persist()) { refreshAll(); toast("Attribute deleted"); }
    }));
  }

  el("new-attr-type").addEventListener("change", () => {
    el("new-attr-opts-wrap").hidden = el("new-attr-type").value === "text";
  });
  el("add-attr").addEventListener("click", () => {
    const name = (el("new-attr-name").value || "").trim();
    if (!name) { toast("Enter an attribute name"); return; }
    const base = slugifyAttr(name);
    if (!base) { toast("Name must contain letters or numbers"); return; }
    const existing = new Set((settings.attributes || []).map((a) => a.id));
    let id = base, n = 2;
    while (existing.has(id)) { id = base + "-" + n++; }
    const rawType = el("new-attr-type").value;
    const type = rawType === "select" ? "select" : rawType === "multi" ? "multi" : "text";
    const usesOptions = type === "select" || type === "multi";
    const options = usesOptions ? (el("new-attr-opts").value || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (usesOptions && !options.length) { toast("Add at least one choice"); return; }
    settings.attributes = (settings.attributes || []).concat([{ id, name, type, options }]);
    el("new-attr-name").value = ""; el("new-attr-opts").value = ""; el("new-attr-type").value = "text";
    el("new-attr-opts-wrap").hidden = true;
    if (persist()) { refreshAll(); toast("Attribute added"); }
  });

  // --- Variants (purchasable option groups) --------------------------------
  function variantGroupIsUsed(p, gid) {
    const v = p.variants && p.variants[gid];
    return Array.isArray(v) && v.length > 0;
  }

  function renderVariantGroups() {
    const list = settings.variantGroups || [];
    el("var-rows").innerHTML = list.map((g, i) => {
      const used = draft.filter((p) => variantGroupIsUsed(p, g.id)).length;
      return `<tr>
        <td><strong>${esc(g.name)}</strong><div class="hint">${esc(g.id)}</div></td>
        <td class="hint" style="max-width:280px">${esc((g.options || []).join(", ") || "—")}</td>
        <td>${used} / ${draft.length}</td>
        <td><div class="row-actions">
          <button class="mini-btn" data-renamevar="${i}">Rename</button>
          <button class="mini-btn" data-editvaropts="${i}">Edit choices</button>
          <button class="mini-btn danger" data-delvar="${i}">Delete</button>
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="4" class="muted">No variant groups yet.</td></tr>';

    el("var-rows").querySelectorAll("[data-renamevar]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-renamevar"), 10);
      const next = await dialogPrompt("Rename variant", "Choose a new label. Products keep the choices they offer.", settings.variantGroups[i].name);
      if (next == null) return;
      const name = next.trim();
      if (!name) { toast("Name can't be empty"); return; }
      settings.variantGroups[i].name = name;
      if (persist()) { refreshAll(); toast("Variant renamed"); }
    }));
    el("var-rows").querySelectorAll("[data-editvaropts]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-editvaropts"), 10);
      const g = settings.variantGroups[i];
      const next = await dialogPrompt("Edit choices", "List the choices separated by commas. Removing a choice clears it from every product.", (g.options || []).join(", "));
      if (next == null) return;
      const opts = next.split(",").map((s) => s.trim()).filter(Boolean);
      if (!opts.length) { toast("Add at least one choice"); return; }
      g.options = opts;
      draft.forEach((p) => {
        if (!p.variants || !Array.isArray(p.variants[g.id])) return;
        const kept = p.variants[g.id].filter((x) => opts.includes(String(x)));
        if (kept.length) p.variants[g.id] = kept; else delete p.variants[g.id];
      });
      if (persist()) { refreshAll(); toast("Choices updated"); }
    }));
    el("var-rows").querySelectorAll("[data-delvar]").forEach((b) => b.addEventListener("click", async () => {
      const i = parseInt(b.getAttribute("data-delvar"), 10);
      const g = settings.variantGroups[i];
      const ok = await dialogConfirm(`Delete "${g.name}"?`, "It will be removed from every product. This can't be undone (until you reset to defaults).");
      if (!ok) return;
      settings.variantGroups.splice(i, 1);
      draft.forEach((p) => { if (p.variants) delete p.variants[g.id]; });
      if (persist()) { refreshAll(); toast("Variant deleted"); }
    }));
  }

  el("add-vargroup").addEventListener("click", () => {
    const name = (el("new-var-name").value || "").trim();
    if (!name) { toast("Enter a variant name"); return; }
    const base = slugifyAttr(name);
    if (!base) { toast("Name must contain letters or numbers"); return; }
    const existing = new Set((settings.variantGroups || []).map((g) => g.id));
    let id = base, n = 2;
    while (existing.has(id)) { id = base + "-" + n++; }
    const options = (el("new-var-opts").value || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!options.length) { toast("Add at least one choice"); return; }
    settings.variantGroups = (settings.variantGroups || []).concat([{ id, name, options }]);
    el("new-var-name").value = ""; el("new-var-opts").value = "";
    if (persist()) { refreshAll(); toast("Variant group added"); }
  });

  // --- Branding (store name + logo) ----------------------------------------
  function setLogoPreview(src) {
    const prev = el("b-logo-preview");
    if (!prev) return;
    if (src) { prev.src = src; prev.hidden = false; } else { prev.hidden = true; prev.removeAttribute("src"); }
  }
  function renderBranding() {
    el("b-store").value = settings.storeName || "";
    el("b-logo-url").value = settings.logo || "";
    setLogoPreview(settings.logo || "");
  }

  el("b-logo-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 240, "image/png", undefined, (data) => {
      el("b-logo-url").value = data;
      setLogoPreview(data);
      toast("Logo compressed to ~" + Math.round(data.length / 1024) + " KB");
    });
  });
  el("b-logo-url").addEventListener("input", () => setLogoPreview(el("b-logo-url").value.trim()));
  el("remove-logo").addEventListener("click", () => {
    el("b-logo-url").value = "";
    setLogoPreview("");
    settings.logo = "";
    if (persist()) { applySettings(); toast("Logo removed"); }
  });
  el("save-branding").addEventListener("click", () => {
    const name = el("b-store").value.trim() || "Meridian";
    const logo = el("b-logo-url").value.trim();
    if (logo && !/^(data:image\/|https?:\/\/|\/)/.test(logo)) { toast("Logo should be a URL or an uploaded image"); return; }
    settings = Object.assign({}, settings, { storeName: name, logo });
    if (persist()) { applySettings(); renderBranding(); renderSettings(); toast("Branding saved"); }
  });

  // --- Rules (password policy + store policies) ----------------------------
  function renderRules() {
    const p = settings.passwordPolicy || {};
    el("r-minlength").value = Number.isFinite(p.minLength) ? p.minLength : 9;
    el("r-upper").checked = !!p.requireUpper;
    el("r-special").checked = !!p.requireSpecial;
    el("r-number").checked = !!p.requireNumber;

    const rules = settings.rules || [];
    el("rules-list").innerHTML = rules.map((r, i) => `<li class="rule-item">
      <div><strong>${esc(r.title)}</strong>${r.body ? `<div class="hint">${esc(r.body)}</div>` : ""}</div>
      <button class="mini-btn danger" data-delrule="${i}">Remove</button>
    </li>`).join("") || '<li class="muted">No store policies added yet.</li>';
    el("rules-list").querySelectorAll("[data-delrule]").forEach((b) => b.addEventListener("click", () => {
      settings.rules.splice(parseInt(b.getAttribute("data-delrule"), 10), 1);
      persist(); renderRules(); toast("Rule removed");
    }));
  }

  el("save-rules").addEventListener("click", () => {
    const min = parseInt(el("r-minlength").value, 10);
    settings.passwordPolicy = {
      minLength: Number.isFinite(min) ? Math.max(1, Math.min(64, min)) : 9,
      requireUpper: el("r-upper").checked,
      requireSpecial: el("r-special").checked,
      requireNumber: el("r-number").checked,
    };
    persist(); refreshAll(); toast("Password rules saved");
  });

  el("add-rule").addEventListener("click", () => {
    const title = el("new-rule-title").value.trim();
    const body = el("new-rule-body").value.trim();
    if (!title) { toast("Give the rule a title"); return; }
    settings.rules = (settings.rules || []).concat([{ id: "r" + Date.now().toString(36), title, body }]);
    el("new-rule-title").value = ""; el("new-rule-body").value = "";
    persist(); renderRules(); toast("Rule added");
  });

  // --- Payments ------------------------------------------------------------
  function renderPayments() {
    const pay = settings.payments || {};
    el("p-enabled").checked = pay.enabled !== false;
    el("p-provider").value = pay.provider || "stripe";
    el("p-pubkey").value = pay.publishableKey || "";
    el("p-currency").value = pay.currency || "INR";
    el("p-descriptor").value = pay.statementDescriptor || "";
    el("p-testmode").checked = pay.testMode !== false;
    const secretSet = typeof window.__STRIPE_SECRET_PRESENT__ === "boolean" ? window.__STRIPE_SECRET_PRESENT__ : null;
    el("payments-status").innerHTML = secretSet === false
      ? '<span class="pill demo">Secret not detected</span> Add <strong>STRIPE_SECRET_KEY</strong> in Sites Settings to accept live payments.'
      : 'The secret key is managed in <strong>Sites Settings</strong> and is never stored or shown here. Checkout stays in test mode until you switch to live keys.';
  }

  el("save-payments").addEventListener("click", () => {
    const pubkey = el("p-pubkey").value.trim();
    if (pubkey && !/^pk_(test|live)_/.test(pubkey)) { toast("Publishable key should start with pk_test_ or pk_live_"); return; }
    settings.payments = {
      enabled: el("p-enabled").checked,
      provider: el("p-provider").value,
      publishableKey: pubkey,
      currency: (el("p-currency").value || "INR").toUpperCase(),
      statementDescriptor: el("p-descriptor").value.trim().slice(0, 22),
      testMode: el("p-testmode").checked,
    };
    persist(); renderPayments(); renderDashboard(); toast("Payment settings saved");
  });

  // --- Appearance ----------------------------------------------------------
  const THEME_KEYS = ["bg", "surface", "ink", "inkSoft", "line", "accent", "accentInk", "star"];
  function renderAppearance() {
    const theme = settings.theme || {};
    THEME_KEYS.forEach((k) => {
      const input = el("c-" + k);
      const hex = typeof theme[k] === "string" && /^#/.test(theme[k]) ? theme[k] : DEFAULT_THEME[k];
      if (input) input.value = hex;
      const hexLabel = el("c-" + k + "-hex");
      if (hexLabel) hexLabel.value = hex;
    });
    applyTheme(theme);
  }
  function liveThemeFromInputs() {
    const t = {};
    THEME_KEYS.forEach((k) => { const input = el("c-" + k); if (input) t[k] = input.value; });
    return t;
  }
  THEME_KEYS.forEach((k) => {
    const input = el("c-" + k);
    const hexLabel = el("c-" + k + "-hex");
    if (!input) return;
    input.addEventListener("input", () => {
      if (hexLabel) hexLabel.value = input.value;
      applyTheme(liveThemeFromInputs());
    });
    if (hexLabel) hexLabel.addEventListener("change", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hexLabel.value)) { input.value = hexLabel.value; applyTheme(liveThemeFromInputs()); }
      else hexLabel.value = input.value;
    });
  });
  el("save-appearance").addEventListener("click", () => {
    settings.theme = Object.assign({}, settings.theme, liveThemeFromInputs());
    persist(); applyTheme(settings.theme); toast("Colours saved");
  });
  el("reset-appearance").addEventListener("click", () => {
    settings.theme = Object.assign({}, DEFAULT_THEME);
    persist(); renderAppearance(); toast("Colours reset to defaults");
  });

  // --- Settings ------------------------------------------------------------
  function renderSettings() {
    el("s-email").value = settings.supportEmail;
    el("s-ship").value = Math.round(settings.freeShippingThreshold / 100);
    el("s-admin-email").value = getAdminEmail();
    el("s-admin-pass").value = getAdminPass();
  }
  el("save-settings").addEventListener("click", () => {
    const shipRupees = parseFloat(el("s-ship").value);
    const newEmail = el("s-admin-email").value.trim();
    const newPass = el("s-admin-pass").value;
    if (newEmail && !isValidEmail(newEmail)) { toast("Admin email is invalid"); return; }
    if (newPass && !passwordValid(newPass)) { toast("Admin password doesn't meet the current password rules"); return; }
    settings = Object.assign({}, settings, {
      supportEmail: el("s-email").value.trim(),
      freeShippingThreshold: Number.isFinite(shipRupees) ? Math.max(0, Math.round(shipRupees * 100)) : 500000,
    });
    if (newEmail) localStorage.setItem(ADMIN_EMAIL_KEY, newEmail.toLowerCase());
    if (newPass) localStorage.setItem(ADMIN_PASS_KEY, newPass);
    persist(); applySettings(); renderSettings(); toast("Settings saved");
  });

  // --- Announcement (site-wide long banner) --------------------------------
  function announcementPreview() {
    const text = el("a-text").value.trim();
    const theme = ["accent", "dark", "light"].includes(el("a-theme").value) ? el("a-theme").value : "accent";
    const prev = el("a-preview");
    prev.className = "announce theme-" + theme;
    prev.style.borderRadius = "10px";
    prev.textContent = text || "(empty — banner hidden)";
    prev.style.opacity = text ? "1" : ".55";
  }
  function renderAnnouncement() {
    el("a-text").value = settings.announcement || "";
    el("a-theme").value = ["accent", "dark", "light"].includes(settings.announcementTheme) ? settings.announcementTheme : "accent";
    announcementPreview();
  }
  el("a-text").addEventListener("input", announcementPreview);
  el("a-theme").addEventListener("change", announcementPreview);
  el("save-announcement").addEventListener("click", () => {
    settings = Object.assign({}, settings, {
      announcement: el("a-text").value.trim(),
      announcementTheme: ["accent", "dark", "light"].includes(el("a-theme").value) ? el("a-theme").value : "accent",
    });
    persist(); applySettings(); renderAnnouncement();
    toast(settings.announcement ? "Announcement banner saved" : "Announcement banner hidden");
  });
  el("clear-announcement").addEventListener("click", () => {
    el("a-text").value = "";
    settings = Object.assign({}, settings, { announcement: "" });
    persist(); applySettings(); renderAnnouncement();
    toast("Announcement banner hidden");
  });

  // --- Spotlight Banner (mid-grid promotional banner) ----------------------
  function setGridBannerPreview(src) {
    const prev = el("g-image-preview");
    if (src) { prev.src = src; prev.hidden = false; }
    else { prev.hidden = true; prev.removeAttribute("src"); }
  }
  function renderGridBanner() {
    const g = settings.gridBanner || {};
    el("g-name").value = g.name || "Spotlight Banner";
    el("g-cta").value = g.ctaLabel || "";
    el("g-type").value = ["product", "category", "scroll", "url", "none"].includes(g.linkType) ? g.linkType : "scroll";
    el("g-target").value = g.target || "";
    el("g-enabled").value = g.enabled === false ? "0" : "1";
    setGridBannerPreview(g.image || "");
  }
  el("g-image-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    compressImage(file, 1200, "image/jpeg", 0.82, (data) => {
      settings = Object.assign({}, settings, { gridBanner: Object.assign({}, settings.gridBanner, { image: data }) });
      persist(); renderGridBanner();
      toast("Spotlight Banner image updated");
    });
  });
  el("save-gridbanner").addEventListener("click", () => {
    settings = Object.assign({}, settings, {
      gridBanner: Object.assign({}, settings.gridBanner || {}, {
        name: el("g-name").value.trim() || "Spotlight Banner",
        ctaLabel: el("g-cta").value.trim(),
        linkType: ["product", "category", "scroll", "url", "none"].includes(el("g-type").value) ? el("g-type").value : "scroll",
        target: el("g-target").value.trim(),
        enabled: el("g-enabled").value === "1",
      }),
    });
    persist(); refreshAll();
    toast("Spotlight Banner saved");
  });

  // --- Data ----------------------------------------------------------------
  el("export-json").addEventListener("click", () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), products: draft, settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "meridian-catalog.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported meridian-catalog.json");
  });

  el("import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.products)) throw new Error("bad");
        draft = data.products.map(sanitizeProduct).filter(Boolean);
        if (data.settings) settings = getCatalogSettingsFrom(data.settings);
        persist(); refreshAll(); toast(`Imported ${draft.length} products`);
      } catch {
        toast("Import failed — invalid JSON");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  el("reset-data").addEventListener("click", () => {
    if (!confirm("Reset to the 12 default products and discard all local edits (including categories, banners, colours and rules)?")) return;
    clearCatalogOverlay();
    draft = JSON.parse(JSON.stringify(BASE_PRODUCTS));
    settings = getCatalogSettings();
    applySettings();
    refreshAll(); toast("Reset to defaults");
  });

  // --- Orchestration -------------------------------------------------------
  function refreshAll() {
    fillCategorySelect();
    renderDashboard();
    renderProducts();
    renderCategories();
    renderAttributes();
    renderVariantGroups();
    renderOrders();
    renderCustomers();
    renderBanners();
    renderSlideshow();
    renderBranding();
    renderAnnouncement();
    renderGridBanner();
    renderRules();
    renderPayments();
    renderAppearance();
    renderSettings();
  }

  if (isUnlocked()) showConsole(); else showGate();
})();
