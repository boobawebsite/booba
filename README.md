# BOOBA (BNB baby) — Gamified Community & Rewards Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![BNB Chain](https://img.shields.io/badge/Network-BNB%20Chain-F3BA2F?logo=binance)](https://bscscan.com)
[![Status: Production](https://img.shields.io/badge/Status-Production%20Ready-emerald)](https://booba.crypto)

**BOOBA** (nickname: **BNB baby**, symbol: **BOOBA**) is a next-generation gamified crypto community & rewards platform built to Google design standards on BNB Smart Chain.

- **Official BEP-20 Contract**: `0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B`
- **BscScan Explorer**: [https://bscscan.com/token/0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B](https://bscscan.com/token/0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B)
- **Total Supply**: 1,000,000,000 $BOOBA (Fixed)
- **Buy / Sell Tax**: 0% / 0% (Zero Tax)

---

## 🌟 Key Features

### 1. The Booba Passport
- **Digital Identity**: Unique passport identifier (`BB-XXXXXX`) automatically minted upon registration.
- **3D Interactive Card**: Holographic sheen, 3D tilt physics, flip-to-back security hash, and 1-click share to X/Twitter.
- **Reputation Score**: Dynamic trust rating (0–100) reflecting verified contributions and genuine referrals.
- **10 Progression Tiers**: From *Booba Baby* (Level 1) to *Booba Master* (Level 10) powered exclusively by **BOOBA points**.

### 2. Unified Auth Portal (Sign Up & Login Together)
- Combined authentication modal with seamless tab switching:
  - **Mint Passport (Sign Up)**: Generates user ID, awards +100 BOOBA welcome token bonus, and processes referral codes (`?ref=CODE`).
  - **Sign In (Login)**: Quick credentials entry or 1-click Web3 wallet connection.
- **Instant Demo Switcher**: 1-click toggle between Member view (`@CryptoKing` - Level 7) and Admin view (`@BoobaBoss`).

### 3. Comprehensive Quest Engine
- **Daily Quests**: Daily check-in (+50 BOOBA) with active streak tracking.
- **Social Quests**: Follow on X, join Telegram lounge, join Discord server.
- **Community Quests**: Attend AMAs, assist newcomers in community chats.
- **Creative Quests**: Submit memes, educational threads, and short videos with live URL/image proof submission modal.

### 4. Admin Management Center
- **Submission Review Queue**: View proof links submitted by community members. Approving a submission automatically awards BOOBA points to the user's passport.
- **Quest Creator**: Mint and publish new community quests on the fly.
- **Citizen Management**: Search users, adjust BOOBA point balances, award bonuses, and monitor anti-fraud referral integrity.

### 5. Referral Growth Engine
- Unique invite links (`https://booba.crypto/invite/USERNAME`) with 1-click copy.
- Comprehensive statistics (Clicks, Registrations, Verified referrals, Pending referrals, BOOBA earned).
- Verified referral checklist to prevent farming and bots.

### 6. Supabase Cloud Integration
- Built-in `SupabaseService` with 1-click configuration UI in Settings.
- Pre-packaged SQL schema migration script for quick database deployment.

---

## 🚀 Getting Started

### Run Locally:
```bash
# Option 1: Using npm
npm run dev

# Option 2: Using Python built-in server
python -m http.server 3000

# Option 3: Simply open index.html in any modern browser!
```

---

## ☁️ Supabase Cloud Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard and run the schema found in the app Settings tab or in `src/services/supabaseClient.js`.
3. In the Booba web app, navigate to **Settings** (`#dashboard/settings`), enter your Supabase URL and Anon Key, and click **Save & Connect Supabase**.

---

## 📦 Push to GitHub

To push this repository to your GitHub:
```bash
git add .
git commit -m "feat: initial release of Booba (baby BNB) gamified platform"
git branch -M main
git remote add origin https://github.com/boobawebsite/booba.git
git push -u origin main
```
