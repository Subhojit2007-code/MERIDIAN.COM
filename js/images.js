/* =============================================================================
   SITE IMAGES — the one place to put pictures on Meridian.

   Paste a URL between the quotes, save this file, refresh the page.
   Example:

     "aurora-headphones": { image: "https://cdn.example.com/aurora.jpg", thumb: "" },

   image  the main picture — product page, card tile, banner background
   thumb  optional smaller picture used on cards and lists; "" reuses `image`
   ""     no picture, so the solid brand colour shows (as it does today)

   Two kinds of value work anywhere in this file:

     1. a hosted URL   "https://cdn.example.com/aurora.jpg"
     2. a local path   "Products(Meridian)/aurora.png"

   A local path is written from the top level of the site folder (the folder
   holding index.html), so the image folders sitting there — website logo,
   Banners, Categories, Products(Meridian), Spotlight Banner, scrolling banner —
   are used exactly as their names appear. Spaces and brackets are fine; the code
   escapes them and works out the right path for pages inside html/ too.

   Anything set in the Admin dashboard — an upload or a pasted URL — wins over
   this file, so the two never disagree. This file fills the gaps the dashboard
   has left empty.

   IDs are shown in the dashboard: Admin → Products (product ID), Admin →
   Banners, Admin → Banner Slideshow, Admin → Spotlight Banner. Categories and
   sub-categories are keyed by the names shown on the site instead.
   ========================================================================== */

const SITE_IMAGES = {
  // ── Website logo (top-left of every page, and on invoices) ─────────────────
  // e.g. "website logo/Gemini_Generated_Image_59sx7459sx7459sx-removebg-preview.png"
  // Left empty, the header shows the store initial instead.
  logo: "website logo/Gemini_Generated_Image_59sx7459sx7459sx-removebg-preview.png",

  // ── Products ───────────────────────────────────────────────────────────────
  products: {
    "aurora-headphones": { image: "Products(Meridian)/P1(1).png", thumb: "Products(Meridian)/P1.png" },  // Aurora Wireless Headphones
    "pulse-smartwatch":  { image: "Products(Meridian)/P2(1).png", thumb: "Products(Meridian)/P2.png" },  // Pulse Smart Watch
    "nimbus-speaker":    { image: "Products(Meridian)/P3(1).png", thumb: "Products(Meridian)/P3.png" },  // Nimbus Bluetooth Speaker
    "lumen-lamp":        { image: "Products(Meridian)/P4(1).png", thumb: "Products(Meridian)/P4.png" },  // Lumen Desk Lamp
    "terra-mugs":        { image: "Products(Meridian)/MUGS1.png", thumb: "Products(Meridian)/MUGS.png" },  // Terra Ceramic Mug Set
    "cove-blanket":      { image: "Products(Meridian)/P5(1).png", thumb: "Products(Meridian)/P5.png" },  // Cove Throw Blanket
    "meridian-tee":      { image: "Products(Meridian) - Copy/P6(1).png", thumb: "Products(Meridian) - Copy/P6.png" },  // Meridian Crew Tee
    "trail-hoodie":      { image: "Products(Meridian) - Copy/P7(1).png", thumb: "Products(Meridian) - Copy/P7.png" },  // Trail Knit Hoodie
    "drift-chinos":      { image: "Products(Meridian) - Copy/P8(1).png", thumb: "Products(Meridian) - Copy/P8.png" },  // Drift Chino Pants
    "atlas-backpack":    { image: "Products(Meridian) - Copy/P9(1).png", thumb: "Products(Meridian) - Copy/P9.png" },  // Atlas Canvas Backpack
    "ridge-bottle":      { image: "Products(Meridian) - Copy/P10(1).png", thumb: "Products(Meridian) - Copy/P10.png" },  // Ridge Steel Water Bottle
    "halo-sunglasses":   { image: "Products(Meridian) - Copy/SUNGLAS.png", thumb: "Products(Meridian) - Copy/SUN.png" },  // Halo Sunglasses
  },

  // ── Category tiles (the square pictures above the shop grid) ────────────────
  // Keyed by the names shown on the site — Admin → Categories. "image" is the
  // category's own tile; "subs" holds one entry per sub-category, keyed by the
  // sub-category name shown on the site. Rename one there, rename its key here.
  // Left empty, the tile shows the line drawing it uses today.
  categories: {
    Electronics: { image: "Categories/ELE.png", subs: { Audio: "Categories/ELE A.png", Wearables: "Categories/ELE W.png" } },
    Home:        { image: "Categories/HO.png", subs: { Lighting: "Categories/HO L.png", Tabletop: "Categories/HO T.png", Comfort: "Categories/COMFORT.png" } },
    Apparel:     { image: "Categories/AP.png", subs: { Tops: "Categories/AP T.png", Bottoms: "Categories/AP B.png" } },
    Accessories: { image: "Categories/AC.png", subs: { Bags: "Categories/AC B.png", Drinkware: "Categories/AC D.png", Eyewear: "Categories/EYE.png" } },
  },

  // ── Home page promo banners (the three tiles above the product grid) ───────
  banners: {
    b1: "Banners/Gemini_Generated_Image_917ez6917ez6917e (1).png",  // "Sound & wearables" — green tile
    b2: "Banners/Gemini_Generated_Image_ois76wois76wois7.png",  // "The cosy home edit" — amber tile
    b3: "Banners/Gemini_Generated_Image_ygmy2iygmy2iygmy.png",  // "Free shipping" — indigo tile
  },

  // ── Home page hero slideshow (slide 1 is the first panel) ──────────────────
  heroSlides: {
    s2: "scrolling banner/Gemini_Generated_Image_j5w0zgj5w0zgj5w0.png",
    s3: "scrolling banner/Gemini_Generated_Image_e3fodpe3fodpe3fo.png",
    s4: "scrolling banner/Gemini_Generated_Image_m52ss6m52ss6m52s.png",
    s5: "scrolling banner/Gemini_Generated_Image_e3fodpe3fodpe3fo.png",
  },

  // ── Spotlight banner (the wide strip half-way down the shop grid) ──────────
  spotlightBanner: "Spotlight Banner/Gemini_Generated_Image_3uz6j3uz6j3uz6j3.png",
};
