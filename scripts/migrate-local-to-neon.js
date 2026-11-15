import dotenv from 'dotenv';
import { closeDatabase, getDatabasePool, migrateDatabase } from '../database.js';
import { migrateLocalAuthStore } from '../migrateLocalData.js';

dotenv.config();

const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !['--dry-run', '--apply'].includes(arg)) ||
    (args.has('--dry-run') && args.has('--apply'))) {
  throw new Error('Use either --dry-run or --apply.');
}

const apply = args.has('--apply');
if (!process.env.DATABASE_URL) {
  if (apply) {
    throw new Error('Set DATABASE_URL in the server environment before applying migration.');
  }
  const result = await migrateLocalAuthStore({ apply: false });
  console.log(JSON.stringify(result, null, 2));
} else if (!apply) {
  const result = await migrateLocalAuthStore({ apply: false });
  console.log(JSON.stringify({
    ...result,
    databaseConfigured: true,
    nextStep: 'Review the counts, then run npm run migrate:neon -- --apply.'
  }, null, 2));
} else {
  try {
    const pool = getDatabasePool();
    await migrateDatabase(pool);
    await pool.query('SELECT 1');
    const result = await migrateLocalAuthStore({
      db: pool,
      apply: true
    });
    console.log(JSON.stringify({
      status: result.status,
      users: result.users,
      activeSessions: result.sessions,
      credentials: result.credentials,
      backupPath: result.backupPath
    }, null, 2));
  } finally {
    await closeDatabase();
  }
}
