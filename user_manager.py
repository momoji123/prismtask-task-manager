import sqlcipher3.dbapi2 as sqlite3
import hashlib
import os
from DBconnector import connectDB
from env_variables import DATABASE_KEY, PEPPER

# Define the authentication database file path.
AUTH_DB_FILE = "./data/auth.db"

def _init_auth_db():
    """Initializes the SQLite authentication database and creates the users table if it doesn't exist."""
    print("Initializing authentication database...")
    conn = None
    try:
        # Ensure the data directory exists
        os.makedirs(os.path.dirname(AUTH_DB_FILE), exist_ok=True)
        conn, cursor = connectDB(AUTH_DB_FILE, DATABASE_KEY)

        # Create users table
        # password_hash will store the hashed password
        # salt will store the unique salt for each user
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL
            )
        ''')
        conn.commit()
        print(f"Authentication database initialized at: {os.path.abspath(AUTH_DB_FILE)}")
    except sqlite3.Error as e:
        print(f"Error initializing auth database: {e}")
    finally:
        if conn:
            conn.close()

def _hash_password(password, salt):
    """Hashes a password using SHA256 with a salt and a pepper."""
    # Combine password, salt, and pepper
    salted_peppered_password = (password + salt + PEPPER).encode('utf-8')
    return hashlib.sha256(salted_peppered_password).hexdigest()

def register_user(username, password):
    """Registers a new user."""
    conn = None
    try:
        conn, cursor = connectDB(AUTH_DB_FILE, DATABASE_KEY)

        # Generate a unique salt for the user
        salt = os.urandom(16).hex()
        # Hash the password with the generated salt and predefined pepper
        hashed_password = _hash_password(password, salt)

        cursor.execute("INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
                       (username, hashed_password, salt))
        conn.commit()
        print(f"User '{username}' registered successfully.")
        return True
    except sqlite3.IntegrityError:
        print(f"Error: Username '{username}' already exists.")
        return False
    except sqlite3.Error as e:
        print(f"Database error during registration: {e}")
        return False
    finally:
        if conn:
            conn.close()

def change_password(username, old_password, new_password):
    """Changes a user's password."""
    conn = None
    try:
        conn, cursor = connectDB(AUTH_DB_FILE, DATABASE_KEY)

        # Retrieve user's salt and hashed password
        cursor.execute("SELECT salt, password_hash FROM users WHERE username = ?", (username,))
        result = cursor.fetchone()

        if not result:
            print(f"Error: User '{username}' not found.")
            return False

        salt, stored_hash = result
        # Verify old password
        if _hash_password(old_password, salt) != stored_hash:
            print("Error: Old password does not match.")
            return False

        # Hash the new password
        new_hashed_password = _hash_password(new_password, salt)
        cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?",
                       (new_hashed_password, username))
        conn.commit()
        print(f"Password for user '{username}' changed successfully.")
        return True
    except sqlite3.Error as e:
        print(f"Database error during password change: {e}")
        return False
    finally:
        if conn:
            conn.close()

def verify_user(username, password):
    """Verifies user credentials."""
    conn = None
    try:
        conn, cursor = connectDB(AUTH_DB_FILE, DATABASE_KEY)

        cursor.execute("SELECT password_hash, salt FROM users WHERE username = ?", (username,))
        result = cursor.fetchone()

        if result:
            stored_hash, salt = result
            # Hash the provided password with the stored salt and pepper, then compare
            if _hash_password(password, salt) == stored_hash:
                print(f"User '{username}' verified successfully.")
                return True
        print(f"Verification failed for user '{username}'.")
        return False
    except sqlite3.Error as e:
        print(f"Database error during verification: {e}")
        return False
    finally:
        if conn:
            conn.close()

def delete_user(username):
    """Deletes a user from the authentication database."""
    conn = None
    try:
        conn, cursor = connectDB(AUTH_DB_FILE, DATABASE_KEY)
        cursor.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
        if cursor.rowcount > 0:
            print(f"User '{username}' deleted successfully.")
            return True
        else:
            print(f"User '{username}' not found.")
            return False
    except sqlite3.Error as e:
        print(f"Database error during user deletion: {e}")
        return False
    finally:
        if conn:
            conn.close()


def main():
    """Simple command-line interface for user management."""
    _init_auth_db()
    while True:
        print("\n--- User Manager ---")
        print("1. Register User")
        print("2. Change Password")
        print("3. Verify User")
        print("4. Delete User")
        print("5. Exit")
        choice = input("Enter your choice: ")

        if choice == '1':
            username = input("Enter new username: ")
            password = input("Enter new password: ")
            register_user(username, password)
        elif choice == '2':
            username = input("Enter username: ")
            old_password = input("Enter old password: ")
            new_password = input("Enter new password: ")
            change_password(username, old_password, new_password)
        elif choice == '3':
            username = input("Enter username: ")
            password = input("Enter password: ")
            if verify_user(username, password):
                print("Authentication successful!")
            else:
                print("Authentication failed.")
        elif choice == '4':
            username = input("Enter username to delete: ")
            delete_user(username)
        elif choice == '5':
            print("Exiting User Manager.")
            break
        else:
            print("Invalid choice. Please try again.")

if __name__ == "__main__":
    main()
