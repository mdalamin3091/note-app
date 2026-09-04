import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://notes:notes@localhost:5432/notes',
});

export default pool;
