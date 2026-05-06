param(
  [string]$Prefix = $(Join-Path $env:USERPROFILE ".pinchy"),
  [string]$Package = $(if ($env:PINCHY_INSTALL_PACKAGE) { $env:PINCHY_INSTALL_PACKAGE } else { "pinchy-dev@latest" }),
  [switch]$UpdatePath,
  [switch]$NoDoctor,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-PinchyLog {
  param([string]$Message)
  Write-Host "[pinchy-install] $Message"
}

function Invoke-PinchyCommand {
  param(
    [string]$Command,
    [string[]]$Arguments
  )
  Write-PinchyLog "$Command $($Arguments -join ' ')"
  if (-not $DryRun) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Command $($Arguments -join ' ')"
    }
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node 22.14+ or Node 24, then rerun this installer."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required but was not found on PATH."
}

$PinchyBinDir = Join-Path $Prefix "bin"
$PinchyCli = Join-Path $PinchyBinDir "pinchy.cmd"

Write-PinchyLog "Installing $Package into $Prefix"
if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $Prefix | Out-Null
}
Invoke-PinchyCommand "npm" @("install", "--global", "--prefix", $Prefix, $Package)

if ((-not $DryRun) -and (-not (Test-Path $PinchyCli))) {
  throw "Expected Pinchy CLI was not created: $PinchyCli"
}

$PathEntries = ($env:PATH -split [IO.Path]::PathSeparator) | Where-Object { $_ }
if ($PathEntries -contains $PinchyBinDir) {
  Write-PinchyLog "Pinchy bin directory is already on PATH: $PinchyBinDir"
} else {
  Write-PinchyLog "Pinchy installed, but your shell may not find the pinchy command yet."
  Write-PinchyLog "For this terminal: `$env:PATH = `"$PinchyBinDir;$env:PATH`""
  Write-PinchyLog "To persist it, rerun this installer with -UpdatePath."
  if ($UpdatePath) {
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrWhiteSpace($UserPath)) {
      $NewPath = $PinchyBinDir
    } elseif (($UserPath -split [IO.Path]::PathSeparator) -contains $PinchyBinDir) {
      $NewPath = $UserPath
    } else {
      $NewPath = "$PinchyBinDir$([IO.Path]::PathSeparator)$UserPath"
    }
    if (-not $DryRun) {
      [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    }
    Write-PinchyLog "Updated the user PATH. Open a new terminal before running pinchy by name."
  }
}

if (-not $DryRun) {
  & $PinchyCli version
  if (-not $NoDoctor) {
    Write-PinchyLog "Running pinchy doctor in the current directory."
    & $PinchyCli doctor
  }
}

Write-PinchyLog "Install complete. Next steps:"
Write-PinchyLog "  cd C:\path\to\your\repo"
Write-PinchyLog "  pinchy init"
Write-PinchyLog "  pinchy setup"
Write-PinchyLog "  pinchy up"
