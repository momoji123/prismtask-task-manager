# Prismtask - Task Manager
local task manager

how to start:
- make sure Python installed (preffered python3)
- create virtual env (venv) by open cmd on the project directory and run:
    python3 -m venv prismtask_venv

    .\prismtask_venv\Scripts\activate.bat

    pip install -r requirements.txt

- IMPORTANT:
    before run everything, please make sure to adjust all env variables in your system (see env_variables.py):
    1. TASK_DB_KEY
    2. AUTH_PEPPER_JWT
    3. AUTH_PEPPER

- Create user:
    run user_manager.py to create account

- Run Application:
    - Windows: run run_desktop_app.bat
    - others: python desktop_app.py (make sure first run .\prismtask_venv\Scripts\activate.bat)

- For user using that used Prismtask previously:
    - Plain SQLite3 from previous versions must be migrated and encrypted (encryption using "sqlcipher3-wheels") use SQLite3_Migration.py.
    
