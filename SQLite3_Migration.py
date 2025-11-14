import os
from sqlcipher3 import dbapi2 as sqlite
from env_variables import DATABASE_KEY

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

try:
    encrypt_database('./data/tasks.db', './data/tasks_encrypted.db')
    encrypt_database('./data/auth.db', './data/auth_encrypted.db')
finally:
    print("Press enter to close...")
    input()
