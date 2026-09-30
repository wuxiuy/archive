function showMain() {
  const f = document.getElementById('view-front'); if (f) f.classList.add('hide');
  const l = document.getElementById('view-login'); if (l) l.classList.add('hide');
  document.getElementById('view-main').classList.remove('hide');
  showTab('overview');
  loadStats();
  loadProjects();
}
let orderPage = 1;
async function loadOrders(p) {
  const status = document.getElementById('order-status').value;
  const search = document.getElementById('order-search').value.trim();
  const r = await SB.rpc('admin_list_orders', { p_status: status, p_search: search, p_limit: 100, p_offset: (Math.max(1, p) - 1) * 100 });
  if (!r || !r.ok) { toast(r && r.message ? r.message : '加载订单失败', false); return; }
  orderPage = Math.max(1, p);
  const tb = document.getElementById('order-body');
  const list = r.list || [];
  if (!list.length) { tb.innerHTML = '<tr><td colspan="8"><div class="empty">暂无订单</div></td></tr>'; }
  else {
    tb.innerHTML = list.map(o => {
      const st = o.status === 'pending' ? '<span class="badge badge-unused">待付款</span>'
        : o.status === 'submitted' ? '<span class="badge badge-warn">待核验</span>'
        : '<span class="badge badge-used">已发卡</span>';
      const btn = o.status === 'submitted'
        ? '<button class="btn btn-primary btn-sm" onclick="confirmOrder(\'' + esc(o.order_no) + '\')">核验发卡</button>'
        : '<span class="muted" style="font-size:12px;">—</span>';
      return '<tr><td>' + fmtDateTime(o.created_at) + '</td><td>' + esc(o.order_no) + '</td><td>' + esc(o.product_name) + '</td><td>¥' + (o.amount_cents / 100).toFixed(2) + '</td><td>' + st + '</td><td>' + esc(o.buyer_contact) + '</td><td>' + esc(o.trade_no || '—') + '</td><td>' + btn + '</td></tr>';
    }).join('');
  }
  document.getElementById('order-info').textContent = '共 ' + (r.total || 0) + ' 条 · 第 ' + orderPage + ' 页';
}
async function confirmOrder(no) {
  if (!confirm('确认已收到该订单的付款，并核验发放卡密？')) return;
  const r = await SB.rpc('admin_confirm_order', { p_order_no: no });
  if (r && r.ok) { toast(r.code ? '已发卡：' + r.code : '已核验'); loadOrders(orderPage); }
  else toast(r && r.message ? r.message : '核验失败', false);
}
function showTab(name) {
  ['overview', 'list', 'manage'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
    document.getElementById('pane-' + t).classList.toggle('hide', t !== name);
  });
  if (name === 'list') { loadListStats(); loadList(1); }
  if (name === 'overview') loadStats();
  if (name === 'manage') { loadProjects(); loadLogs(1); loadAutoCleanup(); loadPayConfig(); loadServiceConfig(); loadShopProducts(); loadOrders(1); loadSalesStats(); }
  if (name === 'manage') { let k = 'orders'; try { k = localStorage.getItem('mg_panel') || 'orders'; } catch (e) {} showMgPanel(k); }
}

// ============ 登录 ============
// 取公网 IP（失败返回空串；guard 对空 IP 只留痕不锁定，避免误伤）
function logout() { SB.token = ''; localStorage.removeItem('admin_token'); location.href = 'index.html'; }

// ============ 统计 ============
const STAT_ITEMS = [
  ['total', '全部', 'total', ''],
  ['unused', '未启用', 'unused', 'unused'],
  ['used', '使用中', 'used', 'used'],
  ['disabled', '已停用', 'disabled', 'disabled'],
  ['online', '在线', 'online', 'online']
];
function renderStats(el, s) {
  el.innerHTML = STAT_ITEMS.map(([k, label, cls, filter]) =>
    '<div class="stat ' + cls + '" onclick="goList(\'' + filter + '\')"><b>' + (s[k] ?? 0) + '</b><span>' + label + '</span></div>').join('');
}
async function loadStats() {
  const el = document.getElementById('stats-body');
  try {
    const d = await SB.rpc('admin_stats');
    if (!d.ok) throw new Error(d.message);
    renderStats(el, d.stats);
  } catch (e) { el.innerHTML = '<div class="loading">加载失败</div>'; }
}
async function loadListStats() {
  const el = document.getElementById('list-stats');
  try {
    const d = await SB.rpc('admin_stats');
    if (!d.ok) throw new Error(d.message);
    renderStats(el, d.stats);
  } catch (e) { el.innerHTML = '<div class="loading">加载失败</div>'; }
}
function goList(status) {
  document.getElementById('list-status').value = status;
  showTab('list');
}

// ============ 每页数量 ============
function changePageSize(v) {
  pageSize = parseInt(v) || 100;
  localStorage.setItem('admin_page_size', pageSize);
  loadList(1);
}

// ============ 卡类型联动 ============
function onTypeChange(prefix) {
  const sel = document.getElementById(prefix + '-type');
  const days = document.getElementById(prefix + '-days');
  const v = parseInt(sel.value);
  if (v >= 0) { days.value = v; } else { days.value = ''; days.focus(); }
}

// ============ 发卡 ============
async function genCodes() {
  const count = parseInt(document.getElementById('gen-count').value) || 1;
  const days = parseInt(document.getElementById('gen-days').value) || 0;
  const remark = document.getElementById('gen-remark').value.trim();
  const project = document.getElementById('gen-project').value.trim();
  if (!project) { toast('发卡必须关联项目，请填写项目 ID', false); return; }
  try {
    const d = await SB.rpc('admin_gen_codes', { p_count: count, p_days: days, p_remark: remark, p_project_id: project });
    if (!d.ok) throw new Error(d.message);
    document.getElementById('gen-result').value = d.codes.join('\n');
    toast('成功创建 ' + d.codes.length + ' 条', true);
    loadProjects(); loadStats(); loadListStats();
  } catch (e) { toast(e.message, false); }
}
document.getElementById('gen-result')?.addEventListener('click', function () {
  if (!this.value) return;
  this.select();
  if (navigator.clipboard) navigator.clipboard.writeText(this.value).then(() => toast('已复制', true));
  else toast('已选中，请 Ctrl+C', true);
});

