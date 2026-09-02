@echo off
setlocal

echo ----- ProxyStop Server Setup Wizard -----
echo.
echo Select installation type:
echo [1] Guided Installation (recommended)
echo [2] I already have an "installer.json" file
echo [3] Quit the installer
choice /C 123 /N /M "Enter your choice: "

if errorlevel 3 goto :quit
if errorlevel 2 set "INSTALL_TYPE=config"
if errorlevel 1 if not defined INSTALL_TYPE set "INSTALL_TYPE=guided"

echo.
echo Selected installation type: %INSTALL_TYPE%
goto :eof

:quit
echo.
echo Exiting the installer.
endlocal
