from flask import Flask, jsonify, request, session
import click
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import mysql.connector
import os

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get(
    "FLASK_SECRET_KEY",
    "dev-only-change-this-secret-before-deployment"
)

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (
    os.environ.get("FLASK_HTTPS", "0") == "1"
)

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174"
    ]
)

@app.before_request
def require_api_login():
        # Allow CORS preflight requests through without authentication.
    if request.method == "OPTIONS":
        return "", 204
    # Public endpoints needed to register and authenticate.
    public_endpoints = {
        ("/", "GET"),
        ("/api/test-db", "GET"),
        ("/api/auth/register", "POST"),
        ("/api/auth/login", "POST"),
        ("/api/auth/me", "GET"),
        ("/api/auth/logout", "POST"),
        ("/api/hospitals", "GET"),
    }

    # Leave non-API routes unaffected.
    if not request.path.startswith("/api/"):
        return None

    # Allow only the explicitly public API operations above.
    if (request.path, request.method) in public_endpoints:
        return None

    # All other API operations require a valid login session.
    if not session.get("user_id") or not session.get("hospital_id"):
        return jsonify({
            "success": False,
            "error": "Authentication required. Please log in."
        }), 401

    return None



# ============================================================
# DATABASE CONNECTION
# ============================================================

def get_db_connection():
     return mysql.connector.connect(
    host=os.environ.get("DB_HOST", "localhost"),
    user=os.environ.get("DB_USER", "root"),
    password=os.environ["DB_PASSWORD"],
    database=os.environ.get("DB_NAME", "blood_organ_system")
)
@app.cli.command("promote-admin")
@click.argument("email")
def promote_admin(email):
    """Promote an existing account to System Admin without changing its password."""
    connection = None
    cursor = None
    normalized_email = email.strip().lower()

    if not normalized_email:
        raise click.ClickException("Email address is required.")

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT user_id, full_name, email, is_active FROM users WHERE email = %s",
            (normalized_email,)
        )
        user = cursor.fetchone()

        if not user:
            raise click.ClickException(
                "No account was found for that email. No changes were made."
            )

        if not user["is_active"]:
            raise click.ClickException(
                "That account is inactive. Activate it deliberately before promoting it."
            )

        cursor.execute(
            "UPDATE users SET role = %s WHERE user_id = %s",
            ("System Admin", user["user_id"])
        )
        connection.commit()
        click.echo(
            f"Promoted {user['full_name']} ({user['email']}) to System Admin. "
            "The existing password was not changed."
        )

    except click.ClickException:
        if connection and connection.is_connected():
            connection.rollback()
        raise
    except mysql.connector.Error as exc:
        if connection and connection.is_connected():
            connection.rollback()
        app.logger.exception("Failed to promote account to System Admin")
        raise click.ClickException("Database error; no changes were committed.") from exc
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


def require_system_admin():
    if not session.get("user_id"):
        return jsonify({
            "success": False,
            "error": "Authentication required."
        }), 401

    if session.get("role") != "System Admin":
        return jsonify({
            "success": False,
            "error": "Administrator privileges required."
        }), 403

    return None

