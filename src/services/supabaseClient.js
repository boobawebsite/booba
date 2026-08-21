/* ==========================================================================
   BOOBA (baby BNB) — Supabase Client & Live Realtime Database Service
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

export const SUPABASE_URL = 'https://aitjqnfliraspychotrl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpdGpxbmZsaXJhc3B5Y2hvdHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDgyMzQsImV4cCI6MjEwMjUyNDIzNH0.OqDFSeT2Olj2sAD4_Gh3prtGzvob7EX9xdChXeRVq3M';

// ==========================================================================
// ADMIN EMAIL WHITELIST
// Add any emails here that should automatically have full Admin rights!
// ==========================================================================
export const ADMIN_EMAILS = [
  'admin@gmail.com',
  'boobawebsite@gmail.com'
];

/**
 * Checks if a given email or user object has admin privileges
 */
export function isUserAdmin(emailOrUser) {
  if (!emailOrUser) return false;
  if (typeof emailOrUser === 'string') {
    const email = emailOrUser.toLowerCase().trim();
    return ADMIN_EMAILS.some(e => e.toLowerCase() === email);
  }
  if (emailOrUser.role === 'admin') return true;
  if (emailOrUser.email && ADMIN_EMAILS.some(e => e.toLowerCase() === emailOrUser.email.toLowerCase().trim())) {
    return true;
  }
  return false;
}

// Initialize Supabase Client
let clientInstance = null;

try {
  if (typeof createClient === 'function') {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } else if (window.supabase?.createClient) {
    clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.warn('[Supabase] Init error:', err);
}

export const supabase = clientInstance;

export const SupabaseService = {
  client: supabase,
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  adminEmails: ADMIN_EMAILS,
  isAdmin: isUserAdmin,

  async testConnection() {
    try {
      if (!supabase) return { success: false, message: 'Supabase client not initialized' };
      const { data, error } = await supabase.from('booba_quests').select('id').limit(1);
      if (error) throw error;
      return { success: true, message: 'Connected to Supabase live database' };
    } catch (e) {
      return { success: false, message: e.message || 'Connection failed' };
    }
  }
};
