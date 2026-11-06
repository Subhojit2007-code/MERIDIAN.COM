// Meridian storefront catalogue + shared view helpers.
// Prices are whole paise (INR) and mirror functions/catalog.ts for the 12
// server-known products. An optional localStorage overlay (written by the
// admin console) can edit/add/remove products and change display settings;
// the overlay is merged over BASE_PRODUCTS on load.
// NOTE: only ids present in functions/catalog.ts can actually be charged at
// checkout — the server re-prices from its own trusted catalog. Overlay-only
// products are storefront demos and will be rejected by the checkout function.

// Built-in category names (the admin console can add/remove these via the
// overlay). "All" is always prepended for the filter row, never stored here.
const BASE_CATEGORIES = ["Electronics", "Home", "Apparel", "Accessories"];

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
function money(paise) { return INR.format(paise / 100); }

// Pages sit either at the site root or inside html/, so every link is built from
// this prefix and one template works in both places.
function rootPrefix() { return /\/html\/[^/]*$/.test(location.pathname) ? "../" : ""; }
function productPageURL(id) { return rootPrefix() + "html/product.html?id=" + encodeURIComponent(id); }
function searchPageURL(q) { return rootPrefix() + "html/search.html?q=" + encodeURIComponent(q == null ? "" : q); }
function onSearchPage() { return /\/search\.html$/.test(location.pathname); }

const ICONS = {
  All: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
  Electronics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="2.5" y="13" width="4.5" height="7" rx="2"/><rect x="17" y="13" width="4.5" height="7" rx="2"/></svg>',
  Home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
  Apparel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 6l2 3 2-1v11h8V8l2 1 2-3-4-3-2 2h-4Z"/></svg>',
  Accessories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
};
function iconFor(category) { return ICONS[category] || ICONS.Accessories; }

// Cover-fit background for an uploaded or hosted photo.
function mediaImageStyle(src) {
  return `background-image:url('${resolveImageUrl(src).replace(/'/g, "%27")}');background-size:cover;background-position:center`;
}

// URLs pasted into js/images.js, keyed by product / banner / slide id. They fill
// any picture the admin dashboard has left empty; a dashboard value always wins,
// so an uploaded photo is never replaced by this file.
const FILE_IMAGES = typeof SITE_IMAGES === "object" && SITE_IMAGES ? SITE_IMAGES : {};
function fileImages(section) {
  const s = FILE_IMAGES[section];
  return s && typeof s === "object" ? s : {};
}
// A value from images.js is either a full URL (scheme, or root-relative) or a
// path written from the site root. Pages inside html/ sit one level down, so
// those paths need "../" to reach the same file. Resolution happens where a URL
// is emitted, never where it is stored, so saved data stays page-independent.
const SITE_ROOT_PREFIX = /\/html\/[^/]*$/.test(location.pathname) ? "../" : "";
function resolveImageUrl(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s[0] === "/" || s[0] === "#") return s;
  return SITE_ROOT_PREFIX + (s.includes("%") ? s : encodeURI(s));
}
function imageOr(stored, fromFile) {
  if (typeof stored === "string" && stored.trim()) return stored;
  return typeof fromFile === "string" ? fromFile.trim() : "";
}
function withFileProductImages(list) {
  const urls = fileImages("products");
  return list.map((p) => {
    const u = urls[p.id];
    if (!u || typeof u !== "object") return p;
    // A picture already chosen in the dashboard wins outright: filling only the
    // empty thumb would let images.js override it, because the thumb is what the
    // tile shows first.
    if (p.image || p.thumb) return p;
    const image = imageOr(p.image, u.image);
    const thumb = imageOr(p.thumb, u.thumb);
    return image === p.image && thumb === p.thumb ? p : Object.assign({}, p, { image, thumb });
  });
}
function withFileIdImages(list, section) {
  const urls = fileImages(section);
  return list.map((item) => (item && urls[item.id] ? Object.assign({}, item, { image: imageOr(item.image, urls[item.id]) }) : item));
}

// Category and sub-category tiles are keyed by the names shown on the site,
// not by an id, because those names are what the dashboard lists.
function fileCategoryImages(name) {
  const all = FILE_IMAGES.categories;
  const c = all && typeof all === "object" ? all[name] : null;
  return c && typeof c === "object" ? c : {};
}
function fileSubImages(name) {
  const subs = fileCategoryImages(name).subs;
  return subs && typeof subs === "object" ? subs : {};
}
function withFileCategoryImages(meta) {
  const out = {};
  for (const name of Object.keys(meta)) {
    const m = meta[name];
    const subs = fileSubImages(name);
    out[name] = {
      image: imageOr(m.image, fileCategoryImages(name).image),
      subs: m.subs.map((s) => (s.image ? s : Object.assign({}, s, { image: imageOr(s.image, subs[s.name]) }))),
    };
  }
  return out;
}

// The reverse of the two merges above, applied when saving. A picture that
// js/images.js supplies must not be copied into browser storage: stored values
// win over the file, so keeping one would silently freeze it and every later
// edit to that file would do nothing. A value matching the file is treated as
// "the dashboard never set this", including when the admin typed the very same
// path — the rendered result is identical either way.
function dropFileIdImages(list, section) {
  const urls = fileImages(section);
  return (Array.isArray(list) ? list : []).map((item) => {
    if (!item || !urls[item.id]) return item;
    const fromFile = imageOr("", urls[item.id]);
    return fromFile && item.image === fromFile ? Object.assign({}, item, { image: "" }) : item;
  });
}
function stripFileCategoryImages(meta) {
  const out = {};
  for (const name of Object.keys(meta || {})) {
    const m = meta[name];
    const subs = fileSubImages(name);
    const catImage = imageOr("", fileCategoryImages(name).image);
    out[name] = {
      image: catImage && m.image === catImage ? "" : m.image,
      subs: m.subs.map((s) => {
        const subImage = imageOr("", subs[s.name]);
        return subImage && s.image === subImage ? Object.assign({}, s, { image: "" }) : s;
      }),
    };
  }
  return out;
}
function stripFileImages(products, settings) {
  const s = Object.assign({}, settings);
  const logo = imageOr("", FILE_IMAGES.logo);
  if (logo && s.logo === logo) s.logo = "";
  const spot = imageOr("", FILE_IMAGES.spotlightBanner);
  s.gridBanner = Object.assign({}, s.gridBanner);
  if (spot && s.gridBanner.image === spot) s.gridBanner.image = "";
  s.banners = dropFileIdImages(s.banners, "banners");
  s.heroSlides = dropFileIdImages(s.heroSlides, "heroSlides");
  s.categoryMeta = stripFileCategoryImages(s.categoryMeta);
  const urls = fileImages("products");
  const out = (Array.isArray(products) ? products : []).map((p) => {
    const u = p && urls[p.id];
    if (!u || typeof u !== "object") return p;
    // All-or-nothing, exactly like the merge: either the pair is what the file
    // supplies, or the dashboard chose the pictures and both are kept.
    const image = imageOr("", u.image);
    const thumb = imageOr("", u.thumb);
    return (image || thumb) && p.image === image && p.thumb === thumb
      ? Object.assign({}, p, { image: "", thumb: "" })
      : p;
  });
  return { products: out, settings: s };
}

// A product's solid tile colour: a six-digit hex, or "" when unset/invalid.
function solidColor(v) {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : "";
}
function productColor(p) {
  // Products saved before gradients were dropped carry `grad`; keep their first colour.
  return solidColor(p.color) || solidColor(Array.isArray(p.grad) ? p.grad[0] : "") || "#123c33";
}

