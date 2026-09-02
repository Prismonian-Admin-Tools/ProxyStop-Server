#!/bin/bash

echo "----- ProxyStop Server Setup Wizard -----"
echo "Please select an option:"
echo "[1] Guided Installation (recommended)"
echo "[2] I already have an 'installer.json' file"
echo "[3] Quit the installer"

read -p "Enter your choice: " choice

if [[ "$choice" == "1" ]]; then
    bash ./installFiles/guided-install.sh
elif [[ "$choice" == "2" ]]; then
    if [[ -f "installer.json" ]]; then
        echo "installer.json found."
    else
        echo "Error: Installer.json file not found. Is it in the same folder as the installer?"
        echo "Process exited with exit code 2."
        exit 2
    fi
    
elif [[ "$choice" == "3" ]]; then
    echo "Exiting the installer."
    echo "Process exited with exit code 0."
    exit 0
else
    echo "Invalid choice. Please run the installer again and select a valid option."
    echo "Process exited with exit code 1."
    exit 1
fi