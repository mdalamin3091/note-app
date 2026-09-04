import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import db from './db';

// req.tenantId is set by resolveTenant below.
declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
    }
  }
}

const app = express();
app.use(express.json());

// --- tenant resolution -------------------------------------------------
// Tenant comes from the X-Tenant header for now. Every data query below
// filters by the resolved tenant_id.
async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const slug = req.header('X-Tenant');
  if (!slug) return res.status(400).json({ error: 'X-Tenant header required' });

  try {
    const { rows } = await db.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (rows.length === 0) return res.status(404).json({ error: 'unknown tenant' });
    req.tenantId = rows[0].id;
    next();
  } catch (err) {
    next(err);
  }
}

// --- health ------------------------------------------------------------
app.get('/healthz', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

app.get('/readyz', async (_req: Request, res: Response) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: (err as Error).message });
  }
});

// Prometheus metrics land here in B3.
app.get('/metrics', (_req: Request, res: Response) => {
  res.type('text/plain').send('# metrics not implemented yet\n');
});

// --- notes -------------------------------------------------------------
app.post('/api/notes', resolveTenant, async (req: Request, res: Response, next: NextFunction) => {
  const { title, body } = req.body ?? {};
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO notes (tenant_id, title, body)
       VALUES ($1, $2, $3) RETURNING id, tenant_id, title, body, created_at`,
      [req.tenantId, title, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/notes — DELIBERATELY BAD (N+1), keep it this way.
// ?limit is also unbounded on purpose.
app.get('/api/notes', resolveTenant, async (req: Request, res: Response, next: NextFunction) => {
  const limit = parseInt(String(req.query.limit), 10) || 20;
  const page = parseInt(String(req.query.page), 10) || 1;
  const offset = (page - 1) * limit;

  try {
    const notes = await db.query(
      'SELECT * FROM notes WHERE tenant_id=$1 ORDER BY id LIMIT $2 OFFSET $3',
      [req.tenantId, limit, offset]
    ); // 1 query

    for (const note of notes.rows) {
      // then N more queries
      const tags = await db.query('SELECT name FROM tags WHERE note_id=$1', [note.id]);
      note.tags = tags.rows.map((t: { name: string }) => t.name);
    }

    res.json({ page, limit, notes: notes.rows });
  } catch (err) {
    next(err);
  }
});

app.get('/api/notes/:id', resolveTenant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query('SELECT * FROM notes WHERE id=$1 AND tenant_id=$2', [
      req.params.id,
      req.tenantId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });

    const tags = await db.query('SELECT name FROM tags WHERE note_id=$1', [rows[0].id]);
    rows[0].tags = tags.rows.map((t: { name: string }) => t.name);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Unindexed LIKE scan on purpose — there is no index on notes.body.
app.get('/api/search', resolveTenant, async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    const { rows } = await db.query(
      `SELECT id, title, body, created_at FROM notes
       WHERE tenant_id=$1 AND body LIKE '%' || $2 || '%'
       LIMIT 50`,
      [req.tenantId, q]
    );
    res.json({ q, count: rows.length, results: rows });
  } catch (err) {
    next(err);
  }
});

// Joins all three tables. Slow because tags.note_id has no index.
app.get('/api/stats', resolveTenant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT t.slug,
              count(DISTINCT n.id) AS notes,
              count(g.id)          AS tags
       FROM tenants t
       LEFT JOIN notes n ON n.tenant_id = t.id
       LEFT JOIN tags  g ON g.note_id  = n.id
       WHERE t.id = $1
       GROUP BY t.slug`,
      [req.tenantId]
    );
    res.json(rows[0] ?? { notes: 0, tags: 0 });
  } catch (err) {
    next(err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`notes-api listening on ${port}`));