// Inline background for a product's media tile: the uploaded photo when set,
// otherwise the product's solid colour. Used by the grid cards and product page.
// A dedicated thumbnail (set in the admin editor) wins over the main image.
function productMediaStyle(p) {
  const img = p.thumb || p.image;
  if (img) return mediaImageStyle(img);
  return `background:${productColor(p)}; color:#fff`;
}
// The category icon is only shown when there is no photo to fill the tile.
function productMediaIcon(p) { return (p.thumb || p.image) ? "" : iconFor(p.category); }

// Square tile art for the storefront category rows: the uploaded photo when
// there is one, otherwise a line icon. A sub-category with no photo of its own
// passes its parent's name so it borrows the parent icon.
function categoryTileArt(iconName, image) {
  return image
    ? `<span class="cat-thumb" style="${mediaImageStyle(image)}"></span>`
    : `<span class="cat-thumb cat-art">${iconFor(iconName)}</span>`;
}

// --- Pricing, stock & merchandising helpers ---------------------------------
// A discount is display/storefront-only (percent or flat paise off the base
// price). Checkout still re-prices server-side from functions/catalog.ts, so a
// discount never changes what the payment provider charges.
function productDiscount(p) {
  const d = p && p.discount;
  if (!d || typeof d !== "object") return null;
  const type = d.type === "percent" ? "percent" : d.type === "flat" ? "flat" : null;
  if (!type) return null;
  const value = Number.isFinite(d.value) ? Math.max(0, d.value) : 0;
  if (value <= 0) return null;
  if (type === "percent" && value > 90) return null;
  return { type, value };
}
// Effective unit price in paise after any discount.
function priceOf(p) {
  const base = Number.isFinite(p && p.price) ? p.price : 0;
  const d = productDiscount(p);
  if (!d) return base;
  return d.type === "percent" ? Math.round(base * (1 - d.value / 100)) : Math.max(0, base - d.value);
}
function productThumb(p) { return (p && (p.thumb || p.image)) || ""; }
// null means "untracked / unlimited"; a number is real stock on hand.
function productStock(p) { return Number.isFinite(p && p.stock) ? Math.max(0, Math.round(p.stock)) : null; }
function productMinQty(p) { return Math.max(1, Number.isFinite(p && p.minQty) ? Math.round(p.minQty) : 1); }

const BASE_PRODUCTS = [
  {
    id: "aurora-headphones", name: "Aurora Wireless Headphones", category: "Electronics",
    desc: "Over-ear adaptive noise-cancelling headphones.",
    blurb: "Studio-grade sound with adaptive noise cancelling, 40-hour battery and plush memory-foam earcups for all-day listening.",
    price: 1099900, was: 1299900, badge: "Best seller", rating: 4.7, reviewCount: 214,
    color: "#123c33",
    features: ["Adaptive hybrid ANC", "40-hour battery, fast charge", "Multipoint Bluetooth 5.3", "Memory-foam earcups"],
    reviews: [
      { name: "Ananya R.", rating: 5, date: "2026-08-14", title: "Silence on demand", body: "The noise cancelling on flights is unreal. Battery easily lasts a week of commutes." },
      { name: "Vikram S.", rating: 4, date: "2026-07-30", title: "Great sound", body: "Warm bass, clear mids. Clamp is a little tight at first but loosens up." },
    ],
  },
  {
    id: "pulse-smartwatch", name: "Pulse Smart Watch", category: "Electronics",
    desc: "Always-on smart watch with health tracking.",
    blurb: "A bright always-on display with heart-rate, SpO2 and sleep tracking, plus 7-day battery and 5ATM water resistance.",
    price: 1699900, badge: "New", rating: 4.5, reviewCount: 138,
    color: "#2b3a67",
    features: ["Always-on AMOLED", "Heart-rate, SpO2 & sleep", "7-day battery life", "5ATM water resistant"],
    reviews: [
      { name: "Meera K.", rating: 5, date: "2026-09-02", title: "Battery is the headline", body: "Charged it Sunday, still at 40% the following Friday. Sleep tracking is surprisingly detailed." },
      { name: "Rahul D.", rating: 4, date: "2026-08-21", title: "Does the job", body: "Notifications and workouts are solid. Wish the app library were bigger." },
    ],
  },
  {
    id: "nimbus-speaker", name: "Nimbus Bluetooth Speaker", category: "Electronics",
    desc: "Water-resistant 360° Bluetooth speaker.",
    blurb: "Room-filling 360° sound in a rugged, water-resistant body with 20 hours of playback and USB-C charging.",
    price: 649900, was: 749900, rating: 4.4, reviewCount: 96,
    color: "#1b6ca8",
    features: ["360° omnidirectional sound", "IP67 water & dust resistant", "20-hour playtime", "Stereo pairing"],
    reviews: [
      { name: "Sara T.", rating: 5, date: "2026-08-05", title: "Take it anywhere", body: "Survived a beach trip and a monsoon balcony party. Loud for its size." },
      { name: "Imran Q.", rating: 4, date: "2026-06-19", title: "Punchy", body: "Bass is strong; highs can get a touch sharp at max volume." },
    ],
  },
  {
    id: "lumen-lamp", name: "Lumen Desk Lamp", category: "Home",
    desc: "Dimmable LED task lamp.",
    blurb: "A flicker-free dimmable LED task lamp with adjustable colour temperature and a weighted arm that stays put.",
    price: 429900, rating: 4.6, reviewCount: 71,
    color: "#b4762a",
    features: ["Stepless dimming", "2700K–6000K colour temp", "Flicker-free LED", "Weighted, adjustable arm"],
    reviews: [
      { name: "Dev P.", rating: 5, date: "2026-07-11", title: "Perfect desk light", body: "The warm-to-cool range is great for evening reading and daytime focus." },
      { name: "Nisha G.", rating: 4, date: "2026-05-28", title: "Sturdy", body: "Feels premium and doesn't wobble. Touch controls took a day to get used to." },
    ],
  },
  {
    id: "terra-mugs", name: "Terra Ceramic Mug Set", category: "Home",
    desc: "Set of four hand-glazed stoneware mugs.",
    blurb: "Four hand-glazed stoneware mugs with a reactive finish — no two are exactly alike. Dishwasher and microwave safe.",
    price: 299900, rating: 4.8, reviewCount: 152,
    color: "#8a5a3b",
    features: ["Set of four", "Hand-glazed reactive finish", "Dishwasher & microwave safe", "350ml capacity"],
    reviews: [
      { name: "Leah M.", rating: 5, date: "2026-08-27", title: "Gorgeous glaze", body: "Each mug is subtly different. They feel handmade because they are." },
      { name: "Farhan A.", rating: 5, date: "2026-07-03", title: "Great gift", body: "Bought as a housewarming gift and ended up ordering a second set for us." },
    ],
  },
  {
    id: "cove-blanket", name: "Cove Throw Blanket", category: "Home",
    desc: "Heavyweight waffle-knit cotton throw.",
    blurb: "A heavyweight waffle-knit cotton throw that breathes in summer and layers in winter. Machine washable.",
    price: 499900, was: 599900, badge: "20% off", rating: 4.7, reviewCount: 88,
    color: "#6b2d5c",
    features: ["100% waffle-knit cotton", "130 × 170 cm", "Heavyweight yet breathable", "Machine washable"],
    reviews: [
      { name: "Tara V.", rating: 5, date: "2026-09-08", title: "So cosy", body: "The waffle texture is lovely and it washes without pilling." },
      { name: "Joel E.", rating: 4, date: "2026-06-30", title: "Warm", body: "Heavier than expected in a good way. Great for the sofa." },
    ],
  },
  {
    id: "meridian-tee", name: "Meridian Crew Tee", category: "Apparel",
    desc: "Organic cotton crew-neck tee.",
    blurb: "A mid-weight organic cotton crew-neck with a clean drape and pre-shrunk fit that holds its shape wash after wash.",
    price: 199900, rating: 4.3, reviewCount: 205,
    color: "#3f6212",
    features: ["100% organic cotton", "Pre-shrunk, true to size", "Reinforced collar", "Mid-weight 180gsm"],
    reviews: [
      { name: "Kabir N.", rating: 4, date: "2026-08-16", title: "Solid basic", body: "Soft, good fit, no shrinkage after three washes." },
      { name: "Elena B.", rating: 5, date: "2026-07-22", title: "My new staple", body: "Bought two more. The drape is exactly what I wanted." },
    ],
  },
  {
    id: "trail-hoodie", name: "Trail Knit Hoodie", category: "Apparel",
    desc: "Mid-weight fleece hoodie.",
    blurb: "A mid-weight brushed-fleece hoodie with a lined hood, ribbed cuffs and a kangaroo pocket built for layering.",
    price: 549900, badge: "New", rating: 4.6, reviewCount: 64,
    color: "#334155",
    features: ["Brushed mid-weight fleece", "Lined adjustable hood", "Ribbed cuffs & hem", "Kangaroo pocket"],
    reviews: [
      { name: "Omar S.", rating: 5, date: "2026-09-01", title: "Warm and soft", body: "The inside fleece is plush. Fits relaxed, size down for a snug fit." },
      { name: "Priya L.", rating: 4, date: "2026-08-09", title: "Good layering piece", body: "Not too bulky under a jacket. Hood actually stays up." },
    ],
  },
  {
    id: "drift-chinos", name: "Drift Chino Pants", category: "Apparel",
    desc: "Tapered stretch-cotton chinos.",
    blurb: "Tapered stretch-cotton chinos with a comfortable mid-rise, hidden comfort waistband and four pockets.",
    price: 449900, was: 549900, rating: 4.4, reviewCount: 117,
    color: "#7c5b34",
    features: ["98% cotton, 2% elastane", "Tapered mid-rise fit", "Comfort waistband", "Four pockets"],
    reviews: [
      { name: "Arjun W.", rating: 4, date: "2026-07-18", title: "Office ready", body: "Smart enough for work, stretchy enough for a long day." },
      { name: "Sofia R.", rating: 5, date: "2026-06-25", title: "Great fit", body: "The taper is modern without being skinny. Length was perfect." },
    ],
  },
  {
    id: "atlas-backpack", name: "Atlas Canvas Backpack", category: "Accessories",
    desc: "22L waxed-canvas laptop backpack.",
    blurb: "A 22L waxed-canvas backpack with a padded 16-inch laptop sleeve, leather trims and weather-resistant zips.",
    price: 699900, badge: "Best seller", rating: 4.8, reviewCount: 143,
    color: "#3f4a3c",
    features: ["22L waxed canvas", "Padded 16\" laptop sleeve", "Leather trims", "Weather-resistant zips"],
    reviews: [
      { name: "Hannah C.", rating: 5, date: "2026-08-30", title: "Built to last", body: "The canvas has already developed a nice patina. Laptop sleeve is well padded." },
      { name: "Diego M.", rating: 5, date: "2026-07-07", title: "Perfect size", body: "Fits everything for a day trip plus my 16-inch laptop comfortably." },
    ],
  },
  {
    id: "ridge-bottle", name: "Ridge Steel Water Bottle", category: "Accessories",
    desc: "Insulated 750ml steel bottle.",
    blurb: "A double-wall insulated 750ml steel bottle that keeps drinks cold 24 hours or hot 12, with a leak-proof lid.",
    price: 219900, rating: 4.5, reviewCount: 178,
    color: "#0f766e",
    features: ["750ml double-wall steel", "Cold 24h / hot 12h", "Leak-proof lid", "Powder-coat grip"],
    reviews: [
      { name: "Yusuf K.", rating: 5, date: "2026-08-12", title: "Stays cold", body: "Ice still intact after a full day out. No condensation on the outside." },
      { name: "Grace H.", rating: 4, date: "2026-06-14", title: "Good bottle", body: "Love the finish. A bit tall for small cup holders." },
    ],
  },
  {
    id: "halo-sunglasses", name: "Halo Sunglasses", category: "Accessories",
    desc: "Polarised UV400 acetate sunglasses.",
    blurb: "Polarised UV400 lenses in a hand-polished acetate frame with stainless-steel hinges and a hard case.",
    price: 349900, was: 429900, rating: 4.2, reviewCount: 59,
    color: "#7c2d12",
    features: ["Polarised UV400 lenses", "Hand-polished acetate", "Stainless-steel hinges", "Hard case included"],
    reviews: [
      { name: "Nikhil J.", rating: 4, date: "2026-07-29", title: "Great glare reduction", body: "Polarisation really helps while driving. Frame feels quality." },
      { name: "Aisha F.", rating: 4, date: "2026-05-16", title: "Stylish", body: "Flattering shape and the case is a nice touch." },
    ],
  },
];

