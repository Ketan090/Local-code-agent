@echo off
title Local Code Agent
cd /d "%~dp0"
echo ========================================
echo  Local Code Agent - LM Studio IDE
echo  Backend: http://localhost:3101
echo  LM Studio: http://10.88.238.129:1234/v1
echo ========================================
echo.
if not exist "backend\dist\index.js" (
  echo Building backend...
  call node "backend\node_modules\typescript\bin\tsc" -p "backend\tsconfig.json"
)
echo Starting backend...
start "" http://localhost:3101
node backend\dist\index.js
pause
