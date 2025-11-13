@echo off
IF NOT EXIST "data\auth.db" (
    echo "auth.db not found in the data folder. Please run userManagement.bat first to set up the database."
    pause
    exit /b 1
)
echo "Starting TaskTide Task Manager..."
start "" "prismtask_venv\Scripts\python.exe" desktop_app.py
