@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-dev.ps1" -Action up
exit /b %errorlevel%
