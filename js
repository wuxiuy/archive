function showFront() {
  document.getElementById('view-front').classList.remove('hide');
  document.getElementById('view-login').classList.add('hide');
  const m = document.getElementById('view-main'); if (m) m.classList.add('hide');
  showShopPage(getShopPageFromHash());
  loadShopPage();
}

// ============ 销售页（购买/查卡密） ============
let shopProducts = [];
let shopProjectInfo = [];
let shopPayInfo = { active: '', receipt_qr: '', pay_note: '', qq: '', wechat_id: '', wechat_qr: '' };
let curOrder = null;

async function loadShopPage() {
  // 三个匿名 RPC 并行拉取，互不依赖（原串行 3×RTT → 并行 1×RTT）
  const [r, p, pr] = await Promise.allSettled([
    rpcAnon('shop_list_products', {}),
    rpcAnon('shop_get_pay_info', {}),
    rpcAnon('shop_list_projects', {})
  ]);
  if (r.status === 'fulfilled' && r.value && r.value.ok) { shopProducts = r.value.list || []; renderShopCards(); }
  else { document.getElementById('shop-cards').innerHTML = '<div class="shop-empty">套餐加载失败，请刷新重试</div>'; }
  if (p.status === 'fulfilled' && p.value && p.value.ok) shopPayInfo = p.value;
  if (pr.status === 'fulfilled' && pr.value && pr.value.ok) shopProjectInfo = pr.value.list || [];
  renderProjectPage();
  renderServiceFab();
  renderAboutSvc();
}

