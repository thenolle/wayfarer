param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Wayfarer'),
  [switch]$Purge
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Wayfarer'

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$folders = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
foreach ($folder in $folders) {
  foreach ($name in 'Wayfarer.lnk', 'Wayfarer.url') { Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $folder $name) }
}

if ($Purge) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $InstallDir
  Write-Host 'Removed Wayfarer, its settings and its database. Downloaded files were not touched.'
} else {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $InstallDir 'app')
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $InstallDir 'wayfarer.png'), (Join-Path $InstallDir 'wayfarer.ico')
  Write-Host "Removed Wayfarer. Settings and the database stay in $InstallDir. Use -Purge to remove them too."
}
