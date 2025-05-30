# 2501 AI Autonomous Systems Windows Installer
# PowerShell Script

Write-Host "-----2501 AI Autonomous Systems INSTALLER-------" -ForegroundColor Cyan

try {
    # Try to install fnm using Winget (built into Windows 10/11)
    Write-Host "Installing fnm (Fast Node Manager) using Winget..." -ForegroundColor Yellow
    
    $wingetResult = winget install Schniz.fnm --accept-source-agreements --accept-package-agreements 2>$null
    
    Write-Host "Winget result: $wingetResult" -ForegroundColor Yellow
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "fnm installed successfully via Winget!" -ForegroundColor Green
    } else {
        Write-Host "Winget failed, trying alternative installation..." -ForegroundColor Yellow
        
        # Fallback: Try Chocolatey if it's available
        if (Get-Command choco -ErrorAction SilentlyContinue) {
            Write-Host "Installing fnm using Chocolatey..." -ForegroundColor Yellow
            choco install fnm -y
            if ($LASTEXITCODE -ne 0) {
                throw "Chocolatey installation failed"
            }
        } else {
            throw "Neither Winget nor Chocolatey are available. Please install fnm manually from: https://github.com/Schniz/fnm/releases"
        }
    }
    
    # Refresh environment variables
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    
    # Verify fnm installation
    Write-Host "Verifying fnm installation..." -ForegroundColor Yellow
    $fnmVersion = & fnm --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Please restart your PowerShell session and try: fnm --version" -ForegroundColor Yellow
    } else {
        Write-Host "fnm version: $fnmVersion" -ForegroundColor Green
    }
    
    # Install Node.js LTS
    Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
    & fnm install --lts 2>$null
    & fnm use lts-latest 2>$null
    
    # Set up fnm environment properly for current session
    Write-Host "Setting up fnm environment..." -ForegroundColor Yellow
    $fnmEnv = & fnm env --use-on-cd --shell powershell
    Invoke-Expression $fnmEnv
    
    # Wait a moment for environment to be set up
    Start-Sleep -Seconds 2
    
    # Get the fnm directory and add it to PATH manually
    $fnmDir = [System.Environment]::GetEnvironmentVariable("FNM_DIR", "User")
    if (-not $fnmDir) {
        $fnmDir = "$env:USERPROFILE\AppData\Roaming\fnm"
    }
    
    # Find the active Node.js path and add it to current session PATH
    $activePath = & fnm current 2>$null
    if ($activePath) {
        $nodePath = "$fnmDir\node-versions\v$activePath\installation"
        $env:PATH = "$nodePath;$env:PATH"
        Write-Host "Added Node.js path to current session: $nodePath" -ForegroundColor Green
    }
    
    # Verify Node installation
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
        
        # Install 2501-ai/cli
        Write-Host "Installing 2501-ai/cli..." -ForegroundColor Yellow
        & npm install -g 2501-ai/cli
        
        if ($LASTEXITCODE -eq 0) {
            $cliVersion = & 2501 --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "2501-ai/cli version: $cliVersion" -ForegroundColor Green
            }
        }
    }
    
    Write-Host ""
    Write-Host "Installation completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Restart your PowerShell session" -ForegroundColor White
    Write-Host "2. Add to your PowerShell profile: fnm env --use-on-cd | Out-String | Invoke-Expression" -ForegroundColor White
    Write-Host "3. Set your API key: 2501 set api_key <YOUR_API_KEY>" -ForegroundColor White
    Write-Host "4. Get help: 2501 --help" -ForegroundColor White
    Write-Host ""
    Write-Host "Happy nerding! 🚀" -ForegroundColor Magenta
}
catch {
    Write-Host "An error occurred during installation: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please try installing fnm manually:" -ForegroundColor Red
    Write-Host "1. Download from: https://github.com/Schniz/fnm/releases" -ForegroundColor White
    Write-Host "2. Or use: winget install Schniz.fnm" -ForegroundColor White
    Write-Host "3. Or use: choco install fnm" -ForegroundColor White
    exit 1
} 