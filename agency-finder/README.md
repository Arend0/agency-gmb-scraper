# Agency Finder

Monorepo: **React (Vite) + Tailwind** client and **Express + Prisma + PostgreSQL** server. Places data comes from **Google Places API v1 only** (no scraping).

## Compliance note

Google Places API only — **no scraping**. Review [Google Maps Platform](https://developers.google.com/maps/documentation) **retention and attribution rules** before storing Places fields longer than permitted (often **limited to ~30 days** for much of Places content depending on SKU and usage).

---

## Local setup

1. **Requirements:** Node.js 22+, npm, PostgreSQL.

2. **Install dependencies:**

   ```bash
   npm run install:all
   ```

3. **Configure the API:** copy `server/.env.example` to `server/.env` and set variables (see below).

4. **Database:** ensure `DATABASE_URL` points at Postgres, then create and apply migrations:

   ```bash
   cd server && npx prisma migrate dev --name init
   ```

5. **Optional client env:** copy `client/.env.example` to `client/.env`. For local dev the default API URL is `http://localhost:3001`.

6. **Run:**

   ```bash
   npm run dev
   ```

   - Client: http://localhost:5173  
   - API: http://localhost:3001

7. **Build (local):**

   ```bash
   npm run build
   ```

---

## Environment variables

| Variable               | Required         | Notes |
|------------------------|------------------|-------|
| `DATABASE_URL`         | Yes              | PostgreSQL connection string (`postgresql://…`). |
| `GOOGLE_MAPS_API_KEY`  | Yes for search   | Enables `POST /api/searches`. |
| `PORT`                 | Optional         | Listen port (default **3001**); Railway injects **`PORT`** automatically. |
| `NODE_ENV`             | Recommended prod | Use **`production`** on Railway so the API serves the built client. |
| `CORS_ORIGIN`          | Mostly local dev | Origin for your browser-origin Vite dev server (e.g. `http://localhost:5173`). Not needed when UI and API share the same host (Docker production). |

`server/.env.example` lists placeholders including `DATABASE_URL`, `GOOGLE_MAPS_API_KEY`, `PORT`, and `CORS_ORIGIN`.

---

## Railway deployment (single Docker service)

The repo includes a **root `Dockerfile`** that:

1. Builds the Vite client and TypeScript server.
2. Runs **`prisma migrate deploy`** then **`node dist/index.js`** when the container starts.

With **`NODE_ENV=production`**, Express serves the built SPA from **`/app/client/dist`** (bundled inside the image). No separate Railway “static site” service is required.

### Deploy steps

1. Create a [Railway](https://railway.app) project and add **PostgreSQL**.
2. Add a service wired to **this repo** using the **Dockerfile** at the **`agency-finder`** root (`railway.json` points Railway at that Dockerfile).
3. From the Postgres plugin → **Variables** → link **`DATABASE_URL`** into your app service (Railway templates often use `${{ Postgres.DATABASE_URL }}`).
4. Set **`GOOGLE_MAPS_API_KEY`** and **`NODE_ENV=production`** on the **app** service (`PORT` is set by Railway unless you override it).
5. Add a **public domain** under the **app** service (Networking → Generate Domain). Optionally set **`CORS_ORIGIN`** to that **`https://…`** URL **only if** the browser loads your UI from another origin than the Express host.
6. **Migrations:** run `cd server && npx prisma migrate dev` locally once, commit `server/prisma/migrations/**`, redeploy so `prisma migrate deploy` can apply history.

### Health checks

**`GET /health`** returns **`{"status":"ok"}`** and HTTP **200** when Postgres answers a **`SELECT 1`**. DB failure returns **503** with **`{"status":"error"}`**.

---

### Railway variables (minimal checklist)

Set these on your **app** service (Postgres provides `DATABASE_URL`; Railway usually sets `PORT`):

| Name | Value |
|------|--------|
| **`DATABASE_URL`** | From Railway PostgreSQL (often `${{ Postgres.DATABASE_URL }}` or the variable the template creates) |
| **`GOOGLE_MAPS_API_KEY`** | Your Google Cloud API key with Places API (New) enabled |
| **`NODE_ENV`** | `production` |
| **`CORS_ORIGIN`** | Your app’s public Railway URL, e.g. `https://<service>.up.railway.app` (optional if you rely on `origin: true` fallback, but setting it is clearer) |
| **`PORT`** | Usually **do not set** — Railway injects it |

Optional: **`CLIENT_DIST_PATH`** only if your image layout differs from the default (`/app/client/dist` in the provided Dockerfile).

