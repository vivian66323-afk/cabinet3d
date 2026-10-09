/* 3D渲染（AI 出圖）
   把目前的 3D 視角輸出成三張圖（視角 / 白模 / 線稿），連同固定提示詞交給 Gemini 或 ChatGPT 網頁。
   用的是 Gemini 網頁的免費額度，不需要 API 金鑰，所以最後一步（拖圖、貼提示詞）由使用者完成。

   提示詞內容與 SketchUp 外掛的 gpt_prompts_zh.json 同一份文字，但這是「複製過來的副本」：
   改了外掛那邊不會自動同步到這裡，反之亦然。 */
(function () {
  const A = {};
  const W = 1536, H = 864;                 // 16:9，與外掛輸出一致
  const SITES = {
    gemini:  { name: 'Gemini',  url: 'https://gemini.google.com/app' },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' }
  };
  const svcKey = v => (String(v).indexOf('ChatGPT') >= 0 ? 'chatgpt' : 'gemini');

  // 一次能附幾個檔:ChatGPT 免費版上限是 2(超過會跳「你可以傳送最多 2 個檔案」而送不出去)。
  // 之後額度放寬的話改這個數字就好。
  const MAX_FILES = { gemini: 10, chatgpt: 2 };
  // 取捨順序:視角(AI 的基底,一定要)→ 線稿(鎖幾何)→ 白模(鎖量體與天花造型)
  const PICK = ['視角', '線稿', '白模'];

  A.pickImages = function (imgs, service) {
    const max = MAX_FILES[service] || 10;
    return PICK.map(t => imgs.find(i => i.tag === t)).filter(Boolean).slice(0, max);
  };
  const LSKEY = 'aries_gemini_opts';
  const PROMPTS = {
  "prefix_asis": "把上傳的 3D 設計截圖轉成照片等級的室內實景照,房間與裡面的東西完全一樣。畫面中已經存在的每一個物件都要保留,也不要多畫任何東西:不新增物件,也不刪掉原本就有的物件。原圖裡若有沙發、桌子、地毯、螢幕或掛畫,輸出必須還在原位、同樣大小。",
  "prefix_empty": "把上傳的 3D 設計截圖轉成照片等級的室內實景照,而且是「同一間空房」。這個房間完全空的、沒有家具,輸出也必須維持空的:不可以有沙發、椅子、桌子、床、地毯、地墊、植栽、花瓶、書本、抱枕、托盤、擺飾、人物。只畫上傳圖中原本就存在的牆面、天花、地板、系統櫃、門、窗、百葉窗與掛畫,其餘一律不要加,地面保持淨空。",
  "prefix_staged": "把上傳的 3D 設計截圖轉成照片等級的室內實景照,房間相同。可以加入簡潔、克制的家具陳設,但原圖中已經存在的東西都必須保留,而且建築結構、系統櫃、門窗開口與相機角度都要與上傳圖完全一致。",
  "line_note": "另外附上一張線稿圖(白底黑線,同一視角、同一台相機)。請以它作為幾何的唯一依據:輸出畫面中每一道牆緣、天花溝縫線、櫃門分割、板縫、窗框與窗戶中柱,都必須落在那張線稿的線上。線稿只是幾何參考,不要把線稿的線條本身畫進輸出——輸出必須是一張照片,不是線稿、不是插畫、也不是幾張圖的疊合。",
  "clay_note": "另外附上一張白模圖(同一視角的無材質素模)。它顯示的是純粹的形體、轉折與明暗,請用它確認量體與天花造型的真實形狀——白模上是平面就是平面,是連續的弧面就是連續的弧面,不要在兩者之間自己折衷,也不要把一個連續的弧面拆成平頂加一條獨立量體。它的白色只是素模顏色,不是材質,不要因為它把輸出畫成白色。",
  "suffix": "構圖鎖定(最優先):輸出必須是上傳圖的「同一張照片」,只是材質變真實。消失點的位置、每一條斜線的傾斜角度、鏡頭的廣角程度都必須完全不變。不可以把透視「拉正」或「擺正」,不可以讓原本傾斜的牆面變成正面,不可以推近、拉遠、裁切或平移畫面。把上傳圖與輸出疊在一起時,每一個物件的位置、大小與邊緣都要對得上。\n幾何鎖定:牆面與天花的形狀、天花溝縫線、窗框與中柱的位置,都必須與上傳圖完全一致,直線保持筆直。\n系統櫃:門片與抽屜的數量、每片門的寬度、櫃體的高度與深度都要與上傳圖相同。任何板面都不可以合併、拆分、改尺寸或重新分割。\n身分鎖定——永遠不要改變一個物件「是什麼」,只能改變它「看起來如何」:螢幕或電視必須維持深色亮面螢幕,不可以變成窗戶、鏡子或掛畫;窗戶維持窗戶;鏡子維持鏡子。烤漆、美耐板或噴漆的面不可以被換成木頭、石材或金屬,除非下方的材質指示另有說明。\n掛畫內容鎖定:牆上每一幅畫的畫面內容都必須與上傳圖相同——相同的主題、相同的構圖、相同的主色調。若原圖的畫是深藍色的水下照片,輸出就必須還是深藍色的水下照片,不可以換成天空、雲、海面、山景或任何其他風景;畫面暗、看不清楚也不可以自己重新想一張。\n陰影不是材質:處在陰影裡的面只是比較暗,它的顏色與材質和受光處相同。不可以把暗處的面「提亮成另一個顏色」,也不可以把亮處的面壓暗成另一種材質。\n不可以新增上傳圖中沒有的任何構造:不要加柱子、壁柱、樑、天花下包、壁龕、額外的飾條或額外的隔間。\n百葉窗必須維持相同型式、相同葉片數量與相同上盒。窗外看出去的景象要與上傳圖一致;若玻璃本身看不出明確景色,就畫單純明亮的天空,不要憑空生成城市天際線、海景或風景。\n造型天花不是燈具:弧形天花、1/4 圓弧收邊、階梯天花、天花下包與退縮溝縫,本身只是造型。除非上傳圖中該位置已經明顯畫成發亮的燈槽、或該位置已經有燈具元件,否則不可以讓它發光,也不可以沿著它的邊緣加一條光帶。判斷依據是「那個位置有沒有燈具」:上傳圖裡畫出了崁燈孔、燈具元件或退縮的燈帶凹槽,那裡就是燈,該亮就亮——3D 設計截圖裡的燈具本來就不會發亮,不可以因為它在原圖中看起來不亮就判定那裡沒有燈;反過來,只是一道造型折角、天花下包或純粹的弧面,上面沒有任何燈具,就維持不發光。\n天花造型輪廓鎖定:天花的造型必須與上傳圖完全一致——下包的深度、造型帶的寬度、收邊的弧度半徑(1/4 圓弧就維持 1/4 圓弧,不可以放大成半圓或大圓角,也不可以改成直角)、以及每一處轉折的位置,全部不可以改變。天花是既有的幾何,不是可以重新設計的裝飾。\n天花高低差的垂直面不是燈槽:兩層天花之間那道垂直立面、天花下包的側板,預設就是一般的白色牆面或天花面。除非那個位置本身畫了燈具元件、或已經是一道退縮進去的凹縫燈帶,否則它只會被別處的光照亮,不可以自己發光、不可以變成一條亮帶,也不可以在它的上緣或下緣加光條。\n天花剖面以白模與線稿為準(最常出錯的地方):天花的剖面形狀一律照白模與線稿畫,下面兩種情況都要照實呈現,不可以互相取代,也不可以折衷成兩者的混合。\n(一)若那條帶狀下包在白模上是一個「平面」、下緣只有一個很小的圓角收邊,就不可以把它畫成厚實的圓弧量體、圓柱狀或像雨棚一樣鼓起來的曲面。\n(二)若天花本身是一道「連續的弧面」、從天花頂順順地彎下來接到牆面(弧形收頭、拱形天花),就必須畫成同一個連續的曲面,弧的起點、結束位置與曲率都與上傳圖相同。不可以把它拆成「平頂」加上「一條獨立的圓弧量體」或「一條掛在天花下面的帶子」,也不可以在弧面與平頂之間憑空加出一道折邊、溝縫或陰影界線:從平頂到牆面是一氣呵成的一個面,中間沒有接縫。\n不論是上面哪一種,造型本身都不是光源:不可以讓整條帶子或整個弧面變成發光的量體,也不可以沿著它的邊緣加一條原圖沒有的光帶。若原圖該處確實有燈槽,光只從那道凹縫的開口打出來、洗在相鄰的牆面或天花面上,造型面本身仍然維持它原本的材質與顏色,不會自己發亮。(這一段不是要把房間畫暗:模型裡既有的崁燈與燈帶該亮就亮,只是光從燈具孔位與凹縫出來,不是整個造型面在發光。)\n只准改變這三件事:材質的真實度、表面紋理、光線品質。畫面中不要出現任何文字、標籤或浮水印。\n輸出要求(最後一句,最重要):現在請直接「生成圖片」,輸出一張符合以上所有條件的室內實景照。不要回覆文字說明、不要條列重點、不要分析或描述上傳的圖、也不要問問題——只要那一張圖。",
  "note_gemini": "請保持第一張圖的原始構圖與長寬比(aspect ratio),不要改變畫面比例或重新排版。以第一張圖作為編輯的基底影像,第二張線稿僅作為幾何參考。",
  "lighting_lock": "燈光位置鎖定:只讓原圖中已經存在的燈具發光——天花的崁燈孔、燈帶凹槽、層板下緣、軌道投射燈。不可以新增任何原圖沒有的燈具、燈孔、燈條或天花開孔,也不可以改變燈具的數量與位置。畫面中不要出現鏡頭光暈、星狀光斑或看得見的燈泡。\n間接照明的出光位置也要與上傳圖一致:光從模型裡已經存在的那道凹縫或燈槽開口打出來,照亮鄰接的面;不可以把造型面(弧面、下包、帶狀天花)整面變成發光面,也不可以把出光口移到另一個位置或另一道邊。",
  "styles": [
    {
      "name": "依原圖材質(只提升真實感)",
      "prompt": "每一個面都維持上傳圖中原本的顏色與材質類別。米白或象牙白的板材就維持米白或象牙白,絕對不要換成木頭。大理石地板維持大理石,木地板維持木地板,白牆維持白牆,深色框維持深色,深色的櫃體維持深色。\n特別注意大面積的面——牆面、地板、天花、飾板——最容易被無意間換色,請逐一比對:有顏色的面不可以被洗成白色或灰色;灰褐色的牆就維持灰褐色;褐色磁磚地板就維持褐色磁磚,不可以換成灰色水泥或磨石子;深色的直紋木飾條就維持深色,不可以變成淺木色。同一面牆若原圖是上下兩種顏色,輸出必須保留那條分界與兩種顏色。\n唯一要改變的是真實度:正確的表面紋理、可信的光澤與反射、柔和自然的日光與自然的陰影衰減。"
    },
    {
      "name": "自然光-木質暖色",
      "prompt": "系統櫃為溫暖的橡木木皮,牆面是米白色平光漆,地板為淺色橡木,窗邊灑入柔和自然光,接觸面有細緻陰影,整體為溫暖中性色調。"
    },
    {
      "name": "自然光-淺色調",
      "prompt": "淺色樺木木皮,暖白色平光牆面,淺灰色地板,明亮均勻的日光,通透乾淨,低對比。"
    },
    {
      "name": "間接照明-夜景",
      "prompt": "天花溝縫與櫃體下緣的燈帶打出溫暖的間接照明,深胡桃木木皮,深灰色平光牆面,夜間氛圍,光線柔和衰減。"
    },
    {
      "name": "石材-精品感",
      "prompt": "霧面石材牆板帶有細緻紋路,櫃門為細緻的平光烤漆,搭配纖細的暖色金屬飾條,柔和的方向性照明。"
    },
    {
      "name": "系統櫃-材質特寫",
      "prompt": "細緻的木紋木皮,板縫與退縮溝縫準確,無把手的平光門片,柔和的間接照明,邊緣俐落清晰,淺景深。"
    }
  ],
  "lightings": [
    {
      "name": "不指定(依材質指示)",
      "prompt": ""
    },
    {
      "name": "層板燈/燈帶為主",
      "prompt": "照明以層板燈與燈帶為主:系統櫃的層板下緣、櫃體內部與天花溝縫發出連續的線性暖白光(約 3000K),由上往下或由下往上柔和洗過櫃體與牆面,靠近光源處最亮、往外平滑衰減。看得到光的效果,但看不到燈具本體或燈泡。"
    },
    {
      "name": "崁燈為主(天花點照明)",
      "prompt": "照明以天花崁燈為主:原圖天花上已經存在的崁燈孔位發出暖白光(約 3000K),在牆面形成等距、邊緣柔和的扇形光暈,地面有柔和的橢圓亮區,亮區之間保留較暗的過渡。不要把空間照成均勻一片亮,要保留明暗層次。"
    },
    {
      "name": "投射燈(重點照明)",
      "prompt": "照明以投射燈的重點照明為主:方向性光束打在掛畫、石材牆或櫃體端景上,形成明確的亮區與柔和的漸層邊緣;整體對比較高,非重點區域明顯偏暗。"
    },
    {
      "name": "綜合(層板燈+崁燈+投射燈)",
      "prompt": "照明為多層次配置:天花崁燈提供基礎照度,層板燈與天花溝縫燈帶補出櫃體與牆面的柔和線性光,投射燈在掛畫與端景打出重點。整體維持明暗層次——重點區最亮、一般區中等、角落略暗,全部為約 3000K 的暖白光。"
    },
    {
      "name": "夜景(只開間接照明)",
      "prompt": "夜間情境:窗外為深藍夜色,室內只開間接照明——天花溝縫燈帶與櫃內層板燈,牆面有柔和的光暈與漸層,整體偏暗但材質細節仍可辨識,色溫約 2700K 偏暖。"
    }
  ]
};

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stamp = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  const opts = () => { try { return JSON.parse(localStorage.getItem(LSKEY)) || {}; } catch (e) { return {}; } };
  const saveOpts = o => { try { localStorage.setItem(LSKEY, JSON.stringify(o)); } catch (e) { /* 忽略 */ } };

  // 擴充功能(chrome-extension/)裝了沒:bridge.js 會在 <html> 上掛屬性。
  // 網頁本身不能碰 gemini.google.com 的頁面(同源政策),全自動一定要靠擴充功能。
  A.ext = () => document.documentElement.getAttribute('data-aw-gemini-ext') || '';

  A.sendViaExt = function (imgs, prompt, service) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('擴充功能沒有回應')); }, 8000);
      const on = ev => {
        if (ev.source !== window || !ev.data || ev.data.__aw !== 'gemini-ack') return;
        clearTimeout(t);
        window.removeEventListener('message', on);
        ev.data.ok ? resolve() : reject(new Error(ev.data.error || '擴充功能拒絕了這次請求'));
      };
      window.addEventListener('message', on);
      window.postMessage({ __aw: 'gemini-send', images: imgs, prompt, send: true, service }, '*');
    });
  };

  const FURNISH = [
    { name: '不要加（保持空屋）', key: 'prefix_empty' },
    { name: '依原圖（不增不減）', key: 'prefix_asis' },
    { name: '可以擺設家具', key: 'prefix_staged' }
  ];

  /* 提示詞組裝順序與外掛一致：
     前言 → 附圖說明 → 材質指示 → 燈光指示 → 共同鎖定條款 → Gemini 專用補充 */
  A.buildPrompt = function (styleName, lightName, furnishName, service, withClay) {
    const st = (PROMPTS.styles || []).find(x => x.name === styleName) || PROMPTS.styles[0];
    const li = (PROMPTS.lightings || []).find(x => x.name === lightName) || PROMPTS.lightings[0];
    const fu = FURNISH.find(x => x.name === furnishName) || FURNISH[0];
    const notes = [PROMPTS.line_note, withClay === false ? '' : PROMPTS.clay_note]
      .filter(Boolean).join('\n\n');
    let light = (li && li.prompt || '').trim();
    if (light && PROMPTS.lighting_lock) light += '\n' + PROMPTS.lighting_lock.trim();
    const parts = [
      (PROMPTS[fu.key] || '').trim(),
      notes,
      '材質指示：' + (st && st.prompt || '').trim(),
      light ? '燈光指示：' + light : '',
      (PROMPTS.suffix || '').trim(),
      service === 'chatgpt' ? '' : (PROMPTS.note_gemini || '').trim()
    ];
    return parts.filter(t => t && t.trim()).join('\n\n');
  };

  /* 三張圖：目前視角（材質）／白模／線稿 */
  A.renderAll = async function () {
    const V = window.Viewer;
    // 分頁在背景或視窗被蓋住時 rAF 不會觸發,加一個逾時保險,否則會卡在忙碌遮罩
    const nf = () => new Promise(r => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(fin);
      setTimeout(fin, 150);
    });
    V.renderNow();
    await nf();
    const photo = V.renderImage(W, H, null);
    await nf();
    const clay = V.renderControl('clay', W, H);
    await nf();
    const line = V.renderControl('line', W, H);
    await nf();
    V.renderNow();
    return [
      { tag: '視角', url: photo, note: '材質（第一張，AI 以這張為準）' },
      { tag: '白模', url: clay, note: '素模，用來鎖量體與天花造型' },
      { tag: '線稿', url: line, note: '隱藏線，用來鎖幾何與板縫' }
    ];
  };

  A.open = async function () {
    if (!window.Viewer || !window.Viewer.renderControl) { App.toast('3D 視窗尚未就緒'); return; }
    const o = opts();
    const sNames = (PROMPTS.styles || []).map(x => x.name);
    const lNames = (PROMPTS.lightings || []).map(x => x.name);
    const sel = (name, list, cur) => `<select name="${name}">` +
      list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('') + '</select>';

    const hasExt = !!A.ext();
    App.busy(true, '輸出三張控制圖…');
    let imgs;
    try { imgs = await A.renderAll(); } finally { App.busy(false); }

    const body = `<p>把目前的 3D 視角輸出成三張圖（視角／白模／線稿），連同提示詞交給
      Gemini 或 ChatGPT 網頁出圖（用網頁的免費額度，不需要 API 金鑰）。</p>
      <div class="kv">
        <label>送到</label>${sel('service', ['Gemini', 'ChatGPT'], o.service || 'Gemini')}
        <label>風格</label>${sel('style', sNames, o.style || sNames[0])}
        <label>燈光</label>${sel('light', lNames, o.light || lNames[0])}
        <label>家具／飾品</label>${sel('furnish', FURNISH.map(f => f.name), o.furnish || FURNISH[0].name)}
      </div>
      <div class="ai-thumbs">${imgs.map(i => `<figure data-tag="${esc(i.tag)}"><img src="${i.url}" alt="${esc(i.tag)}"><figcaption><b>${esc(i.tag)}</b>${esc(i.note)}</figcaption></figure>`).join('')}</div>
      <div class="ai-limit" id="aiLimit" hidden></div>
      <div class="ai-acts">
        ${hasExt ? '<button class="btn primary" id="aiAuto">自動送出並生圖</button>' : ''}
        <button class="btn ${hasExt ? 'ghost' : 'primary'}" id="aiGo">下載 3 張圖並開啟網頁</button>
        <button class="btn ghost" id="aiCopy">複製提示詞</button>
        <button class="btn ghost" id="aiDl">只下載圖片</button>
        <button class="btn ghost" id="aiOpen">只開啟網頁</button>
      </div>
      <div class="ai-status" id="aiStatus" hidden></div>
      ${hasExt
        ? `<ol class="ai-steps"><li>選好上面的「送到」與風格，按「自動送出並生圖」：會自動開新對話、上傳三張圖、貼上提示詞並按送出，你只要等圖。</li>
             <li>第一次請先在那個分頁登入一次（Gemini 用 Google 帳號、ChatGPT 用 OpenAI 帳號），之後就會記住。</li></ol>`
        : `<ol class="ai-steps"><li>按「下載 3 張圖並開啟網頁」。瀏覽器若問「要允許下載多個檔案嗎」，請選允許。</li>
             <li>把三張圖<b>一起拖進</b>對話框，<b>視角圖放第一張</b>。</li>
             <li>貼上提示詞（已自動複製）後送出。</li>
             <li><b>想要全自動？</b>安裝 <a href="extension/" target="_blank" rel="noopener">Chrome 擴充功能</a>（免費、約 9 KB）後，這裡會多一顆「送進 ○○ 並自動生圖」，上傳、貼提示詞與送出都不用自己動手。</li></ol>`}
      <textarea id="aiPrompt" readonly rows="7"></textarea>`;

    await UI.modal({
      title: '3D渲染', body, wide: true,
      buttons: [{ label: '關閉', value: null }],
      onOpen: back => {
        const q = s => back.querySelector(s);
        const ta = q('#aiPrompt');
        const cur = () => ({
          service: q('[name=service]').value,
          style: q('[name=style]').value,
          light: q('[name=light]').value,
          furnish: q('[name=furnish]').value
        });
        let used = imgs;                       // 這次真正會送出/下載的圖
        const refresh = () => {
          const c = cur();
          const key = svcKey(c.service);
          const site = SITES[key];
          used = A.pickImages(imgs, key);
          const names = used.map(i => i.tag);
          back.querySelectorAll('.ai-thumbs figure').forEach(f => {
            f.classList.toggle('off', names.indexOf(f.dataset.tag) < 0);
          });
          const lim = q('#aiLimit');
          const tips = [];
          if (used.length < imgs.length) {
            tips.push(site.name + ' 一次最多 ' + used.length + ' 個檔案，這次只送「' +
              names.join(' + ') + '」，' +
              imgs.filter(i => names.indexOf(i.tag) < 0).map(i => i.tag).join('、') + '不附（提示詞已同步調整）。');
          }
          // 免費版額度用完時 ChatGPT 不會明說,只回一句「發生錯誤」,先講在前面免得誤以為是程式壞了
          if (key === 'chatgpt') {
            tips.push('ChatGPT 免費版每天約 4 張圖；額度用完時它只會回「這邊發生錯誤，因此無法生成圖片」' +
              '而不會明講，遇到就改用 Gemini 或隔天再試。');
          }
          lim.hidden = !tips.length;
          lim.textContent = tips.join('');
          ta.value = A.buildPrompt(c.style, c.light, c.furnish, key, names.indexOf('白模') >= 0);
          q('#aiGo').textContent = '下載 ' + used.length + ' 張圖並開啟 ' + site.name;
          q('#aiOpen').textContent = '只開啟 ' + site.name;
          const auto = q('#aiAuto');
          if (auto) auto.textContent = '送進 ' + site.name + ' 並自動生圖';
          saveOpts(c);
        };
        const base = `渲染_${stamp()}`;   // 檔名不帶專案名稱，避免客戶資料隨圖上傳到 Gemini／ChatGPT
        back.querySelectorAll('select').forEach(el => el.addEventListener('change', refresh));
        refresh();

        const copy = async () => {
          try { await navigator.clipboard.writeText(ta.value); App.toast('提示詞已複製'); }
          catch (e) { ta.removeAttribute('readonly'); ta.select(); document.execCommand('copy'); ta.setAttribute('readonly', 'readonly'); App.toast('提示詞已複製'); }
        };

        const download = async () => {
          for (const i of used) {
            App.download(i.url, `${base}_${i.tag}.jpg`);
            await new Promise(r => setTimeout(r, 400));   // 連續下載要留間隔，不然瀏覽器會吃掉後面的
          }
          App.toast(used.length + ' 張圖已下載');
        };
        const sbox = q('#aiStatus');
        const say = (t, kind) => { sbox.hidden = false; sbox.textContent = t; sbox.dataset.kind = kind || 'run'; };
        if (hasExt) {
          window.addEventListener('message', ev => {
            if (ev.source !== window || !ev.data || ev.data.__aw !== 'gemini-status') return;
            say(ev.data.text, ev.data.ok === false ? 'err' : (ev.data.stage === 'done' ? 'ok' : 'run'));
          });
          q('#aiAuto').addEventListener('click', async () => {
            const site = SITES[svcKey(q('[name=service]').value)];
            say('正在交給擴充功能…');
            try {
              await A.sendViaExt(used.map(i => ({ name: `${base}_${i.tag}.jpg`, url: i.url })), ta.value, svcKey(site.name));
              say('已交給 ' + site.name + ' 分頁，接下來看那邊的提示。', 'ok');
            } catch (e) {
              say('送不出去：' + e.message, 'err');
            }
          });
        }
        q('#aiCopy').addEventListener('click', copy);
        q('#aiDl').addEventListener('click', download);
        const siteUrl = () => SITES[svcKey(q('[name=service]').value)].url;
        q('#aiOpen').addEventListener('click', () => window.open(siteUrl(), '_blank', 'noopener'));
        q('#aiGo').addEventListener('click', async () => {
          await copy();                       // 剪貼簿與開新分頁都要在點擊的當下做，否則會被瀏覽器擋
          window.open(siteUrl(), '_blank', 'noopener');
          await download();
        });
      }
    });
  };

  window.AIRender = A;
})();
