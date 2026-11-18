param([string]$InstallDir = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)), [string]$EnvFile = (Join-Path $InstallDir 'wayfarer.env'))

$ErrorActionPreference = 'Stop'

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $separator = $line.IndexOf('=')
    if ($separator -lt 1) { return }
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

Set-Location $InstallDir
$bun = (Get-Command bun -ErrorAction Stop).Source
& $bun (Join-Path 'dist' 'server\index.js')
exit $LASTEXITCODE
