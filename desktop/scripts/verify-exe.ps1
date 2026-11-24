# 빌드된 .exe 가 진짜 Windows 실행 파일(PE32+ x64)이고 가이드가 안에 들어갔는지 확인합니다.
# 실패 시 exit 1.

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$desktop = Join-Path $repoRoot 'desktop'
$portable = Join-Path $desktop 'dist\PetmateAftercare-Guide.exe'
$unpackedExe = Join-Path $desktop 'dist\win-unpacked\PetmateAftercare-Guide.exe'
$asar = Join-Path $desktop 'dist\win-unpacked\resources\app.asar'

$result = [ordered]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  commit    = $env:GITHUB_SHA
  files     = @()
  asar      = @{}
  failures  = @()
}

function Test-PeFile([string]$path, [string]$label) {
  if (-not (Test-Path $path)) {
    $script:result.failures += "$label 없음: $path"
    return
  }
  $item = Get-Item $path
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $entry = [ordered]@{
    label      = $label
    name       = $item.Name
    bytes      = $item.Length
    megabytes  = [math]::Round($item.Length / 1MB, 2)
    mz         = ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A)
    pe         = $false
    machine    = ''
    magic      = ''
    subsystem  = ''
  }

  if ($bytes.Length -lt 512) { $script:result.failures += "$label 파일이 너무 작습니다" }
  if ($bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) { $script:result.failures += "$label: MZ 시그니처 없음" }

  $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
  if ($peOffset -gt 0 -and $peOffset -lt ($bytes.Length - 260)) {
    if ($bytes[$peOffset] -eq 0x50 -and $bytes[$peOffset + 1] -eq 0x45) {
      $entry.pe = $true
      $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
      $magic = [BitConverter]::ToUInt16($bytes, $peOffset + 24)
      $subsystem = [BitConverter]::ToUInt16($bytes, $peOffset + 24 + 68)
      $entry.machine = ('0x{0:X4}' -f $machine)
      $entry.magic = ('0x{0:X4}' -f $magic)
      $entry.subsystem = $subsystem
      if ($machine -ne 0x8664) { $script:result.failures += "$label: x64(0x8664) 아님 ($($entry.machine))" }
      if ($magic -ne 0x20B) { $script:result.failures += "$label: PE32+ (0x20B) 아님 ($($entry.magic))" }
      if ($subsystem -ne 2 -and $subsystem -ne 3) { $script:result.failures += "$label: 예상 밖 서브시스템 ($subsystem)" }
    } else {
      $script:result.failures += "$label: PE 서명 없음"
    }
  } else {
    $script:result.failures += "$label: PE 헤더 오프셋이 잘못됨"
  }

  Write-Host ("[verify] {0,-32} {1,12:N0} bytes  MZ={2} PE={3} machine={4} magic={5} subsystem={6}" -f `
    $entry.label, $entry.bytes, $entry.mz, $entry.pe, $entry.machine, $entry.magic, $entry.subsystem)

  $script:result.files += $entry
}

Test-PeFile $portable 'portable exe (배포 파일)'
Test-PeFile $unpackedExe 'unpacked exe (앱 본체)'

# app.asar 안에 가이드가 실제로 들어갔는지 (asar 헤더 JSON 문자열 검사)
if (Test-Path $asar) {
  $asarSize = (Get-Item $asar).Length
  $headerText = [System.IO.File]::ReadAllText($asar, [System.Text.Encoding]::UTF8)
  $hasIndex = $headerText.Contains('guide/index.html')
  $hasVendor = $headerText.Contains('vendor/xlsx.full.min.js')
  $result.asar = [ordered]@{ path = 'resources/app.asar'; bytes = $asarSize; guideIndexHtml = $hasIndex; sheetjsVendor = $hasVendor }
  Write-Host ("[verify] app.asar {0:N0} bytes  guide/index.html={1}  vendor={2}" -f $asarSize, $hasIndex, $hasVendor)
  if (-not $hasIndex) { $result.failures += 'app.asar 안에 guide/index.html 이 없습니다' }
  if (-not $hasVendor) { $result.failures += 'app.asar 안에 vendor/xlsx.full.min.js 가 없습니다' }
} else {
  $result.failures += 'resources/app.asar 가 없습니다'
}

# 안에 든 가이드 사본이 패치된 상태인지
$guideCopy = Join-Path $desktop 'guide\index.html'
if (Test-Path $guideCopy) {
  $g = Get-Content $guideCopy -Raw
  $patched = $g.Contains('SHEETJS_SRC') -and $g.Contains('__PETMATE_DESKTOP__')
  Write-Host "[verify] guide 사본 패치됨=$patched (bytes=$((Get-Item $guideCopy).Length))"
  if (-not $patched) { $result.failures += 'guide 사본에 데스크톱 패치가 없습니다' }
}

$result.ok = ($result.failures.Count -eq 0)
$json = $result | ConvertTo-Json -Depth 6
$json | Set-Content -Path (Join-Path $desktop 'dist\verify.json') -Encoding UTF8
Write-Host $json

if (-not $result.ok) {
  Write-Host "::error::exe 검증 실패: $($result.failures -join ' | ')"
  exit 1
}
Write-Host '[verify] 통과: PE32+ x64 실행 파일이며 가이드가 내장되어 있습니다.'
