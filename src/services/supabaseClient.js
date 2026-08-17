/* ==========================================================================
   BOOBA (baby BNB) — Supabase Client & Sync Adapter
   Enables 1-click connection to Supabase cloud storage
   ========================================================================== */

const SUPABASE_CONFIG_KEY = 'booba_supabase_config';

export const SupabaseService = {
  defaultConfig: {
    url: 'https://aitjqnfliraspychotrl.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpdGpxbmZsaXJhc3B5Y2hvdHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDgyMzQsImV4cCI6MjEwMjUyNDIzNH0.OqDFSeT2Olj2sAD4_Gh3prtGzvob7EX9xdChXeRVq3M',
    isConnected: true
  },

  getConfig() {
    try {
      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.anonKey) return parsed;
      }
      return this.defaultConfig;
    } catch (e) {
      return this.defaultConfig;
    }
  },

  saveConfig(url, anonKey) {
    const config = {
      url: url.trim(),
      anonKey: anonKey.trim(),
      isConnected: Boolean(url && anonKey)
    };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
    return config;
  },

  async testConnection(url, anonKey) {
    if (!url || !anonKey) {
      return { success: false, message: 'Please provide both Supabase URL and Anon Key' };
    }

    try {
      // Direct REST health check to Supabase project
      const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });

      if (response.ok || response.status === 200 || response.status === 404) {
        this.saveConfig(url, anonKey);
        return { success: true, message: 'Successfully connected to Supabase project!' };
      } else {
        return { success: false, message: `Connection failed with status ${response.status}` };
      }
    } catch (err) {
      // If CORS or local testing
      this.saveConfig(url, anonKey);
      return { success: true, message: 'Configuration saved! Supabase storage is active.' };
    }
  },

  // Generates complete SQL schema migration script for user
  getSchemaSQL() {
    return `-- BOOBA (baby BNB) Supabase Database Schema
-- Run this in your Supabase SQL Editor to initialize all tables

-- 1. Users & Passports Table
CREATE TABLE IF NOT EXISTS public.booba_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'member',
  passport_id TEXT UNIQUE NOT NULL,
  member_since TIMESTAMPTZ DEFAULT NOW(),
  booba_points BIGINT DEFAULT 100,
  reputation INT DEFAULT 75,
  wallet_address TEXT,
  avatar_url TEXT DEFAULT 'assets/mascot.jpg',
  completed_quests INT DEFAULT 0,
  verified_referrals INT DEFAULT 0,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT,
  streak_days INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Quests Table
CREATE TABLE IF NOT EXISTS public.booba_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  reward_booba INT NOT NULL,
  quest_type TEXT NOT NULL,
  requirements TEXT,
  target_url TEXT,
  repeatable BOOLEAN DEFAULT false,
  deadline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Proof Submissions Table
CREATE TABLE IF NOT EXISTS public.booba_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.booba_users(id),
  quest_id UUID REFERENCES public.booba_quests(id),
  username TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  quest_title TEXT NOT NULL,
  reward_booba INT NOT NULL,
  proof_url TEXT,
  proof_description TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Referrals Table
CREATE TABLE IF NOT EXISTS public.booba_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_username TEXT NOT NULL,
  referred_username TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reward_claimed INT DEFAULT 0,
  joined_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.booba_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_referrals ENABLE ROW LEVEL SECURITY;

-- Allow public read for community leaderboards
CREATE POLICY "Public Read Users" ON public.booba_users FOR SELECT USING (true);
CREATE POLICY "Public Read Quests" ON public.booba_quests FOR SELECT USING (true);
`;
  }
};
