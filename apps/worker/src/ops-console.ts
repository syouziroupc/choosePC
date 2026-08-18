const HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>choosePC Operations</title>
  <link rel="stylesheet" href="/ops/app.css">
</head>
<body>
  <header class="topbar">
    <div>
      <strong>choosePC Operations</strong>
      <span>workers.dev 管理・動作検証</span>
    </div>
    <div class="top-actions">
      <span id="api-version">API: 読み込み中</span>
      <span id="db-status">D1: 確認中</span>
    </div>
  </header>

  <main>
    <section class="auth-row" aria-labelledby="auth-title">
      <div>
        <h1 id="auth-title">運用コンソール</h1>
        <p>一般公開用の診断画面ではありません。管理データは認証後に取得します。</p>
      </div>
      <form id="auth-form">
        <label for="admin-token">管理トークン</label>
        <input id="admin-token" type="password" autocomplete="current-password" placeholder="COMMERCIAL_ADMIN_TOKEN">
        <button type="submit">接続</button>
        <button type="button" id="logout" class="secondary">解除</button>
      </form>
    </section>

    <div id="notice" role="status" aria-live="polite"></div>

    <section class="metrics-section" aria-labelledby="metrics-title">
      <div class="section-heading">
        <h2 id="metrics-title">API利用状況</h2>
        <button id="refresh" type="button" class="secondary">更新</button>
      </div>
      <div class="metric-strip">
        <div><span>今日</span><strong id="req-today">-</strong></div>
        <div><span>7日</span><strong id="req-7d">-</strong></div>
        <div><span>30日</span><strong id="req-30d">-</strong></div>
        <div><span>Affiliate送客 30日</span><strong id="affiliate-clicks">-</strong></div>
        <div><span>確定報酬 30日</span><strong id="commission">-</strong></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Endpoint</th><th>Method</th><th>7日件数</th><th>最終呼出</th></tr></thead>
          <tbody id="endpoint-rows"><tr><td colspan="4">認証後に表示</td></tr></tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="commercial-title">
      <div class="section-heading">
        <div>
          <h2 id="commercial-title">アフィリエイト・送客設定</h2>
          <p>ランキング後に付与する送客情報だけを管理します。</p>
        </div>
      </div>
      <div class="two-column">
        <div>
          <h3>登録済みプログラム</h3>
          <div class="table-wrap tall">
            <table>
              <thead><tr><th>加盟先</th><th>種別</th><th>状態</th><th>リンク</th><th></th></tr></thead>
              <tbody id="program-rows"><tr><td colspan="5">認証後に表示</td></tr></tbody>
            </table>
          </div>
        </div>
        <form id="commercial-form" class="editor">
          <h3>プログラム登録・更新</h3>
          <label>管理キー<input name="key" required maxlength="80" placeholder="amazon-associates"></label>
          <label>加盟先<input name="merchant" required maxlength="120" placeholder="Amazon.co.jp"></label>
          <div class="form-row">
            <label>種別<select name="programType"><option value="affiliate">affiliate</option><option value="own">own</option><option value="normal">normal</option></select></label>
            <label>状態<select name="status"><option value="active">active</option><option value="paused">paused</option><option value="unknown">unknown</option></select></label>
          </div>
          <label>開示文<input name="disclosureText" maxlength="1000" placeholder="広告・アフィリエイトリンクを含みます"></label>
          <label>プログラムURL<input name="sourceUrl" type="url" placeholder="https://..."></label>
          <div class="form-row">
            <label>クリック参照パラメータ<input name="clickRefParam" maxlength="64" placeholder="subid"></label>
            <label>最終確認日時<input name="lastVerifiedAt" type="datetime-local"></label>
          </div>
          <label>報酬メタデータ JSON<textarea name="commissionMetadata" rows="3" spellcheck="false" placeholder='{"rate":"2%"}'></textarea></label>
          <label>紐付けリンク JSON<textarea name="links" rows="6" spellcheck="false" placeholder='[{"offerId":"...","destinationUrl":"https://..."}]'></textarea></label>
          <div class="editor-actions">
            <button type="submit">保存</button>
            <button type="button" id="commercial-clear" class="secondary">入力をクリア</button>
          </div>
        </form>
      </div>

      <h3>提案対象オファー</h3>
      <div class="table-wrap tall">
        <table>
          <thead><tr><th>ID</th><th>加盟先</th><th>商品</th><th>価格</th><th>在庫</th><th>送客設定</th><th></th></tr></thead>
          <tbody id="offer-rows"><tr><td colspan="7">認証後に表示</td></tr></tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="tester-title">
      <div class="section-heading">
        <div>
          <h2 id="tester-title">API動作検証</h2>
          <p>本番Worker上で公開APIの応答を直接確認します。</p>
        </div>
      </div>
      <form id="tester-form" class="tester-controls">
        <label>Method<select id="test-method"><option>GET</option><option>POST</option></select></label>
        <label>Path<select id="test-path">
          <option value="/api/v1/health">/api/v1/health</option>
          <option value="/api/v1/catalog">/api/v1/catalog</option>
          <option value="/api/v1/offers/recommend">/api/v1/offers/recommend</option>
          <option value="/api/v1/evaluate">/api/v1/evaluate</option>
          <option value="/api/v1/url/inspect">/api/v1/url/inspect</option>
        </select></label>
        <button type="submit">実行</button>
      </form>
      <label class="body-label">Request JSON<textarea id="test-body" rows="9" spellcheck="false"></textarea></label>
      <pre id="test-output">未実行</pre>
    </section>
  </main>
  <script src="/ops/app.js" defer></script>
