#Requires -RunAsAdministrator
param([string]$InstallDir = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)), [string]$TaskName = 'Wayfarer', [string]$UserName = $env:USERNAME)

$ErrorActionPreference = 'Stop'

$startScript = Join-Path $PSScriptRoot 'start-wayfarer.ps1'
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -InstallDir `"$InstallDir`""

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $UserName -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Registered the '$TaskName' task for $UserName. Start it with: Start-ScheduledTask -TaskName $TaskName"
