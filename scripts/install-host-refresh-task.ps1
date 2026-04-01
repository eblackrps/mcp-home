param(
  [int]$IntervalMinutes = 30,
  [string]$TaskName = "MCP Home Host Refresh"
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 5 -or $IntervalMinutes -gt 1440) {
  throw "IntervalMinutes must be between 5 and 1440."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$refreshScriptPath = Join-Path $PSScriptRoot "refresh-windows-host.ps1"

if (-not (Test-Path $refreshScriptPath)) {
  throw "Refresh script not found at $refreshScriptPath"
}

$startTime = (Get-Date).AddMinutes(1).ToString("HH:mm")
$escapedScript = $refreshScriptPath.Replace('"', '""')
$taskCommand = "powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""$escapedScript"""

$arguments = @(
  "/Create"
  "/TN", $TaskName
  "/SC", "MINUTE"
  "/MO", [string]$IntervalMinutes
  "/ST", $startTime
  "/TR", $taskCommand
  "/F"
)

Write-Host "Registering scheduled task '$TaskName' to refresh host data every $IntervalMinutes minutes."
Write-Host "Command: $taskCommand"

$null = & schtasks.exe @arguments
if ($LASTEXITCODE -ne 0) {
  throw "schtasks.exe failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Scheduled task created."
Write-Host "To remove it later, run:"
Write-Host "  npm run unschedule:host-refresh"
