"""
LifeLink demo-data reset and seed utility.

Run from the backend folder:
    python3 seed_demo_data.py

This intentionally clears existing operational records (allocations, matches,
requests, inventory, donors and recipients), but preserves users and existing
hospitals so you can still log in. It creates clearly labelled synthetic demo
records. It does NOT create real medical data.

Before deleting anything, it exports a JSON snapshot of all current tables to
backend/backups/. You must type the exact confirmation phrase to proceed.
"""
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from app import get_db_connection

random.seed(42)

DEMO = "DEMO | "
BLOOD_GROUPS = ["A", "B", "AB", "O"]
RH_FACTORS = ["+", "-"]
GENDERS = ["Female", "Male"]
URGENCIES = ["Low", "Medium", "High", "Critical"]
HLA = [
    "HLA-A:02,24; HLA-B:07,35; HLA-DR:04,15",
    "HLA-A:01,03; HLA-B:08,44; HLA-DR:03,11",
    "HLA-A:02,11; HLA-B:15,40; HLA-DR:04,13",
    "HLA-A:24,29; HLA-B:18,44; HLA-DR:07,15",
]
ORGAN_TYPES = ["Kidney", "Liver", "Heart", "Lung", "Pancreas"]
FIRST_NAMES = [
    "Aarav", "Diya", "Ishaan", "Ananya", "Vivaan", "Meera", "Arjun",
    "Kavya", "Rohan", "Nisha", "Aditya", "Priya", "Kiran", "Sana",
    "Dev", "Aditi", "Rahul", "Tara", "Neel", "Maya", "Kabir", "Ira",
    "Varun", "Riya", "Siddharth", "Anika", "Manav", "Leela", "Reyansh",
    "Pooja", "Yash", "Zoya", "Aman", "Ishita", "Om", "Navya",
]
LAST_NAMES = [
    "Sharma", "Iyer", "Reddy", "Nair", "Patel", "Gupta", "Rao", "Khan",
    "Menon", "Das", "Kapoor", "Joshi", "Pillai", "Verma", "Singh",
    "Kulkarni", "Bose", "Thomas", "Mishra", "Chatterjee",
]

def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "total_seconds"):
        return str(value)
    return str(value)