// Product attribute (specification) definitions the admin can manage. Each has
// a stable id, a display name, a type ("text" free-form or "select" choices)
// and, for selects, the allowed options. Products carry values in an `attrs`
// map keyed by these ids; the product page renders the filled ones as specs.
const DEFAULT_ATTRIBUTES = [
  { id: "brand", name: "Brand", type: "text", options: [] },
  { id: "material", name: "Material", type: "text", options: [] },
  { id: "colour", name: "Colour", type: "text", options: [] },
  { id: "size", name: "Size / capacity", type: "text", options: [] },
  { id: "weight", name: "Weight", type: "text", options: [] },
  { id: "warranty", name: "Warranty", type: "text", options: [] },
  { id: "availability", name: "Availability", type: "select", options: ["In stock", "Low stock", "Pre-order", "Out of stock"] },
  { id: "connectivity", name: "Connectivity", type: "multi", options: ["Bluetooth", "USB-C", "3.5 mm jack", "Wi-Fi", "NFC"] },
];

// Sensible starting specs for the 12 built-in products, keyed by attribute id.
const BASE_ATTRS = {
  "aurora-headphones": { brand: "Meridian Audio", material: "Aluminium, protein leather", colour: "Midnight Green", size: "Over-ear", weight: "298 g", warranty: "2 years", availability: "In stock", connectivity: ["Bluetooth", "USB-C", "3.5 mm jack"] },
  "pulse-smartwatch": { brand: "Meridian Pulse", material: "Steel, sapphire glass", colour: "Graphite", size: "44 mm case", weight: "52 g", warranty: "1 year", availability: "In stock", connectivity: ["Bluetooth", "USB-C", "NFC"] },
  "nimbus-speaker": { brand: "Meridian Audio", material: "Recycled polymer, mesh", colour: "Slate Blue", size: "18 × 7 cm", weight: "680 g", warranty: "2 years", availability: "Low stock", connectivity: ["Bluetooth", "USB-C"] },
  "lumen-lamp": { brand: "Meridian Home", material: "Powder-coated steel", colour: "Warm Brass", size: "40 cm arm", weight: "1.4 kg", warranty: "2 years", availability: "In stock" },
  "terra-mugs": { brand: "Meridian Home", material: "Glazed stoneware", colour: "Reactive Sand", size: "350 ml each", weight: "1.6 kg (set)", warranty: "6 months", availability: "In stock" },
  "cove-blanket": { brand: "Meridian Home", material: "100% waffle-knit cotton", colour: "Plum", size: "130 × 170 cm", weight: "1.1 kg", warranty: "6 months", availability: "In stock" },
  "meridian-tee": { brand: "Meridian", material: "Organic cotton 180 gsm", colour: "Olive", size: "S / M / L / XL", weight: "190 g", warranty: "—", availability: "In stock" },
  "trail-hoodie": { brand: "Meridian", material: "Brushed cotton fleece", colour: "Charcoal", size: "S / M / L / XL", weight: "520 g", warranty: "—", availability: "Pre-order" },
  "drift-chinos": { brand: "Meridian", material: "98% cotton, 2% elastane", colour: "Khaki", size: "30–38 waist", weight: "480 g", warranty: "—", availability: "In stock" },
  "atlas-backpack": { brand: "Meridian Carry", material: "Waxed canvas, leather trim", colour: "Field Green", size: "22 L", weight: "1.2 kg", warranty: "5 years", availability: "In stock" },
  "ridge-bottle": { brand: "Meridian Carry", material: "Double-wall stainless steel", colour: "Teal", size: "750 ml", weight: "340 g", warranty: "Lifetime", availability: "In stock" },
  "halo-sunglasses": { brand: "Meridian", material: "Acetate, stainless hinges", colour: "Amber Tortoise", size: "52 mm lens", weight: "28 g", warranty: "1 year", availability: "Low stock" },
};
BASE_PRODUCTS.forEach((p) => { if (BASE_ATTRS[p.id]) p.attrs = Object.assign({}, BASE_ATTRS[p.id]); });

