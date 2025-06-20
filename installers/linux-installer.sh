#!/bin/bash
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

# Function to install NVM
install_nvm() {
    echo "Installing NVM..."
    if command_exists curl; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    elif command_exists wget; then
        wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    else
        echo "Error: Neither curl nor wget is installed. Please install one of them and try again."
        exit 1
    fi

    # Load NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
}

# Function to install Node.js and npm using NVM
install_nodejs() {
    echo "Installing Node.js and npm using NVM..."
    if command_exists nvm; then
        nvm install 20 || nvm install node # Install Node.js v20 or the latest stable version
        nvm use 20 || nvm use node # Use Node.js v20 or the latest stable version
    else
        echo "Error: NVM is not installed. Please check your installation and try again."
        exit 1
    fi
}

# Function to install @2501
install_2501_cli() {
    echo "Installing @2501..."
    npm install -g @2501-ai/cli@latest
}

# Install NVM if not already installed
if ! command_exists nvm; then
    install_nvm
fi

# Check if Node.js and npm are already installed
if command_exists node && command_exists npm; then
    echo "Node.js and npm are already installed."
    node -v
    npm -v
else
    install_nodejs
fi

# Verify Node.js and npm installation
if command_exists node && command_exists npm; then
    echo "Node.js and npm have been successfully installed:"
    node -v
    npm -v
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
    echo "@2501 has been successfully installed on version :"
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
