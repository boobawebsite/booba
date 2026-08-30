-- ==========================================================================
-- BOOBA (BNB baby) — Complete Supabase SQL Database Schema
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ==========================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS public.booba_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  username TEXT NOT NULL,
  password_hash TEXT,
  passport_id TEXT UNIQUE NOT NULL,
  wallet_address TEXT,
  booba_points NUMERIC DEFAULT 100,
  streak_days INTEGER DEFAULT 1,
  last_checkin_date TEXT,
  completed_quests JSONB DEFAULT '[]'::jsonb,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  referral_count INTEGER DEFAULT 0,
  reputation INTEGER DEFAULT 50,
  role TEXT DEFAULT 'citizen',
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. QUESTS TABLE
CREATE TABLE IF NOT EXISTS public.booba_quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  reward_booba INTEGER DEFAULT 50,
  category TEXT DEFAULT 'daily',
  type TEXT DEFAULT 'instant',
  action_text TEXT,
  target_url TEXT,
  requirements TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PROOF SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.booba_submissions (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL,
  quest_title TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  proof_link TEXT NOT NULL,
  notes TEXT,
  reward_booba INTEGER DEFAULT 100,
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- 5. WITHDRAWALS TABLE (ON-CHAIN TOKEN BRIDGE LOGS)
CREATE TABLE IF NOT EXISTS public.booba_withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  passport_id TEXT,
  amount NUMERIC NOT NULL,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  explorer_url TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRESALE PURCHASES TABLE (USDT DEPOSITS & $BOOBA ALLOCATIONS)
CREATE TABLE IF NOT EXISTS public.booba_presale_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  passport_id TEXT,
  usdt_amount NUMERIC NOT NULL,
  base_tokens NUMERIC NOT NULL,
  bonus_percent NUMERIC DEFAULT 0,
  bonus_tokens NUMERIC DEFAULT 0,
  total_tokens NUMERIC NOT NULL,
  method TEXT DEFAULT 'web3', -- 'web3' | 'manual'
  tx_hash TEXT NOT NULL,
  explorer_url TEXT,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PLATFORM TELEMETRY & GLOBAL STATS
CREATE TABLE IF NOT EXISTS public.booba_stats (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS
ALTER TABLE public.booba_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_presale_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booba_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for dApp client)
CREATE POLICY "Allow public read users" ON public.booba_users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON public.booba_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON public.booba_users FOR UPDATE USING (true);

CREATE POLICY "Allow public read quests" ON public.booba_quests FOR SELECT USING (true);
CREATE POLICY "Allow public write quests" ON public.booba_quests FOR ALL USING (true);

CREATE POLICY "Allow public read submissions" ON public.booba_submissions FOR SELECT USING (true);
CREATE POLICY "Allow public insert submissions" ON public.booba_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update submissions" ON public.booba_submissions FOR UPDATE USING (true);

CREATE POLICY "Allow public read withdrawals" ON public.booba_withdrawals FOR SELECT USING (true);
CREATE POLICY "Allow public insert withdrawals" ON public.booba_withdrawals FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read presale" ON public.booba_presale_purchases FOR SELECT USING (true);
CREATE POLICY "Allow public insert presale" ON public.booba_presale_purchases FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public stats" ON public.booba_stats FOR ALL USING (true);

-- 9. Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.booba_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booba_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booba_withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booba_presale_purchases;
