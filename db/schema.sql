-- Multi-tenant Notes API schema.
-- NOTE: no indexes are created here on purpose (see README "Deliberate problems").
-- In particular there is NO index on tags.note_id and none on notes.body.

DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS tenants;

CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  note_id INT NOT NULL REFERENCES notes(id),
  name TEXT NOT NULL
);