def main():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # Find the active System Admin's home hospital so seeded records show
        # in the admin's hospital-scoped pages.
        cur.execute("""
            SELECT user_id, hospital_id, email
            FROM users
            WHERE role = 'System Admin' AND is_active = 1
            ORDER BY user_id
            LIMIT 1
        """)
        admin = cur.fetchone()
        if not admin:
            raise RuntimeError(
                "No active System Admin account was found. Log in/promote your "
                "admin account first, then run this script again."
            )
        if not admin["hospital_id"]:
            raise RuntimeError(
                "The System Admin account has no hospital_id. Assign it to an "
                "existing hospital before seeding demo records."
            )

        cur.execute("SELECT hospital_id, hospital_name, branch_name, city, state "
                    "FROM hospitals ORDER BY hospital_id")
        hospitals = cur.fetchall()
        if not hospitals:
            raise RuntimeError("No hospitals exist. Add a hospital first.")

        print("\nLIFELINK DEMO RESET")
        print(f"Admin account: {admin['email']}")
        print(f"Demo records will be attached to hospital_id={admin['hospital_id']}.")
        print("WARNING: existing donors, recipients, inventory, requests, matches,")
        print("and allocations will be deleted after a backup snapshot is written.")
        confirm = input('\nType RESET AND SEED DEMO DATA to continue: ').strip()
        if confirm != "RESET AND SEED DEMO DATA":
            print("Cancelled. No database records were changed.")
            return

        # Snapshot all tables before changing data.
        cur.execute("SHOW TABLES")
        table_names = [row[next(iter(row))] for row in cur.fetchall()]
        snapshot = {"created_at": datetime.now().isoformat(), "tables": {}}
        for table in table_names:
            # Table names come only from SHOW TABLES, not user input.
            cur.execute(f"SELECT * FROM `{table}`")
            snapshot["tables"][table] = cur.fetchall()

        backup_dir = Path(__file__).resolve().parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / f"lifelink_before_demo_{datetime.now():%Y%m%d_%H%M%S}.json"
        backup_path.write_text(
            json.dumps(snapshot, indent=2, default=json_default),
            encoding="utf-8",
        )
        print(f"Backup snapshot saved to: {backup_path}")

        hospital_id = int(admin["hospital_id"])
        if not conn.in_transaction:
            if not conn.in_transaction:
                conn.start_transaction()

        # Clear child tables first. Preserve accounts and existing hospitals.
        for table in ("allocations", "matches", "requests", "blood_units",
                      "organs", "donors", "recipients"):
            cur.execute(f"DELETE FROM `{table}`")

        donor_ids = []
        recipient_ids = []
        blood_ids = []
        organ_ids = []
        request_ids = []
        donor_meta = []
        recipient_meta = []

        # 30 synthetic donors, each with a DEMO label to make them obvious.
        for i in range(30):
            first = FIRST_NAMES[i % len(FIRST_NAMES)]
            last = LAST_NAMES[(i * 3) % len(LAST_NAMES)]
            name = f"{DEMO}{first} {last} {i+1:02d}"
            dob = date.today() - timedelta(days=random.randint(22 * 365, 65 * 365))
            group = BLOOD_GROUPS[i % len(BLOOD_GROUPS)]
            rh = RH_FACTORS[(i // 2) % 2]
            eligibility = ["Eligible", "Eligible", "Pending", "Not Eligible"][i % 4]
            cur.execute("""
                INSERT INTO donors
                (hospital_id, full_name, date_of_birth, gender, blood_group,
                 rh_factor, phone, email, medical_notes, eligibility_status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                hospital_id, name, dob, GENDERS[i % 2], group, rh,
                f"90000{i:05d}", f"demo.donor{i+1:02d}@example.test",
                "Synthetic demonstration record; not real patient data.",
                eligibility
            ))
            donor_id = cur.lastrowid
            donor_ids.append(donor_id)
            donor_meta.append((donor_id, group, rh, i))

        # 24 synthetic recipients with varied urgency and eligibility.
        for i in range(24):
            first = FIRST_NAMES[(i * 5 + 2) % len(FIRST_NAMES)]
            last = LAST_NAMES[(i * 7 + 1) % len(LAST_NAMES)]
            group = BLOOD_GROUPS[(i * 3) % len(BLOOD_GROUPS)]
            rh = RH_FACTORS[i % 2]
            urgency = URGENCIES[i % len(URGENCIES)]
            eligibility = ["Eligible", "Pending", "Eligible", "Not Eligible"][i % 4]
            dob = date.today() - timedelta(days=random.randint(3 * 365, 78 * 365))
            cur.execute("""
                INSERT INTO recipients
                (hospital_id, full_name, date_of_birth, gender, blood_group,
                 rh_factor, hla_profile, clinical_urgency, medical_notes,
                 eligibility_status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                hospital_id, f"{DEMO}{first} {last} {i+1:02d}", dob,
                GENDERS[(i + 1) % 2], group, rh, HLA[i % len(HLA)],
                urgency, "Synthetic demonstration record; not real patient data.",
                eligibility
            ))
            rid = cur.lastrowid
            recipient_ids.append(rid)
            recipient_meta.append((rid, group, rh, urgency, i))

        # 48 blood units, with mostly available stock plus status variety.
        for i in range(48):
            donor_id, group, rh, _ = donor_meta[i % len(donor_meta)]
            collected = date.today() - timedelta(days=random.randint(0, 28))
            expiry = collected + timedelta(days=42)
            status = ["Available", "Available", "Available", "Reserved",
                      "Unavailable", "Expired"][i % 6]
            if status == "Expired":
                collected = date.today() - timedelta(days=55)
                expiry = date.today() - timedelta(days=13)
            cur.execute("""
                INSERT INTO blood_units
                (donor_id, hospital_id, blood_group, rh_factor, collection_date,
                 expiry_date, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, (donor_id, hospital_id, group, rh, collected, expiry, status))
            blood_ids.append((cur.lastrowid, group, rh, status))

        # 16 synthetic organ records; statuses demonstrate availability states.
        for i in range(16):
            donor_id, group, rh, _ = donor_meta[(i * 2) % len(donor_meta)]
            status = ["Available", "Available", "Reserved", "Unavailable"][i % 4]
            now = datetime.now()
            collected_at = now - timedelta(hours=random.randint(1, 8))
            viable_until = now + timedelta(hours=random.randint(12, 72))
            cur.execute("""
                INSERT INTO organs
                (donor_id, hospital_id, organ_type, blood_group, rh_factor,
                 hla_profile, donor_age, collection_datetime, viability_until, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                donor_id, hospital_id, ORGAN_TYPES[i % len(ORGAN_TYPES)],
                group, rh, HLA[i % len(HLA)], random.randint(18, 60),
                collected_at, viable_until, status
            ))
            organ_ids.append((cur.lastrowid, ORGAN_TYPES[i % len(ORGAN_TYPES)],
                              group, rh, status))

        # 28 requests, split across blood and organ use cases.
        for i in range(28):
            recipient_id, group, rh, urgency, _ = recipient_meta[i % len(recipient_meta)]
            req_type = "Blood" if i % 2 == 0 else "Organ"
            requested_group = group if req_type == "Blood" else None
            requested_rh = rh if req_type == "Blood" else None
            requested_organ = None if req_type == "Blood" else ORGAN_TYPES[(i // 2) % len(ORGAN_TYPES)]
            status = ["Pending", "Pending", "Matched", "Cancelled"][i % 4]
            cur.execute("""
                INSERT INTO requests
                (hospital_id, recipient_id, request_type, requested_blood_group,
                 requested_rh_factor, requested_organ_type, quantity, urgency, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                hospital_id, recipient_id, req_type, requested_group,
                requested_rh, requested_organ, 1 if req_type == "Organ" else (1 + i % 3),
                urgency, status
            ))
            request_ids.append((cur.lastrowid, recipient_id, req_type, group, rh,
                                requested_organ, urgency, status))

        # Create candidate match rows for both blood and organ requests.
        match_ids = []
        for req_id, recipient_id, req_type, group, rh, requested_organ, urgency, req_status in request_ids:
            if req_type == "Blood":
                candidates = [
                    x for x in blood_ids
                    if x[3] == "Available" and x[1] in (
                        ["O"] if group == "O" else
                        ["A", "O"] if group == "A" else
                        ["B", "O"] if group == "B" else
                        ["A", "B", "AB", "O"]
                    )
                ][:2]
            else:
                candidates = [
                    x for x in organ_ids
                    if x[1] == requested_organ and x[4] == "Available"
                ][:2]

            for rank, candidate in enumerate(candidates, start=1):
                blood_id = candidate[0] if req_type == "Blood" else None
                organ_id = candidate[0] if req_type == "Organ" else None
                compatibility = round(random.uniform(70, 99), 2)
                urgency_score = {"Low": 20, "Medium": 45, "High": 75, "Critical": 95}[urgency]
                total_score = round(compatibility * 0.7 + urgency_score * 0.3, 2)
                cur.execute("""
                    INSERT INTO matches
                    (request_id, blood_unit_id, organ_id, recipient_id,
                     compatibility_type, compatibility_score, urgency_score,
                     total_score, rank_position, match_status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'Candidate')
                """, (
                    req_id, blood_id, organ_id, recipient_id,
                    "Demo blood-group compatibility" if req_type == "Blood"
                    else "Demo organ/HLA candidate",
                    compatibility, urgency_score, total_score, rank
                ))
                match_ids.append((cur.lastrowid, req_id, blood_id, organ_id, rank))

        # Add 4 synthetic reservation-history examples, linked consistently.
        # Choose candidate rows and reserve their inventory/request/match.
        reservation_count = 0
        reserved_blood_ids = set()
        reserved_organ_ids = set()
        reserved_request_ids = set()
        for match_id, req_id, blood_id, organ_id, rank in match_ids:
            if reservation_count >= 4:
                break
            # Avoid reserving the same inventory item or request twice.
            if req_id in reserved_request_ids:
                continue
            if blood_id is not None and blood_id in reserved_blood_ids:
                continue
            if organ_id is not None and organ_id in reserved_organ_ids:
                continue
            cur.execute("""
                SELECT match_status FROM matches WHERE match_id = %s
            """, (match_id,))
            if not cur.fetchone():
                continue
            cur.execute("""
                UPDATE matches SET match_status = 'Reserved' WHERE match_id = %s
            """, (match_id,))
            if blood_id:
                cur.execute("""
                    UPDATE blood_units SET status = 'Reserved'
                    WHERE blood_unit_id = %s
                """, (blood_id,))
            if organ_id:
                cur.execute("""
                    UPDATE organs SET status = 'Reserved'
                    WHERE organ_id = %s
                """, (organ_id,))
            cur.execute("""
                UPDATE requests SET status = 'Reserved' WHERE request_id = %s
            """, (req_id,))
            cur.execute("""
                INSERT INTO allocations
                (match_id, request_id, blood_unit_id, organ_id, hospital_id,
                 allocation_status, allocated_at)
                VALUES (%s,%s,%s,%s,%s,'Reserved',NULL)
            """, (match_id, req_id, blood_id, organ_id, hospital_id))
            reservation_count += 1
            reserved_request_ids.add(req_id)
            if blood_id is not None:
                reserved_blood_ids.add(blood_id)
            if organ_id is not None:
                reserved_organ_ids.add(organ_id)

        conn.commit()
        print("\nDemo data successfully created.")
        print("  Donors:       30")
        print("  Recipients:   24")
        print("  Blood units:  48")
        print("  Organs:       16")
        print("  Requests:     28")
        print(f"  Matches:      {len(match_ids)}")
        print(f"  Allocations:  {reservation_count}")
        print("All generated people are labelled 'DEMO |' and use example.test emails.")
        print("Keep this database for the review only; it contains synthetic, non-clinical data.")

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
