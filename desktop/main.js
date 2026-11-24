'use strict';

/*
 * Petmate Aftercare - 보호자 카톡 안내 작성기
 * Windows 데스크톱 앱 셸 (Electron)
 *
 * - guide/index.html 을 app://guide/ 프로토콜로 로컬에서 불러옵니다.
 *   (file:// 대신 표준 보안 출처를 써서 localStorage · 상대경로 스크립트가 정상 동작)
 * - 주소창·탭 없는 단일 창, 창 제목은 APP_TITLE 고정
 * - 외부 링크는 기본 브라우저로 열고, 앱 창은 다른 주소로 이동하지 않습니다.
 * - --smoke-test 로 실행하면 창·가이드·문구 생성까지 자동 점검하고 결과를 JSON으로 남깁니다.
 */

const { app, BrowserWindow, Menu, protocol, screen, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = 'Petmate Aftercare - 보호자 카톡 안내 작성기';
const APP_ID = 'com.petmate.aftercare.guide';
const GUIDE_DIR = path.join(__dirname, 'guide');
const START_URL = 'app://guide/index.html';
const DEFAULT_SIZE = { width: 1100, height: 860 };
const MIN_SIZE = { width: 880, height: 620 };

const argv = process.argv.slice(1);
const hasFlag = (name) => argv.includes('--' + name);
const optValue = (name) => {
  const hit = argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : null;
};

const SMOKE = hasFlag('smoke-test');
const SMOKE_OUT = optValue('smoke-out');
const SMOKE_TIMEOUT_MS = 120000;

if (SMOKE) {
  app.disableHardwareAcceleration();
}

/* ---------- 로컬 파일 프로토콜 (앱 시작 전 등록) ---------- */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      codeCache: true
    }
  }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function registerGuideProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'guide') {
        return new Response('Not found', { status: 404 });
      }
      let rel = decodeURIComponent(url.pathname || '/');
      if (rel === '/' || rel === '') rel = '/index.html';
      const target = path.normalize(path.join(GUIDE_DIR, rel));
      if (target !== GUIDE_DIR && !target.startsWith(GUIDE_DIR + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(target);
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': type,
          'cache-control': 'no-cache'
        }
      });
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  });
}

/* ---------- 창 크기/위치 기억 ---------- */

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function savedBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (!raw || raw.width < MIN_SIZE.width || raw.height < MIN_SIZE.height) return null;
    const bounds = { width: Math.round(raw.width), height: Math.round(raw.height) };
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      const area = screen.getAllDisplays().some((display) => {
        const b = display.workArea;
        return raw.x >= b.x - 40 && raw.y >= b.y - 40 &&
          raw.x + 120 <= b.x + b.width && raw.y + 80 <= b.y + b.height;
      });
      if (area) {
        bounds.x = Math.round(raw.x);
        bounds.y = Math.round(raw.y);
      }
    }
    return bounds;
  } catch (err) {
    return null;
  }
}

function saveBounds(win) {
  try {
    const b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(statePath(), JSON.stringify(b), 'utf8');
  } catch (err) {
    /* 창 상태 저장 실패는 앱 동작에 영향 없음 */
  }
}

/* ---------- 메뉴 (자동 숨김, Alt 로 표시) ---------- */

function buildMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        { role: 'quit', label: '끝내기' }
      ]
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' }
      ]
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload', label: '새로 고침' },
        { type: 'separator' },
        { role: 'resetZoom', label: '기본 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' }
      ]
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '이 앱에 대하여',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'info',
              title: '이 앱에 대하여',
              message: APP_TITLE,
              detail: [
                '펫메이트 애프터케어 1분 작성 가이드를 오프라인에서 실행하는 데스크톱 앱입니다.',
                '모든 자료는 이 PC 안에서만 처리되며 서버로 보내지 않습니다.',
                '',
                '버전 1.0.0 · Electron ' + process.versions.electron
              ].join('\n'),
              buttons: ['확인']
            });
          }
        }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

/* ---------- 스모크 테스트 ---------- */

const SMOKE_SCRIPT = `
(async () => {
  const out = {};
  const q = (s) => document.querySelector(s);
  out.title = document.title || '';
  out.desktopFlag = window.__PETMATE_DESKTOP__ === true;
  out.hasMakeBtn = !!q('#makeBtn');
  out.hasCommentInput = !!q('#commentInput');
  out.hasCopyBtn = !!q('#copyMsg');
  out.hasCardData = !!q('#cardData');

  try {
    localStorage.setItem('__petmate_smoke', '1');
    out.localStorage = localStorage.getItem('__petmate_smoke') === '1';
    localStorage.removeItem('__petmate_smoke');
  } catch (e) {
    out.localStorage = false;
    out.localStorageError = String(e && e.message || e);
  }

  out.xlsx = await new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.async = true;
      s.onload = () => finish(typeof XLSX !== 'undefined' && !!XLSX);
      s.onerror = () => finish(false);
      document.head.appendChild(s);
      setTimeout(() => finish(false), 10000);
    } catch (e) {
      finish(false);
    }
  });

  try {
    const hospital = q('#hospitalName');
    if (hospital) {
      hospital.value = '\uD14C\uC2A4\uD2B8\uB3D9\uBB3C\uBCD1\uC6D0';
      hospital.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const ta = q('#commentInput');
    ta.value = '\uBCF4\uD638\uC790: \uAE40\uBBFC\uC218\\n\uC544\uC774: \uCF69\uC774\\n\uC624\uB298 \uC544\uCE68 \uAD6C\uD1A0 2\uD68C, \uC2DD\uC695\uC774 \uC904\uC5C8\uC2B5\uB2C8\uB2E4. \uBB3C\uC740 \uB9C8\uC2DC\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uB0B4\uC77C \uC624\uC804 \uC7AC\uC9C4 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    q('#makeBtn').click();
    await new Promise((r) => setTimeout(r, 600));
    const pv = q('#previewText');
    out.preview = pv ? (pv.innerText || '').trim() : '';
    out.previewLength = out.preview.length;
    out.resultVisible = q('#result') ? !q('#result').hidden : false;
    out.charBadge = q('#charBadge') ? (q('#charBadge').innerText || '').trim() : '';
  } catch (e) {
    out.makeError = String(e && e.message || e);
  }
  return out;
})()
`;

