// Seeds 5 tenants, 50,000 notes (unevenly spread) and 150,000 tags.
// Rows are generated inside Postgres with generate_series, so this is a
// handful of statements instead of 200,000 round trips.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../src/db';

const WORDS = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'kappa', 'lambda', 'sigma', 'omega', 'nimbus', 'quartz', 'ember', 'harbor',
  'meadow', 'lantern', 'cobalt', 'pinnacle',
];

// SQL literal for the word pool, used as a constant array in the queries below.
const WORD_ARRAY = `ARRAY[${WORDS.map((w) => `'${w}'`).join(',')}]`;

// One tenant gets 30,000 notes, the rest get fewer. The skew is on purpose.
const TENANTS = [
  { slug: 'acme', notes: 30000 },
  { slug: 'globex', notes: 8000 },
  { slug: 'initech', notes: 6000 },
  { slug: 'umbrella', notes: 4000 },
  { slug: 'hooli', notes: 2000 },
];

const WORDS_PER_BODY = 10;

// body = 10 random words joined by spaces, so /api/search has real words to find.
const bodyExpr = Array.from(
  { length: WORDS_PER_BODY },
  () => `a.w[1 + floor(random() * ${WORDS.length})::int]`
).join(" || ' ' || ");

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('applying schema...');
  await pool.query(schema);

  for (const t of TENANTS) {
    const { rows } = await pool.query(
      'INSERT INTO tenants (slug) VALUES ($1) RETURNING id',
      [t.slug]
    );
    const tenantId = rows[0].id;

    console.log(`seeding ${t.notes} notes for ${t.slug}...`);
    await pool.query(
      `INSERT INTO notes (tenant_id, title, body)
       SELECT $1::int, 'Note ' || g, ${bodyExpr}
       FROM generate_series(1, $2::int) g
       CROSS JOIN (SELECT ${WORD_ARRAY} AS w) a`,
      [tenantId, t.notes]
    );
  }

  console.log('seeding 150000 tags (3 per note)...');
  await pool.query(
    `INSERT INTO tags (note_id, name)
     SELECT n.id, a.w[1 + floor(random() * ${WORDS.length})::int]
     FROM notes n
     CROSS JOIN generate_series(1, 3)
     CROSS JOIN (SELECT ${WORD_ARRAY} AS w) a`
  );

  const counts = await pool.query(
    `SELECT t.slug, count(n.id) AS notes
     FROM tenants t LEFT JOIN notes n ON n.tenant_id = t.id
     GROUP BY t.slug ORDER BY notes DESC`
  );
  const tags = await pool.query('SELECT count(*) FROM tags');
  console.table(counts.rows);
  console.log('tags:', tags.rows[0].count);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
