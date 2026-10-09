/* 型錄資料、材質、零件與門板單價（來源：photo/ 型錄 2015/4/4 版） */
(function () {
  const HEIGHTS = { '1': 320, '15': 480, '2': 640, '21': 700, '22': 720, '3': 960, '4': 1280, '5': 1600, '6': 1920, '65': 2080, '7': 2240, '75': 2400, '8': 2560 };
  const HEIGHT_LABEL = { '1': '1', '15': '1.5', '2': '2', '21': '2.1', '22': '2.2', '3': '3', '4': '4', '5': '5', '6': '6', '65': '6.5', '7': '7', '75': '7.5', '8': '8' };
  const HEIGHT_USE = {
    '1': '床頭櫃·電視櫃·和室櫃', '15': '電視櫃', '2': '書桌·抽屜櫃·隔間櫃', '21': '抽油煙機吊櫃', '22': '餐廳櫃·隔間櫃·廚具',
    '3': '鞋櫃·隔間櫃·床頭櫃', '4': '書櫃·隔間櫃', '5': '書櫃·隔間櫃', '6': '書櫃·隔間櫃·衣櫃',
    '65': '書櫃·衣櫃', '7': '書櫃·衣櫃', '75': '衣櫃', '8': '衣櫃'
  };
  const DEPTHS = { A: 580, B: 408, C: 360, T: 500 };
  const DEPTH_NAME = { A: 'A深 580', B: 'B深 408', C: 'C深 360', T: 'T深 500（電視空櫃）' };
  const CORNER_W = { A: 1050, B: 880, C: 830 };
  const KICK = 100;          // 踢腳板高
  const BOARD = 18;          // 櫃體板厚
  const BACK = 8;            // 背板厚

  const FRONT_NAME = { O: '開放', L: '左開門', R: '右開門', P: '對開門', G: '玻璃門', GP: '玻璃對開門', D: '抽屜', F: '折疊門', E: '電器抽' };   // E＝電器抽：開放格＋底部可拉出托盤
  const FRONT_HEIGHTS = [12, 16, 24, 32, 48, 64, 72, 96, 112, 128, 160, 176, 192, 208, 224, 240, 256];

  // 系統櫃型錄：js/catalog.js（代碼即 W寬D深H高-櫃型門片-S）
  const items = (window.CATALOG || []).map(it => ({ ...it, fronts: (it.fronts || []).map(r => ({ ...r })) }));
  const TRI_TYPE_NAME = { '00': '兩片板', '01': 'A型斜角', '02': 'B型圓弧' };

  // 桌面（依才數計價）：矩形 / L形 / ㄇ形
  const DESK_SHAPES = { R: '矩形', L: 'L形', U: 'ㄇ形' };
  [
    { code: 'DESK-R', shape: 'R', w: 1200, d: 600, l2: 600 },
    { code: 'DESK-L', shape: 'L', w: 1800, d: 600, l2: 1500 },
    { code: 'DESK-U', shape: 'U', w: 2400, d: 600, l2: 1500 }
  ].forEach(dk => items.push({ ...dk, price: 0, hc: 'desk', dc: 'A', h: 18, kind: 'desk', fronts: [], group: 'desk', hanging: false }));
  // 桌面材質、厚度、端部處理
  const DESK_MATS = [
    { id: 'SYS', name: '系統板' }, { id: 'MEL', name: '美耐板' }, { id: 'ART', name: '人造石' },
    { id: 'QTZ', name: '石英石' }, { id: 'WOOD', name: '實木' }
  ];
  const DESK_THICK = [18, 25, 30, 40];
  const DESK_EDGES = [
    { id: 'none', name: '不處理' }, { id: 'q', name: '1/4圓角' }, { id: 'h', name: '1/2圓角' },
    { id: 'c', name: '5mm倒角' }, { id: 'drip', name: '凸20mm下方設止水溝槽' }
  ];
  // 預設每才單價（元/才，1才＝30.3×30.3cm）與端部加工（元/尺），皆可於「板材售價」修改
  const DESK_PRICE = {
    SYS: { 18: 70, 25: 85, 30: 100, 40: 130 },
    MEL: { 18: 90, 25: 105, 30: 120, 40: 150 },
    ART: { 18: 250, 25: 280, 30: 300, 40: 350 },
    QTZ: { 18: 450, 25: 480, 30: 520, 40: 600 },
    WOOD: { 18: 300, 25: 380, 30: 450, 40: 550 }
  };
  const DESK_EDGE_PRICE = { none: 0, q: 30, h: 60, c: 20, drip: 80 };
  // 廚房設備：台灣五大廚電品牌（櫻花、林內、豪山、喜特麗、莊頭北）現行型號規格
  // 售價為官方建議售價或通路價，est:true 為查無公開價的估計值；皆可於「板材售價」修改
  // at：sink 水槽 / hob 爐具 / dw 洗碗機 / dryer 烘碗機 / oven 烤箱 / hood 抽油煙機
  // mount：counter 嵌入檯面（自動放在櫃體上方、桌面開孔）/ floor 落地 / builtin 嵌入櫃內 / wall 壁掛
  const APPL_TYPES = { sink: '水槽', hob: '爐具', dw: '洗碗機', dryer: '烘碗機', oven: '烤箱', hood: '抽油煙機' };
  const APPLIANCES = [
    { code: 'SF-550A', at: 'sink', name: '手工方形水槽 55cm', w: 550, d: 460, h: 220, cut: [520, 430], price: 8505, finish: 'steel', mount: 'counter', spec: '外徑 550×460×220　內槽約 500×410　SUS304' },
    { code: 'SF-750A', est: true, at: 'sink', name: '手工方形水槽 75cm', w: 750, d: 460, h: 220, cut: [720, 430], price: 11000, finish: 'steel', mount: 'counter', spec: '外徑 750×460×220　內槽約 700×410　SUS304' },
    { code: 'SF-850A-01', at: 'sink', name: '手工方形水槽 85cm', w: 850, d: 460, h: 220, cut: [820, 430], price: 13410, finish: 'steel', mount: 'counter', spec: '外徑 850×460×220　內槽 800×410×220　SUS304' },
    { code: 'G2522S', est: true, at: 'hob', name: '二口小面板易清檯面爐（不鏽鋼）', w: 730, d: 420, h: 130, cut: [670, 350], price: 9900, finish: 'steel', burners: 2, mount: 'counter', spec: '機體 730×420×130　挖孔 670×350 R85　LPG/NG 8.6kW' },
    { code: 'G2522BG', est: true, at: 'hob', name: '二口小面板易清檯面爐（黑玻璃）', w: 730, d: 420, h: 125, cut: [670, 350], price: 10900, finish: 'glass', burners: 2, mount: 'counter', spec: '機體 730×420×125　挖孔 670×350 R85　強化玻璃' },
    { code: 'G2623AG', est: true, at: 'hob', name: '二口大面板易清檯面爐（黑玻璃）', w: 775, d: 520, h: 130, cut: [728, 468], price: 14900, finish: 'glass', burners: 2, mount: 'counter', spec: '機體 775×520×130　挖孔 728×468 R113' },
    { code: 'E7783', at: 'dw', name: '全嵌式自動開門洗碗機 60cm', w: 598, d: 550, h: 815, price: 31500, finish: 'panel', mount: 'floor', y: 0, spec: '598×550×815　14人份　1000W　需自備門板' },
    { code: 'E7683', est: true, at: 'dw', name: '半嵌式自動開門洗碗機 60cm', w: 598, d: 570, h: 815, price: 28900, finish: 'steel', mount: 'floor', y: 0, spec: '598×570×815　不鏽鋼面板　8段洗程' },
    { code: 'Q7693', est: true, at: 'dryer', name: '全平面玻璃觸控落地式烘碗機 60cm', w: 595, d: 520, h: 680, price: 15900, finish: 'glass', mount: 'floor', y: 100, spec: '595×520×680　約25人份　O3臭氧殺菌' },
    { code: 'Q7693L', est: true, at: 'dryer', name: '全平面玻璃觸控落地式烘碗機 60cm（高70）', w: 595, d: 520, h: 700, price: 16900, finish: 'glass', mount: 'floor', y: 100, spec: '595×520×700　約25人份　O3臭氧殺菌' },
    { code: 'Q7596BML', est: true, at: 'dryer', name: '落地嵌門式烘碗機 50cm', w: 495, d: 520, h: 700, price: 13900, finish: 'panel', mount: 'floor', y: 100, spec: '495×520×700　需自備嵌門板' },
    { code: 'Q7565BWL', est: true, at: 'dryer', name: '懸掛式殺菌烘碗機 80cm', w: 796, d: 332, h: 400, price: 10900, finish: 'white', mount: 'wall', y: 1500, spec: '796×332×400　約12人份　白色烤漆' },
    { code: 'Q7565BWXL', est: true, at: 'dryer', name: '懸掛式殺菌烘碗機 90cm', w: 896, d: 332, h: 400, price: 11900, finish: 'white', mount: 'wall', y: 1500, spec: '896×332×400　約12人份　白色烤漆' },
    { code: 'E6672', at: 'oven', name: '嵌入式電烤箱 65L', w: 595, d: 575, h: 595, price: 18000, finish: 'glass', mount: 'builtin', y: 180, spec: '595×575×595　嵌入開口 560×550×590　220V 2800W' },
    { code: 'DR3590AL', est: true, at: 'hood', name: '全隱藏式除油煙機 80cm', w: 790, d: 346, h: 286, price: 22900, finish: 'steel', style: 'hidden', mount: 'builtin', y: 1550, spec: '790×346×286　排風口 Φ179　17 m³/min' },
    { code: 'DR3590AXL', est: true, at: 'hood', name: '全隱藏式除油煙機 90cm', w: 890, d: 346, h: 286, price: 23900, finish: 'steel', style: 'hidden', mount: 'builtin', y: 1550, spec: '890×346×286　排風口 Φ179　17 m³/min' },
    { code: 'R7650XL', at: 'hood', name: '近吸除油煙機 90cm', w: 890, d: 430, h: 474, price: 19700, finish: 'glass', style: 'near', mount: 'wall', y: 1450, spec: '890×430×474　近吸式　延遲除味' },
    // ---- 林內 Rinnai
    { brand: '林內 Rinnai', code: 'RB-2GMB', at: 'hob', name: '檯面式美食家二口爐（黑玻璃）', w: 750, d: 450, h: 133, cut: [670, 350], price: 11500, est: true, finish: 'glass', burners: 2, mount: 'counter', spec: '外觀 750×450×133　挖孔 670×350　強化玻璃' },
    { brand: '林內 Rinnai', code: 'RKD-6035S', at: 'dryer', name: '落地式臭氧殺菌烘碗機 60cm（嵌門式）', w: 596, d: 500, h: 700, price: 19800, finish: 'panel', mount: 'floor', y: 100, spec: '596×500×700　臭氧殺菌　可自備嵌門板' },
    { brand: '林內 Rinnai', code: 'RBO-5CS1-TW', at: 'oven', name: '嵌入式電燒烤五段功能烹調烤箱 61L', w: 595, d: 550, h: 595, price: 25100, finish: 'steel', mount: 'builtin', y: 180, spec: '595×550×595　嵌入開口 565×585×550　220V　義大利原裝' },
    { brand: '林內 Rinnai', code: 'RH-9033S', at: 'hood', name: '斜背深罩式水洗＋電熱除油排油煙機 90cm', w: 894, d: 574, h: 330, price: 9700, finish: 'steel', style: 'deep', mount: 'wall', y: 1550, spec: '894×574×330　SUS430　175W' },
    // ---- 豪山 HOSUN
    { brand: '豪山 HOSUN', code: 'VSTQ40-2', at: 'sink', name: 'SMEG 方形水槽（下嵌式）', w: 420, d: 418, h: 210, cut: [400, 398], price: 17900, finish: 'steel', mount: 'counter', spec: '外觀 420×418×210　內徑 400×398×200　下嵌式（豪山代理 SMEG）' },
    { brand: '豪山 HOSUN', code: 'SB-2202', at: 'hob', name: '雙口歐化玻璃檯面爐', w: 780, d: 520, h: 115, cut: [725, 465], price: 13000, finish: 'glass', burners: 2, mount: 'counter', spec: '機體 780×520×115　挖孔 725×465 R85' },
    { brand: '豪山 HOSUN', code: 'SK-2051S', at: 'hob', name: '歐化嵌入爐（不鏽鋼）', w: 700, d: 464, h: 238, cut: [670, 320], price: 7700, finish: 'steel', burners: 2, mount: 'counter', spec: '機體 700×464×238　挖孔 670×320' },
    { brand: '豪山 HOSUN', code: 'PLTW64X-2', at: 'dw', name: 'SMEG 嵌入式洗碗機 60cm', w: 598, d: 568, h: 818, price: 47500, finish: 'steel', mount: 'floor', y: 0, spec: '598×568×818　12人份　不鏽鋼前板（豪山代理 SMEG）' },
    { brand: '豪山 HOSUN', code: 'FD-6201', at: 'dryer', name: '觸控立式雙抽烘碗機 60cm', w: 596, d: 500, h: 700, price: 15900, finish: 'glass', mount: 'floor', y: 100, spec: '596×500×700　雙抽屜' },
    { brand: '豪山 HOSUN', code: 'FD-5201', at: 'dryer', name: '觸控立式雙抽烘碗機 50cm', w: 496, d: 500, h: 700, price: 14900, finish: 'glass', mount: 'floor', y: 100, spec: '496×500×700　雙抽屜' },
    { brand: '豪山 HOSUN', code: 'FW-8909', at: 'dryer', name: '紫外線殺菌懸掛式烘碗機 80cm', w: 798, d: 327, h: 397, price: 10200, finish: 'white', mount: 'wall', y: 1500, spec: '798×327×397　紫外線殺菌' },
    { brand: '豪山 HOSUN', code: 'FW-9909', at: 'dryer', name: '紫外線殺菌懸掛式烘碗機 90cm', w: 898, d: 327, h: 397, price: 10400, finish: 'white', mount: 'wall', y: 1500, spec: '898×327×397　紫外線殺菌' },
    { brand: '豪山 HOSUN', code: 'VEA-9031PH', at: 'hood', name: '隱藏式熱除油排油煙機 90cm', w: 891, d: 380, h: 185, price: 9900, finish: 'steel', style: 'hidden', mount: 'builtin', y: 1550, spec: '891×380×185　超薄隱藏式　熱除油' },
    { brand: '豪山 HOSUN', code: 'VSR-9301', at: 'hood', name: '近吸排油煙機 90cm', w: 895, d: 400, h: 461, price: 18500, finish: 'glass', style: 'near', mount: 'wall', y: 1450, spec: '895×400×461　玻璃觸控　熱除油' },
    // ---- 喜特麗 JTL
    { brand: '喜特麗 JTL', code: 'JT-A6015', at: 'sink', name: '不鏽鋼雙槽水槽 76cm', w: 760, d: 520, h: 220, cut: [730, 490], bowls: [0.62, 0.38], price: 6900, finish: 'steel', mount: 'counter', spec: '外徑 760×520×220　內徑 685×445　SUS304 0.8mm' },
    { brand: '喜特麗 JTL', code: 'JT-A6020', at: 'sink', name: '不鏽鋼水槽 82cm', w: 820, d: 520, h: 220, cut: [790, 490], price: 7500, est: true, finish: 'steel', mount: 'counter', spec: '外徑 820×520×220　SUS304' },
    { brand: '喜特麗 JTL', code: 'JT-GC229AS', at: 'hob', name: '雙口黑色玻璃檯面爐', w: 730, d: 425, h: 120, cut: [670, 350], price: 9800, est: true, finish: 'glass', burners: 2, mount: 'counter', spec: '機身 730×425×120　挖孔 670×350 R85' },
    { brand: '喜特麗 JTL', code: 'JT-3066Q', at: 'dryer', name: '落地式烘碗機 60cm', w: 597, d: 520, h: 697, price: 15600, finish: 'glass', mount: 'floor', y: 100, spec: '597×520×697　臭氧殺菌' },
    { brand: '喜特麗 JTL', code: 'JT-3056Q', at: 'dryer', name: '落地式烘碗機 50cm', w: 497, d: 520, h: 697, price: 15200, finish: 'glass', mount: 'floor', y: 100, spec: '497×520×697　臭氧殺菌' },
    { brand: '喜特麗 JTL', code: 'JT-3818Q', at: 'dryer', name: '懸掛式烘碗機 80cm（黑玻璃）', w: 798, d: 320, h: 400, price: 8800, finish: 'glass', mount: 'wall', y: 1500, spec: '798×320×400　臭氧抑菌　LED照明' },
    { brand: '喜特麗 JTL', code: 'JT-3819Q', at: 'dryer', name: '懸掛式烘碗機 90cm（黑玻璃）', w: 898, d: 320, h: 400, price: 9000, est: true, finish: 'glass', mount: 'wall', y: 1500, spec: '898×320×400　臭氧抑菌　LED照明' },
    { brand: '喜特麗 JTL', code: 'JT-1680', at: 'hood', name: '隱藏式排油煙機 80cm', w: 795, d: 385, h: 180, price: 7500, finish: 'steel', style: 'hidden', mount: 'builtin', y: 1550, spec: '795×385×180　16 m³/min　強化玻璃擋煙板' },
    { brand: '喜特麗 JTL', code: 'JT-1690', at: 'hood', name: '隱藏式排油煙機 90cm', w: 895, d: 385, h: 180, price: 7700, finish: 'steel', style: 'hidden', mount: 'builtin', y: 1550, spec: '895×385×180　16 m³/min　強化玻璃擋煙板' },
    // ---- 莊頭北 TOPAX
    { brand: '莊頭北 TOPAX', code: 'TG-8503BG', at: 'hob', name: '保潔二口玻璃檯面爐', w: 730, d: 420, h: 158, cut: [670, 350], price: 9350, finish: 'glass', burners: 2, mount: 'counter', spec: '730×420×158（含爐架）　挖孔 670×350 R85' },
    { brand: '莊頭北 TOPAX', code: 'TD-3652', at: 'dryer', name: '落地式臭氧殺菌烘碗機 50cm', w: 500, d: 500, h: 700, price: 16300, finish: 'glass', mount: 'floor', y: 100, spec: 'W500×H700（深度約 500，依原廠為準）　臭氧殺菌' },
    { brand: '莊頭北 TOPAX', code: 'TD-3103-80', at: 'dryer', name: '懸掛式臭氧殺菌烘碗機 80cm', w: 798, d: 332, h: 400, price: 8250, finish: 'white', mount: 'wall', y: 1500, spec: '798×332×400　臭氧殺菌　270W' },
    { brand: '莊頭北 TOPAX', code: 'TD-3103-90', at: 'dryer', name: '懸掛式臭氧殺菌烘碗機 90cm', w: 898, d: 332, h: 400, price: 8450, finish: 'white', mount: 'wall', y: 1500, spec: '898×332×400　臭氧殺菌' },
    { brand: '莊頭北 TOPAX', code: 'TR-5195-80', at: 'hood', name: '單層式排油煙機 80cm', w: 790, d: 565, h: 190, price: 6800, finish: 'steel', style: 'std', mount: 'wall', y: 1600, spec: '790×565×190　排風 Ø150　LED' },
    { brand: '莊頭北 TOPAX', code: 'TR-5195-90', at: 'hood', name: '單層式排油煙機 90cm', w: 890, d: 565, h: 190, price: 7000, finish: 'steel', style: 'std', mount: 'wall', y: 1600, spec: '890×565×190　排風 Ø150　LED' }
  ];
  APPLIANCES.forEach(a => { a.brand = a.brand || '櫻花 SAKURA'; items.push({ ...a, hc: 'appl', dc: 'A', kind: 'appl', fronts: [], group: 'appl', hanging: a.mount === 'wall' || a.at === 'hood' }); });
  const APPL_BRANDS = ['櫻花 SAKURA', '林內 Rinnai', '豪山 HOSUN', '喜特麗 JTL', '莊頭北 TOPAX'];
  const CAI = 303 * 303; // 1 才＝303mm×303mm（1 台尺見方，mm²）；櫃體板材與桌面共用
  const CHI = 303;       // 1 尺（mm）

  const byCode = {};
  items.forEach(it => { byCode[it.code] = it; });

  /* ---------- 材質（櫃體色 / 門板色） ---------- */
  const MATERIALS = [
    { code: 'M', name: '楓木色', hex: '#d9b98b', use: 'body', cat: '規格色', factor: 100, grain: true },
    { code: 'D', name: '胡桃木', hex: '#6d4a33', use: 'body', cat: '規格色', factor: 100, grain: true },
    { code: 'G', name: '花灰白', hex: '#d8d5cd', use: 'body', cat: '規格色', factor: 100, grain: false },
    { code: 'W', name: '天使白', hex: '#f3f1eb', use: 'body', cat: '規格色', factor: 100, grain: false },
    { code: '1143', name: '楓木水波紋', hex: '#dcb886', use: 'door', cat: '規格色', factor: 100, grain: true },
    { code: '599', name: '胡桃木', hex: '#6a4630', use: 'door', cat: '規格色', factor: 100, grain: true },
    { code: '8914', name: '花灰白', hex: '#d6d3cb', use: 'door', cat: '規格色', factor: 100, grain: false },
    { code: 'W300', name: '天使白', hex: '#f4f2ec', use: 'door', cat: '規格色', factor: 100, grain: false },
    { code: 'R5692', name: '條紋柚木', hex: '#a7764a', use: 'both', cat: '規格色', factor: 100, grain: true },
    { code: 'R4524', name: '挪瓦拉松木', hex: '#e2c9a0', use: 'both', cat: '訂製色', factor: 110, grain: true },
    { code: 'D1027', name: '冰雪白', hex: '#fbfbf8', use: 'both', cat: '訂製色', factor: 110, grain: false },
    { code: 'F7223', name: '時尚鐵刀', hex: '#4a3c33', use: 'both', cat: '訂製色', factor: 110, grain: true },
    { code: 'R4261', name: '松瓦爾橡木', hex: '#c9a57a', use: 'both', cat: '訂製色', factor: 110, grain: true },
    { code: 'R5303', name: '夕日山毛櫸', hex: '#d09a68', use: 'both', cat: '訂製色', factor: 110, grain: true },
    { code: 'F426', name: '亞麻灰', hex: '#a9a49a', use: 'both', cat: '訂製色', factor: 110, grain: false },
    { code: 'F870', name: '麥昂石板', hex: '#6f6f6b', use: 'both', cat: '訂製色', factor: 110, grain: false },
    { code: 'R4559', name: '法國松木', hex: '#e0bf8c', use: 'both', cat: '訂製色', factor: 110, grain: true },
    { code: 'U1200', name: '爵士黑', hex: '#26262a', use: 'both', cat: '訂製色', factor: 110, grain: false },
    { code: 'D3378', name: '粉紅色', hex: '#e9b9b9', use: 'door', cat: '訂製色', factor: 110, grain: false },
    { code: '133', name: '亮黃色', hex: '#f1cf4f', use: 'door', cat: '訂製色', factor: 115, grain: false },
    { code: '155', name: '亮藍色', hex: '#4f86c6', use: 'door', cat: '訂製色', factor: 115, grain: false },
    { code: '166', name: '亮綠色', hex: '#79b85a', use: 'door', cat: '訂製色', factor: 115, grain: false }
  ];

  // 2020 伸保無接縫色板（貼圖於 swatches.js，依色號查找）
  (window.SWATCHES || []).forEach(sw => {
    MATERIALS.push({ code: sw.code, name: sw.name, en: sw.en, brand: sw.brand || '伸保', series: sw.series, hex: sw.hex, use: 'both', cat: '色板', factor: 100, grain: false, tex: true });
  });
  MATERIALS.forEach(m => { if (!m.series) m.series = '型錄規格色'; });
  const SWATCH_BY_CODE = {};
  (window.SWATCHES || []).forEach(sw => { SWATCH_BY_CODE[sw.code] = sw; });
  // 貼圖實際尺寸（mm）：u 方向為木紋方向
  const TEX_TILE = { u: 1200, v: 750 };

  /* ---------- 零件單價 ---------- */
  // 活動層板 S / 固定隔板 F（依深度、寬度）
  const PARTS = {
    ESLIDE: 1500,   // 電器抽托盤滑軌（全展，元/組，估價）
    S: { A: { 30: 351, 45: 527, 60: 717, 90: 1095 }, B: { 30: 240, 45: 360, 60: 489, 90: 749 }, C: { 30: 209, 45: 313, 60: 425, 90: 649 }, T: { 30: 308, 45: 462, 60: 628, 90: 961 } },
    F: { A: { 30: 498, 45: 699, 60: 890, 90: 1278 }, B: { 30: 386, 45: 531, 60: 663, 90: 929 }, C: { 30: 353, 45: 482, 60: 600, 90: 828 }, T: { 30: 493, 45: 678, 60: 846, 90: 1186 } },
    // 抽屜組（屜牆＋全展緩衝滑軌），依屜頭高 16/24/32、深度、寬度
    DRAWER: {
      16: { A: { 45: 2295, 60: 2638, 90: 3324 }, B: { 45: 1980, 60: 2253, 90: 2798 }, C: { 45: 1675, 60: 1910, 90: 2379 } },
      24: { A: { 45: 3205, 60: 3718, 90: 4751 }, B: { 45: 2758, 60: 3166, 90: 3986 }, C: { 45: 2361, 60: 2712, 90: 3419 } },
      32: { A: { 45: 3318, 60: 3868, 90: 4978 }, B: { 45: 2871, 60: 3316, 90: 4213 }, C: { 45: 2474, 60: 2862, 90: 3646 } }
    },
    // 標準屜頭
    HEAD: { 12: { 45: 167, 60: 292, 90: 440 }, 16: { 45: 218, 60: 292, 90: 440 }, 24: { 45: 332, 60: 442, 90: 667 }, 32: { 45: 445, 60: 592, 90: 894 } },
    ROD: 263,          // 吊衣桿 U60
    HINGE: 120,        // 西德鉸鍊（元/個，可於板材售價調整）
    FOOT: 45,          // 調整腳 A10（元/個，可於板材售價調整）
    KICK_PER_M: 254,   // 踢腳板 KB12/24 609 元 / 2.4m
    // 檯面（每 10cm）
    TOP: {
      none: { name: '無檯面', A: 0, B: 0, C: 0, T: 0, thick: 0 },
      T3A: { name: 'T3A 檯面 32mm', A: 31.0, B: 23.6, C: 23.6, T: 31.0, thick: 32 },
      T5A: { name: 'T5A 檯面 28mm', A: 27.3, B: 20.5, C: 18.4, T: 27.3, thick: 28 },
      T2A: { name: 'T2A 檯面 25mm', A: 27.3, B: 20.5, C: 18.4, T: 27.3, thick: 25 },
      T4B: { name: 'T4B 蜂巢板 40mm', A: 83.8, B: 79.0, C: 75.8, T: 83.8, thick: 40 }
    }
  };

  /* ---------- 門板單價表（高度 cm → 牌價） ---------- */
  const DH = [32, 48, 64, 72, 96, 112, 128, 160, 176, 192, 208, 224];
  const T = arr => { const o = {}; arr.forEach((v, i) => { if (v) o[DH[i]] = v; }); return o; };
  const DOOR_STD = {
    15: T([699, 860, 986, 1051, 1240, 1448, 1970, 2226, 2350, 2473, 2538, 2665]),
    30: T([806, 996, 1165, 1251, 1503, 1743, 2330, 2670, 2836, 3002, 3131, 3301]),
    45: T([948, 1171, 1396, 1510, 1847, 2137, 2796, 3248, 3472, 3695, 3922, 4149]),
    60: T([0, 1396, 1696, 1847, 2297, 2664, 3401, 4002, 4302, 4602, 0, 0])
  };
  const DOOR_GLASS = {
    45: T([1060, 1340, 1620, 1762, 2183, 2530, 3245, 3809, 4089, 4368, 4652, 4989]),
    60: T([0, 1620, 1995, 2183, 2746, 3189, 4000, 4752, 5127, 5502, 0, 0])
  };
  // 門板款式：code 為門板代碼尾碼；visual 描述 3D 外觀
  const DOOR_STYLES = [
    { id: 'STD', name: '標準平板門', suffix: '', factor: 100, visual: { handle: 'bar' }, t45: DOOR_STD[45], t60: DOOR_STD[60] },
    { id: 'SN', name: '斜型門板', suffix: 'SN', factor: 100, visual: { handle: 'bevel' }, t45: T([1639, 1862, 2087, 2201, 2538, 2761, 3353, 3805, 4029, 4252, 4479, 4706]), t60: T([0, 2112, 2412, 2563, 3013, 3313, 3983, 4584, 4884, 5184, 0, 0]) },
    { id: 'H', name: '挖孔無把手門板', suffix: 'H', factor: 100, visual: { handle: 'slot' }, t45: T([1648, 1871, 2096, 2210, 2547, 2837, 3496, 3948, 4172, 4395, 4622, 4849]), t60: T([0, 2096, 2396, 2547, 2997, 3364, 4101, 4702, 5002, 5302, 0, 0]) },
    { id: 'Y', name: '飾條門板', suffix: 'Y', factor: 100, visual: { handle: 'bar', trim: true }, t45: T([1273, 1586, 1901, 2060, 2531, 2912, 3808, 4440, 0, 0, 0, 0]), t60: T([0, 1901, 2321, 2531, 3162, 3649, 4655, 0, 0, 0, 0, 0]) },
    { id: 'W1', name: '內嵌式把手門板', suffix: 'W1', factor: 100, visual: { handle: 'channel' }, t45: T([1828, 2051, 2276, 2390, 2727, 3017, 3676, 4128, 4352, 4575, 4802, 5029]), t60: T([0, 2276, 2576, 2727, 3177, 3544, 4281, 4882, 0, 5482, 0, 0]) },
    { id: 'AW', name: '鋁擠型門板', suffix: 'W', factor: 100, visual: { handle: 'alu' }, t45: T([1963, 2186, 2411, 2525, 2862, 3152, 3811, 4263, 4487, 4710, 4935, 0]), t60: T([0, 2680, 2980, 3131, 3581, 3938, 4685, 5286, 5586, 5886, 0, 0]) },
    { id: 'CS', name: '鄉村風門板', suffix: 'CS', factor: 100, visual: { handle: 'knob', frame: 60, inset: true }, t45: T([1119, 1409, 1701, 1850, 2288, 2608, 3408, 3996, 4287, 4577, 4872, 5167]), t60: T([0, 1701, 2091, 2288, 2873, 3293, 4195, 4976, 5366, 5766, 0, 0]) },
    { id: 'FR', name: '框飾門板', suffix: 'F', factor: 100, visual: { handle: 'bar', frame: 45, raised: true }, t45: T([1637, 1850, 2322, 2558, 3261, 3794, 4655, 5595, 6064, 6533, 7001, 7518]), t60: T([0, 2322, 2948, 3261, 4200, 4893, 5900, 7156, 7792, 8418, 0, 0]) },
    { id: 'AE', name: '結晶鋼烤門板', suffix: 'AE', factor: 100, visual: { handle: 'bar', gloss: true }, t45: T([1548, 2132, 2717, 3010, 3887, 4661, 5434, 6604, 7189, 7774, 8358, 8943]), t60: T([0, 2717, 3521, 3887, 5056, 6050, 6970, 8578, 9309, 10113, 0, 0]) },
    { id: 'E1', name: '古典成型門板', suffix: 'E1', factor: 100, visual: { handle: 'knob', frame: 70, inset: true, raised: true }, t45: T([1721, 2436, 3151, 3508, 4581, 5441, 6301, 7731, 8402, 9072, 9787, 0]), t60: T([0, 3151, 4134, 4581, 6011, 7049, 8177, 10054, 10993, 11932, 0, 0]) },
    { id: 'M', name: '鋼琴烤漆門板', suffix: 'M', factor: 100, visual: { handle: 'bar', gloss: true }, t45: T([2730, 3906, 5082, 5670, 7434, 8798, 10163, 12515, 13691, 14867, 16043, 17219]), t60: T([0, 5082, 6649, 7434, 9786, 11542, 13300, 16435, 18003, 19571, 0, 0]) },
    { id: 'TK', name: '陶瓷烤漆門板', suffix: 'TK', factor: 100, visual: { handle: 'bar', gloss: true }, t45: T([2864, 4040, 5216, 5804, 7568, 8999, 10431, 12783, 13959, 15135, 16311, 17393]), t60: T([0, 5216, 6783, 7568, 9920, 11743, 13568, 16703, 18271, 19839, 0, 0]) },
    { id: 'AI', name: '細鋁框皮革門板', suffix: 'AI', factor: 100, visual: { handle: 'none', frame: 18, alu: true, inset: true }, t45: T([3322, 4794, 6266, 7002, 9210, 10871, 12532, 15476, 16948, 18260, 19732, 21204]), t60: T([0, 6074, 8026, 8922, 11770, 13751, 15892, 19636, 21588, 23380, 0, 0]) },
    { id: 'LV', name: '鋁百葉門板', suffix: 'A', factor: 100, visual: { handle: 'bar', louver: true }, t45: T([0, 4048, 5113, 5731, 7244, 8206, 9873, 13034, 14098, 15161, 16060, 0]), t60: T([0, 4534, 5842, 6597, 8458, 9632, 11579, 15115, 17732, 0, 0, 0]) },
    { id: 'PT', name: '噴繪門板', suffix: 'PT', factor: 100, visual: { handle: 'none' }, t45: T([3384, 5005, 6358, 7036, 9065, 10483, 12270, 14978, 16330, 17681, 19036, 0]), t60: T([0, 6358, 8209, 9065, 11771, 13689, 15977, 19539, 21320, 23100, 0, 0]) }
  ];

  // 門片 / 抽屜把手：type bar 一字 / knob 鈕扣 / j J型鋁擠 / bev 斜邊 / inset 內嵌；pos 位置；pair 雙門片適用
  const HANDLES = [
    { id: 'bar', name: '一字型把手', type: 'bar' },
    { id: 'knob', name: '鈕扣型把手', type: 'knob' },
    { id: 'j-top', name: '上緣J型把手', type: 'j', pos: 'top' },
    { id: 'j-bottom', name: '下緣J型把手', type: 'j', pos: 'bottom' },
    { id: 'j-left', name: '左側J型把手', type: 'j', pos: 'left' },
    { id: 'j-right', name: '右側J型把手', type: 'j', pos: 'right' },
    { id: 'j-mid', name: '中間J型把手', type: 'j', pos: 'mid', pair: true },
    { id: 'bev-top', name: '上緣斜邊把手', type: 'bev', pos: 'top' },
    { id: 'bev-bottom', name: '下緣斜邊把手', type: 'bev', pos: 'bottom' },
    { id: 'bev-left', name: '左側斜邊把手', type: 'bev', pos: 'left' },
    { id: 'bev-right', name: '右側斜邊把手', type: 'bev', pos: 'right' },
    { id: 'bev-mid', name: '中間斜邊把手', type: 'bev', pos: 'mid', pair: true },
    { id: 'in-TR', name: '上右內嵌把手', type: 'inset', pos: 'TR' },
    { id: 'in-TL', name: '上左內嵌把手', type: 'inset', pos: 'TL' },
    { id: 'in-BR', name: '下右內嵌把手', type: 'inset', pos: 'BR' },
    { id: 'in-BL', name: '下左內嵌把手', type: 'inset', pos: 'BL' },
    { id: 'in-TM', name: '上中內嵌把手', type: 'inset', pos: 'TM', pair: true },
    { id: 'in-BM', name: '下中內嵌把手', type: 'inset', pos: 'BM', pair: true }
  ];
  const HANDLE_BY_ID = {}; HANDLES.forEach(h => { HANDLE_BY_ID[h.id] = h; });
  // 地板選項：type 木地板 / 磁磚 / 素面
  const FLOORS = [
    { id: 'wood-light', type: 'wood', group: '木地板', name: '木地板 淺色', color: '#d9bf96', plan: '#efe2cc' },
    { id: 'wood-dark', type: 'wood', group: '木地板', name: '木地板 深色', color: '#6e4b33', plan: '#c9ab8c' },
    ...[30, 40, 60, 80, 100].map(n => ({ id: 'tile-' + n, type: 'tile', group: '磁磚', name: `磁磚 ${n}×${n}`, size: n * 10, color: '#e8e5df', grout: '#8f897e', plan: '#f4f2ee' })),
    { id: 'plain-white', type: 'plain', group: '素面', name: '素面 白色', color: '#f2f2ef', plan: '#ffffff' },
    { id: 'plain-grey', type: 'plain', group: '素面', name: '素面 灰色', color: '#a3a8ad', plan: '#e3e5e8' }
  ];

  window.DATA = {
    FLOORS, HANDLES, HANDLE_BY_ID, APPL_TYPES, APPLIANCES, APPL_BRANDS, DESK_SHAPES, DESK_MATS, DESK_THICK, DESK_EDGES, DESK_PRICE, DESK_EDGE_PRICE, CAI, CHI,
    HEIGHTS, HEIGHT_LABEL, HEIGHT_USE, DEPTHS, DEPTH_NAME, CORNER_W, KICK, BOARD, BACK,
    FRONT_NAME, FRONT_HEIGHTS, TRI_TYPE_NAME,
    items, byCode,
    MATERIALS, SWATCH_BY_CODE, TEX_TILE, PARTS, DOOR_STD, DOOR_GLASS, DOOR_STYLES, DH
  };
})();
