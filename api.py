import json
import sqlcipher3.dbapi2 as sqlite3
import os
import hashlib
import hmac
import base64
from datetime import datetime, timedelta
import time
from urllib.parse import parse_qs
from DBconnector import connectDB
from env_variables import DATABASE_KEY, SECRET_KEY

# Import functions from user_manager
from user_manager import verify_user, _init_auth_db

# Define the SQLite database file path.
DB_FILE = "./data/tasks.db"

# --- JWT Helper Functions ---

def _base64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _base64url_decode(data):
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def generate_jwt(payload_data, secret):
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _base64url_encode(json.dumps(header).encode('utf-8'))
    encoded_payload = _base64url_encode(json.dumps(payload_data).encode('utf-8'))
    signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def verify_jwt(token, secret):
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        encoded_header, encoded_payload, received_signature = parts
        signing_input = f"{encoded_header}.{encoded_payload}".encode('utf-8')
        expected_signature_bytes = hmac.new(secret, signing_input, hashlib.sha256).digest()
        expected_signature = _base64url_encode(expected_signature_bytes)
        if not hmac.compare_digest(received_signature.encode('utf-8'), expected_signature.encode('utf-8')):
            return None
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes)
        if 'exp' in payload and datetime.utcfromtimestamp(payload['exp']) < datetime.utcnow():
            return None
        return payload
    except Exception:
        return None

# --- Database Initialization ---

