# 2501 AI Autonomous Systems Windows Installer
# PowerShell Script

Write-Host "-----2501 AI Autonomous Systems INSTALLER-------" -ForegroundColor Cyan

try {
    # Try to install fnm using Winget (built into Windows 10/11)
    Write-Host "Installing fnm (Fast Node Manager) using Winget..." -ForegroundColor Yellow
    
    $wingetResult = winget install Schniz.fnm --accept-source-agreements --accept-package-agreements 2>$null
    
    # Check if fnm is available or if it was already installed
    $alreadyInstalled = $wingetResult -match "Found an existing package already installed"
    $successfullyInstalled = $wingetResult -match "Successfully installed"

    if ($alreadyInstalled -or $successfullyInstalled) {
        Write-Host "fnm is available!" -ForegroundColor Green
        
        # Refresh PATH to make fnm available in current session
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        
        # Verify fnm is now available
        $fnmExists = Get-Command fnm -ErrorAction SilentlyContinue
        if (-not $fnmExists) {
            Write-Host "Note: You need to restart your PowerShell session for fnm to be available." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Winget installation failed, trying alternative installation..." -ForegroundColor Yellow
        
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
    & fnm env --shell powershell | Invoke-Expression
    
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
        Write-Host "Installing @2501-ai/cli..." -ForegroundColor Yellow
        & npm install -g "@2501-ai/cli@alpha-windows"
        
        if ($LASTEXITCODE -eq 0) {
            # Get npm global prefix and add to PATH
            $npmGlobalPrefix = & npm config get prefix
            $npmGlobalBin = "$npmGlobalPrefix\node_modules\.bin"
            
            # Add to both current session and user PATH
            $env:PATH = "$npmGlobalBin;$env:PATH"
            $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
            if ($userPath -notlike "*$npmGlobalBin*") {
                [System.Environment]::SetEnvironmentVariable("PATH", "$npmGlobalBin;$userPath", "User")
            }
            
            # Wait a moment for PATH to update
            Start-Sleep -Seconds 2
            
            # Verify a2501 command is available
            $a2501Exists = Get-Command a2501 -ErrorAction SilentlyContinue
            if ($a2501Exists) {
                $cliVersion = & a2501 --version 2>$null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "@2501-ai/cli version: $cliVersion" -ForegroundColor Green
                }
            } else {
                Write-Host "Warning: a2501 command not found. Please restart your PowerShell session and try again." -ForegroundColor Yellow
                Write-Host "If the issue persists, try running: npm install -g @2501-ai/cli" -ForegroundColor Yellow
            }
        }
    }
    
    # Set up PowerShell profile for permanent fnm access
    Write-Host "Setting up PowerShell profile for permanent access..." -ForegroundColor Yellow
    if (!(Test-Path -Path $PROFILE)) { 
        New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    }
    $profileContent = Get-Content -Path $PROFILE -ErrorAction SilentlyContinue
    if ($profileContent -notcontains "fnm env --shell powershell | Invoke-Expression") {
        Add-Content -Path $PROFILE -Value "fnm env --shell powershell | Invoke-Expression"
        Write-Host "Added fnm to PowerShell profile" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Installation completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Restart your PowerShell session" -ForegroundColor White
    Write-Host "2. Set your API key: a2501 set api_key <YOUR_API_KEY>" -ForegroundColor White
    Write-Host "3. Get help: a2501 --help" -ForegroundColor White
    Write-Host ""
    Write-Host "Happy nerding! 🚀" -ForegroundColor Magenta
}
catch {
    Write-Host "An error occurred during installation: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please try installing fnm manually:" -ForegroundColor Red
    Write-Host "1. Download from: https://github.com/Schniz/fnm/releases" -ForegroundColor White
    Write-Host "2. Or use: winget install Schniz.fnm" -ForegroundColor White
    Write-Host "3. Or use: choco install fnm" -ForegroundColor White
} 