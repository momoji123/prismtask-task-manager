import json
import sqlite3
import os
import hashlib
import hmac
import base64
from datetime import datetime, timedelta
import time
from urllib.parse import parse_qs

# Import functions from user_manager
from user_manager import verify_user, _init_auth_db

# Define the SQLite database file path.
DB_FILE = "./data/tasks.db"

# Secret key for JWT.
SECRET_KEY = os.getenv("AUTH_PEPPER_JWT", "your_super_secret_jwt_key_please_change_this!").encode('utf-8')

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
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY, creator TEXT NOT NULL, title TEXT, "from" TEXT, priority INTEGER, 
            deadline TEXT, finishDate TEXT, status TEXT, description TEXT, notes TEXT,
            categories TEXT, attachments TEXT, createdAt TEXT, updatedAt TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS milestones (
            id TEXT PRIMARY KEY, taskId TEXT NOT NULL, title TEXT, deadline TEXT, finishDate TEXT,
            status TEXT, parentId TEXT, notes TEXT, updatedAt TEXT,
            FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
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
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
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
        if not username: return {"error": "Authentication required."}
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        sql_query = "SELECT id, creator, title, \"from\", priority, deadline, finishDate, status, categories, createdAt, updatedAt FROM tasks WHERE creator = ?"
        query_args = [username]

        if filters.get('q'):
            search_query = filters.get('q').lower()
            sql_query += " AND (LOWER(title) LIKE ? OR LOWER(\"from\") LIKE ? OR LOWER(description) LIKE ? OR LOWER(notes) LIKE ?)"
            query_args.extend([f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', f'%{search_query}%'])

        if filters.get('categories'):
            category_conditions = []
            for cat in filters.get('categories'):
                category_conditions.append(f"categories LIKE ?")
                query_args.append(f'%\"{cat}\"%')
            if category_conditions:
                sql_query += " AND (" + " OR ".join(category_conditions) + ")"

        if filters.get('statuses'):
            status_placeholders = ','.join('?' * len(filters.get('statuses')))
            sql_query += f" AND status IN ({status_placeholders})"
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

        add_date_filter('createdAt', filters.get('createdRF'), filters.get('createdRT'))
        add_date_filter('updatedAt', filters.get('updatedRF'), filters.get('updatedRT'))
        add_date_filter('deadline', filters.get('deadlineRF'), filters.get('deadlineRT'))
        add_date_filter('finishDate', filters.get('finishedRF'), filters.get('finishedRT'))

        if filters.get('hasFinishDate') == 'false':
            sql_query += " AND (finishDate IS NULL OR finishDate = '')"

        sort_expressions = []
        group_by_map = {
            'priority': 'priority ASC', 'from': '"from" ASC', 'status': 'status ASC',
            'deadlineYear': 'CASE WHEN deadline IS NULL OR deadline = \'\' THEN 1 ELSE 0 END, deadline ASC',
            'deadlineMonthYear': 'CASE WHEN deadline IS NULL OR deadline = \'\' THEN 1 ELSE 0 END, deadline ASC',
            'finishDateYear': 'CASE WHEN finishDate IS NULL OR finishDate = \'\' THEN 1 ELSE 0 END, finishDate ASC',
            'finishDateMonthYear': 'CASE WHEN finishDate IS NULL OR finishDate = \'\' THEN 1 ELSE 0 END, finishDate ASC',
            'createdAtYear': 'CASE WHEN createdAt IS NULL OR createdAt = \'\' THEN 1 ELSE 0 END, createdAt ASC',
            'createdAtMonthYear': 'CASE WHEN createdAt IS NULL OR createdAt = \'\' THEN 1 ELSE 0 END, createdAt ASC',
        }
        sort_by_map = {
            'deadline': 'CASE WHEN deadline IS NULL OR deadline = \'\' THEN 1 ELSE 0 END, deadline ASC',
            'priority': 'priority ASC', 'from': '"from" ASC', 'updatedAt': 'updatedAt DESC',
        }

        if filters.get('groupBy') in group_by_map:
            sort_expressions.append(group_by_map[filters.get('groupBy')])

        sort_by_expression = sort_by_map.get(filters.get('sortBy'), 'updatedAt DESC')
        if sort_by_expression not in sort_expressions:
            sort_expressions.append(sort_by_expression)
        
        if not sort_expressions:
            sort_expressions.append('updatedAt DESC')

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

    def save_task(self, token, task):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        categories_json = json.dumps(task.get('categories', []))
        attachments_json = json.dumps(task.get('attachments', []))

        cursor.execute('''
            INSERT OR REPLACE INTO tasks (
                id, creator, title, "from", priority, deadline, finishDate, status,
                description, notes, categories, attachments, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            task['id'], username, task.get('title'), task.get('from'), task.get('priority'),
            task.get('deadline'), task.get('finishDate'), task.get('status'),
            task.get('description'), task.get('notes'), categories_json, attachments_json,
            task.get('createdAt'), task.get('updatedAt')
        ))
        conn.commit()
        conn.close()
        return {"message": "Task saved successfully."}

    def delete_task(self, token, taskId):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        conn.commit()
        conn.close()
        return {"message": "Task deleted successfully."}

    def load_milestones_for_task(self, token, taskId):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}
        cursor.execute("SELECT * FROM milestones WHERE taskId = ?", (taskId,))
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
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}
        
        notes_json = json.dumps(milestone.get('notes', ''))
        cursor.execute('''
            INSERT OR REPLACE INTO milestones (
                id, taskId, title, deadline, finishDate, status, parentId, notes, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            milestone['id'], taskId, milestone.get('title'), milestone.get('deadline'),
            milestone.get('finishDate'), milestone.get('status'), milestone.get('parentId'),
            notes_json, milestone.get('updatedAt')
        ))
        conn.commit()
        conn.close()
        return {"message": "Milestone saved successfully."}

    def load_milestone(self, token, taskId, milestoneId):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tasks WHERE id = ? AND creator = ?", (taskId, username))
        if not cursor.fetchone():
            conn.close()
            return {"error": "Task not found or unauthorized."}
        
        cursor.execute("SELECT * FROM milestones WHERE id = ? AND taskId = ?", (milestoneId, taskId))
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
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
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

    def get_distinct_statuses(self, token):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT status FROM tasks WHERE creator = ? AND status IS NOT NULL AND status != '' ORDER BY status", (username,))
        statuses = [row[0] for row in cursor.fetchall()]
        conn.close()
        return statuses

    def get_distinct_from_values(self, token):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT \"from\" FROM tasks WHERE creator = ? AND \"from\" IS NOT NULL AND \"from\" != '' ORDER BY \"from\"", (username,))
        from_values = [row[0] for row in cursor.fetchall()]
        conn.close()
        return from_values

    def get_distinct_categories(self, token):
        username = self._get_authenticated_username(token)
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        all_categories = set()
        cursor = conn.cursor()
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
        if not username: return {"error": "Authentication required."}
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        sql_query = "SELECT status, COUNT(*) FROM tasks WHERE creator = ? GROUP BY status"
        query_args = [username]
        if since and since.isdigit():
            since_date = datetime.utcnow() - timedelta(days=int(since))
            sql_query = "SELECT status, COUNT(*) FROM tasks WHERE creator = ? AND updatedAt >= ? GROUP BY status"
            query_args.extend([since_date.isoformat()])
        cursor.execute(sql_query, query_args)
        rows = cursor.fetchall()
        conn.close()
        return {status: count for status, count in rows}