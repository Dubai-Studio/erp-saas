# Fix double-encoded UTF-8 (mojibake) in source files
# Uses .NET Framework methods available in PS 5.1

$ErrorActionPreference = 'Stop'

function HexToBytes($hex) {
    $bytes = New-Object byte[] ([math]::Floor($hex.Length / 2))
    for ($i = 0; $i -lt $bytes.Length; $i++) {
        $bytes[$i] = [Convert]::ToInt32($hex.Substring($i * 2, 2), 16)
    }
    return $bytes
}

# Mojibake -> correct UTF-8 mapping
$map = [ordered]@{
    "e9" = "c383c2a9","c3a9"     # é
    "e8" = "c383c2a8","c3a8"     # è
    "e0" = "c383c2a0","c3a0"     # à
    "e2" = "c383c2a2","c3a2"     # â
    "ee" = "c383c2ae","c3ae"     # î
    "f9" = "c383c2b9","c3b9"     # ù
    "eb" = "c383c2ab","c3ab"     # ë
    "ef" = "c383c2af","c3af"     # ï
    "f1" = "c383c2b1","c3b1"     # ñ
    "e7" = "c383c2a7","c3a7"     # ç
    "f4" = "c383c2b4","c3b4"     # ô
    "fb" = "c383c2bb","c3bb"     # û
    "c9" = "c383c289","c389"     # É
    "c8" = "c383c288","c388"     # È
    "c0" = "c383c280","c380"     # À
    "c2" = "c383c282","c382"     # Â
    "ce" = "c383c28e","c38e"     # Î
    "d9" = "c383c299","c399"     # Ù
    "cb" = "c383c28b","c38b"     # Ë
    "c7" = "c383c287","c387"     # Ç
    "d4" = "c383c294","c394"     # Ô
    "db" = "c383c29b","c39b"     # Û
    "d7" = "c383c297","c397"     # ×
}

$totalFixed = 0
$filesFixed = 0

Get-ChildItem -Path app, lib -Filter "*.tsx" -Recurse | ForEach-Object {
    $file = $_.FullName
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $original = $bytes
    $fileChanges = 0

    foreach ($key in $map.Keys) {
        $parts = $map[$key] -split ","
        $fromBytes = HexToBytes $parts[0]
        $toBytes = HexToBytes $parts[1]

        $index = 0
        while (($index = [System.Array]::IndexOf($bytes, $fromBytes[0], $index)) -ge 0) {
            $match = $true
            for ($j = 1; $j -lt $fromBytes.Length; $j++) {
                if ($index + $j -ge $bytes.Length) { $match = $false; break }
                if ($bytes[$index + $j] -ne $fromBytes[$j]) { $match = $false; break }
            }
            if ($match) {
                for ($j = 0; $j -lt $fromBytes.Length; $j++) {
                    if ($j -lt $toBytes.Length) {
                        $bytes[$index + $j] = $toBytes[$j]
                    }
                }
                $fileChanges++
                $index += $fromBytes.Length
            } else {
                $index++
            }
        }
    }

    $changed = $false
    if ($original.Length -eq $bytes.Length) {
        for ($k = 0; $k -lt $original.Length; $k++) {
            if ($original[$k] -ne $bytes[$k]) { $changed = $true; break }
        }
    } else { $changed = $true }

    if ($changed) {
        [System.IO.File]::WriteAllBytes($file, $bytes)
        Write-Host "Fixed $fileChanges bytes in: $($_.Name)"
        $totalFixed += $fileChanges
        $filesFixed++
    }
}

Write-Host ""
Write-Host "=== TOTAL: $totalFixed mojibake bytes fixed across $filesFixed files ==="
