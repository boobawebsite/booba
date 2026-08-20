/* ==========================================================================
   BOOBA (BNB baby) — Live Supabase Database & State Service
   Single Source of Truth: Real Accounts, Live Quests, Real Leaderboards
   ========================================================================== */

import { supabase, isUserAdmin, ADMIN_EMAILS } from './supabaseClient.js';

// Local storage session key
const SESSION_KEY = 'booba_active_session_user';

// Level definitions
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

    // Load local session if available
    this.loadLocalSession();
  }

  loadLocalSession() {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
        // Refresh admin role based on whitelist
        if (this.currentUser && isUserAdmin(this.currentUser.email)) {
          this.currentUser.role = 'admin';
        }
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  saveLocalSession(user) {
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
      // Immediately notify with current state
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

    // If logged in, refresh current user record from database
    if (this.currentUser && this.currentUser.id) {
      const fresh = this.users.find(u => u.id === this.currentUser.id || u.email === this.currentUser.email);
      if (fresh) {
        if (isUserAdmin(fresh.email)) fresh.role = 'admin';
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
  // USER AUTHENTICATION & MANAGEMENT
  // --------------------------------------------------------------------------

  async fetchUsers() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('booba_users')
        .select('*')
        .order('booba_points', { ascending: false });

      if (!error && data) {
        this.users = data.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: isUserAdmin(u.email) ? 'admin' : (u.role || 'member'),
          passportId: u.passport_id,
          memberSince: u.member_since ? new Date(u.member_since).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
          boobaPoints: Number(u.booba_points) || 0,
          reputation: Number(u.reputation) || 75,
          walletAddress: u.wallet_address || '0x...BNB',
          avatar: u.avatar_url || 'assets/mascot.jpg',
          completedQuestsCount: Number(u.completed_quests) || 0,
          verifiedReferralsCount: Number(u.verified_referrals) || 0,
          referralCode: u.referral_code,
          referredBy: u.referred_by,
          streakDays: Number(u.streak_days) || 1
        }));
      }
    } catch (e) {
      console.error('fetchUsers error:', e);
    }
    return this.users;
  }

  async signup({ username, email, password, referralCode = '', walletAddress = '' }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const isAdmin = isUserAdmin(cleanEmail);
    const passportId = 'BB-' + Math.floor(100000 + Math.random() * 900000);
    const userRefCode = cleanUsername.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || ('BB' + Math.floor(1000 + Math.random() * 9000));

    const newUserPayload = {
      username: cleanUsername,
      email: cleanEmail,
      role: isAdmin ? 'admin' : 'member',
      passport_id: passportId,
      booba_points: 100, // Welcome bonus
      reputation: 75,
      wallet_address: walletAddress || `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 6)}`,
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
          return { success: false, message: 'Username or Email is already registered. Please sign in.' };
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
        streakDays: 1
      };

      // If referred, log referral
      if (referralCode) {
        await this.recordReferral(referralCode.trim().toUpperCase(), formattedUser.username, formattedUser.passportId);
      }

      this.saveLocalSession(formattedUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, user: formattedUser };
    } catch (e) {
      return { success: false, message: e.message || 'Signup failed' };
    }
  }

  async login({ emailOrUsername, password }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };

    const query = emailOrUsername.trim();
    try {
      // Find by email or username
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
        streakDays: Number(raw.streak_days) || 1
      };

      this.saveLocalSession(user);
      await this.fetchUsers();
      this.notify();

      return { success: true, user };
    } catch (e) {
      return { success: false, message: e.message || 'Login failed' };
    }
  }

  logout() {
    this.saveLocalSession(null);
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
    try {
      const { error } = await supabase.from('booba_quests').delete().eq('id', questId);
      if (error) throw error;
      await this.fetchQuests();
      this.notify();
      return { success: true };
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
      const { data, error } = await supabase
        .from('booba_submissions')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      await this.fetchSubmissions();
      this.notify();
      return { success: true, submission: data };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async reviewSubmission(submissionId, action, adminNotes = '') {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };
    const sub = this.submissions.find(s => s.id === submissionId);
    if (!sub) return { success: false, message: 'Submission not found' };

    try {
      const { error: subError } = await supabase
        .from('booba_submissions')
        .update({
          status: action,
          reviewed_by: this.currentUser?.username || 'Booba Admin',
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes
        })
        .eq('id', submissionId);

      if (subError) throw subError;

      // If approved, update target user's points & completed quests
      if (action === 'approved' && sub.userId) {
        const { data: userData } = await supabase
          .from('booba_users')
          .select('booba_points, completed_quests, reputation')
          .eq('id', sub.userId)
          .single();

        if (userData) {
          const updatedPoints = (Number(userData.booba_points) || 0) + sub.rewardBooba;
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

      await Promise.all([this.fetchSubmissions(), this.fetchUsers()]);
      this.notify();
      return { success: true, status: action };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // --------------------------------------------------------------------------
  // SOCIAL & DAILY INSTANT QUESTS
  // --------------------------------------------------------------------------

  async completeSocialQuest(questId) {
    if (!this.currentUser) return { success: false, message: 'Please sign in first' };
    const quest = this.quests.find(q => q.id === questId);
    if (!quest) return { success: false, message: 'Quest not found' };

    const reward = quest.rewardBooba;
    const newPoints = (this.currentUser.boobaPoints || 0) + reward;
    const newCount = (this.currentUser.completedQuestsCount || 0) + 1;

    try {
      if (supabase && this.currentUser.id) {
        await supabase
          .from('booba_users')
          .update({ booba_points: newPoints, completed_quests: newCount })
          .eq('id', this.currentUser.id);
      }

      this.currentUser.boobaPoints = newPoints;
      this.currentUser.completedQuestsCount = newCount;
      this.saveLocalSession(this.currentUser);
      await this.fetchUsers();
      this.notify();

      return { success: true, reward, title: quest.title };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async dailyCheckIn() {
    if (!this.currentUser) return { success: false, message: 'Please sign in first' };

    const bonus = 50;
    const newPoints = (this.currentUser.boobaPoints || 0) + bonus;
    const newStreak = (this.currentUser.streakDays || 1) + 1;
    const newCount = (this.currentUser.completedQuestsCount || 0) + 1;

    try {
      if (supabase && this.currentUser.id) {
        await supabase
          .from('booba_users')
          .update({
            booba_points: newPoints,
            streak_days: newStreak,
            completed_quests: newCount
          })
          .eq('id', this.currentUser.id);
      }

      this.currentUser.boobaPoints = newPoints;
      this.currentUser.streakDays = newStreak;
      this.currentUser.completedQuestsCount = newCount;
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
      // Find referrer username
      const referrer = this.users.find(u => u.referralCode?.toUpperCase() === referrerCode.toUpperCase());
      const referrerUsername = referrer ? referrer.username : referrerCode;

      await supabase.from('booba_referrals').insert([{
        referrer_username: referrerUsername,
        referred_username: newUsername,
        passport_id: newPassportId,
        status: 'verified',
        reward_claimed: 300
      }]);

      // Award bonus points to referrer
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

  async distributeAirdrop({ targetGroup, amountPerUser, reason }) {
    if (!supabase) return { success: false, message: 'Supabase client not connected' };
    const amount = Number(amountPerUser) || 0;
    if (amount <= 0) return { success: false, message: 'Invalid airdrop amount' };

    let recipients = [...this.users];
    if (targetGroup === 'top10') {
      recipients = recipients.slice(0, 10);
    } else if (targetGroup === 'active') {
      recipients = recipients.filter(u => u.completedQuestsCount > 0);
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No eligible recipients found in this target group.' };
    }

    try {
      // Update each user in Supabase
      for (const u of recipients) {
        await supabase
          .from('booba_users')
          .update({ booba_points: (u.boobaPoints || 0) + amount })
          .eq('id', u.id);
      }

      const totalDist = amount * recipients.length;

      // Log airdrop
      await supabase.from('booba_airdrop_logs').insert([{
        admin_username: this.currentUser?.username || 'Booba Admin',
        amount_per_user: amount,
        target_group: targetGroup,
        recipient_count: recipients.length,
        total_distributed: totalDist,
        reason: reason || 'Community Airdrop'
      }]);

      await Promise.all([this.fetchUsers(), this.fetchAirdropLogs()]);
      this.notify();

      return {
        success: true,
        recipientCount: recipients.length,
        totalDistributed: totalDist
      };
    } catch (e) {
      return { success: false, message: e.message };
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
// Auto-initialize connection
db.init();
