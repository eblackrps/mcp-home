Describe "refresh-windows-host helper suite" {
BeforeAll {
  $script:repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  $script:refreshScript = Join-Path $script:repoRoot "scripts\refresh-windows-host.ps1"
  $script:notesPath = (Resolve-Path (Join-Path $script:repoRoot "notes")).Path
  $script:welcomePath = (Resolve-Path (Join-Path $script:notesPath "welcome.md")).Path
  $script:trackedEnvNames = @(
    "MCP_HOME_SKIP_REFRESH_MAIN",
    "MCP_TEST_IMPORT",
    "MCP_TEST_QUOTED",
    "MCP_TEST_INT",
    "BACKUP_TARGET_PATHS"
  )
  $script:originalEnv = @{}
  foreach ($name in $script:trackedEnvNames) {
    $script:originalEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }

  $env:MCP_HOME_SKIP_REFRESH_MAIN = "1"
  . $script:refreshScript
}

BeforeEach {
  foreach ($name in $script:trackedEnvNames) {
    $value = $script:originalEnv[$name]
    if ($null -eq $value) {
      Remove-Item -Path ("Env:" + $name) -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path ("Env:" + $name) -Value $value
    }
  }

  $env:MCP_HOME_SKIP_REFRESH_MAIN = "1"
}

AfterAll {
  foreach ($name in $script:trackedEnvNames) {
    $value = $script:originalEnv[$name]
    if ($null -eq $value) {
      Remove-Item -Path ("Env:" + $name) -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path ("Env:" + $name) -Value $value
    }
  }
}

Describe "refresh-windows-host env and file helpers" {
  It "01 imports nothing when env file is missing" {
    Remove-Item Env:MCP_TEST_IMPORT -ErrorAction SilentlyContinue

    { Import-DotEnvFile -Path (Join-Path $TestDrive "missing.env") } | Should -Not -Throw
    [Environment]::GetEnvironmentVariable("MCP_TEST_IMPORT", "Process") | Should -BeNullOrEmpty
  }

  It "02 imports a new env var from file" {
    Remove-Item Env:MCP_TEST_IMPORT -ErrorAction SilentlyContinue
    $path = Join-Path $TestDrive "sample.env"
    Set-Content -Path $path -Value "MCP_TEST_IMPORT=hello" -Encoding utf8

    Import-DotEnvFile -Path $path

    [Environment]::GetEnvironmentVariable("MCP_TEST_IMPORT", "Process") | Should -Be "hello"
  }

  It "03 does not overwrite an existing env var" {
    Set-Item -Path Env:MCP_TEST_IMPORT -Value "existing"
    $path = Join-Path $TestDrive "sample.env"
    Set-Content -Path $path -Value "MCP_TEST_IMPORT=new-value" -Encoding utf8

    Import-DotEnvFile -Path $path

    [Environment]::GetEnvironmentVariable("MCP_TEST_IMPORT", "Process") | Should -Be "existing"
  }

  It "04 strips surrounding quotes from imported values" {
    Remove-Item Env:MCP_TEST_QUOTED -ErrorAction SilentlyContinue
    $path = Join-Path $TestDrive "quoted.env"
    Set-Content -Path $path -Value 'MCP_TEST_QUOTED="quoted value"' -Encoding utf8

    Import-DotEnvFile -Path $path

    [Environment]::GetEnvironmentVariable("MCP_TEST_QUOTED", "Process") | Should -Be "quoted value"
  }

  It "05 returns a parseable ISO timestamp" {
    { [DateTimeOffset]::Parse((Get-IsoNow)) } | Should -Not -Throw
  }

  It "06 writes parseable JSON atomically" {
    $path = Join-Path $TestDrive "payload.json"

    Write-JsonAtomic -Path $path -Value ([ordered]@{ name = "mcp-home"; count = 2 }) -Depth 4

    $parsed = Get-Content -Path $path -Raw | ConvertFrom-Json
    $parsed.name | Should -Be "mcp-home"
    $parsed.count | Should -Be 2
  }

  It "07 reports missing refresh outputs cleanly" {
    $path = Join-Path $TestDrive "missing.json"

    $summary = Get-RefreshOutputSummary -Path $path -SourceTimestamp "2026-04-01T00:00:00Z"

    $summary.exists | Should -BeFalse
    $summary.sourceTimestamp | Should -Be "2026-04-01T00:00:00Z"
    $summary.sizeBytes | Should -BeNullOrEmpty
  }

  It "08 reports existing refresh outputs with size and timestamp" {
    $path = Join-Path $TestDrive "existing.json"
    Set-Content -Path $path -Value '{"ok":true}' -Encoding utf8

    $summary = Get-RefreshOutputSummary -Path $path -SourceTimestamp "2026-04-01T00:00:00Z"

    $summary.exists | Should -BeTrue
    $summary.sizeBytes | Should -BeGreaterThan 0
    $summary.updatedAt | Should -Not -BeNullOrEmpty
  }
}

Describe "refresh-windows-host path and scan helpers" {
  It "09 keeps absolute configured paths" {
    $resolved = Resolve-ConfiguredPaths -RawValue $script:notesPath
    $resolved | Should -Contain $script:notesPath
  }

  It "10 resolves relative configured paths against the repo root" {
    $resolved = Resolve-ConfiguredPaths -RawValue "notes"
    $resolved | Should -Contain $script:notesPath
  }

  It "11 dedupes configured paths" {
    $resolved = Resolve-ConfiguredPaths -RawValue "notes,notes"
    @($resolved).Count | Should -Be 1
  }

  It "12 ignores missing configured paths" {
    $resolved = Resolve-ConfiguredPaths -RawValue "notes,missing-does-not-exist"
    $resolved | Should -Contain $script:notesPath
    $resolved.Count | Should -Be 1
  }

  It "13 uses default relative paths when raw input is empty" {
    $resolved = Resolve-ConfiguredPaths -RawValue "" -DefaultRelativePaths @("notes")
    $resolved | Should -Contain $script:notesPath
  }

  It "14 flags node_modules as excluded" {
    (Test-ExcludedScanPath -Path "C:\repo\node_modules\left-pad") | Should -BeTrue
  }

  It "15 flags data local as excluded" {
    (Test-ExcludedScanPath -Path "C:\repo\data\local\snapshot.json") | Should -BeTrue
  }

  It "16 leaves ordinary note paths included" {
    (Test-ExcludedScanPath -Path "C:\repo\notes\welcome.md") | Should -BeFalse
  }

  It "17 converts absolute paths to repo-relative paths" {
    $relative = Convert-ToRelativePath -Root $script:repoRoot -Path $script:welcomePath
    ($relative -replace "/", "\") | Should -Match "notes\\welcome\.md$"
  }
}

Describe "refresh-windows-host scheduler and event helpers" {
  It "18 formats scheduled task execute actions with arguments" {
    $action = [pscustomobject]@{ Execute = "powershell.exe"; Arguments = "-File refresh.ps1" }
    (Format-ScheduledTaskAction -Action $action) | Should -Be "powershell.exe -File refresh.ps1"
  }

  It "19 formats COM scheduled task actions" {
    $action = [pscustomobject]@{ ClassId = "{01234567-89AB-CDEF-0123-456789ABCDEF}" }
    (Format-ScheduledTaskAction -Action $action) | Should -Be "COM {01234567-89AB-CDEF-0123-456789ABCDEF}"
  }

  It "20 formats scheduled task triggers with start boundary and enabled flag" {
    $trigger = [pscustomobject]@{
      CimClass = [pscustomobject]@{ CimClassName = "MSFT_TaskDailyTrigger" }
      StartBoundary = "2026-04-01T09:00:00"
      Enabled = $true
    }

    $text = Format-ScheduledTaskTrigger -Trigger $trigger

    $text | Should -Match "MSFT_TaskDailyTrigger"
    $text | Should -Match "starts 2026-04-01T09:00:00"
    $text | Should -Match "enabled"
  }

  It "21 returns the default integer env value when missing" {
    Remove-Item Env:MCP_TEST_INT -ErrorAction SilentlyContinue
    (Get-IntegerEnvValue -Name "MCP_TEST_INT" -Default 15 -Min 1 -Max 20) | Should -Be 15
  }

  It "22 returns the parsed integer env value when valid" {
    Set-Item -Path Env:MCP_TEST_INT -Value "18"
    (Get-IntegerEnvValue -Name "MCP_TEST_INT" -Default 15 -Min 1 -Max 20) | Should -Be 18
  }

  It "23 falls back to the default integer env value when below min" {
    Set-Item -Path Env:MCP_TEST_INT -Value "0"
    (Get-IntegerEnvValue -Name "MCP_TEST_INT" -Default 15 -Min 1 -Max 20) | Should -Be 15
  }

  It "24 returns null for blank Windows event messages" {
    (Normalize-WindowsEventMessage -Message "   ") | Should -BeNullOrEmpty
  }

  It "25 collapses whitespace in Windows event messages" {
    (Normalize-WindowsEventMessage -Message "Service`r`nfailed    to start") | Should -Be "Service failed to start"
  }

  It "26 truncates long Windows event messages" {
    $text = Normalize-WindowsEventMessage -Message ("x" * 20) -MaxLength 10
    $text | Should -Be "xxxxxxx..."
  }

  It "27 maps Windows event levels to unique numeric values" {
    $levels = Resolve-WindowsEventLevels -Levels @("Critical", "Error", "critical", "Informational", "Unknown")
    $levels | Should -Be @(1, 2, 4)
  }
}

Describe "refresh-windows-host backup target helpers" {
  It "28 trims quotes and punctuation from backup target paths" {
    (Normalize-BackupTargetPath -Value '"D:\Backups",') | Should -Be "D:\Backups"
  }

  It "29 returns null for blank backup target paths" {
    (Normalize-BackupTargetPath -Value "   ") | Should -BeNullOrEmpty
  }

  It "30 accepts rooted drive backup target paths" {
    (Test-BackupTargetPathCandidate -Value "D:\Backups") | Should -BeTrue
  }

  It "31 accepts UNC backup target paths" {
    (Test-BackupTargetPathCandidate -Value "\\nas\backups") | Should -BeTrue
  }

  It "32 rejects executable backup target paths" {
    (Test-BackupTargetPathCandidate -Value "C:\Tools\backup.exe") | Should -BeFalse
  }

  It "33 rejects relative backup target paths" {
    (Test-BackupTargetPathCandidate -Value ".\backups") | Should -BeFalse
  }

  It "34 extracts quoted backup target paths from task actions" {
    $targets = Get-BackupTargetCandidatesFromAction -Action 'robocopy "C:\Source" "D:\Backups" /MIR'
    $targets | Should -Contain "D:\Backups"
  }

  It "35 extracts bare rooted backup target paths from task actions" {
    $targets = Get-BackupTargetCandidatesFromAction -Action 'robocopy C:\Source \\nas\archive /MIR'
    $targets | Should -Contain "\\nas\archive"
  }

  It "36 resolves relative configured backup target paths against the repo root" {
    Set-Item -Path Env:BACKUP_TARGET_PATHS -Value "notes"
    $targets = Get-ConfiguredBackupTargetPaths
    $targets | Should -Contain $script:notesPath
  }

  It "37 dedupes configured backup target paths case-insensitively" {
    Set-Item -Path Env:BACKUP_TARGET_PATHS -Value "D:\Backups;d:\backups"
    $targets = Get-ConfiguredBackupTargetPaths
    @($targets).Count | Should -Be 1
  }
}

Describe "refresh-windows-host Docker and Tailscale helpers" {
  It "38 marks 0.0.0.0 bindings as public" {
    (Get-DockerExposureKind -Ports "0.0.0.0:32400->32400/tcp") | Should -Be "public"
  }

  It "39 marks loopback bindings as local-only" {
    (Get-DockerExposureKind -Ports "127.0.0.1:8788->80/tcp") | Should -Be "local-only"
  }

  It "40 marks specific host bindings as host-ip" {
    (Get-DockerExposureKind -Ports "192.168.1.10:8080->80/tcp") | Should -Be "host-ip"
  }

  It "41 marks blank port strings as internal" {
    (Get-DockerExposureKind -Ports "") | Should -Be "internal"
  }

  It "42 rejects localhost as a public endpoint" {
    (Test-PublicEndpointUrl -Url "http://127.0.0.1:8788/health") | Should -BeFalse
  }

  It "43 accepts non-local hosts as public endpoints" {
    (Test-PublicEndpointUrl -Url "https://ryzen9.tailbc886a.ts.net/mcp") | Should -BeTrue
  }

  It "44 parses a single Tailscale proxy target" {
    $output = @"
https://example.ts.net
|-- / proxy http://127.0.0.1:8788
"@
    $targets = Parse-TailscaleProxyTargets -Output $output
    $targets | Should -Contain "https://example.ts.net -> / proxy http://127.0.0.1:8788"
  }

  It "45 parses multiple Tailscale proxy targets" {
    $output = @"
https://one.ts.net
|-- / proxy http://127.0.0.1:8788
https://two.ts.net
|-- / proxy http://127.0.0.1:32400
"@
    $targets = Parse-TailscaleProxyTargets -Output $output
    @($targets).Count | Should -Be 2
  }

  It "46 extracts exact Docker label values" {
    $labels = "com.docker.compose.project=mcphome,com.docker.compose.service=mcp-home"
    (Get-DockerLabelValue -Labels $labels -Key "com.docker.compose.project") | Should -Be "mcphome"
  }

  It "47 parses valid and invalid Docker percent values" {
    (Convert-DockerPercentValue -Value "17.5%") | Should -Be 17.5
    (Convert-DockerPercentValue -Value "not-a-percent") | Should -BeNullOrEmpty
  }
}

Describe "refresh-windows-host Plex and git helpers" {
  It "48 converts Unix and invalid Plex dates appropriately" {
    $unixValue = Convert-PlexDateValue -Value "1700000000"
    { [DateTimeOffset]::Parse($unixValue) } | Should -Not -Throw
    (Convert-PlexDateValue -Value "not-a-date") | Should -Be "not-a-date"
  }

  It "49 parses git branch status decorators" {
    $status = Parse-GitBranchStatus -HeaderLine "## main...origin/main [ahead 2, behind 1]"
    $status.branch | Should -Be "main"
    $status.ahead | Should -Be 2
    $status.behind | Should -Be 1
  }

  It "50 converts Plex activity nodes into structured entries" {
    [xml]$xml = @"
<Video title="Pilot" type="episode" librarySectionTitle="TV Shows" year="1999" grandparentTitle="The Sopranos" parentTitle="Season 1" parentIndex="1" index="1" viewedAt="1700000000" addedAt="1700000001" originallyAvailableAt="2024-01-01T00:00:00Z" duration="3600000" viewOffset="120000">
  <User title="embla" />
  <Player title="Apple TV" state="playing" />
</Video>
"@

    $node = Convert-PlexActivityNode -Node $xml.Video

    $node.title | Should -Be "Pilot"
    $node.type | Should -Be "episode"
    $node.grandparentTitle | Should -Be "The Sopranos"
    $node.seasonIndex | Should -Be 1
    $node.episodeIndex | Should -Be 1
    $node.user | Should -Be "embla"
    $node.player | Should -Be "Apple TV"
    $node.state | Should -Be "playing"
    $node.durationMs | Should -Be 3600000
    $node.viewOffsetMs | Should -Be 120000
  }
}
}
