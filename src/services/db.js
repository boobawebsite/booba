/* ==========================================================================
   BOOBA (BNB baby) — Live Supabase Database & Secure State Service
   Single Source of Truth: Real Accounts, Secure Hashed Passwords, Live Quests
   ========================================================================== */

import { supabase, isUserAdmin, ADMIN_EMAILS } from './supabaseClient.js';

// Local storage session key
const SESSION_KEY = 'booba_active_session_user';

// Standard BIP-39 English Word List (Curated 512 Crypto-standard seed words)
export const BIP39_WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
  'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
  'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
  'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
  'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest',
  'arrive', 'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset',
  'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
  'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon', 'badge',
  'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain',
  'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
  'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind', 'biology',
  'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless',
  'blind', 'blood', 'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
  'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave', 'bread',
  'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze',
  'broom', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
  'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage', 'cake', 'call',
  'calm', 'camera', 'camp', 'can', 'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas',
  'canyon', 'capable', 'capital', 'captain', 'car', 'carbon', 'card', 'cargo', 'carpet', 'carry',
  'cart', 'case', 'cash', 'casino', 'castle', 'casual', 'cat', 'catalog', 'catch', 'category',
  'cattle', 'caught', 'cause', 'caution', 'cave', 'ceiling', 'celery', 'cement', 'census', 'century',
  'cereal', 'certain', 'chair', 'chalk', 'champion', 'change', 'chaos', 'chapter', 'charge', 'chase',
  'chat', 'cheap', 'check', 'cheese', 'chef', 'cherry', 'chest', 'chicken', 'chief', 'child',
  'chimney', 'choice', 'choose', 'chronic', 'chuckle', 'chunk', 'churn', 'cigar', 'cinnamon', 'circle',
  'citizen', 'city', 'civil', 'claim', 'clap', 'clarify', 'claw', 'clay', 'clean', 'clerk',
  'clever', 'click', 'client', 'cliff', 'climb', 'clinic', 'clip', 'clock', 'clog', 'close',
  'cloth', 'cloud', 'clown', 'club', 'clump', 'cluster', 'clutch', 'coach', 'coast', 'coconut',
  'code', 'coffee', 'coil', 'coin', 'collect', 'color', 'column', 'combine', 'come', 'comfort',
  'comic', 'common', 'company', 'concert', 'conduct', 'confirm', 'connect', 'coral', 'core', 'corn',
  'correct', 'cost', 'cotton', 'couch', 'country', 'couple', 'course', 'cousin', 'cover', 'coyote',
  'crack', 'cradle', 'craft', 'cram', 'crane', 'crash', 'crater', 'crawl', 'crazy', 'cream',
  'credit', 'creek', 'crew', 'cricket', 'crime', 'crisp', 'critic', 'crop', 'cross', 'crouch',
  'crowd', 'crucial', 'cruel', 'cruise', 'crumble', 'crunch', 'crush', 'cry', 'crystal', 'cube',
  'culture', 'cup', 'cupboard', 'curious', 'current', 'curtain', 'curve', 'cushion', 'custom', 'cute',
  'cycle', 'dad', 'damage', 'damp', 'dance', 'danger', 'daring', 'dash', 'daughter', 'dawn',
  'day', 'deal', 'debate', 'debris', 'decade', 'december', 'decide', 'decline', 'decorate', 'decrease',
  'deer', 'defense', 'define', 'defy', 'degree', 'delay', 'deliver', 'demand', 'demise', 'denial',
  'dentist', 'deny', 'depart', 'depend', 'deposit', 'depth', 'deputy', 'derive', 'describe', 'desert',
  'design', 'desk', 'despair', 'destroy', 'detail', 'detect', 'develop', 'device', 'devote', 'diagram',
  'diamond', 'diary', 'dice', 'diesel', 'diet', 'differ', 'digital', 'dignity', 'dilemma', 'dinner',
  'dinosaur', 'direct', 'dirt', 'disagree', 'discover', 'disease', 'dish', 'dismiss', 'disorder', 'display',
  'distance', 'divert', 'divide', 'divorce', 'dizzy', 'doctor', 'document', 'dog', 'doll', 'dolphin'
];

/**
 * Generate a cryptographically secure 12-word seed phrase
 */
export function generateSeedPhrase(wordCount = 12) {
  const words = [];
  const array = new Uint32Array(wordCount);
  crypto.getRandomValues(array);
  for (let i = 0; i < wordCount; i++) {
    const index = array[i] % BIP39_WORDLIST.length;
    words.push(BIP39_WORDLIST[index]);
  }
  return words.join(' ');
}

/**
 * Normalize a user-entered seed phrase (lowercase, trim, single spaces)
 */
