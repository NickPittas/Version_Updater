param()
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'extension'
$manifestPath = Join-Path $source 'CSXS\manifest.xml'
foreach ($relativePath in @('CSXS\manifest.xml', 'index.html', 'panel.js', 'transport.js', 'style.css', 'jsx\host.jsx')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $relativePath) -PathType Leaf)) {
        throw "Installation file missing: extension\$relativePath. Extract the complete ZIP before running the installer."
    }
}
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$bundleVersion = $manifest.ExtensionManifest.ExtensionBundleVersion
$target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.nickpittas.versionupdater'
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
foreach ($version in 9..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}
Write-Output "Installed: $target"
Write-Output "Version Updater $bundleVersion installed for the current Windows user."
Write-Output 'Close and reopen Window > Extensions > Version Updater. If this is the first installation and it is not listed, restart After Effects.'
