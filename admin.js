// ============================================
// ADMIN.JS — Admin dashboard logic
// ============================================

let currentUser = null;
let allVolunteers = [];
let allGroups = [];
let allTasks = [];
let activeSection = 'overview';
let currentChatUserId = null;
let pendingRoleChange = null;
let selectedGroupId = null;
let realtimeChannel = null;

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await requireAuth(['admin']);
  if (!currentUser) return;

  initEmailJS();
  applyTheme(currentUser.dark_mode ? 'dark' : (localStorage.getItem('vh_theme') || 'dark'));

  document.getElementById('nav-name').textContent = currentUser.full_name || 'Admin';
  setAvatarInitial('nav-avatar', currentUser.full_name);

  await Promise.all([loadStats(), loadVolunteers(), loadGroups(), loadTasks(), loadNotifications()]);
  subscribeRealtime();
  updateBadges();
});

// ── Navigation ────────────────────────────────
function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`).classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => { if (l.textContent.trim().toLowerCase().startsWith(name)) l.classList.add('active'); });
  activeSection = name;
  if (window.innerWidth <= 900) closeNav();
  // Load on demand
  if (name === 'messages') loadConversations();
  if (name === 'notifications') renderNotifications();
  if (name === 'settings') populateSettings();
}

function toggleNav() {
  const sidebar = document.getElementById('nav-sidebar');
  const overlay = document.getElementById('nav-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('visible');
}
function closeNav() {
  document.getElementById('nav-sidebar').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('visible');
}

// ── Helpers ───────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
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

function badgeHtml(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}
function roleBadge(role) {
  return `<span class="badge badge-${role}">${role}</span>`;
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Stats ─────────────────────────────────────
async function loadStats() {
  try {
    const { data: volunteers } = await _supabase.from('users').select('role, status').eq('role', 'volunteer');
    const { data: all } = await _supabase.from('users').select('role');
    const { data: groups } = await _supabase.from('groups').select('id');
    const total = all?.filter(u => u.role !== 'admin').length || 0;
    const pending = volunteers?.filter(v => v.status === 'pending').length || 0;
    const coords = all?.filter(u => u.role === 'coordinator').length || 0;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-groups').textContent = groups?.length || 0;
    document.getElementById('stat-coordinators').textContent = coords;
  } catch (e) { console.error(e); }
}

// ── Volunteers ────────────────────────────────
async function loadVolunteers() {
  try {
    const { data, error } = await _supabase
      .from('users').select('*').neq('role', 'admin').order('created_at', { ascending: false });
    if (error) throw error;
    allVolunteers = data || [];
    renderVolunteers(allVolunteers);
    renderRecentVolunteers(allVolunteers.slice(0, 5));
    updateBadges();
  } catch (e) { console.error(e); }
}

let currentFilter = 'all';

function filterVolunteers() {
  const q = document.getElementById('volunteer-search').value.toLowerCase();
  let filtered = allVolunteers;
  if (currentFilter !== 'all') filtered = filtered.filter(v => v.status === currentFilter);
  if (q) filtered = filtered.filter(v => (v.full_name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q));
  renderVolunteers(filtered);
}

function filterByStatus(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  filterVolunteers();
}

function renderVolunteers(list) {
  const tbody = document.getElementById('volunteers-body');
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No volunteers found</div></div></td></tr>`; return; }
  tbody.innerHTML = list.map(v => `
    <tr>
      <td><div class="volunteer-name-cell"><div class="volunteer-row-avatar">${(v.full_name || '?').charAt(0).toUpperCase()}</div>${v.full_name || '—'}</div></td>
      <td class="text-muted">${v.email}</td>
      <td>${roleBadge(v.role)}</td>
      <td>${badgeHtml(v.status)}</td>
      <td class="text-muted">${formatDate(v.created_at)}</td>
      <td>
        <div class="td-actions">
          ${v.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="approveVolunteer('${v.id}','${v.full_name}','${v.email}')">Approve</button><button class="btn btn-danger btn-sm" onclick="rejectVolunteer('${v.id}','${v.full_name}','${v.email}')">Reject</button>` : ''}
          ${v.role === 'volunteer' ? `<button class="btn btn-ghost btn-sm" onclick="promptRoleChange('${v.id}','${v.full_name}','coordinator')">Promote</button>` : ''}
          ${v.role === 'coordinator' ? `<button class="btn btn-ghost btn-sm" onclick="promptRoleChange('${v.id}','${v.full_name}','volunteer')">Demote</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openChatWith('${v.id}','${v.full_name}')">Message</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderRecentVolunteers(list) {
  const tbody = document.getElementById('recent-volunteers-body');
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-text">No volunteers yet</div></div></td></tr>`; return; }
  tbody.innerHTML = list.map(v => `
    <tr>
      <td><div class="volunteer-name-cell"><div class="volunteer-row-avatar">${(v.full_name||'?').charAt(0).toUpperCase()}</div>${v.full_name||'—'}</div></td>
      <td class="text-muted">${v.email}</td>
      <td>${badgeHtml(v.status)}</td>
      <td class="text-muted">${formatDate(v.created_at)}</td>
      <td>
        <div class="td-actions">
          ${v.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="approveVolunteer('${v.id}','${v.full_name}','${v.email}')">Approve</button><button class="btn btn-danger btn-sm" onclick="rejectVolunteer('${v.id}','${v.full_name}','${v.email}')">Reject</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function approveVolunteer(id, name, email) {
  try {
    await updateVolunteerStatus(id, 'approved');
    await sendApprovedEmail(name, email);
    showToast(`${name} approved!`, 'success');
    await loadVolunteers(); loadStats();
  } catch (e) { showToast('Failed to approve', 'error'); }
}

async function rejectVolunteer(id, name, email) {
  try {
    await updateVolunteerStatus(id, 'rejected');
    await sendRejectedEmail(name, email);
    showToast(`${name} rejected.`, 'info');
    await loadVolunteers(); loadStats();
  } catch (e) { showToast('Failed to reject', 'error'); }
}

// ── Role Change ───────────────────────────────
function promptRoleChange(userId, name, newRole) {
  pendingRoleChange = { userId, newRole };
  document.getElementById('role-modal-title').textContent = newRole === 'coordinator' ? 'Promote to Coordinator' : 'Demote to Volunteer';
  document.getElementById('role-change-info').textContent = newRole === 'coordinator'
    ? `${name} will become a Coordinator and gain access to the Coordinator dashboard.`
    : `${name} will be moved back to Volunteer and lose Coordinator access.`;
  openModal('modal-role-change');
}

async function confirmRoleChange() {
  if (!pendingRoleChange) return;
  try {
    await updateUserRole(pendingRoleChange.userId, pendingRoleChange.newRole);
    showToast('Role updated successfully', 'success');
    closeModal('modal-role-change');
    await loadVolunteers(); loadStats();
  } catch (e) { showToast('Failed to update role', 'error'); }
}

// ── Groups ────────────────────────────────────
async function loadGroups() {
  try {
    const { data, error } = await _supabase.from('groups').select('*, coordinator:coordinator_id(full_name)').order('created_at', { ascending: false });
    if (error) throw error;
    allGroups = data || [];
    renderGroups(allGroups);
    populateCoordinatorSelect();
  } catch (e) { console.error(e); }
}

function renderGroups(groups) {
  const grid = document.getElementById('groups-grid');
  if (!groups.length) { grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🗂️</div><div class="empty-text">No groups yet</div><div class="empty-sub">Create your first group</div></div>`; return; }
  grid.innerHTML = groups.map(g => `
    <div class="group-card animate-in">
      <div class="group-card-header">
        <div class="group-card-name">${g.name}</div>
        <button class="btn btn-ghost btn-sm" onclick="openAssignVolunteersModal('${g.id}')">+ Members</button>
      </div>
      <div class="group-card-desc">${g.description || 'No description'}</div>
      <div class="group-card-meta">
        <span>👤 ${g.coordinator?.full_name || 'No coordinator'}</span>
      </div>
    </div>
  `).join('');
}

