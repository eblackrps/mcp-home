$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Import-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($line in Get-Content -Path $Path -ErrorAction SilentlyContinue) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }

    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2) {
      continue
    }

    $name = $parts[0].Trim()
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }

    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $currentValue = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($currentValue)) {
      Set-Item -Path ("Env:" + $name) -Value $value
    }
  }
}

Import-DotEnvFile -Path (Join-Path $repoRoot ".env")

$dataDir = Join-Path $repoRoot "data\local"
$hostStatusPath = Join-Path $dataDir "windows-host-status.json"
$plexIndexPath = Join-Path $dataDir "plex-library-index.json"
$plexActivityPath = Join-Path $dataDir "plex-activity.json"
$fileCatalogPath = Join-Path $dataDir "file-catalog.json"
$repoStatusPath = Join-Path $dataDir "repo-status.json"
$snapshotStatusPath = Join-Path $dataDir "snapshot-status.json"
$snapshotHistoryPath = Join-Path $dataDir "snapshot-history.json"
$refreshLockPath = Join-Path $dataDir "refresh-windows-host.lock"
$refreshTaskName = if ($env:HOST_REFRESH_TASK_NAME) { $env:HOST_REFRESH_TASK_NAME } else { "MCP Home Host Refresh" }
$pythonScriptPath = Join-Path $PSScriptRoot "export-plex-library.py"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
Add-Type -AssemblyName System.Net.Http

function Get-IsoNow {
  return (Get-Date).ToString("o")
}

function Write-JsonAtomic {
  param(
    [string]$Path,
    [object]$Value,
    [int]$Depth = 8
  )

  $directory = Split-Path -Path $Path -Parent
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $tempPath = Join-Path $directory ([System.IO.Path]::GetRandomFileName() + ".tmp")

  try {
    $json = $Value | ConvertTo-Json -Depth $Depth
    [System.IO.File]::WriteAllText($tempPath, $json, $utf8NoBom)
    Move-Item -Path $tempPath -Destination $Path -Force
  } finally {
    if (Test-Path $tempPath) {
      Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-RefreshOutputSummary {
  param(
    [string]$Path,
    [string]$SourceTimestamp = $null
  )

  if (-not (Test-Path $Path)) {
    return [ordered]@{
      path = $Path
      exists = $false
      updatedAt = $null
      sizeBytes = $null
      sourceTimestamp = $SourceTimestamp
    }
  }

  $item = Get-Item -Path $Path
  return [ordered]@{
    path = $Path
    exists = $true
    updatedAt = $item.LastWriteTimeUtc.ToString("o")
    sizeBytes = [int64]$item.Length
    sourceTimestamp = $SourceTimestamp
  }
}

function Get-RefreshSchedulerInfo {
  param([string]$TaskName)

  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    $intervalMinutes = $null

    foreach ($trigger in @($task.Triggers)) {
      $interval = $trigger.Repetition.Interval
      if ($interval -is [TimeSpan]) {
        $intervalMinutes = [int][Math]::Round($interval.TotalMinutes)
        break
      }

      if ($interval) {
        try {
          $intervalMinutes = [int][Math]::Round(([System.Xml.XmlConvert]::ToTimeSpan([string]$interval)).TotalMinutes)
          break
        } catch {
        }
      }
    }

    return [ordered]@{
      taskName = $TaskName
      installed = $true
      state = if ($task.State) { [string]$task.State } else { $null }
      nextRunTime = if ($taskInfo.NextRunTime -and $taskInfo.NextRunTime -gt [datetime]::MinValue) { $taskInfo.NextRunTime.ToUniversalTime().ToString("o") } else { $null }
      lastRunTime = if ($taskInfo.LastRunTime -and $taskInfo.LastRunTime -gt [datetime]::MinValue) { $taskInfo.LastRunTime.ToUniversalTime().ToString("o") } else { $null }
      lastTaskResult = if ($null -ne $taskInfo.LastTaskResult) { [int64]$taskInfo.LastTaskResult } else { $null }
      intervalMinutes = $intervalMinutes
    }
  } catch {
    return [ordered]@{
      taskName = $TaskName
      installed = $false
      state = $null
      nextRunTime = $null
      lastRunTime = $null
      lastTaskResult = $null
      intervalMinutes = $null
    }
  }
}

function Acquire-RefreshLock {
  param(
    [string]$Path,
    [int]$StaleMinutes = 180
  )

  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      $bytes = $utf8NoBom.GetBytes((@{
            pid = $PID
            startedAt = Get-IsoNow
          } | ConvertTo-Json -Depth 3))
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $stream.Dispose()
    }
  } catch [System.IO.IOException] {
    if (-not (Test-Path $Path)) {
      throw
    }

    $lockAgeMinutes = ((Get-Date) - (Get-Item -Path $Path).LastWriteTime).TotalMinutes
    if ($lockAgeMinutes -gt $StaleMinutes) {
      Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
      Acquire-RefreshLock -Path $Path -StaleMinutes $StaleMinutes
      return
    }

    throw "Another refresh is already running or the lock file is recent ($([Math]::Round($lockAgeMinutes, 1)) minutes old): $Path"
  }
}

function Release-RefreshLock {
  param([string]$Path)

  Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
}

function Write-RefreshStatus {
  param(
    [string]$RunState,
    [Nullable[bool]]$Ok,
    [string]$StartedAt,
    [string]$CompletedAt,
    [Nullable[double]]$DurationSeconds,
    [string[]]$Warnings,
    [string[]]$Errors,
    [object]$Scheduler,
    [object]$Outputs
  )

  $payload = [ordered]@{
    startedAt = $StartedAt
    completedAt = $CompletedAt
    runState = $RunState
    ok = $Ok
    durationSeconds = $DurationSeconds
    warnings = @($Warnings)
    errors = @($Errors)
    scheduler = $Scheduler
    outputs = $Outputs
    checkedAt = Get-IsoNow
  }

  Write-JsonAtomic -Path $snapshotStatusPath -Value $payload -Depth 8
}

function Append-RefreshHistory {
  param(
    [string]$Path,
    [object]$Entry,
    [int]$MaxEntries = 50
  )

  $entries = @()
  if (Test-Path $Path) {
    try {
      $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
      if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
        if ($parsed -is [System.Collections.IEnumerable] -and -not ($parsed -is [string])) {
          $entries = @($parsed)
        } elseif ($parsed.entries) {
          $entries = @($parsed.entries)
        }
      }
    } catch {
      $entries = @()
    }
  }

  $entries += [pscustomobject]$Entry
  if ($entries.Count -gt $MaxEntries) {
    $entries = $entries | Select-Object -Last $MaxEntries
  }

  Write-JsonAtomic -Path $Path -Value ([ordered]@{
      updatedAt = Get-IsoNow
      entries = @($entries)
    }) -Depth 8
}

function Get-DriveTypeName {
  param([int]$DriveType)

  switch ($DriveType) {
    2 { return "removable" }
    3 { return "fixed" }
    4 { return "network" }
    5 { return "cdrom" }
    6 { return "ramdisk" }
    default { return "unknown" }
  }
}

