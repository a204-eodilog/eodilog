$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$data = "$root/docs/data/regions"
$m = Get-Content -Raw -Encoding utf8 "$data/seed-manifest.json" | ConvertFrom-Json
if ((Get-FileHash "$data/legal-region-full.zip" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $m.metadata.zipSha256) { throw 'ZIP hash mismatch' }
$archive = [IO.Compression.ZipFile]::OpenRead("$data/legal-region-full.zip")
try {
    $stream = $archive.Entries[0].Open()
    $bytes = [IO.MemoryStream]::new()
    $stream.CopyTo($bytes); $stream.Dispose()
    $hash = [Security.Cryptography.SHA256]::Create()
    $digest = [BitConverter]::ToString($hash.ComputeHash($bytes.ToArray())).Replace('-','').ToLowerInvariant()
    $hash.Dispose()
    if ($digest -ne $m.metadata.rawTxtSha256) { throw 'TXT hash mismatch' }
    $raw = [Text.Encoding]::GetEncoding(949).GetString($bytes.ToArray()); $bytes.Dispose()
} finally { $archive.Dispose() }
$rows = @($raw -split "`r?`n" | Select-Object -Skip 1 | ForEach-Object {
    $fields = $_ -split "`t"
    if ($fields.Count -eq 3 -and $fields[2].Trim() -eq '존재') { [pscustomobject]@{code=$fields[0];name=$fields[1].Trim()} }
})
$nodes = @($rows | Where-Object { $_.code.EndsWith('00000') -and (($_.name -split '\s+').Count -le 2) })
$top = @($nodes | Where-Object { ($_.name -split '\s+').Count -eq 1 })
if ($nodes.Count -ne 245 -or $top.Count -ne 16) { throw 'Unexpected normalized node count' }
$nodeMap = @{}; foreach ($node in $nodes) { $nodeMap[$node.name] = $node.code }
$expected = @($nodes | ForEach-Object {
    $parts = $_.name -split '\s+'
    $parent = if ($parts.Count -eq 1) { '' } else { $nodeMap[$parts[0]] }
    "$($_.code)|$($_.name)|$parent"
} | Sort-Object)
$actual = @($m.nodes | ForEach-Object { "$($_.code)|$($_.name)|$($_.parentCode)" } | Sort-Object)
if (Compare-Object $expected $actual) { throw 'Manifest nodes differ from official snapshot' }
$aliases = @($rows | Where-Object { $_.code.EndsWith('00000') -and ($_.name -split '\s+').Count -eq 3 } | ForEach-Object {
    $parts = $_.name -split '\s+'
    $target = $nodeMap[($parts[0..1] -join ' ')]
    if (!$target) { throw "Missing parent for $($_.code)" }
    "$($_.code)|$target"
} | Sort-Object)
$actualAliases = @($m.aliases | ForEach-Object { "$($_.sourceSigunguCode)|$($_.targetCode)" } | Sort-Object)
if ($aliases.Count -ne 39 -or (Compare-Object $aliases $actualAliases)) { throw 'Manifest aliases differ from official snapshot' }
if (@($m.nodes.id | Select-Object -Unique).Count -ne 245) { throw 'Duplicate seed IDs' }
foreach ($node in $m.nodes) { if ($node.id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { throw 'Expected fixed UUIDv7' } }
Write-Output 'Official ZIP/TXT hashes, 245 nodes, hierarchy, 39 aliases and UUIDv7 manifest verified'
