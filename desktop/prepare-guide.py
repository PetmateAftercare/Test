#!/usr/bin/env python3
"""가이드 HTML 을 데스크톱 앱용으로 준비합니다.

1) ../index.html (웹 사이트 원본) 을 읽어 guide/index.html 로 복사하면서,
   아래 두 곳만 바꿉니다. 바꿀 원문이 정확히 한 번 나오지 않으면 실패합니다
   (원본이 바뀌었는데 조용히 옛 파일이 들어가는 일을 막기 위해서).
   - SHEETJS_SRC : 데스크톱에서는 번들 사본(vendor/)을 먼저 읽고, 웹에서는 CDN.
                   (기존 CDN 경로 .../package/xlsx.full.min.js 는 404 라서 .../dist/ 로 고침)
   - loadSheetJS 의 onerror : 번들 사본을 못 읽으면 CDN 으로 한 번 더 시도.
2) SheetJS 를 내려받아 vendor/xlsx.full.min.js 로 넣고 sha256 을 검증합니다.
"""

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_HTML = os.path.normpath(os.path.join(HERE, "..", "index.html"))
OUT_DIR = os.path.join(HERE, "guide")
OUT_HTML = os.path.join(OUT_DIR, "index.html")
VENDOR_DIR = os.path.join(OUT_DIR, "vendor")
OUT_XLSX = os.path.join(VENDOR_DIR, "xlsx.full.min.js")

SHEETJS_CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
SHEETJS_SHA256 = "cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41"

PATCH_LABEL = "데스크톱 앱 빌드 패치"

REPLACEMENTS = [
    (
        "sheetjs-source",
        "  var SHEETJS_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';",
        "  /* " + PATCH_LABEL + ": 데스크톱은 내장 사본, 웹은 CDN */\n"
        "  var SHEETJS_CDN = '" + SHEETJS_CDN + "';\n"
        "  var SHEETJS_SRC = (typeof window !== 'undefined' && window.__PETMATE_DESKTOP__) ? 'vendor/xlsx.full.min.js' : SHEETJS_CDN;",
    ),
    (
        "sheetjs-fallback",
        "      s.onerror = function(){ if (done) return; done = true; cb(false); };",
        "      s.onerror = function(){\n"
        "        if (done) return;\n"
        "        if (s.src.indexOf(SHEETJS_CDN) < 0){\n"
        "          /* " + PATCH_LABEL + ": 내장 사본을 못 읽으면 온라인 CDN 으로 한 번 더 시도 */\n"
        "          try {\n"
        "            var s2 = document.createElement('script');\n"
        "            s2.src = SHEETJS_CDN;\n"
        "            s2.async = true;\n"
        "            s2.onload = function(){ if (done) return; done = true; cb(typeof XLSX !== 'undefined' && !!XLSX); };\n"
        "            s2.onerror = function(){ if (done) return; done = true; cb(false); };\n"
        "            document.head.appendChild(s2);\n"
        "            return;\n"
        "          } catch(e){}\n"
        "        }\n"
        "        done = true; cb(false);\n"
        "      };",
    ),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fail(msg: str) -> None:
    print("[prepare-guide] 오류: " + msg, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not os.path.isfile(SRC_HTML):
        fail("원본 가이드가 없습니다: " + SRC_HTML)

    with open(SRC_HTML, "r", encoding="utf-8") as fh:
        html = fh.read()
    src_hash = sha256_bytes(html.encode("utf-8"))

    for name, old, new in REPLACEMENTS:
        found = html.count(old)
        if found != 1:
            fail("패치 지점 '%s' 를 정확히 1곳에서 찾지 못했습니다(발견 %d곳). 원본 index.html 이 바뀌었는지 확인하세요." % (name, found))
        html = html.replace(old, new, 1)

    if PATCH_LABEL not in html:
        fail("패치 흔적이 결과물에 없습니다.")

    os.makedirs(VENDOR_DIR, exist_ok=True)
    with open(OUT_HTML, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)

    # SheetJS 내려받기 + 검증
    if os.path.isfile(OUT_XLSX):
        with open(OUT_XLSX, "rb") as fh:
            blob = fh.read()
    else:
        print("[prepare-guide] SheetJS 내려받는 중: " + SHEETJS_CDN)
        req = urllib.request.Request(SHEETJS_CDN, headers={"User-Agent": "PetmateAftercare-build"})
        with urllib.request.urlopen(req, timeout=120) as res:
            blob = res.read()
        with open(OUT_XLSX, "wb") as fh:
            fh.write(blob)

    got = sha256_bytes(blob)
    if got != SHEETJS_SHA256:
        fail("SheetJS sha256 불일치: 기대 %s / 실제 %s" % (SHEETJS_SHA256, got))
    if len(blob) < 500000:
        fail("SheetJS 파일이 너무 작습니다: %d bytes" % len(blob))

    info = {
        "preparedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "../index.html",
        "sourceSha256": src_hash,
        "guideSha256": sha256_bytes(html.encode("utf-8")),
        "guideBytes": len(html.encode("utf-8")),
        "patches": [name for name, _, _ in REPLACEMENTS],
        "sheetjs": {"url": SHEETJS_CDN, "bytes": len(blob), "sha256": got},
    }
    with open(os.path.join(OUT_DIR, "build-info.json"), "w", encoding="utf-8") as fh:
        json.dump(info, fh, ensure_ascii=False, indent=2)

    print("[prepare-guide] 완료")
    print(json.dumps(info, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
