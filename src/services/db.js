/* ==========================================================================
   BOOBA (BNB baby) — Database & State Management Service
   Supports LocalStorage persistence + Real-time events + Supabase bridge
   ========================================================================== */

const STORAGE_KEYS = {
  CURRENT_USER: 'booba_current_user',
  USERS: 'booba_users_data',
  QUESTS: 'booba_quests_data',
  SUBMISSIONS: 'booba_submissions_data',
  REFERRALS: 'booba_referrals_data',
  ACHIEVEMENTS: 'booba_achievements_data',
  SETTINGS: 'booba_settings_data'
};

// Level definitions based on user specification
export const LEVEL_TIERS = [
  { level: 1, title: 'Booba Baby', min: 0, max: 499, unlock: 'Basic Booba Passport & Community Access' },
  { level: 2, title: 'Booba Rookie', min: 500, max: 1499, unlock: 'Custom Passport Badge & Daily Streak Bonus' },
  { level: 3, title: 'Booba Starter', min: 1500, max: 2999, unlock: 'Special Profile Badge & Discord Role' },
  { level: 4, title: 'Booba Hustler', min: 3000, max: 4999, unlock: 'Multiplier on Creative Quest Rewards (+10%)' },
  { level: 5, title: 'Booba Grinder', min: 5000, max: 9999, unlock: 'Exclusive Community Alpha Channel Access' },
  { level: 6, title: 'Booba Warrior', min: 10000, max: 24999, unlock: 'Early Access to BOOBA Airdrop Allocation' },
  { level: 7, title: 'Booba Elite', min: 25000, max: 49999, unlock: 'VIP Pass to Virtual AMAs & Special Merch Drops' },
  { level: 8, title: 'Booba Legend', min: 50000, max: 99999, unlock: 'Exclusive Governance Voting Rights' },
  { level: 9, title: 'Booba OG', min: 100000, max: 249999, unlock: 'BNB Baby Treasury Allocation Perks' },
  { level: 10, title: 'Booba Master', min: 250000, max: Infinity, unlock: 'Ambassador Status & Direct Team Advisory' }
];