function Get-HostResourceSnapshot {
  param($OperatingSystem)

  $processors = @(Get-CimInstance Win32_Processor)
  $cpuName = if ($processors.Count -gt 0 -and $processors[0].Name) { [string]$processors[0].Name } else { "unknown" }
  $logicalCores = if ($processors.Count -gt 0) {
    [int](($processors | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum)
  } else {
    0
  }
  $loadPercent = if ($processors.Count -gt 0) {
    [double]($processors | Measure-Object -Property LoadPercentage -Average).Average
  } else {
    $null
  }
  $maxClockMHz = if ($processors.Count -gt 0) {
    [int](($processors | Measure-Object -Property MaxClockSpeed -Maximum).Maximum)
  } else {
    $null
  }

  $totalBytes = [int64]$OperatingSystem.TotalVisibleMemorySize * 1KB
  $freeBytes = [int64]$OperatingSystem.FreePhysicalMemory * 1KB
  $usedBytes = [Math]::Max($totalBytes - $freeBytes, 0)
  $percentUsed = if ($totalBytes -gt 0) {
    [Math]::Round(($usedBytes / $totalBytes) * 100, 2)
  } else {
    0
  }

  $disks = @(
    Get-CimInstance Win32_LogicalDisk |
      Where-Object { $_.DriveType -eq 3 } |
      Sort-Object DeviceID |
      ForEach-Object {
        $size = if ($_.Size) { [int64]$_.Size } else { $null }
        $free = if ($_.FreeSpace) { [int64]$_.FreeSpace } else { $null }
        $used = if ($null -ne $size -and $null -ne $free) { [Math]::Max($size - $free, 0) } else { $null }
        $percentFree = if ($null -ne $size -and $size -gt 0 -and $null -ne $free) {
          [Math]::Round(($free / $size) * 100, 2)
        } else {
          $null
        }

        [ordered]@{
          name = [string]$_.DeviceID
          volumeName = if ($_.VolumeName) { [string]$_.VolumeName } else { $null }
          fileSystem = if ($_.FileSystem) { [string]$_.FileSystem } else { $null }
          driveType = Get-DriveTypeName -DriveType ([int]$_.DriveType)
          totalBytes = $size
          freeBytes = $free
          usedBytes = $used
          percentFree = $percentFree
        }
      }
  )

  $adapters = @(
    Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" |
      Sort-Object Description |
      ForEach-Object {
        $ipv4 = @()
        $ipv6 = @()
        foreach ($ip in @($_.IPAddress)) {
          if ([string]::IsNullOrWhiteSpace($ip)) {
            continue
          }

          if ($ip.Contains(":")) {
            $ipv6 += [string]$ip
          } else {
            $ipv4 += [string]$ip
          }
        }

        [ordered]@{
          name = if ($_.Description) { [string]$_.Description } else { [string]$_.Caption }
          description = if ($_.Caption) { [string]$_.Caption } else { [string]$_.Description }
          macAddress = if ($_.MACAddress) { [string]$_.MACAddress } else { $null }
          ipv4 = @($ipv4 | Sort-Object -Unique)
          ipv6 = @($ipv6 | Sort-Object -Unique)
          gateways = @(@($_.DefaultIPGateway) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
          dnsServers = @(@($_.DNSServerSearchOrder) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
          dhcpEnabled = if ($null -ne $_.DHCPEnabled) { [bool]$_.DHCPEnabled } else { $null }
        }
      }
  )

  $primaryIpv4 = $null
  foreach ($adapter in $adapters) {
    if ($adapter.ipv4.Count -gt 0) {
      $primaryIpv4 = [string]$adapter.ipv4[0]
      break
    }
  }
  return [ordered]@{
    cpu = [ordered]@{
      name = $cpuName
      logicalCores = $logicalCores
      loadPercent = $loadPercent
      maxClockMHz = $maxClockMHz
    }
    memory = [ordered]@{
      totalBytes = $totalBytes
      freeBytes = $freeBytes
      usedBytes = $usedBytes
      percentUsed = $percentUsed
    }
    disks = $disks
    network = [ordered]@{
      adapterCount = @($adapters).Count
      ipv4Count = @($adapters | ForEach-Object { $_.ipv4 } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
      ipv6Count = @($adapters | ForEach-Object { $_.ipv6 } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
      primaryIpv4 = $primaryIpv4
      adapters = $adapters
    }
  }
}

function Resolve-ConfiguredPaths {
  param(
    [string]$RawValue,
    [string[]]$DefaultRelativePaths = @()
  )

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($RawValue)) {
    $candidates = @(
      $RawValue -split "[;\r\n,]+" |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
  } else {
    $candidates = @($DefaultRelativePaths)
  }

  $resolved = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in $candidates) {
    $resolvedPath = if ([System.IO.Path]::IsPathRooted($candidate)) {
      $candidate
    } else {
      Join-Path $repoRoot $candidate
    }

    try {
      $resolvedValue = (Resolve-Path -Path $resolvedPath -ErrorAction Stop).Path
      if (-not $resolved.Contains($resolvedValue)) {
        $resolved.Add($resolvedValue) | Out-Null
      }
    } catch {
    }
  }

  return @($resolved)
}

function Test-ExcludedScanPath {
  param([string]$Path)

  $normalized = $Path.Replace('/', '\').ToLowerInvariant()
  return (
    $normalized -like "*\node_modules\*" -or
    $normalized -like "*\.git\*" -or
    $normalized -like "*\dist\*" -or
    $normalized -like "*\data\local\*" -or
    $normalized -like "*\logs\*" -or
    $normalized -like "*\state\*" -or
    $normalized -like "*\bin\*" -or
    $normalized -like "*\obj\*"
  )
}

function Convert-ToRelativePath {
  param(
    [string]$Root,
    [string]$Path
  )

  try {
    if ([System.IO.Path].GetMethod("GetRelativePath", [type[]]@([string], [string]))) {
      return [System.IO.Path]::GetRelativePath($Root, $Path)
    }

    $rootUri = [System.Uri]::new(($Root.TrimEnd('\') + '\'))
    $pathUri = [System.Uri]::new($Path)
    $relative = $rootUri.MakeRelativeUri($pathUri).ToString()
    return [System.Uri]::UnescapeDataString($relative).Replace('/', '\')
  } catch {
    return $Path
  }
}

function Get-WindowsServiceSnapshot {
  return @(
    Get-CimInstance Win32_Service |
      Sort-Object DisplayName |
      ForEach-Object {
        [ordered]@{
          name = [string]$_.Name
          displayName = if ($_.DisplayName) { [string]$_.DisplayName } else { [string]$_.Name }
          state = if ($_.State) { [string]$_.State } else { "Unknown" }
          startMode = if ($_.StartMode) { [string]$_.StartMode } else { $null }
          status = if ($_.Status) { [string]$_.Status } else { $null }
          processId = if ($null -ne $_.ProcessId) { [int]$_.ProcessId } else { $null }
          startName = if ($_.StartName) { [string]$_.StartName } else { $null }
          pathName = if ($_.PathName) { [string]$_.PathName } else { $null }
          description = if ($_.Description) { [string]$_.Description } else { $null }
        }
      }
  )
}

function Format-ScheduledTaskAction {
  param($Action)

  if ($null -eq $Action) {
    return $null
  }

  if ($Action.Execute) {
    $bits = @([string]$Action.Execute)
    if ($Action.Arguments) {
      $bits += [string]$Action.Arguments
    }
    return ($bits -join " ")
  }

  if ($Action.ClassId) {
    return "COM " + [string]$Action.ClassId
  }

  return $Action.ToString()
}

function Format-ScheduledTaskTrigger {
  param($Trigger)

  if ($null -eq $Trigger) {
    return $null
  }

  $typeName = if ($Trigger.CimClass -and $Trigger.CimClass.CimClassName) { [string]$Trigger.CimClass.CimClassName } else { "Trigger" }
  $startBoundary = if ($Trigger.StartBoundary) { [string]$Trigger.StartBoundary } else { $null }
  $enabled = if ($null -ne $Trigger.Enabled) { [bool]$Trigger.Enabled } else { $null }
  $bits = @($typeName)
  if ($startBoundary) {
    $bits += "starts $startBoundary"
  }
  if ($null -ne $enabled) {
    $bits += $(if ($enabled) { "enabled" } else { "disabled" })
  }
  return ($bits -join " | ")
}

function Get-ScheduledTaskSnapshot {
  $items = New-Object System.Collections.Generic.List[object]
  $allTasks = @(Get-ScheduledTask | Sort-Object TaskPath, TaskName)

  foreach ($task in $allTasks) {
    $taskInfo = $null
    try {
      $taskInfo = Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction Stop
    } catch {
    }

    $actions = @(@($task.Actions) | ForEach-Object { Format-ScheduledTaskAction -Action $_ } | Where-Object { $_ })
    $triggers = @(@($task.Triggers) | ForEach-Object { Format-ScheduledTaskTrigger -Trigger $_ } | Where-Object { $_ })
    $enabled = if ($task.Settings -and $null -ne $task.Settings.Enabled) { [bool]$task.Settings.Enabled } else { $true }

    $items.Add([ordered]@{
        name = [string]$task.TaskName
        path = [string]$task.TaskPath
        state = if ($task.State) { [string]$task.State } else { "Unknown" }
        enabled = $enabled
        lastRunTime = if ($taskInfo -and $taskInfo.LastRunTime -and $taskInfo.LastRunTime -gt [datetime]::MinValue) { $taskInfo.LastRunTime.ToUniversalTime().ToString("o") } else { $null }
        nextRunTime = if ($taskInfo -and $taskInfo.NextRunTime -and $taskInfo.NextRunTime -gt [datetime]::MinValue) { $taskInfo.NextRunTime.ToUniversalTime().ToString("o") } else { $null }
        lastTaskResult = if ($taskInfo -and $null -ne $taskInfo.LastTaskResult) { [int64]$taskInfo.LastTaskResult } else { $null }
        author = if ($task.Author) { [string]$task.Author } else { $null }
        description = if ($task.Description) { [string]$task.Description } else { $null }
        actions = $actions
        triggers = $triggers
      }) | Out-Null
  }

  return $items.ToArray()
}

function Get-ListeningPortsSnapshot {
  param([object[]]$Services)

  $processIndex = @{}
  foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
    $processIndex[[int]$process.Id] = [string]$process.ProcessName
  }

  $serviceIndex = @{}
  foreach ($service in @($Services | Where-Object { $_.processId -and $_.processId -gt 0 })) {
    $processId = [int]$service.processId
    if (-not $serviceIndex.ContainsKey($processId)) {
      $serviceIndex[$processId] = New-Object System.Collections.Generic.List[string]
    }

    if (-not $serviceIndex[$processId].Contains([string]$service.name)) {
      $serviceIndex[$processId].Add([string]$service.name) | Out-Null
    }
  }

  $records = New-Object System.Collections.Generic.List[object]

  try {
    foreach ($entry in @(Get-NetTCPConnection -State Listen -ErrorAction Stop)) {
      $processId = if ($null -ne $entry.OwningProcess) { [int]$entry.OwningProcess } else { $null }
      $records.Add([ordered]@{
          protocol = "tcp"
          localAddress = [string]$entry.LocalAddress
          localPort = [int]$entry.LocalPort
          processId = $processId
          processName = if ($null -ne $processId -and $processIndex.ContainsKey($processId)) { $processIndex[$processId] } else { $null }
          serviceNames = if ($null -ne $processId -and $serviceIndex.ContainsKey($processId)) { @($serviceIndex[$processId]) } else { @() }
        }) | Out-Null
    }
  } catch {
  }

  try {
    foreach ($entry in @(Get-NetUDPEndpoint -ErrorAction Stop)) {
      $processId = if ($null -ne $entry.OwningProcess) { [int]$entry.OwningProcess } else { $null }
      $records.Add([ordered]@{
          protocol = "udp"
          localAddress = [string]$entry.LocalAddress
          localPort = [int]$entry.LocalPort
          processId = $processId
          processName = if ($null -ne $processId -and $processIndex.ContainsKey($processId)) { $processIndex[$processId] } else { $null }
          serviceNames = if ($null -ne $processId -and $serviceIndex.ContainsKey($processId)) { @($serviceIndex[$processId]) } else { @() }
        }) | Out-Null
    }
  } catch {
  }

  return @(
    $records |
      Sort-Object protocol, localPort, localAddress |
      ForEach-Object {
        [ordered]@{
          protocol = [string]$_.protocol
          localAddress = [string]$_.localAddress
          localPort = [int]$_.localPort
          processId = if ($null -ne $_.processId) { [int]$_.processId } else { $null }
          processName = if ($_.processName) { [string]$_.processName } else { $null }
          serviceNames = @(@($_.serviceNames) | Sort-Object -Unique)
        }
      }
  )
}

function Get-IntegerEnvValue {
  param(
    [string]$Name,
    [int]$Default,
    [int]$Min = 1,
    [int]$Max = 2147483647
  )

  $raw = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $Default
  }

  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge $Min -and $parsed -le $Max) {
    return $parsed
  }

  return $Default
}

function Get-DirectoryUsage {
  param(
    [string]$Path,
    [string]$Root,
    [int]$Depth
  )

  $files = @()
  $directories = @()
  $errorText = $null

  try {
    $files = @(
      Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { -not (Test-ExcludedScanPath -Path $_.FullName) }
    )
  } catch {
    $errorText = $_.Exception.Message
  }

  try {
    $directories = @(
      Get-ChildItem -LiteralPath $Path -Directory -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { -not (Test-ExcludedScanPath -Path $_.FullName) }
    )
  } catch {
    if (-not $errorText) {
      $errorText = $_.Exception.Message
    }
  }

  $totalBytes = [int64]0
  $latestModified = $null
  foreach ($file in $files) {
    $totalBytes += [int64]$file.Length
    if (-not $latestModified -or $file.LastWriteTimeUtc -gt $latestModified) {
      $latestModified = $file.LastWriteTimeUtc
    }
  }

  foreach ($directory in $directories) {
    if (-not $latestModified -or $directory.LastWriteTimeUtc -gt $latestModified) {
      $latestModified = $directory.LastWriteTimeUtc
    }
  }

  $directoryInfo = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($directoryInfo -and (-not $latestModified -or $directoryInfo.LastWriteTimeUtc -gt $latestModified)) {
    $latestModified = $directoryInfo.LastWriteTimeUtc
  }

  return [ordered]@{
    root = $Root
    path = $Path
    name = Split-Path -Path $Path -Leaf
    depth = $Depth
    totalBytes = [int64]$totalBytes
    fileCount = @($files).Count
    directoryCount = @($directories).Count
    lastModified = if ($latestModified) { $latestModified.ToString("o") } else { $null }
    drive = if ($Path -match "^[A-Za-z]:") { $Path.Substring(0, 2).ToUpperInvariant() } else { $null }
    error = $errorText
  }
}

function Get-StorageFolderSnapshot {
  param(
    [string[]]$Roots,
    [int]$ChildLimit = 15,
    [int]$LowSpaceThresholdPercent = 15
  )

  $summaries = New-Object System.Collections.Generic.List[object]
  foreach ($root in $Roots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $childDirectories = @(
      Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { -not (Test-ExcludedScanPath -Path $_.FullName) }
    )

    if ($childDirectories.Count -eq 0) {
      $summaries.Add((Get-DirectoryUsage -Path $root -Root $root -Depth 0)) | Out-Null
      continue
    }

    $childSummaries = @(
      $childDirectories |
        ForEach-Object { Get-DirectoryUsage -Path $_.FullName -Root $root -Depth 1 } |
        Sort-Object -Property @{ Expression = "totalBytes"; Descending = $true }, @{ Expression = "path"; Descending = $false } |
        Select-Object -First $ChildLimit
    )

    foreach ($summary in $childSummaries) {
      $summaries.Add($summary) | Out-Null
    }
  }

  return [ordered]@{
    generatedAt = Get-IsoNow
    scanRoots = @($Roots)
    childLimit = $ChildLimit
    lowSpaceThresholdPercent = $LowSpaceThresholdPercent
    scannedFolders = @($summaries | Sort-Object totalBytes -Descending)
  }
}

function Get-ConfiguredBackupKeywords {
  $raw = [Environment]::GetEnvironmentVariable("BACKUP_TASK_KEYWORDS", "Process")
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @("backup", "file history", "filehistory", "regidlebackup", "veeam", "archive", "robocopy", "clone")
  }

  return @(
    $raw -split "[;\r\n,]+" |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -Unique
  )
}

function Test-BackupTaskMatch {
  param(
    [object]$Task,
    [string[]]$Keywords
  )

  $haystack = @(
    [string]$Task.name
    [string]$Task.path
    @($Task.actions)
  ) -join " "

  $normalized = $haystack.ToLowerInvariant()
  foreach ($keyword in $Keywords) {
    if ($normalized.Contains($keyword)) {
      return $true
    }
  }

  return $false
}

function Get-BackupTaskSnapshot {
  param(
    [object[]]$Tasks,
    [string[]]$Keywords,
    [int]$StaleAfterHours = 48
  )

  $cutoff = (Get-Date).ToUniversalTime().AddHours(-1 * $StaleAfterHours)
  $backupTasks = New-Object System.Collections.Generic.List[object]

  foreach ($task in $Tasks) {
    if (-not (Test-BackupTaskMatch -Task $task -Keywords $Keywords)) {
      continue
    }

    $reasons = New-Object System.Collections.Generic.List[string]
    $issue = "none"
    $lastRunUtc = $null
    if ($task.lastRunTime) {
      try {
        $lastRunUtc = [DateTimeOffset]::Parse([string]$task.lastRunTime).UtcDateTime
      } catch {
        $lastRunUtc = $null
      }
    }

    if (-not $task.enabled) {
      $issue = "warning"
      $reasons.Add("task disabled") | Out-Null
    }

    if ($null -ne $task.lastTaskResult -and [int64]$task.lastTaskResult -ne 0) {
      $issue = "failure"
      $reasons.Add("non-zero last task result") | Out-Null
    }

    if (-not $lastRunUtc -and $task.enabled) {
      if ($issue -eq "none") {
        $issue = "warning"
      }
      $reasons.Add("never ran") | Out-Null
    } elseif ($lastRunUtc -and $lastRunUtc -lt $cutoff -and $task.enabled) {
      if ($issue -eq "none") {
        $issue = "warning"
      }
      $reasons.Add("last run is stale") | Out-Null
    }

    $shouldFlagMissingNextRun = (
      -not $task.nextRunTime -and
      $task.enabled -and
      $task.state -ne "Running" -and
      (
        -not $lastRunUtc -or
        ($lastRunUtc -and $lastRunUtc -lt $cutoff) -or
        ($null -ne $task.lastTaskResult -and [int64]$task.lastTaskResult -ne 0)
      )
    )

    if ($shouldFlagMissingNextRun) {
      if ($issue -eq "none") {
        $issue = "warning"
      }
      $reasons.Add("no next run scheduled") | Out-Null
    }

    $backupTasks.Add([ordered]@{
        name = [string]$task.name
        path = [string]$task.path
        displayPath = ([string]$task.path + [string]$task.name)
        state = [string]$task.state
        enabled = [bool]$task.enabled
        lastRunTime = if ($task.lastRunTime) { [string]$task.lastRunTime } else { $null }
        nextRunTime = if ($task.nextRunTime) { [string]$task.nextRunTime } else { $null }
        lastTaskResult = if ($null -ne $task.lastTaskResult) { [int64]$task.lastTaskResult } else { $null }
        stale = [bool]($lastRunUtc -and $lastRunUtc -lt $cutoff)
        issue = $issue
        reasons = $reasons.ToArray()
        actions = @($task.actions)
      }) | Out-Null
  }

  $taskArray = @($backupTasks | Sort-Object displayPath)
  return [ordered]@{
    generatedAt = Get-IsoNow
    staleAfterHours = $StaleAfterHours
    taskKeywords = @($Keywords)
    taskCount = $taskArray.Count
    healthyCount = @($taskArray | Where-Object { $_.issue -eq "none" }).Count
    warningCount = @($taskArray | Where-Object { $_.issue -eq "warning" }).Count
    failureCount = @($taskArray | Where-Object { $_.issue -eq "failure" }).Count
    tasks = $taskArray
  }
}

function Resolve-EndpointCheckDefinitions {
  param(
    [string]$PlexLocalUrl
  )

  $definitions = New-Object System.Collections.Generic.List[object]
  $seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)

  $port = Get-IntegerEnvValue -Name "PORT" -Default 8787 -Min 1 -Max 65535
  $localHealthUrl = [Environment]::GetEnvironmentVariable("MCP_HEALTH_URL", "Process")
  if ([string]::IsNullOrWhiteSpace($localHealthUrl)) {
    $candidateUrls = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in @("http://127.0.0.1:${port}/health", "http://127.0.0.1:8788/health")) {
      if (-not $candidateUrls.Contains($candidate)) {
        $candidateUrls.Add($candidate) | Out-Null
      }
    }

    foreach ($candidate in $candidateUrls) {
      try {
        Invoke-WebRequest -UseBasicParsing -Uri $candidate -Method Get -TimeoutSec 2 -ErrorAction Stop | Out-Null
        $localHealthUrl = $candidate
        break
      } catch {
      }
    }

    if ([string]::IsNullOrWhiteSpace($localHealthUrl) -and $candidateUrls.Count -gt 0) {
      $localHealthUrl = $candidateUrls[0]
    }
  }

  $items = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($localHealthUrl)) {
    $items.Add("mcp-local=$($localHealthUrl.Trim())") | Out-Null
  }
  $items.Add("plex-local=${PlexLocalUrl}/identity") | Out-Null

  $serverUrl = [Environment]::GetEnvironmentVariable("MCP_SERVER_URL", "Process")
  if (-not [string]::IsNullOrWhiteSpace($serverUrl)) {
    try {
      $serverUri = [System.Uri]::new($serverUrl)
      $publicHealth = [System.Uri]::new($serverUri, "/health").AbsoluteUri
      $items.Add("mcp-public=${publicHealth}") | Out-Null
    } catch {
    }
  }

  $raw = [Environment]::GetEnvironmentVariable("NETWORK_ENDPOINT_CHECKS", "Process")
  if (-not [string]::IsNullOrWhiteSpace($raw)) {
    foreach ($item in @(
      $raw -split "[;\r\n]+" |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )) {
      $items.Add($item) | Out-Null
    }
  }

  foreach ($item in $items) {
    $name = $null
    $url = $null
    if ($item.Contains("=")) {
      $parts = $item.Split("=", 2)
      $name = $parts[0].Trim()
      $url = $parts[1].Trim()
    } else {
      $url = $item.Trim()
      $name = "endpoint-" + ($definitions.Count + 1)
    }

    if ([string]::IsNullOrWhiteSpace($url) -or $seen.Contains($url)) {
      continue
    }

    try {
      $uri = [System.Uri]::new($url)
      if ($uri.Scheme -notin @("http", "https")) {
        continue
      }

      $seen.Add($url) | Out-Null
      $definitions.Add([ordered]@{
          name = if ([string]::IsNullOrWhiteSpace($name)) { $uri.Host } else { $name }
          url = $uri.AbsoluteUri
        }) | Out-Null
    } catch {
    }
  }

  return $definitions.ToArray()
}

function Invoke-EndpointHealthCheck {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 5
  )

  $started = Get-Date
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -TimeoutSec $TimeoutSeconds -ErrorAction Stop
    $latency = [int][Math]::Round(((Get-Date) - $started).TotalMilliseconds)
    return [ordered]@{
      name = $Name
      url = $Url
      healthy = $true
      statusCode = [int]$response.StatusCode
      statusText = if ($response.StatusDescription) { [string]$response.StatusDescription } else { "OK" }
      latencyMs = $latency
      checkedAt = Get-IsoNow
      error = $null
    }
  } catch {
    $statusCode = $null
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode.value__
      }
    } catch {
      $statusCode = $null
    }

    $latency = [int][Math]::Round(((Get-Date) - $started).TotalMilliseconds)
    return [ordered]@{
      name = $Name
      url = $Url
      healthy = $false
      statusCode = $statusCode
      statusText = $null
      latencyMs = $latency
      checkedAt = Get-IsoNow
      error = $_.Exception.Message
    }
  }
}

