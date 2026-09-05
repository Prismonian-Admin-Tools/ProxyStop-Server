@echo off
setlocal

echo "----- ProxyStop Server Uninstaller -----"
echo "This will remove files created by installer.cmd:"
echo "  - fingerprints directory"
echo "  - node_modules directory"
echo "  - package-lock.json"
echo.
echo "Your installer.json and installer.cmd will NOT be touched."

choice /c YN /m "Proceed with uninstall"
if %errorlevel% neq 1 (
    echo "Uninstall cancelled."
    exit /b 0
)

set removedCount=0

echo "Removing fingerprints directory..."
if exist fingerprints (
    rmdir /s /q fingerprints
    if %errorlevel% equ 0 set /a removedCount+=1
) else (
    echo "Not found: fingerprints (already clean)"
)

echo "Removing node_modules directory..."
if exist node_modules (
    rmdir /s /q node_modules
    if %errorlevel% equ 0 set /a removedCount+=1
) else (
    echo "Not found: node_modules (already clean)"
)

echo "Removing package-lock.json..."
if exist package-lock.json (
    del /q package-lock.json
    if %errorlevel% equ 0 set /a removedCount+=1
) else (
    echo "Not found: package-lock.json (already clean)"
)

echo.
echo "----- Uninstall complete -----"
echo "%removedCount% item(s) removed."
echo "Run installer.cmd to restore these files."

exit /b 0