# FORME

<p align="center">
  <strong>Your private wardrobe and personal stylist.</strong><br>
  Organize what you own, build looks visually, and get practical outfit advice in one focused workspace.
</p>

<p align="center">
  <a href="https://github.com/idhail0/FORME">Repository</a>
  ·
  <a href="https://forme-moe-705d.vercel.app">Live app</a>
</p>

<p align="center">
  <img src="./icons/icon-512.png" alt="FORME logo" width="180">
</p>

## What is FORME?

FORME is a polished, installable wardrobe workspace for turning a personal closet into usable daily outfits. It combines:

- **My Closet** — browse, search, filter, and manage clothing pieces by category.
- **AI Stylist** — drag pieces onto a visual outfit canvas and chat about the active look.
- **Private accounts** — sign up and sign in with Supabase email/password authentication.
- **Bilingual UI** — switch between English and Arabic with RTL layout support.
- **PWA support** — install FORME on supported devices and keep the app shell available offline.

## Tech stack

- React 18, loaded through browser import maps
- Zustand for persisted client state
- Framer Motion for transitions
- dnd-kit for drag-and-drop outfit building
- Lucide for icons
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Service Worker and Web App Manifest for installability

FORME intentionally has no bundler or package installation step. The app is served as static files and loads its browser dependencies from CDNs.

## Getting started

### 1. Configure Supabase

1. Create a Supabase project and enable the **Email** authentication provider.
2. Set the project URL and publishable key in [`supabase/config.js`](./supabase/config.js).
3. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
4. Configure the Supabase site URL and email confirmation behavior for your deployment.

The schema creates the wardrobe and outfit tables, enables owner-only RLS policies, and creates the private `wardrobe-images` Storage bucket. Never place a service-role key in browser code.

### 2. Serve the app

Because the app uses ES modules, serve it over HTTP rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) and create an account.

### 3. Deploy on Vercel

The app is deployed on Vercel as a static site, with no build step: Framework Preset **Other**, empty build command, output directory `.` (the repository root). [`vercel.json`](./vercel.json) handles the rest:

- **Routes:** every path without a file extension (`/`, `/stylist`, …) serves `index.html`, so refreshing or opening a deep link works.
- **Caching:** `sw.js`, `manifest.json`, and the app's JS/CSS are revalidated on every request, so a new deploy reaches users on their next visit. Icons are cached for a week.
- **PWA headers:** `Service-Worker-Allowed: /` and the correct manifest content type.

After the first deploy:

1. In Vercel → **Settings → Deployment Protection**, turn off **Vercel Authentication** for production. Otherwise every visitor, and the browser's manifest/service-worker requests, gets redirected to a Vercel login and the app cannot be installed.
2. In Supabase → **Authentication → URL Configuration**, set **Site URL** to the Vercel domain and add `https://<your-domain>/**` to **Redirect URLs**, so confirmation emails link back to the app.

## Smart uploads and the dressable mannequin

Everything below runs in the browser, so photos never leave the device until the piece is saved.

- **Background removal:** [`onnx-community/ormbg-ONNX`](https://huggingface.co/onnx-community/ormbg-ONNX) (Apache-2.0, int8, ~42 MB).
- **Piece type:** the image half of [`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32) (MIT, 4-bit, ~60 MB), compared against label embeddings precomputed in [`features/garment-embeddings.json`](./features/garment-embeddings.json). The user can change the suggestion before saving.
- **Color:** k-means over the cutout's pixels, matched to a fashion palette ([`features/colors.js`](./features/colors.js)).
- **Runtime:** [Transformers.js](https://huggingface.co/docs/transformers.js) 4.3.1 in a Web Worker ([`features/vision-worker.js`](./features/vision-worker.js)). The models download once (~100 MB) and the browser caches them. `vercel.json` sends `COOP: same-origin` + `COEP: credentialless`, which enables multi-threaded WASM in Chrome, Edge and Firefox (about 3× faster).
- **Front/back mockup:** the upload flow asks for a back photo, shows both on a studio backdrop, and can export the mockup as a PNG. Cutouts are stored as `<id>.cutout.webp` (or `.cutout-fb.webp` plus `<id>.back.webp` when there is a back photo), so no database migration is needed.
- **Mannequin:** an SVG figure with three finishes; pieces snap to body zones and can be dragged and resized ([`features/mannequin.js`](./features/mannequin.js)).
- **Match score:** color harmony, completeness and style consistency, with tips ([`features/look-score.js`](./features/look-score.js)).

The feature modules use [htm](https://github.com/developit/htm) for JSX-like templates without a build step.

## Appearance (light / dark)

The app follows the device setting by default; people can force Light or Dark from **Appearance** in the account menu (stored per browser). A small inline script in `index.html` applies the choice before first paint, so there is no flash.

`dark.css` is **generated**: `tools/build-dark.py` re-emits every colour in `styles.css` and `pwa.css` under `:root[data-theme="dark"]` with a property-aware conversion, then appends the hand-tuned `tools/dark-overrides.css`. After changing colours, run:

```bash
python tools/build-dark.py
```

## AI stylist providers

The stylist defaults to **WebSim AI** when available. It can also call:

- OpenAI (`gpt-4o-mini`)
- Anthropic (`claude-3-5-haiku-20241022`)

Provider selection and API keys are saved in the current browser's local storage. For production use, prefer a server-side proxy so provider keys are not exposed to browser code.

## Project structure

```text
.
├── app.js                  # React application, auth, closet, and stylist UI
├── data.js                 # Starter wardrobe and welcome message
├── store.js                # Zustand wardrobe and stylist state
├── styles.css              # Main visual system and responsive layout
├── pwa.css                 # Install prompt and PWA-specific styles
├── dark.css                # Dark appearance (generated by tools/build-dark.py)
├── manifest.json            # Installable app metadata
├── sw.js                    # Offline cache: network-first app code, cache-first CDN
├── vercel.json              # Vercel routing, caching, and security headers
├── features/                # Smart upload, vision worker, mannequin, match score
├── icons/                   # Logo (logo-mark.svg), app icon source (icon.svg), PWA icons
└── supabase/
    ├── client.js           # Auth, wardrobe data, and image storage helpers
    ├── config.js           # Project URL and publishable key
    └── schema.sql          # Database, RLS, and Storage policies
```

## Privacy and data

Wardrobe records and uploaded images are associated with the authenticated Supabase user. Row Level Security and Storage policies restrict access to each user's own data. AI chat requests include the active outfit's names, categories, and colors; review your selected provider's privacy terms before enabling an external API.

## License

No license has been specified yet.