function openCreateGroupModal() {
  populateCoordinatorSelect();
  openModal('modal-create-group');
}

function populateCoordinatorSelect() {
  const sel = document.getElementById('new-group-coordinator');
  if (!sel) return;
  const coords = allVolunteers.filter(u => u.role === 'coordinator');
  sel.innerHTML = `<option value="">— Select Coordinator —</option>` + coords.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
}

async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  const desc = document.getElementById('new-group-desc').value.trim();
  const coordId = document.getElementById('new-group-coordinator').value;
  if (!name) { showToast('Group name is required', 'error'); return; }
  try {
    await _supabase.from('groups').insert({ name, description: desc, coordinator_id: coordId || null, created_by: currentUser.id });
    showToast('Group created!', 'success');
    closeModal('modal-create-group');
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-desc').value = '';
    await loadGroups(); loadStats();
  } catch (e) { showToast('Failed to create group', 'error'); }
}

async function openAssignVolunteersModal(groupId) {
  selectedGroupId = groupId;
  // get current members
  const { data: members } = await _supabase.from('group_members').select('volunteer_id').eq('group_id', groupId);
  const memberIds = (members || []).map(m => m.volunteer_id);
  const volunteers = allVolunteers.filter(u => u.role === 'volunteer' && u.status === 'approved');
  const list = document.getElementById('assign-volunteers-list');
  list.innerHTML = volunteers.length
    ? volunteers.map(v => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;background:var(--surface);border:1px solid var(--border);">
          <input type="checkbox" value="${v.id}" ${memberIds.includes(v.id) ? 'checked' : ''} style="accent-color:var(--accent);" />
          <div class="volunteer-row-avatar">${(v.full_name||'?').charAt(0)}</div>
          <span style="font-size:14px;">${v.full_name} <span class="text-muted">(${v.email})</span></span>
        </label>`)
    .join('')
    : `<div class="empty-state"><div class="empty-text">No approved volunteers yet</div></div>`;
  openModal('modal-assign-volunteers');
}

async function assignVolunteersToGroup() {
  const checkboxes = document.querySelectorAll('#assign-volunteers-list input[type=checkbox]');
  const selected = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
  try {
    await _supabase.from('group_members').delete().eq('group_id', selectedGroupId);
    if (selected.length) {
      await _supabase.from('group_members').insert(selected.map(vid => ({ group_id: selectedGroupId, volunteer_id: vid })));
      for (const vid of selected) {
        const vol = allVolunteers.find(v => v.id === vid);
        const group = allGroups.find(g => g.id === selectedGroupId);
        if (vol && group) await sendGroupAssignedEmail(vol.full_name, vol.email, group.name);
      }
    }
    showToast('Members updated!', 'success');
    closeModal('modal-assign-volunteers');
  } catch (e) { showToast('Failed to update members', 'error'); }
}

// ── Tasks ─────────────────────────────────────
async function loadTasks() {
  try {
    const { data, error } = await _supabase.from('tasks').select('*, assignee:assigned_to(full_name), assigner:assigned_by(full_name)').order('created_at', { ascending: false });
    if (error) throw error;
    allTasks = data || [];
    renderTasks(allTasks);
  } catch (e) { console.error(e); }
}

function renderTasks(tasks) {
  const list = document.getElementById('tasks-list');
  if (!tasks.length) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No tasks yet</div></div>`; return; }
  list.innerHTML = tasks.map(t => `
    <div class="task-item animate-in">
      <div class="task-status-dot ${t.status.replace('-','-')}"></div>
      <div class="task-info">
        <div class="task-title">${t.title}</div>
        <div class="task-meta">
          <span>👤 ${t.assignee?.full_name || '—'}</span>
          <span>${badgeHtml(t.status)}</span>
          ${t.due_date ? `<span>📅 ${formatDate(t.due_date)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteTask('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openCreateTaskModal() {
  const sel = document.getElementById('new-task-assignee');
  sel.innerHTML = `<option value="">— Select Person —</option>` + allVolunteers.map(v => `<option value="${v.id}">${v.full_name} (${v.role})</option>`).join('');
  openModal('modal-create-task');
}

async function createTask() {
  const title = document.getElementById('new-task-title').value.trim();
  const desc = document.getElementById('new-task-desc').value.trim();
  const assignee = document.getElementById('new-task-assignee').value;
  const due = document.getElementById('new-task-due').value;
  if (!title) { showToast('Title is required', 'error'); return; }
  try {
    await _supabase.from('tasks').insert({ title, description: desc, assigned_to: assignee || null, assigned_by: currentUser.id, due_date: due || null });
    if (assignee) {
      const vol = allVolunteers.find(v => v.id === assignee);
      if (vol) await sendTaskAssignedEmail(vol.full_name, vol.email, title);
    }
    showToast('Task created!', 'success');
    closeModal('modal-create-task');
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-desc').value = '';
    await loadTasks();
  } catch (e) { showToast('Failed to create task', 'error'); }
}

async function deleteTask(id) {
  try {
    await _supabase.from('tasks').delete().eq('id', id);
    showToast('Task deleted', 'info');
    await loadTasks();
  } catch (e) { showToast('Failed to delete', 'error'); }
}

// ── Messages ──────────────────────────────────
async function loadConversations() {
  const { data } = await _supabase.from('messages').select('*, sender:sender_id(full_name, id), receiver:receiver_id(full_name, id)').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order('created_at', { ascending: false });
  const seen = new Set();
  const conversations = [];
  (data || []).forEach(m => {
    const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
    const otherName = m.sender_id === currentUser.id ? m.receiver?.full_name : m.sender?.full_name;
    if (!seen.has(otherId)) { seen.add(otherId); conversations.push({ id: otherId, name: otherName, lastMsg: m.content, time: m.created_at, unread: !m.is_read && m.receiver_id === currentUser.id }); }
  });
  const list = document.getElementById('conversations-list');
  if (!conversations.length) { list.innerHTML = `<div class="empty-state"><div class="empty-text">No messages yet</div><div class="empty-sub">Message a volunteer from the Volunteers tab</div></div>`; return; }
  list.innerHTML = conversations.map(c => `
    <div class="message-item ${c.unread ? 'unread' : ''}" onclick="openChatWith('${c.id}','${c.name}')">
      <div class="message-avatar">${(c.name||'?').charAt(0)}</div>
      <div class="message-preview"><div class="message-sender">${c.name}</div><div class="message-excerpt">${c.lastMsg}</div></div>
      <div class="message-time">${timeAgo(c.time)}</div>
    </div>
  `).join('');
}

async function openChatWith(userId, userName) {
  currentChatUserId = userId;
  showSection('messages');
  const panel = document.getElementById('chat-panel');
  panel.style.display = 'block';
  document.getElementById('chat-header').textContent = userName;
  await loadChatMessages();
  subscribeToChat();
}

async function loadChatMessages() {
  const { data } = await _supabase.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });
  const area = document.getElementById('chat-area');
  area.innerHTML = (data || []).map(m => `
    <div>
      <div class="chat-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}">${m.content}<div class="chat-time">${timeAgo(m.created_at)}</div></div>
    </div>
  `).join('');
  area.scrollTop = area.scrollHeight;
  // Mark as read
  await _supabase.from('messages').update({ is_read: true }).eq('sender_id', currentChatUserId).eq('receiver_id', currentUser.id);
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || !currentChatUserId) return;
  input.value = '';
  await _supabase.from('messages').insert({ sender_id: currentUser.id, receiver_id: currentChatUserId, content });
  await loadChatMessages();
}

