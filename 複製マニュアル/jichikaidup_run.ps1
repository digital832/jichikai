param([string]$Uri)

$raw = $Uri -replace '^jichikaidup:', ''
$raw = $raw.TrimEnd('/')
$parts = $raw -split '&'
$map = @{}
foreach ($p in $parts) {
    $kv = $p -split '=', 2
    if ($kv.Length -eq 2) { $map[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
}

$src = $map['src']
$dst = $map['dst']

if (-not $src -or -not $dst) {
    Write-Host 'Error: missing src or dst parameter.'
    pause
    exit 1
}

Copy-Item -LiteralPath $src -Destination $dst -Recurse
Remove-Item -LiteralPath (Join-Path $dst '.git') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ('Done: ' + $dst)
pause
