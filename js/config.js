// ============================================
// CONFIG.JS — Single source of truth
// Replace placeholder values with your real credentials
// This is the ONLY file that changes between demo and production
// ============================================

const CONFIG = {
  supabase: {
    url: 'https://lrnhxdlvolaepjwxdvjo.supabase.co',
    anonKey: 'sb_publishable_CV7p9OyfzA_l_IPhSWNrwQ_nfUlymMU'
  },
  emailjs: {
    publicKey: 'IVCB6fxbznmLUSbRY',
    serviceId: 'service_55tle8t',
    templates: {
      welcome: 'template_skuwpkx',
      approved: 'template_ku1r1dv',
      rejected: 'YOUR_REJECTED_TEMPLATE_ID',
      taskAssigned: 'YOUR_TASK_TEMPLATE_ID',
      groupAssigned: 'YOUR_GROUP_TEMPLATE_ID'
    }
  },
  app: {
    name: 'VolunteerHub',
    tagline: 'Managing impact, together.'
  }
};

