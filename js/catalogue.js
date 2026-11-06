// Meridian catalogue UI: the product grid, the category chips and the filter
// panel each chip opens. Shared by the home page and the search results page, so
// both filter the same way and the admin's per-category filters apply to both.
(function () {
  const params = new URLSearchParams(location.search);
  const searchInput = document.getElementById("search-input");

  let activeCategory = CATEGORIES.includes(params.get("cat")) ? params.get("cat") : "All";
  let activeSub = "";        // sub-category id within activeCategory
  let query = (params.get("q") || "").trim().toLowerCase();
  let activeFilters = {};    // applied to the grid
  let filterCategory = null; // category whose filter panel is open
  let pendingFilters = {};   // panel selections, applied by "See Products"
  let activePrice = { min: null, max: null }; // rupee bounds applied to the grid
  let priceOpen = false;     // is the "Sort by" price panel open?

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function node(id) { return document.getElementById(id); }
  function setText(id, text) { const n = node(id); if (n) n.textContent = text; }

  function matchesQuery(p) {
    if (!query) return true;
    const hay = p.name + " " + p.category + " " + p.desc + " " + (p.sku || "") + " " + (Array.isArray(p.tags) ? p.tags.join(" ") : "");
    return hay.toLowerCase().includes(query);
  }
  function matchesCategory(p, cat) { return cat === "All" || p.category === cat; }
  // Only ever set on a page with the sub-category row, so the id belongs to the
  // active category.
  function matchesSub(p) { return !activeSub || p.subcategory === activeSub; }
  // Option filters keyed by variant group id: choices inside one group are
  // alternatives, and every group with a choice must match.
  function matchesFilters(p, filters) {
    return Object.keys(filters).every((gid) => {
      const chosen = filters[gid];
      if (!chosen.length) return true;
      const offered = (p.variants || {})[gid] || [];
      return chosen.some((o) => offered.includes(o));
    });
  }
  // Rupee bounds from the "Sort by" panel; prices are held in paise and the
  // card shows the discounted price, so compare against that.
  function matchesPrice(p) {
    const v = priceOf(p);
    return (activePrice.min == null || v >= activePrice.min * 100) &&
      (activePrice.max == null || v <= activePrice.max * 100);
  }
  function matches(p) {
    return matchesCategory(p, activeCategory) && matchesSub(p) && matchesQuery(p) && matchesFilters(p, activeFilters) && matchesPrice(p);
  }
  function countSelection(filters) {
    return Object.keys(filters).reduce((n, gid) => n + filters[gid].length, 0);
  }
  function cloneFilters(filters) {
    const out = {};
    for (const gid of Object.keys(filters)) if (filters[gid].length) out[gid] = filters[gid].slice();
    return out;
  }

  function cardHTML(p) {
    const badge = p.badge ? `<span class="badge">${p.badge}</span>` : "";
    const d = productDiscount(p);
    const now = priceOf(p);
    const was = d && now !== p.price
      ? `<span class="was">${money(p.price)}</span>`
      : (p.was ? `<span class="was">${money(p.was)}</span>` : "");
    const wished = inWishlist(p.id);
    const href = productPageURL(p.id);
    return `
      <article class="card">
        <a class="card-media" href="${href}" style="${productMediaStyle(p)}" aria-label="${p.name}">
          ${badge}
          ${productMediaIcon(p)}
        </a>
        <div class="card-body">
          <span class="card-cat">${p.category}</span>
          <a class="card-title" href="${href}">${p.name}</a>
          <div class="card-rating">${starsHTML(p.rating, { size: 13, showValue: false })}<span class="rc">${p.rating.toFixed(1)} · ${p.reviewCount}</span></div>
          <div class="card-foot">
            <span class="price">${money(now)}${was}</span>
            <span style="display:flex;gap:6px;align-items:center">
              <button class="add-btn wish-btn ${wished ? "added" : ""}" data-wish="${p.id}" aria-label="${wished ? "Remove" : "Add"} ${p.name} ${wished ? "from" : "to"} wishlist" aria-pressed="${wished}" title="Wishlist">${wished ? "♥" : "♡"}</button>
              <button class="add-btn" data-add="${p.id}" aria-label="Add ${p.name} to cart" title="Add to cart">+</button>
            </span>
          </div>
        </div>
      </article>`;
  }

  // One square tile per category: the admin's uploaded icon, or the category's
  // line art while it has none, with the name underneath. A page with no
  // #filters element — the search results page — shows no chrome.
  function renderFilters() {
    const wrap = node("filters");
    if (!wrap) return;
    wrap.innerHTML = CATEGORIES.map((c) => `
      <button type="button" class="cat-tile" data-cat="${esc(c)}" aria-pressed="${c === activeCategory}" title="${esc(c)}">
        ${categoryTileArt(c, categoryImage(c))}
        <span class="cat-name">${esc(c)}</span>
      </button>`).join("");
    wrap.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.getAttribute("data-cat");
        activeSub = "";
        activeFilters = {};
        closeFilterPanel();
        renderGrid();
      });
    });
  }

  // The selected category's sub-categories, as a smaller second row. Its first
  // tile steps back out to every product in the category.
  function renderSubFilters() {
    const wrap = node("sub-filters");
    if (!wrap) return;
    const subs = activeCategory === "All" ? [] : subCategories(activeCategory);
    wrap.hidden = !subs.length;
    if (!subs.length) return;
    const tiles = [{ id: "", name: "All", title: `All ${activeCategory}`, image: "", icon: "All" }]
      .concat(subs.map((s) => ({ id: s.id, name: s.name, title: s.name, image: s.image, icon: activeCategory })));
    wrap.innerHTML = tiles.map((s) => `
      <button type="button" class="cat-tile" data-sub="${esc(s.id)}" aria-pressed="${s.id === activeSub}" title="${esc(s.title)}">
        ${categoryTileArt(s.icon, s.image)}
        <span class="cat-name">${esc(s.name)}</span>
      </button>`).join("");
    wrap.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSub = btn.getAttribute("data-sub");
        activeFilters = {};
        closeFilterPanel();
        renderGrid();
      });
    });
  }

  function openFilterPanel(cat) {
    closePricePanel();
    filterCategory = cat;
    pendingFilters = cat === activeCategory ? cloneFilters(activeFilters) : {};
    renderFilterPanel();
  }
  function closeFilterPanel() {
    filterCategory = null;
    pendingFilters = {};
    renderFilterPanel();
  }

  // "Sort by" price-range panel: rupee bounds the grid keeps until cleared.
  function priceActive() { return activePrice.min != null || activePrice.max != null; }
  function priceLabel() {
    const { min, max } = activePrice;
    if (min != null && max != null) return `Sort by · ${money(min * 100)}–${money(max * 100)}`;
    if (min != null) return `Sort by · ${money(min * 100)}+`;
    return `Sort by · under ${money(max * 100)}`;
  }
  function renderPriceToggle() {
    const toggle = node("open-price");
    if (!toggle) return;
    toggle.textContent = priceActive() ? priceLabel() : "Sort by";
    toggle.setAttribute("aria-expanded", String(priceOpen));
  }
  function openPricePanel() {
    priceOpen = true;
    closeFilterPanel();
    const panel = node("price-panel");
    if (panel) {
      panel.hidden = false;
      node("price-min").value = activePrice.min == null ? "" : String(activePrice.min);
      node("price-max").value = activePrice.max == null ? "" : String(activePrice.max);
      node("price-error").hidden = true;
      node("price-clear").hidden = !priceActive();
    }
    renderPriceToggle();
  }
  function closePricePanel() {
    if (!priceOpen) return;
    priceOpen = false;
    const panel = node("price-panel");
    if (panel) panel.hidden = true;
    renderPriceToggle();
  }
  function applyPrice() {
    const read = (id) => { const raw = node(id).value.trim(); return raw === "" ? null : Number(raw); };
    const min = read("price-min");
    const max = read("price-max");
    const err = node("price-error");
    const bad = (v) => v != null && (!Number.isFinite(v) || v < 0);
    if (bad(min) || bad(max)) { err.textContent = "Enter rupee amounts of zero or more, or leave a side empty."; err.hidden = false; return; }
    if (min == null && max == null) { err.textContent = "Enter a minimum, a maximum, or both."; err.hidden = false; return; }
    if (min != null && max != null && min > max) { err.textContent = "The minimum is above the maximum — swap them and continue."; err.hidden = false; return; }
    activePrice = { min, max };
    priceOpen = false;
    node("price-panel").hidden = true;
    err.hidden = true;
    render();
  }
  function clearPrice() {
    activePrice = { min: null, max: null };
    node("price-min").value = "";
    node("price-max").value = "";
    node("price-error").hidden = true;
    node("price-clear").hidden = true;
    render();
  }

  // The panel lists only choices some product in that category (matching the
  // current search) actually offers, so it never shows a dead end.
  // Which category the Filters button speaks for: the one its tile row has
  // selected, or every category at once on the results page, which has no tiles.
  function filterScope() { return node("filters") ? activeCategory : "All"; }

  function renderFilterToggle() {
    const toggle = node("open-filters");
    if (!toggle) return;
    const scope = filterScope();
    const applied = scope === activeCategory ? countSelection(activeFilters) : 0;
    toggle.hidden = getCategoryFilterGroups(scope).length === 0;
    toggle.textContent = applied ? `Filters · ${applied}` : "Filters";
    toggle.setAttribute("aria-expanded", String(filterCategory !== null));
  }

  function renderFilterPanel() {
    const host = node("variant-filters");
    renderFilters();
    renderSubFilters();
    renderFilterToggle();
    if (!host) return;
    if (!filterCategory) { host.hidden = true; return; }
    const pool = PRODUCTS.filter((p) => matchesCategory(p, filterCategory) && matchesSub(p) && matchesQuery(p) && matchesPrice(p));
    const groups = getCategoryFilterGroups(filterCategory)
      .map((g) => ({ g, options: g.options.filter((o) => pool.some((p) => ((p.variants || {})[g.id] || []).includes(o))) }))
      .filter((x) => x.options.length);
    for (const gid of Object.keys(pendingFilters)) {
      const group = groups.find((x) => x.g.id === gid);
      if (group) pendingFilters[gid] = pendingFilters[gid].filter((o) => group.options.includes(o));
      else delete pendingFilters[gid];
    }
    host.hidden = false;
    setText("vf-title", filterCategory === "All" ? "Filters" : `${filterCategory} filters`);
    const wrap = node("vf-groups");
    const none = filterCategory === "All"
      ? "No matching product offers these filters yet."
      : "No product in this category offers these filters yet.";
    wrap.innerHTML = groups.map(({ g, options }) => `
      <div class="vf-group">
        <span class="vf-name">${esc(g.name)}</span>
        <div class="vf-opts">${options.map((o) => `<button type="button" class="chip" data-fgroup="${esc(g.id)}" data-fopt="${esc(o)}" aria-pressed="${(pendingFilters[g.id] || []).includes(o)}">${esc(o)}</button>`).join("")}</div>
      </div>`).join("") || `<p class="vf-none">${none}</p>`;
    wrap.querySelectorAll("[data-fgroup]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gid = btn.getAttribute("data-fgroup");
        const opt = btn.getAttribute("data-fopt");
        const chosen = pendingFilters[gid] || (pendingFilters[gid] = []);
        const i = chosen.indexOf(opt);
        if (i < 0) chosen.push(opt); else chosen.splice(i, 1);
        if (!chosen.length) delete pendingFilters[gid];
        btn.setAttribute("aria-pressed", String(i < 0));
        updateFilterSummary();
      });
    });
    updateFilterSummary();
  }

  // "See Products (N)" appears once something is selected; N is the number of
  // products the grid will show after applying.
  function updateFilterSummary() {
    const pending = countSelection(pendingFilters);
    const see = node("see-products");
    see.hidden = !pending;
    node("vf-foot").hidden = !pending;
    if (pending) {
      const n = PRODUCTS.filter((p) => matchesCategory(p, filterCategory) && matchesSub(p) && matchesQuery(p) && matchesFilters(p, pendingFilters) && matchesPrice(p)).length;
      see.textContent = `See Products (${n})`;
    }
    const clearable = pending > 0 || (filterCategory === activeCategory && countSelection(activeFilters) > 0);
    node("clear-filters").hidden = !clearable;
  }

  function renderGrid() {
    const grid = node("grid");
    const list = PRODUCTS.filter(matches);
    const cards = list.map(cardHTML);
    // Only the home page defines a promo tile to splice into the grid.
    if (cards.length >= 4 && typeof window.gridBannerHTML === "function") cards.splice(Math.ceil(cards.length / 2), 0, window.gridBannerHTML());
    grid.innerHTML = cards.join("");
    setText("result-count", String(list.length));
    setText("collection-count", String(CATEGORIES.length - 1));
    node("no-results").hidden = list.length !== 0;

    grid.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-add");
        addToCart(id, 1);
        btn.classList.add("added");
        btn.textContent = "✓";
        toast(`Added ${getProduct(id).name} to cart`);
        setTimeout(() => { btn.classList.remove("added"); btn.textContent = "+"; }, 1000);
      });
    });
    grid.querySelectorAll("[data-wish]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-wish");
        const now = toggleWishlist(id);
        btn.classList.toggle("added", now);
        btn.textContent = now ? "♥" : "♡";
        btn.setAttribute("aria-pressed", String(now));
        toast(now ? `Saved ${getProduct(id).name} to wishlist` : `Removed ${getProduct(id).name} from wishlist`);
      });
    });
  }

  function render() { renderFilterPanel(); renderPriceToggle(); renderGrid(); }

  // Home page hooks: its promo banners pick a category and its search field
  // narrows the grid while typing instead of submitting.
  window.setCatalogueCategory = function (cat) {
    if (!CATEGORIES.includes(cat)) return;
    activeCategory = cat;
    activeSub = "";
    activeFilters = {};
    closeFilterPanel();
    renderGrid();
  };
  window.setCatalogueQuery = function (q) {
    query = String(q || "").trim().toLowerCase();
    render();
  };

  function init() {
    if (searchInput) searchInput.value = params.get("q") || "";
    const clear = node("clear-filters");
    if (clear) clear.addEventListener("click", () => {
      pendingFilters = {};
      if (filterCategory === activeCategory) activeFilters = {};
      render();
    });
    const close = node("close-filters");
    if (close) close.addEventListener("click", closeFilterPanel);
    const toggle = node("open-filters");
    if (toggle) toggle.addEventListener("click", () => { if (filterCategory) closeFilterPanel(); else openFilterPanel(filterScope()); });
    const see = node("see-products");
    if (see) see.addEventListener("click", () => {
      activeCategory = filterCategory;
      activeFilters = cloneFilters(pendingFilters);
      filterCategory = null;
      pendingFilters = {};
      render();
    });
    const priceToggle = node("open-price");
    if (priceToggle) priceToggle.addEventListener("click", () => { if (priceOpen) closePricePanel(); else openPricePanel(); });
    const closePrice = node("close-price");
    if (closePrice) closePrice.addEventListener("click", closePricePanel);
    const applyPriceBtn = node("apply-price");
    if (applyPriceBtn) applyPriceBtn.addEventListener("click", applyPrice);
    const clearPriceBtn = node("price-clear");
    if (clearPriceBtn) clearPriceBtn.addEventListener("click", clearPrice);
    ["price-min", "price-max"].forEach((id) => {
      const input = node(id);
      if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") applyPrice(); });
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
