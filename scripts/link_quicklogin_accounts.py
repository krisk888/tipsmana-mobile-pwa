#!/usr/bin/env python3
"""Idempotent: link the 6 PWA quick-login accounts to 'Le Resto du Coin'.

Roles available at this establishment: OWNER, ADMIN, MANAGER, CHEF, WAITER.
Mapping (best match per PWA quick-login labels):
  Manager        -> MANAGER  (both)         manager@restoducoin.fr
  Chef cuisine   -> CHEF     (kitchen)      cuisinier@restoducoin.fr
  Inventaire     -> ADMIN    (both)         admin@restoducoin.fr
  Ventes         -> ADMIN    (both)         admin@restoducoin.fr
  Achats         -> ADMIN    (both)         admin@restoducoin.fr
  Serveur        -> WAITER   (dining_room)  serveur1@restoducoin.fr
Safe to re-run.
"""

import pymysql
import uuid
from datetime import datetime

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "costcontrol",
    "password": "costctrl2026",
    "database": "costcontrol_dev",
    "charset": "utf8mb4",
}

ESTABLISHMENT_NAME = "Le Resto du Coin"

ACCOUNTS = [
    {"email": "manager@restoducoin.fr",  "role_code": "MANAGER", "section": "both"},
    {"email": "cuisinier@restoducoin.fr", "role_code": "CHEF",    "section": "kitchen"},
    {"email": "admin@restoducoin.fr",     "role_code": "ADMIN",   "section": "both"},
    {"email": "admin@restoducoin.fr",     "role_code": "ADMIN",   "section": "both"},
    {"email": "admin@restoducoin.fr",     "role_code": "ADMIN",   "section": "both"},
    {"email": "serveur1@restoducoin.fr",  "role_code": "WAITER",  "section": "dining_room"},
]


def main():
    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor(pymysql.cursors.DictCursor)

    # Find the establishment the Boss is linked to (avoid duplicate-name ambiguity)
    cur.execute("SELECT ue.establishment_id FROM users u "
                "JOIN user_establishments ue ON ue.user_id = u.id "
                "WHERE u.email = 'boss@restoducoin.fr' AND ue.is_active = 1 LIMIT 1")
    row = cur.fetchone()
    if not row:
        print("ERROR: Boss has no active establishment link.")
        return 1
    est_id = row["establishment_id"]
    cur.execute("SELECT name FROM establishments WHERE id = %s", (est_id,))
    est_name = cur.fetchone()["name"]
    print(f"Establishment: {est_id} ({est_name})")

    # Load roles for this establishment
    cur.execute("SELECT id, code FROM roles WHERE establishment_id = %s", (est_id,))
    roles = {r["code"]: r["id"] for r in cur.fetchall() if r["code"] in
             ("MANAGER", "CHEF", "WAITER", "OWNER", "ADMIN")}
    print(f"Available roles: {roles}")

    now = datetime.now()
    created, skipped = 0, 0

    for acct in ACCOUNTS:
        email = acct["email"]
        role_id = roles.get(acct["role_code"])
        if not role_id:
            print(f"  ⚠ SKIP {email}: role '{acct['role_code']}' missing")
            skipped += 1
            continue

        cur.execute("SELECT id, first_name, last_name FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user:
            print(f"  ⚠ SKIP {email}: user not found")
            skipped += 1
            continue
        user_id = user["id"]

        cur.execute("SELECT id FROM user_establishments WHERE user_id=%s AND establishment_id=%s",
                    (user_id, est_id))
        if cur.fetchone():
            print(f"  ✓ {email} already linked — skipped")
            skipped += 1
            continue

        ue_id = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO user_establishments
               (id, user_id, establishment_id, role_id, section_access, is_active,
                hired_at, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, 1, %s, %s, %s)""",
            (ue_id, user_id, est_id, role_id, acct["section"], now, now, now),
        )
        print(f"  ✚ LINKED {email} ({user['first_name']} {user['last_name']}) "
              f"→ {acct['role_code']} / {acct['section']}")
        created += 1

    conn.commit()
    conn.close()
    print(f"\nDone: {created} linked, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    exit(main())