@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3 start.py
) else (
    python start.py
)
if errorlevel 1 (
    echo.
    echo If Python is not installed, install Python 3 from https://www.python.org/downloads/
    echo Then extract the ZIP fully and run start.bat again.
    pause
)
