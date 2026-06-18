import json
import os
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import requests


ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

BASE_URL = None
DB_PATH = None
results = []

STUDENT_PASSWORD = "Temp1234!"
REQUIRED_DEPARTMENTS = {
    "Yapay Zeka ve Veri Mühendisliği",
    "Bilgisayar Mühendisliği",
}


@dataclass
class ScenarioResult:
    name: str
    status: str
    details: str


def record(name, ok, details):
    results.append(ScenarioResult(name=name, status="PASS" if ok else "FAIL", details=details))


def escape_pdf_text(value):
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf_bytes(lines):
    text_ops = ["BT", "/F1 12 Tf", "72 760 Td"]
    for line in lines:
        text_ops.append(f"({escape_pdf_text(line)}) Tj")
        text_ops.append("0 -18 Td")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


def write_transcript(temp_dir, full_name, label="GABNO", gano="3,48", include_name=True):
    lines = ["Ankara Universitesi Transkript Belgesi"]
    if include_name:
        lines.append(f"Ad Soyad: {full_name}")
    if label:
        lines.append(f"{label}: {gano}")
    lines.append("Belge sonu")

    path = Path(temp_dir) / f"transcript-{time.time_ns()}.pdf"
    path.write_bytes(make_pdf_bytes(lines))
    return path


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_port(port, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.5)
    raise TimeoutError(f"Backend {port} portunda zamaninda ayaga kalkmadi.")


def prepare_temp_db(temp_dir):
    return Path(temp_dir) / "danisman_atama.runtime.db"


def start_backend(temp_db):
    port = find_free_port()
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["DB_PATH"] = str(temp_db)
    env["JWT_SECRET"] = "runtime-verification-secret"
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    node_binary = shutil.which("node") or shutil.which("node.exe")

    if not node_binary:
        raise FileNotFoundError("Node.js yurutulebilir dosyasi bulunamadi.")

    process = subprocess.Popen(
        [node_binary, "server.js"],
        cwd=BACKEND_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=creationflags,
    )

    try:
        wait_for_port(port)
    except Exception:
        stop_backend(process)
        output = ""
        if process.stdout:
            output = process.stdout.read()
        raise RuntimeError(f"Backend baslatilamadi.\n{output}") from None

    return process, f"http://127.0.0.1:{port}/api"


def stop_backend(process):
    if process.poll() is not None:
        return

    if os.name == "nt" and hasattr(signal, "CTRL_BREAK_EVENT"):
        try:
            process.send_signal(signal.CTRL_BREAK_EVENT)
            process.wait(timeout=5)
            return
        except (ProcessLookupError, subprocess.TimeoutExpired):
            pass

    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def db_connect():
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL;")
    return connection


def db_one(query, params=()):
    connection = db_connect()
    try:
        row = connection.execute(query, params).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def db_all(query, params=()):
    connection = db_connect()
    try:
        rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def db_run(query, params=()):
    connection = db_connect()
    try:
        connection.execute(query, params)
        connection.commit()
    finally:
        connection.close()


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}{path}", headers=headers, timeout=30, **kwargs)


def expect_status(response, expected, context):
    if response.status_code != expected:
        raise AssertionError(f"{context}: expected {expected}, got {response.status_code}, body={response.text}")


def login(email, password):
    response = api("POST", "/auth/login", json={"email": email, "password": password})
    expect_status(response, 200, f"login {email}")
    data = response.json()
    return data["token"], data["user"]


def register_student(temp_dir, email, full_name, label="GABNO", gano="3,48", password=STUDENT_PASSWORD, department_id=1):
    transcript_path = write_transcript(temp_dir, full_name, label=label, gano=gano)
    with transcript_path.open("rb") as transcript:
        response = api(
            "POST",
            "/auth/register",
            data={
                "full_name": full_name,
                "email": email,
                "password": password,
                "department_id": str(department_id),
                "entry_year": "2023",
            },
            files={
                "transcript": ("transcript.pdf", transcript, "application/pdf"),
            },
        )
    expect_status(response, 201, f"register {email}")
    return response.json()