function Get-EndpointHealthSnapshot {
  param(
    [string]$PlexLocalUrl,
    [int]$TimeoutSeconds = 5
  )

  $definitions = Resolve-EndpointCheckDefinitions -PlexLocalUrl $PlexLocalUrl
  return @(
    $definitions |
      ForEach-Object { Invoke-EndpointHealthCheck -Name $_.name -Url $_.url -TimeoutSeconds $TimeoutSeconds }
  )
}

function Get-TailscaleCommand {
  $configured = [Environment]::GetEnvironmentVariable("TAILSCALE_EXE", "Process")
  if (-not [string]::IsNullOrWhiteSpace($configured) -and (Test-Path $configured)) {
    return [ordered]@{
      Source = $configured
    }
  }

  $defaultPath = "C:\Program Files\Tailscale\tailscale.exe"
  if (Test-Path $defaultPath) {
    return [ordered]@{
      Source = $defaultPath
    }
  }

  return Get-Command tailscale -ErrorAction SilentlyContinue
}

function Parse-TailscaleProxyTargets {
  param([string]$Output)

  if ([string]::IsNullOrWhiteSpace($Output)) {
    return @()
  }

  $targets = New-Object System.Collections.Generic.List[string]
  $currentUrl = $null
  foreach ($line in ($Output -split "\r?\n")) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed -match "^(https?://\S+)") {
      $currentUrl = $matches[1]
      if (-not $targets.Contains($currentUrl)) {
        $targets.Add($currentUrl) | Out-Null
      }
      continue
    }

    if ($trimmed -match "^\|--\s+(.*)$" -and $currentUrl) {
      $mapped = "${currentUrl} -> $($matches[1].Trim())"
      if ($targets.Contains($currentUrl)) {
        $targets.Remove($currentUrl) | Out-Null
      }
      if (-not $targets.Contains($mapped)) {
        $targets.Add($mapped) | Out-Null
      }
      $currentUrl = $null
    }
  }

  return $targets.ToArray()
}

