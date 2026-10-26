"""
Safely add LifeLink   hospitals without resetting any existing data.

Run from the backend folder:
    python3 add_ _hospitals.py

This script only inserts missing   hospital rows. It does NOT delete or
modify donors, recipients, blood units, organs, requests, matches, allocations,
users, or existing hospitals.
"""
from app import get_db_connection

DEMO_HOSPITALS = [
    {
        "hospital_name": "LifeLink Medical Centre",
        "branch_name": "Central Branch",
        "city": "Bengaluru",
        "state": "Karnataka",
        "contact_number": "9000010001",
        "email": "centrallink@lifelink.example",
    },
    {
        "hospital_name": "LifeLink Medical Centre",
        "branch_name": "North Branch",
        "city": "Bengaluru",
        "state": "Karnataka",
        "contact_number": "9000010002",
        "email": "northlink@lifelink.example",
    },
    {
        "hospital_name": "CareBridge Hospital",
        "branch_name": "City Branch",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "contact_number": "9000010003",
        "email": "city@carebridge.example",
    },
    {
        "hospital_name": "CareBridge Hospital",
        "branch_name": "Coastal Branch",
        "city": "Kochi",
        "state": "Kerala",
        "contact_number": "9000010004",
        "email": "coastal@carebridge.example",
    },
    {
        "hospital_name": "Unity Hospital",
        "branch_name": "Main Branch",
        "city": "Hyderabad",
        "state": "Telangana",
        "contact_number": "9000010005",
        "email": "main@unity.example",
    },
    {
        "hospital_name": "Unity Hospital",
        "branch_name": "West Branch",
        "city": "Pune",
        "state": "Maharashtra",
        "contact_number": "9000010006",
        "email": "west@unity.example",
    },
    {
        "hospital_name": "Hope Medical Institute",
        "branch_name": "Teaching Branch",
        "city": "New Delhi",
        "state": "Delhi",
        "contact_number": "9000010007",
        "email": "teaching@hope.example",
    },
    {
        "hospital_name": "Hope Medical Institute",
        "branch_name": "East Branch",
        "city": "Kolkata",
        "state": "West Bengal",
        "contact_number": "9000010008",
        "email": "east@hope.example",
    },
    {
        "hospital_name": "Riverstone Hospital",
        "branch_name": "Regional Branch",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "contact_number": "9000010009",
        "email": "regional@riverstone.example",
    },
    {
        "hospital_name": "Riverstone Hospital",
        "branch_name": "South Branch",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "contact_number": "9000010010",
        "email": "south@riverstone.example",
    },
]


def main():
    conn = get_db_connection()
    cur = None
    inserted = 0
    skipped = 0

    try:
        # Avoid explicitly starting a transaction: Connector/Python may already
        # have one active. Commit once after all inserts.
        cur = conn.cursor(dictionary=True)

        for hospital in DEMO_HOSPITALS:
            cur.execute(
                """
                SELECT hospital_id
                FROM hospitals
                WHERE email = %s
                   OR (hospital_name = %s AND branch_name = %s)
                LIMIT 1
                """,
                (
                    hospital["email"],
                    hospital["hospital_name"],
                    hospital["branch_name"],
                ),
            )

            if cur.fetchone():
                print(
                    "Already exists; skipped: "
                    f'{hospital["hospital_name"]} — {hospital["branch_name"]}'
                )
                skipped += 1
                continue

            cur.execute(
                """
                INSERT INTO hospitals
                    (hospital_name, branch_name, city, state, contact_number, email)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    hospital["hospital_name"],
                    hospital["branch_name"],
                    hospital["city"],
                    hospital["state"],
                    hospital["contact_number"],
                    hospital["email"],
                ),
            )
            print(
                f'Added hospital_id={cur.lastrowid}: '
                f'{hospital["hospital_name"]} — {hospital["branch_name"]}'
            )
            inserted += 1

        conn.commit()
        print("\nFinished successfully.")
        print(f"New hospitals inserted: {inserted}")
        print(f"Already present and skipped: {skipped}")
        print("No existing records were deleted or updated.")

    except Exception:
        conn.rollback()
        raise
    finally:
        if cur is not None:
            cur.close()
        conn.close()


if __name__ == "__main__":
    main()
