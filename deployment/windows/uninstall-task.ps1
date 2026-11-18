#Requires -RunAsAdministrator
param([string]$TaskName = 'Wayfarer')

$ErrorActionPreference = 'Stop'

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed the '$TaskName' task."
