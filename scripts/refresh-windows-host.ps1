$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dataDir = Join-Path $repoRoot "data\local"
$hostStatusPath = Join-Path $dataDir "windows-host-status.json"
$plexIndexPath = Join-Path $dataDir "plex-library-index.json"
$pythonScriptPath = Join-Path $PSScriptRoot "export-plex-library.py"

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

function Get-IsoNow {
  return (Get-Date).ToString("o")
}

function Convert-ServiceState {
  param([string[]]$Names)

  $states = @()
  foreach ($name in $Names) {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($null -ne $service) {
      $states += [ordered]@{
        name = $service.Name
        status = $service.Status.ToString()
      }
    }
  }

  return $states
}

function Get-ProcessNames {
  param([string[]]$Names)

  $processes = foreach ($name in $Names) {
    Get-Process -Name $name -ErrorAction SilentlyContinue
  }

  return $processes | Select-Object -ExpandProperty ProcessName -Unique
}

function New-Component {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Details
  )

  return [ordered]@{
    name = $Name
    status = $Status
    details = $Details
    lastChecked = Get-IsoNow
  }
}

function Format-ServiceSummary {
  param([object[]]$Services)

  if (-not $Services -or $Services.Count -eq 0) {
    return "none"
  }

  return ($Services | ForEach-Object { "$($_.name)=$($_.status)" }) -join ", "
}

function Format-ProcessSummary {
  param([string[]]$Processes)

  if (-not $Processes -or $Processes.Count -eq 0) {
    return "none"
  }

  return ($Processes | Sort-Object) -join ", "
}

$os = Get-CimInstance Win32_OperatingSystem
$bootTime = $os.LastBootUpTime
$uptimeSpan = (Get-Date) - $bootTime
$uptimeText = "{0}d {1}h {2}m" -f [Math]::Floor($uptimeSpan.TotalDays), $uptimeSpan.Hours, $uptimeSpan.Minutes

$dockerProcesses = Get-ProcessNames -Names @("Docker Desktop", "com.docker.backend", "docker-agent", "docker-sandbox")
$dockerServices = Convert-ServiceState -Names @("com.docker.service")
$dockerRunning = $dockerProcesses.Count -gt 0
$dockerStatus = if ($dockerRunning) { "healthy" } elseif ($dockerServices.Count -gt 0) { "degraded" } else { "offline" }
$dockerDetails = "Processes: $(Format-ProcessSummary -Processes $dockerProcesses). Services: $(Format-ServiceSummary -Services $dockerServices)."
$dockerComponent = New-Component -Name "docker" -Status $dockerStatus -Details $dockerDetails

$corsairProcesses = Get-ProcessNames -Names @(
  "Corsair.Service",
  "iCUE",
  "iCUEDevicePluginHost",
  "CorsairCpuIdService",
  "CorsairDeviceControlService"
)
$corsairServices = Convert-ServiceState -Names @(
  "CorsairService",
  "CorsairCpuIdService",
  "CorsairDeviceControlService",
  "CorsairDeviceListerService",
  "iCUEUpdateService"
)
$corsairHealthy = ($corsairProcesses.Count -gt 0) -or (($corsairServices | Where-Object { $_.status -eq "Running" }).Count -gt 0)
$corsairStatus = if ($corsairHealthy) { "healthy" } elseif ($corsairServices.Count -gt 0) { "degraded" } else { "offline" }
$corsairDetails = "Processes: $(Format-ProcessSummary -Processes $corsairProcesses). Services: $(Format-ServiceSummary -Services $corsairServices)."
$corsairComponent = New-Component -Name "corsair" -Status $corsairStatus -Details $corsairDetails

$plexLocalUrl = if ($env:PLEX_LOCAL_URL) { $env:PLEX_LOCAL_URL } else { "http://127.0.0.1:32400" }
$plexDbPath = if ($env:PLEX_DB_PATH) {
  $env:PLEX_DB_PATH
} else {
  Join-Path $env:LOCALAPPDATA "Plex Media Server\Plug-in Support\Databases\com.plexapp.plugins.library.db"
}