// ============ 数据维护 ============
async function exportData() {
  try {
    const d = await SB.rpc('admin_export');
    if (!d.ok) throw new Error(d.message);
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    a.href = URL.createObjectURL(blob);
    a.download = 'backup-' + ts + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    toast('已导出 ' + (d.codes ? d.codes.length : 0) + ' 条记录', true);
  } catch (e) { toast(e.message, false); }
}
async function importData(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
    const d = await SB.rpc('admin_import', { p_data: data });
    if (!d.ok) throw new Error(d.message);
    toast('导入完成：记录 ' + (d.codes_imported ?? 0) + ' 条，绑定 ' + (d.bindings_imported ?? 0) + ' 条', true);
    loadStats();
  } catch (e) {
    toast('导入失败：' + e.message, false);
  } finally { input.value = ''; }
}
// ============ 修改管理员密码 ============
function genPassword(len = 16) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const sym = '!@#$%^&*_-+=?';
  const all = upper + lower + digit + sym;
  const rand = n => Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * n);
  const arr = [upper[rand(upper.length)], lower[rand(lower.length)], digit[rand(digit.length)], sym[rand(sym.length)]];
  while (arr.length < len) arr.push(all[rand(all.length)]);
  for (let i = arr.length - 1; i > 0; i--) { const j = rand(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const pwd = arr.join('');
  document.getElementById('pw-new').value = pwd;
  document.getElementById('pw-confirm').value = pwd;
  const out = document.getElementById('pw-out');
  out.textContent = '已生成复杂密码：' + pwd + '　请立即复制保存，修改后只显示这一次';
  out.style.color = '#b45309';
}
async function changePassword() {
  const p1 = document.getElementById('pw-new').value;
  const p2 = document.getElementById('pw-confirm').value;
  if (!p1 || p1.length < 8) { toast('密码至少 8 位', false); return; }
  if (p1 !== p2) { toast('两次输入不一致', false); return; }
  try {
    const r = await fetch(SB.url + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': SB.key, 'Authorization': 'Bearer ' + SB.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p1 })
    });
    if (!r.ok) throw new Error('修改失败 (' + r.status + ')，请确认登录状态');
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
    const out = document.getElementById('pw-out');
    out.textContent = '';
    toast('密码已修改，下次登录请使用新密码', true);
  } catch (e) { toast(e.message, false); }
}
// ============ 操作日志 ============
let logPage = 1;
const LOG_TYPES = { login:'登录', gen:'发卡', renew:'续费', ban:'停用', unban:'启用', reset:'重置', remark:'备注', proj:'改项目', batch_remark:'批量备注', batch_expire:'批量到期', batch_ban:'批量封禁', batch_unban:'批量启用', batch_reset:'批量重置', export:'导出', import:'导入', purge:'清理过期', proj_create:'创建项目', proj_edit:'编辑项目', proj_del:'删除项目' };
async function loadLogs(page) {
  const type = document.getElementById('log-type').value;
  const search = document.getElementById('log-search').value.trim();
  try {
    const d = await SB.rpc('admin_list_logs', { p_type: type, p_search: search, p_limit: 50, p_offset: (page - 1) * 50 });
    if (!d.ok) throw new Error(d.message);
    const tb = document.getElementById('log-body');
    tb.innerHTML = d.list.map(l => '<tr><td class="muted">' + fmtDateTime(l.created_at) + '</td><td>' + (LOG_TYPES[l.op_type] || esc(l.op_type)) + '</td><td class="code-cell">' + esc(l.code) + '</td><td class="remark-cell muted" title="' + esc(l.remark) + '">' + (esc(l.remark) || '—') + '</td><td class="muted">' + esc(l.detail) + '</td></tr>').join('') ||
      '<tr><td colspan="5"><div class="empty">暂无日志</div></td></tr>';
    document.getElementById('log-info').textContent = d.total ? ('第 ' + page + ' 页 · 共 ' + d.total + ' 条') : '';
    logPage = page;
  } catch (e) { toast(e.message, false); }
}
async function clearLogs() {
  const type = document.getElementById('log-type').value;
  if (!confirm(type ? '确定清空当前类型的日志？' : '确定清空全部日志？')) return;
  try {
    const d = await SB.rpc('admin_clear_logs', { p_type: type });
    if (!d.ok) throw new Error(d.message);
    toast('已清空 ' + d.deleted + ' 条日志', true);
    loadLogs(1);
  } catch (e) { toast(e.message, false); }
}

async function purgeExpired() {
  const daysEl = document.getElementById('maint-clean-days');
  const days = daysEl ? parseInt(daysEl.value, 10) : 30;
  if (isNaN(days) || days < 0) { toast('请输入有效的天数（>= 0）', false); return; }
  if (!confirm('确定清理到期超过 ' + days + ' 天未续费的记录？此操作不可恢复。')) return;
  try {
    const d = await SB.rpc('admin_purge_expired', { p_days: days });
    if (!d.ok) throw new Error(d.message);
    toast(d.deleted > 0 ? '已清理 ' + d.deleted + ' 条过期记录' : '没有需要清理的记录', d.deleted > 0);
    loadStats(); loadList(page);
  } catch (e) { toast(e.message, false); }
}

// ============ 批量选择 ============
const selected = new Set();
function renderSelection() {
  const n = selected.size;
  const bar = document.getElementById('batch-bar');
  bar.classList.toggle('hide', n === 0);
  document.getElementById('batch-count').textContent = n;
  document.querySelectorAll('.row-check').forEach(cb => { cb.checked = selected.has(cb.dataset.code); });
  const boxes = [...document.querySelectorAll('.row-check')];
  const all = boxes.length > 0 && boxes.every(b => b.checked);
  document.getElementById('check-all').checked = all;
}
function onRowCheck(cb, code) {
  if (cb.checked) selected.add(code); else selected.delete(code);
  renderSelection();
}
function toggleAll(checked) {
  document.querySelectorAll('.row-check').forEach(cb => {
    if (checked) selected.add(cb.dataset.code); else selected.delete(cb.dataset.code);
    cb.checked = checked;
  });
  renderSelection();
}
function clearSelection() { selected.clear(); renderSelection(); }
function selectedCodes() { return [...selected]; }

