
// ============ Supabase 直连配置 ============
// 数据库连接配置来自 js/config.js（换数据库只改 config.js，无需动本文件）
const SB = {
  url: (window.SB_CONFIG && window.SB_CONFIG.url) || '',
  key: (window.SB_CONFIG && window.SB_CONFIG.key) || '',
  token: localStorage.getItem('admin_token') || '',

  async auth(email, password) {
    const r = await fetch(SB.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!r.ok) throw new Error('账号或密码错误');
    const d = await r.json();
    SB.token = d.access_token;
    localStorage.setItem('admin_token', d.access_token);
  },

  async rpc(fn, body = {}) {
    const r = await fetch(SB.url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.status === 401) {
      SB.token = '';
      localStorage.removeItem('admin_token');
      if (typeof showLoginCard === 'function') showLoginCard();
      else location.href = 'index.html';
      throw new Error('AUTH_EXPIRED');
    }
    if (!r.ok) throw new Error('请求失败 (' + r.status + ')');
    return r.json();
  }
};

// ============ 工具 ============
let page = 1;
let renewPage = 1;
const pageSizeOptions = [100, 200, 300, 500];
let pageSize = parseInt(localStorage.getItem('admin_page_size')) || 100;
if (!pageSizeOptions.includes(pageSize)) pageSize = 100;
let toastTimer = null;
function toast(text, ok) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = 'toast show ' + (ok === false ? 'err' : ok === true ? 'ok' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + new Date(iso).getFullYear() : '';
const TYPE_LABELS = { 3650: '永久', 365: '年卡', 90: '季卡', 30: '月卡', 7: '周卡', 1: '天卡' };
const typeLabel = days => TYPE_LABELS[days] || (days ? days + ' 天' : '—');
const fmtExpiry = (iso, st) => (st === 'unused' || st === 'new') ? '未激活' : (!iso ? '—' : fmtDate(iso));
const isOnline = iso => iso && (Date.now() - new Date(iso).getTime() < 120 * 60 * 1000); // 在线判定 120 分钟，与服务端一致（心跳 30-60 分钟随机）
const isExpired = iso => iso && new Date(iso).getTime() < Date.now();
const badges = { unused: ['未启用', 'badge-unused'], used: ['使用中', 'badge-used'], disabled: ['已停用', 'badge-disabled'] };
async function rpcAnon(fn, body) {
  const r = await fetch(SB.url + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('rpc ' + fn + ' ' + r.status);
  return r.json();
}
// ============ 界面主题（前后台统一，10 套炫舞风格） ============
const THEMES = { aurora: '幻夜星梦', starfall: '星陨之夜', gold: '鎏金霓虹', mint: '薄荷清欢', pink: '粉黛甜心', galaxy: '银河漫游', peach: '蜜桃甜橙', sakura: '樱雪国风', noir: '暗夜霓虹', snow: '银白初雪', ocean: '碧海潮生', nebula: '星云紫夜', citrus: '青柠苏打', ruby: '红宝石夜', sky: '晴空蔚蓝', ember: '余烬暖光', candy: '糖果派对', graphite: '石墨幽影', jade: '玉露清辉', cobalt: '钴蓝电音', taobao: '淘宝橙购', pdd: '拼多多红', jd: '京东红购', xianyu: '闲鱼黄趣', meituan: '美团黄go', jym: '交易猫蓝' };
function applyTheme(t) {
  const k = THEMES[t] ? t : 'aurora';
  document.documentElement.dataset.theme = k;
  const vf = document.getElementById('view-front');
  if (vf) vf.dataset.shopTheme = k;
  try { localStorage.setItem('admin_theme', k); } catch (e) {}
  document.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', b.dataset.theme === k));
}
function pickTheme(t) {
  applyTheme(t);
  saveShopTheme(t);
}
async function saveShopTheme(t) {
  if (!SB || !SB.token) return;
  try { await SB.rpc('admin_set_shop_theme', { p_theme: t }); toast('主题已更新，前后台全站生效', true); }
  catch (e) { toast('主题保存失败：' + (e.message || e), false); }
}
// 顶部时钟：日期 + 星期 + 时间（秒级，改名避免与伪装页页脚 tickClock 冲突）
function tickTopClock() {
  const mainEl = document.getElementById('view-main');
  if (mainEl && mainEl.classList.contains('hide')) return; // 前台销售页无需更新后台时钟
  const d = new Date();
  const w = ['日','一','二','三','四','五','六'][d.getDay()];
  const p = n => String(n).padStart(2, '0');
  const el = document.getElementById('top-clock');
  if (el) el.textContent = d.getFullYear() + '年' + p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日 星期' + w + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
tickTopClock();
setInterval(tickTopClock, 1000);
async function applyShopBrand() {
  try {
    const r = await rpcAnon('shop_get_brand', {});
    if (!r || !r.ok) return;
    const t = r.title || '软件授权商城';
    const s = r.slogan || '在线购买 · 凭单号查卡密';
    const l = r.logo || '♪';
    const elName = document.getElementById('shop-brand-name');
    if (elName) elName.textContent = t;
    const elSub = document.getElementById('shop-brand-sub');
    if (elSub) elSub.textContent = s;
    const elLogo = document.getElementById('shop-logo-text');
    if (elLogo) elLogo.textContent = l;
    document.title = t;
    const fm = document.getElementById('shop-footer-meta');
    if (fm) fm.textContent = '© ' + new Date().getFullYear() + ' ' + t + ' · 售后支持 · 诚信经营';
  } catch (e) { /* 静默，保持默认 */ }
}