// Variant option groups the admin can manage under the "Variants" tab. Each
// group has a stable id, a display name and a master list of choices. A product
// "offers" a group by storing a non-empty SUBSET of that group's choices in its
// `variants` map (keyed by group id). Shoppers pick one choice per offered
// group on the product page; the selection is recorded on the cart line so
// different variants stay separate.
// NOTE: variants never change the charged price. Checkout re-prices from
// functions/catalog.ts by product id only, so a variant is a storefront/cart
// detail (like attributes and images), not a distinct chargeable SKU.
const DEFAULT_VARIANT_GROUPS = [
  { id: "colour", name: "Colour", options: ["Midnight Green", "Slate Blue", "Graphite", "Black", "White", "Warm Brass", "Reactive Sand", "Plum", "Olive", "Charcoal", "Khaki", "Field Green", "Teal", "Amber Tortoise", "Navy", "Terracotta"] },
  { id: "size", name: "Size", options: ["XS", "S", "M", "L", "XL", "XXL", "30 waist", "32 waist", "34 waist", "36 waist"] },
  { id: "capacity", name: "Capacity", options: ["350 ml", "500 ml", "750 ml", "1 L", "Set of 2", "Set of 4", "Set of 6"] },
  { id: "finish", name: "Finish", options: ["Matte", "Gloss", "Brushed", "Polished"] },
  { id: "lens", name: "Lens", options: ["Grey", "Brown", "Blue mirror", "Clear"] },
];

// Sensible starting variant selections for the 12 built-in products, keyed by
// variant group id. Every product offers at least one group.
const BASE_VARIANTS = {
  "aurora-headphones": { colour: ["Midnight Green", "Slate Blue", "Graphite", "Black"], finish: ["Matte", "Polished"] },
  "pulse-smartwatch": { colour: ["Graphite", "Black", "White"], finish: ["Brushed", "Polished"] },
  "nimbus-speaker": { colour: ["Slate Blue", "Black", "Terracotta"] },
  "lumen-lamp": { colour: ["Warm Brass", "Black", "White"], finish: ["Matte", "Brushed"] },
  "terra-mugs": { colour: ["Reactive Sand", "Plum"], capacity: ["Set of 2", "Set of 4", "Set of 6"] },
  "cove-blanket": { colour: ["Plum", "Charcoal", "Olive"] },
  "meridian-tee": { colour: ["Olive", "Black", "White", "Navy"], size: ["S", "M", "L", "XL"] },
  "trail-hoodie": { colour: ["Charcoal", "Olive", "Navy"], size: ["S", "M", "L", "XL"] },
  "drift-chinos": { colour: ["Khaki", "Navy", "Charcoal"], size: ["30 waist", "32 waist", "34 waist", "36 waist"] },
  "atlas-backpack": { colour: ["Field Green", "Charcoal", "Black"] },
  "ridge-bottle": { colour: ["Teal", "Black", "White"], capacity: ["500 ml", "750 ml", "1 L"] },
  "halo-sunglasses": { colour: ["Amber Tortoise", "Black"], lens: ["Grey", "Brown", "Blue mirror"] },
};
function cloneVariants(v) {
  const out = {};
  for (const k of Object.keys(v)) out[k] = v[k].slice();
  return out;
}
BASE_PRODUCTS.forEach((p) => { if (BASE_VARIANTS[p.id]) p.variants = cloneVariants(BASE_VARIANTS[p.id]); });

// Starting sub-categories, keyed by category name. Ids are stable across renames
// because products point at them.
const DEFAULT_CATEGORY_META = {
  Electronics: { image: "", subs: [{ id: "audio", name: "Audio", image: "" }, { id: "wearables", name: "Wearables", image: "" }] },
  Home: { image: "", subs: [{ id: "lighting", name: "Lighting", image: "" }, { id: "tabletop", name: "Tabletop", image: "" }, { id: "comfort", name: "Comfort", image: "" }] },
  Apparel: { image: "", subs: [{ id: "tops", name: "Tops", image: "" }, { id: "bottoms", name: "Bottoms", image: "" }] },
  Accessories: { image: "", subs: [{ id: "bags", name: "Bags", image: "" }, { id: "drinkware", name: "Drinkware", image: "" }, { id: "eyewear", name: "Eyewear", image: "" }] },
};
// The sub-category each built-in product belongs to; every id above must exist
// in DEFAULT_CATEGORY_META for the product's own category.
const BASE_SUBCATEGORY = {
  "aurora-headphones": "audio",
  "nimbus-speaker": "audio",
  "pulse-smartwatch": "wearables",
  "lumen-lamp": "lighting",
  "terra-mugs": "tabletop",
  "cove-blanket": "comfort",
  "meridian-tee": "tops",
  "trail-hoodie": "tops",
  "drift-chinos": "bottoms",
  "atlas-backpack": "bags",
  "ridge-bottle": "drinkware",
  "halo-sunglasses": "eyewear",
};
BASE_PRODUCTS.forEach((p) => { if (BASE_SUBCATEGORY[p.id]) p.subcategory = BASE_SUBCATEGORY[p.id]; });

// --- Catalogue overlay (admin console) -------------------------------------
const CATALOG_KEY = "meridian_catalog_v1";

// Site-wide colour tokens the appearance picker can override. Keys map to the
// CSS custom properties defined in :root (styles.css); every tint, shadow and
// overlay in the sheet is mixed from these, so the whole palette follows them.
const DEFAULT_THEME = {
  bg: "#f6f5f2",
  surface: "#ffffff",
  ink: "#16211d",
  inkSoft: "#5b6b64",
  line: "#e4e2dc",
  accent: "#1f6f5c",
  accentInk: "#123c33",
  onAccent: "#ffffff",
  star: "#e8a317",
  starMuted: "#d6d3cc",
  danger: "#b42318",
};
const THEME_VARS = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  inkSoft: "--ink-soft",
  line: "--line",
  accent: "--accent",
  accentInk: "--accent-ink",
  onAccent: "--on-accent",
  star: "--star",
  starMuted: "--star-muted",
  danger: "--danger",
};
const THEME_LABELS = {
  bg: "Page background",
  surface: "Card / surface",
  ink: "Primary text",
  inkSoft: "Muted text",
  line: "Borders",
  accent: "Accent",
  accentInk: "Accent (dark)",
  onAccent: "Text on colour",
  star: "Rating stars",
  starMuted: "Empty stars",
  danger: "Errors / sale",
};

