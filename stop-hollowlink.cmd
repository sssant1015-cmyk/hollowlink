@echo off
rem Stop all HollowLink processes (API, web app, tunnel)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hollowlink.ps1" -Stop
pause