def attempt_register(temp_dir, email, full_name, label, gano, department_id=1):
    transcript_path = write_transcript(temp_dir, full_name, label=label, gano=gano)
    with transcript_path.open("rb") as transcript:
        return api(
            "POST",
            "/auth/register",
            data={
                "full_name": full_name,
                "email": email,
                "password": STUDENT_PASSWORD,
                "department_id": str(department_id),
                "entry_year": "2023",
            },
            files={"transcript": ("transcript.pdf", transcript, "application/pdf")},
        )


def get_student_by_email(email):
    return db_one(
        """
        SELECT s.*, u.email, u.full_name
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE u.email = ?
        """,
        (email,),
    )


def get_pending_application(admin_token, email):
    response = api("GET", "/admin/student-applications", token=admin_token)
    expect_status(response, 200, "student applications")
    applications = response.json()
    match = next((application for application in applications if application["email"] == email), None)
    if not match:
        raise AssertionError(f"{email} onay bekleyen listesinde bulunamadi")
    return match


def review_application(admin_token, application, status):
    response = api(
        "PATCH",
        f"/admin/students/{application['id']}/review",
        token=admin_token,
        json={
            "approval_status": status,
            "full_name": application["full_name"],
            "email": application["email"],
            "gano": application["gano"],
            "entry_year": application["entry_year"],
        },
    )
    expect_status(response, 200, f"review {application['email']} as {status}")


