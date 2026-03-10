# PricePin

A crowdsourced web app that maps real-time food prices. Search by location or dish, tap a pin to see menus and prices, and add or update data by photographing a menu. No login required.

## Features

- **Map discovery** — Map with pins; search by place (geocoding) or by dish (filter pins).
- **Add food spots** — Name, address, category, optional photo; then add or update menu via photo.
- **AI menu scan** — Mistral OCR turns a menu photo into structured items; edit and finalize before saving.
- **Admin** — Token-protected dashboard for verification, flags, and history.

## Tech Stack

| Layer     | Technology |
| --------- | ---------- |
| Frontend  | React (Vite), TypeScript, Tailwind CSS, TanStack Query |
| Map       | Mapbox GL, react-map-gl |
| Geocoding | Photon API |
| Backend   | FastAPI (Python) |
| OCR       | Mistral |
| Database  | Supabase (PostGIS) |
| Storage   | Supabase Storage (menu_photos, storefronts) |
| Auth      | Supabase Anonymous |
| Hosting   | Vercel (frontend), Render (backend) |

## Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase project (PostGIS enabled)
- Mistral API key

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-org/pricepin.git
cd pricepin
```

**Frontend:**

```bash
cd apps/web
cp .env.example .env
# Edit .env with your Supabase and API URL
npm install
npm run dev
```

**Backend:**

```bash
cd apps/api
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MISTRAL_API_KEY
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Database

Create a Supabase project and enable PostGIS. Apply migrations in `supabase/migrations/` (via Supabase CLI or SQL Editor). See migration files for schema (e.g. `food_spots`, `menu_items`, spatial indexes).

### 3. Environment variables

**`apps/web/.env`**

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_API_URL` — Backend API URL (e.g. `http://localhost:8000` for local)
- `VITE_MAPBOX_ACCESS_TOKEN` — Mapbox access token (map tiles)

**`apps/api/.env`**

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key
- `MISTRAL_API_KEY` — Mistral API key for OCR
- `CORS_ORIGINS` — Allowed origins (e.g. `http://localhost:5173`)
- Optional: `TURNSTILE_SECRET` — Enables Turnstile for `/process-menu` (requires frontend widget and token)

## Deployment

- **Frontend (Vercel):** Set root to `apps/web`. Add env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (production API URL), `VITE_MAPBOX_ACCESS_TOKEN`. Redeploy after env changes.
- **Backend (Render):** Deploy from `apps/api`; start command `uvicorn main:app`. Set `CORS_ORIGINS` to your frontend URL. Optional: use an uptime monitor (e.g. UptimeRobot) pinging `/health` every 5 minutes to avoid cold starts on free tier.

Production builds use the `VITE_API_URL` from build time; ensure it points to your deployed API, not localhost.

## Project Structure

```
pricepin/
├── apps/
│   ├── web/          # React (Vite, TS, Tailwind), Leaflet, Supabase client
│   └── api/          # FastAPI, Mistral OCR, Supabase server client
└── supabase/
    └── migrations/   # PostGIS schema, RLS, indexes
```

## License

TBD.