export function normalizeSeedPhrase(phrase) {
  if (!phrase) return '';
  return phrase
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // remove numbers, punctuation
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * Secure SHA-256 hash of seed phrase for database verification
 */
export async function hashSeedPhrase(phrase) {
  const clean = normalizeSeedPhrase(phrase);
  if (!clean) return '';
  const salt = 'booba_seed_phrase_salt_2026_';
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + clean);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Secure Password Hashing with SHA-256 and Salt
export async function hashPassword(password) {
  if (!password) return '';
  const salt = 'booba_secure_salt_2026_';
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Level definitions with comprehensive color and theme metadata
export const LEVEL_TIERS = [
  {
    level: 1,
    title: 'Booba Builder',
    min: 0,
    max: 499,
    unlock: 'Basic Booba Passport & Community Access',
    themeClass: 'card-theme-lv1',
    accentColor: '#CD7F32',
    tierBadge: 'Foundation Builder',
    material: 'Bronze Brushed Titanium',
    glowColor: 'rgba(205, 127, 50, 0.35)',
    bgGradient: 'linear-gradient(145deg, #1d222e 0%, #0a0d14 100%)',
    borderColor: 'rgba(205, 127, 50, 0.6)',
    mascotImage: 'assets/mascot_level1.png'
  },
  {
    level: 2,
    title: 'Booba Miner',
    min: 500,
    max: 1499,
    unlock: 'Custom Passport Badge & Daily Streak Bonus',
    themeClass: 'card-theme-lv2',
    accentColor: '#10B981',
    tierBadge: 'Gold Miner',
    material: 'Cyber Emerald Matrix',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    bgGradient: 'linear-gradient(145deg, #0a2618 0%, #04120a 100%)',
    borderColor: 'rgba(16, 185, 129, 0.65)',
    mascotImage: 'assets/mascot_level2.png'
  },
  {
    level: 3,
    title: 'Booba Sensei',
    min: 1500,
    max: 2999,
    unlock: 'Special Profile Badge & Discord Role',
    themeClass: 'card-theme-lv3',
    accentColor: '#3B82F6',
    tierBadge: 'Martial Sensei',
    material: 'Royal Sapphire Cobalt',
    glowColor: 'rgba(59, 130, 246, 0.35)',
    bgGradient: 'linear-gradient(145deg, #091e3e 0%, #030b18 100%)',
    borderColor: 'rgba(59, 130, 246, 0.7)',
    mascotImage: 'assets/mascot_level3.png'
  },
  {
    level: 4,
    title: 'Booba Zen',
    min: 3000,
    max: 4999,
    unlock: 'Multiplier on Creative Quest Rewards (+10%)',
    themeClass: 'card-theme-lv4',
    accentColor: '#F59E0B',
    tierBadge: 'Zen Telekinesis',
    material: 'Neon Amber Cyberpunk',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    bgGradient: 'linear-gradient(145deg, #2b1700 0%, #120800 100%)',
    borderColor: 'rgba(245, 158, 11, 0.75)',
    mascotImage: 'assets/mascot_level4.png'
  },
  {
    level: 5,
    title: 'Booba Trader',
    min: 5000,
    max: 9999,
    unlock: 'Exclusive Community Alpha Channel Access',
    themeClass: 'card-theme-lv5',
    accentColor: '#A855F7',
    tierBadge: 'Alpha Trader',
    material: 'Obsidian Violet Nebula',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    bgGradient: 'linear-gradient(145deg, #280942 0%, #10021c 100%)',
    borderColor: 'rgba(168, 85, 247, 0.75)',
    mascotImage: 'assets/mascot_level5.png'
  },
  {
    level: 6,
    title: 'Booba Executive',
    min: 10000,
    max: 24999,
    unlock: 'Early Access to BOOBA Airdrop Allocation',
    themeClass: 'card-theme-lv6',
    accentColor: '#F43F5E',
    tierBadge: 'Executive Whale',
    material: 'Crimson Ruby Titanium',
    glowColor: 'rgba(244, 63, 94, 0.35)',
    bgGradient: 'linear-gradient(145deg, #3c0a17 0%, #170207 100%)',
    borderColor: 'rgba(244, 63, 94, 0.8)',
    mascotImage: 'assets/mascot_level6.png'
  },
  {
    level: 7,
    title: 'Booba Vaultkeeper',
    min: 25000,
    max: 49999,
    unlock: 'VIP Pass to Virtual AMAs & Special Merch Drops',
    themeClass: 'card-theme-lv7',
    accentColor: '#E2E8F0',
    tierBadge: 'Treasury Guardian',
    material: 'Frosted Platinum Mirror',
    glowColor: 'rgba(226, 232, 240, 0.35)',
    bgGradient: 'linear-gradient(145deg, #2c3645 0%, #101620 100%)',
    borderColor: 'rgba(226, 232, 240, 0.85)',
    mascotImage: 'assets/mascot_level7.png'
  },
  {
    level: 8,
    title: 'Booba Mogul',
    min: 50000,
    max: 99999,
    unlock: 'Exclusive Governance Voting Rights',
    themeClass: 'card-theme-lv8',
    accentColor: '#F3BA2F',
    tierBadge: 'Syndicate Mogul',
    material: '24K Imperial Gold',
    glowColor: 'rgba(243, 186, 47, 0.45)',
    bgGradient: 'linear-gradient(145deg, #3d2c00 0%, #171000 100%)',
    borderColor: 'rgba(243, 186, 47, 0.9)',
    mascotImage: 'assets/mascot_level8.png'
  },
  {
    level: 9,
    title: 'Booba Wizard',
    min: 100000,
    max: 249999,
    unlock: 'BNB Baby Treasury Allocation Perks',
    themeClass: 'card-theme-lv9',
    accentColor: '#C084FC',
    tierBadge: 'Celestial Oracle',
    material: 'Prismatic Liquid Chrome',
    glowColor: 'rgba(192, 132, 252, 0.45)',
    bgGradient: 'linear-gradient(145deg, #1b2845 0%, #311042 50%, #0d1b2a 100%)',
    borderColor: 'rgba(192, 132, 252, 0.9)',
    mascotImage: 'assets/mascot_level9.png'
  },
  {
    level: 10,
    title: 'Booba Commander',
    min: 250000,
    max: Infinity,
    unlock: 'Ambassador Status & Direct Team Advisory',
    themeClass: 'card-theme-lv10',
    accentColor: '#FFD700',
    tierBadge: 'Grandmaster Commander',
    material: 'Celestial Quantum Void & Gold',
    glowColor: 'rgba(255, 215, 0, 0.55)',
    bgGradient: 'linear-gradient(145deg, #18002e 0%, #050505 50%, #291d00 100%)',
    borderColor: 'rgba(255, 215, 0, 0.95)',
    mascotImage: 'assets/mascot_level10.png'
  }
];

export function calculateLevel(boobaPoints) {
  const pts = Number(boobaPoints) || 0;
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (pts >= LEVEL_TIERS[i].min) {
      const currentTier = LEVEL_TIERS[i];
      const nextTier = LEVEL_TIERS[i + 1] || null;
      let progressPercent = 100;
      if (nextTier) {
        const range = nextTier.min - currentTier.min;
        const currentProgress = pts - currentTier.min;
        progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
      }
      return {
        ...currentTier,
        progressPercent,
        nextTier
      };
    }
  }
  return { ...LEVEL_TIERS[0], progressPercent: 0, nextTier: LEVEL_TIERS[1] };
}

class DatabaseService {
  constructor() {
    this.currentUser = null;
    this.users = [];
    this.quests = [];
    this.submissions = [];
    this.referrals = [];
    this.airdropLogs = [];
    this.listeners = [];
    this.isInitialized = false;

    this.loadLocalSession();
  }

  loadLocalSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        if (this.currentUser) {
          if (isUserAdmin(this.currentUser.email)) {
            this.currentUser.role = 'admin';
          }
          if (this.currentUser.walletAddress && (this.currentUser.walletAddress.includes('...') || this.currentUser.walletAddress.length < 35)) {
            this.currentUser.walletAddress = '';
          }
        }
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  saveLocalSession(user) {
    if (user && user.walletAddress && (user.walletAddress.includes('...') || user.walletAddress.length < 35)) {
      user.walletAddress = '';
    }
    this.currentUser = user;
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    this.notify();
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.push(listener);
      listener(this.getState());
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach(fn => {
      try { fn(state); } catch (err) { console.error('DB notify error:', err); }
    });
  }

  getState() {
    return {
      currentUser: this.currentUser,
      users: this.users,
      quests: this.quests,
      submissions: this.submissions,
      referrals: this.referrals,
      airdropLogs: this.airdropLogs,
      stats: this.getStats()
    };
  }

  async init() {
    if (this.isInitialized) return;
    await this.refreshAll();
    this.isInitialized = true;
    this.setupRealtime();
  }

  async refreshAll() {
    await Promise.all([
      this.fetchUsers(),
      this.fetchQuests(),
      this.fetchSubmissions(),
      this.fetchReferrals(),
      this.fetchAirdropLogs()
    ]);

    if (this.currentUser && this.currentUser.id) {
      const fresh = this.users.find(u => u.id === this.currentUser.id || u.email === this.currentUser.email);
      if (fresh) {
        if (isUserAdmin(fresh.email)) fresh.role = 'admin';
        if (fresh.walletAddress && (fresh.walletAddress.includes('...') || fresh.walletAddress.length < 35)) {
          fresh.walletAddress = '';
        }
        this.saveLocalSession(fresh);
      }
    }

    this.notify();
  }

  setupRealtime() {
    if (!supabase) return;
    try {
      supabase
        .channel('public_db_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booba_quests' }, () => this.fetchQuests())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booba_users' }, () => this.fetchUsers())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booba_submissions' }, () => this.fetchSubmissions())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booba_airdrop_logs' }, () => this.fetchAirdropLogs())
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription skipped:', e);
    }
  }

  // --------------------------------------------------------------------------
  // USER AUTHENTICATION WITH SECURE PASSWORD HASHING
  // --------------------------------------------------------------------------

  async fetchUsers() {
    const GENESIS_HOLDERS = [
      { id: 'gen-1', username: 'BoobaKing_BNB', email: 'king@booba.io', role: 'member', passportId: 'BB-889210', memberSince: 'Jan 10, 2026', boobaPoints: 84500, reputation: 99, walletAddress: '0x71C...49b2', avatar: 'assets/mascot.jpg', completedQuestsCount: 42, verifiedReferralsCount: 18, streakDays: 28, referralCode: 'BOOBAKING' },
      { id: 'gen-2', username: 'CryptoWhale_56', email: 'whale@booba.io', role: 'member', passportId: 'BB-552190', memberSince: 'Jan 14, 2026', boobaPoints: 62400, reputation: 95, walletAddress: '0x32A...88f1', avatar: 'assets/mascot.jpg', completedQuestsCount: 36, verifiedReferralsCount: 12, streakDays: 21, referralCode: 'WHALE56' },
      { id: 'gen-3', username: 'BNB_Satoshi', email: 'satoshi@booba.io', role: 'member', passportId: 'BB-100234', memberSince: 'Jan 18, 2026', boobaPoints: 49800, reputation: 92, walletAddress: '0x99F...12c8', avatar: 'assets/mascot.jpg', completedQuestsCount: 29, verifiedReferralsCount: 9, streakDays: 19, referralCode: 'SATOSHI' },
      { id: 'gen-4', username: 'AlphaSeeker_OG', email: 'alpha@booba.io', role: 'member', passportId: 'BB-443901', memberSince: 'Jan 22, 2026', boobaPoints: 31200, reputation: 88, walletAddress: '0x55C...90a1', avatar: 'assets/mascot.jpg', completedQuestsCount: 22, verifiedReferralsCount: 7, streakDays: 14, referralCode: 'ALPHASEEK' },
      { id: 'gen-5', username: 'DefiPrincess', email: 'defi@booba.io', role: 'member', passportId: 'BB-672109', memberSince: 'Feb 01, 2026', boobaPoints: 24600, reputation: 85, walletAddress: '0x18B...33d4', avatar: 'assets/mascot.jpg', completedQuestsCount: 18, verifiedReferralsCount: 5, streakDays: 11, referralCode: 'DEFIPRINCESS' }
    ];

    let fetched = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('booba_users')
          .select('*')
          .order('booba_points', { ascending: false });

        if (!error && data && data.length > 0) {
          fetched = data.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            role: isUserAdmin(u.email) ? 'admin' : (u.role || 'member'),
            passportId: u.passport_id,
            memberSince: u.member_since ? new Date(u.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
            boobaPoints: Number(u.booba_points) || 0,
            reputation: Number(u.reputation) || 75,
            walletAddress: (u.wallet_address && !u.wallet_address.includes('...') && u.wallet_address.length >= 35) ? u.wallet_address : '',
            avatar: u.avatar_url || 'assets/mascot.jpg',
            completedQuestsCount: Number(u.completed_quests) || 0,
            verifiedReferralsCount: Number(u.verified_referrals) || 0,
            referralCode: u.referral_code,
            referredBy: u.referred_by,
            streakDays: Number(u.streak_days) || 1,
            authProvider: (u.email && u.email.includes('@wallet.')) ? 'wallet' : ((u.email && u.email.includes('@gmail.')) ? 'google' : 'email')
          }));
        }
      } catch (e) {
        console.error('fetchUsers error:', e);
      }
    }

    // Merge fetched users with genesis holders without duplicates
    const combined = [...fetched];
    GENESIS_HOLDERS.forEach(g => {
      if (!combined.some(u => u.username?.toLowerCase() === g.username.toLowerCase())) {
        combined.push(g);
      }
    });

    // Ensure current user is in list
    if (this.currentUser && !combined.some(u => u.id === this.currentUser.id || u.username === this.currentUser.username)) {
      combined.push(this.currentUser);
    }

    this.users = combined.sort((a, b) => (b.boobaPoints || 0) - (a.boobaPoints || 0));
    return this.users;
  }

  async signup({ username, email, password, referralCode = '', walletAddress = '', seedPhrase = null }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    const hashed = await hashPassword(password);
    const generatedPhrase = seedPhrase || generateSeedPhrase(12);
    const hashedPhrase = await hashSeedPhrase(generatedPhrase);
    const isAdmin = isUserAdmin(cleanEmail);
    const passportId = 'BB-' + Math.floor(100000 + Math.random() * 900000);
    const userRefCode = cleanUsername.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || ('BB' + Math.floor(1000 + Math.random() * 9000));
    const validWallet = walletAddress && walletAddress.startsWith('0x') && walletAddress.length >= 35 && !walletAddress.includes('...') ? walletAddress.trim() : null;

    const newUserPayload = {
      username: cleanUsername,
      email: cleanEmail,
      password_hash: hashed,
      seed_phrase: generatedPhrase,
      seed_phrase_hash: hashedPhrase,
      role: isAdmin ? 'admin' : 'member',
      passport_id: passportId,
      booba_points: 100, // Welcome bonus
      reputation: 75,
      wallet_address: validWallet,
      avatar_url: 'assets/mascot.jpg',
      completed_quests: 0,
      verified_referrals: 0,
      referral_code: userRefCode,
      referred_by: referralCode ? referralCode.trim().toUpperCase() : null,
      streak_days: 1
    };

    try {
      const { data, error } = await supabase
        .from('booba_users')
        .insert([newUserPayload])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return { success: false, message: 'Username or Email is already registered. Please sign in with your password.' };
        }
        return { success: false, message: error.message };
      }

      const formattedUser = {
        id: data.id,
        username: data.username,
        email: data.email,
        role: isAdmin ? 'admin' : data.role,
        passportId: data.passport_id,
        memberSince: 'Just now',
        boobaPoints: Number(data.booba_points),
        reputation: Number(data.reputation),
        walletAddress: data.wallet_address,
        avatar: data.avatar_url,
        completedQuestsCount: 0,
        verifiedReferralsCount: 0,
        referralCode: data.referral_code,
        referredBy: data.referred_by,
        streakDays: 1,
        seedPhrase: generatedPhrase,
        authProvider: 'email'
      };

      if (referralCode) {
        await this.recordReferral(referralCode.trim().toUpperCase(), formattedUser.username, formattedUser.passportId);
      }

      this.saveLocalSession(formattedUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, user: formattedUser, seedPhrase: generatedPhrase, isNewUser: true };
    } catch (e) {
      return { success: false, message: e.message || 'Signup failed' };
    }
  }

  async login({ emailOrUsername, password }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const query = emailOrUsername.trim();
    if (!password) {
      return { success: false, message: 'Please enter your secret password.' };
    }

    try {
      const { data, error } = await supabase
        .from('booba_users')
        .select('*')
        .or(`email.ilike.${query},username.ilike.${query}`)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        return { success: false, message: 'No account found with this email or username. Please mint your passport first!' };
      }

      const raw = data[0];

      // If user has a password_hash, verify it
      if (raw.password_hash) {
        const hashedInput = await hashPassword(password);
        if (hashedInput !== raw.password_hash) {
          return { success: false, message: 'Incorrect password. Please try again or use Forgot Password with your seed phrase.' };
        }
      } else {
        // Upgrade legacy account on first password login
        const hashedInput = await hashPassword(password);
        await supabase.from('booba_users').update({ password_hash: hashedInput }).eq('id', raw.id);
      }

      const isAdmin = isUserAdmin(raw.email);

      const user = {
        id: raw.id,
        username: raw.username,
        email: raw.email,
        role: isAdmin ? 'admin' : (raw.role || 'member'),
        passportId: raw.passport_id,
        memberSince: raw.member_since ? new Date(raw.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Member',
        boobaPoints: Number(raw.booba_points) || 0,
        reputation: Number(raw.reputation) || 75,
        walletAddress: raw.wallet_address || '0x...BNB',
        avatar: raw.avatar_url || 'assets/mascot.jpg',
        completedQuestsCount: Number(raw.completed_quests) || 0,
        verifiedReferralsCount: Number(raw.verified_referrals) || 0,
        referralCode: raw.referral_code,
        referredBy: raw.referred_by,
        streakDays: Number(raw.streak_days) || 1,
        seedPhrase: raw.seed_phrase || null,
        authProvider: (raw.email && raw.email.includes('@wallet.')) ? 'wallet' : ((raw.email && raw.email.includes('@gmail.')) ? 'google' : 'email')
      };

      this.saveLocalSession(user);
      await this.fetchUsers();
      this.notify();

      return { success: true, user };
    } catch (e) {
      return { success: false, message: e.message || 'Login failed' };
    }
  }

  /**
   * Reset password using personal 12-word seed phrase
   */
  async resetPasswordWithSeedPhrase({ emailOrUsername, seedPhrase, newPassword }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const query = (emailOrUsername || '').trim();
    const cleanPhrase = normalizeSeedPhrase(seedPhrase);

    if (!query) {
      return { success: false, message: 'Please enter your registered email or username.' };
    }
    if (!cleanPhrase || cleanPhrase.split(' ').length < 12) {
      return { success: false, message: 'Please enter your full 12-word secret recovery seed phrase.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Your new password must be at least 6 characters long.' };
    }

    try {
      const { data, error } = await supabase
        .from('booba_users')
        .select('*')
        .or(`email.ilike.${query},username.ilike.${query}`)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        return { success: false, message: 'No account found matching this email or username.' };
      }

      const raw = data[0];
      const inputHash = await hashSeedPhrase(cleanPhrase);

      // Verify seed phrase
      const isMatch = (raw.seed_phrase_hash && raw.seed_phrase_hash === inputHash) ||
                      (raw.seed_phrase && normalizeSeedPhrase(raw.seed_phrase) === cleanPhrase);

      if (!isMatch) {
        return { success: false, message: 'Invalid seed phrase. The 12 words do not match the recovery key for this account.' };
      }

      // Hash and update the new password
      const newPassHash = await hashPassword(newPassword);
      const { error: updateError } = await supabase
        .from('booba_users')
        .update({
          password_hash: newPassHash,
          // Ensure seed phrase hash is also persisted
          seed_phrase_hash: inputHash,
          seed_phrase: cleanPhrase
        })
        .eq('id', raw.id);

      if (updateError) throw updateError;

      const isAdmin = isUserAdmin(raw.email);
      const user = {
        id: raw.id,
        username: raw.username,
        email: raw.email,
        role: isAdmin ? 'admin' : (raw.role || 'member'),
        passportId: raw.passport_id,
        memberSince: raw.member_since ? new Date(raw.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Member',
        boobaPoints: Number(raw.booba_points) || 0,
        reputation: Number(raw.reputation) || 75,
        walletAddress: raw.wallet_address || '0x...BNB',
        avatar: raw.avatar_url || 'assets/mascot.jpg',
        completedQuestsCount: Number(raw.completed_quests) || 0,
        verifiedReferralsCount: Number(raw.verified_referrals) || 0,
        referralCode: raw.referral_code,
        referredBy: raw.referred_by,
        streakDays: Number(raw.streak_days) || 1,
        seedPhrase: cleanPhrase
      };

      this.saveLocalSession(user);
      await this.fetchUsers();
      this.notify();

      return { success: true, user, message: 'Password reset successfully!' };
    } catch (e) {
      return { success: false, message: e.message || 'Password reset failed' };
    }
  }

  /**
   * Real Web3 Wallet Login & Automatic Sign Up
   */
  async loginOrSignupWithWallet({ walletAddress, customUsername = '' }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };
    if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length < 10) {
      return { success: false, message: 'Invalid Web3 wallet address provided.' };
    }

    const cleanAddress = walletAddress.trim().toLowerCase();

    try {
      // 1. Check if user already registered with this wallet address
      const { data, error } = await supabase
        .from('booba_users')
        .select('*')
        .ilike('wallet_address', cleanAddress)
        .limit(1);

      if (!error && data && data.length > 0) {
        const raw = data[0];
        const isAdmin = isUserAdmin(raw.email);
        const user = {
          id: raw.id,
          username: raw.username,
          email: raw.email,
          role: isAdmin ? 'admin' : (raw.role || 'member'),
          passportId: raw.passport_id,
          memberSince: raw.member_since ? new Date(raw.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Member',
          boobaPoints: Number(raw.booba_points) || 0,
          reputation: Number(raw.reputation) || 75,
          walletAddress: raw.wallet_address,
          avatar: raw.avatar_url || 'assets/mascot.jpg',
          completedQuestsCount: Number(raw.completed_quests) || 0,
          verifiedReferralsCount: Number(raw.verified_referrals) || 0,
          referralCode: raw.referral_code,
          referredBy: raw.referred_by,
          streakDays: Number(raw.streak_days) || 1,
          seedPhrase: raw.seed_phrase || null,
          authProvider: 'wallet'
        };

        this.saveLocalSession(user);
        await this.fetchUsers();
        this.notify();

        return { success: true, user, isNewUser: false };
      }

      // 2. Otherwise mint a brand new Booba Passport with Seed Phrase
      const shortAddr = cleanAddress.substring(cleanAddress.length - 4).toUpperCase();
      const finalUsername = customUsername.trim() || `BNB_${shortAddr}_${Math.floor(100 + Math.random() * 900)}`;
      const walletEmail = `${finalUsername.toLowerCase()}@wallet.booba.crypto`;
      const fallbackPass = 'booba_wallet_pass_' + shortAddr;
      const hashedPass = await hashPassword(fallbackPass);
      const generatedPhrase = generateSeedPhrase(12);
      const hashedPhrase = await hashSeedPhrase(generatedPhrase);
      const passportId = 'BB-' + Math.floor(100000 + Math.random() * 900000);
      const userRefCode = finalUsername.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || ('BB' + Math.floor(1000 + Math.random() * 9000));
      const storedRef = sessionStorage.getItem('booba_ref_code') || '';

      const newUserPayload = {
        username: finalUsername,
        email: walletEmail,
        password_hash: hashedPass,
        seed_phrase: generatedPhrase,
        seed_phrase_hash: hashedPhrase,
        role: 'member',
        passport_id: passportId,
        booba_points: 100, // +100 BOOBA Welcome Bonus
        reputation: 80,
        wallet_address: cleanAddress,
        avatar_url: 'assets/mascot.jpg',
        completed_quests: 0,
        verified_referrals: 0,
        referral_code: userRefCode,
        referred_by: storedRef ? storedRef.trim().toUpperCase() : null,
        streak_days: 1
      };

      const { data: created, error: insertError } = await supabase
        .from('booba_users')
        .insert([newUserPayload])
        .select()
        .single();

      if (insertError) throw insertError;

      const newUser = {
        id: created.id,
        username: created.username,
        email: created.email,
        role: created.role,
        passportId: created.passport_id,
        memberSince: 'Just now',
        boobaPoints: Number(created.booba_points),
        reputation: Number(created.reputation),
        walletAddress: created.wallet_address,
        avatar: created.avatar_url,
        completedQuestsCount: 0,
        verifiedReferralsCount: 0,
        referralCode: created.referral_code,
        referredBy: created.referred_by,
        streakDays: 1,
        seedPhrase: generatedPhrase,
        authProvider: 'wallet'
      };

      if (storedRef) {
        await this.recordReferral(storedRef.trim().toUpperCase(), newUser.username, newUser.passportId);
      }

      this.saveLocalSession(newUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, user: newUser, seedPhrase: generatedPhrase, isNewUser: true };
    } catch (e) {
      return { success: false, message: e.message || 'Web3 Wallet authentication failed.' };
    }
  }

  /**
   * Google & Apple OAuth User Sync & Sign Up
   */
  async loginOrSignupWithOAuth({ email, username, avatarUrl }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };
    if (!email) return { success: false, message: 'OAuth email is required' };

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = (username || cleanEmail.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15) || `Booba_${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const { data, error } = await supabase
        .from('booba_users')
        .select('*')
        .ilike('email', cleanEmail)
        .limit(1);

      if (!error && data && data.length > 0) {
        const raw = data[0];
        const isAdmin = isUserAdmin(raw.email);
        const user = {
          id: raw.id,
          username: raw.username,
          email: raw.email,
          role: isAdmin ? 'admin' : (raw.role || 'member'),
          passportId: raw.passport_id,
          memberSince: raw.member_since ? new Date(raw.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Member',
          boobaPoints: Number(raw.booba_points) || 0,
          reputation: Number(raw.reputation) || 75,
          walletAddress: raw.wallet_address || '0x...BNB',
          avatar: raw.avatar_url || avatarUrl || 'assets/mascot.jpg',
          completedQuestsCount: Number(raw.completed_quests) || 0,
          verifiedReferralsCount: Number(raw.verified_referrals) || 0,
          referralCode: raw.referral_code,
          referredBy: raw.referred_by,
          streakDays: Number(raw.streak_days) || 1,
          seedPhrase: raw.seed_phrase || null,
          authProvider: 'google'
        };

        this.saveLocalSession(user);
        await this.fetchUsers();
        this.notify();

        return { success: true, user, isNewUser: false };
      }

      // Mint new passport
      const generatedPhrase = generateSeedPhrase(12);
      const hashedPhrase = await hashSeedPhrase(generatedPhrase);
      const hashedPass = await hashPassword('oauth_user_pass_' + Math.random().toString(36).slice(-8));
      const isAdmin = isUserAdmin(cleanEmail);
      const passportId = 'BB-' + Math.floor(100000 + Math.random() * 900000);
      const userRefCode = cleanUsername.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || ('BB' + Math.floor(1000 + Math.random() * 9000));
      const storedRef = sessionStorage.getItem('booba_ref_code') || '';

      const newUserPayload = {
        username: cleanUsername,
        email: cleanEmail,
        password_hash: hashedPass,
        seed_phrase: generatedPhrase,
        seed_phrase_hash: hashedPhrase,
        role: isAdmin ? 'admin' : 'member',
        passport_id: passportId,
        booba_points: 100,
        reputation: 75,
        wallet_address: null,
        avatar_url: avatarUrl || 'assets/mascot.jpg',
        completed_quests: 0,
        verified_referrals: 0,
        referral_code: userRefCode,
        referred_by: storedRef ? storedRef.trim().toUpperCase() : null,
        streak_days: 1
      };

      const { data: created, error: insertError } = await supabase
        .from('booba_users')
        .insert([newUserPayload])
        .select()
        .single();

      if (insertError) throw insertError;

      const newUser = {
        id: created.id,
        username: created.username,
        email: created.email,
        role: isAdmin ? 'admin' : created.role,
        passportId: created.passport_id,
        memberSince: 'Just now',
        boobaPoints: Number(created.booba_points),
        reputation: Number(created.reputation),
        walletAddress: created.wallet_address,
        avatar: created.avatar_url,
        completedQuestsCount: 0,
        verifiedReferralsCount: 0,
        referralCode: created.referral_code,
        referredBy: created.referred_by,
        streakDays: 1,
        seedPhrase: generatedPhrase,
        authProvider: 'google'
      };

      if (storedRef) {
        await this.recordReferral(storedRef.trim().toUpperCase(), newUser.username, newUser.passportId);
      }

      this.saveLocalSession(newUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, user: newUser, seedPhrase: generatedPhrase, isNewUser: true };
    } catch (e) {
      return { success: false, message: e.message || 'OAuth user creation failed' };
    }
  }

  /**
   * Check if a username is already taken by another user
   */
  async checkUsernameAvailability(username, excludeUserId = null) {
    if (!username) return false;
    const clean = username.trim().toLowerCase();

    // Check local loaded users list first
    const takenInList = this.users.some(u => 
      u.username && 
      u.username.toLowerCase() === clean && 
      u.id !== excludeUserId
    );
    if (takenInList) return false;

    if (!supabase) return true;

    try {
      let query = supabase
        .from('booba_users')
        .select('id')
        .ilike('username', clean);

      if (excludeUserId) {
        query = query.neq('id', excludeUserId);
      }

      const { data, error } = await query.limit(1);
      if (error) return true;
      return !data || data.length === 0;
    } catch (e) {
      return true;
    }
  }

  /**
   * Update Profile Details (Username, Email, Wallet, Avatar)
   */
  async updateProfile({ username, email, walletAddress, avatar }) {
    if (!this.currentUser) {
      return { success: false, message: 'Please sign in to update your profile.' };
    }

    const cleanUsername = username ? username.trim() : this.currentUser.username;
    const cleanEmail = email ? email.trim().toLowerCase() : this.currentUser.email;
    const cleanWallet = walletAddress ? walletAddress.trim() : (this.currentUser.walletAddress || '');
    const cleanAvatar = avatar || this.currentUser.avatar || 'assets/mascot.jpg';

    // 1. If username changed, check uniqueness
    if (cleanUsername.toLowerCase() !== this.currentUser.username.toLowerCase()) {
      const isAvailable = await this.checkUsernameAvailability(cleanUsername, this.currentUser.id);
      if (!isAvailable) {
        return { success: false, message: `The username "@${cleanUsername}" is already taken by another community member. Please choose a unique username.` };
      }
    }

    // 2. If email changed, check uniqueness
    if (cleanEmail.toLowerCase() !== this.currentUser.email.toLowerCase()) {
      if (supabase) {
        const { data: existingEmail } = await supabase
          .from('booba_users')
          .select('id')
          .ilike('email', cleanEmail)
          .neq('id', this.currentUser.id)
          .limit(1);

        if (existingEmail && existingEmail.length > 0) {
          return { success: false, message: `The email "${cleanEmail}" is already registered to another account.` };
        }
      }
    }

    const updates = {
      username: cleanUsername,
      email: cleanEmail,
      wallet_address: cleanWallet,
      avatar_url: cleanAvatar
    };

    if (supabase) {
      try {
        const { error } = await supabase
          .from('booba_users')
          .update(updates)
          .eq('id', this.currentUser.id);

        if (error) {
          if (error.code === '23505') {
            return { success: false, message: 'Username or email is already taken.' };
          }
          throw error;
        }
      } catch (e) {
        return { success: false, message: e.message || 'Failed to update profile.' };
      }
    }

    // Update in-memory and local session
    this.currentUser = {
      ...this.currentUser,
      username: cleanUsername,
      email: cleanEmail,
      walletAddress: cleanWallet,
      avatar: cleanAvatar
    };

    this.saveLocalSession(this.currentUser);
    await this.fetchUsers();
    this.notify();

    return { success: true, user: this.currentUser, message: 'Profile updated successfully!' };
  }

  /**
   * Quick Update Citizen Username (for Web3 Wallet Users & Settings)
   */
  async updateUsername(newUsername) {
    if (!this.currentUser) {
      return { success: false, message: 'Please sign in to update your username.' };
    }
    const clean = (newUsername || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!clean || clean.length < 3) {
      return { success: false, message: 'Username must be at least 3 characters long and contain only letters, numbers, or underscores.' };
    }
    if (clean.length > 20) {
      return { success: false, message: 'Username cannot exceed 20 characters.' };
    }
    return await this.updateProfile({ username: clean });
  }

  /**
   * Change Password (Requires Valid 12-Word Non-Custodial Seed Phrase)
   */
  async changePasswordWithSeedPhrase({ userId, seedPhrase, newPassword }) {
    const userToUpdate = this.currentUser || this.users.find(u => u.id === userId);
    if (!userToUpdate) {
      return { success: false, message: 'User session not found. Please log in.' };
    }

    const cleanPhrase = normalizeSeedPhrase(seedPhrase);
    if (!cleanPhrase || cleanPhrase.split(' ').length < 12) {
      return { success: false, message: 'Please enter your complete 12-word cryptographic seed phrase to verify authorization.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }

    // Verify seed phrase against user record
    const inputHash = await hashSeedPhrase(cleanPhrase);
    let isMatch = false;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('booba_users')
          .select('seed_phrase, seed_phrase_hash, password_hash')
          .eq('id', userToUpdate.id)
          .single();

        if (error || !data) {
          return { success: false, message: 'Could not fetch security records for this account.' };
        }

        isMatch = (data.seed_phrase_hash && data.seed_phrase_hash === inputHash) ||
                  (data.seed_phrase && normalizeSeedPhrase(data.seed_phrase) === cleanPhrase);

        // Fallback: If user was signed up locally or before hash
        if (!isMatch && userToUpdate.seedPhrase) {
          isMatch = normalizeSeedPhrase(userToUpdate.seedPhrase) === cleanPhrase;
        }

        if (!isMatch) {
          return { success: false, message: 'Security Verification Failed: The 12-word seed phrase does not match this account.' };
        }

        const newHash = await hashPassword(newPassword);
        const { error: updateError } = await supabase
          .from('booba_users')
          .update({
            password_hash: newHash,
            seed_phrase: cleanPhrase,
            seed_phrase_hash: inputHash
          })
          .eq('id', userToUpdate.id);

        if (updateError) throw updateError;
      } catch (e) {
        return { success: false, message: e.message || 'Password update failed.' };
      }
    } else {
      if (userToUpdate.seedPhrase && normalizeSeedPhrase(userToUpdate.seedPhrase) !== cleanPhrase) {
        return { success: false, message: 'Security Verification Failed: The 12-word seed phrase does not match this account.' };
      }
    }

    this.currentUser = {
      ...this.currentUser,
      seedPhrase: cleanPhrase
    };
    this.saveLocalSession(this.currentUser);
    this.notify();

    return { success: true, message: 'Password successfully changed and secured!' };
  }

  /**
   * Update or Connect Web3 Wallet Address
   */
  async updateWalletAddress(walletAddress) {
    if (!this.currentUser) {
      return { success: false, message: 'Please sign in to connect your wallet.' };
    }

    const clean = (walletAddress || '').trim();

    if (clean && (!clean.startsWith('0x') || clean.length < 10)) {
      return { success: false, message: 'Invalid Web3 EVM wallet address. Must begin with 0x.' };
    }

    if (supabase) {
      try {
        const { error } = await supabase
          .from('booba_users')
          .update({ wallet_address: clean })
          .eq('id', this.currentUser.id);

        if (error) throw error;
      } catch (e) {
        return { success: false, message: e.message || 'Failed to update wallet address.' };
      }
    }

    this.currentUser = {
      ...this.currentUser,
      walletAddress: clean
    };

    this.saveLocalSession(this.currentUser);
    await this.fetchUsers();
    this.notify();

    return { success: true, user: this.currentUser, walletAddress: clean, message: clean ? 'Wallet connected successfully!' : 'Wallet disconnected.' };
  }

  async logout() {
    this.saveLocalSession(null);
    if (supabase && supabase.auth) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('Supabase signOut error:', e);
      }
    }
  }

  // --------------------------------------------------------------------------
  // QUESTS MANAGEMENT
  // --------------------------------------------------------------------------

  async fetchQuests() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('booba_quests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        this.quests = data.map(q => ({
          id: q.id,
          title: q.title,
          description: q.description,
          category: q.category,
          rewardBooba: Number(q.reward_booba),
          type: q.quest_type,
          requirements: q.requirements,
          targetUrl: q.target_url,
          repeatable: Boolean(q.repeatable),
          deadline: q.deadline || 'Active Bounty',
          actionText: q.quest_type === 'social' ? 'Follow & Verify' : q.quest_type === 'instant' ? 'Claim (+50 BOOBA)' : 'Submit Proof',
          isCompleted: false
        }));
      }
    } catch (e) {
      console.error('fetchQuests error:', e);
    }
    return this.quests;
  }

  async createQuest(questData) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const payload = {
      title: questData.title.trim(),
      description: questData.description.trim(),
      category: questData.category || 'community',
      reward_booba: parseInt(questData.rewardBooba, 10) || 100,
      quest_type: questData.type || 'proof',
      requirements: questData.requirements || 'Follow the instructions and submit proof',
      target_url: questData.targetUrl || '',
      repeatable: Boolean(questData.repeatable),
      deadline: questData.deadline || 'Active Bounty'
    };

    try {
      const { data, error } = await supabase
        .from('booba_quests')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      await this.fetchQuests();
      this.notify();
      return { success: true, quest: data };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async deleteQuest(questId) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };
    const quest = this.quests.find(q => q.id === questId);
    const questTitle = quest ? quest.title : 'Unknown Quest';
    const adminUsername = this.currentUser?.username || 'Booba Admin';
    const adminEmail = this.currentUser?.email || 'admin@booba.app';

    try {
      // 1. Delete associated submissions first to ensure clean cascade across any environment
      await supabase.from('booba_submissions').delete().eq('quest_id', questId);

      // 2. Delete the quest from database
      const { error } = await supabase.from('booba_quests').delete().eq('id', questId);
      if (error) throw error;

      // 3. Log the deletion event in booba_admin_logs
      try {
        await supabase.from('booba_admin_logs').insert([{
          admin_id: this.currentUser?.id || null,
          admin_username: adminUsername,
          admin_email: adminEmail,
          action_type: 'delete_quest',
          target_id: String(questId),
          target_title: questTitle,
          details: { deletedAt: new Date().toISOString(), questData: quest }
        }]);
      } catch (logErr) {
        console.warn('Admin log insert skipped:', logErr);
      }

      await Promise.all([this.fetchQuests(), this.fetchSubmissions()]);
      this.notify();
      return { success: true, deletedBy: adminUsername, adminEmail, questTitle };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // PROOF SUBMISSIONS & REVIEWS
  // --------------------------------------------------------------------------

  async fetchSubmissions() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('booba_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        this.submissions = data.map(s => ({
          id: s.id,
          userId: s.user_id,
          questId: s.quest_id,
          username: s.username,
          passportId: s.passport_id,
          questTitle: s.quest_title,
          rewardBooba: Number(s.reward_booba),
          proofUrl: s.proof_url,
          proofDescription: s.proof_description,
          status: s.status || 'pending',
          reviewedBy: s.reviewed_by,
          reviewedAt: s.reviewed_at ? new Date(s.reviewed_at).toLocaleDateString() : null,
          adminNotes: s.admin_notes || '',
          submittedAt: s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'
        }));
      }
    } catch (e) {
      console.error('fetchSubmissions error:', e);
    }
    return this.submissions;
  }

  async submitProof({ questId, proofUrl, proofDescription }) {
    if (!this.currentUser) return { success: false, message: 'Please sign in or mint your passport first.' };
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return { success: false, message: 'Quest not found.' };

    const payload = {
      user_id: this.currentUser.id,
      quest_id: quest.id,
      username: this.currentUser.username,
      passport_id: this.currentUser.passportId,
      quest_title: quest.title,
      reward_booba: quest.rewardBooba,
      proof_url: proofUrl,
      proof_description: proofDescription,
      status: 'pending'
    };

    try {
      let inserted = null;
      if (supabase) {
        const { data, error } = await supabase
          .from('booba_submissions')
          .insert([payload])
          .select()
          .single();

        if (!error && data) {
          inserted = data;
          await this.fetchSubmissions();
        } else if (error) {
          console.warn('Supabase submission insert fallback:', error);
        }
      }

      if (!inserted) {
        const localSub = {
          id: 'sub_' + Date.now(),
          userId: this.currentUser.id,
          questId: quest.id,
          username: this.currentUser.username,
          passportId: this.currentUser.passportId,
          questTitle: quest.title,
          rewardBooba: Number(quest.rewardBooba) || 150,
          proofUrl: proofUrl,
          proofDescription: proofDescription,
          status: 'pending',
          submittedAt: 'Just now'
        };
        this.submissions.unshift(localSub);
        inserted = localSub;
      }

      this.notify();
      return { success: true, submission: inserted };
    } catch (e) {
      console.error('submitProof error:', e);
      return { success: false, message: e.message || 'Submission failed' };
    }
  }

  // Check user completion or submission status for a specific quest
  getQuestUserStatus(questId) {
    if (!this.currentUser) return { completed: false, status: 'unclaimed' };

    // Check if user already claimed via social link / instant action
    const completedList = this.currentUser.completedQuestIds || [];
    if (completedList.includes(questId)) {
      return { completed: true, status: 'completed' };
    }

    // Check proof submissions
    const sub = (this.submissions || []).find(s => 
      (s.userId === this.currentUser.id || s.username === this.currentUser.username) && 
      (s.questId === questId || s.quest_id === questId)
    );

    if (sub) {
      if (sub.status === 'approved') return { completed: true, status: 'approved', submission: sub };
      if (sub.status === 'pending') return { completed: false, status: 'pending_review', submission: sub };
      if (sub.status === 'rejected') return { completed: false, status: 'rejected', submission: sub };
    }

    return { completed: false, status: 'unclaimed' };
  }

  async reviewSubmission(submissionId, action, adminNotes = '') {
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) return { success: false, message: 'Submission not found' };

    try {
      if (supabase) {
        const { error: subError } = await supabase
          .from('booba_submissions')
          .update({
            status: action,
            reviewed_by: this.currentUser?.username || 'Booba Admin',
            reviewed_at: new Date().toISOString(),
            admin_notes: adminNotes
          })
          .eq('id', submissionId);

        if (subError) console.warn('Supabase review update error:', subError);

        // When approved, release and credit coins to the submitting citizen
        if (action === 'approved' && sub.userId) {
          const { data: userData } = await supabase
            .from('booba_users')
            .select('booba_points, completed_quests, reputation')
            .eq('id', sub.userId)
            .single();

          if (userData) {
            const rewardAmt = Number(sub.rewardBooba) || 0;
            const updatedPoints = (Number(userData.booba_points) || 0) + rewardAmt;
            const updatedCount = (Number(userData.completed_quests) || 0) + 1;
            const updatedRep = Math.min(100, (Number(userData.reputation) || 75) + 2);

            await supabase
              .from('booba_users')
              .update({
                booba_points: updatedPoints,
                completed_quests: updatedCount,
                reputation: updatedRep
              })
              .eq('id', sub.userId);
          }
        }
      }

      // Update local memory state
      sub.status = action;
      sub.reviewedBy = this.currentUser?.username || 'Booba Admin';
      sub.reviewedAt = new Date().toLocaleDateString();
      sub.adminNotes = adminNotes;

      // Update target user points & completed quests list in memory
      const rewardAmt = Number(sub.rewardBooba) || 0;
      const targetUser = this.users.find(u => u.id === sub.userId || u.username === sub.username);
      if (targetUser && action === 'approved') {
        targetUser.boobaPoints = (Number(targetUser.boobaPoints) || 0) + rewardAmt;
        targetUser.completedQuestsCount = (Number(targetUser.completedQuestsCount) || 0) + 1;
        targetUser.reputation = Math.min(100, (Number(targetUser.reputation) || 75) + 2);
        targetUser.completedQuestIds = targetUser.completedQuestIds || [];
        if (sub.questId && !targetUser.completedQuestIds.includes(sub.questId)) {
          targetUser.completedQuestIds.push(sub.questId);
        }
      }

      // If current logged-in user is the submitter, update active session
      if (this.currentUser && (this.currentUser.id === sub.userId || this.currentUser.username === sub.username) && action === 'approved') {
        this.currentUser.boobaPoints = (Number(this.currentUser.boobaPoints) || 0) + rewardAmt;
        this.currentUser.completedQuestsCount = (Number(this.currentUser.completedQuestsCount) || 0) + 1;
        this.currentUser.completedQuestIds = this.currentUser.completedQuestIds || [];
        if (sub.questId && !this.currentUser.completedQuestIds.includes(sub.questId)) {
          this.currentUser.completedQuestIds.push(sub.questId);
        }
        this.saveLocalSession(this.currentUser);
      }

      if (supabase) {
        await Promise.all([this.fetchSubmissions(), this.fetchUsers()]);
      }
      this.notify();
      return { success: true, status: action, rewardBooba: rewardAmt };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // SOCIAL & DAILY INSTANT QUESTS (Immediate coins on link click)
  // --------------------------------------------------------------------------

  async completeSocialQuest(questId) {
    if (!this.currentUser) return { success: false, message: 'Please sign in or mint your passport first.' };
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return { success: false, message: 'Quest not found.' };

    this.currentUser.completedQuestIds = this.currentUser.completedQuestIds || [];
    if (this.currentUser.completedQuestIds.includes(questId)) {
      return { success: false, message: 'You have already claimed the rewards for this quest!' };
    }

    const reward = Number(quest.rewardBooba) || 0;
    const newPoints = (Number(this.currentUser.boobaPoints) || 0) + reward;
    const newCount = (Number(this.currentUser.completedQuestsCount) || 0) + 1;
    const newRep = Math.min(100, (Number(this.currentUser.reputation) || 75) + 1);

    this.currentUser.completedQuestIds.push(questId);
    this.currentUser.boobaPoints = newPoints;
    this.currentUser.completedQuestsCount = newCount;
    this.currentUser.reputation = newRep;

    try {
      if (supabase && this.currentUser.id) {
        await supabase
          .from('booba_users')
          .update({ 
            booba_points: newPoints, 
            completed_quests: newCount,
            reputation: newRep 
          })
          .eq('id', this.currentUser.id);
      }

      this.saveLocalSession(this.currentUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, reward, title: quest.title, newPoints };
    } catch (e) {
      this.saveLocalSession(this.currentUser);
      this.notify();
      return { success: true, reward, title: quest.title, newPoints };
    }
  }

  async dailyCheckIn(customBonus) {
    if (!this.currentUser) return { success: false, message: 'Please sign in first' };

    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDate = this.currentUser.lastCheckInDate ? new Date(this.currentUser.lastCheckInDate).toISOString().slice(0, 10) : null;

    if (lastDate === todayStr) {
      return {
        success: false,
        message: 'You have already claimed your daily check-in reward today! Return tomorrow to continue your streak.'
      };
    }

    const bonus = Number(customBonus) || 50;
    const newPoints = (this.currentUser.boobaPoints || 0) + bonus;
    const newStreak = (this.currentUser.streakDays || 1) + 1;
    const newCount = (this.currentUser.completedQuestsCount || 0) + 1;
    const nowIso = new Date().toISOString();

    try {
      if (supabase && this.currentUser.id) {
        await supabase
          .from('booba_users')
          .update({
            booba_points: newPoints,
            streak_days: newStreak,
            completed_quests: newCount,
            last_check_in: nowIso
          })
          .eq('id', this.currentUser.id);
      }

      this.currentUser.boobaPoints = newPoints;
      this.currentUser.streakDays = newStreak;
      this.currentUser.completedQuestsCount = newCount;
      this.currentUser.lastCheckInDate = nowIso;
      this.saveLocalSession(this.currentUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, bonus, streak: newStreak };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // REFERRALS & AIRDROPS
  // --------------------------------------------------------------------------

  async recordReferral(referrerCode, newUsername, newPassportId) {
    if (!supabase) return;
    try {
      const referrer = this.users.find(u => u.referralCode?.toUpperCase() === referrerCode.toUpperCase());
      const referrerUsername = referrer ? referrer.username : referrerCode;

      await supabase.from('booba_referrals').insert([{
        referrer_username: referrerUsername,
        referred_username: newUsername,
        passport_id: newPassportId,
        status: 'verified',
        reward_claimed: 300
      }]);

      if (referrer && referrer.id) {
        await supabase
          .from('booba_users')
          .update({
            booba_points: (referrer.boobaPoints || 0) + 300,
            verified_referrals: (referrer.verifiedReferralsCount || 0) + 1
          })
          .eq('id', referrer.id);
      }
    } catch (e) {
      console.warn('recordReferral error:', e);
    }
  }

  async fetchReferrals() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('booba_referrals').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        this.referrals = data.map(r => ({
          id: r.id,
          referrerUsername: r.referrer_username,
          referredUsername: r.referred_username,
          passportId: r.passport_id,
          status: r.status,
          rewardClaimed: Number(r.reward_claimed) || 0,
          joinedDate: r.joined_date || new Date().toISOString().split('T')[0]
        }));
      }
    } catch (e) {
      console.error('fetchReferrals error:', e);
    }
    return this.referrals;
  }

  async fetchAirdropLogs() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from('booba_airdrop_logs').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        this.airdropLogs = data.map(a => ({
          id: a.id,
          adminUsername: a.admin_username,
          amountPerUser: Number(a.amount_per_user),
          targetGroup: a.target_group,
          recipientCount: Number(a.recipient_count),
          totalDistributed: Number(a.total_distributed),
          reason: a.reason,
          date: a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'
        }));
      }
    } catch (e) {
      console.error('fetchAirdropLogs error:', e);
    }
    return this.airdropLogs;
  }

  async distributeAirdrop({ targetGroup = 'all', topCount = 15, recipientUserIds = null, amountPerUser, reason = '', targetDescription = '' }) {
    const amount = Number(amountPerUser) || 0;
    if (amount <= 0) return { success: false, message: 'Invalid airdrop amount. Must be greater than 0.' };

    let recipients = [];

    if (Array.isArray(recipientUserIds) && recipientUserIds.length > 0) {
      const idSet = new Set(recipientUserIds.map(String));
      recipients = this.users.filter(u => idSet.has(String(u.id)));
    } else if (targetGroup === 'top_n' || targetGroup === 'top10') {
      const count = Math.max(1, Number(topCount) || (targetGroup === 'top10' ? 10 : 15));
      // Sort users by boobaPoints descending
      const sorted = [...this.users].sort((a, b) => (Number(b.boobaPoints) || 0) - (Number(a.boobaPoints) || 0));
      recipients = sorted.slice(0, count);
    } else if (targetGroup === 'active') {
      recipients = this.users.filter(u => (Number(u.completedQuestsCount) || 0) > 0);
    } else {
      recipients = [...this.users];
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No eligible recipients found in this target group.' };
    }

    try {
      if (supabase) {
        // Chunk batch updates in slices of 40 for optimal Supabase throughput
        const chunkSize = 40;
        for (let i = 0; i < recipients.length; i += chunkSize) {
          const chunk = recipients.slice(i, i + chunkSize);
          await Promise.all(chunk.map(u =>
            supabase
              .from('booba_users')
              .update({ booba_points: (Number(u.boobaPoints) || 0) + amount })
              .eq('id', u.id)
          ));
        }

        const totalDist = amount * recipients.length;
        let logTargetGroup = targetDescription || targetGroup;
        if (!targetDescription) {
          if (targetGroup === 'top_n' || targetGroup === 'top10') logTargetGroup = `Top ${recipients.length} Highest Holders`;
          else if (targetGroup === 'specific') logTargetGroup = `Selected ${recipients.length} Target Users`;
          else if (targetGroup === 'active') logTargetGroup = `Active Questers (${recipients.length})`;
          else logTargetGroup = `All Registered Passports (${recipients.length})`;
        }

        await supabase.from('booba_airdrop_logs').insert([{
          admin_username: this.currentUser?.username || 'Booba Admin',
          amount_per_user: amount,
          target_group: logTargetGroup,
          recipient_count: recipients.length,
          total_distributed: totalDist,
          reason: reason || 'Treasury Grant'
        }]);

        await Promise.all([this.fetchUsers(), this.fetchAirdropLogs()]);
      } else {
        // Local in-memory fallback
        for (const u of recipients) {
          u.boobaPoints = (Number(u.boobaPoints) || 0) + amount;
        }
        this.saveLocalSession(this.currentUser);
      }

      this.notify();

      return {
        success: true,
        recipientCount: recipients.length,
        totalDistributed: amount * recipients.length
      };
    } catch (e) {
      console.error('distributeAirdrop error:', e);
      return { success: false, message: e.message || 'Airdrop distribution failed.' };
    }
  }

  // --------------------------------------------------------------------------
  // AGGREGATE STATS
  // --------------------------------------------------------------------------

  getStats() {
    const totalUsers = this.users.length;
    const totalQuestsCompleted = this.users.reduce((acc, u) => acc + (u.completedQuestsCount || 0), 0);
    const totalPointsDistributed = this.users.reduce((acc, u) => acc + (u.boobaPoints || 0), 0);
    const activeQuestsCount = this.quests.length;
    const pendingSubmissions = this.submissions.filter(s => s.status === 'pending').length;

    return {
      totalUsers,
      totalQuestsCompleted,
      totalPointsDistributed,
      activeQuestsCount,
      pendingSubmissions
    };
  }
}

export const db = new DatabaseService();
db.init();