// Promotional tiles rendered on the storefront home page. linkType decides how
// `target` is interpreted: product → product id, category → category name,
// scroll → in-page anchor, url → external/absolute link.
const DEFAULT_BANNERS = [
  { id: "b1", kicker: "Up to 20% off", title: "Sound & wearables", sub: "Headphones, watches, speakers", image: "", theme: "a", linkType: "category", target: "Electronics", enabled: true },
  { id: "b2", kicker: "New arrivals", title: "The cosy home edit", sub: "Lighting, ceramics, throws", image: "", theme: "b", linkType: "category", target: "Home", enabled: true },
  { id: "b3", kicker: "Free shipping", title: "On orders over ₹5,000", sub: "Across every collection", image: "", theme: "c", linkType: "scroll", target: "#catalogue", enabled: true },
];

// Slides for the auto-scrolling hero banner on the home page. Each slide is a
// solid brand panel by default; the admin can upload/attach an image (stored
// as a compressed data URL) plus optional caption text and a link.
const DEFAULT_HERO_SLIDES = [
  { id: "s2", image: "", kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s3", image: "", kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s4", image: "", kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s5", image: "", kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
];

// The named promotional banner shown half-way through the product grid on the
// shop page. It keeps the solid brand background unless an image is attached.
// Managed by the admin "Spotlight Banner" dashboard.
const DEFAULT_GRID_BANNER = {
  name: "Spotlight Banner",
  ctaLabel: "Shop the edit",
  linkType: "scroll",
  target: "#catalogue",
  image: "",
  enabled: true,
};

// Password policy shown live on the signup form. minLength is inclusive.
const DEFAULT_PASSWORD_POLICY = {
  minLength: 9,
  requireUpper: true,
  requireSpecial: true,
  requireNumber: false,
};

// Store policies surfaced to shoppers from the footer. Admins edit these under
// Admin → Rules; the defaults below mirror the shipping and payment settings so
// a fresh store publishes an accurate policy without any setup.
const DEFAULT_RULES = [
  {
    id: "shipping",
    title: "Shipping & delivery",
    body: "Orders are packed within 1–2 business days and delivered in 3–7 business days across India. Shipping is a flat ₹99 per order, and free on orders over ₹5,000. You will get a tracking link by email as soon as your order ships.",
  },
  {
    id: "returns",
    title: "Returns & refunds",
    body: "Unused items in their original packaging can be returned within 30 days of delivery for a full refund. Refunds are issued to the original payment method within 7 business days of us receiving the return. Sale items and opened personal-care products are final sale.",
  },
  {
    id: "warranty",
    title: "Warranty & product care",
    body: "Every product carries a 12-month warranty against manufacturing defects. The warranty does not cover accidental damage, misuse or normal wear. Care instructions for each item are listed on its product page.",
  },
  {
    id: "payments",
    title: "Payments & security",
    body: "Card and UPI payments are processed by our payment partners, Stripe and Razorpay. Payment details are entered on the partner's own secure page and never reach or are stored by this site; their secret keys are held server-side and are never sent to your browser. Prices are shown in Indian rupees and are inclusive of applicable taxes.",
  },
  {
    id: "privacy",
    title: "Privacy & your data",
    body: "We use your name, email and address only to fulfil your orders and answer support requests. We never sell your details to third parties. This demo storefront keeps your cart, wishlist and order history in this browser only.",
  },
];

// Payment gateways the admin can configure. Each has a public Key — safe to
// store, the browser sends it to the gateway — and a Secret that is never
// stored here: it belongs in Sites Settings under `secretEnv`, where only the
// Edge Function can read it. Both gateways collect UPI on their own page.
const PAYMENT_PROVIDERS = [
  {
    id: "stripe",
    label: "Stripe",
    secretEnv: "STRIPE_SECRET_KEY",
    keyPrefixes: ["pk_test_", "pk_live_"],
    keyPlaceholder: "pk_test_51…",
    keyHint: "Starts with pk_test_ or pk_live_.",
    blurb: "Cards and UPI on Stripe's hosted checkout page.",
  },
  {
    id: "razorpay",
    label: "Razorpay",
    secretEnv: "RAZORPAY_KEY_SECRET",
    keyPrefixes: ["rzp_test_", "rzp_live_"],
    keyPlaceholder: "rzp_test_…",
    keyHint: "Starts with rzp_test_ or rzp_live_.",
    blurb: "UPI, cards and netbanking in the Razorpay checkout popup.",
  },
];
const PROVIDER_IDS = PAYMENT_PROVIDERS.map((p) => p.id);

const DEFAULT_PAYMENTS = {
  enabled: true,
  provider: "stripe", // gateway UPI checkout prefers when several are on
  currency: "INR",
  statementDescriptor: "MERIDIAN",
  testMode: true,
  upi: true,
  providers: {
    stripe: { enabled: true, key: "", secretAt: "" },
    razorpay: { enabled: false, key: "", secretAt: "" },
  },
};

function paymentProvider(id) {
  return PAYMENT_PROVIDERS.find((p) => p.id === id) || null;
}

// Merge saved payment settings over the defaults. A secret is deliberately
// absent from the model: if an older overlay ever carried one, drop it here so
// an exported backup can never leak a credential.
function normalizePayments(src) {
  const s = src && typeof src === "object" ? src : {};
  const saved = s.providers && typeof s.providers === "object" ? s.providers : {};
  const providers = {};
  for (const id of PROVIDER_IDS) {
    const d = DEFAULT_PAYMENTS.providers[id];
    const p = saved[id] && typeof saved[id] === "object" ? saved[id] : {};
    // The pre-multi-gateway field held the Stripe publishable key.
    const legacyKey = id === "stripe" && typeof s.publishableKey === "string" ? s.publishableKey.trim() : "";
    const key = typeof p.key === "string" ? p.key.trim().slice(0, 200) : "";
    const secretAt = typeof p.secretAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p.secretAt) ? p.secretAt : "";
    providers[id] = { enabled: p.enabled === true || (p.enabled === undefined && d.enabled), key: key || legacyKey, secretAt };
  }
  const enabledIds = PROVIDER_IDS.filter((id) => providers[id].enabled);
  const provider = PROVIDER_IDS.includes(s.provider) ? s.provider : DEFAULT_PAYMENTS.provider;
  return {
    enabled: s.enabled !== false,
    provider: enabledIds.includes(provider) ? provider : enabledIds[0] || DEFAULT_PAYMENTS.provider,
    currency: typeof s.currency === "string" && s.currency.trim() ? s.currency.trim().toUpperCase().slice(0, 8) : DEFAULT_PAYMENTS.currency,
    statementDescriptor: typeof s.statementDescriptor === "string" ? s.statementDescriptor.trim().slice(0, 22) : DEFAULT_PAYMENTS.statementDescriptor,
    testMode: s.testMode !== false,
    upi: s.upi !== false,
    providers,
  };
}

// The gateways a shopper can actually pay through, in dashboard order.
function enabledPaymentProviders(payments) {
  const pay = payments || getPayments();
  if (!pay.enabled) return [];
  return PROVIDER_IDS.filter((id) => pay.providers[id].enabled).map((id) => Object.assign({}, paymentProvider(id), pay.providers[id]));
}