$plexProcesses = Get-ProcessNames -Names @(
  "Plex Media Server",
  "Plex DLNA Server",
  "Plex Tuner Service",
  "Plex Update Service",
  "PlexScriptHost"
)
$plexServices = Convert-ServiceState -Names @("PlexUpdateService")
$plexIdentity = $null

try {
  $plexIdentity = Invoke-RestMethod -Uri "$plexLocalUrl/identity" -TimeoutSec 3
} catch {
  $plexIdentity = $null
}

$plexIndexSummary = $null
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python -and (Test-Path $plexDbPath) -and (Test-Path $pythonScriptPath)) {
  $rawSummary = & $python.Source $pythonScriptPath --db-path $plexDbPath --output $plexIndexPath
  if ($LASTEXITCODE -eq 0 -and $rawSummary) {
    $plexIndexSummary = $rawSummary | ConvertFrom-Json
  }
}

$plexReachable = $null -ne $plexIdentity
$plexIndexedItems = if ($plexIndexSummary) { [int]$plexIndexSummary.indexedItemCount } else { 0 }
$plexSectionCount = if ($plexIndexSummary) { [int]$plexIndexSummary.sectionCount } else { 0 }
$plexStatus = if ($plexReachable) {
  "healthy"
} elseif ($plexProcesses.Count -gt 0) {
  "degraded"
} else {
  "offline"
}

$plexVersion = $null
if ($plexIdentity) {
  $plexVersion = [string]$plexIdentity.MediaContainer.version
}

$plexDetailsParts = @(
  "Reachable on ${plexLocalUrl}: $plexReachable",
  "Processes: $(Format-ProcessSummary -Processes $plexProcesses)",
  "Services: $(Format-ServiceSummary -Services $plexServices)"
)

if ($plexVersion) {
  $plexDetailsParts += "Version: $plexVersion"
}

if ($plexIndexedItems -gt 0) {
  $plexDetailsParts += "Indexed items: $plexIndexedItems across $plexSectionCount sections"
}

$plexComponent = New-Component -Name "plex" -Status $plexStatus -Details (($plexDetailsParts -join ". ") + ".")

$systemComponent = New-Component -Name "system" -Status "healthy" -Details "Windows host up for $uptimeText."

$components = @(
  $systemComponent
  $dockerComponent
  $corsairComponent
  $plexComponent
)

$healthyComponents = ($components | Where-Object { $_.status -eq "healthy" }).Count
$degradedComponents = ($components | Where-Object { $_.status -eq "degraded" }).Count
$summary = "Windows host status refreshed: $healthyComponents healthy, $degradedComponents degraded, $($components.Count - $healthyComponents - $degradedComponents) offline."

$payload = [ordered]@{
  generatedAt = Get-IsoNow
  summary = $summary
  host = [ordered]@{
    computerName = $env:COMPUTERNAME
    osName = [string]$os.Caption
    osVersion = [string]$os.Version
    lastBootUpTime = $bootTime.ToString("o")
    uptime = $uptimeText
  }
  components = $components
  plex = [ordered]@{
    reachable = $plexReachable
    localUrl = $plexLocalUrl
    version = $plexVersion
    indexedItemCount = $plexIndexedItems
    sectionCount = $plexSectionCount
    libraries = if ($plexIndexSummary) { $plexIndexSummary.sections } else { @() }
  }
}

$hostStatusJson = $payload | ConvertTo-Json -Depth 8
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($hostStatusPath, $hostStatusJson, $utf8NoBom)
Write-Host "Wrote host status to $hostStatusPath"
if (Test-Path $plexIndexPath) {
  Write-Host "Wrote Plex library index to $plexIndexPath"
}
