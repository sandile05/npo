// ============================================
// THEME.JS — Dark/Light mode logic
// Persists via localStorage + Supabase
// ============================================

const THEME_KEY = 'vh_theme';

function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  // Update all toggle buttons/icons
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    const icon = btn.querySelector('.theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}

function toggleTheme(userId = null) {
  const current = getStoredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  // Save to Supabase if user is logged in
  if (userId && typeof saveDarkModePreference === 'function') {
    saveDarkModePreference(userId, next === 'dark');
  }
}

// Apply theme immediately on page load (before render to avoid flash)
(function () {
  applyTheme(getStoredTheme());
})();
