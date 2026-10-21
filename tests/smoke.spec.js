// 系統櫃 3D 設計平台：煙霧測試（Chromium）
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('系統櫃 3D 設計平台', () => {
  let errors;

  test.beforeEach(async ({ context, page }) => {
    await H.bypassLogin(context);
    await H.setupCdn(context);
    errors = H.collectErrors(page);
    await H.openApp(page);
  });

  test('首頁載入完成：沒有 console error、本站資源沒有 404、CDN 元件都有載到', async ({ page }) => {
    await expect(page.locator('#toolbar button[data-act="open"]')).toBeVisible();
    await expect(page.locator('#catList .cat-item').first()).toBeVisible();
    await expect(page.locator('#viewport canvas')).toBeVisible();
    // 外部元件：jsPDF（cdnjs）、JSZip（cdnjs）、three.js（jsdelivr importmap）
    const libs = await page.evaluate(() => ({ jspdf: !!window.jspdf, jszip: !!window.JSZip, three: !!window.THREE }));
    expect(libs).toEqual({ jspdf: true, jszip: true, three: true });
    // 等一下讓延後載入的圖片（型錄縮圖、色板）也回來
    await page.waitForLoadState('networkidle');
    expect(errors.pageErrors, '頁面例外').toEqual([]);
    expect(errors.console, 'console.error').toEqual([]);
    expect(errors.badResponses, '本站資源 4xx/5xx').toEqual([]);
    expect(errors.failed, '載入失敗的資源').toEqual([]);
  });

  test('載入「一字型廚櫃範例.json」後 3D 畫面有繪出櫃體', async ({ page }) => {
    await H.loadSample(page);
    await expect(page.locator('#projName')).toHaveValue('一字型廚櫃範例');
    const state = await page.evaluate(() => ({ cabinets: window.App.state.cabinets.length, room: !!window.App.state.room }));
    expect(state.room).toBe(true);
    expect(state.cabinets).toBeGreaterThan(0);
    // viewer.js 的 cabGroup 底下每個櫃體一個 Group，數量要等於專案裡的櫃體數
    expect(await H.cabObjectCount(page)).toBe(state.cabinets);
    // 3D 物件裡要真的有 Mesh
    const meshes = await page.evaluate(() => { let n = 0; window.Viewer.getCabGroup().traverse(o => { if (o.isMesh) n++; }); return n; });
    expect(meshes).toBeGreaterThan(0);
    // 報價徽章也要有件數
    await expect(page.locator('#quoteBadge')).toHaveText(String(state.cabinets));
    expect(errors.pageErrors).toEqual([]);
  });

  test('匯出「平面圖及立面圖 .PDF」會產生下載且檔案大小大於 0', async ({ page }) => {
    await H.loadSample(page);
    const download = await H.exportVia(page, 'plans');
    expect(await H.downloadSize(download)).toBeGreaterThan(0);
    // 無頭模式下 blob 下載不一定帶檔名，改驗內容：PDF 檔頭
    expect(await H.downloadHead(download, 5)).toBe('%PDF-');
    // 忙碌遮罩要收起、沒有「匯出失敗」對話框
    await expect(page.locator('#busy')).toBeHidden();
    await expect(page.locator('.modal h3', { hasText: '匯出失敗' })).toHaveCount(0);
    expect(errors.pageErrors).toEqual([]);
  });

  test('匯出「施工圖 .DXF」會產生下載且檔案大小大於 0', async ({ page }) => {
    await H.loadSample(page);
    const download = await H.exportVia(page, 'dxf', async () => {
      // DXF 會先跳出選項對話框，按「匯出 DXF」
      const btn = page.locator('.modal .mfoot button', { hasText: '匯出 DXF' });
      await btn.waitFor({ state: 'visible' });
      await btn.click();
    });
    expect(await H.downloadSize(download)).toBeGreaterThan(0);
    // DXF 內容：有 SECTION 區段與 EOF 結尾
    const text = await H.downloadText(download);
    expect(text).toMatch(/^\s*0\s*\r?\nSECTION/);
    expect(text.trim()).toMatch(/EOF$/);
    await expect(page.locator('.modal h3', { hasText: '匯出失敗' })).toHaveCount(0);
    expect(errors.pageErrors).toEqual([]);
  });

  test('切換 3D 視角與開門預覽不會拋錯', async ({ page }) => {
    await H.loadSample(page);
    for (const v of ['top', 'front', 'right', 'back', 'left', 'iso']) {
      await page.click(`#toolbar button[data-act="view:${v}"]`);
    }
    await page.click('#toolbar button[data-act="persp"]');
    await page.click('#toolbar button[data-act="persp"]');
    const openBtn = page.locator('#toolbar button[data-act="open"]');
    await openBtn.click();
    await expect(openBtn).toHaveClass(/active/);
    expect(await page.evaluate(() => window.Viewer.isOpenAll())).toBe(true);
    expect(await H.cabObjectCount(page)).toBeGreaterThan(0);
    await openBtn.click();
    await expect(openBtn).not.toHaveClass(/active/);
    expect(await page.evaluate(() => window.Viewer.isOpenAll())).toBe(false);
    // 畫面上仍有櫃體，且沒有例外
    expect(await H.cabObjectCount(page)).toBeGreaterThan(0);
    expect(errors.pageErrors).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('從型錄新增一個櫃體後，報價面板有數字', async ({ page }) => {
    // 空白專案：點型錄第一個櫃體 → 進入放置模式 → 在 3D 視窗點一下放下
    const item = page.locator('#catList .cat-item').first();
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await page.waitForFunction(() => window.Viewer.tool === 'place');
    const box = await page.locator('#viewport canvas').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx - 40, cy - 40);
    await page.mouse.move(cx, cy, { steps: 5 });
    await page.mouse.click(cx, cy);
    await page.waitForFunction(() => window.App.state.cabinets.length === 1);
    expect(await H.cabObjectCount(page)).toBe(1);

    // 報價分頁
    await page.click('.tab[data-tab="quote"]');
    const quote = page.locator('#tab-quote');
    await expect(quote).toBeVisible();
    await expect(quote.locator('table.qt')).toBeVisible();
    await expect(quote.locator('.totals .grand').last()).toHaveText(/\d/);
    const total = await page.evaluate(() => window.Pricing.quote(window.App.state).total);
    expect(total).toBeGreaterThan(0);
    await expect(page.locator('#quoteBadge')).toHaveText('1');
    await expect(page.locator('#statusTotal')).toContainText('報價總計');
    expect(errors.pageErrors).toEqual([]);
  });
});
