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

function Convert-DockerDateValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "0001-01-01T00:00:00Z") {
    return $null
  }

  try {
    return ([DateTimeOffset]::Parse($Value)).ToLocalTime().ToString("o")
  } catch {
    return $Value
  }
}

function Convert-DockerPercentValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  $trimmed = $Value.Trim().TrimEnd("%")
  $parsed = 0.0
  if ([double]::TryParse($trimmed, [ref]$parsed)) {
    return $parsed
  }

  return $null
}

function Get-DockerInspectIndex {
  param(
    [System.Management.Automation.CommandInfo]$DockerCommand,
    [object[]]$Containers
  )

  $index = @{}
  if ($null -eq $DockerCommand -or -not $Containers -or $Containers.Count -eq 0) {
    return $index
  }

  $ids = @($Containers | ForEach-Object { $_.id } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  if ($ids.Count -eq 0) {
    return $index
  }

  $rawInspect = & $DockerCommand.Source inspect $ids 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawInspect) {
    return $index
  }

  $parsed = (($rawInspect | Out-String) | ConvertFrom-Json)
  foreach ($record in @($parsed)) {
    $mounts = @()
    foreach ($mount in @($record.Mounts)) {
      $mounts += [ordered]@{
        type = [string]$mount.Type
        source = if ($mount.Source) { [string]$mount.Source } else { $null }
        destination = [string]$mount.Destination
        mode = if ($mount.Mode) { [string]$mount.Mode } else { $null }
        readWrite = if ($null -ne $mount.RW) { [bool]$mount.RW } else { $null }
      }
    }

    $commandParts = @()
    if ($record.Path) {
      $commandParts += [string]$record.Path
    }
    foreach ($arg in @($record.Args)) {
      if (-not [string]::IsNullOrWhiteSpace([string]$arg)) {
        $commandParts += [string]$arg
      }
    }

    $detail = [ordered]@{
      command = if ($commandParts.Count -gt 0) { $commandParts -join " " } else { $null }
      health = if ($record.State.Health -and $record.State.Health.Status) { [string]$record.State.Health.Status } else { $null }
      exitCode = if ($null -ne $record.State.ExitCode) { [int]$record.State.ExitCode } else { $null }
      error = if ($record.State.Error) { [string]$record.State.Error } else { $null }
      restartCount = if ($null -ne $record.RestartCount) { [int]$record.RestartCount } else { $null }
      startedAt = Convert-DockerDateValue -Value ([string]$record.State.StartedAt)
      finishedAt = Convert-DockerDateValue -Value ([string]$record.State.FinishedAt)
      mounts = $mounts
    }

    $name = if ($record.Name) { ([string]$record.Name).TrimStart("/") } else { $null }
    $keys = @([string]$record.Id, $name) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($key in $keys) {
      $index[$key] = $detail
    }
  }

  return $index
}

function Get-DockerStatsIndex {
  param([System.Management.Automation.CommandInfo]$DockerCommand)

  $index = @{}
  if ($null -eq $DockerCommand) {
    return $index
  }

  $rawStats = & $DockerCommand.Source stats --no-stream --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawStats) {
    return $index
  }

  $sampledAt = Get-IsoNow
  foreach ($line in @($rawStats)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $pids = $null
    if ($record.PIDs) {
      $parsedPids = 0
      if ([int]::TryParse([string]$record.PIDs, [ref]$parsedPids)) {
        $pids = $parsedPids
      }
    }

    $detail = [ordered]@{
      sampledAt = $sampledAt
      cpuPercent = Convert-DockerPercentValue -Value ([string]$record.CPUPerc)
      memoryUsage = if ($record.MemUsage) { [string]$record.MemUsage } else { $null }
      memoryPercent = Convert-DockerPercentValue -Value ([string]$record.MemPerc)
      netIO = if ($record.NetIO) { [string]$record.NetIO } else { $null }
      blockIO = if ($record.BlockIO) { [string]$record.BlockIO } else { $null }
      pids = $pids
    }

    $keys = @([string]$record.ID, [string]$record.Name, [string]$record.Container) |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($key in $keys) {
      $index[$key] = $detail
    }
  }

  return $index
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
      command = if ($record.Command) { [string]$record.Command } else { $null }
      ports = if ($record.Ports) { [string]$record.Ports } else { $null }
      runningFor = if ($record.RunningFor) { [string]$record.RunningFor } else { $null }
      createdAt = if ($record.CreatedAt) { [string]$record.CreatedAt } else { $null }
      startedAt = $null
      finishedAt = $null
      health = $null
      exitCode = $null
      error = $null
      restartCount = $null
      networks = $networks
      composeProject = Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.project"
      composeService = Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.service"
      mounts = @()
      resourceUsage = $null
      size = if ($record.Size) { [string]$record.Size } else { $null }
    }
  }

  return $containers
}