function renderShopCards() {
  const el = document.getElementById('shop-cards');
  if (!shopProducts.length) { el.innerHTML = '<div class="shop-empty">暂无在售套餐，敬请期待</div>'; return; }
  el.innerHTML = shopProducts.map(p => {
    const price = (p.price_cents / 100).toFixed(2);
    const old = p.old_price_cents > p.price_cents ? '<span class="shop-card-old">¥' + (p.old_price_cents / 100).toFixed(2) + '</span>' : '';
    const days = p.days > 0 ? p.days + ' 天' : '永久';
    const sold = (p.sold || 0) > 0 ? '已售 ' + p.sold : '新上架';
    const letter = esc((p.name || '商').trim().slice(0, 1));
    return '<div class="shop-card" onclick="openProductDetail(' + p.id + ')">' +
      '<div class="shop-card-img"><span>' + letter + '</span><span class="shop-card-badge">官方授权</span></div>' +
      '<div class="shop-card-body">' +
        '<span class="shop-card-name">' + esc(p.name) + '</span>' +
        '<span class="shop-card-proj">' + esc(p.project_name || '') + '</span>' +
        '<div class="shop-card-price-row"><span class="shop-card-cny">¥</span><span class="shop-card-num">' + price + '</span>' + old + '</div>' +
        '<div class="shop-card-meta"><span>' + days + '</span><span>' + sold + '</span></div>' +
        '<button class="shop-card-btn" onclick="event.stopPropagation();openProductDetail(' + p.id + ')">立即购买</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openProductDetail(id) {
  const p = shopProducts.find(x => x.id === id);
  if (!p) { toast('套餐不存在或已下架', false); return; }
  const price = (p.price_cents / 100).toFixed(2);
  document.getElementById('shop-detail-letter').textContent = (p.name || '商').trim().slice(0, 1);
  document.getElementById('shop-detail-price').textContent = price;
  document.getElementById('shop-detail-bar-num').textContent = price;
  const oldEl = document.getElementById('shop-detail-old');
  oldEl.textContent = p.old_price_cents > p.price_cents ? '¥' + (p.old_price_cents / 100).toFixed(2) : '';
  document.getElementById('shop-detail-tag').textContent = p.days > 0 ? p.days + ' 天' : '永久';
  document.getElementById('shop-detail-name').textContent = p.name;
  document.getElementById('shop-detail-proj').textContent = p.project_name || p.project_id;
  const sold = (p.sold || 0) > 0 ? '已售 ' + p.sold + ' 份' : '新上架';
  document.getElementById('shop-detail-desc').textContent =
    '所属项目：' + (p.project_name || p.project_id) + '\n' +
    '套餐规格：' + p.name + '\n' +
    '有效期：' + (p.days > 0 ? p.days + ' 天' : '永久') + '\n' +
    '销量：' + sold + '\n' +
    '发货方式：支付核验通过后自动发卡（卡密发到您填写的联系方式/订单查询）';
  window.__detailProductId = id;
  document.getElementById('shop-buy-panel').classList.add('hide');
  const dp = document.getElementById('shop-detail-panel');
  dp.classList.remove('hide');
  dp.scrollIntoView({ behavior: 'smooth' });
}
function closeProductDetail() {
  document.getElementById('shop-detail-panel').classList.add('hide');
  document.getElementById('shop-plans').scrollIntoView({ behavior: 'smooth' });
}
function buyFromDetail() {
  const id = window.__detailProductId;
  if (!id) return;
  document.getElementById('shop-detail-panel').classList.add('hide');
  buyProduct(id);
}
// 实时成交滚动条（交易猫主题显示）：仅当主题为 jym 时更新文本
(function startDealTicker() {
  const el = document.getElementById('shop-deal-text');
  if (!el) return;
  const cities = ['北京','上海','广州','深圳','杭州','成都','武汉','南京','苏州','重庆','西安','长沙','郑州','济南','合肥','天津','青岛','厦门','昆明','沈阳'];
  const names = ['匿*名','游***客','玩**家','老**板','小***喵','梦*幻','星**辰','夜*风','青**禾','阿*狸','柠*檬','云**端'];
  let i = 0;
  function tick() {
    if (document.hidden) return;
    const vf = document.getElementById('view-front');
    if (vf && vf.dataset.shopTheme !== 'jym') return;
    if (!shopProducts.length) return;
    const p = shopProducts[i % shopProducts.length];
    const city = cities[Math.floor(Math.random() * cities.length)];
    const nm = names[Math.floor(Math.random() * names.length)];
    const mins = 1 + Math.floor(Math.random() * 58);
    el.textContent = '来自' + city + '市的' + nm + ' ' + mins + '分钟前 购买了 ' + p.name;
    i++;
  }
  tick();
  setInterval(tick, 5000);
})();

function showShopStep(n) {
  [1, 2, 3].forEach(i => {
    const st = document.getElementById('shop-step-' + i);
    if (st) st.classList.toggle('hide', i !== n);
    const it = document.getElementById('sp-it-' + i);
    if (it) it.classList.toggle('active', i === n);
  });
}

function buyProduct(id) {
  const p = shopProducts.find(x => x.id === id);
  if (!p) { toast('套餐不存在或已下架', false); return; }
  curOrder = null;
  document.getElementById('shop-buy-product').textContent = p.name + ' · ' + (p.days > 0 ? p.days + ' 天' : '永久') + ' · ' + esc(p.project_name || '');
  document.getElementById('shop-buy-price').textContent = '¥' + (p.price_cents / 100).toFixed(2);
  document.getElementById('shop-contact').value = '';
  document.getElementById('shop-trade-no').value = '';
  document.getElementById('shop-query-inline').value = '';
  document.getElementById('shop-step3-result').innerHTML = '';
  showShopStep(1);
  const warn = document.getElementById('shop-pay-warn');
  if (!shopPayInfo.receipt_qr && !shopPayInfo.active) {
    warn.textContent = '商家暂未配置收款方式，可先提交订单留下联系方式，客服会联系您完成付款。';
    warn.classList.remove('hide');
  } else {
    warn.classList.add('hide');
  }
  document.getElementById('shop-buy-panel').classList.remove('hide');
  document.getElementById('shop-buy-panel').scrollIntoView({ behavior: 'smooth' });
  window.__buyProductId = id;
}

function openDownload() {
  if (window.__buyDlUrl) window.open(window.__buyDlUrl, '_blank');
  else toast('暂未配置下载地址，请联系客服', false);
}

function hideBuyPanel() {
  document.getElementById('shop-buy-panel').classList.add('hide');
  document.getElementById('shop-plans').scrollIntoView({ behavior: 'smooth' });
}

async function createOrder() {
  const contact = document.getElementById('shop-contact').value.trim();
  if (!/^1[0-9]{10}$/.test(contact) && !(contact.indexOf('@') >= 0 && contact.indexOf('.') >= 0)) {
    toast('请填写有效的手机号或邮箱', false); return;
  }
  const id = window.__buyProductId;
  if (!id) { toast('请先选择套餐', false); return; }
  const r = await rpcAnon('shop_create_order', { p_product_id: id, p_contact: contact });
  if (!r || !r.ok) { toast(r && r.message ? r.message : '下单失败，请重试', false); return; }
  curOrder = r;
  document.getElementById('shop-order-no').textContent = r.order_no;
  document.getElementById('shop-order-amount').textContent = '¥' + (r.amount_cents / 100).toFixed(2);
  // 下载地址：项目级优先，全局兜底；有地址才显示「点击下载软件」按钮（点击才跳转，不自动跳）
  const dlWrap = document.getElementById('shop-dl-wrap');
  dlWrap.classList.add('hide');
  window.__buyDlUrl = '';
  try {
    const d = await rpcAnon('shop_get_download', { p_project: r.project_id || '' });
    if (d && d.ok && d.url) {
      window.__buyDlUrl = d.url;
      dlWrap.classList.remove('hide');
    }
  } catch (e) { /* 下载地址读取失败不影响下单 */ }
  const qr = shopPayInfo.receipt_qr;
  document.getElementById('shop-qr-wrap').innerHTML = qr
    ? '<img class="shop-qr" src="' + esc(qr) + '" alt="收款码">'
    : '<div class="shop-qr-empty">' + (shopPayInfo.active ? '在线支付通道已开启，请按提示完成付款' : '收款码尚未配置，请联系客服获取付款方式') + '</div>';
  document.getElementById('shop-pay-note').textContent = shopPayInfo.active && shopPayInfo.gateway_note
    ? shopPayInfo.gateway_note
    : (shopPayInfo.pay_note || '请向收款码支付对应金额，支付完成后填写付款单号（微信 / 支付宝交易号）提交核验。');
  showShopStep(2);
  toast('下单成功，请完成付款');
}

async function submitTrade() {
  const tno = document.getElementById('shop-trade-no').value.trim();
  if (!tno) { toast('请填写付款单号', false); return; }
  if (!curOrder) { toast('请先提交订单', false); return; }
  const r = await rpcAnon('shop_submit_trade', { p_order_no: curOrder.order_no, p_trade_no: tno });
  if (r && r.ok) {
    toast('已提交，等待商家核验发卡');
    showShopStep(3);
    document.getElementById('shop-step3-msg').textContent = '已提交核验（订单 ' + curOrder.order_no + '），等待商家确认到账后自动发卡。';
  } else {
    toast(r && r.message ? r.message : '提交失败，请重试', false);
  }
}

async function queryByInput(q, out) {
  if (!q) { out.innerHTML = '<div class="shop-q-status">请输入付款单号或订单号</div>'; return; }
  out.innerHTML = '<div class="shop-q-status">查询中…</div>';
  let r = null;
  try { r = await rpcAnon('shop_query_trade', { p_trade_no: q }); } catch (e) {}
  if (r && r.ok) { renderQueryResult(r, out); return; }
  // 未查到已发卡：按付款单号 / 订单号查订单状态（submitted/pending 给状态提示）
  let r3 = null;
  try { r3 = await rpcAnon('shop_get_order_by_trade', { p_trade_no: q }); } catch (e) {}
  if (r3 && r3.ok) {
    if (r3.status === 'paid') { renderQueryResult(r3, out); return; }
    out.innerHTML = '<div class="shop-q-status">订单 ' + esc(r3.order_no || q) + '：' + esc(r3.message || r3.status) + '</div>';
    return;
  }
  const qMsg = r && r.message ? r.message : '未查到已发卡的订单（请确认付款单号，或联系管理员）';
  // 输入是订单号（SH 开头）时，额外查订单状态
  if (/^SH/i.test(q)) {
    let r2 = null;
    try { r2 = await rpcAnon('shop_get_order', { p_order_no: q }); } catch (e) {}
    if (r2 && r2.ok) {
      if (r2.status === 'paid') { renderQueryResult(r2, out); return; }
      const hint = r2.status === 'submitted' ? '已提交付款单号，等待商家核验' : (r2.status === 'pending' ? '待付款' : r2.status);
      out.innerHTML = '<div class="shop-q-status">订单 ' + esc(r2.order_no) + '：' + esc(hint) + '</div>';
      return;
    }
  }
  out.innerHTML = '<div class="shop-q-status">' + esc(qMsg) + '</div>';
}

async function queryOrder() {
  queryByInput(document.getElementById('shop-query-input').value.trim(), document.getElementById('shop-query-result'));
}
async function queryOrderInline() {
  queryByInput(document.getElementById('shop-query-inline').value.trim(), document.getElementById('shop-step3-result'));
}

function renderQueryResult(r, out) {
  out = out || document.getElementById('shop-query-result');
  window.__lastCode = r.code || '';
  out.innerHTML =
    '<div class="shop-q-ok">✓ 卡密已找到</div>' +
    '<div class="shop-q-code">' + esc(window.__lastCode) + '</div>' +
    '<div class="shop-q-meta">' + esc(r.product_name || '') + ' · ' + (r.days ? r.days + ' 天' : '永久') + ' · 订单 ' + esc(r.order_no || '') + '</div>' +
    '<button class="shop-btn shop-btn-main" onclick="copyQueryCode()">复制卡密</button>';
}

// ============ 销售页：三页导航（首页/项目/关于） ============
function getShopPageFromHash() {
  const h = (location.hash || '').replace('#', '');
  return (h === 'projects' || h === 'about') ? h : 'home';
}
function showShopPage(k) {
  ['home', 'projects', 'about'].forEach(x => {
    const el = document.getElementById('pg-' + x);
    if (el) el.classList.toggle('hide', x !== k);
  });
  document.querySelectorAll('.shop-nav-link').forEach(a => a.classList.toggle('active', a.dataset.k === k));
  document.querySelectorAll('.shop-tab-item').forEach(t => t.classList.toggle('active', t.dataset.k === k));
  if (location.hash !== '#' + k) {
    try { history.replaceState(null, '', '#' + k); } catch (e) { location.hash = '#' + k; }
  }
  if (k === 'home') {
    const buyPanel = document.getElementById('shop-buy-panel');
    if (buyPanel && !buyPanel.classList.contains('hide')) return;
    window.scrollTo(0, 0);
  }
}
function buyProductFrom(id) {
  showShopPage('home');
  setTimeout(function () { buyProduct(id); }, 80);
}
function renderProjectPage() {
  const el = document.getElementById('shop-projects');
  if (!el) return;
  if (!shopProducts.length) { el.innerHTML = '<div class="shop-empty">暂无在售项目，敬请期待</div>'; return; }
  const byProj = {};
  shopProducts.forEach(p => {
    const key = p.project_id || '0';
    if (!byProj[key]) byProj[key] = { id: p.project_id, name: p.project_name || '未命名项目', remark: '', specs: [] };
    byProj[key].specs.push(p);
  });
  (shopProjectInfo || []).forEach(pi => {
    if (byProj[pi.id]) byProj[pi.id].remark = pi.remark || '';
  });
  const keys = Object.keys(byProj);
  el.innerHTML = keys.map(key => {
    const g = byProj[key];
    const specs = g.specs.map(sp => {
      const daysTxt = sp.days > 0 ? sp.days + ' 天' : '永久';
      return '<div class="shop-proj-spec">' +
        '<div class="shop-proj-spec-l"><span class="shop-proj-spec-name">' + esc(sp.name) + '</span>' +
        '<span class="shop-proj-spec-sub">' + daysTxt + '</span></div>' +
        '<span class="shop-proj-spec-price">¥' + (sp.price_cents / 100).toFixed(2) + '</span>' +
        '<button class="shop-proj-buy" onclick="buyProductFrom(' + sp.id + ')">购买</button>' +
        '</div>';
    }).join('');
    return '<div class="shop-proj-card">' +
      '<div class="shop-proj-head"><span class="shop-proj-name">' + esc(g.name) + '</span>' +
      '<span class="shop-proj-badge">' + g.specs.length + ' 种规格</span></div>' +
      (g.remark ? '<div class="shop-proj-remark">' + esc(g.remark) + '</div>' : '') +
      specs +
      '</div>';
  }).join('');
  if (!keys.length) el.innerHTML = '<div class="shop-empty">暂无在售项目</div>';
}
function renderAboutSvc() {
  const el = document.getElementById('shop-about-svc');
  if (!el) return;
  const qq = shopPayInfo.qq || '';
  const wx = shopPayInfo.wechat_id || '';
  const qr = shopPayInfo.wechat_qr || '';
  if (!qq && !wx && !qr) { el.innerHTML = '<div class="shop-service-empty">暂无在线客服，可通过页面右下角悬浮球或刷新后重试</div>'; return; }
  let html = '';
  if (qq) html += '<div class="shop-svc-item">QQ：<b>' + esc(qq) + '</b></div>';
  if (wx) html += '<div class="shop-svc-item">微信：<b>' + esc(wx) + '</b></div>';
  if (qr) html += '<div class="shop-svc-qr"><img src="' + esc(qr) + '" alt="微信二维码"></div>';
  el.innerHTML = html;
}

// 联系客服悬浮球
function renderServiceFab() {
  const fab = document.getElementById('shop-fab');
  const card = document.getElementById('shop-service-card');
  if (!fab || !card) return;
  const qq = shopPayInfo.qq || '';
  const wx = shopPayInfo.wechat_id || '';
  const qr = shopPayInfo.wechat_qr || '';
  if (!qq && !wx && !qr) { fab.classList.add('hide'); card.classList.add('hide'); return; }
  fab.classList.remove('hide');
  let html = '';
  if (qq) html += '<div class="shop-service-row"><span>QQ</span><b>' + esc(qq) + '</b><button class="shop-service-copy" onclick="copySvc(\'qq\')">复制</button></div>';
  if (wx) html += '<div class="shop-service-row"><span>微信</span><b>' + esc(wx) + '</b><button class="shop-service-copy" onclick="copySvc(\'wx\')">复制</button></div>';
  if (qr) html += '<div class="shop-service-qr"><img src="' + esc(qr) + '" alt="微信二维码"></div>';
  if (!html) html = '<div class="shop-service-empty">暂无在线客服，请稍后再试</div>';
  document.getElementById('shop-service-body').innerHTML = html;
  window.__svc = { qq: qq, wx: wx };
  renderAboutSvc();
}
function toggleServiceCard() {
  const card = document.getElementById('shop-service-card');
  card.classList.toggle('hide');
}
function copySvc(k) {
  const v = window.__svc ? window.__svc[k] : '';
  if (!v) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(v).then(() => toast(k === 'qq' ? 'QQ 已复制' : '微信号已复制')).catch(() => fallbackCopyText(v));
  } else { fallbackCopyText(v); }
}
function fallbackCopyText(t) {
  const el = document.createElement('textarea');
  el.value = t;
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请手动复制', false); }
  document.body.removeChild(el);
}

function copyQueryCode() {
  if (!window.__lastCode) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window.__lastCode).then(() => toast('卡密已复制')).catch(() => fallbackCopy());
  } else { fallbackCopy(); }
}
function fallbackCopy() {
  const el = document.createElement('textarea');
  el.value = window.__lastCode;
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); toast('卡密已复制'); } catch (e) { toast('复制失败，请手动选择复制', false); }
  document.body.removeChild(el);
}

