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

const ICONS = {
  Electronics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="2.5" y="13" width="4.5" height="7" rx="2"/><rect x="17" y="13" width="4.5" height="7" rx="2"/></svg>',
  Home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
  Apparel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 6l2 3 2-1v11h8V8l2 1 2-3-4-3-2 2h-4Z"/></svg>',
  Accessories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
};
function iconFor(category) { return ICONS[category] || ICONS.Accessories; }

// Inline background for a product's media tile: the uploaded photo when set,
// otherwise the two-colour gradient. Used by the grid cards and product page.
// A dedicated thumbnail (set in the admin editor) wins over the main image.
function productMediaStyle(p) {
  const g = Array.isArray(p.grad) && p.grad.length === 2 ? p.grad : ["#1f6f5c", "#123c33"];
  const grad = `linear-gradient(140deg, ${g[0]}, ${g[1]})`;
  const img = p.thumb || p.image;
  if (img) return `background-image:url('${String(img).replace(/'/g, "%27")}');background-size:cover;background-position:center`;
  return `background:${grad}; color:#fff`;
}
// The category icon is only shown when there is no photo to fill the tile.
function productMediaIcon(p) { return (p.thumb || p.image) ? "" : iconFor(p.category); }

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
    grad: ["#123c33", "#1f6f5c"],
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
    grad: ["#2b3a67", "#4f6d9b"],
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
    grad: ["#1b6ca8", "#4fa3d1"],
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
    grad: ["#b4762a", "#e0a94f"],
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
    grad: ["#8a5a3b", "#c69a6d"],
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
    grad: ["#6b2d5c", "#a44d84"],
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
    grad: ["#3f6212", "#7fa650"],
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
    grad: ["#334155", "#64748b"],
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
    grad: ["#7c5b34", "#b39066"],
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
    grad: ["#3f4a3c", "#6f7d63"],
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
    grad: ["#0f766e", "#5eead4"],
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
    grad: ["#7c2d12", "#f59e0b"],
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

// --- Catalogue overlay (admin console) -------------------------------------
const CATALOG_KEY = "meridian_catalog_v1";

// Site-wide colour tokens the appearance picker can override. Keys map to the
// CSS custom properties defined in :root (styles.css).
const DEFAULT_THEME = {
  bg: "#f6f5f2",
  surface: "#ffffff",
  ink: "#16211d",
  inkSoft: "#5b6b64",
  line: "#e4e2dc",
  accent: "#1f6f5c",
  accentInk: "#123c33",
  star: "#e8a317",
};
const THEME_VARS = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  inkSoft: "--ink-soft",
  line: "--line",
  accent: "--accent",
  accentInk: "--accent-ink",
  star: "--star",
};
const THEME_LABELS = {
  bg: "Page background",
  surface: "Card / surface",
  ink: "Primary text",
  inkSoft: "Muted text",
  line: "Borders",
  accent: "Accent",
  accentInk: "Accent (dark)",
  star: "Rating stars",
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
// gradient by default; the admin can upload/attach an image (stored as a
// compressed data URL) plus optional caption text and a link.
const DEFAULT_HERO_SLIDES = [
  { id: "s1", image: "", grad: ["#123c33", "#1f6f5c"], kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s2", image: "", grad: ["#2b3a67", "#4f6d9b"], kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s3", image: "", grad: ["#b4762a", "#e0a94f"], kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s4", image: "", grad: ["#6b2d5c", "#a44d84"], kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
  { id: "s5", image: "", grad: ["#1b6ca8", "#4fa3d1"], kicker: "", title: "", sub: "", linkType: "none", target: "", enabled: true },
];

// The named promotional banner shown half-way through the product grid on the
// shop page. It keeps the original green→blue gradient unless an image is
// attached. Managed by the admin "Spotlight Banner" dashboard.
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

// Payment gateway config. The secret key is NEVER stored here — it lives in
// Sites Settings (STRIPE_SECRET_KEY) and is read only by the Edge Function.
const DEFAULT_PAYMENTS = {
  provider: "stripe",
  enabled: true,
  publishableKey: "",
  currency: "INR",
  statementDescriptor: "MERIDIAN",
  testMode: true,
};

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
  passwordPolicy: Object.assign({}, DEFAULT_PASSWORD_POLICY),
  payments: Object.assign({}, DEFAULT_PAYMENTS),
  rules: [],
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
  };
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

function sanitizeProduct(p) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id) return null;
  const grad = Array.isArray(p.grad) && p.grad.length === 2 ? [String(p.grad[0]), String(p.grad[1])] : ["#1f6f5c", "#123c33"];
  return {
    id: p.id,
    name: String(p.name || p.id),
    category: getCategories().includes(p.category) ? p.category : (getCategories()[1] || "Accessories"),
    desc: String(p.desc || ""),
    blurb: String(p.blurb || p.desc || ""),
    price: Number.isFinite(p.price) ? Math.max(0, Math.round(p.price)) : 0,
    was: Number.isFinite(p.was) && p.was > 0 ? Math.round(p.was) : undefined,
    badge: p.badge ? String(p.badge) : undefined,
    rating: Number.isFinite(p.rating) ? Math.min(5, Math.max(0, p.rating)) : 4.5,
    reviewCount: Number.isFinite(p.reviewCount) ? Math.max(0, Math.round(p.reviewCount)) : 0,
    grad,
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
    // Seed default variants for products saved before variants existed, so an
    // existing overlay still shows options on the storefront. Products the admin
    // has explicitly configured (variants present) are left untouched.
    let item = raw;
    if (item && typeof item === "object" && item.variants == null && BASE_VARIANTS[item.id]) {
      item = Object.assign({}, item, { variants: cloneVariants(BASE_VARIANTS[item.id]) });
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
  return mergeCatalog(BASE_PRODUCTS, overlay);
})();

