# FORME

<p align="center">
  <strong>Your private wardrobe and personal stylist.</strong><br>
  Organize what you own, build looks visually, and get practical outfit advice in one focused workspace.
</p>

<p align="center">
  <a href="https://github.com/idhail0/FORME">Repository</a>
  ·
  <a href="https://idhail0.github.io/FORME/">Live app</a>
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

For production, deploy the repository to any static host. GitHub Pages works without a build command; make sure the Supabase site URL matches the deployed app URL.

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
├── manifest.json            # Installable app metadata
├── sw.js                    # Static asset and navigation cache
├── icons/                   # PWA icons
└── supabase/
    ├── client.js           # Auth, wardrobe data, and image storage helpers
    ├── config.js           # Project URL and publishable key
    └── schema.sql          # Database, RLS, and Storage policies
```

## Privacy and data

Wardrobe records and uploaded images are associated with the authenticated Supabase user. Row Level Security and Storage policies restrict access to each user's own data. AI chat requests include the active outfit's names, categories, and colors; review your selected provider's privacy terms before enabling an external API.

## License

No license has been specified yet.
