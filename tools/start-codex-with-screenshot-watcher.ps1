param(
  [string]$ScreenshotDir = (Join-Path $env:USERPROFILE 'Pictures\Screenshots'),
  [string]$CodexCommand = 'codex',
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CodexArgs
)

$ErrorActionPreference = 'Stop'

$watcherScript = Join-Path $PSScriptRoot 'copy-latest-screenshot-path.ps1'
if (-not (Test-Path -LiteralPath $watcherScript)) {
  throw "Watcher script not found: $watcherScript"
}

$powershell = Join-Path $PSHOME 'powershell.exe'
$watcherArguments = @(
  '-NoProfile',
  '-Sta',
  '-ExecutionPolicy', 'Bypass',
  '-File', $watcherScript,
  '-ScreenshotDir', $ScreenshotDir
)

Start-Process -FilePath $powershell -ArgumentList $watcherArguments -WindowStyle Minimized | Out-Null
Write-Host "Screenshot watcher started for: $ScreenshotDir"

$codex = Get-Command $CodexCommand -ErrorAction Stop
& $codex.Source @CodexArgs
