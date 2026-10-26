"""
Remove LifeLink demo records created by seed_demo_data.py.

Run from the backend folder:
    python3 cleanup_demo_data.py

Only records whose people names start with 'DEMO |' are targeted. The script
removes dependent allocations/matches/requests/inventory before deleting people.
It leaves user accounts and hospitals untouched.
"""
from app import get_db_connection

def main():
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT donor_id FROM donors WHERE full_name LIKE 'DEMO |%'")
        donor_ids = [r["donor_id"] for r in cur.fetchall()]
        cur.execute("SELECT recipient_id FROM recipients WHERE full_name LIKE 'DEMO |%'")
        recipient_ids = [r["recipient_id"] for r in cur.fetchall()]

        # Identify demo requests by their synthetic recipients.
        request_ids = []
        if recipient_ids:
            marks = ",".join(["%s"] * len(recipient_ids))
            cur.execute(f"SELECT request_id FROM requests WHERE recipient_id IN ({marks})", tuple(recipient_ids))
            request_ids = [r["request_id"] for r in cur.fetchall()]

        blood_ids = []
        organ_ids = []
        if donor_ids:
            marks = ",".join(["%s"] * len(donor_ids))
            cur.execute(f"SELECT blood_unit_id FROM blood_units WHERE donor_id IN ({marks})", tuple(donor_ids))
            blood_ids = [r["blood_unit_id"] for r in cur.fetchall()]
            cur.execute(f"SELECT organ_id FROM organs WHERE donor_id IN ({marks})", tuple(donor_ids))
            organ_ids = [r["organ_id"] for r in cur.fetchall()]

        conn.start_transaction()

        # Remove only allocations tied to demo requests or demo inventory.
        conditions, params = [], []
        if request_ids:
            conditions.append("request_id IN (" + ",".join(["%s"] * len(request_ids)) + ")")
            params.extend(request_ids)
        if blood_ids:
            conditions.append("blood_unit_id IN (" + ",".join(["%s"] * len(blood_ids)) + ")")
            params.extend(blood_ids)
        if organ_ids:
            conditions.append("organ_id IN (" + ",".join(["%s"] * len(organ_ids)) + ")")
            params.extend(organ_ids)
        if conditions:
            cur.execute("DELETE FROM allocations WHERE " + " OR ".join(conditions), tuple(params))

        # Remove matches belonging to demo requests or demo inventory.
        conditions, params = [], []
        if request_ids:
            conditions.append("request_id IN (" + ",".join(["%s"] * len(request_ids)) + ")")
            params.extend(request_ids)
        if blood_ids:
            conditions.append("blood_unit_id IN (" + ",".join(["%s"] * len(blood_ids)) + ")")
            params.extend(blood_ids)
        if organ_ids:
            conditions.append("organ_id IN (" + ",".join(["%s"] * len(organ_ids)) + ")")
            params.extend(organ_ids)
        if conditions:
            cur.execute("DELETE FROM matches WHERE " + " OR ".join(conditions), tuple(params))

        if request_ids:
            cur.execute("DELETE FROM requests WHERE request_id IN (" + ",".join(["%s"] * len(request_ids)) + ")", tuple(request_ids))
        if blood_ids:
            cur.execute("DELETE FROM blood_units WHERE blood_unit_id IN (" + ",".join(["%s"] * len(blood_ids)) + ")", tuple(blood_ids))
        if organ_ids:
            cur.execute("DELETE FROM organs WHERE organ_id IN (" + ",".join(["%s"] * len(organ_ids)) + ")", tuple(organ_ids))
        if donor_ids:
            cur.execute("DELETE FROM donors WHERE donor_id IN (" + ",".join(["%s"] * len(donor_ids)) + ")", tuple(donor_ids))
        if recipient_ids:
            cur.execute("DELETE FROM recipients WHERE recipient_id IN (" + ",".join(["%s"] * len(recipient_ids)) + ")", tuple(recipient_ids))

        conn.commit()
        print("Demo records removed. User accounts and hospitals were preserved.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
