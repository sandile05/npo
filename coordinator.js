// ============================================
// COORDINATOR.JS — Coordinator dashboard logic
// ============================================

let currentUser = null;
let myGroups = [];
let myVolunteers = [];
let myTasks = [];
let notifications = [];
let currentChatUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth(['coordinator']);
  if (!currentUser) return;
  initEmailJS();
  applyTheme(currentUser.dark_mode ? 'dark' : (localStorage.getItem('vh_theme') || 'dark'));
  document.getElementById('nav-name').textContent = currentUser.full_name || 'Coordinator';
  setAvatarInitial('nav-avatar', currentUser.full_name);
  document.getElementById('coord-greeting').textContent = `Welcome back, ${currentUser.full_name?.split(' ')[0] || 'Coordinator'}.`;
  await Promise.all([loadMyGroups(), loadMyTasks(), loadNotifications()]);
  updateBadges();
  subscribeRealtime();
});

function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => { if (l.textContent.trim().toLowerCase().startsWith(name)) l.classList.add('active'); });
  if (window.innerWidth <= 900) closeNav();
  if (name === 'groups') renderGroups();
  if (name === 'volunteers') renderMyVolunteers();
  if (name === 'tasks') renderTasks();
  if (name === 'messages') loadConversations();
  if (name === 'notifications') renderNotifications();
  if (name === 'settings') { document.getElementById('coord-settings-name').value = currentUser.full_name || ''; document.getElementById('coord-settings-email').value = currentUser.email || ''; }
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
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function loadMyGroups() {
  const { data: groups } = await _supabase.from('groups').select('*').eq('coordinator_id', currentUser.id);
  myGroups = groups || [];
  // Load volunteers for each group
  const allMemberIds = new Set();
  for (const g of myGroups) {
    const { data: members } = await _supabase.from('group_members').select('volunteer_id, volunteer:volunteer_id(*)').eq('group_id', g.id);
    g.members = (members || []).map(m => m.volunteer);
    g.members.forEach(m => m && allMemberIds.add(m.id));
  }
  // Unique volunteers across all groups
  const uniqueMap = new Map();
  myGroups.forEach(g => g.members.forEach(m => m && uniqueMap.set(m.id, m)));
  myVolunteers = Array.from(uniqueMap.values());
  updateStats();
  // Recent activity from notifications
  renderRecentActivity();
}

function updateStats() {
  document.getElementById('stat-volunteers').textContent = myVolunteers.length;
  document.getElementById('stat-groups').textContent = myGroups.length;
  const open = myTasks.filter(t => t.status !== 'completed').length;
  const done = myTasks.filter(t => t.status === 'completed').length;
  document.getElementById('stat-tasks').textContent = open;
  document.getElementById('stat-completed').textContent = done;
}

function renderRecentActivity() {
  const el = document.getElementById('recent-activity');
  if (!notifications.length) { el.innerHTML = `<div class="empty-state"><div class="empty-text">No recent activity</div></div>`; return; }
  el.innerHTML = notifications.slice(0, 5).map(n => `
    <div class="notif-item"><div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
    <div><div class="notif-text">${n.message}</div><div class="notif-time">${timeAgo(n.created_at)}</div></div></div>
  `).join('');
}