</body>
</html>`;

const CSS = `:root{font-family:"BIZ UDPGothic","Yu Gothic UI",system-ui,sans-serif;color:#17202a;background:#f4f6f8;line-height:1.55}*{box-sizing:border-box}body{margin:0}.topbar{min-height:64px;background:#082b4c;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:12px 28px;border-bottom:4px solid #d7bd7d}.topbar strong{font-size:19px}.topbar span{margin-left:14px;font-size:13px}.top-actions{display:flex;gap:12px}.top-actions span{padding:4px 8px;border:1px solid rgba(255,255,255,.35);margin:0}main{max-width:1500px;margin:0 auto;padding:28px}section{background:#fff;border-top:3px solid #082b4c;padding:22px 24px;margin-bottom:22px}h1,h2,h3{margin:0;color:#082b4c}h1{font-size:26px}h2{font-size:21px}h3{font-size:16px;margin-bottom:12px}p{margin:4px 0 0;color:#54606c}.auth-row{display:flex;justify-content:space-between;gap:24px;align-items:end}.auth-row form{display:flex;align-items:end;gap:8px;min-width:min(620px,100%)}label{display:block;font-size:12px;font-weight:700;color:#4b5966}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;border:1px solid #aeb7c0;background:#fff;padding:9px 10px;color:#17202a}input:focus,select:focus,textarea:focus{outline:2px solid #1b5b8c;outline-offset:1px}button{border:1px solid #082b4c;background:#082b4c;color:#fff;padding:9px 14px;font-weight:700;cursor:pointer}button.secondary{background:#fff;color:#082b4c}button:disabled{opacity:.5;cursor:not-allowed}#notice{min-height:0;margin:0 0 16px;padding:0;color:#8a2d23;font-weight:700}#notice.active{padding:10px 12px;background:#fff;border-left:4px solid #b54b3e}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:16px}.metric-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid #c9d0d6;border-bottom:1px solid #c9d0d6;margin-bottom:18px}.metric-strip>div{padding:14px 16px;border-right:1px solid #c9d0d6}.metric-strip>div:last-child{border-right:0}.metric-strip span{display:block;font-size:12px;color:#66727e}.metric-strip strong{display:block;font-size:25px;margin-top:2px;color:#082b4c;font-variant-numeric:tabular-nums}.table-wrap{overflow:auto;border:1px solid #c9d0d6}.table-wrap.tall{max-height:420px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid #d9dee3}th{position:sticky;top:0;background:#edf1f4;color:#2c3945;z-index:1}td code{font-size:12px;word-break:break-all}.two-column{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(420px,.8fr);gap:24px;margin-bottom:24px}.editor{border-left:1px solid #c9d0d6;padding-left:24px}.editor label{margin-bottom:10px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.editor-actions{display:flex;gap:8px;margin-top:12px}.tester-controls{display:grid;grid-template-columns:130px minmax(240px,1fr) auto;gap:10px;align-items:end;margin-bottom:12px}.body-label{margin-top:8px}pre{background:#111820;color:#dce8f3;margin:12px 0 0;padding:14px;min-height:140px;max-height:430px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.row-actions{white-space:nowrap}.row-actions button{padding:5px 8px;font-size:12px}.status-active{font-weight:700;color:#12633b}.status-paused{font-weight:700;color:#8a5a00}.status-unknown{color:#666}@media(max-width:900px){.topbar{align-items:flex-start;gap:8px;flex-direction:column;padding:12px 16px}.topbar span{margin-left:8px}.top-actions{flex-wrap:wrap}main{padding:16px}.auth-row{display:block}.auth-row form{margin-top:16px;display:grid;grid-template-columns:1fr auto auto;min-width:0}.auth-row form label{grid-column:1/-1}.metric-strip{grid-template-columns:1fr 1fr}.metric-strip>div{border-bottom:1px solid #c9d0d6}.two-column{grid-template-columns:1fr}.editor{border-left:0;border-top:1px solid #c9d0d6;padding:20px 0 0}.tester-controls{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}section{padding:18px 16px}}`;

const JS = String.raw`(() => {
  const tokenKey = 'choosepc_ops_token';
  const clientKey = 'choosepc_client_id';
  const state = { overview: null };
  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat('ja-JP');
  const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

  function token() { return sessionStorage.getItem(tokenKey) || ''; }
  function clientId() {
    let value = localStorage.getItem(clientKey);
    if (!value) { value = crypto.randomUUID(); localStorage.setItem(clientKey, value); }
    return value;
  }
  function notice(message) {
    const el = $('notice');
    el.textContent = message || '';
    el.classList.toggle('active', Boolean(message));
  }
  function setText(id, value) { $(id).textContent = String(value); }
  function td(value) { const cell = document.createElement('td'); cell.textContent = value == null ? '' : String(value); return cell; }
  function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; }
  function clearRows(id) { const body = $(id); body.replaceChildren(); return body; }

  async function readJson(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
  }

  async function loadHealth() {
    try {
      const response = await fetch('/api/v1/health', { headers: { 'X-ChoosePC-Client': clientId() } });
      const body = await readJson(response);
      setText('api-version', 'API: ' + (body?.apiVersion || 'unknown'));
      setText('db-status', 'D1: ' + (body?.persistenceConfigured ? '接続' : '未接続'));
    } catch (error) {
      setText('api-version', 'API: 接続失敗');
      setText('db-status', 'D1: 不明');
    }
  }

  async function loadOverview() {
    if (!token()) { notice('管理トークンを入力すると運用データを取得できます。'); return; }
    notice('');
    const response = await fetch('/api/internal/admin/overview', { headers: { Authorization: 'Bearer ' + token() } });
    const body = await readJson(response);
    if (!response.ok) {
      notice('管理データ取得失敗: ' + (body?.error || response.status));
      return;
    }
    state.overview = body;
    renderOverview(body);
  }

  function renderOverview(data) {
    setText('req-today', nf.format(data.requests.today));
    setText('req-7d', nf.format(data.requests.last7Days));
    setText('req-30d', nf.format(data.requests.last30Days));
    setText('affiliate-clicks', nf.format(data.commercial.activity30Days.affiliateOutbound));
    setText('commission', yen.format(data.commercial.activity30Days.commissionJpy));

    const endpointRows = clearRows('endpoint-rows');
    for (const item of data.requests.endpoints) {
      const tr = document.createElement('tr');
      tr.append(td(item.path), td(item.method), td(nf.format(item.requestCount)), td(item.lastSeenAt || ''));
      endpointRows.append(tr);
    }
    if (!data.requests.endpoints.length) endpointRows.append(emptyRow(4, 'まだ集計データがありません'));

    const programRows = clearRows('program-rows');
    for (const program of data.commercial.programs) {
      const tr = document.createElement('tr');
      tr.append(td(program.merchant), td(program.programType));
      const status = td(program.status); status.className = 'status-' + program.status; tr.append(status);
      tr.append(td(nf.format(program.linkCount)));
      const actions = document.createElement('td'); actions.className = 'row-actions';
      actions.append(button('編集', () => editProgram(program.id)));
      tr.append(actions); programRows.append(tr);
    }
    if (!data.commercial.programs.length) programRows.append(emptyRow(5, 'プログラム未登録'));

    const offerRows = clearRows('offer-rows');
    for (const offer of data.commercial.offers) {
      const tr = document.createElement('tr');
      const idCell = td(''); const code = document.createElement('code'); code.textContent = offer.id; idCell.append(code);
      tr.append(idCell, td(offer.merchant), td(offer.title), td(yen.format(offer.priceJpy)), td(offer.stockState || ''), td(offer.attributionCount ? nf.format(offer.attributionCount) : '未設定'));
      const actions = document.createElement('td'); actions.className = 'row-actions';
      actions.append(button('リンクへ追加', () => addOfferToDraft(offer)));
      tr.append(actions); offerRows.append(tr);
    }
    if (!data.commercial.offers.length) offerRows.append(emptyRow(7, 'オファー未登録'));
  }

  function emptyRow(cols, message) { const tr = document.createElement('tr'); const cell = td(message); cell.colSpan = cols; tr.append(cell); return tr; }

  function editProgram(programId) {
    const overview = state.overview;
    if (!overview) return;
    const program = overview.commercial.programs.find((item) => item.id === programId);
    if (!program) return;
    if (!program.programKey) { notice('この旧プログラムには管理キーが保存されていないため、同一IDとしての編集はできません。再登録してください。'); return; }
    const form = $('commercial-form');
    form.elements.key.value = program.programKey;
    form.elements.merchant.value = program.merchant;
    form.elements.programType.value = program.programType;
    form.elements.status.value = program.status;
    form.elements.disclosureText.value = program.disclosureText || '';
    form.elements.sourceUrl.value = program.sourceUrl || '';
    form.elements.clickRefParam.value = program.clickRefParam || '';
    form.elements.lastVerifiedAt.value = program.lastVerifiedAt ? program.lastVerifiedAt.slice(0, 16) : '';
    form.elements.commissionMetadata.value = prettyJson(program.commissionJson);
    const links = overview.commercial.attributionLinks.filter((item) => item.programId === programId).map((item) => ({ offerId: item.offerId, destinationUrl: item.destinationUrl }));
    form.elements.links.value = JSON.stringify(links, null, 2);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function prettyJson(value) {
    if (!value) return '';
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }

  function addOfferToDraft(offer) {
    const form = $('commercial-form');
    if (!form.elements.merchant.value) form.elements.merchant.value = offer.merchant;
    let links = [];
    try { links = form.elements.links.value.trim() ? JSON.parse(form.elements.links.value) : []; } catch { notice('紐付けリンクJSONが壊れているため追加できません。'); return; }
    if (!Array.isArray(links)) { notice('紐付けリンクJSONは配列にしてください。'); return; }
    if (!links.some((item) => item.offerId === offer.id)) links.push({ offerId: offer.id, destinationUrl: '' });
    form.elements.links.value = JSON.stringify(links, null, 2);
    notice('オファーIDを追加しました。destinationUrl に実際の送客先URLを入力してください。');
  }

  async function saveCommercial(event) {
    event.preventDefault();
    if (!token()) { notice('保存には管理トークンが必要です。'); return; }
    const form = event.currentTarget;
    let commissionMetadata = null;
    let links = [];
    try {
      commissionMetadata = form.elements.commissionMetadata.value.trim() ? JSON.parse(form.elements.commissionMetadata.value) : null;
      links = form.elements.links.value.trim() ? JSON.parse(form.elements.links.value) : [];
      if (!Array.isArray(links)) throw new Error('links must be array');
    } catch {
      notice('報酬メタデータまたはリンクJSONの形式が不正です。');
      return;
    }
    const localDate = form.elements.lastVerifiedAt.value;
    const payload = {
      program: {
        key: form.elements.key.value.trim(),
        merchant: form.elements.merchant.value.trim(),
        programType: form.elements.programType.value,
        status: form.elements.status.value,
        commissionMetadata,
        disclosureText: form.elements.disclosureText.value.trim() || null,
        sourceUrl: form.elements.sourceUrl.value.trim() || null,
        lastVerifiedAt: localDate ? new Date(localDate).toISOString() : null,
        clickRefParam: form.elements.clickRefParam.value.trim() || null
      },
      links
    };
    const response = await fetch('/api/internal/commercial/upsert', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await readJson(response);
    if (!response.ok) { notice('保存失敗: ' + (body?.error || response.status)); return; }
    notice('送客設定を保存しました。');
    await loadOverview();
  }

  const defaults = {
    '/api/v1/health': { method: 'GET', body: '' },
    '/api/v1/catalog': { method: 'GET', body: '' },
    '/api/v1/offers/recommend': { method: 'POST', body: JSON.stringify({ useCase: 'office', maxPriceJpy: 80000 }, null, 2) },
    '/api/v1/evaluate': { method: 'POST', body: JSON.stringify({ useCase: 'office', pc: { category: 'general_laptop', condition: { type: 'used' }, commerce: { priceJpy: 39800 }, cpu: { raw: 'Core i5-1135G7' }, memory: { sizeGb: 16 }, storage: [{ sizeGb: 512 }] } }, null, 2) },
    '/api/v1/url/inspect': { method: 'POST', body: JSON.stringify({ url: 'https://amazon.co.jp/' }, null, 2) }
  };

  function applyTestDefault() {
    const item = defaults[$('test-path').value];
    if (!item) return;
    $('test-method').value = item.method;
    $('test-body').value = item.body;
  }

  async function runTest(event) {
    event.preventDefault();
    const method = $('test-method').value;
    const path = $('test-path').value;
    const init = { method, headers: { 'X-ChoosePC-Client': clientId() } };
    if (method !== 'GET' && method !== 'HEAD') {
      init.headers['Content-Type'] = 'application/json';
      init.body = $('test-body').value || '{}';
    }
    const started = performance.now();
    try {
      const response = await fetch(path, init);
      const body = await response.text();
      const duration = Math.round(performance.now() - started);
      let formatted = body;
      try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch {}
      $('test-output').textContent = method + ' ' + path + '\nHTTP ' + response.status + ' / ' + duration + 'ms\nAPI-Version: ' + (response.headers.get('x-choosepc-api-version') || '-') + '\n\n' + formatted;
      await loadOverview();
    } catch (error) {
      $('test-output').textContent = String(error);
    }
  }

  $('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = $('admin-token').value.trim();
    if (!value) { notice('管理トークンを入力してください。'); return; }
    sessionStorage.setItem(tokenKey, value);
    $('admin-token').value = '';
    await loadOverview();
  });
  $('logout').addEventListener('click', () => { sessionStorage.removeItem(tokenKey); state.overview = null; notice('管理トークンを解除しました。'); location.reload(); });
  $('refresh').addEventListener('click', loadOverview);
  $('commercial-form').addEventListener('submit', saveCommercial);
  $('commercial-clear').addEventListener('click', () => $('commercial-form').reset());
  $('tester-form').addEventListener('submit', runTest);
  $('test-path').addEventListener('change', applyTestDefault);

  applyTestDefault();
  loadHealth();
  if (token()) loadOverview(); else notice('管理トークンを入力すると運用データを取得できます。');
})();`;

export function opsConsoleHtml(): Response {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'none'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    },
  });
}

export function opsConsoleCss(): Response {
  return new Response(CSS, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

export function opsConsoleJs(): Response {
  return new Response(JS, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
