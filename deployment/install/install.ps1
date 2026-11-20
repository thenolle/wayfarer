param(
  [string]$Ref = '',
  [int]$Port = 8787,
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Wayfarer'),
  [string]$DownloadDir = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\Wayfarer'),
  [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'https://github.com/thenolle/wayfarer.git'
$TaskName = 'Wayfarer'
$MinimumBun = [version]'1.4.4'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Magenta }

function Invoke-Checked([scriptblock]$Command, [string]$Failure) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $Failure }
}

function Update-Path {
  $parts = @(
    $env:Path,
    [Environment]::GetEnvironmentVariable('Path', 'Machine'),
    [Environment]::GetEnvironmentVariable('Path', 'User'),
    "$env:USERPROFILE\.bun\bin",
    "$env:ProgramFiles\Git\cmd",
    "$env:LOCALAPPDATA\Programs\Git\cmd",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links"
  )
  foreach ($hive in 'HKLM:', 'HKCU:') {
    $git = (Get-ItemProperty "$hive\SOFTWARE\GitForWindows" -ErrorAction SilentlyContinue).InstallPath
    if ($git) { $parts += "$git\cmd" }
  }
  $env:Path = (($parts | Where-Object { $_ } | ForEach-Object { $_ -split ';' } | Where-Object { $_ } | Select-Object -Unique) -join ';')
}

function Install-Tool([string]$Command, [string]$WingetId) {
  if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "$Command is missing and winget is not available. Install $Command, then run this again." }
  Write-Step "Installing $Command"
  winget install --id $WingetId --exact --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Update-Path
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "$Command was installed but is not on PATH yet. Open a new terminal and run this again." }
}

function Get-LatestRef {
  $lines = git ls-remote --tags --refs $Repo 'v*' 2>$null
  $tags = foreach ($line in $lines) { if ($line -match 'refs/tags/(v\d+\.\d+\.\d+)$') { $Matches[1] } }
  if (-not $tags) { return 'master' }
  return ($tags | Sort-Object { [version]$_.TrimStart('v') } | Select-Object -Last 1)
}

function Test-Healthy([string]$Url) {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { if ((Invoke-RestMethod "$($Url)api/health").data.status -eq 'ok') { return $true } } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
  )
  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function New-Icon([string]$PngPath, [string]$IcoPath) {
  $png = [IO.File]::ReadAllBytes($PngPath)
  $stream = New-Object IO.MemoryStream
  $writer = New-Object IO.BinaryWriter($stream)
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
  $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
  $writer.Write($png)
  $writer.Flush()
  [IO.File]::WriteAllBytes($IcoPath, $stream.ToArray())
}

Write-Step 'Checking requirements'
Update-Path
Install-Tool 'git' 'Git.Git'
Install-Tool 'bun' 'Oven-sh.Bun'
Install-Tool 'aria2c' 'aria2.aria2'
$current = [version](((bun --version) -split '-')[0])
if ($current -lt $MinimumBun) {
  Write-Step "Upgrading Bun from $current"
  bun upgrade | Out-Host
  $current = [version](((bun --version) -split '-')[0])
  if ($current -lt $MinimumBun) { throw "Bun $MinimumBun or newer is required, found $current." }
}

$app = Join-Path $InstallDir 'app'
$dataDir = Join-Path $InstallDir 'data'
$envFile = Join-Path $InstallDir 'wayfarer.env'
New-Item -ItemType Directory -Force -Path $InstallDir, $dataDir, $DownloadDir | Out-Null

if (Test-Path $envFile) {
  $existing = Select-String -Path $envFile -Pattern '^\s*WAYFARER_PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($existing) { $Port = [int]$existing.Matches[0].Groups[1].Value }
}
$Url = "http://127.0.0.1:$Port/"

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $Ref) { $Ref = Get-LatestRef }
Write-Step "Getting Wayfarer $Ref"
if (Test-Path (Join-Path $app '.git')) {
  Invoke-Checked { git -C $app fetch --tags --force --quiet origin } 'git fetch failed'
} else {
  Invoke-Checked { git clone --quiet $Repo $app } 'git clone failed'
}
$target = if ($Ref -eq 'master') { 'origin/master' } else { $Ref }
Invoke-Checked { git -C $app checkout --force --quiet $target } "git could not check out $Ref"

Write-Step 'Building'
Push-Location $app
try {
  Invoke-Checked { bun install --frozen-lockfile } 'bun install failed'
  Invoke-Checked { bun run build } 'bun run build failed'
} finally { Pop-Location }

if (-not (Test-Path $envFile)) {
  $aria2 = (Get-Command aria2c).Source
  $content = @(
    'WAYFARER_HOST=127.0.0.1',
    "WAYFARER_PORT=$Port",
    "WAYFARER_DATA_DIRECTORY=$dataDir",
    "WAYFARER_DOWNLOAD_DIRECTORY=$DownloadDir",
    "WAYFARER_ARIA2_PATH=$aria2"
  ) -join "`r`n"
  [IO.File]::WriteAllText($envFile, "$content`r`n")
}

Write-Step 'Registering the Wayfarer task'
$start = Join-Path $app 'deployment\windows\start-wayfarer.ps1'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$start`" -InstallDir `"$app`" -EnvFile `"$envFile`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $app
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Step 'Waiting for Wayfarer to start'
if (-not (Test-Healthy $Url)) { throw "Wayfarer did not answer at $Url. Run deployment\windows\start-wayfarer.ps1 in a terminal to see why." }

if (-not $NoShortcut) {
  Write-Step 'Creating shortcuts'
  $iconPng = Join-Path $InstallDir 'wayfarer.png'
  $iconIco = Join-Path $InstallDir 'wayfarer.ico'
  Invoke-WebRequest -UseBasicParsing "$($Url)icon-256.png" -OutFile $iconPng
  New-Icon $iconPng $iconIco
  $browser = Find-Browser
  $folders = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
  foreach ($folder in $folders) {
    if ($browser) {
      $shell = New-Object -ComObject WScript.Shell
      $shortcut = $shell.CreateShortcut((Join-Path $folder 'Wayfarer.lnk'))
      $shortcut.TargetPath = $browser
      $shortcut.Arguments = "--app=$Url"
      $shortcut.IconLocation = $iconIco
      $shortcut.Description = 'Wayfarer download manager'
      $shortcut.Save()
    } else {
      [IO.File]::WriteAllText((Join-Path $folder 'Wayfarer.url'), "[InternetShortcut]`r`nURL=$Url`r`nIconFile=$iconIco`r`nIconIndex=0`r`n")
    }
  }
}

Write-Host ''
Write-Host "Wayfarer is running at $Url" -ForegroundColor Green
Write-Host "Downloads go to $DownloadDir. Settings: $envFile"