async function batchRemark() {
  const codes = selectedCodes();
  if (!codes.length) return;
  const input = prompt('为选中的 ' + codes.length + ' 条设置备注：');
  if (input === null) return;
  try {
    const d = await SB.rpc('admin_batch_remark', { p_codes: codes, p_remark: input });
    if (!d.ok) throw new Error(d.message);
    toast('已更新 ' + (d.updated ?? 0) + ' 条备注', true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchRemarkSeq() {
  const codes = selectedCodes();
  if (!codes.length) return;
  const prefix = prompt('编号备注：输入前缀（如"机器"），选中的码将按卡号升序自动编号', '机器');
  if (prefix === null) return;
  const start = prompt('起始编号（默认 1 → 001 起）', '1');
  if (start === null) return;
  const digits = prompt('编号位数（默认 3 → 001；2 → 01）', '3');
  if (digits === null) return;
  const st = parseInt(start), dg = parseInt(digits);
  if (isNaN(st) || isNaN(dg) || dg < 1 || dg > 10) { toast('起始编号或位数无效', false); return; }
  try {
    const d = await SB.rpc('admin_batch_remark_seq', { p_codes: codes, p_prefix: prefix, p_start: st, p_digits: dg });
    if (!d.ok) throw new Error(d.message);
    toast('已编号 ' + (d.updated ?? 0) + ' 条：' + (d.first_remark ?? '') + ' ~ ' + (d.last_remark ?? ''), true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchExpire() {
  const codes = selectedCodes();
  if (!codes.length) return;
  const input = prompt('为选中的 ' + codes.length + ' 条设置到期：\n输入天数（正数 = N 天后到期；0 = 今天到期；负数 = 已到期；永久请填 3650）');
  if (input === null) return;
  const days = parseInt(input);
  if (isNaN(days)) { toast('请输入有效的天数', false); return; }
  try {
    const d = await SB.rpc('admin_batch_expire', { p_codes: codes, p_days: days });
    if (!d.ok) throw new Error(d.message);
    toast(days > 0 ? '已设置 ' + (d.updated ?? 0) + ' 条到期（' + days + ' 天后）' : (days === 0 ? '已设置为今天到期' : '已设置为已到期（' + (-days) + ' 天）'), true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchActivate() {
  const codes = selectedCodes();
  if (!codes.length) return;
  const dev = prompt('批量激活（仅未启用的卡生效，已激活/停用自动跳过）：' + codes.length + ' 条\n输入要绑定的设备号（留空 = 不绑定，顾客激活时自动接管）', '');
  if (dev === null) return;
  try {
    const d = await SB.rpc('admin_batch_activate', { p_codes: codes, p_device_id: dev.trim() });
    if (!d.ok) throw new Error(d.message);
    toast('已激活 ' + (d.updated ?? 0) + ' 条，跳过 ' + (d.skipped ?? 0) + ' 条', (d.updated ?? 0) > 0);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchEnable() {
  const codes = selectedCodes();
  if (!codes.length) return;
  if (!confirm('确定解封选中的停用卡？（未停用的卡不受影响）')) return;
  try {
    const d = await SB.rpc('admin_batch_enable', { p_codes: codes });
    if (!d.ok) throw new Error(d.message);
    toast('已启用 ' + (d.updated ?? 0) + ' 条停用卡', (d.updated ?? 0) > 0);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchSetProject() {
  const codes = selectedCodes();
  if (!codes.length) return;
  const pid = await openProjectModal('为选中的 ' + codes.length + ' 条设置项目', '选择已有项目或输入新项目 ID（不存在自动创建）');
  if (pid === null || pid === undefined) return;
  const v = String(pid).trim();
  if (!v) { toast('项目 ID 不能为空', false); return; }
  try {
    const d = await SB.rpc('admin_batch_code_project', { p_codes: codes, p_project_id: v });
    if (!d.ok) throw new Error(d.message);
    toast('已改项目 ' + (d.updated ?? 0) + ' 条，跳过 ' + (d.skipped ?? 0) + ' 条', true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchBan() {
  const codes = selectedCodes();
  if (!codes.length) return;
  if (!confirm('确定封禁选中的 ' + codes.length + ' 条记录？封禁后对应设备将被踢下线。')) return;
  try {
    const d = await SB.rpc('admin_batch_status', { p_codes: codes, p_status: 'disabled' });
    if (!d.ok) throw new Error(d.message);
    toast('已封禁 ' + (d.updated ?? 0) + ' 条', true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}
async function batchReset() {
  const codes = selectedCodes();
  if (!codes.length) return;
  if (!confirm('确定重置选中的 ' + codes.length + ' 条绑定？当前设备将被踢下线。')) return;
  try {
    const d = await SB.rpc('admin_batch_reset', { p_codes: codes });
    if (!d.ok) throw new Error(d.message);
    toast('已重置 ' + (d.updated ?? 0) + ' 条绑定', true);
    clearSelection(); loadList(page); loadListStats();
  } catch (e) { toast(e.message, false); }
}

// ============ 卡密列表 ============
async function loadList(p) {
  if (p < 1) return;
  page = p;
  const search = document.getElementById('list-search').value.trim();
  const status = document.getElementById('list-status').value;
  const project = document.getElementById('list-project').value;
  const online = status === 'online';
  const statusArg = online ? 'used' : status;
  const body = document.getElementById('list-body');
  try {
    const d = await SB.rpc('admin_list_codes', {
      p_status: statusArg, p_search: search, p_limit: pageSize, p_offset: (page - 1) * pageSize,
      p_project: project, p_online: online
    });
    if (!d.ok) throw new Error(d.message);
    if (!d.list.length) {
      body.innerHTML = '<tr><td colspan="10"><div class="empty">没有记录</div></td></tr>';
    } else {
      body.innerHTML = d.list.map(it => {
        const [label, cls] = badges[it.status] || [it.status, ''];
        const on = isOnline(it.last_seen_at);
        const exp = it.status !== 'unused' && isExpired(it.expires_at);
        const ops = '<div class="ops">' +
          (it.status === 'unused'
            ? '<button class="btn btn-ghost btn-sm" onclick="manualActivate(\'' + it.code + '\')">激活</button>'
            : '') +
          (it.status === 'disabled'
            ? '<button class="btn btn-ghost btn-sm" onclick="setStatus(\'' + it.code + '\',\'used\')">启用</button>'
            : '<button class="btn btn-danger btn-sm" onclick="setStatus(\'' + it.code + '\',\'disabled\')">停用</button>') +
          '<button class="btn btn-ghost btn-sm" onclick="setRemark(\'' + it.code + '\',\'' + esc(it.remark) + '\')">备注</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="setCodeProject(\'' + it.code + '\')">项目</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="extend(\'' + it.code + '\')">续费</button>' +
          (it.status === 'used' && it.current_device
            ? '<button class="btn btn-ghost btn-sm" onclick="resetDevice(\'' + it.code + '\')">重置</button>'
            : '') +
        '</div>';
        const devText = it.current_device || (it.devices || '');
        return '<tr>' +
          '<td class="chk"><input type="checkbox" class="row-check" data-code="' + esc(it.code) + '"' +
            (selected.has(it.code) ? ' checked' : '') + ' onchange="onRowCheck(this,\'' + esc(it.code) + '\')"></td>' +
          '<td class="code-cell">' + esc(it.code) + '</td>' +
          '<td><span class="badge ' + cls + '">' + label + '</span></td>' +
          '<td class="muted">' + typeLabel(it.expire_days) + '</td>' +
          '<td class="muted">' + (it.project_name || it.project_id || '通用') + '</td>' +
          '<td class="remark-cell muted" title="' + esc(it.remark) + '">' + (esc(it.remark) || '—') + '</td>' +
          '<td class="muted">' + fmtDate(it.created_at) + '</td>' +
          '<td class="' + (exp ? 'expired' : '') + '">' + fmtExpiry(it.expires_at, it.status) + (exp ? '（已到期）' : '') + '</td>' +
          '<td class="dev" title="' + esc(devText) + '"><span class="dev-line"><span class="dot' + (on ? ' on' : '') + '"></span>' +
            (devText ? esc(devText.length > 14 ? devText.slice(0, 14) + '…' : devText) : '—') +
            (it.bind_count > 1 ? ' <span class="muted">×' + it.bind_count + '</span>' : '') + '</span></td>' +
          '<td>' + ops + '</td></tr>';
      }).join('');
    }
    const totalPages = Math.max(1, Math.ceil(d.total / pageSize));
    document.getElementById('list-info').textContent = page + ' / ' + totalPages + ' 页 · 共 ' + d.total + ' 条';
    renderSelection();
  } catch (e) {
    body.innerHTML = '<tr><td colspan="10"><div class="loading">加载失败</div></td></tr>';
  }
}

// ============ 项目 ============
async function loadProjects() {
  try {
    const d = await SB.rpc('admin_list_projects');
    if (!d.ok) throw new Error(d.message);
    const dl = document.getElementById('project-list');
    dl.innerHTML = d.list.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
    const sel = document.getElementById('list-project');
    sel.innerHTML = '<option value="">全部项目</option>' + d.list.map(p =>
      '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.code_count ? '（' + p.code_count + '）' : '') + '</option>').join('');
    const pm = document.getElementById('project-manage');
    pm.innerHTML = d.list.map(p => '<tr><td>' + esc(p.id) + '</td><td>' + esc(p.name) + '</td><td>' + (p.code_count ?? 0) + '</td><td class="muted">' + (esc(p.remark) || '—') + '</td>' +
      '<td class="muted" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (esc(p.download_url) || '—') + '</td>' +
      '<td><div class="ops">' +
      '<button class="btn btn-ghost btn-sm" onclick="editProject(\'' + esc(p.id) + '\',\'' + esc(p.name) + '\',\'' + esc(p.remark || '') + '\',\'' + esc(p.download_url || '') + '\')">编辑</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteProject(\'' + esc(p.id) + '\')">删除</button>' +
      '</div></td></tr>').join('') ||
      '<tr><td colspan="6"><div class="empty">还没有项目，在上方创建</div></td></tr>';
  } catch (e) { /* 静默：项目加载失败不影响主功能 */ }
}
// ============ 自动清理配置 ============
async function loadAutoCleanup() {
  const sel = document.getElementById('auto-clean-time');
  if (sel.options.length === 0) {
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = String(h).padStart(2, '0') + ':00';
      o.textContent = h + ' 点';
      sel.appendChild(o);
    }
  }
  try {
    const d = await SB.rpc('admin_get_auto_cleanup');
    if (!d.ok) return;
    document.getElementById('auto-clean-enable').value = d.enabled ? 'true' : 'false';
    document.getElementById('auto-clean-days').value = d.days ?? 30;
    const md = document.getElementById('maint-clean-days');
    if (md) md.value = d.days ?? 30;
    const t = String(d.time || '03:00').split(':')[0].padStart(2, '0') + ':00';
    if (sel.querySelector('option[value="' + t + '"]')) sel.value = t;
    document.getElementById('auto-clean-status').textContent =
      d.enabled ? '已开启：每天 ' + t + ' 自动清理' : '未开启（仅手动清理）';
  } catch (e) { /* 静默 */ }
}
async function saveAutoCleanup() {
  const enabled = document.getElementById('auto-clean-enable').value === 'true';
  const days = parseInt(document.getElementById('auto-clean-days').value, 10);
  if (isNaN(days) || days < 0) { toast('保留天数需 ≥ 0', false); return; }
  const time = document.getElementById('auto-clean-time').value;
  try {
    const d = await SB.rpc('admin_set_auto_cleanup', { p_enabled: enabled, p_days: days, p_time: time });
    if (!d.ok) throw new Error(d.message);
    toast(enabled ? '自动清理已开启（每天 ' + time + '）' : '自动清理已关闭', true);
    loadAutoCleanup();
  } catch (e) { toast(e.message, false); }
}

// ============ 支付设置 ============
async function loadPayConfig() {
  try {
    const d = await SB.rpc('admin_get_pay_config');
    if (!d.ok) return;
    const c = d.config || {};
    document.getElementById('pay-active').value = c.active || '';
    const fill = (prefix, o) => {
      Object.keys(o || {}).forEach(k => {
        const el = document.getElementById(prefix + '-' + k);
        if (el) el.value = o[k] || '';
      });
    };
    fill('epay', c.epay); fill('wechat', c.wechat); fill('alipay', c.alipay);
    document.getElementById('pay-receipt-qr').value = c.receipt_qr || '';
    document.getElementById('pay-note-text').value = c.pay_note || '';
    togglePayFields();
  } catch (e) { /* 静默 */ }
  loadGlobalDownload();
  loadShopBrand();
}
function togglePayFields() {
  const v = document.getElementById('pay-active').value;
  ['epay', 'wechat', 'alipay'].forEach(k => {
    document.getElementById('pay-' + k + '-fields').classList.toggle('hide', v !== k);
  });
}
async function savePayConfig() {
  const c = {
    active: document.getElementById('pay-active').value,
    epay: { pid: document.getElementById('epay-pid').value.trim(), key: document.getElementById('epay-key').value.trim(), gateway: document.getElementById('epay-gateway').value.trim() },
    wechat: { appid: document.getElementById('wechat-appid').value.trim(), mchid: document.getElementById('wechat-mchid').value.trim(), key: document.getElementById('wechat-key').value.trim() },
    alipay: { appid: document.getElementById('alipay-appid').value.trim(), private_key: document.getElementById('alipay-private_key').value.trim(), gateway: document.getElementById('alipay-gateway').value.trim() },
    receipt_qr: document.getElementById('pay-receipt-qr').value.trim(),
    pay_note: document.getElementById('pay-note-text').value.trim()
  };
  if (c.active === 'epay' && (!c.epay.pid || !c.epay.key || !c.epay.gateway)) { toast('易支付：商户 ID、密钥、网关均必填', false); return; }
  if (c.active === 'wechat' && (!c.wechat.appid || !c.wechat.mchid || !c.wechat.key)) { toast('微信：AppID、商户号、密钥均必填', false); return; }
  if (c.active === 'alipay' && (!c.alipay.appid || !c.alipay.private_key)) { toast('支付宝：AppID、应用私钥必填', false); return; }
  try {
    const d = await SB.rpc('admin_set_pay_config', { p_json: JSON.stringify(c) });
    if (!d.ok) throw new Error(d.message);
    toast('支付设置已保存', true);
    document.getElementById('pay-status').textContent = c.active ? '当前通道：' + document.getElementById('pay-active').selectedOptions[0].text : '未开放购买';
    loadPayConfig();
  } catch (e) { toast(e.message, false); }
}

// ============ 默认下载地址（全局兜底） ============
async function loadGlobalDownload() {
  try {
    const d = await SB.rpc('admin_get_download_url');
    if (d && d.ok) document.getElementById('shop-dl-global').value = d.url || '';
  } catch (e) { /* 静默 */ }
}
async function saveGlobalDownload() {
  const url = document.getElementById('shop-dl-global').value.trim();
  try {
    const d = await SB.rpc('admin_set_download_url', { p_url: url });
    if (!d.ok) throw new Error(d.message);
    toast('默认下载地址已保存', true);
  } catch (e) { toast(e.message, false); }
}

// ============ 首页设置（标题 / 签名详情 / LOGO） ============
async function loadShopBrand() {
  try {
    const d = await SB.rpc('admin_get_shop_brand');
    if (!d.ok) return;
    document.getElementById('brand-title').value = d.title || '';
    document.getElementById('brand-slogan').value = d.slogan || '';
    document.getElementById('brand-logo').value = d.logo || '';
  } catch (e) { /* 静默 */ }
}
async function saveShopBrand() {
  const t = document.getElementById('brand-title').value.trim();
  const s = document.getElementById('brand-slogan').value.trim();
  const l = document.getElementById('brand-logo').value.trim();
  try {
    const d = await SB.rpc('admin_set_shop_brand', { p_title: t, p_slogan: s, p_logo: l });
    if (!d.ok) throw new Error(d.message);
    toast('首页设置已保存', true);
  } catch (e) { toast(e.message, false); }
}

// ============ 系统管理：左菜单切换 ============
function showMgPanel(k) {
  document.querySelectorAll('#pane-manage .mg-main > .card').forEach(c => c.classList.toggle('mg-on', c.id === 'mg-panel-' + k));
  document.querySelectorAll('#pane-manage .mg-item').forEach(b => b.classList.toggle('active', b.getAttribute('data-k') === k));
  try { localStorage.setItem('mg_panel', k); } catch (e) {}
}

// ============ 客服设置（QQ/微信接入 + 首页悬浮球） ============
async function loadServiceConfig() {
  try {
    const d = await SB.rpc('admin_get_service_config');
    if (!d.ok) return;
    const c = d.config || {};
    document.getElementById('svc-qq').value = c.qq || '';
    document.getElementById('svc-wechat').value = c.wechat_id || '';
    document.getElementById('svc-wechat-qr').value = c.wechat_qr || '';
  } catch (e) { /* 静默 */ }
}
async function saveServiceConfig() {
  const c = {
    qq: document.getElementById('svc-qq').value.trim(),
    wechat_id: document.getElementById('svc-wechat').value.trim(),
    wechat_qr: document.getElementById('svc-wechat-qr').value.trim()
  };
  try {
    const d = await SB.rpc('admin_set_service_config', { p_json: JSON.stringify(c) });
    if (!d.ok) throw new Error(d.message);
    toast('客服设置已保存', true);
    document.getElementById('svc-status').textContent = (c.qq || c.wechat_id || c.wechat_qr) ? '首页联系悬浮球已启用' : '已关闭（首页不显示悬浮球）';
  } catch (e) { toast(e.message, false); }
}

// ============ 售卖配置 ============
let shopList = [];
async function loadShopProducts() {
  try {
    const pj = await SB.rpc('admin_list_projects');
    const dl = document.getElementById('shop-project-list');
    if (dl) {
      dl.innerHTML = '';
      (pj.list || []).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.id + ' ' + p.name;
        dl.appendChild(o);
      });
    }
    const d = await SB.rpc('admin_list_shop_products');
    if (!d.ok) return;
    shopList = d.list || [];
    const tb = document.getElementById('shop-body');
    if (shopList.length === 0) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty">暂无套餐，先在上方添加</div></td></tr>';
      return;
    }
    // 按项目分组展示（一个项目可挂多个规格）
    const groups = {};
    shopList.forEach(p => {
      const k = p.project_id;
      (groups[k] = groups[k] || []).push(p);
    });
    let html = '';
    Object.keys(groups).forEach(k => {
      const items = groups[k];
      const pname = items[0].project_name || k;
      const onCnt = items.filter(x => x.enabled).length;
      html += '<tr class="shop-group-row"><td colspan="8">项目：' + esc(pname) + '（ID ' + esc(k) + '）· ' + items.length + ' 个规格 · ' + onCnt + ' 个上架</td></tr>';
      html += items.map(p =>
        '<tr><td>' + esc(p.name) + '</td>' +
        '<td>' + esc(p.project_name || p.project_id) + '</td>' +
        '<td>' + (p.days === 0 ? '永久' : p.days + ' 天') + '</td>' +
        '<td>¥' + (p.price_cents / 100).toFixed(2) + '</td>' +
        '<td>' + (p.old_price_cents > p.price_cents ? '¥' + (p.old_price_cents / 100).toFixed(2) : '<span class="muted">-</span>') + '</td>' +
        '<td>' + (p.enabled ? '<span style="color:var(--primary)">上架</span>' : '<span class="muted">下架</span>') + '</td>' +
        '<td>' + (p.order_count || 0) + '</td>' +
        '<td class="ops">' +
          '<button class="btn btn-ghost btn-sm" onclick="editShopProduct(' + p.id + ')">编辑</button> ' +
          '<button class="btn btn-ghost btn-sm" onclick="toggleShopProduct(' + p.id + ')">' + (p.enabled ? '下架' : '上架') + '</button> ' +
          '<button class="btn btn-danger btn-sm" onclick="delShopProduct(' + p.id + ')">删除</button>' +
        '</td></tr>').join('');
    });
    tb.innerHTML = html;
  } catch (e) { /* 静默 */ }
}
function resetShopForm() {
  document.getElementById('shop-id').value = '0';
  document.getElementById('shop-project').value = '';
  document.getElementById('shop-name').value = '';
  document.getElementById('shop-days').value = '30';
  document.getElementById('shop-price').value = '';
  document.getElementById('shop-old-price').value = '';
  document.getElementById('shop-enabled').value = 'true';
  document.getElementById('shop-cancel').classList.add('hide');
}
function editShopProduct(id) {
  const p = shopList.find(x => x.id === id);
  if (!p) return;
  document.getElementById('shop-id').value = p.id;
  document.getElementById('shop-project').value = p.project_id;
  document.getElementById('shop-name').value = p.name;
  document.getElementById('shop-days').value = p.days;
  document.getElementById('shop-price').value = (p.price_cents / 100).toFixed(2);
  document.getElementById('shop-old-price').value = p.old_price_cents > 0 ? (p.old_price_cents / 100).toFixed(2) : '';
  document.getElementById('shop-enabled').value = p.enabled ? 'true' : 'false';
  document.getElementById('shop-cancel').classList.remove('hide');
  toast('正在编辑套餐：' + p.name, true);
}
async function saveShopProduct() {
  const id = parseInt(document.getElementById('shop-id').value, 10) || 0;
  const projectId = document.getElementById('shop-project').value.trim();
  const name = document.getElementById('shop-name').value.trim();
  const days = parseInt(document.getElementById('shop-days').value, 10);
  const priceYuan = parseFloat(document.getElementById('shop-price').value);
  const oldYuan = parseFloat(document.getElementById('shop-old-price').value);
  const oldCents = isNaN(oldYuan) || oldYuan <= 0 ? 0 : Math.round(oldYuan * 100);
  if (!projectId || !name) { toast('项目与套餐名必填', false); return; }
  if (isNaN(days) || days < 0) { toast('天数需 ≥ 0（0 = 永久）', false); return; }
  if (isNaN(priceYuan) || priceYuan <= 0) { toast('价格必须大于 0', false); return; }
  const enabled = document.getElementById('shop-enabled').value === 'true';
  try {
    const d = await SB.rpc('admin_set_shop_product', {
      p_project_id: projectId, p_name: name, p_days: days,
      p_price_cents: Math.round(priceYuan * 100), p_enabled: enabled, p_id: id, p_old_price_cents: oldCents
    });
    if (!d.ok) throw new Error(d.message);
    toast(id ? '套餐已更新' : '套餐已添加', true);
    resetShopForm();
    loadShopProducts();
  } catch (e) { toast(e.message, false); }
}
async function toggleShopProduct(id) {
  const p = shopList.find(x => x.id === id);
  if (!p) return;
  try {
    const d = await SB.rpc('admin_set_shop_product', {
      p_project_id: p.project_id, p_name: p.name, p_days: p.days,
      p_price_cents: p.price_cents, p_old_price_cents: p.old_price_cents || 0, p_enabled: !p.enabled, p_id: id
    });
    if (!d.ok) throw new Error(d.message);
    toast(p.enabled ? '已下架' : '已上架', true);
    loadShopProducts();
  } catch (e) { toast(e.message, false); }
}
async function delShopProduct(id) {
  const p = shopList.find(x => x.id === id);
  if (!p) return;
  if (!confirm('确认删除套餐「' + p.name + '」？')) return;
  try {
    const d = await SB.rpc('admin_del_shop_product', { p_id: id });
    if (!d.ok) throw new Error(d.message);
    toast('套餐已删除', true);
    loadShopProducts();
  } catch (e) { toast(e.message, false); }
}

// ============ 销售统计 ============
const fmtYuan = cents => '¥' + (cents / 100).toFixed(2);
const fmtBarYuan = cents => (cents / 100) % 1 === 0 ? '¥' + (cents / 100).toFixed(0) : '¥' + (cents / 100).toFixed(1);
function buildBar(el, items, keyLabel) {
  const max = Math.max.apply(null, items.map(x => x.amount).concat([1]));
  el.innerHTML = items.map(x =>
    '<div class="bar-item" title="' + esc(x[keyLabel]) + '  ' + fmtYuan(x.amount) + ' / ' + x.cnt + ' 单">' +
    '<div class="bv">' + (x.amount > 0 ? fmtBarYuan(x.amount) : '') + '</div>' +
    '<div class="bar" style="height:' + Math.round(x.amount / max * 100) + '%"></div>' +
    '<div class="bl">' + esc(x[keyLabel]) + '</div></div>').join('');
}
async function loadSalesStats() {
  const yearSel = document.getElementById('sales-year');
  if (yearSel.options.length === 0) {
    const y = new Date().getFullYear();
    for (let i = y - 2; i <= y; i++) {
      const o = document.createElement('option');
      o.value = i; o.textContent = i + ' 年';
      yearSel.appendChild(o);
    }
    yearSel.value = String(y);
  }
  const days = parseInt(document.getElementById('sales-days').value, 10);
  const year = parseInt(yearSel.value, 10);
  try {
    const d = await SB.rpc('admin_sales_stats', { p_days: days });
    if (!d.ok) { toast(d.message || '统计加载失败', false); return; }
    document.getElementById('sales-total').textContent = fmtYuan(d.total_cents);
    document.getElementById('sales-orders').textContent = d.orders + ' 单';
    buildBar(document.getElementById('sales-daily-chart'), d.daily || [], 'd');
    const tb = document.getElementById('sales-by-project');
    if (!d.by_project || d.by_project.length === 0) {
      tb.innerHTML = '<tr><td colspan="3"><div class="empty">暂无销售数据</div></td></tr>';
    } else {
      tb.innerHTML = d.by_project.map(x =>
        '<tr><td>' + esc(x.project_name || x.project_id) + '</td><td>' + fmtYuan(x.amount) + '</td><td>' + x.cnt + ' 单</td></tr>').join('');
    }
    const m = await SB.rpc('admin_sales_monthly', { p_year: year });
    if (m.ok) {
      document.getElementById('sales-month').textContent = fmtYuan(m.month_total_cents);
      document.getElementById('sales-lastmonth').textContent = fmtYuan(m.last_month_total_cents);
      buildBar(document.getElementById('sales-monthly-chart'), m.monthly || [], 'm');
    }
  } catch (e) { toast('统计加载失败', false); }
}

// ============ 项目选择 modal（改项目：下拉可选 + 自定义） ============
let pmResolve = null;
async function openProjectModal(title, placeholder) {
  document.getElementById('pm-title').textContent = title;
  const inp = document.getElementById('pm-input');
  inp.placeholder = placeholder || '选择已有项目或输入新项目 ID（不存在自动创建）';
  inp.value = '';
  try {
    const d = await SB.rpc('admin_list_projects');
    if (d.ok && Array.isArray(d.list)) {
      document.getElementById('pm-datalist').innerHTML = d.list.map(p =>
        '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
    }
  } catch (e) { /* 静默：拉不到项目列表则仅可自定义输入 */ }
  document.getElementById('project-modal').classList.remove('hide');
  document.getElementById('pm-input').focus();
  return new Promise(res => { pmResolve = res; });
}
function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hide');
  if (pmResolve) { pmResolve(null); pmResolve = null; }
}
function submitProjectModal() {
  const v = document.getElementById('pm-input').value;
  document.getElementById('project-modal').classList.add('hide');
  if (pmResolve) { pmResolve(v); pmResolve = null; }
}

async function createProject() {
  const id = document.getElementById('proj-id').value.trim();
  const name = document.getElementById('proj-name').value.trim();
  const remark = document.getElementById('proj-remark').value.trim();
  const download = document.getElementById('proj-download').value.trim();
  if (!id || !name) { toast('项目 ID 和名称不能为空', false); return; }
  try {
    const d = await SB.rpc('admin_create_project', { p_id: id, p_name: name, p_remark: remark, p_download_url: download });
    if (!d.ok) throw new Error(d.message);
    toast('项目已创建', true);
    document.getElementById('proj-id').value = '';
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-remark').value = '';
    document.getElementById('proj-download').value = '';
    loadProjects();
  } catch (e) { toast(e.message, false); }
}
async function editProject(id, name, remark, download) {
  const newName = prompt('修改项目「' + id + '」的名称：', name || '');
  if (newName === null) return;
  if (!newName.trim()) { toast('名称不能为空', false); return; }
  const newRemark = prompt('修改备注：', remark || '');
  if (newRemark === null) return;
  const newDownload = prompt('修改下载地址（软件下载页或网盘，留空则用全局默认）：', download || '');
  if (newDownload === null) return;
  try {
    const d = await SB.rpc('admin_create_project', { p_id: id, p_name: newName.trim(), p_remark: newRemark.trim(), p_download_url: newDownload.trim() });
    if (!d.ok) throw new Error(d.message);
    toast('项目已更新', true);
    loadProjects();
  } catch (e) { toast(e.message, false); }
}
async function deleteProject(id) {
  if (!confirm('确定删除项目「' + id + '」？该项目下还有激活码时无法删除。')) return;
  try {
    const d = await SB.rpc('admin_delete_project', { p_id: id });
    if (!d.ok) throw new Error(d.message);
    toast('项目已删除', true);
    loadProjects();
  } catch (e) { toast(e.message, false); }
}

// ============ 续费面板（按顾客/设备/日期/备注查询） ============
async function searchRenew(p) {
  if (p < 1) return;
  renewPage = p;
  const q = document.getElementById('renew-search').value.trim();
  const body = document.getElementById('renew-body');
  try {
    const d = await SB.rpc('admin_list_codes', { p_status: '', p_search: q, p_limit: 50, p_offset: (p - 1) * 50, p_project: '', p_online: false });
    if (!d.ok) throw new Error(d.message);
    if (!d.list.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">没有匹配结果</div></td></tr>';
    } else {
      body.innerHTML = d.list.map(it => {
        const [label, cls] = badges[it.status] || [it.status, ''];
        const exp = it.status !== 'unused' && isExpired(it.expires_at);
        const devText = it.current_device || (it.devices || '');
        return '<tr>' +
          '<td class="code-cell">' + esc(it.code) + '</td>' +
          '<td><span class="badge ' + cls + '">' + label + '</span></td>' +
          '<td class="muted">' + typeLabel(it.expire_days) + '</td>' +
          '<td class="remark-cell muted" title="' + esc(it.remark) + '">' + (esc(it.remark) || '—') + '</td>' +
          '<td class="' + (exp ? 'expired' : '') + '">' + fmtExpiry(it.expires_at, it.status) + (exp ? '（已到期）' : '') + '</td>' +
          '<td class="dev" title="' + esc(devText) + '">' + (devText ? esc(devText.length > 14 ? devText.slice(0, 14) + '…' : devText) : '—') + '</td>' +
          '<td><div class="ops">' +
          (it.status === 'unused' ? '<button class="btn btn-ghost btn-sm" onclick="manualActivate(\'' + it.code + '\')">激活</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="extend(\'' + it.code + '\')">续费</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="setRemark(\'' + it.code + '\',\'' + esc(it.remark) + '\')">备注</button></div></td></tr>';
      }).join('');
    }
    const totalPages = Math.max(1, Math.ceil(d.total / 50));
    document.getElementById('renew-info').textContent = renewPage + ' / ' + totalPages + ' 页 · 共 ' + d.total + ' 条';
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty">加载失败</div></td></tr>';
  }
}

// ============ 行操作 ============
async function manualActivate(code) {
  const dev = prompt('后台手动激活「' + code + '」\n到期时间将从此刻开始计算。\n\n可输入顾客设备号（留空 = 不绑定，顾客首次激活时自动接管）：', '');
  if (dev === null) return;
  try {
    const d = await SB.rpc('admin_activate', { p_code: code, p_device_id: (dev || '').trim() });
    if (!d.ok) throw new Error(d.message);
    toast('激活成功，有效期至 ' + fmtDate(d.expires_at), true);
    loadList(page); searchRenew(1);
  } catch (e) { toast(e.message, false); }
}
async function setStatus(code, status) {
  try {
    const d = await SB.rpc('admin_set_status', { p_code: code, p_status: status });
    if (!d.ok) throw new Error(d.message);
    toast(status === 'disabled' ? '已停用 ' + code : '已启用 ' + code, true);
    loadList(page);
  } catch (e) { toast(e.message, false); }
}
async function setRemark(code, current) {
  const input = prompt('修改「' + code + '」的备注：', current || '');
  if (input === null) return;
  try {
    const d = await SB.rpc('admin_set_remark', { p_code: code, p_remark: input });
    if (!d.ok) throw new Error(d.message);
    toast('备注已更新', true);
    loadList(page);
  } catch (e) { toast(e.message, false); }
}
async function setCodeProject(code) {
  const v = await openProjectModal('修改「' + code + '」所属项目', '选择已有项目或输入新项目 ID（不存在自动创建）');
  if (v === null || v === undefined) return;
  const input = String(v).trim();
  if (!input) { toast('项目 ID 不能为空', false); return; }
  try {
    const d = await SB.rpc('admin_set_code_project', { p_code: code, p_project_id: input });
    if (!d.ok) throw new Error(d.message);
    toast('项目已更新', true);
    loadList(page); loadProjects();
  } catch (e) { toast(e.message, false); }
}
async function resetDevice(code) {
  if (!confirm('确定重置「' + code + '」的绑定？')) return;
  try {
    const d = await SB.rpc('admin_reset', { p_code: code });
    if (!d.ok) throw new Error(d.message);
    toast('已重置绑定', true);
    loadList(page);
  } catch (e) { toast(e.message, false); }
}
async function extend(code) {
  const input = prompt('为「' + code + '」续费，输入天数：\n正数 = 顺延 N 天；0 = 今天到期；负数 = 已到期；永久请填 3650');
  if (input === null) return;
  const days = parseInt(input);
  if (isNaN(days)) { toast('请输入有效的天数', false); return; }
  try {
    const d = await SB.rpc('admin_extend', { p_code: code, p_days: days });
    if (!d.ok) throw new Error(d.message);
    toast(days > 0 ? '已续费 ' + days + ' 天' : (days === 0 ? '已设置为今天到期' : '已设置为已到期（' + (-days) + ' 天）'), true);
    loadList(page); searchRenew(renewPage);
  } catch (e) { toast(e.message, false); }
}

// 回车触发登录
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!document.getElementById('view-login').classList.contains('hide')) doLogin();
});

// 初始化每页下拉的保存值
(function () {
  const sel = document.getElementById('list-page-size');
  if (sel) sel.value = pageSize;
})();
(function () {
  const sel = document.getElementById('list-page-size');
  if (sel) sel.value = pageSize;
})();


// ============ 后台页初始化（未登录跳回前台） ============
(async function () {
  if (!SB.token) { location.href = 'index.html'; return; }
  let t = 'aurora';
  try { t = localStorage.getItem('admin_theme') || 'aurora'; } catch (e) {}
  applyTheme(THEMES[t] ? t : 'aurora');
  document.getElementById('view-main').classList.remove('hide');
  const who = document.getElementById('who-email');
  if (who) { try { who.textContent = localStorage.getItem('admin_email') || ''; } catch (e) {} }
  showMain();
  try {
    const r = await rpcAnon('shop_get_theme', {});
    if (r && r.ok && THEMES[r.theme] && r.theme !== t) applyTheme(r.theme);
  } catch (e) {}
})();