function Get-TailscaleStatusSnapshot {
  $command = Get-TailscaleCommand
  if (-not $command) {
    return [ordered]@{
      installed = $false
      checkedAt = Get-IsoNow
      funnelEnabled = $false
      serveEnabled = $false
      funnelTargets = @()
      serveTargets = @()
      peers = @()
    }
  }

  $versionOutput = & $command.Source version 2>$null
  $version = if ($LASTEXITCODE -eq 0 -and $versionOutput) { ([string]($versionOutput | Select-Object -First 1)).Trim() } else { $null }

  $statusJson = $null
  $statusOutput = & $command.Source status --json 2>$null
  if ($LASTEXITCODE -eq 0 -and $statusOutput) {
    try {
      $statusJson = $statusOutput | ConvertFrom-Json
    } catch {
      $statusJson = $null
    }
  }

  $funnelRaw = & $command.Source funnel status 2>$null
  $funnelTargets = if ($LASTEXITCODE -eq 0) { Parse-TailscaleProxyTargets -Output ($funnelRaw -join "`n") } else { @() }
  $serveRaw = & $command.Source serve status 2>$null
  $serveTargets = if ($LASTEXITCODE -eq 0) { Parse-TailscaleProxyTargets -Output ($serveRaw -join "`n") } else { @() }

  $peerEntries = New-Object System.Collections.Generic.List[object]
  if ($statusJson -and $statusJson.Peer) {
    foreach ($property in $statusJson.Peer.PSObject.Properties) {
      $peer = $property.Value
      $peerEntries.Add([ordered]@{
          name = if ($peer.HostName) { [string]$peer.HostName } elseif ($peer.DNSName) { [string]$peer.DNSName } else { [string]$property.Name }
          dnsName = if ($peer.DNSName) { ([string]$peer.DNSName).TrimEnd(".") } else { $null }
          os = if ($peer.OS) { [string]$peer.OS } else { $null }
          online = if ($null -ne $peer.Online) { [bool]$peer.Online } else { $null }
          active = if ($null -ne $peer.Active) { [bool]$peer.Active } else { $null }
          tailnetIps = @($peer.TailscaleIPs)
        }) | Out-Null
    }
  }

  $self = if ($statusJson) { $statusJson.Self } else { $null }
  return [ordered]@{
    installed = $true
    checkedAt = Get-IsoNow
    version = $version
    backendState = if ($statusJson) { [string]$statusJson.BackendState } else { $null }
    tailnetName = if ($statusJson -and $statusJson.CurrentTailnet) { [string]$statusJson.CurrentTailnet.Name } else { $null }
    magicDnsEnabled = if ($statusJson -and $statusJson.CurrentTailnet -and $null -ne $statusJson.CurrentTailnet.MagicDNSEnabled) { [bool]$statusJson.CurrentTailnet.MagicDNSEnabled } else { $null }
    magicDnsSuffix = if ($statusJson -and $statusJson.CurrentTailnet) { [string]$statusJson.CurrentTailnet.MagicDNSSuffix } else { $null }
    selfHostName = if ($self -and $self.HostName) { [string]$self.HostName } else { $null }
    selfDnsName = if ($self -and $self.DNSName) { ([string]$self.DNSName).TrimEnd(".") } else { $null }
    selfOnline = if ($self -and $null -ne $self.Online) { [bool]$self.Online } else { $null }
    tailscaleIps = if ($statusJson) { @($statusJson.TailscaleIPs) } else { @() }
    peerCount = $peerEntries.Count
    onlinePeerCount = @($peerEntries.ToArray() | Where-Object { $_.online -eq $true }).Count
    activePeerCount = @($peerEntries.ToArray() | Where-Object { $_.active -eq $true }).Count
    funnelEnabled = $funnelTargets.Count -gt 0
    serveEnabled = $serveTargets.Count -gt 0
    funnelTargets = @($funnelTargets)
    serveTargets = @($serveTargets)
    peers = @($peerEntries.ToArray() | Sort-Object name)
  }
}

