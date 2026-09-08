CREATE SCHEMA IF NOT EXISTS advisor;
SET search_path TO advisor;
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
