import os
from sqlcipher3 import dbapi2 as sqlite
from env_variables import DATABASE_KEY
from DBconnector import connectDB

def encrypt_database(unencrypted_path, encrypted_path):
    key = DATABASE_KEY

    # 1. Connect to the NEW, encrypted database file
    # If it doesn't exist, it will be created.
    encrypted_conn = sqlite.connect(encrypted_path)
    
    # 2. Set the encryption key on the new database
    # The new database will be created/encrypted with this key.
    encrypted_conn.execute(f"PRAGMA key = '{key}';")
    
    # Optional: If you created the unencrypted DB with an older SQLCipher 
    # version (v3), you might need this. The 'sqlcipher3-wheels' package 
    # typically uses a newer version (v4). 
    # encrypted_conn.execute("PRAGMA cipher_compatibility = 3;")

    # 3. Attach the existing, unencrypted database
    # This makes the unencrypted database accessible via the alias 'unencrypted'.
    encrypted_conn.execute(f"ATTACH DATABASE '{unencrypted_path}' AS unencrypted KEY '';")

    # 4. Export the contents from the unencrypted to the encrypted database
    # This copies the structure and all data, encrypting it on the fly.
    print("Exporting/Encrypting data...")
    encrypted_conn.execute("SELECT sqlcipher_export('main', 'unencrypted');")
    
    # 5. Detach the unencrypted database and close connections
    encrypted_conn.execute("DETACH DATABASE unencrypted;")
    encrypted_conn.commit()
    encrypted_conn.close()
    
    print(f"Encryption complete. New database created at: {encrypted_path}")
    print(f"To use, you must open it with the PRAGMA key: {key}")

def migrate_status_column(path):
    """
    Migrates the 'status' column from TEXT to INTEGER in 'tasks' and 'milestones' tables.
    It creates a new 'status' table and populates it with existing status descriptions.
    """
    print("Starting database migration...")
    
    if not os.path.exists(path):
        print(f"Database file not found at {path}. Aborting migration.")
        return

    try:
        conn, cursor = connectDB(path, DATABASE_KEY)

        # 1. Create the new 'status' table
        print("Creating 'status' table...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL UNIQUE
            )
        ''')

        # 2. Get all distinct statuses from both tables
        print("Fetching distinct statuses from 'tasks' and 'milestones' tables...")
        cursor.execute("SELECT DISTINCT status FROM tasks WHERE status IS NOT NULL AND status != ''")
        task_statuses = [row[0] for row in cursor.fetchall()]

        cursor.execute("SELECT DISTINCT status FROM milestones WHERE status IS NOT NULL AND status != ''")
        milestone_statuses = [row[0] for row in cursor.fetchall()]

        all_statuses = set(task_statuses + milestone_statuses)

        # 3. Populate the 'status' table
        if all_statuses:
            print(f"Populating 'status' table with: {', '.join(all_statuses)}")
            for status_desc in all_statuses:
                cursor.execute("INSERT OR IGNORE INTO status (description) VALUES (?)", (status_desc,))
        else:
            print("No existing statuses found to migrate.")

        # 4. Alter 'tasks' table
        print("Altering 'tasks' table...")
        cursor.execute("ALTER TABLE tasks RENAME TO tasks_old;")
        cursor.execute('''
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY, creator TEXT NOT NULL, title TEXT, "from" TEXT, priority INTEGER, 
                deadline TEXT, finishDate TEXT, status INTEGER, description TEXT, notes TEXT,
                categories TEXT, attachments TEXT, createdAt TEXT, updatedAt TEXT,
                FOREIGN KEY(status) REFERENCES status(id)
            )
        ''')
        cursor.execute('''
            INSERT INTO tasks (id, creator, title, "from", priority, deadline, finishDate, status, description, notes, categories, attachments, createdAt, updatedAt)
            SELECT 
                t.id, t.creator, t.title, t."from", t.priority, t.deadline, t.finishDate, s.id, t.description, t.notes, t.categories, t.attachments, t.createdAt, t.updatedAt
            FROM tasks_old AS t
            LEFT JOIN status AS s ON t.status = s.description;
        ''')
        cursor.execute("DROP TABLE tasks_old;")
        print("'tasks' table migrated successfully.")

        # 5. Alter 'milestones' table
        print("Altering 'milestones' table...")
        cursor.execute("ALTER TABLE milestones RENAME TO milestones_old;")
        cursor.execute('''
            CREATE TABLE milestones (
                id TEXT PRIMARY KEY, taskId TEXT NOT NULL, title TEXT, deadline TEXT, finishDate TEXT,
                status INTEGER, parentId TEXT, notes TEXT, updatedAt TEXT,
                FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY(status) REFERENCES status(id)
            )
        ''')
        cursor.execute('''
            INSERT INTO milestones (id, taskId, title, deadline, finishDate, status, parentId, notes, updatedAt)
            SELECT 
                m.id, m.taskId, m.title, m.deadline, m.finishDate, s.id, m.parentId, m.notes, m.updatedAt
            FROM milestones_old AS m
            LEFT JOIN status AS s ON m.status = s.description;
        ''')
        cursor.execute("DROP TABLE milestones_old;")
        print("'milestones' table migrated successfully.")

        conn.commit()
        print("\nMigration completed successfully!")

    except sqlite.Error as e:
        print(f"An error occurred during migration: {e}")
        if 'conn' in locals():
            conn.rollback()

try:
    encrypt_database('./data/tasks.db', './data/tasks_encrypted.db')
    encrypt_database('./data/auth.db', './data/auth_encrypted.db')
finally:
    print("Database encryption completed. press enter to continue...")
    input()

try:
    migrate_status_column('./data/tasks_encrypted.db')
finally:
    print("Database migration completed. press enter to continue...")
    input()