function Get-DockerExposureKind {
  param([string]$Ports)

  if ([string]::IsNullOrWhiteSpace($Ports)) {
    return "internal"
  }

  if ($Ports -match "0\.0\.0\.0:|\[::\]:|:::") {
    return "public"
  }

  if ($Ports -match "127\.0\.0\.1:|localhost:|\[::1\]:") {
    return "local-only"
  }

  if ($Ports.Contains("->")) {
    return "host-ip"
  }

  return "internal"
}

function Test-PublicEndpointUrl {
  param([string]$Url)

  try {
    $uri = [System.Uri]::new($Url)
    return $uri.Host -notin @("localhost", "127.0.0.1", "::1")
  } catch {
    return $false
  }
}

function Get-PublicExposureSnapshot {
  param(
    [object]$TailscaleSnapshot,
    [object[]]$EndpointChecks,
    [object[]]$DockerContainers
  )

  $items = New-Object System.Collections.Generic.List[object]
  $funnelTargets = @()
  $serveTargets = @()
  $funnelEnabled = $false
  $serveEnabled = $false

  if ($TailscaleSnapshot) {
    if ($TailscaleSnapshot -is [System.Collections.IDictionary]) {
      $funnelTargets = @($TailscaleSnapshot["funnelTargets"])
      $serveTargets = @($TailscaleSnapshot["serveTargets"])
      $funnelEnabled = [bool]$TailscaleSnapshot["funnelEnabled"]
      $serveEnabled = [bool]$TailscaleSnapshot["serveEnabled"]
    } else {
      $funnelTargets = @($TailscaleSnapshot.funnelTargets)
      $serveTargets = @($TailscaleSnapshot.serveTargets)
      $funnelEnabled = [bool]$TailscaleSnapshot.funnelEnabled
      $serveEnabled = [bool]$TailscaleSnapshot.serveEnabled
    }
  }

  foreach ($funnelTarget in $funnelTargets) {
    $items.Add([ordered]@{
        kind = "funnel"
        label = "Tailscale Funnel"
        target = [string]$funnelTarget
        details = "Public HTTPS exposure"
      }) | Out-Null
  }

  foreach ($serveTarget in $serveTargets) {
    $items.Add([ordered]@{
        kind = "serve"
        label = "Tailscale Serve"
        target = [string]$serveTarget
        details = "Tailnet or local proxy exposure"
      }) | Out-Null
  }

  foreach ($container in $DockerContainers) {
    $kind = Get-DockerExposureKind -Ports ([string]$container.ports)
    if ($kind -eq "public" -or $kind -eq "host-ip") {
      $items.Add([ordered]@{
          kind = if ($kind -eq "public") { "docker-public" } else { "docker-host-ip" }
          label = [string]$container.name
          target = [string]$container.ports
          details = if ($container.composeProject) { "compose " + [string]$container.composeProject } else { [string]$container.image }
        }) | Out-Null
    }
  }

  foreach ($endpoint in $EndpointChecks) {
    if (Test-PublicEndpointUrl -Url ([string]$endpoint.url)) {
      $items.Add([ordered]@{
          kind = "endpoint"
          label = [string]$endpoint.name
          target = [string]$endpoint.url
          details = if ($endpoint.healthy) { "healthy" } else { "unhealthy" }
        }) | Out-Null
    }
  }

  $result = @{}
  $result["generatedAt"] = (Get-IsoNow)
  $result["funnelEnabled"] = $funnelEnabled
  $result["serveEnabled"] = $serveEnabled
  $result["exposedItems"] = $items.ToArray()
  return $result
}

function Get-TextFilePreview {
  param(
    [string]$Path,
    [int]$PreviewChars
  )

  try {
    $raw = Get-Content -Path $Path -Raw -ErrorAction Stop
    if ([string]::IsNullOrEmpty($raw)) {
      return ""
    }

    $trimmed = $raw.Trim()
    if ($trimmed.Length -le $PreviewChars) {
      return $trimmed
    }

    return $trimmed.Substring(0, $PreviewChars) + "..."
  } catch {
    return $null
  }
}

