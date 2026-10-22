// 右側面板／報價／樓層／電路清單的互動修正（每個案例對應一個修過的 bug，修壞了就會紅）
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

// 範例專案裡依型號找櫃體 id
const cabIdByCode = (page, code) => page.evaluate(code => (window.App.state.cabinets.find(c => c.code === code) || {}).id, code);
const selectCab = async (page, id) => { await page.evaluate(id => window.App.select({ type: 'cab', id }), id); await page.locator('#tab-props .hero').waitFor(); };

test.describe('介面修正', () => {
  let errors;

  test.beforeEach(async ({ context, page }) => {
    await H.bypassLogin(context);
    await H.setupCdn(context);
    errors = H.collectErrors(page);
    await H.openApp(page);
  });

  test('#1 門片列「換邊／上移／下移／移除」、層板「移除」、門窗「刪除」按了要有反應，且不拋錯', async ({ page }) => {
    await H.loadSample(page);
    // 抽屜櫃：3 列抽屜、1 片層板
    const id = await cabIdByCode(page, 'W450D580H720-抽屜24×3-S');
    expect(id).toBeTruthy();
    await selectCab(page, id);
    const fronts = () => page.evaluate(id => window.App.state.cabinets.find(c => c.id === id).fronts.map(r => r.t + r.h), id);
    const shelves = () => page.evaluate(id => window.App.state.cabinets.find(c => c.id === id).shelves.length, id);
    const before = await fronts();
    expect(before.length).toBe(3);
    // 第一列「下移」→ 第一、二列交換
    await page.click('#tab-props .lrow.fronts [data-ra="down"][data-i="0"]');
    await expect.poll(fronts).toEqual([before[1], before[0], before[2]]);
    // 第二列「上移」→ 換回來
    await page.click('#tab-props .lrow.fronts [data-ra="up"][data-i="1"]');
    await expect.poll(fronts).toEqual(before);
    // 「移除」最後一列
    await page.click('#tab-props .lrow.fronts [data-ra="del"][data-i="2"]');
    await expect.poll(fronts).toEqual(before.slice(0, 2));
    // 層板「移除」
    expect(await shelves()).toBeGreaterThan(0);
    const nShelf = await shelves();
    await page.click('#tab-props .lrow.shelf [data-sa="del"]');
    await expect.poll(shelves).toBe(nShelf - 1);
    // 單門列「換邊」：先把配置改成一片左開門
    await page.evaluate(id => window.App.updateCab(id, '改單門', c => { c.fronts = [{ t: 'L', h: 72 }]; c.shelves = window.Model.genShelves(c); }), id);
    await page.click('#tab-props .lrow.fronts [data-ra="flip"][data-i="0"]');
    await expect.poll(fronts).toEqual(['R72']);
    // 牆面門窗「刪除」：範例的第 2 面牆有一道門（已鎖定，先解鎖才有刪除鈕）
    await page.evaluate(() => { window.App.mutate('解鎖', x => { x.room.walls[1].locked = false; }, 'room'); window.App.select({ type: 'wall', index: 1 }); });
    await page.locator('#tab-props .opening [data-oa="del"]').first().waitFor();
    await page.click('#tab-props .opening [data-oa="del"]');
    await expect.poll(() => page.evaluate(() => window.App.state.room.walls[1].openings.length)).toBe(0);
    expect(errors.pageErrors, '頁面例外').toEqual([]);
    expect(errors.console, 'console.error').toEqual([]);
  });

  test('#2 報價分頁點到別層櫃體的列：先切到那一層再選取，選取的櫃體要在目前樓層', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => window.App.addFloor());   // 新增並切到 2F（沒有櫃體）
    expect(await page.evaluate(() => window.App.state.floor)).toBe(1);
    await page.click('.tab[data-tab="quote"]');
    const row = page.locator('#tab-quote tr.qrow').first();
    await row.waitFor();
    await row.click();
    await expect.poll(() => page.evaluate(() => window.App.state.floor)).toBe(0);
    const st = await page.evaluate(() => ({ sel: window.App.sel, cab: !!window.App.selectedCab(), tab: window.UI.curTab }));
    expect(st.sel && st.sel.type).toBe('cab');
    expect(st.cab, '選取的櫃體要在目前樓層').toBe(true);
    expect(st.tab).toBe('quote');
    // 同一層的列：不切換樓層、照常選取
    await page.locator('#tab-quote tr.qrow').nth(1).click();
    expect(await page.evaluate(() => [window.App.state.floor, !!window.App.selectedCab()])).toEqual([0, true]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('#3 電路／弱電清單的「全部刪除」對天花弱電設備（偵煙等）也有效，且不會誤刪插座', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => {
      const C = window.Ceiling;
      window.App.mutate('放設備', x => { C.ensure(x.room); C.addFixture(x.room, 'smoke', [0, 0]); C.addFixture(x.room, 'smoke', [500, 0]); C.addFixture(x.room, 'cam', [0, 500]); C.addOutlet(x.room, 'socket', 0, 0, 300); }, 'room');
      window.App.select(null);
    });
    const counts = () => page.evaluate(() => ({ smoke: window.App.state.room.ceiling.fixtures.filter(f => f.type === 'smoke').length, cam: window.App.state.room.ceiling.fixtures.filter(f => f.type === 'cam').length, outlets: window.App.state.room.outlets.length }));
    expect(await counts()).toEqual({ smoke: 2, cam: 1, outlets: 1 });
    const clear = async t => {
      await page.click(`#tab-props [data-a="ol-clear"][data-t="${t}"]`);
      await page.locator('.modal .mfoot button', { hasText: '確定' }).click();
    };
    await clear('smoke');
    await expect.poll(counts).toEqual({ smoke: 0, cam: 1, outlets: 1 });
    await clear('socket');
    await expect.poll(counts).toEqual({ smoke: 0, cam: 1, outlets: 0 });
    expect(errors.pageErrors).toEqual([]);
  });

  test('#4 樓層列雙擊可重新命名（不論雙擊的是目前樓層或別的樓層）', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => window.App.addFloor());   // 兩層，目前在 2F
    const rename = async (i, name) => {
      await page.dblclick(`#floorBar [data-fl="${i}"]`);
      const modal = page.locator('.modal', { has: page.locator('h3', { hasText: '樓層名稱' }) });
      await expect(modal, '雙擊後要跳出樓層名稱對話框').toBeVisible({ timeout: 3000 });
      await modal.locator('input[name="n"]').fill(name);
      await modal.locator('.mfoot button', { hasText: '確定' }).click();
      await expect(modal).toBeHidden();
    };
    await rename(1, '二樓');   // 目前樓層
    await expect.poll(() => page.evaluate(() => window.App.state.floors[1].name)).toBe('二樓');
    await rename(0, 'B1');     // 別的樓層：第一下會切換過去，第二下仍要能觸發雙擊
    await expect.poll(() => page.evaluate(() => window.App.state.floors[0].name)).toBe('B1');
    expect(await page.evaluate(() => window.App.state.floor)).toBe(0);
    await expect(page.locator('#floorBar [data-fl="0"]')).toHaveText('B1');
    await expect(page.locator('#floorBar [data-fl="1"]')).toHaveText('二樓');
    expect(errors.pageErrors).toEqual([]);
  });

  test('#5 降板區／包樑對話框：高度、樑寬空白或 0 會提示、不會寫進狀態；正常值才建立', async ({ page }) => {
    await H.loadSample(page);
    const zones = () => page.evaluate(() => (window.App.state.room.ceiling ? window.App.state.room.ceiling.zones : []).map(z => [z.kind, z.h]));
    const modal = page.locator('.modal[role="dialog"]');
    const submit = () => modal.locator('.mfoot button', { hasText: '建立' }).click();
    // 降板區：不等對話框的 Promise（它要等使用者按鈕）
    await page.evaluate(() => { window.UI.finishCeilDraw('zone', [[-500, -500], [500, -500], [500, 500], [-500, 500]]); });
    await modal.waitFor();
    for (const bad of ['', '0', '1500']) {
      await modal.locator('input[name="h"]').fill(bad);
      await submit();
      await expect(modal.locator('.err')).not.toHaveText('');
      await expect(modal).toBeVisible();
      expect(await zones()).toEqual([]);
    }
    await modal.locator('input[name="h"]').fill('2300');
    await submit();
    await expect(modal).toBeHidden();
    expect(await zones()).toEqual([['drop', 2300]]);
    // 包樑：樑寬空白／0 也要擋
    await page.evaluate(() => { window.UI.finishCeilDraw('beam', [[-1000, 0], [1000, 0]]); });
    await modal.waitFor();
    for (const bad of ['', '0']) {
      await modal.locator('input[name="w"]').fill(bad);
      await submit();
      await expect(modal.locator('.err')).not.toHaveText('');
      expect((await zones()).length).toBe(1);
    }
    await modal.locator('input[name="w"]').fill('400');
    for (const bad of ['', '2400']) {   // 空白；高過牆高（範例牆高 2350）
      await modal.locator('input[name="h"]').fill(bad);
      await submit();
      await expect(modal.locator('.err')).not.toHaveText('');
    }
    await modal.locator('input[name="h"]').fill('2200');
    await submit();
    await expect(modal).toBeHidden();
    expect(await zones()).toEqual([['drop', 2300], ['beam', 2200]]);
    expect(errors.pageErrors).toEqual([]);
  });

  test('#6 文字欄位不當算式：樓層名稱「1-2」、客戶名稱「2*3」照原樣存；數值欄位仍可輸入算式', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => window.App.select(null));   // 專案面板
    const setField = async (sel, v) => { const el = page.locator(`#tab-props ${sel}`); await el.fill(v); await el.dispatchEvent('change'); };
    await setField('input[data-fn="0"]', '1-2');
    await expect.poll(() => page.evaluate(() => window.App.state.floors[0].name)).toBe('1-2');
    await setField('input[data-f="client"]', '2*3');
    await expect.poll(() => page.evaluate(() => window.App.state.client)).toBe('2*3');
    await setField('input[data-f="room-height"]', '2000+300');
    await expect.poll(() => page.evaluate(() => window.App.state.room.height)).toBe(2300);
    // 櫃體備註
    const id = await cabIdByCode(page, 'W900D580H720-對開72-S');
    await selectCab(page, id);
    await setField('input[data-f="note"]', '3+2');
    await expect.poll(() => page.evaluate(id => window.App.state.cabinets.find(c => c.id === id).note, id)).toBe('3+2');
    expect(errors.pageErrors).toEqual([]);
  });

  test('#7 板材售價刪除材質：別層櫃體、桌面色、踢腳板色或新櫃體預設用到時都不能刪', async ({ page }) => {
    await H.loadSample(page);
    await page.click('.tab[data-tab="pricing"]');
    await page.click('#tab-pricing [data-pa="madd"]');
    const code = await page.evaluate(() => window.App.state.pricing.materials[window.App.state.pricing.materials.length - 1].code);
    expect(code).toMatch(/^NEW/);
    const has = () => page.evaluate(code => window.App.state.pricing.materials.some(m => m.code === code), code);
    const tryDel = async () => {
      const i = await page.evaluate(code => window.App.state.pricing.materials.findIndex(m => m.code === code), code);
      await page.click(`#tab-pricing [data-pa="mdel"][data-i="${i}"]`);
    };
    const firstCab = () => page.evaluate(() => window.App.state.floors[0].cabinets[0].id);
    const set = (patch) => page.evaluate(({ patch }) => window.App.mutate('測試', s => { Object.assign(s.floors[0].cabinets[0], patch); if (s.floor === 0) Object.assign(s.cabinets[0], patch); }), { patch });
    // 1F 櫃體的踢腳板色用到
    await set({ kickColor: code }); await tryDel();
    await expect(page.locator('#toast')).toContainText('使用中');
    expect(await has()).toBe(true);
    await set({ kickColor: '110', topColor: code }); await tryDel();   // 桌面／檯面色
    expect(await has()).toBe(true);
    await set({ topColor: '407' });
    // 切到 2F 後，1F 櫃體的門片色用到：仍不能刪
    await page.evaluate(() => window.App.addFloor());
    await page.click('.tab[data-tab="pricing"]');
    await set({ doorColor: code }); await tryDel();
    await expect(page.locator('#toast')).toContainText('1F');
    expect(await has()).toBe(true);
    await set({ doorColor: '110' });
    // 新櫃體預設用到：不能刪
    await page.evaluate(code => window.App.mutate('預設', s => { s.defaults.bodyColor = code; }), code);
    await tryDel();
    await expect(page.locator('#toast')).toContainText('預設');
    expect(await has()).toBe(true);
    await page.evaluate(() => window.App.mutate('預設', s => { s.defaults.bodyColor = '110'; }));
    // 都沒用到：可以刪
    await tryDel();
    await expect.poll(has).toBe(false);
    expect(await firstCab()).toBeTruthy();
    expect(errors.pageErrors).toEqual([]);
  });

  test('#8 「加層板」空間不足時只提示，不會多出一筆空的復原紀錄；有空間時照常加', async ({ page }) => {
    await H.loadSample(page);
    const id = await cabIdByCode(page, 'W900D580H720-對開72-S');
    await selectCab(page, id);
    const shelves = () => page.evaluate(id => window.App.state.cabinets.find(c => c.id === id).shelves.length, id);
    const hist = () => page.evaluate(() => window.App.history.length);
    // 有空間：加一片、復原紀錄多一筆
    const [s0, h0] = [await shelves(), await hist()];
    await page.click('#tab-props [data-a="shelf-add"]');
    await expect.poll(shelves).toBe(s0 + 1);
    expect(await hist()).toBe(h0 + 1);
    // 塞滿層板（每 60mm 一片，空隙都小於 80）
    await page.evaluate(id => window.App.updateCab(id, '塞滿', c => { c.shelves = []; for (let y = 60; y < c.h - 40; y += 60) c.shelves.push({ y, fixed: false }); }), id);
    const [s1, h1] = [await shelves(), await hist()];
    await page.click('#tab-props [data-a="shelf-add"]');
    await expect(page.locator('#toast')).toContainText('空間不足');
    expect(await shelves()).toBe(s1);
    expect(await hist(), '不可多出一筆復原紀錄').toBe(h1);
    expect(errors.pageErrors).toEqual([]);
  });

  test('#9 天花編輯／迴路指派中刪除或重建空間：編輯模式結束、掣點清掉、指派的迴路 id 不殘留', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => { const C = window.Ceiling; window.App.mutate('放設備', x => { C.ensure(x.room); C.addFixture(x.room, 'dl_small', [0, 0]); C.addOutlet(x.room, 'socket', 0, 0, 300); }, 'room'); window.App.select(null); });
    // 進入編輯並新增一條迴路（會進入指派模式，掣點＝可指派的設備）
    await page.click('#tab-props [data-a="ceil-edit"]');
    await page.click('#tab-props [data-a="ckt-add"]');
    const mode = () => page.evaluate(() => ({ edit: window.Viewer.ceilEdit, ckt: window.Viewer.cktAssign, grips: (() => { let n = 0; window.Viewer.getCabGroup().parent.traverse(o => { if (o.userData && o.userData.cgrip) n++; }); return n; })() }));
    let m = await mode();
    expect(m.edit).toBe(true); expect(m.ckt).toBeTruthy(); expect(m.grips).toBeGreaterThan(0);
    // 刪除空間
    await page.click('#tab-props [data-a="room-del"]');
    await page.locator('.modal .mfoot button', { hasText: '確定' }).click();
    await expect.poll(() => page.evaluate(() => !!window.App.state.room)).toBe(false);
    await expect.poll(mode).toEqual({ edit: false, ckt: null, grips: 0 });
    // 在 3D 視窗點一下（原本掣點的位置）不可拋錯
    const box = await page.locator('#viewport canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // 重建空間：編輯模式仍是關的
    await page.evaluate(() => window.App.setRoom(window.Model.rectRoom(4000, 3000, 2800, 120)));
    await page.evaluate(() => { const C = window.Ceiling; window.App.mutate('放設備', x => { C.ensure(x.room); C.addFixture(x.room, 'dl_small', [0, 0]); }, 'room'); });
    await page.click('#tab-props [data-a="ceil-edit"]');
    await page.click('#tab-props [data-a="ckt-add"]');
    m = await mode(); expect(m.edit).toBe(true); expect(m.ckt).toBeTruthy();
    await page.evaluate(() => window.App.setRoom(window.Model.rectRoom(3000, 3000, 2800, 120)));
    await expect.poll(mode).toEqual({ edit: false, ckt: null, grips: 0 });
    await expect(page.locator('#tab-props [data-a="ceil-edit"]')).toContainText('編輯（拖曳調整）');
    expect(errors.pageErrors).toEqual([]);
  });

  test('#10 「套用至本層所有櫃體」只改目前樓層，按鈕與提示要說清楚', async ({ page }) => {
    await H.loadSample(page);
    await page.evaluate(() => window.App.mutate('預設', s => { s.defaults.bodyColor = '407'; }));
    await page.evaluate(() => window.App.addFloor());   // 2F：放一個櫃體
    await page.evaluate(() => { const c = window.Model.createCabinet('W450D580H320-左開32-S', { ...window.App.state.defaults, bodyColor: '110' }); window.App.addCabinet(c); window.App.switchFloor(0); window.App.select(null); });
    const btn = page.locator('#tab-props [data-a="apply-all"]');
    await expect(btn).toContainText('本層');
    await btn.click();
    await expect(page.locator('#toast')).toContainText('1F');
    const colors = await page.evaluate(() => ({ f1: [...new Set(window.App.state.floors[0].cabinets.map(c => c.bodyColor))], f2: window.App.state.floors[1].cabinets.map(c => c.bodyColor) }));
    expect(colors.f1).toEqual(['407']);
    expect(colors.f2, '別層不受影響').toEqual(['110']);
    expect(errors.pageErrors).toEqual([]);
  });

  test('#11 場景分頁改別層場景的燈光／背景：套燈光與背景，但相機不跳到那個場景', async ({ page }) => {
    await H.loadSample(page);   // 範例有 2 個 1F 場景
    await page.evaluate(() => window.App.addFloor());   // 到 2F
    await page.click('.tab[data-tab="scenes"]');
    const cam = () => page.evaluate(() => JSON.stringify(window.Viewer.getCamera()));
    const sceneCam = await page.evaluate(() => JSON.stringify({ ...window.App.state.scenes[0].cam, zoom: window.Viewer.getCamera().zoom }));
    const before = await cam();
    expect(before).not.toBe(sceneCam);
    const sel = page.locator('#tab-scenes select[data-sf="light"]').first();
    const cur = await sel.inputValue();
    const other = await sel.evaluate((s, cur) => [...s.options].map(o => o.value).find(v => v !== cur), cur);
    await sel.selectOption(other);
    await expect.poll(() => page.evaluate(() => [window.App.state.scenes[0].light, window.Viewer.getLight()])).toEqual([other, other]);
    expect(await cam(), '相機不可跳到別層場景').toBe(before);
    // 目前樓層的場景：改燈光仍會把視角帶到該場景（預覽）
    await page.locator('#tab-scenes [data-sc="add"]').click();
    await page.evaluate(() => window.Viewer.setView('top'));
    const idx = await page.evaluate(() => window.App.state.scenes.length - 1);
    const sel2 = page.locator(`#tab-scenes select[data-sf="light"][data-i="${idx}"]`);
    const cur2 = await sel2.inputValue();
    const other2 = await sel2.evaluate((s, cur) => [...s.options].map(o => o.value).find(v => v !== cur), cur2);
    await sel2.selectOption(other2);
    await expect.poll(() => page.evaluate(i => { const c = window.Viewer.getCamera(), s = window.App.state.scenes[i].cam; return c.pos.join() === s.pos.join() && c.target.join() === s.target.join(); }, idx)).toBe(true);
    expect(errors.pageErrors).toEqual([]);
  });
});
