# QuestCord v3 Control Menu
# PowerShell script to manage bot and webserver

# Set console encoding to UTF-8 for proper character display
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Color functions
function Write-ColorText {
    param(
        [string]$Text,
        [string]$Color = "White"
    )
    Write-Host $Text -ForegroundColor $Color
}

function Write-Header {
    Clear-Host
    Write-ColorText "╔═══════════════════════════════════════════════════╗" "Cyan"
    Write-ColorText "║           QuestCord v3 Control Menu               ║" "Cyan"
    Write-ColorText "╚═══════════════════════════════════════════════════╝" "Cyan"
    Write-Host ""
}

function Get-QuestCordProcesses {
    $processes = @()
    try {
        $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -like "*QuestCord*" -or
            $_.CommandLine -like "*start.js*" -or
            $_.CommandLine -like "*src\index.js*" -or
            $_.CommandLine -like "*src/index.js*" -or
            $_.CommandLine -like "*src\web\server.js*" -or
            $_.CommandLine -like "*src/web/server.js*" -or
            $_.CommandLine -like "*src\bot*" -or
            $_.CommandLine -like "*src/bot*"
        }
    } catch {
        # Ignore errors
    }
    return $processes
}

function Show-Status {
    Write-ColorText "`n[STATUS CHECK]" "Yellow"

    $processes = Get-QuestCordProcesses

    if ($processes) {
        Write-ColorText "✓ QuestCord is RUNNING ($($processes.Count) process(es))" "Green"
        foreach ($proc in $processes) {
            Write-ColorText "  → PID: $($proc.Id)" "Gray"
        }
    } else {
        Write-ColorText "✗ QuestCord is NOT running" "Red"
    }
    Write-Host ""
}