function Get-FileCatalogSnapshot {
  param(
    [string[]]$Roots,
    [string[]]$TextExtensions,
    [int]$MaxFiles = 500,
    [int]$PreviewChars = 2000
  )

  $items = New-Object System.Collections.Generic.List[object]
  $skippedRoots = New-Object System.Collections.Generic.List[string]
  foreach ($root in $Roots) {
    if (-not (Test-Path $root)) {
      $skippedRoots.Add($root) | Out-Null
      continue
    }

    foreach ($file in Get-ChildItem -Path $root -File -Recurse -Force -ErrorAction SilentlyContinue) {
      if ($items.Count -ge $MaxFiles) {
        break
      }

      if (Test-ExcludedScanPath -Path $file.FullName) {
        continue
      }

      $extension = if ($file.Extension) { $file.Extension.ToLowerInvariant() } else { "" }
      $isText = $TextExtensions -contains $extension
      $preview = if ($isText) { Get-TextFilePreview -Path $file.FullName -PreviewChars $PreviewChars } else { $null }
      $items.Add([ordered]@{
          path = [string]$file.FullName
          root = [string]$root
          relativePath = Convert-ToRelativePath -Root $root -Path $file.FullName
          name = [string]$file.Name
          extension = $extension
          sizeBytes = [int64]$file.Length
          modifiedAt = $file.LastWriteTimeUtc.ToString("o")
          kind = if ($isText) { "text" } else { "binary" }
          preview = $preview
        }) | Out-Null
      }
    }
  return [ordered]@{
    generatedAt = Get-IsoNow
    roots = @($Roots)
    indexedFileCount = $items.Count
    skippedRoots = $skippedRoots.ToArray()
    maxFiles = $MaxFiles
    items = $items.ToArray()
  }
}

function Parse-GitBranchStatus {
  param([string]$HeaderLine)

  $result = [ordered]@{
    branch = $null
    ahead = $null
    behind = $null
  }

  if ([string]::IsNullOrWhiteSpace($HeaderLine)) {
    return $result
  }

  if ($HeaderLine -match "^##\s+([^\.\s]+)(?:\.\.\.[^\s]+)?(?:\s+\[(.+)\])?") {
    $result.branch = $Matches[1]
    $decorators = $Matches[2]
    if ($decorators) {
      if ($decorators -match "ahead (\d+)") {
        $result.ahead = [int]$Matches[1]
      }
      if ($decorators -match "behind (\d+)") {
        $result.behind = [int]$Matches[1]
      }
    }
  }

  return $result
}

function Get-RepoStatusSnapshot {
  param(
    [string[]]$Roots,
    [int]$MaxDepth = 4
  )

  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    return [ordered]@{
      generatedAt = Get-IsoNow
      roots = @($Roots)
      repoCount = 0
      skippedRoots = @($Roots)
      repos = @()
    }
  }

  $repoPaths = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
  $skippedRoots = New-Object System.Collections.Generic.List[string]

  foreach ($root in $Roots) {
    if (-not (Test-Path $root)) {
      $skippedRoots.Add($root) | Out-Null
      continue
    }

    if (Test-Path (Join-Path $root ".git")) {
      $null = $repoPaths.Add((Resolve-Path $root).Path)
    }

    foreach ($gitEntry in Get-ChildItem -Path $root -Force -Recurse -Depth $MaxDepth -Filter ".git" -ErrorAction SilentlyContinue) {
      if (Test-ExcludedScanPath -Path $gitEntry.FullName) {
        continue
      }

      $repoPath = Split-Path -Path $gitEntry.FullName -Parent
      if (Test-Path $repoPath) {
        $null = $repoPaths.Add((Resolve-Path $repoPath).Path)
      }
    }
  }

  $repos = New-Object System.Collections.Generic.List[object]
  foreach ($repoPath in @($repoPaths | Sort-Object)) {
    $statusLines = @(& $git.Source -C $repoPath status --porcelain=v1 --branch 2>$null)
    if ($LASTEXITCODE -ne 0) {
      continue
    }

    $branchInfo = Parse-GitBranchStatus -HeaderLine $(if ($statusLines.Count -gt 0) { [string]$statusLines[0] } else { $null })
    $stagedCount = 0
    $modifiedCount = 0
    $untrackedCount = 0
    foreach ($line in @($statusLines | Select-Object -Skip 1)) {
      $text = [string]$line
      if ($text.StartsWith("??")) {
        $untrackedCount += 1
        continue
      }
      if ($text.Length -ge 2) {
        if ($text[0] -ne ' ') { $stagedCount += 1 }
        if ($text[1] -ne ' ') { $modifiedCount += 1 }
      }
    }

    $remote = @(& $git.Source -C $repoPath remote get-url origin 2>$null | Select-Object -First 1)
    $lastCommitAt = @(& $git.Source -C $repoPath log -1 --format=%cI 2>$null | Select-Object -First 1)
    $lastCommitSummary = @(& $git.Source -C $repoPath log -1 --format=%s 2>$null | Select-Object -First 1)
    $repos.Add([ordered]@{
        name = Split-Path -Path $repoPath -Leaf
        path = [string]$repoPath
        branch = if ($branchInfo.branch) { [string]$branchInfo.branch } else { $null }
        remote = if ($remote) { [string]$remote[0] } else { $null }
        dirty = ($stagedCount + $modifiedCount + $untrackedCount) -gt 0
        ahead = $branchInfo.ahead
        behind = $branchInfo.behind
        stagedCount = $stagedCount
        modifiedCount = $modifiedCount
        untrackedCount = $untrackedCount
        lastCommitAt = if ($lastCommitAt) { [string]$lastCommitAt[0] } else { $null }
        lastCommitSummary = if ($lastCommitSummary) { [string]$lastCommitSummary[0] } else { $null }
      }) | Out-Null
  }

  return [ordered]@{
    generatedAt = Get-IsoNow
    roots = @($Roots)
    repoCount = $repos.Count
    skippedRoots = $skippedRoots.ToArray()
    repos = @($repos.ToArray() | Sort-Object name)
  }
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
        name = if ($mount.Name) { [string]$mount.Name } else { $null }
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

