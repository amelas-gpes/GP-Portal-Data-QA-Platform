<#
================================================================================
 update-everything.ps1
 One-shot updater for this PC. Covers:
   1. Windows Update            (installs updates, NEVER auto-restarts)
   2. Desktop apps via winget
   3. Microsoft Store apps
   4. Python packages           (upgrades pip + ALL outdated packages,
                                 for every Python install found)
   5. npm / Chocolatey / Scoop  (only if installed)

 HOW TO RUN (as Administrator):
   1. Start menu -> type "PowerShell" -> right-click -> Run as administrator
   2. Paste:  powershell -ExecutionPolicy Bypass -File "<full path to this file>"
      (Tip: drag this file into the PowerShell window to paste its path.)

 A full log is written next to this script. Nothing here restarts the PC;
 the summary tells you if a restart is pending.
================================================================================
#>

$ErrorActionPreference = 'Continue'
$failures = New-Object System.Collections.Generic.List[string]

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$logPath = Join-Path $scriptDir ("update-log_{0:yyyy-MM-dd_HHmm}.txt" -f (Get-Date))
try { Start-Transcript -Path $logPath | Out-Null } catch { }

function Write-Section($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Note-OK($t)   { Write-Host "[OK]     $t" -ForegroundColor Green }
function Note-Fail($t) { $failures.Add($t); Write-Host "[FAILED] $t" -ForegroundColor Red }

# --------------------------------------------------------------- elevation ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "WARNING: not running as Administrator." -ForegroundColor Yellow
    Write-Host "Windows Update and some app upgrades will fail without it." -ForegroundColor Yellow
    $answer = Read-Host "Continue anyway? (y/N)"
    if ($answer -notmatch '^[Yy]') { try { Stop-Transcript | Out-Null } catch { }; exit 1 }
}

# ----------------------------------------------------- 1. Windows Update -----
Write-Section "1/5 Windows Update"
try {
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if (-not (Get-Module -ListAvailable -Name PSWindowsUpdate)) {
        Write-Host "Installing the PSWindowsUpdate module (one-time, from the official PowerShell Gallery)..."
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ErrorAction Stop | Out-Null
        Install-Module PSWindowsUpdate -Force -Scope CurrentUser -AllowClobber -ErrorAction Stop
    }
    Import-Module PSWindowsUpdate -ErrorAction Stop
    $updates = @(Get-WindowsUpdate -ErrorAction Stop)
    if ($updates.Count -gt 0) {
        Write-Host ("Found {0} Windows update(s):" -f $updates.Count)
        $updates | ForEach-Object { Write-Host ("  - " + $_.Title) }
        Write-Host "Installing (this can take a while; the PC will NOT restart by itself)..."
        Install-WindowsUpdate -AcceptAll -IgnoreReboot -ErrorAction Stop | Out-Host
        Note-OK "Windows updates installed"
    } else {
        Note-OK "Windows is already up to date"
    }
} catch {
    Note-Fail ("Windows Update via PowerShell: " + $_.Exception.Message)
    Write-Host "Opening Settings > Windows Update so you can run it manually..." -ForegroundColor Yellow
    Start-Process "ms-settings:windowsupdate"
}

# ------------------------------------------------- 2. Desktop apps (winget) --
Write-Section "2/5 Desktop apps (winget)"
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Apps with available upgrades:"
    winget upgrade --include-unknown
    Write-Host ""
    winget upgrade --all --silent --include-unknown --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
        Note-OK "winget app upgrades complete"
    } else {
        Note-Fail "winget finished with exit code $LASTEXITCODE - some apps may have been skipped (see output above)"
    }
} else {
    Note-Fail "winget not found (install 'App Installer' from the Microsoft Store, then re-run)"
}

