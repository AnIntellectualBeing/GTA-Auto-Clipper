<#
  Uploads the MasterClip Android APK to Workers KV (namespace MASTERCLIP_GUIDE) in 20 MB parts.
  It is served only to buyers at /api/masterclip/apk?token=... and is never public.
  Usage: powershell -File tools\upload-apk.ps1 -Apk <path.apk> -Version 1.2.0
#>
param([Parameter(Mandatory)][string]$Apk, [Parameter(Mandatory)][string]$Version,
      [string]$NamespaceId = 'c9f046ca945741f4a99c059fe7e212b4', [int]$PartMB = 20)
$ErrorActionPreference = 'Stop'
$bytes = [IO.File]::ReadAllBytes((Resolve-Path $Apk))
$size = $bytes.Length; $partSize = $PartMB * 1MB
$parts = [int][Math]::Ceiling($size / $partSize)
$tmp = Join-Path $env:TEMP "mc-apk-parts"; New-Item -ItemType Directory -Force $tmp | Out-Null
for ($i = 0; $i -lt $parts; $i++) {
  $len = [Math]::Min($partSize, $size - $i * $partSize)
  $file = Join-Path $tmp "part$i"
  $fs = [IO.File]::Create($file); $fs.Write($bytes, $i * $partSize, $len); $fs.Close()
  npx wrangler kv key put "MasterClip-Android.apk.$i" --path $file --namespace-id $NamespaceId --remote
  if ($LASTEXITCODE -ne 0) { throw "part $i failed" }
}
$meta = @{ parts = $parts; size = $size; version = $Version; filename = "MasterClip-$Version.apk" } | ConvertTo-Json -Compress
$metaFile = Join-Path $tmp 'meta.json'; [IO.File]::WriteAllText($metaFile, $meta, (New-Object Text.UTF8Encoding($false)))
npx wrangler kv key put "MasterClip-Android.apk.meta" --path $metaFile --namespace-id $NamespaceId --remote
if ($LASTEXITCODE -ne 0) { throw 'meta failed' }
Remove-Item -Recurse -Force $tmp
Write-Host "Uploaded $parts parts ($size bytes) as MasterClip-$Version.apk"