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
});