function Get-DockerImages {
  param([System.Management.Automation.CommandInfo]$DockerCommand)

  $images = @()
  if ($null -eq $DockerCommand) {
    return $images
  }

  $rawImages = & $DockerCommand.Source image ls --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawImages) {
    return $images
  }

  foreach ($line in @($rawImages)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $containerCount = $null
    if ($record.Containers -and $record.Containers -ne "N/A") {
      $parsedContainers = 0
      if ([int]::TryParse([string]$record.Containers, [ref]$parsedContainers)) {
        $containerCount = $parsedContainers
      }
    }

    $repository = [string]$record.Repository
    $tag = [string]$record.Tag
    $images += [ordered]@{
      id = [string]$record.ID
      repository = $repository
      tag = $tag
      size = if ($record.Size) { [string]$record.Size } else { $null }
      containers = $containerCount
      createdAt = if ($record.CreatedAt) { [string]$record.CreatedAt } else { $null }
      createdSince = if ($record.CreatedSince) { [string]$record.CreatedSince } else { $null }
      dangling = ($repository -eq "<none>" -or $tag -eq "<none>")
    }
  }

  return $images
}

function Get-DockerNetworks {
  param([System.Management.Automation.CommandInfo]$DockerCommand)

  $networks = @()
  if ($null -eq $DockerCommand) {
    return $networks
  }

  $rawNetworks = & $DockerCommand.Source network ls --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawNetworks) {
    return $networks
  }

  foreach ($line in @($rawNetworks)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $labels = if ($record.Labels) { [string]$record.Labels } else { "" }
    $networks += [ordered]@{
      id = [string]$record.ID
      name = [string]$record.Name
      driver = [string]$record.Driver
      scope = [string]$record.Scope
      internal = if ($null -ne $record.Internal) { [System.Convert]::ToBoolean($record.Internal) } else { $null }
      ipv6 = if ($null -ne $record.IPv6) { [System.Convert]::ToBoolean($record.IPv6) } else { $null }
      composeProject = Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.project"
      createdAt = if ($record.CreatedAt) { [string]$record.CreatedAt } else { $null }
    }
  }

  return $networks
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

  $year = $null
  if ($Node.year) {
    $parsedYear = 0
    if ([int]::TryParse([string]$Node.year, [ref]$parsedYear)) {
      $year = $parsedYear
    }
  }

  $leafCount = $null
  if ($Node.leafCount) {
    $parsedLeafCount = 0
    if ([int]::TryParse([string]$Node.leafCount, [ref]$parsedLeafCount)) {
      $leafCount = $parsedLeafCount
    }
  }

  $viewedLeafCount = $null
  if ($Node.viewedLeafCount) {
    $parsedViewedLeafCount = 0
    if ([int]::TryParse([string]$Node.viewedLeafCount, [ref]$parsedViewedLeafCount)) {
      $viewedLeafCount = $parsedViewedLeafCount
    }
  }

  return [ordered]@{
    title = [string]$Node.title
    type = [string]$Node.type
    section = if ($Node.librarySectionTitle) { [string]$Node.librarySectionTitle } else { $null }
    year = $year
    grandparentTitle = if ($Node.grandparentTitle) { [string]$Node.grandparentTitle } else { $null }
    parentTitle = if ($Node.parentTitle) { [string]$Node.parentTitle } else { $null }
    seasonIndex = $seasonIndex
    episodeIndex = $episodeIndex
    leafCount = $leafCount
    viewedLeafCount = $viewedLeafCount
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
    [string]$Token,
    [object[]]$Sections
  )

  $sessionsXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/status/sessions") -Token $Token
  $historyXml = $null
  $continueWatchingXml = $null
  $onDeckXml = $null
  $unwatched = @()
  $unwatchedAvailable = $false
  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $historyXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/status/sessions/history/all?sort=viewedAt:desc") -Token $Token
    $continueWatchingXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/hubs/continueWatching/items?includeGuids=1") -Token $Token
    $onDeckXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/hubs/home/onDeck?includeGuids=1") -Token $Token

    foreach ($section in @($Sections | Where-Object { $_.sectionType -in @("movie", "show") })) {
      $unwatchedXml = Invoke-PlexXmlRequest -Url ($BaseUrl + "/library/sections/" + [string]$section.id + "/unwatched") -Token $Token
      if (-not $unwatchedXml -or -not $unwatchedXml.MediaContainer) {
        continue
      }

      $unwatchedAvailable = $true
      $sectionItems = @(
        @($unwatchedXml.MediaContainer.ChildNodes) |
          Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element -and $_.title } |
          Select-Object -First 100 |
          ForEach-Object {
            $item = Convert-PlexActivityNode -Node $_
            if (-not $item.section) {
              $item["section"] = [string]$section.name
            }
            $item
          }
      )
      $unwatched += $sectionItems
    }
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

  $onDeck = @()
  if ($onDeckXml -and $onDeckXml.MediaContainer) {
    $onDeck = @(
      @($onDeckXml.MediaContainer.ChildNodes) |
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
    onDeckAvailable = ($null -ne $onDeckXml)
    unwatchedAvailable = $unwatchedAvailable
    activeSessions = $activeSessions
    recentlyWatched = $recentHistory
    continueWatching = $continueWatching
    onDeck = $onDeck
    unwatched = $unwatched
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
$dockerImages = @()
$dockerNetworks = @()
$dockerStatsIndex = @{}

if ($dockerCommand) {
  $dockerVersionOutput = & $dockerCommand.Source version --format '{{.Client.Version}}' 2>$null
  if ($LASTEXITCODE -eq 0 -and $dockerVersionOutput) {
    $dockerCliVersion = ($dockerVersionOutput | Select-Object -First 1).Trim()
  }

  $dockerContainers = @(Get-DockerContainers -DockerCommand $dockerCommand)
  $dockerInspectIndex = Get-DockerInspectIndex -DockerCommand $dockerCommand -Containers $dockerContainers
  $dockerStatsIndex = Get-DockerStatsIndex -DockerCommand $dockerCommand
  foreach ($container in $dockerContainers) {
    $detail = $dockerInspectIndex[$container.id]
    if (-not $detail) {
      $detail = $dockerInspectIndex[$container.name]
    }

    if ($detail) {
      $container["command"] = $detail.command
      $container["health"] = $detail.health
      $container["exitCode"] = $detail.exitCode
      $container["error"] = $detail.error
      $container["restartCount"] = $detail.restartCount
      $container["startedAt"] = $detail.startedAt
      $container["finishedAt"] = $detail.finishedAt
      $container["mounts"] = $detail.mounts
    }

    $usage = $dockerStatsIndex[$container.id]
    if (-not $usage) {
      $usage = $dockerStatsIndex[$container.name]
    }
    if ($usage) {
      $container["resourceUsage"] = $usage
    } else {
      $container["resourceUsage"] = $null
    }
  }
  $dockerImages = @(Get-DockerImages -DockerCommand $dockerCommand)
  $dockerNetworks = @(Get-DockerNetworks -DockerCommand $dockerCommand)
}

$dockerRunningCount = @($dockerContainers | Where-Object { $_.state -eq "running" }).Count
$dockerExitedCount = @($dockerContainers | Where-Object { $_.state -eq "exited" }).Count
$dockerUnhealthyCount = @($dockerContainers | Where-Object { $_.health -eq "unhealthy" -or $_.status -match "unhealthy" }).Count
$dockerProblemCount = @(
  $dockerContainers |
    Where-Object {
      $_.health -eq "unhealthy" -or
      $_.status -match "unhealthy" -or
      $_.state -in @("restarting", "dead") -or
      ($_.state -eq "exited" -and $null -ne $_.exitCode -and $_.exitCode -ne 0)
    }
).Count
$dockerImageCount = @($dockerImages).Count
$dockerNetworkCount = @($dockerNetworks).Count
$dockerComposeProjectCount = @(
  $dockerContainers |
    ForEach-Object { $_["composeProject"] } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Unique
).Count
$dockerRunning = $dockerProcesses.Count -gt 0
$dockerStatus = if ($dockerRunning -and $dockerProblemCount -eq 0) { "healthy" } elseif ($dockerRunning -or $dockerServices.Count -gt 0) { "degraded" } else { "offline" }
$dockerDetails = "Processes: $(Format-ProcessSummary -Processes $dockerProcesses). Services: $(Format-ServiceSummary -Services $dockerServices). Containers: $dockerRunningCount running, $dockerExitedCount exited, $dockerUnhealthyCount unhealthy, $dockerProblemCount problems. Images: $dockerImageCount. Networks: $dockerNetworkCount. Compose projects: $dockerComposeProjectCount."
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

$plexSectionsForActivity = if ($plexIndexSummary) { $plexIndexSummary.sections } else { @() }
$plexActivitySnapshot = Get-PlexActivitySnapshot -BaseUrl $plexLocalUrl -Token $plexToken -Sections $plexSectionsForActivity

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
    problemCount = $dockerProblemCount
    imageCount = $dockerImageCount
    networkCount = $dockerNetworkCount
    composeProjectCount = $dockerComposeProjectCount
    containers = $dockerContainers
    images = $dockerImages
    networks = $dockerNetworks
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
