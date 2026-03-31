$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dataDir = Join-Path $repoRoot "data\local"
$hostStatusPath = Join-Path $dataDir "windows-host-status.json"
$plexIndexPath = Join-Path $dataDir "plex-library-index.json"
$plexActivityPath = Join-Path $dataDir "plex-activity.json"
$pythonScriptPath = Join-Path $PSScriptRoot "export-plex-library.py"

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Add-Type -AssemblyName System.Net.Http

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

function Get-DockerLabelValue {
  param(
    [string]$Labels,
    [string]$Key
  )

  if ([string]::IsNullOrWhiteSpace($Labels)) {
    return $null
  }

  foreach ($label in ($Labels -split ",")) {
    $trimmed = $label.Trim()
    if ($trimmed.StartsWith("${Key}=")) {
      return $trimmed.Substring($Key.Length + 1)
    }
  }

  return $null
}

function Get-DockerContainers {
  param([System.Management.Automation.CommandInfo]$DockerCommand)

  $containers = @()
  if ($null -eq $DockerCommand) {
    return $containers
  }

  $rawContainers = & $DockerCommand.Source ps -a --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawContainers) {
    return $containers
  }

  foreach ($line in @($rawContainers)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $networks = @()
    if ($record.Networks) {
      $networks = @(
        ($record.Networks -split ",") |
          ForEach-Object { $_.Trim() } |
          Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
      )
    }

    $labels = [string]$record.Labels
    $containers += [ordered]@{
      id = [string]$record.ID
      name = [string]$record.Names
      image = [string]$record.Image
      state = [string]$record.State
      status = [string]$record.Status
      ports = if ($record.Ports) { [string]$record.Ports } else { $null }
      runningFor = if ($record.RunningFor) { [string]$record.RunningFor } else { $null }
      createdAt = if ($record.CreatedAt) { [string]$record.CreatedAt } else { $null }
      networks = $networks
      composeProject = Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.project"
      composeService = Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.service"
    }
  }

  return $containers
}

function Convert-PlexDateValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  $unixValue = 0L
  if ([Int64]::TryParse($Value, [ref]$unixValue)) {
    return [DateTimeOffset]::FromUnixTimeSeconds($unixValue).ToLocalTime().ToString("o")
  }

  try {
    return ([DateTimeOffset]::Parse($Value)).ToString("o")
  } catch {
    return $Value
  }
}

function Get-PlexAuthToken {
  if (-not [string]::IsNullOrWhiteSpace($env:PLEX_TOKEN)) {
    return $env:PLEX_TOKEN
  }

  $candidatePaths = @()
  if (-not [string]::IsNullOrWhiteSpace($env:PLEX_PREFERENCES_PATH)) {
    $candidatePaths += $env:PLEX_PREFERENCES_PATH
  }

  $candidatePaths += @(
    (Join-Path $env:LOCALAPPDATA "Plex\Plex Media Server\Preferences.xml"),
    (Join-Path $env:LOCALAPPDATA "Plex Media Server\Preferences.xml")
  )

  foreach ($candidate in $candidatePaths | Select-Object -Unique) {
    if (-not (Test-Path $candidate)) {
      continue
    }

    try {
      [xml]$prefs = Get-Content -Path $candidate
      if ($prefs.Preferences.PlexOnlineToken) {
        return [string]$prefs.Preferences.PlexOnlineToken
      }
    } catch {
      continue
    }
  }

  return $null
}

function Invoke-PlexXmlRequest {
  param(
    [string]$Url,
    [string]$Token
  )

  $client = [System.Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds(5)
  try {
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
      $client.DefaultRequestHeaders.Add("X-Plex-Token", $Token)
    }

    $content = $client.GetStringAsync($Url).GetAwaiter().GetResult()
    [xml]$xml = $content
    return $xml
  } catch {
    return $null
  } finally {
    $client.Dispose()
  }
}

function Convert-PlexActivityNode {
  param($Node)

  $durationMs = $null
  if ($Node.duration) {
    $parsedDuration = 0L
    if ([Int64]::TryParse([string]$Node.duration, [ref]$parsedDuration)) {
      $durationMs = $parsedDuration
    }
  }

  $viewOffsetMs = $null
  if ($Node.viewOffset) {
    $parsedOffset = 0L
    if ([Int64]::TryParse([string]$Node.viewOffset, [ref]$parsedOffset)) {
      $viewOffsetMs = $parsedOffset
    }
  }

  $seasonIndex = $null
  if ($Node.parentIndex) {
    $parsedSeason = 0
    if ([int]::TryParse([string]$Node.parentIndex, [ref]$parsedSeason)) {
      $seasonIndex = $parsedSeason
    }
  }

  $episodeIndex = $null
  if ($Node.index) {
    $parsedEpisode = 0
    if ([int]::TryParse([string]$Node.index, [ref]$parsedEpisode)) {
      $episodeIndex = $parsedEpisode
    }
  }

  return [ordered]@{
    title = [string]$Node.title
    type = [string]$Node.type
    section = if ($Node.librarySectionTitle) { [string]$Node.librarySectionTitle } else { $null }
    grandparentTitle = if ($Node.grandparentTitle) { [string]$Node.grandparentTitle } else { $null }
    parentTitle = if ($Node.parentTitle) { [string]$Node.parentTitle } else { $null }
    seasonIndex = $seasonIndex
    episodeIndex = $episodeIndex
    user = if ($Node.User -and $Node.User.title) { [string]$Node.User.title } else { $null }
    player = if ($Node.Player -and $Node.Player.title) { [string]$Node.Player.title } else { $null }
    state = if ($Node.Player -and $Node.Player.state) { [string]$Node.Player.state } else { $null }
    viewedAt = if ($Node.viewedAt) { Convert-PlexDateValue -Value ([string]$Node.viewedAt) } elseif ($Node.lastViewedAt) { Convert-PlexDateValue -Value ([string]$Node.lastViewedAt) } else { $null }
    addedAt = if ($Node.addedAt) { Convert-PlexDateValue -Value ([string]$Node.addedAt) } else { $null }
    originallyAvailableAt = if ($Node.originallyAvailableAt) { Convert-PlexDateValue -Value ([string]$Node.originallyAvailableAt) } else { $null }
    durationMs = $durationMs
    viewOffsetMs = $viewOffsetMs
  }
}

