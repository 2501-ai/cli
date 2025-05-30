# 2501 AI Autonomous Systems Windows Installer
# PowerShell Script

param(
    [string]$NodeVersion = "20.0.0"
)

Write-Host "-----2501 AI Autonomous Systems INSTALLER-------" -ForegroundColor Cyan

try {
    # Check if fnm is already installed
    $fnmExists = Get-Command fnm -ErrorAction SilentlyContinue
    
    if (-not $fnmExists) {
        Write-Host "Installing fnm (Fast Node Manager)..." -ForegroundColor Yellow
        
        # Download and install fnm
        $fnmInstallScript = Invoke-WebRequest -Uri "https://fnm.vercel.app/install" -UseBasicParsing
        Invoke-Expression $fnmInstallScript.Content
        
        # Refresh PATH for current session
        $env:PATH = "$env:USERPROFILE\.fnm;$env:PATH"
    }
    else {
        Write-Host "fnm is already installed." -ForegroundColor Green
    }

    # Install and use the specified Node.js version
    Write-Host "Installing Node.js $NodeVersion using fnm..." -ForegroundColor Yellow
    & fnm install $NodeVersion
    & fnm use $NodeVersion
    
    # Add fnm to current session PATH
    $env:PATH = "$env:USERPROFILE\.fnm\node-versions\v$NodeVersion\installation;$env:PATH"
    
    # Verify Node.js installation
    Write-Host "Verifying Node.js and npm installation..." -ForegroundColor Yellow
    
    $nodeVersion = & node -v 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js installation failed. Please check if fnm installed correctly."
    }
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    
    $npmVersion = & npm -v 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "npm installation failed."
    }
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
    
    # Install @2501-ai/cli globally
    Write-Host "Installing @2501-ai/cli..." -ForegroundColor Yellow
    & npm install -g @2501-ai/cli
    
    if ($LASTEXITCODE -ne 0) {
        throw "@2501-ai/cli installation failed."
    }
    
    # Verify @2501-ai/cli installation
    Write-Host "Verifying @2501-ai/cli installation..." -ForegroundColor Yellow
    $cliVersion = & @2501 --version 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        throw "@2501-ai/cli verification failed. The package was installed but may not be in PATH."
    }
    
    Write-Host "@2501-ai/cli version: $cliVersion" -ForegroundColor Green
    Write-Host "Installation completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Restart your PowerShell/Command Prompt" -ForegroundColor White
    Write-Host "2. Set your API key: @2501 set api-key <YOUR_API_KEY>" -ForegroundColor White
    Write-Host "3. Get help: @2501 --help" -ForegroundColor White
    Write-Host ""
    Write-Host "Happy nerding! 🚀" -ForegroundColor Magenta
}
catch {
    Write-Host "An error occurred during installation: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check the error above and try again, or contact support." -ForegroundColor Red
    exit 1
} 