# ----------------------------------------------- 3. Microsoft Store apps -----
Write-Section "3/5 Microsoft Store apps"
try {
    Get-CimInstance -Namespace "Root\cimv2\mdm\dmmap" `
        -ClassName "MDM_EnterpriseModernAppManagement_AppManagement01" -ErrorAction Stop |
        Invoke-CimMethod -MethodName UpdateScanMethod -ErrorAction Stop | Out-Null
    Note-OK "Store update scan triggered (apps update in the background)"
} catch {
    Note-Fail "Could not trigger Store updates automatically"
    Write-Host "Opening the Store's update page - click 'Get updates' there." -ForegroundColor Yellow
    Start-Process "ms-windows-store://downloadsandupdates"
}

# ------------------------------------------------- 4. Python packages --------
Write-Section "4/5 Python packages (upgrade ALL outdated)"
$pythons = @()
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythons = @(& py -0p 2>$null | ForEach-Object {
        if ($_ -match '([A-Za-z]:\\\S[^\r\n]*python\.exe)') { $Matches[1].Trim() }
    } | Where-Object { $_ } | Select-Object -Unique)
}
if ($pythons.Count -eq 0 -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $cand = (Get-Command python).Source
    # Skip the Microsoft Store alias stub, which is not a real install
    if ($cand -and $cand -notmatch '\\WindowsApps\\python\.exe$') { $pythons = @($cand) }
}

if ($pythons.Count -eq 0) {
    Note-Fail "No Python installation found (nothing to upgrade)"
} else {
    foreach ($py in $pythons) {
        Write-Host ""
        Write-Host ("--- Python at: " + $py) -ForegroundColor Yellow
        & $py -m pip install --quiet --upgrade pip setuptools wheel
        if ($LASTEXITCODE -ne 0) { Note-Fail "pip/setuptools/wheel upgrade ($py)" }
        else { Note-OK "pip, setuptools, wheel upgraded" }

        $json = (& $py -m pip list --outdated --format=json 2>$null) -join ""
        $outdated = @()
        if ($json -and $json.Trim()) {
            try { $outdated = @($json | ConvertFrom-Json) } catch { Note-Fail "Could not read outdated-package list ($py)" }
        }
        $outdated = @($outdated | Where-Object { $_.name -notin @('pip','setuptools','wheel') })

        if ($outdated.Count -eq 0) {
            Note-OK "All packages already current for this Python"
            continue
        }
        Write-Host ("{0} outdated package(s): {1}" -f $outdated.Count, (($outdated | ForEach-Object { $_.name }) -join ', '))
        foreach ($pkg in $outdated) {
            & $py -m pip install --quiet --upgrade $pkg.name
            if ($LASTEXITCODE -eq 0) {
                Note-OK ("{0}  {1} -> {2}" -f $pkg.name, $pkg.version, $pkg.latest_version)
            } else {
                Note-Fail ("pip upgrade {0} ({1})" -f $pkg.name, $py)
            }
        }
    }
}
if (Get-Command conda -ErrorAction SilentlyContinue) {
    Write-Host "NOTE: conda detected. Conda environments were NOT touched (pip-upgrading them can corrupt them)." -ForegroundColor Yellow
    Write-Host "      Update those separately with: conda update --all" -ForegroundColor Yellow
}

# --------------------------------------- 5. Other package managers (if any) --
Write-Section "5/5 Other package managers (only if installed)"
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install -g npm 2>&1 | Out-Host
    npm update -g 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { Note-OK "npm global packages updated" } else { Note-Fail "npm global update" }
} else { Write-Host "npm: not installed - skipped" }

if (Get-Command choco -ErrorAction SilentlyContinue) {
    choco upgrade all -y
    if ($LASTEXITCODE -eq 0) { Note-OK "Chocolatey packages updated" } else { Note-Fail "Chocolatey upgrade" }
} else { Write-Host "Chocolatey: not installed - skipped" }

if (Get-Command scoop -ErrorAction SilentlyContinue) {
    scoop update *
    Note-OK "Scoop apps updated"
} else { Write-Host "Scoop: not installed - skipped" }

# ------------------------------------------------------------- summary -------
Write-Section "Summary"
$rebootPending = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or
                 (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')

if ($failures.Count -eq 0) {
    Write-Host "Everything completed without errors." -ForegroundColor Green
} else {
    Write-Host ("{0} item(s) need attention:" -f $failures.Count) -ForegroundColor Yellow
    $failures | ForEach-Object { Write-Host ("  - " + $_) -ForegroundColor Yellow }
}
if ($rebootPending) {
    Write-Host ""
    Write-Host "A RESTART IS PENDING. Restart the PC when convenient to finish Windows updates." -ForegroundColor Yellow
} else {
    Write-Host "No restart is currently pending."
}
Write-Host ""
Write-Host ("Full log saved to: " + $logPath)
try { Stop-Transcript | Out-Null } catch { }
Read-Host "Done. Press Enter to close"
