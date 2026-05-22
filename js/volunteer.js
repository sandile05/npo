// ============================================
// VOLUNTEER.JS — Volunteer dashboard logic
// ============================================

let currentUser = null;
let myGroups = [];
let myTasks = [];
let notifications = [];
let currentChatUserId = null;
let taskFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth(['volunteer']);
  if (!currentUser) return;
  initEmailJS();
  applyTheme(currentUser.dark_mode ? 'dark' : (localStorage.getItem('vh_theme') || 'dark'));

  document.getElementById('nav-name').textContent = currentUser.full_name || 'Volunteer';
  document.getElementById('vol-greeting').textContent = `Hello, ${currentUser.full_name?.split(' ')[0] || 'Volunteer'} 👋`;
  setAvatarInitial('nav-avatar', currentUser.full_name);

  updateStatusBanner(currentUser.status);
  await Promise.all([loadMyGroups(), loadMyTasks(), loadNotifications()]);
  updateStats();
  subscribeRealtime();
});

function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => { if (l.textContent.trim().toLowerCase().startsWith(name)) l.classList.add('active'); });
  if (window.innerWidth <= 900) closeNav();
  if (name === 'groups') renderGroups();
  if (name === 'tasks') renderTasks();
  if (name === 'messages') loadConversations();
  if (name === 'notifications') renderNotifications();
  if (name === 'profile') populateProfile();
}

