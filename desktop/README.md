# PetmateAftercare-Guide.exe — Windows 데스크톱 앱

`../index.html` (펫메이트 애프터케어 · 보호자 카톡 안내 1분 작성 가이드)을 **설치 없이 실행되는
단일 실행 파일**로 감싼 Electron 앱입니다. 주소창·탭 없는 창에서 가이드가 열립니다.

| 항목 | 값 |
| --- | --- |
| 파일 | `PetmateAftercare-Guide.exe` (portable, 단일 파일) |
| 실행 방식 | 더블클릭 → 임시 폴더에 풀린 뒤 창이 열림 (설치 과정 없음) |
| 창 | 1100 × 860, 최소 880 × 620, 제목 `Petmate Aftercare - 보호자 카톡 안내 작성기` |
| 대상 OS | Windows 10 / 11 (64비트). Chromium 내장이라 추가 런타임 불필요 |
| 서명 | 없음(미서명) → 첫 실행 시 SmartScreen 경고 → **추가 정보 → 실행** |
| 네트워크 | 없어도 동작. SheetJS(엑셀)도 내장 |

## 무엇이 들어가나

- `guide/index.html` — 원본 `../index.html` 을 `prepare-guide.py` 가 복사하면서 **두 곳만** 패치
  1. `SHEETJS_SRC` : 데스크톱은 내장 `vendor/xlsx.full.min.js`, 웹은 CDN
     (기존 CDN 경로 `.../package/xlsx.full.min.js` 는 404 → `.../package/dist/...` 로 정정)
  2. `loadSheetJS` 의 `onerror` : 내장 사본을 못 읽으면 CDN 으로 한 번 더 시도
- `guide/vendor/xlsx.full.min.js` — SheetJS 0.20.3 (sha256 고정 검증)
- `main.js` / `preload.js` — 창 셸. `app://guide/` 표준 프로토콜로 로컬 파일을 서빙해
  `localStorage`·상대경로 스크립트가 일반 웹페이지처럼 동작합니다.

## 빌드

GitHub Actions (권장) — `.github/workflows/build-windows.yml`, `windows-latest`:

```
gh workflow run build-windows.yml --ref desktop-exe -R PetmateAftercare/Test
gh run watch -R PetmateAftercare/Test
gh run download <run-id> -n PetmateAftercare-Guide-win-x64 -R PetmateAftercare/Test
```

로컬(Windows)에서:

```powershell
cd desktop
python prepare-guide.py
npm ci
npx electron-builder --win portable --x64 --publish never
# 결과: desktop/dist/PetmateAftercare-Guide.exe
```

## 검증 (CI 에서 자동)

- `scripts/verify-exe.ps1` — MZ/PE 시그니처, `machine=0x8664`(x64), `magic=0x20B`(PE32+),
  크기, `resources/app.asar` 안의 `guide/index.html`·`vendor/xlsx.full.min.js` 존재
- `scripts/smoke-test.ps1` — exe 를 실제로 실행해 `--smoke-test` 로
  창 제목·크기·가이드 DOM·localStorage·내장 SheetJS 로드, 그리고 **"보호자 발송용 문구 만들기"
  클릭 후 결과 문구 생성**까지 확인 (`dist/smoke-summary.json`)

## 가이드를 수정한 뒤

`../index.html` 만 고치고 다시 빌드하면 됩니다. `prepare-guide.py` 는 패치 지점을 정확히
찾지 못하면(원본이 바뀐 경우) 조용히 넘어가지 않고 **빌드를 실패**시킵니다.
