param()
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'extension'
$manifestPath = Join-Path $source 'CSXS\manifest.xml'
foreach ($relativePath in @('CSXS\manifest.xml', 'META-INF\signatures.xml', 'mimetype', 'index.html', 'panel.js', 'transport.js', 'style.css', 'jsx\host.jsx')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $relativePath) -PathType Leaf)) {
        throw "Installation file missing: extension\$relativePath. Extract the complete ZIP before running the installer."
    }
}
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$bundleId = 'com.nickpittas.versionupdater'
if ($manifest.ExtensionManifest.ExtensionBundleId -ne $bundleId) { throw 'Unexpected extension manifest identity.' }
$bundleVersion = $manifest.ExtensionManifest.ExtensionBundleVersion
if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) {
    throw 'Close After Effects before installing or updating Version Updater, then run this installer again. No installed files have been changed.'
}
$extensionRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions'))
$target = [IO.Path]::GetFullPath((Join-Path $extensionRoot $bundleId))
$backupRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA ('VersionUpdater\install-backups\' + [guid]::NewGuid().ToString('N'))))
$staging = Join-Path $backupRoot 'staged'
$previous = Join-Path $backupRoot 'previous'
function Assert-ChildPath([string]$path, [string]$root) {
    if (-not ([IO.Path]::GetFullPath($path)).StartsWith(([IO.Path]::GetFullPath($root)).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path outside intended directory: $path"
    }
}
Assert-ChildPath $target $extensionRoot
Assert-ChildPath $previous $backupRoot
Assert-ChildPath $staging $backupRoot
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $extensionRoot -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $staging -Recurse -Force
foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File) {
    $relative = $file.FullName.Substring($source.Length).TrimStart('\')
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $staging $relative)).Hash) {
        throw "Installation verification failed: $relative"
    }
}
# Signed releases do not need any CEP debug-mode registry changes.
$hadPrevious = Test-Path -LiteralPath $target
try {
    if ($hadPrevious) { Move-Item -LiteralPath $target -Destination $previous }
    Move-Item -LiteralPath $staging -Destination $target
} catch {
    $installError = $_
    if (Test-Path -LiteralPath $previous) {
        if (Test-Path -LiteralPath $target) { Move-Item -LiteralPath $target -Destination (Join-Path $backupRoot 'failed-install') }
        Move-Item -LiteralPath $previous -Destination $target
    }
    throw "Installation failed; previous installation restored where available. Close the Version Updater panel and retry. $installError"
}
# Never reset another extension's cache. Keep displaced caches for recovery.
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp\cep_cache'))
if (Test-Path -LiteralPath $cacheRoot) {
    foreach ($cache in Get-ChildItem -LiteralPath $cacheRoot -Directory -Filter '*_com.nickpittas.versionupdater.panel') {
        Assert-ChildPath $cache.FullName $cacheRoot
        $cacheBackup = Join-Path $backupRoot $cache.Name
        Assert-ChildPath $cacheBackup $backupRoot
        try { Move-Item -LiteralPath $cache.FullName -Destination $cacheBackup }
        catch { Write-Warning 'Version Updater cache is still in use. Restart After Effects to load the complete update.' }
    }
}
Write-Output "Version Updater $bundleVersion installed: $target"
Write-Output "Recovery backup: $backupRoot"
Write-Output 'Start After Effects and open Window > Extensions > Version Updater.'
