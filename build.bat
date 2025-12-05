@echo off
setlocal enabledelayedexpansion
set isSuccess=true



call venv\Scripts\activate.bat
if errorlevel 1 (
    echo Failed to activate venv
    set isSuccess=false
)

if "%isSuccess%"=="true" (
	echo "build desktop app executor"
	
	rmdir /S /Q ".\dist\desktop_app"

	pyinstaller desktop_app.py --name PrismTask --add-data index.html:. --add-data Assets:Assets --add-data css:css --add-data js:js --icon=favicon.ico --distpath .\dist\desktop_app --onedir
	if errorlevel 1 (
		echo "Failed to build PrismTask (main)"
		set isSuccess=false
	)
)

if "%isSuccess%"=="true" (
	echo "build user manager app executor"

	pyinstaller user_manager.py --name user_manager --distpath .\dist\desktop_app\PrismTask --onefile --console
	if errorlevel 1 (
		echo "Failed to build user_manager"
		set isSuccess=false
	)
)

if "%isSuccess%"=="true" (
	echo "Copying Licence Files"
	robocopy third_party_licenses .\dist\desktop_app\PrismTask\third_party_licenses /E

	copy LICENSE .\dist\desktop_app\PrismTask
	copy NOTICE .\dist\desktop_app\PrismTask
	copy "README (For Dist).md" .\dist\desktop_app\PrismTask\README.md
	
	echo "Renaming Result Folder"

	for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set TODAY=%%i
	
	pushd .\dist\desktop_app
	ren PrismTask PrismTask-V1.0.!TODAY!
	popd
	
	echo "Cleaning project folder"

	del /q *.spec
	rmdir /S /Q ".\build"
)

pause
