'use strict';

/**
 * 데스크톱 앱 표식만 노출합니다. (window.__PETMATE_DESKTOP__ === true)
 * 가이드 HTML 은 이 값으로 SheetJS 를 CDN 대신 번들 사본(vendor/)에서 불러옵니다.
 * Node 기능은 페이지에 전혀 넘기지 않습니다.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__PETMATE_DESKTOP__', true);

contextBridge.exposeInMainWorld('petmateDesktop', {
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome
});