// ── Notifications ─────────────────────────────
let notifications = [];

async function loadNotifications() {
  const { data } = await _supabase.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
  notifications = data || [];
  updateBadges();
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
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
  renderNotifications();
  updateBadges();
}

function updateBadges() {
  const pending = allVolunteers.filter(v => v.status === 'pending').length;
  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  const pb = document.getElementById('pending-badge');
  const nb = document.getElementById('notif-badge');
  if (pb) { pb.textContent = pending; pb.classList.toggle('hidden', pending === 0); }
  if (nb) { nb.textContent = unreadNotifs; nb.classList.toggle('hidden', unreadNotifs === 0); }
}

// ── Settings ──────────────────────────────────
function populateSettings() {
  document.getElementById('settings-name').value = currentUser.full_name || '';
  document.getElementById('settings-email').value = currentUser.email || '';
}

async function saveProfile() {
  const name = document.getElementById('settings-name').value.trim();
  if (!name) { showToast('Name cannot be empty', 'error'); return; }
  try {
    await _supabase.from('users').update({ full_name: name }).eq('id', currentUser.id);
    currentUser.full_name = name;
    document.getElementById('nav-name').textContent = name;
    setAvatarInitial('nav-avatar', name);
    showToast('Profile updated!', 'success');
  } catch (e) { showToast('Failed to update', 'error'); }
}

// ── Realtime ──────────────────────────────────
function subscribeRealtime() {
  realtimeChannel = _supabase.channel('admin-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, async () => {
      await loadVolunteers(); loadStats();
      showToast('New volunteer signed up!', 'info');
      await loadNotifications();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, async () => {
      await loadNotifications(); updateBadges();
    })
    .subscribe();
}

function subscribeToChat() {
  _supabase.channel('chat').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
    if (payload.new.sender_id === currentChatUserId || payload.new.receiver_id === currentChatUserId) {
      await loadChatMessages();
    }
  }).subscribe();
}

// ── Sign Out ──────────────────────────────────
async function handleSignOut() {
  if (realtimeChannel) _supabase.removeChannel(realtimeChannel);
  await signOut();
}
