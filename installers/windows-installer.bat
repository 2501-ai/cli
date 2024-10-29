@echo off
setlocal enabledelayedexpansion

REM Set Node.js version
set NODE_VERSION=20.0.0

echo -----2501 AI Autonomous Systems INSTALLER-------

REM Install fnm (Fast Node Manager)
echo Installing fnm...
powershell -Command "iwr -useb https://fnm.vercel.app/install | iex"

REM Refresh environment variables
call refreshenv

REM Install and use the specified Node.js version
echo Installing Node.js %NODE_VERSION% using fnm...
call fnm install %NODE_VERSION%
call fnm use %NODE_VERSION%

REM Add Node.js to PATH
set "PATH=%PATH%;%USERPROFILE%\.fnm\node-versions\v%NODE_VERSION%\installation\bin"

REM Verify installation
echo Verifying Node.js and npm installation...
call node -v
if %errorlevel% neq 0 (
    echo Node.js installation failed.
    goto :error
)

call npm -v
if %errorlevel% neq 0 (
    echo npm installation failed.
    goto :error
)

REM Install @2501-ai/cli globally
echo Installing @2501-ai/cli...
call npm install -g @2501-ai/cli

REM Verify @2501-ai/cli installation
echo Verifying @2501-ai/cli installation...
call @2501 --version
if %errorlevel% neq 0 (
    echo @2501-ai/cli installation failed.
    goto :error
)

echo Installation complete.
goto :end

:error
echo An error occurred during installation.
pause
exit /b 1

:end
echo Press any key to exit...
pause >nul
exit /b 0
