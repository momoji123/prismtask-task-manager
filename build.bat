@echo off

echo "build desktop app executor"

pyinstaller desktop_app.py --name run_desktop --add-data index.html:. --add-data Assets:Assets --add-data css:css --add-data js:js --icon=favicon.ico --distpath .\dist\desktop_app --onedir --console

echo "build user manager app executor"

pyinstaller user_manager.py --name user_manager --distpath .\dist\desktop_app\run_desktop --onefile --console

echo "build db migration app executor"

pyinstaller SQLite3_Migration.py --name db_migration --distpath .\dist\desktop_app\run_desktop --onefile --console