function renderGroups() {
  const content = document.getElementById('groups-content');
  if (!myGroups.length) { content.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-text">No groups assigned yet</div></div>`; return; }
  content.innerHTML = myGroups.map(g => `
    <div class="group-section animate-in">
      <div class="group-section-header">
        <div class="group-section-title">${g.name}</div>
        <span class="text-sm text-muted">${g.members.length} member${g.members.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="group-section-body">
        ${g.description ? `<p class="text-sm text-muted" style="margin-bottom:12px;">${g.description}</p>` : ''}
        ${g.members.length ? g.members.map(m => `
          <div class="group-member-row">
            <div class="member-avatar-lg">${(m?.full_name||'?').charAt(0)}</div>
            <div class="member-info">
              <div class="member-name">${m?.full_name || '—'}</div>
              <div class="member-email">${m?.email || ''}</div>
            </div>
            <span class="badge badge-${m?.status || 'pending'}">${m?.status || 'pending'}</span>
            <button class="btn btn-ghost btn-sm" onclick="openCoordChat('${m?.id}','${m?.full_name}')">Message</button>
          </div>
        `).join('') : `<div class="empty-state"><div class="empty-text">No members yet</div></div>`}
      </div>
    </div>
  `).join('');
}

function renderMyVolunteers() {
  const tbody = document.getElementById('my-volunteers-body');
  if (!myVolunteers.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-text">No volunteers in your groups</div></div></td></tr>`; return; }
  tbody.innerHTML = myVolunteers.map(v => {
    const vGroups = myGroups.filter(g => g.members.some(m => m?.id === v.id)).map(g => g.name);
    return `
      <tr>
        <td><div style="display:flex;align-items:center;gap:10px;"><div class="member-avatar-lg" style="width:32px;height:32px;font-size:0.9rem;">${(v.full_name||'?').charAt(0)}</div>${v.full_name}</div></td>
        <td class="text-muted">${v.email}</td>
        <td>${vGroups.map(g => `<span class="badge badge-volunteer" style="margin:2px;">${g}</span>`).join('')}</td>
        <td><span class="badge badge-${v.status}">${v.status}</span></td>
        <td>
          <div class="td-actions">
            <button class="btn btn-ghost btn-sm" onclick="openCoordChat('${v.id}','${v.full_name}')">Message</button>
            <button class="btn btn-primary btn-sm" onclick="prefillTask('${v.id}','${v.full_name}')">Assign Task</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadMyTasks() {
  const volunteerIds = myVolunteers.map(v => v.id);
  if (!volunteerIds.length) { myTasks = []; updateStats(); return; }
  const { data } = await _supabase.from('tasks').select('*, assignee:assigned_to(full_name, email)').in('assigned_to', [...volunteerIds, currentUser.id]).order('created_at', { ascending: false });
  myTasks = data || [];
  updateStats();
}

function renderTasks() {
  const list = document.getElementById('coord-tasks-list');
  if (!myTasks.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No tasks yet</div></div>`; return; }
  list.innerHTML = myTasks.map(t => `
    <div class="task-item animate-in">
      <div class="task-status-dot ${t.status}"></div>
      <div class="task-info">
        <div class="task-title">${t.title}</div>
        <div class="task-meta">
          <span>👤 ${t.assignee?.full_name || '—'}</span>
          <span class="badge badge-${t.status === 'in-progress' ? 'pending' : t.status === 'completed' ? 'approved' : 'pending'}">${t.status}</span>
          ${t.due_date ? `<span>📅 ${formatDate(t.due_date)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function openCreateTaskModal() {
  const sel = document.getElementById('coord-task-assignee');
  sel.innerHTML = `<option value="">— Select Volunteer —</option>` + myVolunteers.map(v => `<option value="${v.id}">${v.full_name}</option>`).join('');
  openModal('modal-coord-task');
}

function prefillTask(userId, name) {
  openCreateTaskModal();
  setTimeout(() => { document.getElementById('coord-task-assignee').value = userId; }, 100);
}

async function createCoordTask() {
  const title = document.getElementById('coord-task-title').value.trim();
  const desc = document.getElementById('coord-task-desc').value.trim();
  const assignee = document.getElementById('coord-task-assignee').value;
  const due = document.getElementById('coord-task-due').value;
  if (!title) { showToast('Title required', 'error'); return; }
  try {
    await _supabase.from('tasks').insert({ title, description: desc, assigned_to: assignee || null, assigned_by: currentUser.id, due_date: due || null });
    if (assignee) {
      const vol = myVolunteers.find(v => v.id === assignee);
      if (vol) await sendTaskAssignedEmail(vol.full_name, vol.email, title);
    }
    showToast('Task assigned!', 'success');
    closeModal('modal-coord-task');
    document.getElementById('coord-task-title').value = '';
    await loadMyTasks(); renderTasks(); updateStats();
  } catch (e) { showToast('Failed to create task', 'error'); }
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
  const list = document.getElementById('coord-conversations');
  if (!convs.length) { list.innerHTML = `<div class="empty-state"><div class="empty-text">No messages yet</div></div>`; return; }
  list.innerHTML = convs.map(c => `
    <div class="message-item ${c.unread ? 'unread' : ''}" onclick="openCoordChat('${c.id}','${c.name}')">
      <div class="message-avatar">${(c.name||'?').charAt(0)}</div>
      <div class="message-preview"><div class="message-sender">${c.name}</div><div class="message-excerpt">${c.lastMsg}</div></div>
      <div class="message-time">${timeAgo(c.time)}</div>
    </div>
  `).join('');
}

async function openCoordChat(userId, userName) {
  currentChatUserId = userId;
  showSection('messages');
  const panel = document.getElementById('coord-chat-panel');
  panel.style.display = 'block';
  document.getElementById('coord-chat-header').textContent = userName;
  await loadCoordChatMessages();
}

async function loadCoordChatMessages() {
  const { data } = await _supabase.from('messages').select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });
  const area = document.getElementById('coord-chat-area');
  area.innerHTML = (data || []).map(m => `
    <div><div class="chat-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}">${m.content}<div class="chat-time">${timeAgo(m.created_at)}</div></div></div>
  `).join('');
  area.scrollTop = area.scrollHeight;
  await _supabase.from('messages').update({ is_read: true }).eq('sender_id', currentChatUserId).eq('receiver_id', currentUser.id);
}

async function sendCoordMessage() {
  const input = document.getElementById('coord-chat-input');
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;
  input.value = '';
  await _supabase.from('messages').insert({ sender_id: currentUser.id, receiver_id: currentChatUserId, content });
  await loadCoordChatMessages();
}

async function loadNotifications() {
  const { data } = await _supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  notifications = data || [];
}

function renderNotifications() {
  const list = document.getElementById('coord-notif-list');
  if (!notifications.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-text">All caught up!</div></div>`; return; }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead('${n.id}', this)">
      <div class="notif-dot ${n.is_read ? 'read' : ''}"></div>
      <div><div class="notif-text">${n.message}</div><div class="notif-time">${timeAgo(n.created_at)}</div></div>
    </div>
  `).join('');
}

async function markNotifRead(id, el) {
  await _supabase.from('notifications').update({ is_read: true }).eq('id', id);
  el.classList.remove('unread');
  el.querySelector('.notif-dot').classList.add('read');
  notifications = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
  updateBadges();
}

async function markAllNotifRead() {
  await _supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
  notifications = notifications.map(n => ({ ...n, is_read: true }));
  renderNotifications(); updateBadges();
}

function updateBadges() {
  const unread = notifications.filter(n => !n.is_read).length;
  const nb = document.getElementById('notif-badge');
  if (nb) { nb.textContent = unread; nb.classList.toggle('hidden', unread === 0); }
}

async function saveCoordProfile() {
  const name = document.getElementById('coord-settings-name').value.trim();
  if (!name) { showToast('Name cannot be empty', 'error'); return; }
  await _supabase.from('users').update({ full_name: name }).eq('id', currentUser.id);
  currentUser.full_name = name;
  document.getElementById('nav-name').textContent = name;
  setAvatarInitial('nav-avatar', name);
  showToast('Profile updated!', 'success');
}

function subscribeRealtime() {
  _supabase.channel('coord-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, async () => {
      await loadNotifications(); updateBadges();
    }).subscribe();
}

async function handleSignOut() { await signOut(); }