function getCatalogSettings() {
  const overlay = readCatalogOverlay();
  return getCatalogSettingsFrom((overlay && overlay.settings) || {});
}

// Effective category list, always prefixed with the "All" filter.
function getCategories() { return ["All"].concat(getCatalogSettings().categories); }
function getTheme() { return getCatalogSettings().theme; }
function getPasswordPolicy() { return getCatalogSettings().passwordPolicy; }
function getPayments() { return getCatalogSettings().payments; }
function getRules() { return getCatalogSettings().rules; }
function getAttributes() { return getCatalogSettings().attributes; }
function getVariantGroups() { return getCatalogSettings().variantGroups; }

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
      grad: Array.isArray(s.grad) && s.grad.length === 2 ? [String(s.grad[0]), String(s.grad[1])] : ["#123c33", "#1f6f5c"],
      kicker: String(s.kicker || ""),
      title: String(s.title || ""),
      sub: String(s.sub || ""),
      linkType: ["none", "product", "category", "url"].includes(s.linkType) ? s.linkType : "none",
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
  const payload = {
    version: 1,
    products: products.map(sanitizeProduct).filter(Boolean),
    settings: getCatalogSettingsFrom(settings),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(CATALOG_KEY, JSON.stringify(payload));
  PRODUCTS = mergeCatalog(BASE_PRODUCTS, { products: payload.products });
  CATEGORIES = getCategories();
  return payload;
}

// Merge a partial settings object over the defaults, normalising nested parts.
function getCatalogSettingsFrom(settings) {
  const s = settings || {};
  return {
    storeName: typeof s.storeName === "string" ? s.storeName : DEFAULT_SETTINGS.storeName,
    logo: typeof s.logo === "string" ? s.logo : DEFAULT_SETTINGS.logo,
    supportEmail: typeof s.supportEmail === "string" ? s.supportEmail : DEFAULT_SETTINGS.supportEmail,
    freeShippingThreshold: Number.isFinite(s.freeShippingThreshold) ? s.freeShippingThreshold : DEFAULT_SETTINGS.freeShippingThreshold,
    announcement: typeof s.announcement === "string" ? s.announcement : DEFAULT_SETTINGS.announcement,
    announcementTheme: ["accent", "dark", "light"].includes(s.announcementTheme) ? s.announcementTheme : DEFAULT_SETTINGS.announcementTheme,
    categories: Array.isArray(s.categories) && s.categories.length ? s.categories.map(String) : BASE_CATEGORIES.slice(),
    theme: Object.assign({}, DEFAULT_THEME, s.theme || {}),
    banners: Array.isArray(s.banners) ? s.banners : DEFAULT_BANNERS.map((b) => Object.assign({}, b)),
    heroSlides: Array.isArray(s.heroSlides) ? s.heroSlides : DEFAULT_HERO_SLIDES.map((x) => Object.assign({}, x)),
    gridBanner: Object.assign({}, DEFAULT_GRID_BANNER, (s.gridBanner && typeof s.gridBanner === "object") ? s.gridBanner : {}),
    attributes: Array.isArray(s.attributes) ? s.attributes.map(normalizeAttribute).filter(Boolean) : DEFAULT_ATTRIBUTES.map((a) => Object.assign({}, a, { options: (a.options || []).slice() })),
    variantGroups: Array.isArray(s.variantGroups) ? s.variantGroups.map(normalizeVariantGroup).filter(Boolean) : DEFAULT_VARIANT_GROUPS.map((g) => Object.assign({}, g, { options: g.options.slice() })),
    passwordPolicy: Object.assign({}, DEFAULT_PASSWORD_POLICY, s.passwordPolicy || {}),
    payments: Object.assign({}, DEFAULT_PAYMENTS, s.payments || {}),
    rules: Array.isArray(s.rules) ? s.rules : [],
  };
}

function clearCatalogOverlay() {
  localStorage.removeItem(CATALOG_KEY);
  PRODUCTS = BASE_PRODUCTS.slice();
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
      img.src = s.logo;
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
