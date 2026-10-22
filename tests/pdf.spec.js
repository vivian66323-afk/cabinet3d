// PDF 出圖的版面與圖文一致性（Chromium）：攔截 Drawings／Viewer 的呼叫參數來驗證，不解析 PDF 影像
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('PDF 出圖', () => {
  let errors;

  test.beforeEach(async ({ context, page }) => {
    await H.bypassLogin(context);
    await H.setupCdn(context);
    errors = H.collectErrors(page);
    await H.openApp(page);
    await H.loadSample(page);
  });

  test('平面圖及立面圖：有空的樓層時，標題欄「頁次 x / y」的總頁數要等於實際頁數', async ({ page }) => {
    // 加一個沒有空間也沒有櫃體的樓層（這層不會出圖）
    await page.evaluate(() => {
      window.App.mutate('新增空樓層', s => s.floors.push({ id: 'f-empty', name: '2F', room: null, cabinets: [] }));
      window.__frames = [];
      const orig = window.Drawings.frame;
      window.Drawings.frame = function (pg, title, info) { window.__frames.push({ title, page: info.page, pages: info.pages }); return orig.apply(this, arguments); };
    });
    const download = await H.exportVia(page, 'plans');
    expect(await H.downloadSize(download)).toBeGreaterThan(0);
    const frames = await page.evaluate(() => window.__frames);
    expect(frames.length).toBeGreaterThan(0);
    const maxPage = Math.max(...frames.map(f => f.page));
    const totals = [...new Set(frames.map(f => f.pages))];
    expect(totals, '每頁標題欄寫的總頁數要一致').toHaveLength(1);
    expect(totals[0], '總頁數＝實際最後一頁的頁次').toBe(maxPage);
    expect(errors.pageErrors).toEqual([]);
  });

  test('櫃體三視圖：L 形桌面的俯視圖（深度為 l2）不可壓到正視圖', async ({ page }) => {
    await page.evaluate(() => {
      const desk = window.Model.createCabinet('DESK-L', window.App.state.defaults);
      Object.assign(desk, { x: 0, z: 0, rot: 0 });
      window.App.addCabinet(desk);
      window.__draw = [];
      ['cabTop', 'cabFront', 'cabSide'].forEach(k => {
        const orig = window.Drawings[k];
        window.Drawings[k] = function (pg, cab, x, y, s) { window.__draw.push({ fn: k, code: cab.code, y: cab.y, h: cab.h, thick: cab.thick, depth: window.Model.footDepth(cab), x, py: y, s }); return orig.apply(this, arguments); };
      });
    });
    const download = await H.exportVia(page, 'views');
    expect(await H.downloadSize(download)).toBeGreaterThan(0);
    const draw = await page.evaluate(() => window.__draw);
    const top = draw.find(d => d.fn === 'cabTop' && d.code === 'DESK-L');
    const front = draw.find(d => d.fn === 'cabFront' && d.code === 'DESK-L');
    expect(top, '有畫 L 形桌面的俯視圖').toBeTruthy();
    expect(front, '有畫 L 形桌面的正視圖').toBeTruthy();
    const topBottom = top.py + top.depth / top.s;                       // 俯視圖最下緣（紙面 mm）
    const frontTop = front.py - (front.y + front.thick) / front.s;      // 正視圖最上緣（桌面上緣）
    expect(topBottom, `俯視圖下緣 ${topBottom.toFixed(1)} 要在正視圖上緣 ${frontTop.toFixed(1)} 之上`).toBeLessThan(frontTop);
    expect(errors.pageErrors).toEqual([]);
  });

  test('報價單：3D 圖上的項次圓圈只標示圖中那一層的櫃體，且會用第一個場景所屬的樓層出圖', async ({ page }) => {
    // 範例有兩個場景（皆屬 1F）。新增 2F 放一件櫃體後停在 2F 匯出報價單
    const floors = await page.evaluate(() => {
      const App = window.App;
      App.addFloor();
      const c = window.Model.createCabinet('W450D580H320-左開32-S', App.state.defaults);
      Object.assign(c, { x: 0, z: 0, rot: 0 });
      App.addCabinet(c);
      window.__render = [];
      const orig = window.Viewer.renderImage;
      window.Viewer.renderImage = function (w, h, scn, marks) {
        const url = orig.apply(this, arguments);
        window.__render.push({ floor: App.state.floor, shown: App.state.cabinets.map(x => x.id), marks: (marks || []).map(m => ({ n: m.n, id: m.id, vis: m.vis })) });
        return url;
      };
      return { floor: App.state.floor, sceneFloor: App.state.scenes[0].floor, cabs2F: App.state.cabinets.length };
    });
    expect(floors.floor).toBe(1);
    expect(floors.sceneFloor).toBe(0);
    const download = await H.exportVia(page, 'quote');
    expect(await H.downloadSize(download)).toBeGreaterThan(0);
    const r = await page.evaluate(() => ({ render: window.__render, floorNow: window.App.state.floor, ids1F: window.App.state.floors[0].cabinets.map(c => c.id) }));
    expect(r.render).toHaveLength(1);
    const shot = r.render[0];
    expect(shot.floor, '第一個場景屬 1F，報價單的 3D 圖要切到 1F 來畫').toBe(0);
    // 圓圈標記的數量＝圖中那層的櫃體數，而且每個都對得到圖中的櫃體
    expect(shot.marks.length, '標記數＝圖中樓層的櫃體數').toBe(shot.shown.length);
    shot.marks.forEach(m => expect(shot.shown, `標記 ${m.n} 的櫃體要在圖中`).toContain(m.id));
    expect(r.floorNow, '匯出後要切回原本所在的樓層').toBe(1);
    expect(errors.pageErrors).toEqual([]);
  });
});
