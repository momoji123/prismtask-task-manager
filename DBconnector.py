import sqlcipher3.dbapi2 as sqlite3

def connectDB(dbfile, key):
    conn = sqlite3.connect(dbfile)
    conn.execute(f"PRAGMA key = '{key}';")

    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    return conn, cursor