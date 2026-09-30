CREATE SCHEMA IF NOT EXISTS advisor;
SET search_path TO advisor;
CREATE TABLE IF NOT EXISTS selection_backups (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    student_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    content TEXT NOT NULL,
    sha256 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS selection_backups_student ON selection_backups(student_id, id);
-- Danışman Atama Sistemi — Database Schema

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'hoca', 'ogrenci')),
    full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculty (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    department_id INTEGER NOT NULL REFERENCES departments(id),
    expertise_keywords TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    base_quota INTEGER DEFAULT 0,
    current_quota INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    gano DOUBLE PRECISION NOT NULL CHECK(gano >= 0 AND gano <= 4),
    department_id INTEGER NOT NULL REFERENCES departments(id),
    entry_year INTEGER NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
    transcript_full_name TEXT DEFAULT '',
    transcript_warning TEXT DEFAULT '',
    transcript_university TEXT DEFAULT '',
    transcript_department TEXT DEFAULT '',
    transcript_verified_at TIMESTAMPTZ,
    is_assigned INTEGER DEFAULT 0,
    assigned_faculty_id INTEGER REFERENCES faculty(id)
);



CREATE TABLE IF NOT EXISTS pre_assignments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id),
    faculty_id INTEGER NOT NULL REFERENCES faculty(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS preferences (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id),
    faculty_id INTEGER NOT NULL REFERENCES faculty(id),
    rank INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, rank),
    UNIQUE(student_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS assignment_logs (
    id SERIAL PRIMARY KEY,
    student_id INTEGER,
    faculty_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_transcripts (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    content BYTEA NOT NULL,
    byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 5242880),
    sha256 TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_events (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    before_json TEXT,
    after_json TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION advisor.record_system_event() RETURNS TRIGGER AS $$
DECLARE
    previous JSONB;
    current_record JSONB;
BEGIN
    IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD) - 'password_hash' - 'content'; END IF;
    IF TG_OP <> 'DELETE' THEN current_record := to_jsonb(NEW) - 'password_hash' - 'content'; END IF;
    INSERT INTO advisor.system_events (table_name, operation, record_id, before_json, after_json)
    VALUES (TG_TABLE_NAME, TG_OP, COALESCE((current_record->>'id')::INTEGER, (previous->>'id')::INTEGER),
            previous::TEXT, current_record::TEXT);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    audited_table TEXT;
BEGIN
    FOREACH audited_table IN ARRAY ARRAY['departments', 'users', 'students', 'faculty', 'preferences', 'pre_assignments', 'assignment_logs', 'student_transcripts'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_' || audited_table
                       AND tgrelid = ('advisor.' || audited_table)::regclass) THEN
            EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON advisor.%I FOR EACH ROW EXECUTE FUNCTION advisor.record_system_event()',
                           'audit_' || audited_table, audited_table);
        END IF;
    END LOOP;
END;
$$;
