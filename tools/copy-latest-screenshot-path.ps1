param(
  [string]$ScreenshotDir = (Join-Path $env:USERPROFILE 'Pictures\Screenshots'),
  [int]$StableWaitMilliseconds = 300,
  [int]$StableAttempts = 10
)

$ErrorActionPreference = 'Stop'

function Resolve-ScreenshotDirectory {
  param([string]$Path)

  $resolved = [Environment]::ExpandEnvironmentVariables($Path)
  if (-not (Test-Path -LiteralPath $resolved)) {
    New-Item -ItemType Directory -Path $resolved | Out-Null
  }
  return (Resolve-Path -LiteralPath $resolved).Path
}

function Test-ImagePath {
  param([string]$Path)

  $extension = [System.IO.Path]::GetExtension($Path)
  return @('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp') -contains $extension.ToLowerInvariant()
}

function Wait-FileReady {
  param([string]$Path)

  for ($attempt = 0; $attempt -lt $StableAttempts; $attempt++) {
    if (-not (Test-Path -LiteralPath $Path)) {
      Start-Sleep -Milliseconds $StableWaitMilliseconds
      continue
    }

    try {
      $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'None')
      $stream.Close()
      return $true
    } catch {
      Start-Sleep -Milliseconds $StableWaitMilliseconds
    }
  }

  return $false
}

function Copy-PathToClipboard {
  param([string]$Path)

  if (-not (Test-ImagePath -Path $Path)) {
    return
  }

  if (-not (Wait-FileReady -Path $Path)) {
    Write-Warning "File was not ready: $Path"
    return
  }

  $fullPath = (Resolve-Path -LiteralPath $Path).Path
  Set-Clipboard -Value $fullPath
  Write-Host "Copied screenshot path: $fullPath"
}

$watchDir = Resolve-ScreenshotDirectory -Path $ScreenshotDir
Write-Host "Watching screenshots: $watchDir"
Write-Host "Press Ctrl+C to stop."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchDir
$watcher.Filter = '*.*'
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$createdSubscription = Register-ObjectEvent -InputObject $watcher -EventName Created -Action {
  Copy-PathToClipboard -Path $Event.SourceEventArgs.FullPath
}

$renamedSubscription = Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action {
  Copy-PathToClipboard -Path $Event.SourceEventArgs.FullPath
}

try {
  while ($true) {
    Wait-Event -Timeout 1 | Out-Null
  }
} finally {
  Unregister-Event -SubscriptionId $createdSubscription.Id -ErrorAction SilentlyContinue
  Unregister-Event -SubscriptionId $renamedSubscription.Id -ErrorAction SilentlyContinue
  $watcher.Dispose()
}