// UPI options offered at checkout: one per enabled gateway, preferred first.
function upiOptions(payments) {
  const pay = payments || getPayments();
  if (!pay.enabled || !pay.upi) return [];
  const list = enabledPaymentProviders(pay);
  const first = list.findIndex((p) => p.id === pay.provider);
  if (first > 0) list.unshift(list.splice(first, 1)[0]);
  return list;
}

// Sitemap generator config. baseUrl is the canonical store address every
// <loc> is built from; the flags decide which real storefront pages are listed
// and the per-type pairs tell a crawler how often to come back and how much
// those pages matter relative to each other.
const DEFAULT_SITEMAP = {
  baseUrl: "https://meridian-store-1960f2kw1jk.qoder.website",
  includeHome: true,
  includeCategories: true,
  includeProducts: true,
  includeSearch: false,
  includeOutOfStock: true,
  includeLastmod: true,
  changefreq: { home: "daily", category: "daily", product: "weekly", page: "monthly" },
  priority: { home: "1.0", category: "0.8", product: "0.9", page: "0.5" },
};

const SITEMAP_TYPES = ["home", "category", "product", "page"];
const SITEMAP_FREQS = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];

function normalizeSitemap(src) {
  const s = src && typeof src === "object" ? src : {};
  const d = DEFAULT_SITEMAP;
  const bool = (v, fallback) => (typeof v === "boolean" ? v : fallback);
  const base = typeof s.baseUrl === "string" && s.baseUrl.trim() ? s.baseUrl.trim().slice(0, 300) : d.baseUrl;
  const freq = s.changefreq && typeof s.changefreq === "object" ? s.changefreq : {};
  const prio = s.priority && typeof s.priority === "object" ? s.priority : {};
  const changefreq = {};
  const priority = {};
  for (const t of SITEMAP_TYPES) {
    changefreq[t] = SITEMAP_FREQS.includes(freq[t]) ? freq[t] : d.changefreq[t];
    const n = Number(prio[t]);
    priority[t] = Number.isFinite(n) && n >= 0 && n <= 1 ? (Math.round(n * 10) / 10).toFixed(1) : d.priority[t];
  }
  return {
    baseUrl: base.replace(/\/+$/, ""),
    includeHome: bool(s.includeHome, d.includeHome),
    includeCategories: bool(s.includeCategories, d.includeCategories),
    includeProducts: bool(s.includeProducts, d.includeProducts),
    includeSearch: bool(s.includeSearch, d.includeSearch),
    includeOutOfStock: bool(s.includeOutOfStock, d.includeOutOfStock),
    includeLastmod: bool(s.includeLastmod, d.includeLastmod),
    changefreq,
    priority,
  };
}

const DEFAULT_SETTINGS = {
  storeName: "Meridian",
  logo: "",
  supportEmail: "hello@meridian.example",
  freeShippingThreshold: 500000, // paise (₹5,000), display only
  announcement: "",
  announcementTheme: "accent",
  categories: BASE_CATEGORIES.slice(),
  theme: Object.assign({}, DEFAULT_THEME),
  banners: DEFAULT_BANNERS.map((b) => Object.assign({}, b)),
  heroSlides: DEFAULT_HERO_SLIDES.map((s) => Object.assign({}, s)),
  gridBanner: Object.assign({}, DEFAULT_GRID_BANNER),
  attributes: DEFAULT_ATTRIBUTES.map((a) => Object.assign({}, a, { options: (a.options || []).slice() })),
  variantGroups: DEFAULT_VARIANT_GROUPS.map((g) => Object.assign({}, g, { options: g.options.slice() })),
  categoryFilters: {},
  categoryMeta: DEFAULT_CATEGORY_META,
  passwordPolicy: Object.assign({}, DEFAULT_PASSWORD_POLICY),
  payments: normalizePayments(null),
  sitemap: normalizeSitemap(null),
  rules: DEFAULT_RULES.map((r) => Object.assign({}, r)),
};

function readCatalogOverlay() {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeAttrs(a) {
  const out = {};
  if (a && typeof a === "object") {
    for (const k of Object.keys(a)) {
      const v = a[k];
      if (v == null) continue;
      if (Array.isArray(v)) {
        const arr = v.map((x) => String(x).trim()).filter(Boolean);
        if (arr.length) out[String(k)] = arr;
        continue;
      }
      const sv = String(v).trim();
      if (sv) out[String(k)] = sv;
    }
  }
  return out;
}

function normalizeAttribute(a) {
  if (!a || typeof a !== "object") return null;
  const id = String(a.id || "").trim();
  if (!id) return null;
  const type = a.type === "select" ? "select" : a.type === "multi" ? "multi" : "text";
  const usesOptions = type === "select" || type === "multi";
  return {
    id,
    name: String(a.name || id),
    type,
    options: usesOptions && Array.isArray(a.options) ? a.options.map(String).filter(Boolean) : [],
  };
}

function normalizeVariantGroup(g) {
  if (!g || typeof g !== "object") return null;
  const id = String(g.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(g.name || id),
    options: Array.isArray(g.options) ? g.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 40) : [],
    // Groups are storefront filters unless the admin explicitly opts out.
    filter: g.filter !== false,
  };
}

// A store policy entry. Title is required; a rule with no title is dropped.
function normalizeRule(r) {
  if (!r || typeof r !== "object") return null;
  const title = String(r.title || "").trim();
  if (!title) return null;
  return {
    id: String(r.id || "").trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title: title.slice(0, 80),
    body: String(r.body || "").trim().slice(0, 2000),
  };
}

// Which filter groups each category offers on the storefront, keyed by
// category name. A category with no entry inherits every filter group.
function normalizeCategoryFilters(cf) {
  const out = {};
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    for (const key of Object.keys(cf)) {
      const name = String(key).trim();
      if (!name) continue;
      out[name] = Array.isArray(cf[key])
        ? Array.from(new Set(cf[key].map((x) => String(x).trim()).filter(Boolean))).slice(0, 40)
        : [];
    }
  }
  return out;
}

// An image reference is either an uploaded data URL or a hosted/relative URL;
// anything else (a bare script, a non-image data URL) is dropped.
function normalizeImageSrc(src) {
  const s = String(src == null ? "" : src).trim();
  return /^(data:image\/|https?:\/\/|\/)/.test(s) ? s.slice(0, 400000) : "";
}

function normalizeSubCategory(s) {
  if (!s || typeof s !== "object") return null;
  const id = String(s.id || "").trim().slice(0, 48);
  const name = String(s.name || "").trim().slice(0, 60);
  if (!id || !name) return null;
  return { id, name, image: normalizeImageSrc(s.image) };
}

// Presentation per category: its square storefront icon and its sub-categories.
// Keyed by category name, like categoryFilters.
function normalizeCategoryMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return out;
  for (const key of Object.keys(meta)) {
    const name = String(key).trim();
    const m = meta[key];
    if (!name || !m || typeof m !== "object") continue;
    const subs = (Array.isArray(m.subs) ? m.subs : []).map(normalizeSubCategory).filter(Boolean);
    const seen = new Set();
    out[name] = {
      image: normalizeImageSrc(m.image),
      subs: subs.filter((s) => (seen.has(s.id) ? false : seen.add(s.id))).slice(0, 24),
    };
  }
  return out;
}

// A product's `variants` map: group id → array of the choices it offers.
function sanitizeVariants(v) {
  const out = {};
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) {
      const raw = v[k];
      const arr = Array.isArray(raw)
        ? raw.map((x) => String(x).trim()).filter(Boolean)
        : (raw != null && String(raw).trim() ? [String(raw).trim()] : []);
      const unique = Array.from(new Set(arr)).slice(0, 40);
      if (unique.length) out[String(k)] = unique;
    }
  }
  return out;
}

