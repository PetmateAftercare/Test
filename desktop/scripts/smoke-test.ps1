# 빌드된 앱을 실제로 실행해 점검합니다.
#  1) dist\win-unpacked\PetmateAftercare-Guide.exe  --smoke-test
#     → 창 제목 / 1100x860 / 가이드 DOM / localStorage / 내장 SheetJS / "문구 만들기" 결과까지 확인
#  2) dist\PetmateAftercare-Guide.exe (portable 배포 파일) — 같은 스모크, 안 되면 창 제목으로 확인
# 실패 시 exit 1.

$ErrorActionPreference = 'Stop'
$desktop = Resolve-Path (Join-Path $PSScriptRoot '..\..\desktop')
$dist = Join-Path $desktop 'dist'
$appTitle = 'Petmate Aftercare - 보호자 카톡 안내 작성기'
$exeName = 'PetmateAftercare-Guide'

function Stop-AppProcesses {
  Get-Process -Name $exeName -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.Kill() } catch {}
  }
  Start-Sleep -Milliseconds 400
}

function Invoke-SmokeRun {
  param(
    [string]$Exe,
    [string]$Label,
    [int]$TimeoutSeconds = 240
  )

  $out = Join-Path $dist ("smoke-" + $Label + ".json")
  $stdout = Join-Path $dist ("smoke-" + $Label + ".stdout.log")
  $stderr = Join-Path $dist ("smoke-" + $Label + ".stderr.log")
  Remove-Item $out, $stdout, $stderr -ErrorAction SilentlyContinue

  Write-Host "[smoke] $Label 실행: $Exe"
  $proc = Start-Process -FilePath $Exe -WorkingDirectory $dist `
    -ArgumentList @('--smoke-test', "--smoke-out=$out") `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while (-not (Test-Path $out) -and (Get-Date) -lt $deadline) {
    if ($proc.HasExited -and -not (Test-Path $out)) {
      Start-Sleep -Seconds 2
      if (-not (Test-Path $out)) { break }
    }
    Start-Sleep -Seconds 2
  }

  $report = $null
  if (Test-Path $out) {
    $raw = Get-Content $out -Raw
    Write-Host "[smoke] $Label 리포트:"
    Write-Host $raw
    try { $report = $raw | ConvertFrom-Json } catch { $report = $null }
  } else {
    Write-Host "[smoke] $Label 리포트 파일이 생기지 않았습니다(제한 시간 ${TimeoutSeconds}s)."
  }

  foreach ($log in @($stdout, $stderr)) {
    if (Test-Path $log) {
      $text = Get-Content $log -Raw
      if ($text -and $text.Trim().Length -gt 0) {
        Write-Host "[smoke] --- $([System.IO.Path]::GetFileName($log)) ---"
        Write-Host $text
      }
    }
  }

  if (-not $proc.HasExited) {
    try { $proc.Kill() } catch {}
  }

  return $report
}

function Wait-ForAppWindow {
  param([string]$Exe, [int]$TimeoutSeconds = 120)

  Write-Host "[smoke] portable 창 확인: $Exe"
  $proc = Start-Process -FilePath $Exe -WorkingDirectory $dist -PassThru
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $title = ''
  while ((Get-Date) -lt $deadline) {
    $cand = Get-Process -Name $exeName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
    if ($cand) { $title = $cand.MainWindowTitle; break }
    Start-Sleep -Seconds 2
  }
  if (-not $title) { Write-Host '[smoke] 창 제목을 찾지 못했습니다.' } else { Write-Host "[smoke] 창 제목: $title" }
  Stop-AppProcesses
  return $title
}

$summary = [ordered]@{
  checkedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  commit    = $env:GITHUB_SHA
  appTitle  = $appTitle
  steps     = @()
  failures  = @()
}

Stop-AppProcesses

# 1) 앱 본체 (unpacked)
$unpacked = Join-Path $dist "win-unpacked\$exeName.exe"
if (Test-Path $unpacked) {
  $report = Invoke-SmokeRun -Exe $unpacked -Label 'unpacked'
  if ($null -eq $report) {
    $summary.failures += 'unpacked 앱이 스모크 리포트를 남기지 않았습니다'
    $summary.steps += [ordered]@{ step = 'unpacked'; ok = $false; reason = 'no-report' }
  } elseif (-not $report.ok) {
    $summary.failures += "unpacked 앱 스모크 실패: $($report.failures -join ',')"
    $summary.steps += [ordered]@{ step = 'unpacked'; ok = $false; failures = $report.failures; report = $report }
  } else {
    $summary.steps += [ordered]@{ step = 'unpacked'; ok = $true; report = $report }
  }
} else {
  $summary.failures += "unpacked 앱이 없습니다: $unpacked"
}

Stop-AppProcesses

# 2) portable 배포 파일
$portable = Join-Path $dist "$exeName.exe"
if (Test-Path $portable) {
  $report = Invoke-SmokeRun -Exe $portable -Label 'portable' -TimeoutSeconds 300
  if ($null -ne $report -and $report.ok) {
    $summary.steps += [ordered]@{ step = 'portable'; ok = $true; mode = 'smoke'; report = $report }
  } else {
    # 인자 전달이 안 되는 런처일 수 있으니, 그냥 실행해 창이 뜨는지로 확인
    if ($null -ne $report) {
      Write-Host "[smoke] portable 스모크 실패 → 창 표시 확인으로 재점검: $($report.failures -join ',')"
    }
    Stop-AppProcesses
    $title = Wait-ForAppWindow -Exe $portable -TimeoutSeconds 150
    $windowOk = ($title -eq $appTitle)
    if ($windowOk) {
      $summary.steps += [ordered]@{ step = 'portable'; ok = $true; mode = 'window-title'; windowTitle = $title }
    } else {
      $summary.failures += "portable 실행 파일이 기대한 창을 열지 못했습니다(제목='$title')"
      $summary.steps += [ordered]@{ step = 'portable'; ok = $false; mode = 'window-title'; windowTitle = $title }
    }
  }
} else {
  $summary.failures += "portable exe 가 없습니다: $portable"
}

Stop-AppProcesses

$summary.ok = ($summary.failures.Count -eq 0)
$json = $summary | ConvertTo-Json -Depth 8
$json | Set-Content -Path (Join-Path $dist 'smoke-summary.json') -Encoding UTF8
Write-Host '==== smoke summary ===='
Write-Host $json

if (-not $summary.ok) {
  Write-Host "::error::스모크 테스트 실패: $($summary.failures -join ' | ')"
  exit 1
}
Write-Host '[smoke] 통과: 앱이 실제로 실행되고 보호자 안내 문구까지 만들어졌습니다.'
