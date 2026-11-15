@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install an active LTS release from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing CubeLab dependencies for the first run...
  call npm install
  if errorlevel 1 goto install_failed
)
echo Starting CubeLab. Leave this window open while using the local app.
call npm run dev -- --open
goto end
:install_failed
echo Dependency installation failed. Check the error printed above.
:end
pause