// cats lets a caller validate against the list it is about to save ("All" first);
// the stored overlay still holds the previous names while a rename is in flight.
function sanitizeProduct(p, cats) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id) return null;
  const allowed = Array.isArray(cats) ? cats : getCategories();
  return {
    id: p.id,
    name: String(p.name || p.id),
    category: allowed.includes(p.category) ? p.category : (allowed[1] || "Accessories"),
    // A sub-category id from the category's own list; "" means "not in one".
    subcategory: typeof p.subcategory === "string" ? p.subcategory.trim().slice(0, 48) : "",
    desc: String(p.desc || ""),
    blurb: String(p.blurb || p.desc || ""),
    price: Number.isFinite(p.price) ? Math.max(0, Math.round(p.price)) : 0,
    was: Number.isFinite(p.was) && p.was > 0 ? Math.round(p.was) : undefined,
    badge: p.badge ? String(p.badge) : undefined,
    rating: Number.isFinite(p.rating) ? Math.min(5, Math.max(0, p.rating)) : 4.5,
    reviewCount: Number.isFinite(p.reviewCount) ? Math.max(0, Math.round(p.reviewCount)) : 0,
    color: productColor(p),
    image: typeof p.image === "string" ? p.image : "",
    thumb: typeof p.thumb === "string" ? p.thumb : "",
    gallery: Array.isArray(p.gallery) ? p.gallery.map((g) => String(g).trim()).filter(Boolean).slice(0, 8) : [],
    videos: Array.isArray(p.videos) ? p.videos.map((v) => String(v).trim()).filter(Boolean).slice(0, 4) : [],
    specPdf: typeof p.specPdf === "string" ? p.specPdf.trim() : "",
    unit: typeof p.unit === "string" && p.unit.trim() ? p.unit.trim().slice(0, 12) : "pc",
    minQty: Number.isFinite(p.minQty) ? Math.max(1, Math.round(p.minQty)) : 1,
    stock: Number.isFinite(p.stock) ? Math.max(0, Math.round(p.stock)) : undefined,
    sku: typeof p.sku === "string" ? p.sku.trim().slice(0, 40) : "",
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [],
    discount: productDiscount(p) || undefined,
    refund: { enabled: !!(p.refund && p.refund.enabled === true), note: String((p.refund && p.refund.note) || "") },
    warranty: { enabled: !!(p.warranty && p.warranty.enabled === true), note: String((p.warranty && p.warranty.note) || "") },
    frequentlyBought: Array.isArray(p.frequentlyBought) ? p.frequentlyBought.map(String).filter(Boolean).slice(0, 6) : [],
    features: Array.isArray(p.features) ? p.features.map(String).slice(0, 6) : [],
    attrs: sanitizeAttrs(p.attrs),
    variants: sanitizeVariants(p.variants),
    reviews: Array.isArray(p.reviews) ? p.reviews : [],
  };
}