function Get-DockerVolumes {
  param(
    [System.Management.Automation.CommandInfo]$DockerCommand,
    [object[]]$Containers
  )

  $volumes = @()
  if ($null -eq $DockerCommand) {
    return $volumes
  }

  $rawVolumes = & $DockerCommand.Source volume ls --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawVolumes) {
    return $volumes
  }

  $attachedContainersByVolume = @{}
  foreach ($container in @($Containers)) {
    foreach ($mount in @($container.mounts)) {
      if ($mount.type -ne "volume" -or [string]::IsNullOrWhiteSpace($mount.name)) {
        continue
      }

      if (-not $attachedContainersByVolume.ContainsKey($mount.name)) {
        $attachedContainersByVolume[$mount.name] = @()
      }
      $attachedContainersByVolume[$mount.name] += [string]$container.name
    }
  }

  $volumeNames = @($rawVolumes | ForEach-Object { ($_ | ConvertFrom-Json).Name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $volumeInspectIndex = @{}
  if ($volumeNames.Count -gt 0) {
    $rawInspect = & $DockerCommand.Source volume inspect $volumeNames 2>$null
    if ($LASTEXITCODE -eq 0 -and $rawInspect) {
      $parsedInspect = (($rawInspect | Out-String) | ConvertFrom-Json)
      foreach ($record in @($parsedInspect)) {
        $volumeInspectIndex[[string]$record.Name] = $record
      }
    }
  }

  foreach ($line in @($rawVolumes)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $labels = if ($record.Labels) { [string]$record.Labels } else { "" }
    $inspect = $volumeInspectIndex[[string]$record.Name]
    $attachedContainers = @(
      @($attachedContainersByVolume[[string]$record.Name]) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
    )

    $volumes += [ordered]@{
      name = [string]$record.Name
      driver = [string]$record.Driver
      scope = [string]$record.Scope
      mountpoint = if ($inspect -and $inspect.Mountpoint) { [string]$inspect.Mountpoint } elseif ($record.Mountpoint) { [string]$record.Mountpoint } else { $null }
      createdAt = if ($inspect -and $inspect.CreatedAt) { Convert-DockerDateValue -Value ([string]$inspect.CreatedAt) } else { $null }
      anonymous = ($labels -match "com.docker.volume.anonymous")
      inUse = ($attachedContainers.Count -gt 0)
      attachedContainers = $attachedContainers
    }
  }

  return $volumes
}

function Get-DockerSystemStorage {
  param([System.Management.Automation.CommandInfo]$DockerCommand)

  $storage = @()
  if ($null -eq $DockerCommand) {
    return $storage
  }

  $rawStorage = & $DockerCommand.Source system df --format '{{json .}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawStorage) {
    return $storage
  }

  foreach ($line in @($rawStorage)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $record = $line | ConvertFrom-Json
    $totalCount = $null
    if ($record.TotalCount) {
      $parsedTotal = 0
      if ([int]::TryParse([string]$record.TotalCount, [ref]$parsedTotal)) {
        $totalCount = $parsedTotal
      }
    }

    $active = $null
    if ($record.Active -and $record.Active -ne "N/A") {
      $parsedActive = 0
      if ([int]::TryParse([string]$record.Active, [ref]$parsedActive)) {
        $active = $parsedActive
      }
    }

    $storage += [ordered]@{
      type = [string]$record.Type
      totalCount = $totalCount
      active = $active
      size = if ($record.Size) { [string]$record.Size } else { $null }
      reclaimable = if ($record.Reclaimable) { [string]$record.Reclaimable } else { $null }
    }
  }

  return $storage
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

$refreshStartedAt = Get-IsoNow
$refreshWarnings = New-Object System.Collections.Generic.List[string]
$refreshErrors = New-Object System.Collections.Generic.List[string]

Acquire-RefreshLock -Path $refreshLockPath
Write-RefreshStatus `
  -RunState "running" `
  -Ok $null `
  -StartedAt $refreshStartedAt `
  -CompletedAt $null `
  -DurationSeconds $null `
  -Warnings @($refreshWarnings) `
  -Errors @($refreshErrors) `
  -Scheduler (Get-RefreshSchedulerInfo -TaskName $refreshTaskName) `
  -Outputs ([ordered]@{
      windowsHostStatus = Get-RefreshOutputSummary -Path $hostStatusPath
      plexLibraryIndex = Get-RefreshOutputSummary -Path $plexIndexPath
      plexActivity = Get-RefreshOutputSummary -Path $plexActivityPath
      fileCatalog = Get-RefreshOutputSummary -Path $fileCatalogPath
      repoStatus = Get-RefreshOutputSummary -Path $repoStatusPath
    })

try {
  $os = Get-CimInstance Win32_OperatingSystem
  $bootTime = $os.LastBootUpTime
  $uptimeSpan = (Get-Date) - $bootTime
  $uptimeText = "{0}d {1}h {2}m" -f [Math]::Floor($uptimeSpan.TotalDays), $uptimeSpan.Hours, $uptimeSpan.Minutes
  $resources = Get-HostResourceSnapshot -OperatingSystem $os
  $services = @(Get-WindowsServiceSnapshot)
  $scheduledTasks = @(Get-ScheduledTaskSnapshot)
  $listeningPorts = @(Get-ListeningPortsSnapshot -Services $services)
  $backupKeywords = Get-ConfiguredBackupKeywords
  $backupStaleHours = Get-IntegerEnvValue -Name "BACKUP_STALE_HOURS" -Default 48 -Min 1 -Max (24 * 365)
  $backupSnapshot = Get-BackupTaskSnapshot -Tasks $scheduledTasks -Keywords $backupKeywords -StaleAfterHours $backupStaleHours

  $fileIndexRoots = Resolve-ConfiguredPaths -RawValue $env:FILE_INDEX_ROOTS -DefaultRelativePaths @("notes")
  $rawFileExtensions = if (-not [string]::IsNullOrWhiteSpace($env:FILE_INDEX_TEXT_EXTENSIONS)) {
    @(
      $env:FILE_INDEX_TEXT_EXTENSIONS -split "[;\r\n,]+" |
        ForEach-Object { $_.Trim().ToLowerInvariant() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { if ($_.StartsWith(".")) { $_ } else { ".$_" } }
    )
  } else {
    @(".md", ".txt", ".json", ".yaml", ".yml", ".log", ".ps1", ".ts", ".js", ".tsx", ".jsx")
  }
  $fileMaxFiles = 500
  if (-not [string]::IsNullOrWhiteSpace($env:FILE_INDEX_MAX_FILES)) {
    $parsedFileMax = 0
    if ([int]::TryParse($env:FILE_INDEX_MAX_FILES, [ref]$parsedFileMax) -and $parsedFileMax -gt 0) {
      $fileMaxFiles = $parsedFileMax
    }
  }
  $filePreviewChars = 2000
  if (-not [string]::IsNullOrWhiteSpace($env:FILE_INDEX_PREVIEW_CHARS)) {
    $parsedPreviewChars = 0
    if ([int]::TryParse($env:FILE_INDEX_PREVIEW_CHARS, [ref]$parsedPreviewChars) -and $parsedPreviewChars -gt 0) {
      $filePreviewChars = $parsedPreviewChars
    }
  }
  $fileCatalogSnapshot = Get-FileCatalogSnapshot -Roots $fileIndexRoots -TextExtensions $rawFileExtensions -MaxFiles $fileMaxFiles -PreviewChars $filePreviewChars
  $storageScanRoots = if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("STORAGE_SCAN_ROOTS", "Process"))) {
    @($fileIndexRoots)
  } else {
    Resolve-ConfiguredPaths -RawValue $env:STORAGE_SCAN_ROOTS
  }
  $storageChildLimit = Get-IntegerEnvValue -Name "STORAGE_SCAN_CHILD_LIMIT" -Default 15 -Min 1 -Max 50
  $storageLowSpacePercent = Get-IntegerEnvValue -Name "STORAGE_LOW_SPACE_PERCENT" -Default 15 -Min 1 -Max 75
  $storageSnapshot = Get-StorageFolderSnapshot -Roots $storageScanRoots -ChildLimit $storageChildLimit -LowSpaceThresholdPercent $storageLowSpacePercent

  $repoScanRoots = Resolve-ConfiguredPaths -RawValue $env:REPO_SCAN_ROOTS -DefaultRelativePaths @(".")
  $repoScanMaxDepth = 4
  if (-not [string]::IsNullOrWhiteSpace($env:REPO_SCAN_MAX_DEPTH)) {
    $parsedRepoDepth = 0
    if ([int]::TryParse($env:REPO_SCAN_MAX_DEPTH, [ref]$parsedRepoDepth) -and $parsedRepoDepth -ge 0) {
      $repoScanMaxDepth = $parsedRepoDepth
    }
  }
  $repoStatusSnapshot = Get-RepoStatusSnapshot -Roots $repoScanRoots -MaxDepth $repoScanMaxDepth

  $dockerProcesses = Get-ProcessNames -Names @("Docker Desktop", "com.docker.backend", "docker-agent", "docker-sandbox")
  $dockerServices = Convert-ServiceState -Names @("com.docker.service")
  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  $dockerCliVersion = $null
  $dockerContainers = @()
  $dockerImages = @()
  $dockerNetworks = @()
  $dockerVolumes = @()
  $dockerStorage = @()
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
    $dockerVolumes = @(Get-DockerVolumes -DockerCommand $dockerCommand -Containers $dockerContainers)
    $dockerStorage = @(Get-DockerSystemStorage -DockerCommand $dockerCommand)
  } else {
    $refreshWarnings.Add("Docker CLI was not available during snapshot refresh. Existing Docker data may be stale.") | Out-Null
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
  $dockerVolumeCount = @($dockerVolumes).Count
  $dockerComposeProjectCount = @(
    $dockerContainers |
      ForEach-Object { $_["composeProject"] } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -Unique
  ).Count
  $dockerRunning = $dockerProcesses.Count -gt 0
  $dockerStatus = if ($dockerRunning -and $dockerProblemCount -eq 0) { "healthy" } elseif ($dockerRunning -or $dockerServices.Count -gt 0) { "degraded" } else { "offline" }
  $dockerDetails = "Processes: $(Format-ProcessSummary -Processes $dockerProcesses). Services: $(Format-ServiceSummary -Services $dockerServices). Containers: $dockerRunningCount running, $dockerExitedCount exited, $dockerUnhealthyCount unhealthy, $dockerProblemCount problems. Images: $dockerImageCount. Networks: $dockerNetworkCount. Volumes: $dockerVolumeCount. Compose projects: $dockerComposeProjectCount."
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
  $endpointTimeoutSeconds = Get-IntegerEnvValue -Name "NETWORK_CHECK_TIMEOUT_SECONDS" -Default 5 -Min 1 -Max 30
  $endpointChecks = @(Get-EndpointHealthSnapshot -PlexLocalUrl $plexLocalUrl -TimeoutSeconds $endpointTimeoutSeconds)
  $tailscaleSnapshot = Get-TailscaleStatusSnapshot
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

  if ([string]::IsNullOrWhiteSpace($plexToken)) {
    $refreshWarnings.Add("No Plex token was found. Continue-watching, on-deck, and history snapshots may be incomplete.") | Out-Null
  }

  try {
    $plexIdentity = Invoke-RestMethod -Uri "$plexLocalUrl/identity" -TimeoutSec 3
  } catch {
    $plexIdentity = $null
    $refreshWarnings.Add("Plex identity probe failed. Plex runtime status may be degraded or offline.") | Out-Null
  }

  $plexIndexSummary = $null
  $python = Get-Command python -ErrorAction SilentlyContinue
  $plexIndexTempPath = Join-Path $dataDir ("plex-library-index." + [System.IO.Path]::GetRandomFileName() + ".json")

  if ($python -and (Test-Path $plexDbPath) -and (Test-Path $pythonScriptPath)) {
    $rawSummary = & $python.Source $pythonScriptPath --db-path $plexDbPath --output $plexIndexTempPath
    if ($LASTEXITCODE -eq 0 -and $rawSummary) {
      $plexIndexSummary = $rawSummary | ConvertFrom-Json
      if (Test-Path $plexIndexTempPath) {
        Move-Item -Path $plexIndexTempPath -Destination $plexIndexPath -Force
      }
    } else {
      $refreshWarnings.Add("Plex library export did not complete successfully. Existing Plex library data may be stale.") | Out-Null
    }
  } else {
    $refreshWarnings.Add("Plex library export was skipped because Python, the Plex database, or the export script was unavailable. Existing Plex library data may be stale.") | Out-Null
  }

  if (Test-Path $plexIndexTempPath) {
    Remove-Item -Path $plexIndexTempPath -Force -ErrorAction SilentlyContinue
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
  $publicExposureSnapshot = Get-PublicExposureSnapshot -TailscaleSnapshot $tailscaleSnapshot -EndpointChecks $endpointChecks -DockerContainers $dockerContainers

  $cpuLoadText = if ($null -ne $resources.cpu.loadPercent) { "$([Math]::Round([double]$resources.cpu.loadPercent, 1))%" } else { "unknown" }
  $memoryUsedText = "$([Math]::Round([double]$resources.memory.percentUsed, 1))%"
  $systemComponent = New-Component -Name "system" -Status "healthy" -Details "Windows host up for $uptimeText. CPU load $cpuLoadText. Memory $memoryUsedText used."

  $components = @(
    $systemComponent
    $dockerComponent
    $corsairComponent
    $plexComponent
  )

  $healthyComponents = ($components | Where-Object { $_.status -eq "healthy" }).Count
  $degradedComponents = ($components | Where-Object { $_.status -eq "degraded" }).Count
  $lowSpaceDiskCount = @($resources.disks | Where-Object { $null -ne $_.percentFree -and $_.percentFree -le $storageLowSpacePercent }).Count
  $backupIssueCount = $backupSnapshot.warningCount + $backupSnapshot.failureCount
  $unhealthyEndpointCount = @($endpointChecks | Where-Object { -not $_.healthy }).Count
  $summary = "Windows host status refreshed: $healthyComponents healthy, $degradedComponents degraded, $($components.Count - $healthyComponents - $degradedComponents) offline. Storage low-space disks: $lowSpaceDiskCount. Backup issues: $backupIssueCount. Unhealthy endpoints: $unhealthyEndpointCount."

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
    resources = $resources
    components = $components
    services = $services
    scheduledTasks = $scheduledTasks
    listeningPorts = $listeningPorts
    storage = $storageSnapshot
    backups = $backupSnapshot
    endpointChecks = $endpointChecks
    tailscale = $tailscaleSnapshot
    publicExposure = $publicExposureSnapshot
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
      volumes = $dockerVolumes
      storage = $dockerStorage
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

  Write-JsonAtomic -Path $hostStatusPath -Value $payload -Depth 8
  Write-JsonAtomic -Path $plexActivityPath -Value $plexActivitySnapshot -Depth 8
  Write-JsonAtomic -Path $fileCatalogPath -Value $fileCatalogSnapshot -Depth 8
  Write-JsonAtomic -Path $repoStatusPath -Value $repoStatusSnapshot -Depth 8

  $completedAt = Get-IsoNow
  $durationSeconds = (([DateTimeOffset]::Parse($completedAt)) - ([DateTimeOffset]::Parse($refreshStartedAt))).TotalSeconds
  $outputs = [ordered]@{
    windowsHostStatus = Get-RefreshOutputSummary -Path $hostStatusPath -SourceTimestamp $payload.generatedAt
    plexLibraryIndex = Get-RefreshOutputSummary -Path $plexIndexPath -SourceTimestamp $(if ($plexIndexSummary) { [string]$plexIndexSummary.generatedAt } else { $null })
    plexActivity = Get-RefreshOutputSummary -Path $plexActivityPath -SourceTimestamp $(if ($plexActivitySnapshot) { [string]$plexActivitySnapshot.fetchedAt } else { $null })
    fileCatalog = Get-RefreshOutputSummary -Path $fileCatalogPath -SourceTimestamp $fileCatalogSnapshot.generatedAt
    repoStatus = Get-RefreshOutputSummary -Path $repoStatusPath -SourceTimestamp $repoStatusSnapshot.generatedAt
  }

  Write-RefreshStatus `
    -RunState "completed" `
    -Ok $true `
    -StartedAt $refreshStartedAt `
    -CompletedAt $completedAt `
    -DurationSeconds $durationSeconds `
    -Warnings @($refreshWarnings) `
    -Errors @($refreshErrors) `
    -Scheduler (Get-RefreshSchedulerInfo -TaskName $refreshTaskName) `
    -Outputs $outputs

  Append-RefreshHistory -Path $snapshotHistoryPath -Entry ([ordered]@{
      checkedAt = Get-IsoNow
      startedAt = $refreshStartedAt
      completedAt = $completedAt
      runState = "completed"
      ok = $true
      durationSeconds = $durationSeconds
      warnings = @($refreshWarnings)
      errors = @($refreshErrors)
      outputs = $outputs
    })

  Write-Host "Wrote host status to $hostStatusPath"
  if (Test-Path $plexIndexPath) {
    Write-Host "Wrote Plex library index to $plexIndexPath"
  }
  Write-Host "Wrote Plex activity snapshot to $plexActivityPath"
  Write-Host "Wrote file catalog snapshot to $fileCatalogPath"
  Write-Host "Wrote repo status snapshot to $repoStatusPath"
  Write-Host "Wrote snapshot status to $snapshotStatusPath"
} catch {
  $message = if ($_.Exception) { $_.Exception.Message } else { $_.ToString() }
  $refreshErrors.Add($message) | Out-Null
  $completedAt = Get-IsoNow
  $durationSeconds = (([DateTimeOffset]::Parse($completedAt)) - ([DateTimeOffset]::Parse($refreshStartedAt))).TotalSeconds

  Write-RefreshStatus `
    -RunState "failed" `
    -Ok $false `
    -StartedAt $refreshStartedAt `
    -CompletedAt $completedAt `
    -DurationSeconds $durationSeconds `
    -Warnings @($refreshWarnings) `
    -Errors @($refreshErrors) `
    -Scheduler (Get-RefreshSchedulerInfo -TaskName $refreshTaskName) `
    -Outputs ([ordered]@{
        windowsHostStatus = Get-RefreshOutputSummary -Path $hostStatusPath
        plexLibraryIndex = Get-RefreshOutputSummary -Path $plexIndexPath
        plexActivity = Get-RefreshOutputSummary -Path $plexActivityPath
        fileCatalog = Get-RefreshOutputSummary -Path $fileCatalogPath
        repoStatus = Get-RefreshOutputSummary -Path $repoStatusPath
      })

  Append-RefreshHistory -Path $snapshotHistoryPath -Entry ([ordered]@{
      checkedAt = Get-IsoNow
      startedAt = $refreshStartedAt
      completedAt = $completedAt
      runState = "failed"
      ok = $false
      durationSeconds = $durationSeconds
      warnings = @($refreshWarnings)
      errors = @($refreshErrors)
      outputs = [ordered]@{
        windowsHostStatus = Get-RefreshOutputSummary -Path $hostStatusPath
        plexLibraryIndex = Get-RefreshOutputSummary -Path $plexIndexPath
        plexActivity = Get-RefreshOutputSummary -Path $plexActivityPath
        fileCatalog = Get-RefreshOutputSummary -Path $fileCatalogPath
        repoStatus = Get-RefreshOutputSummary -Path $repoStatusPath
      }
    })

  throw
} finally {
  Release-RefreshLock -Path $refreshLockPath
}