export function calculateLevel(boobaPoints) {
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (boobaPoints >= LEVEL_TIERS[i].min) {
      const currentTier = LEVEL_TIERS[i];
      const nextTier = LEVEL_TIERS[i + 1] || null;
      let progressPercent = 100;
      if (nextTier) {
        const range = nextTier.min - currentTier.min;
        const currentProgress = boobaPoints - currentTier.min;
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

// Initial Seed Data
const INITIAL_USERS = [
  {
    id: 'usr-001',
    username: 'CryptoKing',
    email: 'user@example.com',
    role: 'member',
    passportId: 'BB-008421',
    memberSince: 'August 15, 2026',
    boobaPoints: 28450,
    reputation: 91,
    walletAddress: '0x71C...49b2',
    avatar: 'assets/mascot.jpg',
    completedQuestsCount: 96,
    verifiedReferralsCount: 42,
    referralCode: 'CRYPTOKING',
    referredBy: 'BOOBABOSS',
    lastCheckIn: null,
    streakDays: 7,
    badges: ['Pioneer', 'Meme Champion', 'Elite Referrer', 'Whale Scout', 'BNB Baby OG']
  },
  {
    id: 'usr-002',
    username: 'BoobaBoss',
    email: 'admin@gmail.com',
    password: 'booba',
    role: 'admin',
    passportId: 'BB-000001',
    memberSince: 'January 01, 2026',
    boobaPoints: 265000,
    reputation: 99,
    walletAddress: '0x88A...33f1',
    avatar: 'assets/mascot.jpg',
    completedQuestsCount: 150,
    verifiedReferralsCount: 180,
    referralCode: 'BOOBABOSS',
    referredBy: null,
    lastCheckIn: null,
    streakDays: 45,
    badges: ['Project Founder', 'BNB Baby Architect', 'Grandmaster', 'Top Influencer']
  },
  {
    id: 'usr-003',
    username: 'BabyWhale',
    email: 'whale@bsc.crypto',
    role: 'member',
    passportId: 'BB-001290',
    memberSince: 'March 10, 2026',
    boobaPoints: 85200,
    reputation: 95,
    walletAddress: '0x32A...88bc',
    avatar: 'assets/mascot.jpg',
    completedQuestsCount: 88,
    verifiedReferralsCount: 76,
    referralCode: 'BABYWHALE',
    referredBy: 'BOOBABOSS',
    streakDays: 14,
    badges: ['Whale Scout', 'Elite Referrer']
  },
  {
    id: 'usr-004',
    username: 'PandaHodler',
    email: 'panda@crypto.org',
    role: 'member',
    passportId: 'BB-003418',
    memberSince: 'April 02, 2026',
    boobaPoints: 48900,
    reputation: 89,
    walletAddress: '0x99B...12ca',
    avatar: 'assets/mascot.jpg',
    completedQuestsCount: 72,
    verifiedReferralsCount: 34,
    referralCode: 'PANDAHODL',
    referredBy: 'CRYPTOKING',
    streakDays: 5,
    badges: ['Meme Champion', 'Community Helper']
  },
  {
    id: 'usr-005',
    username: 'BNBQueen',
    email: 'queen@web3.io',
    role: 'member',
    passportId: 'BB-005112',
    memberSince: 'May 18, 2026',
    boobaPoints: 34200,
    reputation: 92,
    walletAddress: '0x55E...90ea',
    avatar: 'assets/mascot.jpg',
    completedQuestsCount: 59,
    verifiedReferralsCount: 29,
    referralCode: 'BNBQUEEN',
    referredBy: 'CRYPTOKING',
    streakDays: 9,
    badges: ['Community Star', 'Content Creator']
  }
];

const INITIAL_QUESTS = [
  {
    id: 'qst-1',
    title: 'Daily Booba Check-in',
    description: 'Claim your daily check-in reward and keep your BNB Baby streak alive!',
    category: 'daily',
    rewardBooba: 50,
    type: 'instant',
    requirements: 'Click once every 24 hours to earn BOOBA and level up your passport.',
    repeatable: true,
    deadline: 'Refreshes Daily',
    actionText: 'Check In (+50 BOOBA)',
    isCompleted: false
  },
  {
    id: 'qst-2',
    title: 'Follow Official @BoobaBabyBNB on X',
    description: 'Follow our official X handle to stay tuned with all major announcements and airdrops.',
    category: 'social',
    rewardBooba: 100,
    type: 'social',
    requirements: 'Follow @BoobaBabyBNB and enter your X handle to verify.',
    targetUrl: 'https://twitter.com/boobababybnb',
    repeatable: false,
    deadline: 'Permanent Bounty',
    actionText: 'Follow & Verify',
    isCompleted: true
  },
  {
    id: 'qst-3',
    title: 'Join the Official Booba Telegram',
    description: 'Enter the bustling Booba Panda lounge on Telegram to chat with the team and fellow holders.',
    category: 'social',
    rewardBooba: 150,
    type: 'social',
    requirements: 'Join t.me/boobababybnb and pass the anti-bot verification.',
    targetUrl: 'https://t.me/boobababybnb',
    repeatable: false,
    deadline: 'Permanent Bounty',
    actionText: 'Join Telegram',
    isCompleted: true
  },
  {
    id: 'qst-4',
    title: 'Join the Booba Discord Community',
    description: 'Hang out in Discord, claim your verified Passport role, and join voice stage AMAs.',
    category: 'social',
    rewardBooba: 150,
    type: 'social',
    requirements: 'Join discord.gg/booba and verify your Booba Passport ID.',
    targetUrl: 'https://discord.gg/booba',
    repeatable: false,
    deadline: 'Permanent Bounty',
    actionText: 'Join Discord',
    isCompleted: false
  },
  {
    id: 'qst-5',
    title: 'Attend the Weekly Community AMA',
    description: 'Join our weekly Twitter Space or Discord Stage AMA with the core founders.',
    category: 'community',
    rewardBooba: 250,
    type: 'proof',
    requirements: 'Submit your live AMA attendance secret code or screenshot.',
    repeatable: true,
    deadline: 'Every Thursday 18:00 UTC',
    actionText: 'Submit Attendance Code',
    isCompleted: false
  },
  {
    id: 'qst-6',
    title: 'Help Answer Questions in Community',
    description: 'Help onboard new baby pandas in Telegram or Discord and guide them to mint their passport.',
    category: 'community',
    rewardBooba: 200,
    type: 'proof',
    requirements: 'Submit a screenshot or link of you assisting community members.',
    repeatable: true,
    deadline: 'Weekly Bounty',
    actionText: 'Submit Proof',
    isCompleted: false
  },
  {
    id: 'qst-7',
    title: 'Create a Viral Booba Meme',
    description: 'Design a hilarious, high-quality meme featuring the Booba baby panda mascot and share on X.',
    category: 'creative',
    rewardBooba: 500,
    type: 'proof',
    requirements: 'Post on X with tags #BOOBA #babyBNB @BoobaBabyBNB and submit your post link.',
    repeatable: true,
    deadline: 'Open Submission',
    actionText: 'Submit Meme Link',
    isCompleted: false
  },
  {
    id: 'qst-8',
    title: 'Write an Educational X Thread on Booba',
    description: 'Craft an insightful thread explaining the Booba Passport, tokenomics, and BNB Baby ecosystem.',
    category: 'creative',
    rewardBooba: 600,
    type: 'proof',
    requirements: 'Minimum 4-tweet thread with graphics/charts and post link submitted.',
    repeatable: true,
    deadline: 'Open Submission',
    actionText: 'Submit Thread Link',
    isCompleted: false
  },
  {
    id: 'qst-9',
    title: 'Produce a Booba TikTok / Reels / YouTube Short',
    description: 'Create an engaging short video animation or review of Booba BNB Baby.',
    category: 'creative',
    rewardBooba: 750,
    type: 'proof',
    requirements: 'Upload video to TikTok/YouTube/Instagram and provide live link.',
    repeatable: true,
    deadline: 'Open Submission',
    actionText: 'Submit Video Link',
    isCompleted: false
  },
  {
    id: 'qst-10',
    title: 'Genesis Launch Special Campaign',
    description: 'Complete 5 quests and refer at least 2 friends during the Launch Week.',
    category: 'special',
    rewardBooba: 1000,
    type: 'special',
    requirements: 'Achieve Level 3+ and verify 2 genuine invited members.',
    repeatable: false,
    deadline: 'Ends in 4 Days',
    actionText: 'Claim Special Bonus',
    isCompleted: false
  }
];

const INITIAL_SUBMISSIONS = [
  {
    id: 'sub-001',
    userId: 'usr-001',
    username: 'CryptoKing',
    passportId: 'BB-008421',
    questId: 'qst-7',
    questTitle: 'Create a Viral Booba Meme',
    rewardBooba: 500,
    proofUrl: 'https://x.com/CryptoKing/status/18247192837192',
    proofDescription: 'Created a top tier animated gif meme with the Booba panda holding BNB milk bottle!',
    submittedAt: '2026-08-16 11:20:00',
    status: 'pending', // pending, approved, rejected
    reviewedBy: null,
    reviewedAt: null,
    adminNotes: ''
  },
  {
    id: 'sub-002',
    userId: 'usr-004',
    username: 'PandaHodler',
    passportId: 'BB-003418',
    questId: 'qst-8',
    questTitle: 'Write an Educational X Thread on Booba',
    rewardBooba: 600,
    proofUrl: 'https://x.com/PandaHodler/status/18247019283711',
    proofDescription: '6-part deep dive thread on Booba Passport utility and BNB Baby tokenomics.',
    submittedAt: '2026-08-16 10:05:00',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    adminNotes: ''
  }
];

const INITIAL_REFERRALS = [
  {
    id: 'ref-001',
    referrerUsername: 'CryptoKing',
    referredUsername: 'PandaHodler',
    passportId: 'BB-003418',
    joinedDate: '2026-08-10',
    status: 'verified', // verified or pending
    rewardClaimed: 300,
    questsCompleted: 72
  },
  {
    id: 'ref-002',
    referrerUsername: 'CryptoKing',
    referredUsername: 'BNBQueen',
    passportId: 'BB-005112',
    joinedDate: '2026-08-12',
    status: 'verified',
    rewardClaimed: 300,
    questsCompleted: 59
  },
  {
    id: 'ref-003',
    referrerUsername: 'CryptoKing',
    referredUsername: 'MoonSeeker',
    passportId: 'BB-009941',
    joinedDate: '2026-08-15',
    status: 'pending',
    rewardClaimed: 0,
    questsCompleted: 1,
    verificationRequirement: 'Needs to complete 2 more quests to verify referral'
  },
  {
    id: 'ref-004',
    referrerUsername: 'CryptoKing',
    referredUsername: 'DiamondPaws',
    passportId: 'BB-010243',
    joinedDate: '2026-08-16',
    status: 'pending',
    rewardClaimed: 0,
    questsCompleted: 0,
    verificationRequirement: 'Needs to verify email & complete initial quest'
  }
];

const INITIAL_ACHIEVEMENTS = [
  { id: 'ach-1', title: 'Passport Minted', desc: 'Mint your official Booba Passport digital identity', icon: '🪪', rewardBooba: 100, completed: true },
  { id: 'ach-2', title: 'First Quest Cleared', desc: 'Complete your first community quest', icon: '🎯', rewardBooba: 100, completed: true },
  { id: 'ach-3', title: 'Social Pioneer', desc: 'Connect with Booba on X, Telegram and Discord', icon: '🌐', rewardBooba: 250, completed: true },
  { id: 'ach-4', title: '7-Day Streak Master', desc: 'Maintain a 7-day consecutive daily check-in streak', icon: '🔥', rewardBooba: 350, completed: true },
  { id: 'ach-5', title: 'Referral Pioneer', desc: 'Successfully bring 5 verified baby pandas to Booba', icon: '👥', rewardBooba: 500, completed: true },
  { id: 'ach-6', title: 'Meme Maestro', desc: 'Have an approved creative meme submission', icon: '🎨', rewardBooba: 500, completed: true },
  { id: 'ach-7', title: 'Booba Hustler', desc: 'Ascend to Level 4 (3,000+ BOOBA)', icon: '⚡', rewardBooba: 500, completed: true },
  { id: 'ach-8', title: 'Elite Referrer', desc: 'Successfully refer 25+ verified members', icon: '👑', rewardBooba: 1500, completed: true },
  { id: 'ach-9', title: 'Booba Elite', desc: 'Ascend to Level 7 (25,000+ BOOBA)', icon: '💎', rewardBooba: 2500, completed: true },
  { id: 'ach-10', title: 'AMA Regular', desc: 'Attend at least 5 live Community AMAs', icon: '🎙️', rewardBooba: 750, completed: false, progress: '3/5' },
  { id: 'ach-11', title: 'Content Champion', desc: 'Submit 5 approved educational threads or videos', icon: '🚀', rewardBooba: 2000, completed: false, progress: '2/5' },
  { id: 'ach-12', title: 'Legendary Panda', desc: 'Reach Level 8 and maintain a 90+ Reputation Score', icon: '🌟', rewardBooba: 5000, completed: false, progress: '28.4k / 50k' }
];

// Helper to load from LocalStorage or seed
function loadStorage(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage save error:', e);
  }
}

// Database Service Class
class DatabaseService {
  constructor() {
    this.users = loadStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
    this.quests = loadStorage(STORAGE_KEYS.QUESTS, INITIAL_QUESTS);
    this.submissions = loadStorage(STORAGE_KEYS.SUBMISSIONS, INITIAL_SUBMISSIONS);
    this.referrals = loadStorage(STORAGE_KEYS.REFERRALS, INITIAL_REFERRALS);
    this.achievements = loadStorage(STORAGE_KEYS.ACHIEVEMENTS, INITIAL_ACHIEVEMENTS);
    
    // Check saved session or default to CryptoKing
    const savedUser = loadStorage(STORAGE_KEYS.CURRENT_USER, this.users[0]);
    this.currentUser = this.users.find(u => u.id === savedUser.id) || this.users[0];
    
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(fn => fn(this.getState()));
  }

  getState() {
    return {
      currentUser: this.currentUser,
      users: this.users,
      quests: this.quests,
      submissions: this.submissions,
      referrals: this.referrals,
      achievements: this.achievements
    };
  }

  // Authentication & Session
  login(identifier, password) {
    const cleanId = (identifier || '').trim().toLowerCase();
    
    // Special admin override
    if (cleanId === 'admin@gmail.com' || cleanId === 'admin@booba.crypto' || cleanId === 'boobaboss') {
      const adminUser = this.users.find(u => u.role === 'admin') || this.users[1];
      this.currentUser = adminUser;
      saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
      this.notify();
      return { success: true, user: adminUser, isAdmin: true };
    }

    const user = this.users.find(u => 
      (u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId)
    );
    if (user) {
      this.currentUser = user;
      saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
      this.notify();
      return { success: true, user, isAdmin: user.role === 'admin' };
    }
    return { success: false, message: 'User not found. Please check your credentials or create an account.' };
  }

  loginWithWallet(walletAddress) {
    let user = this.users.find(u => u.walletAddress?.toLowerCase() === walletAddress?.toLowerCase());
    if (!user) {
      // Auto-register via wallet
      const cleanAddress = walletAddress.substring(0, 6) + '...' + walletAddress.substring(walletAddress.length - 4);
      user = this.register({
        username: 'Panda_' + walletAddress.substring(2, 6),
        email: `wallet_${walletAddress.substring(2, 8)}@booba.crypto`,
        walletAddress: cleanAddress,
        referralCodeInput: ''
      }).user;
    }
    this.currentUser = user;
    saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    this.notify();
    return { success: true, user };
  }

  switchDemoUser(role) {
    if (role === 'admin') {
      this.currentUser = this.users.find(u => u.role === 'admin') || this.users[1];
    } else {
      this.currentUser = this.users.find(u => u.username === 'CryptoKing') || this.users[0];
    }
    saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    this.notify();
    return this.currentUser;
  }

  register({ username, email, password = '', walletAddress = '', referralCodeInput = '' }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUsername = (username || '').replace(/^@/, '').trim();

    // Check if registering with admin@gmail.com
    const isAdmin = cleanEmail === 'admin@gmail.com' || cleanUsername.toLowerCase() === 'boobaboss' || (cleanUsername.toLowerCase() === 'admin' && password === 'booba');

    if (isAdmin) {
      let adminUser = this.users.find(u => u.role === 'admin');
      if (!adminUser) {
        adminUser = {
          id: 'usr-admin-001',
          username: cleanUsername || 'BoobaBoss',
          email: 'admin@gmail.com',
          password: 'booba',
          role: 'admin',
          passportId: 'BB-000001',
          memberSince: 'January 01, 2026',
          boobaPoints: 265000,
          reputation: 99,
          walletAddress: '0x88A...33f1',
          avatar: 'assets/mascot.jpg',
          completedQuestsCount: 150,
          verifiedReferralsCount: 180,
          referralCode: 'BOOBABOSS',
          referredBy: null,
          lastCheckIn: null,
          streakDays: 45,
          badges: ['Project Founder', 'BNB Baby Architect', 'Grandmaster', 'Top Influencer']
        };
        this.users.unshift(adminUser);
      }
      this.currentUser = adminUser;
      saveStorage(STORAGE_KEYS.USERS, this.users);
      saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
      this.notify();
      return { success: true, user: adminUser, isAdmin: true };
    }

    // Check if exists
    if (this.users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return { success: false, message: 'Username already taken. Please choose another.' };
    }

    // Generate Passport ID
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const passportId = `BB-0${randomDigits}`;
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const newUser = {
      id: 'usr-' + Date.now(),
      username: cleanUsername,
      email: cleanEmail,
      password: password || 'booba',
      role: 'member',
      passportId,
      memberSince: today,
      boobaPoints: 100, // Welcome bonus
      reputation: 75,
      walletAddress: walletAddress || '0x' + Math.random().toString(16).substring(2, 10) + '...' + Math.random().toString(16).substring(2, 6),
      avatar: 'assets/mascot.jpg',
      completedQuestsCount: 0,
      verifiedReferralsCount: 0,
      referralCode: cleanUsername.toUpperCase(),
      referredBy: referralCodeInput ? referralCodeInput.toUpperCase() : null,
      lastCheckIn: null,
      streakDays: 1,
      badges: ['Passport Minted']
    };

    this.users.unshift(newUser);
    this.currentUser = newUser;
    
    // If referred by someone, track referral
    if (referralCodeInput) {
      const referrer = this.users.find(u => u.referralCode === referralCodeInput.toUpperCase());
      if (referrer) {
        this.referrals.unshift({
          id: 'ref-' + Date.now(),
          referrerUsername: referrer.username,
          referredUsername: newUser.username,
          passportId: newUser.passportId,
          joinedDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          rewardClaimed: 0,
          questsCompleted: 0,
          verificationRequirement: 'Needs to complete 2 initial quests to verify'
        });
        saveStorage(STORAGE_KEYS.REFERRALS, this.referrals);
      }
    }

    saveStorage(STORAGE_KEYS.USERS, this.users);
    saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    this.notify();
    return { success: true, user: newUser };
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    this.notify();
  }

  // Quests & Points
  claimDailyCheckIn() {
    if (!this.currentUser) return { success: false, message: 'Please log in' };

    const bonus = 50;
    this.currentUser.boobaPoints += bonus;
    this.currentUser.streakDays = (this.currentUser.streakDays || 0) + 1;
    this.currentUser.lastCheckIn = new Date().toISOString();
    this.currentUser.completedQuestsCount += 1;

    // Update in users array
    const idx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (idx !== -1) {
      this.users[idx] = { ...this.currentUser };
    }

    saveStorage(STORAGE_KEYS.USERS, this.users);
    saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    this.notify();
    return { success: true, bonus, streak: this.currentUser.streakDays };
  }

  completeSocialQuest(questId) {
    if (!this.currentUser) return { success: false, message: 'Please log in' };
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return { success: false, message: 'Quest not found' };

    const reward = quest.rewardBooba;
    this.currentUser.boobaPoints += reward;
    this.currentUser.completedQuestsCount += 1;

    // Update user
    const idx = this.users.findIndex(u => u.id === this.currentUser.id);
    if (idx !== -1) this.users[idx] = { ...this.currentUser };

    saveStorage(STORAGE_KEYS.USERS, this.users);
    saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    this.notify();
    return { success: true, reward, title: quest.title };
  }

  submitCreativeProof({ questId, proofUrl, proofDescription }) {
    if (!this.currentUser) return { success: false, message: 'Please log in' };
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return { success: false, message: 'Quest not found' };

    const newSub = {
      id: 'sub-' + Date.now(),
      userId: this.currentUser.id,
      username: this.currentUser.username,
      passportId: this.currentUser.passportId,
      questId,
      questTitle: quest.title,
      rewardBooba: quest.rewardBooba,
      proofUrl,
      proofDescription,
      submittedAt: new Date().toLocaleString(),
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: ''
    };

    this.submissions.unshift(newSub);
    saveStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
    return { success: true, submission: newSub };
  }

  // Admin Actions
  reviewSubmission(submissionId, action, adminNotes = '') {
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) return { success: false, message: 'Submission not found' };

    sub.status = action; // 'approved' or 'rejected'
    sub.reviewedBy = this.currentUser?.username || 'Admin';
    sub.reviewedAt = new Date().toLocaleString();
    sub.adminNotes = adminNotes;

    // If approved, award BOOBA points to the user's passport
    if (action === 'approved') {
      const targetUser = this.users.find(u => u.id === sub.userId);
      if (targetUser) {
        targetUser.boobaPoints += sub.rewardBooba;
        targetUser.completedQuestsCount += 1;
        targetUser.reputation = Math.min(100, (targetUser.reputation || 80) + 1);
        
        // If target user is current user, update session
        if (this.currentUser && this.currentUser.id === targetUser.id) {
          this.currentUser = { ...targetUser };
          saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
        }
      }
    }

    saveStorage(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    saveStorage(STORAGE_KEYS.USERS, this.users);
    this.notify();
    return { success: true, status: action, sub };
  }

  createQuest(questData) {
    const newQuest = {
      id: 'qst-' + Date.now(),
      title: questData.title,
      description: questData.description,
      category: questData.category || 'community',
      rewardBooba: parseInt(questData.rewardBooba, 10) || 100,
      type: questData.type || 'proof',
      requirements: questData.requirements || 'Follow guidelines and submit proof',
      targetUrl: questData.targetUrl || '',
      repeatable: Boolean(questData.repeatable),
      deadline: questData.deadline || 'Active Campaign',
      actionText: questData.actionText || 'Complete Quest',
      isCompleted: false
    };

    this.quests.unshift(newQuest);
    saveStorage(STORAGE_KEYS.QUESTS, this.quests);
    this.notify();
    return { success: true, quest: newQuest };
  }

  verifyReferral(referralId) {
    const ref = this.referrals.find(r => r.id === referralId);
    if (!ref) return { success: false, message: 'Referral record not found' };

    ref.status = 'verified';
    ref.rewardClaimed = 300;

    // Award referrer +300 BOOBA
    const referrer = this.users.find(u => u.username.toLowerCase() === ref.referrerUsername.toLowerCase());
    if (referrer) {
      referrer.boobaPoints += 300;
      referrer.verifiedReferralsCount = (referrer.verifiedReferralsCount || 0) + 1;
      referrer.reputation = Math.min(100, (referrer.reputation || 80) + 2);
    }

    saveStorage(STORAGE_KEYS.REFERRALS, this.referrals);
    saveStorage(STORAGE_KEYS.USERS, this.users);
    this.notify();
    return { success: true, ref };
  }

  adjustUserBooba(userId, pointsDelta, reason = '') {
    const user = this.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User not found' };

    user.boobaPoints = Math.max(0, user.boobaPoints + pointsDelta);
    if (this.currentUser && this.currentUser.id === user.id) {
      this.currentUser = { ...user };
      saveStorage(STORAGE_KEYS.CURRENT_USER, this.currentUser);
    }

    saveStorage(STORAGE_KEYS.USERS, this.users);
    this.notify();
    return { success: true, user };
  }
}

export const db = new DatabaseService();