def run_scenarios(temp_dir):
    stamp = int(time.time())
    admin_token, admin_user = login("admin@ankara.edu.tr", "admin123")
    faculty_token, faculty_user = login("ahmet.yilmaz@ankara.edu.tr", "hoca123")
    departments_response = api("GET", "/auth/departments")
    expect_status(departments_response, 200, "public departments")
    public_department_names = {department["name"] for department in departments_response.json()}

    pending_email = f"runtime.pending.{stamp}@ankara.edu.tr"
    pending_name = f"Runtime Pending {stamp}"
    pending_register = register_student(temp_dir, pending_email, pending_name, label="GABNO", gano="3,48")
    pending_token = pending_register["token"]

    unauthorized = api("GET", "/admin/get_dashboard_data", token=pending_token)
    record(
        "1. Rol bazli giris ve yetki kontrolu",
        admin_user["role"] == "admin"
        and faculty_user["role"] == "hoca"
        and unauthorized.status_code == 403
        and REQUIRED_DEPARTMENTS.issubset(public_department_names),
        "admin ve danisman seed hesaplari giris yapti; ogrenci tokeni admin endpointinden 403 aldi; public bolum listesi geldi.",
    )

    profile_response = api("GET", "/students/me", token=pending_token)
    expect_status(profile_response, 200, "pending student profile")
    pending_profile = profile_response.json()
    record(
        "2. GABNO transkript kaydi pending ogrenci olusturur",
        pending_profile["approval_status"] == "pending" and abs(float(pending_profile["gano"]) - 3.48) < 0.001,
        f"GABNO okundu, GANO={pending_profile['gano']}, durum={pending_profile['approval_status']}.",
    )

    faculty_list_pending = api("GET", "/students/faculty-list", token=pending_token)
    save_pending = api("POST", "/students/preferences", token=pending_token, json={"preferences": [1]})
    record(
        "3. Pending ogrenci tercih akislarindan engellenir",
        faculty_list_pending.status_code == 403 and save_pending.status_code == 403,
        "pending ogrenci danisman listesini alamadi ve tercih kaydedemedi.",
    )

    gano_email = f"runtime.gano.{stamp}@ankara.edu.tr"
    gano_response = attempt_register(temp_dir, gano_email, f"Runtime Gano {stamp}", "GANO", "3.42")
    missing_response = attempt_register(temp_dir, f"runtime.missing.{stamp}@ankara.edu.tr", "Runtime Missing", "", "")
    invalid_response = attempt_register(temp_dir, f"runtime.invalid.{stamp}@ankara.edu.tr", "Runtime Invalid", "GANO", "4.50")
    gano_student = get_student_by_email(gano_email)
    record(
        "4. GANO/GABNO ve gecersiz transkript varyasyonlari",
        gano_response.status_code == 201
        and gano_student is not None
        and abs(float(gano_student["gano"]) - 3.42) < 0.001
        and missing_response.status_code == 400
        and invalid_response.status_code == 400,
        "GANO nokta formati kabul edildi; eksik ve 0-4 disi GANO reddedildi.",
    )

    pending_application = get_pending_application(admin_token, pending_email)
    review_application(admin_token, pending_application, "approved")
    approved_profile = api("GET", "/students/me", token=pending_token)
    expect_status(approved_profile, 200, "approved student profile")

    faculty_response = api("GET", "/students/faculty-list", token=pending_token)
    expect_status(faculty_response, 200, "approved faculty list")
    faculty_list = faculty_response.json()
    preference_ids = [faculty["id"] for faculty in faculty_list[:4]]
    save_approved = api("POST", "/students/preferences", token=pending_token, json={"preferences": preference_ids})
    preferences_response = api("GET", "/students/preferences", token=pending_token)
    expect_status(save_approved, 200, "save approved preferences")
    expect_status(preferences_response, 200, "read approved preferences")
    record(
        "5. Admin onayi sonrasi ogrenci tercih yapabilir",
        approved_profile.json()["approval_status"] == "approved"
        and len(faculty_list) > 0
        and len(preferences_response.json()) == len(preference_ids),
        "admin onayi verildi; ogrenci aktif danismanlari gordu ve tercihlerini kaydetti.",
    )

    bm_email = f"runtime.bm.{stamp}@ankara.edu.tr"
    bm_name = f"Runtime BM {stamp}"
    bm_register = register_student(temp_dir, bm_email, bm_name, label="GABNO", gano="3,55", department_id=2)
    bm_application = get_pending_application(admin_token, bm_email)
    review_application(admin_token, bm_application, "approved")
    bm_faculty_response = api("GET", "/students/faculty-list", token=bm_register["token"])
    expect_status(bm_faculty_response, 200, "bm faculty list")
    bm_faculty_names = {faculty["full_name"] for faculty in bm_faculty_response.json()}
    record(
        "6. Secilen bolum ogrencinin danisman havuzunu izole eder",
        len(bm_faculty_names) == 10
        and "Prof. Dr. Cem Arslan" in bm_faculty_names
        and "Prof. Dr. Ahmet Yılmaz" not in bm_faculty_names,
        "Bilgisayar Muhendisligi ogrencisi yalniz kendi bolumundeki 10 danismani gordu.",
    )

    quota_response = api("POST", "/admin/calculate-quotas", token=admin_token)
    assignment_response = api("POST", "/admin/run-assignment", token=admin_token)
    expect_status(quota_response, 200, "calculate quotas")
    expect_status(assignment_response, 200, "run assignment")
    assigned_profile = api("GET", "/students/me", token=pending_token)
    expect_status(assigned_profile, 200, "assigned profile")
    resave_assigned = api("POST", "/students/preferences", token=pending_token, json={"preferences": preference_ids})
    logs_response = api("GET", "/admin/logs", token=admin_token)
    expect_status(logs_response, 200, "admin logs")
    score_log = next(
        (
            log
            for log in logs_response.json()
            if log["action"] == "SCORE_ASSIGN" and "Puan:" in (log["details"] or "")
        ),
        None,
    )
    record(
        "7. Puanli atama ve atanmis ogrenci kilidi",
        assigned_profile.json()["is_assigned"] == 1 and resave_assigned.status_code == 400 and score_log is not None,
        "atama calisti; SCORE_ASSIGN puan logu olustu ve atanmis ogrenci tercih degistiremedi.",
    )

    rejected_email = f"runtime.rejected.{stamp}@ankara.edu.tr"
    rejected_name = f"Runtime Rejected {stamp}"
    register_student(temp_dir, rejected_email, rejected_name, label="GANO", gano="3.21")
    rejected_application = get_pending_application(admin_token, rejected_email)
    review_application(admin_token, rejected_application, "rejected")

    hidden_pending_email = f"runtime.hidden.{stamp}@ankara.edu.tr"
    hidden_pending_name = f"Runtime Hidden {stamp}"
    register_student(temp_dir, hidden_pending_email, hidden_pending_name, label="GABNO", gano="3,33")

    db_run(
        """
        UPDATE faculty
        SET base_quota = current_quota + 5
        WHERE user_id = (SELECT id FROM users WHERE email = ?)
        """,
        ("ahmet.yilmaz@ankara.edu.tr",),
    )
    faculty_students = api("GET", "/faculty/students?minGano=0", token=faculty_token)
    expect_status(faculty_students, 200, "faculty visible students")
    visible_names = {student["full_name"] for student in faculty_students.json()}
    rejected_student = get_student_by_email(rejected_email)
    rejected_invite = api("POST", "/faculty/invite", token=faculty_token, json={"student_id": rejected_student["id"]})
    record(
        "8. Danisman yalnizca onayli ogrencilerle calisir",
        rejected_name not in visible_names
        and hidden_pending_name not in visible_names
        and rejected_invite.status_code == 400
        and "onaylı" in rejected_invite.text,
        "pending/rejected ogrenciler danisman listesinde gorunmedi ve rejected ogrenciye teklif reddedildi.",
    )

    created_faculty_email = f"runtime.faculty.{stamp}@ankara.edu.tr"
    create_faculty = api(
        "POST",
        "/admin/users",
        token=admin_token,
        json={
            "full_name": f"Runtime Faculty {stamp}",
            "email": created_faculty_email,
            "password": "Hoca1234!",
            "department_id": 1,
            "expertise_keywords": "Runtime Test",
        },
    )
    departments = db_all("SELECT name FROM departments")
    department_names = {department["name"] for department in departments}
    created_user = db_one("SELECT role FROM users WHERE email = ?", (created_faculty_email,))
    record(
        "9. Admin yalnizca danisman olusturur ve ana bolumler korunur",
        create_faculty.status_code == 201
        and created_user["role"] == "hoca"
        and REQUIRED_DEPARTMENTS.issubset(department_names),
        "admin /admin/users ile hoca olusturdu; seed veritabani ana bolumleri iceriyor.",
    )

    wrong_password = api(
        "POST",
        "/auth/change-password",
        token=faculty_token,
        json={"current_password": "yanlis", "new_password": "YeniSifre123!"},
    )
    right_password = api(
        "POST",
        "/auth/change-password",
        token=faculty_token,
        json={"current_password": "hoca123", "new_password": "YeniSifre123!"},
    )
    relogin = api("POST", "/auth/login", json={"email": "ahmet.yilmaz@ankara.edu.tr", "password": "YeniSifre123!"})
    record(
        "10. Sifre degistirme akisi",
        wrong_password.status_code == 401 and right_password.status_code == 200 and relogin.status_code == 200,
        "hatali mevcut sifre reddedildi; dogru sifreyle yeni sifre kaydedildi ve tekrar giris yapildi.",
    )


def main():
    global BASE_URL, DB_PATH
    process = None

    with tempfile.TemporaryDirectory(prefix="danisman-runtime-") as temp_dir:
        DB_PATH = prepare_temp_db(temp_dir)
        process, BASE_URL = start_backend(DB_PATH)
        try:
            run_scenarios(temp_dir)
        finally:
            stop_backend(process)

    payload = [asdict(result) for result in results]
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if any(result.status == "FAIL" for result in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
