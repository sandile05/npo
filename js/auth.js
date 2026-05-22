// ============================================
// AUTH.JS — All Supabase auth logic lives here
// Shared across all pages
// ============================================

const { createClient } = supabase;
const _supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

// ── Session Management ───────────────────────
async function getSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await _supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  console.log('USER DATA:', data);
  console.log('USER ERROR:', error);
  if (error) return null;
  return data;
}

// ── Route Protection ─────────────────────────
// Call on every protected page
async function requireAuth(allowedRoles = []) {
  const session = await getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    // Redirect to correct dashboard
    redirectToDashboard(user.role);
    return null;
  }
  return user;
}

function redirectToDashboard(role) {
  const map = {
    admin: 'admin.html',
    coordinator: 'coordinator.html',
    volunteer: 'volunteer.html'
  };
  window.location.href = map[role] || 'index.html';
}

// ── Sign Up ──────────────────────────────────
async function signUp(email, password, fullName) {
  const { data, error } = await _supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

// ── Sign In ──────────────────────────────────
async function signIn(email, password) {
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Google Sign In ───────────────────────────
async function signInWithGoogle() {
  const { data, error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/index.html' }
  });
  if (error) throw error;
  return data;
}

// ── Sign Out ─────────────────────────────────
async function signOut() {
  await _supabase.auth.signOut();
  // Clear localStorage theme but keep preference
  window.location.href = 'index.html';
}

// ── Password Reset ───────────────────────────
async function resetPassword(email) {
  const { error } = await _supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/index.html'
  });
  if (error) throw error;
}

// ── Update User Role ─────────────────────────
async function updateUserRole(userId, newRole) {
  const { error } = await _supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', userId);
  if (error) throw error;
}

// ── Update Volunteer Status ──────────────────
async function updateVolunteerStatus(userId, status) {
  const { error } = await _supabase
    .from('users')
    .update({ status })
    .eq('id', userId);
  if (error) throw error;
}

// ── Update Dark Mode Preference ──────────────
async function saveDarkModePreference(userId, darkMode) {
  await _supabase
    .from('users')
    .update({ dark_mode: darkMode })
    .eq('id', userId);
}

// ── Auth State Change ────────────────────────
// Used on login page to redirect if already logged in
async function handleAuthRedirect() {
  const user = await getCurrentUser();
  if (user) redirectToDashboard(user.role);
}
