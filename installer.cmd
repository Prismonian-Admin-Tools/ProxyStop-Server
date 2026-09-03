@echo off
setlocal

echo "----- ProxyStop Server Installer -----"
echo "Chose an option:"
echo "[1] Guided install (Reccomended)"
echo "[2] Use installer.ini file"
echo "[3] Exit the installer"

set /p option="Enter your choice (1, 2, or 3): "

echo "Checking for required dependencies..."

set dependencyCount=0

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo "Error: Node.js and npm are required to run this installer."
    exit /b 1
)
if %errorlevel% equ 0 (
    echo "Node.js and npm are installed."
    set /a dependencyCount+=1
)


if %option%==1(
    echo "Starting guided install..."
    :: Code for the guided install goes here.
) else if %option%==2 (
    where installer.json >nul 2>&1
    if %errorlevel% neq 0 (
        echo "Error: installer.json file not found."
        echo "Is it in the same directory as installer.cmd?"
        exit /b 1
    )
    :: Code for the installer.json code
    echo "Parsing installer.json file..."

) else if %option%==3 (
    echo "Exiting the installer."
    exit /b 0
) else (
    echo "Invalid option. Please run the installer again and choose a valid option."
    exit /b 1
)

echo "Installing ProxyStop Server..."


:: Add additional dependency checks here.



mkdir fingerprints
npm install
