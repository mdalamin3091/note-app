# Notes API (multi-tenant)

Node + Express + TypeScript + PostgreSQL. Tenant comes from the `X-Tenant` header,
and every query filters by `tenant_id`.

## Run

Postgres must be reachable at `DATABASE_URL` (see `.env.example`). A quick one:

```bash
docker run -d --name notes-pg \
  -e POSTGRES_USER=notes -e POSTGRES_PASSWORD=notes -e POSTGRES_DB=notes \
  -p 5432:5432 postgres:16
```

Then:

```bash
npm install
cp .env.example .env
npm run seed     # drops + recreates tables, loads 50k notes / 150k tags
npm run dev      # or: npm run build && npm start
```

## Endpoints

| Method | Path             | Notes                              |
|--------|------------------|------------------------------------|
| POST   | `/api/notes`     | `{ title, body }`                  |
| GET    | `/api/notes`     | `?page=1&limit=20`                 |
| GET    | `/api/notes/:id` |                                    |
| GET    | `/api/search`    | `?q=word`                          |
| GET    | `/api/stats`     | counts for the `X-Tenant` tenant, joins all three tables |
| GET    | `/healthz`       | 200 while the process is alive     |
| GET    | `/readyz`        | 200 only if a DB query succeeds    |
| GET    | `/metrics`       | placeholder, Prometheus lands in B3|

```bash
curl -H 'X-Tenant: acme' 'http://localhost:3000/api/notes?limit=5'
curl -H 'X-Tenant: acme' 'http://localhost:3000/api/search?q=quartz'
```

## Seed data

5 tenants, unevenly loaded on purpose: acme 30000, globex 8000, initech 6000,
umbrella 4000, hooli 2000 — 50000 notes total, plus 150000 tags (3 per note).
Bodies are 10 random words from a small dictionary so search has real hits.

## Deliberate problems (do not fix yet)

These stay in so monitoring can find them later.

1. **N+1 query** — `GET /api/notes` runs one query for the notes, then one
   query per note for its tags. `limit=20` means 21 queries.
2. **Unindexed search** — `/api/search` uses `body LIKE '%' || $1 || '%'`
   with no index on `notes.body`, so every row is read.
3. **Missing FK index** — there is no index on `tags.note_id`, which makes
   `/api/stats` slow. Postgres does not create one automatically.
4. **Unbounded limit** — `/api/notes?limit=50000` returns 50000 rows, and
   combined with problem 1 that is 50001 queries. Measured: 200 OK after
   ~92 seconds on the seeded data.