function Get-PlexActivitySnapshot {
  param(
    [string]$BaseUrl,
    [string]$Token
  )

  $sessionsXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/status/sessions") -Token $Token
  $historyXml = $null
  $continueWatchingXml = $null
  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $historyXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/status/sessions/history/all?sort=viewedAt:desc") -Token $Token
    $continueWatchingXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/hubs/continueWatching/items?includeGuids=1") -Token $Token
  }

  $activeSessions = @()
  if ($sessionsXml -and $sessionsXml.MediaContainer) {
    $activeSessions = @(
      @($sessionsXml.MediaContainer.ChildNodes) |
        Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and $_.title } |
        ForEach-Object { Convert-PlexActivityNode -Node $_ }
    )
  }

  $recentHistory = @()
  if ($historyXml -and $historyXml.MediaContainer) {
    $recentHistory = @(
      @($historyXml.MediaContainer.ChildNodes) |
        Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and $_.title } |
        Select-Object -First 25 |
        ForEach-Object { Convert-PlexActivityNode -Node $_ }
    )
  }

  $continueWatching = @()
  if ($continueWatchingXml -and $continueWatchingXml.MediaContainer) {
    $continueWatching = @(
      @($continueWatchingXml.MediaContainer.ChildNodes) |
        Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and $_.title } |
        Select-Object -First 25 |
        ForEach-Object { Convert-PlexActivityNode -Node $_ }
    )
  }

  return [ordered]@{
    fetchedAt = Get-IsoNow
    tokenAvailable = -not [string]::IsNullOrWhiteSpace($Token)
    sessionsAvailable = ($null -ne $sessionsXml)
    historyAvailable = ($null -ne $historyXml)
    continueWatchingAvailable = ($null -ne $continueWatchingXml)
    activeSessions = $activeSessions
    recentlyWatched = $recentHistory
    continueWatching = $continueWatching
  }
}

$os = Get-CimInstance Win32_OperatingSystem
$bootTime = $os.LastBootUpTime
$uptimeSpan = (Get-Date) - $bootTime
$uptimeText = "{0}d {1}h {2}m" -f [Math]::Floor($uptimeSpan.TotalDays), $uptimeSpan.Hours, $uptimeSpan.Minutes

$dockerProcesses = Get-ProcessNames -Names @("Docker Desktop", "com.docker.backend", "docker-agent", "docker-sandbox")
$dockerServices = Convert-ServiceState -Names @("com.docker.service")
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerCliVersion = $null
$dockerContainers = @()

if ($dockerCommand) {
  $dockerVersionOutput = & $dockerCommand.Source version --format '{{.Client.Version}}' 2>$null
  if ($LASTEXITCODE -eq 0 -and $dockerVersionOutput) {
    $dockerCliVersion = ($dockerVersionOutput | Select-Object -First 1).Trim()
  }

  $dockerContainers = @(Get-DockerContainers -DockerCommand $dockerCommand)
}

$dockerRunningCount = @($dockerContainers | Where-Object { $_.state -eq "running" }).Count
$dockerExitedCount = @($dockerContainers | Where-Object { $_.state -eq "exited" }).Count
$dockerUnhealthyCount = @($dockerContainers | Where-Object { $_.status -match "unhealthy" }).Count
$dockerProblemCount = @(
  $dockerContainers | Where-Object { $_.status -match "unhealthy" -or $_.state -in @("restarting", "dead") }
).Count
$dockerRunning = $dockerProcesses.Count -gt 0
$dockerStatus = if ($dockerRunning -and $dockerProblemCount -eq 0) { "healthy" } elseif ($dockerRunning -or $dockerServices.Count -gt 0) { "degraded" } else { "offline" }
$dockerDetails = "Processes: $(Format-ProcessSummary -Processes $dockerProcesses). Services: $(Format-ServiceSummary -Services $dockerServices). Containers: $dockerRunningCount running, $dockerExitedCount exited, $dockerUnhealthyCount unhealthy."
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
$plexToken = Get-PlexAuthToken

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

$plexActivitySnapshot = Get-PlexActivitySnapshot -BaseUrl $plexLocalUrl -Token $plexToken

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
  docker = [ordered]@{
    available = ($null -ne $dockerCommand)
    cliVersion = $dockerCliVersion
    containerCount = @($dockerContainers).Count
    runningCount = $dockerRunningCount
    exitedCount = $dockerExitedCount
    unhealthyCount = $dockerUnhealthyCount
    containers = $dockerContainers
  }
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
$plexActivityJson = $plexActivitySnapshot | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($plexActivityPath, $plexActivityJson, $utf8NoBom)
Write-Host "Wrote host status to $hostStatusPath"
if (Test-Path $plexIndexPath) {
  Write-Host "Wrote Plex library index to $plexIndexPath"
}
Write-Host "Wrote Plex activity snapshot to $plexActivityPath"
