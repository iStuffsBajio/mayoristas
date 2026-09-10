@echo off
rem Ejecutado por el Programador de tareas de Windows ("iStuffs Inventarios 10am").
rem Corre la sincronización y guarda el registro en %LOCALAPPDATA%\istuffs-inventarios\logs
setlocal
set "PROYECTO=%~dp0.."
set "LOGDIR=%LOCALAPPDATA%\istuffs-inventarios\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\%date:~6,4%-%date:~3,2%-%date:~0,2%.log"
cd /d "%PROYECTO%"
echo ===== %date% %time% ===== >> "%LOG%"
node scripts\sincronizar-inventarios.js >> "%LOG%" 2>&1
echo salida: %errorlevel% >> "%LOG%"
endlocal
