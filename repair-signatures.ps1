param([switch]$IncludeMcp)
$ErrorActionPreference = 'Stop'
if (Get-Process AfterFX -ErrorAction SilentlyContinue) { throw 'Close After Effects before signing and installing repaired panels.' }
$signingRoot = Join-Path $env:LOCALAPPDATA 'VersionUpdater\signing'
$signer = Join-Path $signingRoot 'ZXPSignCmd.exe'
if (-not (Test-Path -LiteralPath $signer)) {
    New-Item -ItemType Directory -Path $signingRoot -Force | Out-Null
    Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe' -OutFile $signer
}
$certificate = Join-Path $signingRoot 'local-panel-signing.p12'
$passwordPath = Join-Path $signingRoot 'local-panel-signing.password'
if (-not (Test-Path -LiteralPath $certificate)) {
    $signPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    & $signer -selfSignedCert GR Attica 'NickPittas Local Extensions' 'NickPittas Local CEP Panels' $signPassword $certificate -validityDays 3650
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local extension signing certificate.' }
    Set-Content -LiteralPath $passwordPath -Value $signPassword -NoNewline
} else { $signPassword = Get-Content -LiteralPath $passwordPath -Raw }
$workRoot = Join-Path $signingRoot ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
function Sign-Panel([string]$source, [string]$name) {
    $inputPath = Join-Path $workRoot ($name + '-input')
    New-Item -ItemType Directory -Path $inputPath -Force | Out-Null
    foreach ($entry in Get-ChildItem -LiteralPath $source -Force) {
        if ($entry.Name -notin @('META-INF','mimetype','.debug')) { Copy-Item -LiteralPath $entry.FullName -Destination $inputPath -Recurse -Force }
    }
    $zxp = Join-Path $workRoot ($name + '.zxp')
    & $signer -sign $inputPath $zxp $certificate $signPassword
    if ($LASTEXITCODE -ne 0) { throw "Signing failed: $name" }
    & $signer -verify $zxp
    if ($LASTEXITCODE -ne 0) { throw "Signature verification failed: $name" }
    $zip = Join-Path $workRoot ($name + '.zip'); Copy-Item -LiteralPath $zxp -Destination $zip
    $outputPath = Join-Path $workRoot ($name + '-signed')
    Expand-Archive -LiteralPath $zip -DestinationPath $outputPath
    & $signer -verify $outputPath
    if ($LASTEXITCODE -ne 0) { throw "Extracted signature verification failed: $name" }
    return $outputPath
}
# Capture tool output separately so the function returns only its signed folder path.
$updaterOutput = @(Sign-Panel (Join-Path $PSScriptRoot 'extension') 'version-updater')
$updaterSigned = $updaterOutput[-1]
Copy-Item -Path (Join-Path $updaterSigned '*') -Destination (Join-Path $PSScriptRoot 'extension') -Recurse -Force
& (Join-Path $PSScriptRoot 'install.ps1')
$mcp = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.nickpittas.aftereffectsmcpextended'
if ($IncludeMcp -and (Test-Path -LiteralPath $mcp)) {
    $mcpOutput = @(Sign-Panel $mcp 'after-effects-mcp')
    $mcpSigned = $mcpOutput[-1]
    $backup = Join-Path $workRoot 'mcp-before-signing'
    Copy-Item -LiteralPath $mcp -Destination $backup -Recurse
    Copy-Item -LiteralPath (Join-Path $mcpSigned 'META-INF') -Destination $mcp -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $mcpSigned 'mimetype') -Destination $mcp -Force
    & $signer -verify $mcp
    if ($LASTEXITCODE -ne 0) { throw 'Installed MCP panel signature is invalid.' }
}
Write-Output "Signed panel repair complete. Backups: $workRoot"
