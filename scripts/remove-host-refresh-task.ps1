param(
  [string]$TaskName = "MCP Home Host Refresh"
)

$ErrorActionPreference = "Stop"

Write-Host "Removing scheduled task '$TaskName' if it exists."

& schtasks.exe /Delete /TN $TaskName /F | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "schtasks.exe failed with exit code $LASTEXITCODE while deleting '$TaskName'."
}

Write-Host "Scheduled task removed."
