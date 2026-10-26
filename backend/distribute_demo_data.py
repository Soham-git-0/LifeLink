"""
Distribute existing DEMO-labelled LifeLink records across hospitals.

Run from the backend folder:
    python3 distribute_demo_data.py

Safety:
- Does NOT delete, recreate, or rename records.
- Only updates hospital_id on records labelled as demo through their linked
  DEMO | donor/recipient records or existing demo IDs.
- Makes a JSON backup of affected rows before changes.
- Uses a transaction and rolls back on errors.
- Users and hospital rows are never modified.

IMPORTANT:
Review the dry-run first. By default, this script only reports the planned
changes. To apply them, run:
    python3 distribute_demo_data.py --apply
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

from app import get_db_connection


def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "total_seconds"):
        return str(value)
    return str(value)


def fetch_rows(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def main():
    apply_changes = "--apply" in sys.argv
    conn = get_db_connection()
    cur = None

    try:
        cur = conn.cursor(dictionary=True)

        hospitals = fetch_rows(
            cur,
            "SELECT hospital_id, hospital_name, branch_name FROM hospitals ORDER BY hospital_id"
        )
        if len(hospitals) < 2:
            raise RuntimeError("At least two hospitals are required.")

        hospital_ids = [int(h["hospital_id"]) for h in hospitals]
        print(f"Found {len(hospitals)} hospitals.")
        for h in hospitals:
            print(f'  {h["hospital_id"]}: {h["hospital_name"]} — {h["branch_name"]}')

        # Identify synthetic demo donors/recipients. Never include real people.
        donors = fetch_rows(
            cur,
            "SELECT donor_id, hospital_id FROM donors WHERE full_name LIKE %s ORDER BY donor_id",
            ("DEMO | %",),
        )
        recipients = fetch_rows(
            cur,
            "SELECT recipient_id, hospital_id FROM recipients WHERE full_name LIKE %s ORDER BY recipient_id",
            ("DEMO | %",),
        )
        donor_ids = [int(r["donor_id"]) for r in donors]
        recipient_ids = [int(r["recipient_id"]) for r in recipients]

        if not donor_ids and not recipient_ids:
            raise RuntimeError(
                "No DEMO | donors or recipients were found. Nothing changed. "
                "If your records use another label, inspect them before proceeding."
            )

        # Read only linked inventory/requests/matches/allocations associated with
        # demo donors/recipients, to keep unrelated records out of scope.
        blood_units = []
        organs = []
        requests = []
        matches = []
        allocations = []

        if donor_ids:
            placeholders = ",".join(["%s"] * len(donor_ids))
            blood_units = fetch_rows(
                cur,
                f"SELECT blood_unit_id, donor_id, hospital_id FROM blood_units "
                f"WHERE donor_id IN ({placeholders}) ORDER BY blood_unit_id",
                tuple(donor_ids),
            )
            organs = fetch_rows(
                cur,
                f"SELECT organ_id, donor_id, hospital_id FROM organs "
                f"WHERE donor_id IN ({placeholders}) ORDER BY organ_id",
                tuple(donor_ids),
            )

        if recipient_ids:
            placeholders = ",".join(["%s"] * len(recipient_ids))
            requests = fetch_rows(
                cur,
                f"SELECT request_id, recipient_id, hospital_id FROM requests "
                f"WHERE recipient_id IN ({placeholders}) ORDER BY request_id",
                tuple(recipient_ids),
            )

        request_ids = [int(r["request_id"]) for r in requests]
        if request_ids:
            placeholders = ",".join(["%s"] * len(request_ids))
            matches = fetch_rows(
                cur,
                f"SELECT match_id, request_id, recipient_id, blood_unit_id, organ_id "
                f"FROM matches WHERE request_id IN ({placeholders}) ORDER BY match_id",
                tuple(request_ids),
            )
            match_ids = [int(r["match_id"]) for r in matches]
            if match_ids:
                placeholders = ",".join(["%s"] * len(match_ids))
                allocations = fetch_rows(
                    cur,
                    f"SELECT allocation_id, match_id, request_id, blood_unit_id, organ_id, hospital_id "
                    f"FROM allocations WHERE match_id IN ({placeholders}) ORDER BY allocation_id",
                    tuple(match_ids),
                )

        # Build assignments round-robin, keeping linked records together.
        # A donor's blood units/organs stay at the donor's assigned hospital.
        donor_home = {
            int(row["donor_id"]): hospital_ids[i % len(hospital_ids)]
            for i, row in enumerate(donors)
        }
        recipient_home = {
            int(row["recipient_id"]): hospital_ids[i % len(hospital_ids)]
            for i, row in enumerate(recipients)
        }

        # Snapshot the exact affected rows before applying.
        backup = {
            "created_at": datetime.now().isoformat(),
            "note": "Rows selected for LifeLink demo hospital distribution; no changes applied unless --apply was supplied.",
            "hospitals": hospitals,
            "donors": donors,
            "recipients": recipients,
            "blood_units": blood_units,
            "organs": organs,
            "requests": requests,
            "matches": matches,
            "allocations": allocations,
        }
        backup_dir = Path(__file__).resolve().parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / f"lifelink_distribution_{datetime.now():%Y%m%d_%H%M%S}.json"
        backup_path.write_text(
            json.dumps(backup, indent=2, default=json_default),
            encoding="utf-8",
        )
        print(f"\nBackup of selected rows saved to: {backup_path}")

        print("\nPlanned distribution:")
        print(f"  DEMO donors:       {len(donors)}")
        print(f"  DEMO recipients:   {len(recipients)}")
        print(f"  Linked blood units:{len(blood_units):>6}")
        print(f"  Linked organs:     {len(organs)}")
        print(f"  Linked requests:   {len(requests)}")
        print(f"  Linked matches:    {len(matches)}")
        print(f"  Linked allocations:{len(allocations):>5}")

        if not apply_changes:
            print("\nDRY RUN ONLY: no database records were changed.")
            print("Inspect the counts above. To apply, run:")
            print("  python3 distribute_demo_data.py --apply")
            return

        # Existing connector transaction will be committed below.
        # Update demo donor and recipient rows.
        for donor_id, hospital_id in donor_home.items():
            cur.execute(
                "UPDATE donors SET hospital_id = %s WHERE donor_id = %s",
                (hospital_id, donor_id),
            )
        for recipient_id, hospital_id in recipient_home.items():
            cur.execute(
                "UPDATE recipients SET hospital_id = %s WHERE recipient_id = %s",
                (hospital_id, recipient_id),
            )

        # Keep inventory attached to its donor's assigned hospital.
        for row in blood_units:
            new_hospital_id = donor_home.get(int(row["donor_id"]))
            if new_hospital_id is not None:
                cur.execute(
                    "UPDATE blood_units SET hospital_id = %s WHERE blood_unit_id = %s",
                    (new_hospital_id, row["blood_unit_id"]),
                )
        for row in organs:
            new_hospital_id = donor_home.get(int(row["donor_id"]))
            if new_hospital_id is not None:
                cur.execute(
                    "UPDATE organs SET hospital_id = %s WHERE organ_id = %s",
                    (new_hospital_id, row["organ_id"]),
                )

        # Requests follow their recipient's hospital.
        for row in requests:
            new_hospital_id = recipient_home.get(int(row["recipient_id"]))
            if new_hospital_id is not None:
                cur.execute(
                    "UPDATE requests SET hospital_id = %s WHERE request_id = %s",
                    (new_hospital_id, row["request_id"]),
                )

        # Keep each match linked to the hospital of its request's recipient.
        request_home = {
            int(row["request_id"]): recipient_home[int(row["recipient_id"])]
            for row in requests
        }
        for row in matches:
            new_hospital_id = request_home.get(int(row["request_id"]))
            if new_hospital_id is None:
                continue
            # matches may or may not have hospital_id; this script deliberately
            # does not update matches because the schema may not include it.
            # Match links remain intact through request_id/recipient_id.
            pass

        # Allocations follow the associated request's new hospital.
        for row in allocations:
            new_hospital_id = request_home.get(int(row["request_id"]))
            if new_hospital_id is not None:
                cur.execute(
                    "UPDATE allocations SET hospital_id = %s WHERE allocation_id = %s",
                    (new_hospital_id, row["allocation_id"]),
                )

        conn.commit()
        print("\nDistribution applied successfully.")
        print("Only DEMO-labelled donor/recipient records and their linked records were updated.")
        print("No rows were deleted or recreated.")

    except Exception:
        if conn.in_transaction:
            conn.rollback()
        raise
    finally:
        if cur is not None:
            cur.close()
        conn.close()


if __name__ == "__main__":
    main()