# ============================================================
# AUTHENTICATION
# ============================================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    hospital_id = data.get("hospital_id")

    if (
    not full_name
    or not email
    or not isinstance(password, str)
    or not password
    or hospital_id is None
    ):
        return jsonify({
            "success": False,
            "error": "Name, email, password, and hospital are required."
        }), 400

    if not isinstance(password, str) or len(password) < 8:
        return jsonify({
            "success": False,
            "error": "Password must contain at least 8 characters."
        }), 400

    try:
        hospital_id = int(hospital_id)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": "Invalid hospital selection."
        }), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT hospital_id FROM hospitals WHERE hospital_id = %s",
            (hospital_id,)
        )
        hospital = cursor.fetchone()

        if not hospital:
            return jsonify({
                "success": False,
                "error": "Selected hospital does not exist."
            }), 404

        cursor.execute(
            "SELECT user_id FROM users WHERE email = %s",
            (email,)
        )

        if cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "An account with this email already exists."
            }), 409

        password_hash = generate_password_hash(password)

        cursor.execute(
            """
            INSERT INTO users
                (hospital_id, full_name, email, password_hash, role)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                hospital_id,
                full_name,
                email,
                password_hash,
                "Hospital Staff"
            )
        )

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Account created successfully. You can now log in."
        }), 201

    except mysql.connector.Error as e:
        if connection and connection.is_connected():
            connection.rollback()

        app.logger.error("Registration database error: %s", e)

        return jsonify({
            "success": False,
            "error": "Could not create account."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    if not email or not isinstance(password, str) or not password:
        return jsonify({
            "success": False,
            "error": "Email and password are required."
        }), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                u.user_id,
                u.hospital_id,
                u.full_name,
                u.email,
                u.password_hash,
                u.role,
                h.hospital_name,
                h.branch_name,
                h.city,
                h.state,
                h.address
            FROM users u
            JOIN hospitals h ON h.hospital_id = u.hospital_id
            WHERE u.email = %s AND u.is_active = TRUE
            """,
            (email,)
        )

        user = cursor.fetchone()

        if not user or not check_password_hash(
            user["password_hash"], password
        ):
            return jsonify({
                "success": False,
                "error": "Invalid email or password."
            }), 401

        session.clear()
        session["user_id"] = user["user_id"]
        session["hospital_id"] = user["hospital_id"]
        session["role"] = user["role"]

        user.pop("password_hash", None)

        return jsonify({
            "success": True,
            "message": "Login successful.",
            "user": user
        }), 200

    except mysql.connector.Error as e:
        app.logger.error("Login database error: %s", e)

        return jsonify({
            "success": False,
            "error": "Could not log in."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/auth/me", methods=["GET"])
def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "success": False,
            "error": "Not logged in."
        }), 401

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                u.user_id,
                u.hospital_id,
                u.full_name,
                u.email,
                u.role,
                h.hospital_name,
                h.branch_name,
                h.city,
                h.state,
                h.address
            FROM users u
            JOIN hospitals h ON h.hospital_id = u.hospital_id
            WHERE u.user_id = %s AND u.is_active = TRUE
            """,
            (user_id,)
        )

        user = cursor.fetchone()

        if not user:
            session.clear()
            return jsonify({
                "success": False,
                "error": "Account not found or inactive."
            }), 401

        return jsonify({
            "success": True,
            "user": user
        }), 200

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()

    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    }), 200

# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():
    return jsonify({
        "message": "Blood & Organ Donor Management API is running!"
    })


# ============================================================
# TEST DATABASE
# ============================================================

@app.route("/api/test-db")
def test_database():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT DATABASE();")
        database = cursor.fetchone()[0]

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "database": database
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# DONORS - POST
# ============================================================


@app.route("/api/donors", methods=["POST"])
def add_donor():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "full_name",
            "date_of_birth",
            "gender",
            "blood_group",
            "rh_factor",
            "phone",
            "email",
            "medical_notes",
            "eligibility_status"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data or data[field] is None
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "Required donor fields are missing.",
                "missing_fields": missing_fields
            }), 400

        connection = get_db_connection()
        cursor = connection.cursor()

        sql = """
            INSERT INTO donors (
                hospital_id,
                full_name,
                date_of_birth,
                gender,
                blood_group,
                rh_factor,
                phone,
                email,
                medical_notes,
                eligibility_status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        values = (
            session["hospital_id"],
            data["full_name"],
            data["date_of_birth"],
            data["gender"],
            data["blood_group"],
            data["rh_factor"],
            data["phone"],
            data["email"],
            data["medical_notes"],
            data["eligibility_status"]
        )

        cursor.execute(sql, values)
        connection.commit()

        donor_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Donor registered successfully",
            "donor_id": donor_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to register donor")
        return jsonify({
            "success": False,
            "error": "Failed to register donor."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()



@app.route("/api/donors/<int:donor_id>", methods=["DELETE"])
def delete_donor(donor_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT donor_id FROM donors WHERE donor_id = %s",
            (donor_id,)
        )
        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Donor not found."
            }), 404

        # Preserve inventory and matching records linked to this donor.
        for table, column in [
            ("blood_units", "donor_id"),
            ("organs", "donor_id"),
        ]:
            cursor.execute(
                f"SELECT 1 FROM {table} WHERE {column} = %s LIMIT 1",
                (donor_id,)
            )
            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "error": (
                        "This donor has linked inventory records. "
                        "Remove or archive those records first."
                    )
                }), 409

        cursor.execute(
            "DELETE FROM donors WHERE donor_id = %s",
            (donor_id,)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Donor deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Failed to delete donor")
        return jsonify({
            "success": False,
            "error": "Failed to delete donor."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# ============================================================
# DONORS - GET
# ============================================================

@app.route("/api/donors", methods=["GET"])
def get_donors():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                donor_id,
                hospital_id,
                full_name,
                date_of_birth,
                gender,
                blood_group,
                rh_factor,
                phone,
                email,
                medical_notes,
                eligibility_status,
                created_at
            FROM donors
            WHERE hospital_id = %s
            ORDER BY donor_id DESC
        """, (session["hospital_id"],))

        donors = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "donors": donors
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# RECIPIENTS - GET
# ============================================================

@app.route("/api/recipients", methods=["GET"])
def get_recipients():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                recipient_id,
                hospital_id,
                full_name,
                date_of_birth,
                gender,
                blood_group,
                rh_factor,
                hla_profile,
                clinical_urgency,
                medical_notes,
                eligibility_status,
                created_at
            FROM recipients
            WHERE hospital_id = %s
            ORDER BY recipient_id DESC
        """, (session["hospital_id"],))

        recipients = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "recipients": recipients
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================
# RECIPIENTS - POST
# ============================================================


@app.route("/api/recipients", methods=["POST"])
def add_recipient():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "full_name",
            "date_of_birth",
            "gender",
            "blood_group",
            "rh_factor",
            "hla_profile",
            "clinical_urgency",
            "medical_notes",
            "eligibility_status"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data or data[field] is None
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "Required recipient fields are missing.",
                "missing_fields": missing_fields
            }), 400

        connection = get_db_connection()
        cursor = connection.cursor()

        sql = """
            INSERT INTO recipients (
                hospital_id,
                full_name,
                date_of_birth,
                gender,
                blood_group,
                rh_factor,
                hla_profile,
                clinical_urgency,
                medical_notes,
                eligibility_status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        values = (
            session["hospital_id"],
            data["full_name"],
            data["date_of_birth"],
            data["gender"],
            data["blood_group"],
            data["rh_factor"],
            data["hla_profile"],
            data["clinical_urgency"],
            data["medical_notes"],
            data["eligibility_status"]
        )

        cursor.execute(sql, values)
        connection.commit()

        recipient_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Recipient registered successfully",
            "recipient_id": recipient_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to register recipient")
        return jsonify({
            "success": False,
            "error": "Failed to register recipient."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/recipients/<int:recipient_id>", methods=["DELETE"])
def delete_recipient(recipient_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT recipient_id FROM recipients WHERE recipient_id = %s",
            (recipient_id,)
        )
        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Recipient not found."
            }), 404

        cursor.execute(
            "SELECT 1 FROM requests WHERE recipient_id = %s LIMIT 1",
            (recipient_id,)
        )
        if cursor.fetchone():
            return jsonify({
                "success": False,
                "error": (
                    "This recipient has linked requests. "
                    "Archive the recipient instead of deleting it."
                )
            }), 409

        cursor.execute(
            "DELETE FROM recipients WHERE recipient_id = %s",
            (recipient_id,)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Recipient deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Failed to delete recipient")
        return jsonify({
            "success": False,
            "error": "Failed to delete recipient."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

# ============================================================
# BLOOD INVENTORY
# ============================================================

@app.route("/api/blood-units", methods=["GET"])
def get_blood_units():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                blood_unit_id,
                donor_id,
                hospital_id,
                blood_group,
                rh_factor,
                collection_date,
                expiry_date,
                status,
                created_at
            FROM blood_units
            ORDER BY blood_unit_id DESC
        """)

        blood_units = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "blood_units": blood_units
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route("/api/blood-units", methods=["POST"])
def add_blood_unit():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "donor_id",
            "blood_group",
            "rh_factor",
            "collection_date",
            "expiry_date"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data or data[field] is None
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "Required blood-unit fields are missing.",
                "missing_fields": missing_fields
            }), 400

        try:
            donor_id = int(data["donor_id"])
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Invalid donor ID."
            }), 400

        hospital_id = session["hospital_id"]

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Verify that the donor belongs to this hospital.
        cursor.execute("""
            SELECT donor_id
            FROM donors
            WHERE donor_id = %s
              AND hospital_id = %s
        """, (donor_id, hospital_id))

        donor = cursor.fetchone()

        if not donor:
            return jsonify({
                "success": False,
                "error": "Donor not found in your hospital."
            }), 403

        # New blood units always start as Available.
        cursor.execute("""
            INSERT INTO blood_units (
                donor_id,
                hospital_id,
                blood_group,
                rh_factor,
                collection_date,
                expiry_date,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'Available')
        """, (
            donor_id,
            hospital_id,
            data["blood_group"],
            data["rh_factor"],
            data["collection_date"],
            data["expiry_date"]
        ))

        connection.commit()
        blood_unit_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Blood unit added successfully",
            "blood_unit_id": blood_unit_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to add blood unit")
        return jsonify({
            "success": False,
            "error": "Failed to add blood unit."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/blood-units/<int:blood_unit_id>", methods=["DELETE"])
def delete_blood_unit(blood_unit_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT blood_unit_id
            FROM blood_units
            WHERE blood_unit_id = %s
        """, (blood_unit_id,))

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Blood unit not found."
            }), 404

        # Preserve matching and allocation history.
        for table in ("matches", "allocations"):
            cursor.execute(
                f"SELECT 1 FROM {table} "
                "WHERE blood_unit_id = %s LIMIT 1",
                (blood_unit_id,)
            )
            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "error": (
                        "This blood unit has linked matching or allocation "
                        "records. Archive it instead of deleting it."
                    )
                }), 409

        cursor.execute("""
            DELETE FROM blood_units
            WHERE blood_unit_id = %s
        """, (blood_unit_id,))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Blood unit deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Failed to delete blood unit")
        return jsonify({
            "success": False,
            "error": "Failed to delete blood unit."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

# ============================================================
# ORGAN INVENTORY
# ============================================================

@app.route("/api/organs", methods=["GET"])
def get_organs():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                organ_id,
                donor_id,
                hospital_id,
                organ_type,
                blood_group,
                rh_factor,
                hla_profile,
                donor_age,
                collection_datetime,
                viability_until,
                status,
                created_at
            FROM organs
            ORDER BY organ_id DESC
        """)

        organs = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "organs": organs
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route("/api/organs", methods=["POST"])
def add_organ():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "donor_id",
            "organ_type",
            "blood_group",
            "rh_factor",
            "hla_profile",
            "donor_age",
            "collection_datetime",
            "viability_until"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data or data[field] is None
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "Required organ fields are missing.",
                "missing_fields": missing_fields
            }), 400

        try:
            donor_id = int(data["donor_id"])
            donor_age = int(data["donor_age"])
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Donor ID and donor age must be valid integers."
            }), 400

        if donor_age < 0 or donor_age > 120:
            return jsonify({
                "success": False,
                "error": "Donor age must be between 0 and 120."
            }), 400

        hospital_id = session["hospital_id"]

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Verify that the donor belongs to this hospital.
        cursor.execute("""
            SELECT donor_id
            FROM donors
            WHERE donor_id = %s
              AND hospital_id = %s
        """, (donor_id, hospital_id))

        donor = cursor.fetchone()

        if not donor:
            return jsonify({
                "success": False,
                "error": "Donor not found in your hospital."
            }), 403

        # New organs always start as Available.
        cursor.execute("""
            INSERT INTO organs (
                donor_id,
                hospital_id,
                organ_type,
                blood_group,
                rh_factor,
                hla_profile,
                donor_age,
                collection_datetime,
                viability_until,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'Available')
        """, (
            donor_id,
            hospital_id,
            data["organ_type"],
            data["blood_group"],
            data["rh_factor"],
            data["hla_profile"],
            donor_age,
            data["collection_datetime"],
            data["viability_until"]
        ))

        connection.commit()
        organ_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Organ registered successfully",
            "organ_id": organ_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to register organ")
        return jsonify({
            "success": False,
            "error": "Failed to register organ."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/organs/<int:organ_id>", methods=["DELETE"])
def delete_organ(organ_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT organ_id
            FROM organs
            WHERE organ_id = %s
        """, (organ_id,))

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Organ not found."
            }), 404

        # Preserve matching and allocation history.
        for table in ("matches", "allocations"):
            cursor.execute(
                f"SELECT 1 FROM {table} "
                "WHERE organ_id = %s LIMIT 1",
                (organ_id,)
            )
            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "error": (
                        "This organ has linked matching or allocation "
                        "records. Archive it instead of deleting it."
                    )
                }), 409

        cursor.execute("""
            DELETE FROM organs
            WHERE organ_id = %s
        """, (organ_id,))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Organ deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Failed to delete organ")
        return jsonify({
            "success": False,
            "error": "Failed to delete organ."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

@app.route("/api/requests", methods=["GET"])
def get_requests():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                request_id,
                hospital_id,
                recipient_id,
                request_type,
                requested_blood_group,
                requested_rh_factor,
                requested_organ_type,
                quantity,
                urgency,
                status,
                request_date
            FROM requests
            WHERE hospital_id = %s
            ORDER BY request_id DESC
        """, (session["hospital_id"],))

        requests_data = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "requests": requests_data
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route("/api/requests", methods=["POST"])
def add_request():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "recipient_id",
            "request_type"
        ]

        missing_fields = [
            field for field in required_fields
            if field not in data or data[field] is None
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "Required request fields are missing.",
                "missing_fields": missing_fields
            }), 400

        try:
            recipient_id = int(data["recipient_id"])
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Invalid recipient ID."
            }), 400

        request_type = data["request_type"]

        if request_type not in ("Blood", "Organ"):
            return jsonify({
                "success": False,
                "error": "Request type must be Blood or Organ."
            }), 400

        try:
            quantity = int(data.get("quantity", 1))
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Quantity must be a valid integer."
            }), 400

        if quantity < 1:
            return jsonify({
                "success": False,
                "error": "Quantity must be at least 1."
            }), 400

        hospital_id = session["hospital_id"]

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Verify that the recipient belongs to this hospital.
        cursor.execute("""
            SELECT recipient_id
            FROM recipients
            WHERE recipient_id = %s
              AND hospital_id = %s
        """, (recipient_id, hospital_id))

        recipient = cursor.fetchone()

        if not recipient:
            return jsonify({
                "success": False,
                "error": "Recipient not found in your hospital."
            }), 403

        # New requests always start as Pending.
        cursor.execute("""
            INSERT INTO requests (
                hospital_id,
                recipient_id,
                request_type,
                requested_blood_group,
                requested_rh_factor,
                requested_organ_type,
                quantity,
                urgency,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Pending')
        """, (
            hospital_id,
            recipient_id,
            request_type,
            data.get("requested_blood_group"),
            data.get("requested_rh_factor"),
            data.get("requested_organ_type"),
            quantity,
            data.get("urgency", "Medium")
        ))

        connection.commit()
        request_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Request created successfully",
            "request_id": request_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to create request")
        return jsonify({
            "success": False,
            "error": "Failed to create request."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/requests/<int:request_id>", methods=["DELETE"])
def delete_request(request_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT request_id
            FROM requests
            WHERE request_id = %s
        """, (request_id,))

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Request not found."
            }), 404

        # Preserve matching and allocation history.
        for table in ("matches", "allocations"):
            cursor.execute(
                f"SELECT 1 FROM {table} "
                "WHERE request_id = %s LIMIT 1",
                (request_id,)
            )
            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "error": (
                        "This request has linked matching or allocation "
                        "records. Cancel or archive it instead."
                    )
                }), 409

        cursor.execute("""
            DELETE FROM requests
            WHERE request_id = %s
        """, (request_id,))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Request deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to delete request")

        return jsonify({
            "success": False,
            "error": "Failed to delete request."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/matching/<int:request_id>", methods=["GET"])
def find_matches(request_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # =========================================================
        # 1. GET THE REQUEST
        # =========================================================

        cursor.execute("""
            SELECT
                request_id,
                hospital_id,
                recipient_id,
                request_type,
                requested_blood_group,
                requested_rh_factor,
                requested_organ_type,
                quantity,
                urgency,
                status
            FROM requests
            WHERE request_id = %s
              AND hospital_id = %s
        """, (request_id, session["hospital_id"]))

        request_data = cursor.fetchone()

        if not request_data:
            return jsonify({
                "success": False,
                "error": "Request not found"
            }), 404

        matches = []

        # =========================================================
        # 2. URGENCY SCORE
        # =========================================================

        urgency_scores = {
            "High": 100.00,
            "Medium": 60.00,
            "Low": 30.00
        }

        urgency_score = urgency_scores.get(
            request_data["urgency"],
            30.00
        )

        # =========================================================
        # 3. BLOOD MATCHING
        # =========================================================

        if request_data["request_type"] == "Blood":

            requested_group = request_data["requested_blood_group"]
            requested_rh = request_data["requested_rh_factor"]

            cursor.execute("""
                SELECT
                    blood_unit_id,
                    donor_id,
                    hospital_id,
                    blood_group,
                    rh_factor,
                    collection_date,
                    expiry_date,
                    status
                FROM blood_units
                WHERE status = 'Available'
            """)

            blood_units = cursor.fetchall()

            # Recipient blood group → compatible donor groups
            abo_compatibility = {
                "A": ["A", "O"],
                "B": ["B", "O"],
                "AB": ["A", "B", "AB", "O"],
                "O": ["O"]
            }

            compatible_groups = abo_compatibility.get(
                requested_group,
                []
            )

            for unit in blood_units:

                # ABO compatibility
                if unit["blood_group"] not in compatible_groups:
                    continue

                # Rh compatibility
                # Negative recipient can receive only negative blood.
                # Positive recipient can receive positive or negative.
                if requested_rh == "-" and unit["rh_factor"] != "-":
                    continue

                # -------------------------------------------------
                # Check whether this match already exists
                # -------------------------------------------------

                cursor.execute("""
                    SELECT match_id
                    FROM matches
                    WHERE request_id = %s
                      AND blood_unit_id = %s
                """, (
                    request_id,
                    unit["blood_unit_id"]
                ))

                existing_match = cursor.fetchone()
                
                compatibility_score = 100.00
                total_score = (
                                compatibility_score * 0.7
                                + urgency_score * 0.3
                            )

                if existing_match:
                    match_id = existing_match["match_id"]

                else:
                    # -------------------------------------------------
                    # Insert new match
                    # -------------------------------------------------


                    cursor.execute("""
                        INSERT INTO matches
                        (
                            request_id,
                            blood_unit_id,
                            organ_id,
                            recipient_id,
                            compatibility_type,
                            compatibility_score,
                            urgency_score,
                            total_score,
                            rank_position,
                            match_status
                        )
                        VALUES
                        (
                            %s, %s, NULL, %s, %s,
                            %s, %s, %s, %s, %s
                        )
                    """, (
                        request_id,
                        unit["blood_unit_id"],
                        request_data["recipient_id"],
                        "Blood Group + Rh Compatible",
                        compatibility_score,
                        urgency_score,
                        total_score,
                        len(matches) + 1,
                        "Candidate"
                    ))

                    match_id = cursor.lastrowid

                # -------------------------------------------------
                # Add match to response
                # -------------------------------------------------

                matches.append({
                    "total_score": float(total_score),
                    "match_id": match_id,
                    "id": unit["blood_unit_id"],
                    "type": "Blood",
                    "donor_id": unit["donor_id"],
                    "hospital_id": unit["hospital_id"],
                    "blood_group": unit["blood_group"],
                    "rh_factor": unit["rh_factor"],
                    "collection_date": unit["collection_date"],
                    "expiry_date": unit["expiry_date"],
                    "status": unit["status"]
                })
                

        # =========================================================
        # 4. ORGAN MATCHING
        # =========================================================

        elif request_data["request_type"] == "Organ":

            requested_group = request_data["requested_blood_group"]
            requested_rh = request_data["requested_rh_factor"]
            requested_organ = request_data["requested_organ_type"]

            cursor.execute("""
                           SELECT
                           organ_id,
                           donor_id,
                           hospital_id,
                           organ_type,
                           blood_group,
                           rh_factor,
                           hla_profile,
                           donor_age,
                           collection_datetime,
                           viability_until,
                           status
                           FROM organs
                           WHERE status = 'Available'
                           AND organ_type = %s
                           AND viability_until > NOW()
                           """, (requested_organ,))

            organs = cursor.fetchall()

            abo_compatibility = {
                "A": ["A", "O"],
                "B": ["B", "O"],
                "AB": ["A", "B", "AB", "O"],
                "O": ["O"]
            }

            for organ in organs:

                # -------------------------------------------------
                # Blood group compatibility
                # -------------------------------------------------

                if requested_group:

                    allowed_groups = abo_compatibility.get(
                        requested_group,
                        []
                    )

                    if organ["blood_group"] not in allowed_groups:
                        continue

                # -------------------------------------------------
                # Rh compatibility
                # -------------------------------------------------

                if requested_rh:

                    if (
                        requested_rh == "-"
                        and organ["rh_factor"] != "-"
                    ):
                        continue

                # -------------------------------------------------
                # Check existing match
                # -------------------------------------------------

                cursor.execute("""
                    SELECT match_id
                    FROM matches
                    WHERE request_id = %s
                      AND organ_id = %s
                """, (
                    request_id,
                    organ["organ_id"]
                ))

                existing_match = cursor.fetchone()
                
                compatibility_score = 100.00
                total_score = (
                                compatibility_score * 0.7
                                + urgency_score * 0.3
                            )

                if existing_match:
                    match_id = existing_match["match_id"]

                else:


                    cursor.execute("""
                        INSERT INTO matches
                        (
                            request_id,
                            blood_unit_id,
                            organ_id,
                            recipient_id,
                            compatibility_type,
                            compatibility_score,
                            urgency_score,
                            total_score,
                            rank_position,
                            match_status
                        )
                        VALUES
                        (
                            %s, NULL, %s, %s, %s,
                            %s, %s, %s, %s, %s
                        )
                    """, (
                        request_id,
                        organ["organ_id"],
                        request_data["recipient_id"],
                        "Organ Type + Blood Group + Rh Compatible",
                        compatibility_score,
                        urgency_score,
                        total_score,
                        len(matches) + 1,
                        "Candidate"
                    ))

                    match_id = cursor.lastrowid

                # -------------------------------------------------
                # Add match to response
                # -------------------------------------------------

                matches.append({
                    "total_score": float(total_score),
                    "match_id": match_id,
                    "id": organ["organ_id"],
                    "type": "Organ",
                    "donor_id": organ["donor_id"],
                    "hospital_id": organ["hospital_id"],
                    "organ_type": organ["organ_type"],
                    "blood_group": organ["blood_group"],
                    "rh_factor": organ["rh_factor"],
                    "hla_profile": organ["hla_profile"],
                    "donor_age": organ["donor_age"],
                    "collection_datetime": organ["collection_datetime"],
                    "viability_until": organ["viability_until"],
                    "status": organ["status"]
                })

        # =========================================================
        # 5. INVALID REQUEST TYPE
        # =========================================================

        else:

            return jsonify({
                "success": False,
                "error": "Invalid request type"
            }), 400

        # =========================================================
        # 6. RANK MATCHES
        # =========================================================

        matches.sort(
    key=lambda x: (
        -x["total_score"],
        x.get("match_id", 0)
    )
)

        # Update rank positions
        for position, match in enumerate(matches, start=1):

            cursor.execute("""
                UPDATE matches
                SET rank_position = %s
                WHERE match_id = %s
            """, (
                position,
                match["match_id"]
            ))

            match["rank_position"] = position

        # =========================================================
        # 7. COMMIT DATABASE CHANGES
        # =========================================================

        connection.commit()

        # =========================================================
        # 8. RETURN RESPONSE
        # =========================================================

        return jsonify({
            "success": True,
            "request": request_data,
            "match_count": len(matches),
            "matches": matches
        }), 200

    except Exception as e:

        if connection:
            connection.rollback()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()
# ============================================================
# ALLOCATION APIs
# ============================================================


@app.route("/api/allocations", methods=["GET"])
def get_allocations():
    connection = None
    cursor = None

    try:
        hospital_id = session["hospital_id"]

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                allocation_id,
                match_id,
                request_id,
                blood_unit_id,
                organ_id,
                hospital_id,
                allocation_status,
                allocated_at,
                created_at
            FROM allocations
            WHERE hospital_id = %s
            ORDER BY allocation_id DESC
        """, (hospital_id,))

        allocations = cursor.fetchall()

        return jsonify({
            "success": True,
            "allocations": allocations
        })

    except Exception:
        app.logger.exception("Failed to retrieve allocations")
        return jsonify({
            "success": False,
            "error": "Failed to retrieve allocations."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


    
# ============================================================
# ALLOCATION ROUTES
# ============================================================


@app.route("/api/allocations", methods=["POST"])
def create_allocation():
    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        # 1. Validate required IDs.
        try:
            match_id = int(data["match_id"])
            request_id = int(data["request_id"])
        except (KeyError, TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Valid match_id and request_id are required."
            }), 400

        # Never trust the hospital ID submitted by the frontend.
        hospital_id = session["hospital_id"]

        blood_unit_id = data.get("blood_unit_id")
        organ_id = data.get("organ_id")

        try:
            if blood_unit_id is not None:
                blood_unit_id = int(blood_unit_id)
            if organ_id is not None:
                organ_id = int(organ_id)
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Inventory IDs must be valid integers."
            }), 400

        # Exactly one inventory item must be selected.
        if (blood_unit_id is None) == (organ_id is None):
            return jsonify({
                "success": False,
                "error": "Provide exactly one of blood_unit_id or organ_id."
            }), 400

        connection = get_db_connection()
        connection.start_transaction()
        cursor = connection.cursor(dictionary=True)

        # 2. Verify that this request belongs to the user's hospital.
        cursor.execute("""
            SELECT request_id, recipient_id, status
            FROM requests
            WHERE request_id = %s
              AND hospital_id = %s
            FOR UPDATE
        """, (request_id, hospital_id))

        owned_request = cursor.fetchone()

        if not owned_request:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Request not found in your hospital."
            }), 403

        # 3. Lock and validate the selected match.
        cursor.execute("""
            SELECT
                match_id,
                request_id,
                blood_unit_id,
                organ_id,
                recipient_id,
                match_status
            FROM matches
            WHERE match_id = %s
            FOR UPDATE
        """, (match_id,))

        match = cursor.fetchone()

        if not match:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Match not found."
            }), 404

        if match["request_id"] != request_id:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Match does not belong to the specified request."
            }), 400

        if match["recipient_id"] != owned_request["recipient_id"]:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Match recipient does not match the request."
            }), 400

        if match["match_status"] in ("Reserved", "Allocated"):
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "This match has already been reserved or allocated."
            }), 409

        # 4. Verify the selected item is exactly the item in the match,
        # and lock it while checking availability.
        if blood_unit_id is not None:
            if (
                match["blood_unit_id"] != blood_unit_id
                or match["organ_id"] is not None
            ):
                connection.rollback()
                return jsonify({
                    "success": False,
                    "error": "Blood unit does not belong to the selected match."
                }), 400

            cursor.execute("""
                SELECT blood_unit_id, status
                FROM blood_units
                WHERE blood_unit_id = %s
                FOR UPDATE
            """, (blood_unit_id,))

            inventory_item = cursor.fetchone()
            item_table = "blood_units"
            item_id_column = "blood_unit_id"

        else:
            if (
                match["organ_id"] != organ_id
                or match["blood_unit_id"] is not None
            ):
                connection.rollback()
                return jsonify({
                    "success": False,
                    "error": "Organ does not belong to the selected match."
                }), 400

            cursor.execute("""
                SELECT organ_id, status
                FROM organs
                WHERE organ_id = %s
                FOR UPDATE
            """, (organ_id,))

            inventory_item = cursor.fetchone()
            item_table = "organs"
            item_id_column = "organ_id"

        if not inventory_item:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Inventory item not found."
            }), 404

        if inventory_item["status"] != "Available":
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Inventory item is no longer available."
            }), 409

        # 5. Reserve the inventory item.
        # The table and column names here are selected only from fixed
        # server-side values above, never from client input.
        item_id = blood_unit_id if blood_unit_id is not None else organ_id

        cursor.execute(
            f"""
                UPDATE {item_table}
                SET status = 'Reserved'
                WHERE {item_id_column} = %s
                  AND status = 'Available'
            """,
            (item_id,)
        )

        if cursor.rowcount != 1:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Inventory item is no longer available."
            }), 409

        # 6. Create the allocation under the authenticated hospital.
        cursor.execute("""
            INSERT INTO allocations (
                match_id,
                request_id,
                blood_unit_id,
                organ_id,
                hospital_id,
                allocation_status,
                allocated_at
            )
            VALUES (%s, %s, %s, %s, %s, 'Reserved', NOW())
        """, (
            match_id,
            request_id,
            blood_unit_id,
            organ_id,
            hospital_id
        ))

        allocation_id = cursor.lastrowid

        # 7. Update match and request status in the same transaction.
        cursor.execute("""
            UPDATE matches
            SET match_status = 'Reserved'
            WHERE match_id = %s
        """, (match_id,))

        cursor.execute("""
            UPDATE requests
            SET status = 'Reserved'
            WHERE request_id = %s
              AND hospital_id = %s
        """, (request_id, hospital_id))

        if cursor.rowcount != 1:
            connection.rollback()
            return jsonify({
                "success": False,
                "error": "Request status could not be updated."
            }), 409

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Allocation reserved successfully",
            "allocation_id": allocation_id,
            "match_id": match_id,
            "request_id": request_id,
            "blood_unit_id": blood_unit_id,
            "organ_id": organ_id,
            "hospital_id": hospital_id,
            "allocation_status": "Reserved"
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to create allocation")

        return jsonify({
            "success": False,
            "error": "An unexpected error occurred while creating the allocation."
        }), 500

    finally:
        if cursor:
            cursor.close()

        if connection:
            connection.close()

