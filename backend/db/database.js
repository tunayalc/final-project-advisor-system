const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const path = require('node:path');
const context = new AsyncLocalStorage();
let database;
let initialization;

function getDb() {
    if (database) return database;
    let tail = Promise.resolve();
    const exclusive = async (callback) => {
        const previous = tail;
        let release;
        tail = new Promise(resolve => { release = resolve; });
        await previous;
        try { return await callback(); } finally { release(); }
    };
    const postgres = Boolean(process.env.DATABASE_URL);
    let pool;
    let sqlite;
    if (postgres) {
        const { Pool, types } = require('pg');
        types.setTypeParser(20, Number);
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 5,
            connectionTimeoutMillis: 15000,
            idleTimeoutMillis: 30000,
            options: '-c search_path=advisor -c statement_timeout=30000',
            ssl: { rejectUnauthorized: true, ca: fs.readFileSync(path.join(__dirname, 'supabase-ca.crt'), 'utf8') },
        });
        pool.on('error', () => console.error('Veritabanı bağlantısı kesildi.'));
    } else sqlite = require('./sqlite').getDb();
    const query = async (sql, params = [], mode = 'all') => {
        const execute = async () => {
            if (!postgres) return sqlite.prepare(sql)[mode](...params);
            let index = 0;
            let statement = sql.replace(/'([^']|'')*'|\?/g, token => token === '?' ? `$${++index}` : token);
            const ignore = /INSERT\s+OR\s+IGNORE/i.test(statement);
            statement = statement.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT').trim().replace(/;$/, '');
            if (ignore) statement += ' ON CONFLICT DO NOTHING';
            if (mode === 'run' && /^INSERT\s/i.test(statement)) statement += ' RETURNING id';
            try {
                const result = await (context.getStore()?.client || pool).query(statement, params);
                if (mode === 'get') return result.rows[0];
                if (mode === 'run') return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
                return result.rows;
            } catch (error) {
                if (error.code === '23505') error.code = 'SQLITE_CONSTRAINT_UNIQUE';
                throw error;
            }
        };
        return context.getStore() || postgres ? execute() : exclusive(execute);
    };
    database = {
        prepare: sql => ({
            get: (...params) => query(sql, params, 'get'),
            all: (...params) => query(sql, params, 'all'),
            run: (...params) => query(sql, params, 'run'),
        }),
        transaction: callback => async (...args) => {
            if (context.getStore()) return callback(...args);
            const execute = async () => {
                const client = postgres ? await pool.connect() : null;
                try {
                    if (client) {
                        await client.query('BEGIN');
                        // Serialize writes across backend instances, including placement.
                        await client.query('SELECT pg_advisory_xact_lock(74182901)');
                    } else sqlite.exec('BEGIN IMMEDIATE');
                    const result = await context.run({ client }, () => callback(...args));
                    if (client) await client.query('COMMIT'); else sqlite.exec('COMMIT');
                    return result;
                } catch (error) {
                    if (client) await client.query('ROLLBACK'); else sqlite.exec('ROLLBACK');
                    throw error;
                } finally { client?.release(); }
            };
            return postgres ? execute() : exclusive(execute);
        },
        close: () => postgres ? pool.end() : sqlite.close(),
        initialize: async () => {
            if (!postgres) return;
            await pool.query(fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8'));
            await require('./seed-postgres')(database);
        },
    };
    return database;
}

function initializeDb() {
    initialization ||= getDb().initialize();
    return initialization;
}
module.exports = { getDb, initializeDb };