def init_db():
    print("Initializing SQLite database...")
    conn, cursor = connectDB(DB_FILE, DATABASE_KEY)    

    # Create status table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL UNIQUE
        )
    ''')

    # Create origin table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS origin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL UNIQUE
        )
    ''')    

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY, creator TEXT NOT NULL, title TEXT, origin INTEGER, priority INTEGER, 
            deadline TEXT, finishDate TEXT, status INTEGER, description TEXT, notes TEXT,
            categories TEXT, attachments TEXT, createdAt TEXT, updatedAt TEXT,
            FOREIGN KEY(status) REFERENCES status(id)
            FOREIGN KEY(origin) REFERENCES origin(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS milestones (
            id TEXT PRIMARY KEY, taskId TEXT NOT NULL, title TEXT, deadline TEXT, finishDate TEXT,
            status INTEGER, parentId TEXT, notes TEXT, updatedAt TEXT,
            FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY(status) REFERENCES status(id)
        )
    ''')

    cursor.execute("PRAGMA table_info(tasks)")

    columns = [info[1] for info in cursor.fetchall()]

    if 'createdAt' not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN createdAt TEXT")

    conn.commit()

    conn.close()

    print(f"SQLite database initialized at: {os.path.abspath(DB_FILE)}")



_init_auth_db()

init_db()



# --- API Functions ---



class Api:

    def login(self, username, password):
        if verify_user(username, password):
            token_payload = {
                'username': username,
                'exp': int(time.time() + 3600 * 24 * 30)  # Token expires in 1 Month
            }
            token = generate_jwt(token_payload, SECRET_KEY)
            return {"token": token, "username": username}

        return {"error": "Invalid credentials."}



    def _get_authenticated_username(self, token):
        if not token:
            return None

        payload = verify_jwt(token, SECRET_KEY)
        return payload.get('username') if payload else None



    def load_task(self, token, taskId):
        username = self._get_authenticated_username(token)
        if not username: 
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)

        query = """
            SELECT t.*, s.description as status , o.description as "from"
            FROM tasks t
            LEFT JOIN status s ON t.status = s.id
            LEFT JOIN origin o ON t.origin = o.id
            WHERE t.id = ? AND t.creator = ?
        """

        cursor.execute(query, (taskId, username))
        row = cursor.fetchone()
        conn.close()

        if row:
            columns = [description[0] for description in cursor.description]
            task_data = dict(zip(columns, row))
            if 'categories' in task_data and task_data['categories']:
                task_data['categories'] = json.loads(task_data['categories'])
            if 'attachments' in task_data and task_data['attachments']:
                task_data['attachments'] = json.loads(task_data['attachments'])
            return task_data

        return {"error": "Task not found."}



    def load_tasks_summary(self, token, filters={}, pagination={}):
        username = self._get_authenticated_username(token)
        if not username: 
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)

        sql_query = """
            SELECT t.id, t.creator, t.title, o.description as "from", t.priority, t.deadline, t.finishDate, 
                   s.description as status, t.categories, t.createdAt, t.updatedAt, t.origin as fromId 
            FROM tasks t
            LEFT JOIN status s ON t.status = s.id
            LEFT JOIN origin o ON t.origin = o.id
            WHERE t.creator = ?
        """

        query_args = [username]

        if filters.get('q'):
            search_query = filters.get('q').lower()
            sql_query += " AND (LOWER(t.title) LIKE ? OR LOWER(o.description) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(t.notes) LIKE ?)"
            query_args.extend([f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', f'%{search_query}%'])

        if filters.get('categories'):
            category_conditions = []
            for cat in filters.get('categories'):
                category_conditions.append(f"t.categories LIKE ?")
                query_args.append(f'%\"{cat}\"%')

            if category_conditions:
                sql_query += " AND (" + " OR ".join(category_conditions) + ")"

        if filters.get('statuses'):
            status_placeholders = ','.join('?' * len(filters.get('statuses')))
            sql_query += f" AND s.description IN ({status_placeholders})"
            query_args.extend(filters.get('statuses'))

        def add_date_filter(column_name, from_date, to_date):
            nonlocal sql_query, query_args
            if from_date and to_date:
                sql_query += f" AND date({column_name}) BETWEEN date(?) AND date(?)"
                query_args.extend([from_date, to_date])

            elif from_date:
                sql_query += f" AND date({column_name}) >= date(?)"
                query_args.append(from_date)

            elif to_date:
                sql_query += f" AND date({column_name}) <= date(?)"
                query_args.append(to_date)

        add_date_filter('t.createdAt', filters.get('createdRF'), filters.get('createdRT'))
        add_date_filter('t.updatedAt', filters.get('updatedRF'), filters.get('updatedRT'))
        add_date_filter('t.deadline', filters.get('deadlineRF'), filters.get('deadlineRT'))
        add_date_filter('t.finishDate', filters.get('finishedRF'), filters.get('finishedRT'))

        if filters.get('hasFinishDate') == 'false':
            sql_query += " AND (t.finishDate IS NULL OR t.finishDate = '')"

        sort_expressions = []

        group_by_map = {
            'priority': 't.priority ASC', 'from': '"from" ASC', 'status': 'status ASC',
            'deadlineYear': 'CASE WHEN t.deadline IS NULL OR t.deadline = \'\' THEN 1 ELSE 0 END, t.deadline ASC',
            'deadlineMonthYear': 'CASE WHEN t.deadline IS NULL OR t.deadline = \'\' THEN 1 ELSE 0 END, t.deadline ASC',
            'finishDateYear': 'CASE WHEN t.finishDate IS NULL OR t.finishDate = \'\' THEN 1 ELSE 0 END, t.finishDate ASC',
            'finishDateMonthYear': 'CASE WHEN t.finishDate IS NULL OR t.finishDate = \'\' THEN 1 ELSE 0 END, t.finishDate ASC',
            'createdAtYear': 'CASE WHEN t.createdAt IS NULL OR t.createdAt = \'\' THEN 1 ELSE 0 END, t.createdAt ASC',
            'createdAtMonthYear': 'CASE WHEN t.createdAt IS NULL OR t.createdAt = \'\' THEN 1 ELSE 0 END, t.createdAt ASC',
        }

        sort_by_map = {
            'deadline': 'CASE WHEN t.deadline IS NULL OR t.deadline = \'\' THEN 1 ELSE 0 END, t.deadline ASC',
            'priority': 't.priority ASC', 'from': '"from" ASC', 'updatedAt': 't.updatedAt DESC',
        }

        if filters.get('groupBy') in group_by_map:
            sort_expressions.append(group_by_map[filters.get('groupBy')])

        sort_by_expression = sort_by_map.get(filters.get('sortBy'), 't.updatedAt DESC')

        if sort_by_expression not in sort_expressions:
            sort_expressions.append(sort_by_expression)

        if not sort_expressions:
            sort_expressions.append('t.updatedAt DESC')



        sql_query += " ORDER BY " + ", ".join(sort_expressions)
        sql_query += " LIMIT ? OFFSET ?"
        query_args.extend([pagination.get('limit', 10), pagination.get('offset', 0)])        

        cursor.execute(sql_query, query_args)
        rows = cursor.fetchall()
        conn.close()

        tasks_summary = []

        columns = [description[0] for description in cursor.description]

        for row in rows:
            task_data = dict(zip(columns, row))
            if 'categories' in task_data and task_data['categories']:
                try:
                    task_data['categories'] = json.loads(task_data['categories'])
                except json.JSONDecodeError:
                    task_data['categories'] = []
            tasks_summary.append(task_data)

        return tasks_summary



    def _get_or_create_status_id(self, cursor, status_desc):
        if not status_desc:
            return None

        cursor.execute("SELECT id FROM status WHERE description = ?", (status_desc,))
        result = cursor.fetchone()

        if result:
            return result[0]
        else:
            cursor.execute("INSERT INTO status (description) VALUES (?)", (status_desc,))
            return cursor.lastrowid

    def _get_or_create_origin_id(self, cursor, origin_desc):
        if not origin_desc:
            return None

        cursor.execute("SELECT id FROM origin WHERE description = ?", (origin_desc,))
        result = cursor.fetchone()

        if result:
            return result[0]
        else:
            cursor.execute("INSERT INTO origin (description) VALUES (?)", (origin_desc,))
            return cursor.lastrowid

    def save_task(self, token, task):
        username = self._get_authenticated_username(token)
        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        status_id = self._get_or_create_status_id(cursor, task.get('status'))
        origin_id = self._get_or_create_origin_id(cursor, task.get('from'))

        categories_json = json.dumps(task.get('categories', []))
        attachments_json = json.dumps(task.get('attachments', []))

        cursor.execute('''
            INSERT OR REPLACE INTO tasks (
                id, creator, title, origin, priority, deadline, finishDate, status,
                description, notes, categories, attachments, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            task['id'], username, task.get('title'), origin_id, task.get('priority'),
            task.get('deadline'), task.get('finishDate'), status_id,
            task.get('description'), task.get('notes'), categories_json, attachments_json,
            task.get('createdAt'), task.get('updatedAt')
        ))
        conn.commit()
        conn.close()
        return {"message": "Task saved successfully."}

    def delete_task(self, token, taskId):
        username = self._get_authenticated_username(token)
        if not username: 
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("DELETE FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        conn.commit()
        conn.close()
        return {"message": "Task deleted successfully."}



    def load_milestones_for_task(self, token, taskId):
        username = self._get_authenticated_username(token)
        if not username: 
            return {"error": "Authentication required."}
        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))

        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}

        query = """
            SELECT m.*, s.description as status
            FROM milestones m
            LEFT JOIN status s ON m.status = s.id
            WHERE m.taskId = ?
        """

        cursor.execute(query, (taskId,))
        rows = cursor.fetchall()
        conn.close()
        milestones = []
        columns = [description[0] for description in cursor.description]

        for row in rows:
            milestone_data = dict(zip(columns, row))
            if 'notes' in milestone_data and milestone_data['notes']:
                milestone_data['notes'] = json.loads(milestone_data['notes'])
            milestones.append(milestone_data)
        return milestones



    def save_milestone(self, token, milestone, taskId):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}
        status_id = self._get_or_create_status_id(cursor, milestone.get('status'))
        notes_json = json.dumps(milestone.get('notes', ''))

        cursor.execute('''
            INSERT OR REPLACE INTO milestones (
                id, taskId, title, deadline, finishDate, status, parentId, notes, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            milestone['id'], taskId, milestone.get('title'), milestone.get('deadline'),
            milestone.get('finishDate'), status_id, milestone.get('parentId'),
            notes_json, milestone.get('updatedAt')
        ))
        conn.commit()
        conn.close()
        return {"message": "Milestone saved successfully."}



    def load_milestone(self, token, taskId, milestoneId):
        username = self._get_authenticated_username(token)
        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))

        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}

        query = """
            SELECT m.*, s.description as status
            FROM milestones m
            LEFT JOIN status s ON m.status = s.id
            WHERE m.id = ? AND m.taskId = ?
        """

        cursor.execute(query, (milestoneId, taskId))
        row = cursor.fetchone()
        conn.close()

        if row:
            columns = [description[0] for description in cursor.description]
            milestone_data = dict(zip(columns, row))
            if 'notes' in milestone_data and milestone_data['notes']:
                milestone_data['notes'] = json.loads(milestone_data['notes'])
            return milestone_data

        return {"error": "Milestone not found."}



    def delete_milestone(self, token, milestoneId, taskId):
        username = self._get_authenticated_username(token)
        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))

        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}

        cursor.execute("SELECT id FROM milestones WHERE parentId = ?", (milestoneId,))

        if cursor.fetchone():
            conn.close()
            return {"error": "Cannot delete milestone: it is a parent to other milestones."}

        cursor.execute("DELETE FROM milestones WHERE id = ? AND taskId = ?", (milestoneId, taskId))
        conn.commit()
        conn.close()
        return {"message": "Milestone deleted successfully."}



    def get_distinct_statuses(self, token, only_active=False):
        username = self._get_authenticated_username(token)

        if not username: 
            return {"error": "Authentication required."}

        if not only_active:
            conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
            cursor.execute("SELECT description FROM status ORDER BY description")
            statuses = [row[0] for row in cursor.fetchall()]
            conn.close()
            return statuses
        else:
            conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
            cursor.execute("""
                SELECT distinct s.description FROM status s
                JOIN tasks on s.id = tasks.status 
                ORDER BY s.description
            """)
            statuses = [row[0] for row in cursor.fetchall()]
            conn.close()
            return statuses



    def get_distinct_from_values(self, token, only_active=False):

        username = self._get_authenticated_username(token)

        if not username:
            return {"error": "Authentication required."}

        if not only_active:
            conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
            cursor.execute("SELECT description FROM origin ORDER BY description")
            from_values = [row[0] for row in cursor.fetchall()]
            conn.close()
            return from_values
        else:
            conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
            cursor.execute("""
                SELECT distinct o.description FROM origin o
                JOIN tasks on o.id = tasks.origin 
                ORDER BY o.description
            """)
            from_values = [row[0] for row in cursor.fetchall()]
            conn.close()
            return from_values

    def delete_from_values(self, token, originDesc):
        username = self._get_authenticated_username(token)

        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)

        # Check if the origin is currently in use by any task
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE origin = (SELECT id FROM origin WHERE description = ?)", (originDesc,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return {"error": "Cannot delete origin: it is currently in use by one or more tasks."}

        # If not in use, delete it
        cursor.execute("DELETE FROM origin WHERE description = ?", (originDesc,))
        conn.commit()
        conn.close()
        return {"message": f"Origin '{originDesc}' deleted successfully."}


    def delete_status_values(self, token, statusDesc):
        username = self._get_authenticated_username(token)

        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)

        # Check if the status is currently in use by any task or milestone
        cursor.execute("SELECT COUNT(*) FROM tasks WHERE status = (SELECT id FROM status WHERE description = ?)", (statusDesc,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return {"error": "Cannot delete status: it is currently in use by one or more tasks."}
        
        cursor.execute("SELECT COUNT(*) FROM milestones WHERE status = (SELECT id FROM status WHERE description = ?)", (statusDesc,))
        if cursor.fetchone()[0] > 0:
            conn.close()
            return {"error": "Cannot delete status: it is currently in use by one or more milestones."}

        # If not in use, delete it
        cursor.execute("DELETE FROM status WHERE description = ?", (statusDesc,))
        conn.commit()
        conn.close()
        return {"message": f"Status '{statusDesc}' deleted successfully."}

    def get_distinct_categories(self, token, only_active=False):
        username = self._get_authenticated_username(token)

        if not username:
            return {"error": "Authentication required."}

        all_categories = set()
        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        cursor.execute("SELECT categories FROM tasks WHERE creator = ? AND categories IS NOT NULL AND categories != ''", (username,))
        rows = cursor.fetchall()
        conn.close()

        for row in rows:
            try:
                categories_list = json.loads(row[0])
                if isinstance(categories_list, list):
                    all_categories.update(categories_list)
            except (json.JSONDecodeError, TypeError):
                continue

        return sorted(list(all_categories))



    def get_task_counts(self, token, since=None):
        username = self._get_authenticated_username(token)
        if not username:
            return {"error": "Authentication required."}

        conn, cursor = connectDB(DB_FILE, DATABASE_KEY)
        sql_query = """
            SELECT s.description, COUNT(t.id) 
            FROM tasks t
            JOIN status s ON t.status = s.id
            WHERE t.creator = ?
        """

        query_args = [username]

        if since and since.isdigit():
            since_date = datetime.utcnow() - timedelta(days=int(since))
            sql_query += " AND t.updatedAt >= ?"
            query_args.append(since_date.isoformat())

        sql_query += " GROUP BY s.description"
        cursor.execute(sql_query, query_args)
        rows = cursor.fetchall()
        conn.close()
        return {status: count for status, count in rows}
