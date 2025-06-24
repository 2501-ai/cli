#!/bin/bash

set -e

echo "
░▒▓███████▓▒░░▒▓████████▓▒░▒▓████████▓▒░  ░▒▓█▓▒░
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░▒▓████▓▒░
       ░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░
 ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░
░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░
░▒▓█▓▒░             ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░  ░▒▓█▓▒░
░▒▓████████▓▒░▒▓███████▓▒░░▒▓████████▓▒░  ░▒▓█▓▒░

---- AI Autonomous Systems INSTALLER ----"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Homebrew
install_homebrew() {
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
}

# Function to install Node.js and npm using Homebrew
install_nodejs() {
    echo "Installing Node.js and npm..."
    brew install node
}

# Function to install @2501
install_2501_cli() {
    echo "Installing @2501..."
    npm install -g @2501-ai/cli@latest
}

# Check if Homebrew is installed
if command_exists brew; then
    echo "Homebrew is already installed."
else
    install_homebrew
fi

# Check if Node.js and npm are already installed
if command_exists node && command_exists npm; then
    echo "Node.js and npm are already installed."
    node --version
    npm --version
else
    install_nodejs
fi

# Verify Node.js and npm installation
if command_exists node && command_exists npm; then
    echo "Node.js and npm have been successfully installed:"
    node --version
    npm --version
else
    echo "Error: Failed to install Node.js and npm. Please check your internet connection and try again."
    exit 1
fi

# Check if @2501 is already installed
if command_exists @2501; then
    echo "@2501 is already installed."
    @2501 --version
else
    install_2501_cli
fi

# Verify @2501 installation
if command_exists @2501; then
    echo "@2501 has been successfully installed:"
    @2501 --version
else
    echo "Error: Failed to install @2501. Please check your internet connection and try again."
    exit 1
fi

echo "

--- Installation complete ! ---

You can now use the @2501 CLI to interact with AI Autonomous Systems.
Note : you may need to restart your shell to see changes.

!!! Don't forget to set 1st your API key using:
==> @2501 set api_key <API_KEY>

Usage:
==> @2501 --help
==> @2501 show me the top 3 process on the machine


Please refer to the documentation at docs.2501.ai for more information.
Happy nerding! 🚀"