function toggleNav() {
  document.getElementById('nav-sidebar').classList.toggle('open');
  document.getElementById('nav-overlay').classList.toggle('visible');
}
function closeNav() {
  document.getElementById('nav-sidebar').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('visible');
}
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}
function setAvatarInitial(elId, name) {
  const el = document.getElementById(elId);
  if (el && name) el.textContent = name.charAt(0).toUpperCase();
}
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}
function timeAgo(str) {
  const diff = Date.now() - new Date(str);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function updateStatusBanner(status) {
  const banner = document.getElementById('status-banner');
  const icon = document.getElementById('status-icon');
  const title = document.getElementById('status-title');
  const desc = document.getElementById('status-desc');
  banner.className = `status-banner ${status} animate-in`;
  const map = {
    pending: { icon: '⏳', title: 'Application Pending', desc: 'Your application is under review. We\'ll notify you once a decision is made.' },
    approved: { icon: '✅', title: 'Application Approved', desc: 'Welcome! Your application has been approved. You are now an active volunteer.' },
    rejected: { icon: '❌', title: 'Application Unsuccessful', desc: 'Unfortunately your application was not successful at this time. Please contact us for more information.' }
  };
  const info = map[status] || map.pending;
  icon.textContent = info.icon;
  title.textContent = info.title;
  desc.textContent = info.desc;
}

async function loadMyGroups() {
  const { data: memberships } = await _supabase.from('group_members').select('group_id, group:group_id(*, coordinator:coordinator_id(full_name))').eq('volunteer_id', currentUser.id);
  if (!memberships?.length) { myGroups = []; return; }
  // For each group, get members
  for (const m of memberships) {
    const { data: members } = await _supabase.from('group_members').select('volunteer:volunteer_id(full_name, id)').eq('group_id', m.group_id);
    m.group.members = (members || []).map(x => x.volunteer).filter(v => v && v.id !== currentUser.id);
  }
  myGroups = memberships.map(m => m.group);
}

async function loadMyTasks() {
  const { data } = await _supabase.from('tasks').select('*').eq('assigned_to', currentUser.id).order('created_at', { ascending: false });
  myTasks = data || [];
}

function updateStats() {
  document.getElementById('vol-stat-groups').textContent = myGroups.length;
  document.getElementById('vol-stat-tasks').textContent = myTasks.length;
  document.getElementById('vol-stat-done').textContent = myTasks.filter(t => t.status === 'completed').length;
  document.getElementById('vol-stat-notifs').textContent = notifications.filter(n => !n.is_read).length;
}

function renderGroups() {
  const content = document.getElementById('vol-groups-content');
  if (!myGroups.length) { content.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-text">You haven't been assigned to any groups yet</div></div>`; return; }
  content.innerHTML = myGroups.map(g => `
    <div class="my-group-card animate-in">
      <div class="my-group-name">${g.name}</div>
      <div class="my-group-coordinator">👤 Coordinator: ${g.coordinator?.full_name || 'Unassigned'}</div>
      ${g.description ? `<p class="text-sm text-muted" style="margin-bottom:14px;">${g.description}</p>` : ''}
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Team Members</div>
      <div class="my-group-members">
        ${g.members.length ? g.members.map(m => `
          <div class="teammate-row">
            <div class="teammate-avatar">${(m?.full_name||'?').charAt(0)}</div>
            <div class="teammate-name">${m?.full_name || '—'}</div>
          </div>
        `).join('') : `<div class="text-sm text-muted">No other members yet</div>`}
      </div>
    </div>
  `).join('');
}

function filterTasks(status, btn) {
  taskFilter = status;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

function renderTasks() {
  const grid = document.getElementById('vol-tasks-grid');
  const filtered = taskFilter === 'all' ? myTasks : myTasks.filter(t => t.status === taskFilter);
  if (!filtered.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">✅</div><div class="empty-text">No ${taskFilter === 'all' ? '' : taskFilter} tasks</div></div>`; return; }
  grid.innerHTML = filtered.map(t => {
    const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
    return `
      <div class="task-card animate-in">
        <div class="task-card-header">
          <div class="task-card-title">${t.title}</div>
          <span class="badge badge-${t.status === 'completed' ? 'approved' : t.status === 'in-progress' ? 'pending' : 'rejected'}">${t.status}</span>
        </div>
        ${t.description ? `<div class="task-card-desc">${t.description}</div>` : ''}
        <div class="task-card-footer">
          ${t.due_date ? `<div class="task-due ${isOverdue ? 'overdue' : ''}">📅 ${formatDate(t.due_date)}${isOverdue ? ' · Overdue' : ''}</div>` : '<div></div>'}
          <div style="display:flex;gap:6px;">
            ${t.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="updateTaskStatus('${t.id}','in-progress')">Start</button>` : ''}
            ${t.status === 'in-progress' ? `<button class="btn btn-success btn-sm" onclick="updateTaskStatus('${t.id}','completed')">Complete</button>` : ''}
            ${t.status === 'completed' ? `<span class="text-sm text-success">✓ Done</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function updateTaskStatus(taskId, status) {
  try {
    await _supabase.from('tasks').update({ status }).eq('id', taskId);
    myTasks = myTasks.map(t => t.id === taskId ? { ...t, status } : t);
    renderTasks(); updateStats();
    showToast(status === 'completed' ? 'Task completed! 🎉' : 'Task started!', 'success');
  } catch (e) { showToast('Failed to update task', 'error'); }
}

// Messages
async function loadConversations() {
  const { data } = await _supabase.from('messages').select('*, sender:sender_id(full_name,id), receiver:receiver_id(full_name,id)').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at', { ascending: false });
  const seen = new Set();
  const convs = [];
  (data || []).forEach(m => {
    const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
    const otherName = m.sender_id === currentUser.id ? m.receiver?.full_name : m.sender?.full_name;
    if (!seen.has(otherId)) { seen.add(otherId); convs.push({ id: otherId, name: otherName, lastMsg: m.content, time: m.created_at, unread: !m.is_read && m.receiver_id === currentUser.id }); }
  });
  const list = document.getElementById('vol-conversations');
  if (!convs.length) { list.innerHTML = `<div class="empty-state"><div class="empty-text">No messages yet</div><div class="empty-sub">Your coordinator will reach out here</div></div>`; return; }
  list.innerHTML = convs.map(c => `
    <div class="message-item ${c.unread ? 'unread' : ''}" onclick="openVolChat('${c.id}','${c.name}')">
      <div class="message-avatar">${(c.name||'?').charAt(0)}</div>
      <div class="message-preview"><div class="message-sender">${c.name}</div><div class="message-excerpt">${c.lastMsg}</div></div>
      <div class="message-time">${timeAgo(c.time)}</div>
    </div>
  `).join('');
}

async function openVolChat(userId, userName) {
  currentChatUserId = userId;
  const panel = document.getElementById('vol-chat-panel');
  panel.style.display = 'block';
  document.getElementById('vol-chat-header').textContent = userName;
  await loadVolChatMessages();
}

async function loadVolChatMessages() {
  const { data } = await _supabase.from('messages').select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });
  const area = document.getElementById('vol-chat-area');
  area.innerHTML = (data || []).map(m => `
    <div><div class="chat-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}">${m.content}<div class="chat-time">${timeAgo(m.created_at)}</div></div></div>
  `).join('');
  area.scrollTop = area.scrollHeight;
  await _supabase.from('messages').update({ is_read: true }).eq('sender_id', currentChatUserId).eq('receiver_id', currentUser.id);
}

async function sendVolMessage() {
  const input = document.getElementById('vol-chat-input');
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;
  input.value = '';
  await _supabase.from('messages').insert({ sender_id: currentUser.id, receiver_id: currentChatUserId, content });
  await loadVolChatMessages();
}

async function loadNotifications() {
  const { data } = await _supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  notifications = data || [];
}

function renderNotifications() {
  const list = document.getElementById('vol-notif-list');
  if (!notifications.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-text">All caught up!</div></div>`; return; }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markRead('${n.id}', this)">
      <div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
      <div><div class="notif-text">${n.message}</div><div class="notif-time">${timeAgo(n.created_at)}</div></div>
    </div>
  `).join('');
}

async function markRead(id, el) {
  await _supabase.from('notifications').update({ is_read: true }).eq('id', id);
  el.classList.remove('unread');
  el.querySelector('.notif-dot').classList.add('read');
  notifications = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
  updateBadges();
}

async function markAllRead() {
  await _supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
  notifications = notifications.map(n => ({ ...n, is_read: true }));
  renderNotifications(); updateBadges();
}

function updateBadges() {
  const unread = notifications.filter(n => !n.is_read).length;
  const nb = document.getElementById('notif-badge');
  if (nb) { nb.textContent = unread; nb.classList.toggle('hidden', unread === 0); }
  document.getElementById('vol-stat-notifs').textContent = unread;
}

function populateProfile() {
  document.getElementById('vol-profile-name').value = currentUser.full_name || '';
  document.getElementById('vol-profile-email').value = currentUser.email || '';
  document.getElementById('profile-display-name').textContent = currentUser.full_name || '—';
  document.getElementById('profile-display-email').textContent = currentUser.email || '—';
  setAvatarInitial('profile-avatar-lg', currentUser.full_name);
}

async function saveVolProfile() {
  const name = document.getElementById('vol-profile-name').value.trim();
  const password = document.getElementById('vol-profile-password').value;
  if (!name) { showToast('Name cannot be empty', 'error'); return; }
  try {
    await _supabase.from('users').update({ full_name: name }).eq('id', currentUser.id);
    if (password && password.length >= 8) {
      await _supabase.auth.updateUser({ password });
      showToast('Password updated!', 'success');
    }
    currentUser.full_name = name;
    document.getElementById('nav-name').textContent = name;
    setAvatarInitial('nav-avatar', name);
    setAvatarInitial('profile-avatar-lg', name);
    document.getElementById('profile-display-name').textContent = name;
    showToast('Profile saved!', 'success');
  } catch (e) { showToast('Failed to save', 'error'); }
}

function subscribeRealtime() {
  _supabase.channel('vol-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, async () => {
      await loadNotifications(); updateBadges(); updateStats();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${currentUser.id}` }, async () => {
      await loadMyTasks(); renderTasks(); updateStats();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${currentUser.id}` }, async (payload) => {
      currentUser = { ...currentUser, ...payload.new };
      updateStatusBanner(currentUser.status);
    })
    .subscribe();
}

async function handleSignOut() { await signOut(); }