function showLoginCard() {
  const f = document.getElementById('view-front'); if (f) f.classList.add('hide');
  const m = document.getElementById('view-main'); if (m) m.classList.add('hide');
  const l = document.getElementById('view-login'); if (l) l.classList.remove('hide');
}
function getClientIp() {
  return fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => (d && d.ip) || '').catch(() => '');
}
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-pwd').value;
  const btn = document.getElementById('login-btn');
  if (!email || !pwd) { toast('请输入邮箱和密码', false); return; }
  // 登录保护（2026-09-29）：前端节流 连续失败3次强制等待30秒；后端锁定 30分钟内5次失败锁30分钟
  const now = Date.now();
  const waitUntil = parseInt(localStorage.getItem('login_wait_until') || '0', 10);
  if (waitUntil > now) { toast('尝试次数过多，请 ' + Math.ceil((waitUntil - now) / 1000) + ' 秒后再试', false); return; }
  const lockUntil = parseInt(localStorage.getItem('login_lock_until') || '0', 10);
  if (lockUntil > now) { toast('已触发登录保护，请 ' + Math.ceil((lockUntil - now) / 1000) + ' 秒后再试', false); return; }
  btn.disabled = true; btn.textContent = '登录中…';
  try {
    await SB.auth(email, pwd);
    localStorage.removeItem('login_fail_count');
    localStorage.removeItem('login_wait_until');
    localStorage.removeItem('login_lock_until');
    try { localStorage.setItem('admin_email', email); } catch (e) {}
    toast('登录成功', true);
    logLogin();
    location.href = 'admin.html';
  } catch (e) {
    // 登录失败时以 anon 身份直连 guard（SB.rpc 需登录 token，未登录时不可用）
    const ip = await getClientIp();
    try {
      const rf = await fetch(SB.url + '/rest/v1/rpc/admin_login_guard', {
        method: 'POST',
        headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ip: ip, p_failed: true })
      });
      const g = rf.ok ? await rf.json() : null;
      if (g && g.locked) {
        localStorage.setItem('login_lock_until', String(Date.now() + (g.wait || 1800) * 1000));
        toast('失败次数过多，登录已临时锁定，请 ' + (g.wait || 1800) + ' 秒后再试', false);
      } else {
        const fc = (parseInt(localStorage.getItem('login_fail_count') || '0', 10) || 0) + 1;
        localStorage.setItem('login_fail_count', String(fc));
        if (fc >= 3) {
          localStorage.setItem('login_wait_until', String(Date.now() + 30000));
          toast('连续失败 3 次，请 30 秒后再试', false);
        } else {
          toast((e && e.message) || '登录失败', false);
        }
      }
    } catch (err) {
      toast((e && e.message) || '登录失败', false);
    }
  } finally {
    btn.disabled = false; btn.textContent = '登 录';
  }
}
// 登录成功记录操作日志（含来源 IP；IP 获取失败则只记登录事件）
function logLogin() {
  try {
    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => {
      SB.rpc('admin_log_login', { p_ip: (d && d.ip) || '' }).catch(() => {});
    }).catch(() => { SB.rpc('admin_log_login', { p_ip: '' }).catch(() => {}); });
  } catch (e) { SB.rpc('admin_log_login', { p_ip: '' }).catch(() => {}); }
}


// ============ 前台页初始化（打开即销售页，登录入口隐藏在页脚） ============
(async function () {
  let t = 'aurora';
  try { t = localStorage.getItem('admin_theme') || 'aurora'; } catch (e) {}
  applyTheme(THEMES[t] ? t : 'aurora');
  applyShopBrand();
  document.getElementById('view-front').classList.remove('hide');
  showShopPage(getShopPageFromHash());
  loadShopPage();
  try {
    const r = await rpcAnon('shop_get_theme', {});
    if (r && r.ok && THEMES[r.theme] && r.theme !== t) applyTheme(r.theme);
  } catch (e) {}
})();