def require_system_admin():
    if not session.get("user_id"):
        return jsonify({
            "success": False,
            "error": "Authentication required."
        }), 401

    if session.get("role") != "System Admin":
        return jsonify({
            "success": False,
            "error": "Administrator privileges required."
        }), 403

    return None
@app.route("/api/hospitals", methods=["GET"])
def get_hospitals():
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                hospital_id,
                hospital_name,
                branch_name,
                city,
                state,
                contact_number,
                email,
                created_at
            FROM hospitals
            ORDER BY hospital_id
        """)

        hospitals = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "success": True,
            "hospitals": hospitals
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500



@app.route("/api/hospitals", methods=["POST"])
def add_hospital():
    # Require authentication and System Admin privileges.
    if not session.get("user_id"):
        return jsonify({
            "success": False,
            "error": "Authentication required."
            }), 401
    if session.get("role") != "System Admin":
        return jsonify({
            "success": False,
            "error": "Only System Admin users can add hospitals."
            }), 403

    connection = None
    cursor = None

    try:
        data = request.get_json(silent=True) or {}

        required_fields = [
            "hospital_name",
            "branch_name",
            "city",
            "state",
            "contact_number",
            "email"
        ]

        missing_fields = [
            field for field in required_fields
            if not isinstance(data.get(field), str)
            or not data[field].strip()
        ]

        if missing_fields:
            return jsonify({
                "success": False,
                "error": "All hospital fields are required.",
                "missing_fields": missing_fields
            }), 400

        connection = get_db_connection()
        cursor = connection.cursor()

        sql = """
            INSERT INTO hospitals (
                hospital_name,
                branch_name,
                city,
                state,
                contact_number,
                email
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """

        values = tuple(
            data[field].strip()
            for field in required_fields
        )

        cursor.execute(sql, values)
        connection.commit()

        hospital_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Hospital branch added successfully",
            "hospital_id": hospital_id
        }), 201

    except Exception:
        if connection:
            connection.rollback()

        app.logger.exception("Failed to add hospital")
        return jsonify({
            "success": False,
            "error": "Failed to add hospital branch."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/hospitals/<int:hospital_id>", methods=["DELETE"])
def delete_hospital(hospital_id):
    denied = require_system_admin()
    if denied:
        return denied

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # Do not delete a hospital that still has associated users
        # or operational records.
        related_tables = [
            ("users", "hospital_id"),
            ("donors", "hospital_id"),
            ("recipients", "hospital_id"),
            ("requests", "hospital_id"),
            ("blood_units", "hospital_id"),
            ("organs", "hospital_id"),
            ("allocations", "hospital_id"),
        ]

        cursor.execute(
            "SELECT hospital_id FROM hospitals WHERE hospital_id = %s",
            (hospital_id,)
        )
        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "error": "Hospital not found."
            }), 404

        for table, column in related_tables:
            # Table and column names above are fixed constants.
            cursor.execute(
                f"SELECT 1 FROM {table} WHERE {column} = %s LIMIT 1",
                (hospital_id,)
            )
            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "error": (
                        "This hospital has linked records. "
                        "Deactivate or archive it instead of deleting it."
                    )
                }), 409

        cursor.execute(
            "DELETE FROM hospitals WHERE hospital_id = %s",
            (hospital_id,)
        )
        connection.commit()

        return jsonify({
            "success": True,
            "message": "Hospital deleted successfully."
        }), 200

    except Exception:
        if connection:
            connection.rollback()
        app.logger.exception("Failed to delete hospital")
        return jsonify({
            "success": False,
            "error": "Failed to delete hospital."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@app.route("/api/audit-history", methods=["GET"])
def get_audit_history():
    connection = None
    cursor = None

    try:
        hospital_id = session["hospital_id"]

        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                'Allocation' AS event_type,
                a.allocation_id AS event_id,
                a.request_id,
                a.match_id,
                a.blood_unit_id,
                a.organ_id,
                a.hospital_id,
                a.allocation_status AS status,
                a.allocated_at AS event_time
            FROM allocations a
            WHERE a.hospital_id = %s

            UNION ALL

            SELECT
                'Match' AS event_type,
                m.match_id AS event_id,
                m.request_id,
                m.match_id,
                m.blood_unit_id,
                m.organ_id,
                r.hospital_id,
                m.match_status AS status,
                m.matched_at AS event_time
            FROM matches m
            INNER JOIN requests r
                ON r.request_id = m.request_id
            WHERE r.hospital_id = %s

            ORDER BY event_time DESC
        """, (hospital_id, hospital_id))

        history = cursor.fetchall()

        return jsonify({
            "success": True,
            "history": history
        }), 200

    except Exception:
        app.logger.exception("Failed to retrieve audit history")
        return jsonify({
            "success": False,
            "error": "Failed to retrieve audit history."
        }), 500

    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5001)