function Start-QuestCord {
    Write-Header
    Write-ColorText "[STARTING QUESTCORD]" "Cyan"
    Write-Host ""

    # Check if already running
    $processes = Get-QuestCordProcesses
    if ($processes) {
        Write-ColorText "⚠ QuestCord is already running!" "Yellow"
        Write-ColorText "Please stop it first before starting again." "Yellow"
        Write-Host ""
        Write-ColorText "Press any key to return to menu..." "Gray"
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    Write-ColorText "Starting QuestCord bot and webserver..." "Green"
    Write-Host ""

    # Start in a new window so it runs in background
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "node start.js" -WindowStyle Normal

    Start-Sleep -Seconds 2

    Write-ColorText "✓ QuestCord started successfully!" "Green"
    Write-ColorText "  Check the new window for logs" "Gray"
    Write-Host ""
    Write-ColorText "Press any key to return to menu..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Stop-QuestCord {
    Write-Header
    Write-ColorText "[STOPPING QUESTCORD]" "Cyan"
    Write-Host ""

    # Check if running
    $processes = Get-QuestCordProcesses
    if (-not $processes) {
        Write-ColorText "⚠ QuestCord is not running!" "Yellow"
        Write-Host ""
        Write-ColorText "Press any key to return to menu..." "Gray"
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    Write-ColorText "Stopping QuestCord..." "Yellow"

    # Run stop.js
    node stop.js

    Start-Sleep -Seconds 1

    Write-ColorText "`n✓ QuestCord stopped successfully!" "Green"
    Write-Host ""
    Write-ColorText "Press any key to return to menu..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Restart-QuestCord {
    Write-Header
    Write-ColorText "[RESTARTING QUESTCORD]" "Cyan"
    Write-Host ""

    Write-ColorText "Step 1: Stopping QuestCord..." "Yellow"
    node stop.js

    Start-Sleep -Seconds 2

    Write-ColorText "`nStep 2: Starting QuestCord..." "Green"
    Write-Host ""

    # Start in a new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "node start.js" -WindowStyle Normal

    Start-Sleep -Seconds 2

    Write-ColorText "`n✓ QuestCord restarted successfully!" "Green"
    Write-ColorText "  Check the new window for logs" "Gray"
    Write-Host ""
    Write-ColorText "Press any key to return to menu..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-Logs {
    Write-Header
    Write-ColorText "[VIEW LOGS]" "Cyan"
    Write-Host ""

    $logsDir = Join-Path $PSScriptRoot "logs"

    if (-not (Test-Path $logsDir)) {
        Write-ColorText "⚠ No logs directory found" "Yellow"
        Write-Host ""
        Write-ColorText "Press any key to return to menu..." "Gray"
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    $logFiles = Get-ChildItem -Path $logsDir -Filter "*.log" | Sort-Object LastWriteTime -Descending

    if ($logFiles.Count -eq 0) {
        Write-ColorText "⚠ No log files found" "Yellow"
        Write-Host ""
        Write-ColorText "Press any key to return to menu..." "Gray"
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }

    Write-ColorText "Available log files:" "Green"
    for ($i = 0; $i -lt $logFiles.Count; $i++) {
        $file = $logFiles[$i]
        Write-Host "  [$($i + 1)] $($file.Name) - $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    }

    Write-Host ""
    Write-ColorText "Enter number to view (or press Enter to return): " "Yellow" -NoNewline
    $choice = Read-Host

    if ($choice -match '^\d+$' -and [int]$choice -ge 1 -and [int]$choice -le $logFiles.Count) {
        $selectedFile = $logFiles[[int]$choice - 1]
        Write-Host ""
        Write-ColorText "Viewing: $($selectedFile.Name)" "Cyan"
        Write-ColorText "═══════════════════════════════════════════════════" "Cyan"
        Get-Content -Path $selectedFile.FullName -Tail 50
        Write-Host ""
        Write-ColorText "Press any key to return to menu..." "Gray"
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}

function Install-Dependencies {
    Write-Header
    Write-ColorText "[INSTALL DEPENDENCIES]" "Cyan"
    Write-Host ""

    Write-ColorText "Installing npm dependencies..." "Yellow"
    npm install

    Write-Host ""
    Write-ColorText "✓ Dependencies installed!" "Green"
    Write-Host ""
    Write-ColorText "Press any key to return to menu..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Deploy-Commands {
    Write-Header
    Write-ColorText "[DEPLOY DISCORD COMMANDS]" "Cyan"
    Write-Host ""

    Write-ColorText "Deploying Discord slash commands..." "Yellow"
    node src/bot/deploy-commands.js

    Write-Host ""
    Write-ColorText "✓ Commands deployed!" "Green"
    Write-Host ""
    Write-ColorText "Press any key to return to menu..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-Menu {
    Write-Header
    Show-Status

    Write-ColorText "MAIN MENU" "Cyan"
    Write-ColorText "═══════════════════════════════════════════════════" "Cyan"
    Write-Host "  [1] Start Bot and Webserver"
    Write-Host "  [2] Stop Bot and Webserver"
    Write-Host "  [3] Restart Bot and Webserver"
    Write-Host "  [4] View Logs"
    Write-Host "  [5] Install Dependencies"
    Write-Host "  [6] Deploy Discord Commands"
    Write-Host "  [0] Exit"
    Write-ColorText "═══════════════════════════════════════════════════" "Cyan"
    Write-Host ""
    Write-ColorText "Select an option: " "Yellow" -NoNewline
}

# Main loop
while ($true) {
    Show-Menu
    $choice = Read-Host

    switch ($choice) {
        "1" { Start-QuestCord }
        "2" { Stop-QuestCord }
        "3" { Restart-QuestCord }
        "4" { Show-Logs }
        "5" { Install-Dependencies }
        "6" { Deploy-Commands }
        "0" {
            Write-Header
            Write-ColorText "Goodbye!" "Green"
            Write-Host ""
            exit
        }
        default {
            Write-ColorText "`n⚠ Invalid option. Please try again." "Red"
            Start-Sleep -Seconds 1
        }
    }
}