function writeSmokeReport(report) {
  const text = JSON.stringify(report, null, 2);
  console.log('[smoke] ' + text);
  if (SMOKE_OUT) {
    try {
      const target = path.isAbsolute(SMOKE_OUT) ? SMOKE_OUT : path.join(process.cwd(), SMOKE_OUT);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, 'utf8');
    } catch (err) {
      console.error('[smoke] 결과 파일 저장 실패: ' + err.message);
    }
  }
}

async function runSmoke(win, extra) {
  const report = Object.assign(
    {
      app: 'PetmateAftercare-Guide',
      version: app.getVersion(),
      when: new Date().toISOString(),
      platform: process.platform + ' ' + process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      window: {},
      page: {},
      failures: []
    },
    extra || {}
  );

  try {
    const bounds = win.getBounds();
    report.window = {
      title: win.getTitle(),
      bounds,
      visible: win.isVisible(),
      menuBarVisible: win.isMenuBarVisible()
    };
  } catch (err) {
    report.window = { error: String(err && err.message || err) };
    report.failures.push('window-state');
  }

  try {
    report.page = await win.webContents.executeJavaScript(SMOKE_SCRIPT, true);
  } catch (err) {
    report.page = { error: String(err && err.message || err) };
    report.failures.push('page-script');
  }

  const p = report.page || {};
  if (!p.hasMakeBtn) report.failures.push('guide-dom-missing');
  if (p.desktopFlag !== true) report.failures.push('preload-flag-missing');
  if (p.localStorage !== true) report.failures.push('localstorage');
  if (p.xlsx !== true) report.failures.push('sheetjs-local');
  if (p.resultVisible !== true) report.failures.push('result-hidden');
  if (!(p.previewLength > 20)) report.failures.push('preview-empty');
  if (report.window && report.window.title !== APP_TITLE) report.failures.push('window-title');

  report.ok = report.failures.length === 0;
  writeSmokeReport(report);
  return report.ok;
}

/* ---------- 앱 ---------- */

let mainWindow = null;
let smokeDone = false;

function finishSmoke(code) {
  if (smokeDone) return;
  smokeDone = true;
  const t = setTimeout(() => app.exit(code), 1500);
  t.unref();
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.destroy(); } catch (err) { /* ignore */ }
  }
  app.exit(code);
}

function createWindow() {
  const bounds = SMOKE ? Object.assign({}, DEFAULT_SIZE) : (savedBounds() || Object.assign({}, DEFAULT_SIZE));

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    backgroundColor: '#eef7f5',
    title: APP_TITLE,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !SMOKE
    }
  });

  Menu.setApplicationMenu(buildMenu());

  /* 가이드 페이지의 <title> 이 창 제목을 덮어쓰지 못하게 고정 */
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(APP_TITLE);
  });

  win.once('ready-to-show', () => {
    win.setTitle(APP_TITLE);
    win.show();
  });

  /* 외부 링크는 기본 브라우저로 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('app://guide/')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  if (!SMOKE) {
    win.on('close', () => saveBounds(win));
  }

  const loadFallback = () => {
    if (win.isDestroyed()) return;
    win.loadFile(path.join(GUIDE_DIR, 'index.html')).catch((err) => {
      console.error('[petmate] 가이드를 열지 못했습니다: ' + (err && err.message));
    });
  };

  win.loadURL(START_URL).catch((err) => {
    console.error('[petmate] app:// 로드 실패, 파일 직접 로드로 전환: ' + (err && err.message));
    loadFallback();
  });

  win.webContents.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (SMOKE) {
      writeSmokeReport({ ok: false, failures: ['did-fail-load'], code, desc, url });
      finishSmoke(1);
      return;
    }
    if (isMainFrame && code !== -3) loadFallback();
  });

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        runSmoke(win, { loadUrl: START_URL }).then((ok) => finishSmoke(ok ? 0 : 1));
      }, 900);
    });

    const killer = setTimeout(() => {
      writeSmokeReport({ ok: false, failures: ['timeout'] });
      finishSmoke(1);
    }, SMOKE_TIMEOUT_MS);
    killer.unref();
  }

  return win;
}

/* ---------- 다운로드 (엑셀 내려받기 등 미래 대비) ---------- */

function wireDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    item.setSaveDialogOptions({
      title: '저장할 위치 선택',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename())
    });
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  registerGuideProtocol();
  wireDownloads();
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (SMOKE) return;
  app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[petmate] 예기치 않은 오류: ' + (err && err.stack || err));
  if (SMOKE) {
    writeSmokeReport({ ok: false, failures: ['uncaught'], error: String(err && err.message || err) });
    finishSmoke(1);
  }
});

module.exports = {};