function mergeCatalog(base, overlay) {
  if (!overlay || !Array.isArray(overlay.products)) return base.slice();
  const out = [];
  const seen = new Set();
  for (const raw of overlay.products) {
    // Seed default variants and sub-categories for products saved before those
    // existed, so an existing overlay still shows options and sits in the right
    // sub-category. Products the admin has configured are left untouched.
    let item = raw;
    if (item && typeof item === "object" && item.variants == null && BASE_VARIANTS[item.id]) {
      item = Object.assign({}, item, { variants: cloneVariants(BASE_VARIANTS[item.id]) });
    }
    if (item && typeof item === "object" && item.subcategory == null && BASE_SUBCATEGORY[item.id]) {
      item = Object.assign({}, item, { subcategory: BASE_SUBCATEGORY[item.id] });
    }
    const p = sanitizeProduct(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.length ? out : base.slice();
}

// Effective product list (base merged with any saved overlay).
let PRODUCTS = (function initProducts() {
  const overlay = readCatalogOverlay();
  return withFileProductImages(mergeCatalog(BASE_PRODUCTS, overlay));
})();

function getCatalogSettings() {
  const overlay = readCatalogOverlay();
  return getCatalogSettingsFrom((overlay && overlay.settings) || {});
}

// When the admin last saved the catalogue, which is what the sitemap uses for
// <lastmod>. Empty while a store is still on its built-in defaults, because
// those were never edited here — better no date than a made-up one.
function getCatalogSavedAt() {
  const overlay = readCatalogOverlay();
  const at = overlay && typeof overlay.savedAt === "string" ? overlay.savedAt : "";
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) ? at : "";
}

// Effective category list, always prefixed with the "All" filter.
function getCategories() { return ["All"].concat(getCatalogSettings().categories); }
function getTheme() { return getCatalogSettings().theme; }
function getPasswordPolicy() { return getCatalogSettings().passwordPolicy; }
function getPayments() { return getCatalogSettings().payments; }
function getRules() { return getCatalogSettings().rules; }
function getSitemap() { return getCatalogSettings().sitemap; }
function getAttributes() { return getCatalogSettings().attributes; }
function getVariantGroups() { return getCatalogSettings().variantGroups; }
// The variant groups the storefront shows as product filters.
function getFilterGroups() { return getVariantGroups().filter((g) => g.filter !== false && g.options.length); }
// The filters one category offers: the admin's choice for it, or every filter
// group when the category has never been configured.
function getCategoryFilterGroups(category) {
  const all = getFilterGroups();
  const chosen = getCatalogSettings().categoryFilters[String(category)];
  if (!Array.isArray(chosen)) return all;
  return all.filter((g) => chosen.includes(g.id));
}

// The storefront icon and sub-categories configured for one category. "All" and
// categories with no entry have neither. getCatalogSettings() normalises a fresh
// copy on every read, so callers can treat these as read-only.
function getCategoryMeta() { return getCatalogSettings().categoryMeta; }
function categoryMetaFor(cat) { return getCategoryMeta()[String(cat)] || { image: "", subs: [] }; }
function categoryImage(cat) { return categoryMetaFor(cat).image; }
function subCategories(cat) { return categoryMetaFor(cat).subs; }

// The variant groups a product actually offers, in dashboard order, each with
// the product's chosen subset of options (filtered to choices that still exist
// in the group). Groups with no valid choices are skipped.
function productVariantGroups(p) {
  const v = (p && p.variants) || {};
  const out = [];
  for (const g of getVariantGroups()) {
    const chosen = Array.isArray(v[g.id]) ? v[g.id] : [];
    if (!chosen.length) continue;
    const allowed = new Set(chosen.map(String));
    const options = g.options.filter((o) => allowed.has(o));
    if (options.length) out.push({ id: g.id, name: g.name, options });
  }
  return out;
}
function getBanners() {
  return getCatalogSettings().banners
    .filter((b) => b && b.enabled !== false)
    .map((b) => ({
      id: String(b.id || "banner"),
      kicker: String(b.kicker || ""),
      title: String(b.title || ""),
      sub: String(b.sub || ""),
      image: String(b.image || ""),
      theme: ["a", "b", "c"].includes(b.theme) ? b.theme : "a",
      linkType: ["product", "category", "scroll", "url"].includes(b.linkType) ? b.linkType : "scroll",
      target: String(b.target || ""),
      enabled: b.enabled !== false,
    }));
}

// Enabled hero (auto-scrolling banner) slides, normalised.
function getHeroSlides() {
  return getCatalogSettings().heroSlides
    .filter((s) => s && s.enabled !== false)
    .map((s) => ({
      id: String(s.id || "slide"),
      image: String(s.image || ""),
      kicker: String(s.kicker || ""),
      title: String(s.title || ""),
      sub: String(s.sub || ""),
      linkType: ["none", "product", "category", "page", "url"].includes(s.linkType) ? s.linkType : "none",
      target: String(s.target || ""),
      enabled: s.enabled !== false,
    }));
}

// The named mid-grid promotional banner, normalised.
function getGridBanner() {
  const d = DEFAULT_GRID_BANNER;
  const src = getCatalogSettings().gridBanner || {};
  return {
    name: typeof src.name === "string" && src.name.trim() ? src.name : d.name,
    ctaLabel: typeof src.ctaLabel === "string" ? src.ctaLabel : d.ctaLabel,
    linkType: ["product", "category", "scroll", "url", "none"].includes(src.linkType) ? src.linkType : d.linkType,
    target: typeof src.target === "string" ? src.target : d.target,
    image: typeof src.image === "string" ? src.image : d.image,
    enabled: src.enabled !== false,
  };
}

// Live binding so the storefront filter row reflects admin category edits.
let CATEGORIES = getCategories();

function saveCatalogOverlay(products, settings) {
  const next = getCatalogSettingsFrom(settings);
  const stripped = stripFileImages(products, next);
  const cats = ["All"].concat(next.categories);
  const payload = {
    version: 1,
    products: stripped.products.map((p) => sanitizeProduct(p, cats)).filter(Boolean),
    settings: stripped.settings,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(CATALOG_KEY, JSON.stringify(payload));
  PRODUCTS = withFileProductImages(mergeCatalog(BASE_PRODUCTS, { products: payload.products }));
  CATEGORIES = getCategories();
  return payload;
}

// Merge a partial settings object over the defaults, normalising nested parts.
function getCatalogSettingsFrom(settings) {
  const s = settings || {};
  const gridBanner = Object.assign({}, DEFAULT_GRID_BANNER, (s.gridBanner && typeof s.gridBanner === "object") ? s.gridBanner : {});
  gridBanner.image = imageOr(gridBanner.image, FILE_IMAGES.spotlightBanner);
  return {
    storeName: typeof s.storeName === "string" ? s.storeName : DEFAULT_SETTINGS.storeName,
    logo: imageOr(s.logo, FILE_IMAGES.logo),
    supportEmail: typeof s.supportEmail === "string" ? s.supportEmail : DEFAULT_SETTINGS.supportEmail,
    freeShippingThreshold: Number.isFinite(s.freeShippingThreshold) ? s.freeShippingThreshold : DEFAULT_SETTINGS.freeShippingThreshold,
    announcement: typeof s.announcement === "string" ? s.announcement : DEFAULT_SETTINGS.announcement,
    announcementTheme: ["accent", "dark", "light"].includes(s.announcementTheme) ? s.announcementTheme : DEFAULT_SETTINGS.announcementTheme,
    categories: Array.isArray(s.categories) && s.categories.length ? s.categories.map(String) : BASE_CATEGORIES.slice(),
    theme: Object.assign({}, DEFAULT_THEME, s.theme || {}),
    banners: withFileIdImages(Array.isArray(s.banners) ? s.banners : DEFAULT_BANNERS.map((b) => Object.assign({}, b)), "banners"),
    heroSlides: withFileIdImages(Array.isArray(s.heroSlides) ? s.heroSlides : DEFAULT_HERO_SLIDES.map((x) => Object.assign({}, x)), "heroSlides"),
    gridBanner,
    attributes: Array.isArray(s.attributes) ? s.attributes.map(normalizeAttribute).filter(Boolean) : DEFAULT_ATTRIBUTES.map((a) => Object.assign({}, a, { options: (a.options || []).slice() })),
    variantGroups: Array.isArray(s.variantGroups) ? s.variantGroups.map(normalizeVariantGroup).filter(Boolean) : DEFAULT_VARIANT_GROUPS.map((g) => Object.assign({}, g, { options: g.options.slice() })),
    categoryFilters: normalizeCategoryFilters(s.categoryFilters),
    // Categories the admin has never touched keep the seeded sub-categories.
    categoryMeta: withFileCategoryImages(normalizeCategoryMeta(s.categoryMeta == null ? DEFAULT_CATEGORY_META : s.categoryMeta)),
    passwordPolicy: Object.assign({}, DEFAULT_PASSWORD_POLICY, s.passwordPolicy || {}),
    payments: normalizePayments(s.payments),
    sitemap: normalizeSitemap(s.sitemap),
    rules: Array.isArray(s.rules) && s.rules.length ? s.rules.map(normalizeRule).filter(Boolean) : DEFAULT_RULES.map((r) => Object.assign({}, r)),
  };
}

function clearCatalogOverlay() {
  localStorage.removeItem(CATALOG_KEY);
  PRODUCTS = withFileProductImages(BASE_PRODUCTS.slice());
  CATEGORIES = getCategories();
}

function getProduct(id) { return PRODUCTS.find((p) => p.id === id) || null; }

// --- Stars -----------------------------------------------------------------
function starsHTML(rating, opts) {
  const o = opts || {};
  const size = o.size || 15;
  const showValue = o.showValue !== false;
  const r = Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0;
  const pct = (r / 5) * 100;
  const row = "★★★★★";
  return (
    '<span class="stars-wrap">' +
    '<span class="stars" style="font-size:' + size + 'px" role="img" aria-label="Rated ' + r.toFixed(1) + ' out of 5">' +
    '<span class="stars-bg">' + row + "</span>" +
    '<span class="stars-fill" style="width:' + pct + '%">' + row + "</span>" +
    "</span>" +
    (showValue ? '<span class="stars-val">' + r.toFixed(1) + "</span>" : "") +
    "</span>"
  );
}

// Apply display settings to any page elements that opt in.
function applyTheme(theme) {
  const t = theme || getTheme();
  const root = document.documentElement;
  for (const key of Object.keys(THEME_VARS)) {
    if (typeof t[key] === "string" && t[key]) root.style.setProperty(THEME_VARS[key], t[key]);
  }
}

function applySettings() {
  const s = getCatalogSettings();
  applyTheme(s.theme);
  document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = s.storeName; });
  document.querySelectorAll("[data-support-email]").forEach((el) => {
    el.textContent = s.supportEmail;
    if (el.tagName === "A") el.href = "mailto:" + s.supportEmail;
  });
  const title = document.querySelector("[data-store-title]");
  if (title) title.textContent = s.storeName;

  // Brand mark: show the uploaded logo when set, else the store initial.
  const initial = ((s.storeName || "M").trim().charAt(0) || "M").toUpperCase();
  document.querySelectorAll(".brand .mark").forEach((mark) => {
    if (s.logo) {
      mark.classList.add("has-logo");
      mark.textContent = "";
      const img = document.createElement("img");
      img.src = resolveImageUrl(s.logo);
      img.alt = (s.storeName || "Store") + " logo";
      mark.appendChild(img);
    } else {
      mark.classList.remove("has-logo");
      mark.textContent = initial;
    }
  });

  // Announcement "long banner": a full-width strip above the sticky header,
  // shown on every page whenever the admin has set its text.
  const announceText = (s.announcement || "").trim();
  let bar = document.getElementById("announcement-bar");
  if (announceText) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "announcement-bar";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    const theme = ["accent", "dark", "light"].includes(s.announcementTheme) ? s.announcementTheme : "accent";
    bar.className = "announce theme-" + theme;
    bar.setAttribute("role", "status");
    bar.textContent = announceText;
  } else if (bar) {
    bar.remove();
  }
}

document.addEventListener("DOMContentLoaded", applySettings);
