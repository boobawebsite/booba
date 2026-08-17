/* ==========================================================================
   BOOBA (BNB baby) — Team Admin Console Logic (teamadmin.js)
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './src/services/db.js';

class TeamAdminApp {
  constructor() {
    this.activeTab = 'overview';
    this.distributionLogs = JSON.parse(localStorage.getItem('booba_admin_airdrop_logs') || '[]');
    
    // Ensure admin user is active
    const state = db.getState();
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      db.switchDemoUser('admin');
    }

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();

    // Subscribe to DB state updates
    db.subscribe(() => {
      this.render();
    });
  }

  setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');

    const openSidebar = () => {
      sidebar?.classList.add('open');
      backdrop?.classList.add('active');
      document.body.style.overflow = 'hidden';
    };

    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      backdrop?.classList.remove('active');
      document.body.style.overflow = '';
    };

    // Mobile Sidebar Toggle
    document.getElementById('mobileAdminToggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSidebar();
    });

    // Close button inside sidebar
    document.getElementById('mobileSidebarCloseBtn')?.addEventListener('click', () => {
      closeSidebar();
    });

    // Close on backdrop click
    backdrop?.addEventListener('click', () => {
      closeSidebar();
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('active');
    document.body.style.overflow = '';
    
    this.render();
  }

  showToast(message, type = 'success') {
    const container = document.getElementById('adminToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `admin-toast toast-${type}`;

    toast.innerHTML = `
      <div style="flex: 1; font-size: 0.9rem; font-weight: 600;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  render() {
    const state = db.getState();
    const contentBody = document.getElementById('adminContentBody');
    if (!contentBody) return;

    // Update pending submissions badge
    const pendingCount = state.submissions.filter(s => s.status === 'pending').length;
    const subBadge = document.getElementById('pendingSubmissionsBadge');
    if (subBadge) {
      subBadge.textContent = pendingCount;
      subBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    switch (this.activeTab) {
      case 'overview':
        contentBody.innerHTML = this.getOverviewHTML(state);
        this.attachOverviewListeners();
        break;
      case 'quests':
        contentBody.innerHTML = this.getQuestsHTML(state);
        this.attachQuestsListeners();
        break;
      case 'airdrop':
        contentBody.innerHTML = this.getAirdropHTML(state);
        this.attachAirdropListeners();
        break;
      case 'submissions':
        contentBody.innerHTML = this.getSubmissionsHTML(state);
        this.attachSubmissionsListeners();
        break;
      case 'users':
        contentBody.innerHTML = this.getUsersHTML(state);
        this.attachUsersListeners();
        break;
      default:
        contentBody.innerHTML = this.getOverviewHTML(state);
        this.attachOverviewListeners();
    }
  }

  /* --------------------------------------------------------------------------
     1. OVERVIEW TAB
     -------------------------------------------------------------------------- */
  getOverviewHTML(state) {
    const totalUsers = state.users.length;
    const totalQuests = state.quests.length;
    const totalTokensDistributed = state.users.reduce((acc, u) => acc + (u.boobaPoints || 0), 0);
    const pendingSubmissions = state.submissions.filter(s => s.status === 'pending').length;

    const topHolders = [...state.users].sort((a, b) => b.boobaPoints - a.boobaPoints).slice(0, 5);

    return `
      <div class="admin-stats-grid">
        <div class="stat-widget">
          <div class="stat-icon-wrapper" style="background: var(--brand-yellow-subtle); color: var(--brand-yellow);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><line x1="12" y1="6" x2="12" y2="8"></line><line x1="12" y1="16" x2="12" y2="18"></line></svg>
          </div>
          <div>
            <div class="stat-val">${totalTokensDistributed.toLocaleString()}</div>
            <div class="stat-lbl">BOOBA Distributed</div>
          </div>
        </div>

        <div class="stat-widget">
          <div class="stat-icon-wrapper" style="background: var(--accent-blue-subtle); color: var(--accent-blue);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div>
            <div class="stat-val">${totalUsers}</div>
            <div class="stat-lbl">Registered Passports</div>
          </div>
        </div>

        <div class="stat-widget">
          <div class="stat-icon-wrapper" style="background: var(--accent-emerald-subtle); color: var(--accent-emerald);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          </div>
          <div>
            <div class="stat-val">${totalQuests}</div>
            <div class="stat-lbl">Active Quests & Bounties</div>
          </div>
        </div>

        <div class="stat-widget">
          <div class="stat-icon-wrapper" style="background: var(--accent-ruby-subtle); color: var(--accent-ruby);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div>
            <div class="stat-val">${pendingSubmissions}</div>
            <div class="stat-lbl">Pending Submissions</div>
          </div>
        </div>
      </div>

      <!-- Quick Actions Grid -->
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Quick Management Actions</h3>
        </div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button class="btn-admin btn-admin-primary" id="quickNewQuestBtn">
            Upload New Quest
          </button>
          <button class="btn-admin btn-admin-secondary" id="quickAirdropBtn">
            Launch Token Airdrop
          </button>
          <button class="btn-admin btn-admin-secondary" id="quickReviewSubmissionsBtn">
            Review Proof Submissions (${pendingSubmissions})
          </button>
          <a href="index.html#home" class="btn-admin btn-admin-secondary" target="_blank">
            Visit Public Website ↗
          </a>
        </div>
      </div>

      <!-- Top Leaderboard Snapshot -->
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Top User Rankings</h3>
          <button class="btn-admin btn-admin-secondary btn-sm" id="viewAllUsersBtn">View All Users →</button>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>User / Passport</th>
                <th>BSC Wallet</th>
                <th>Level Tier</th>
                <th>BOOBA Balance</th>
                <th>Reputation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${topHolders.map((u, i) => {
                const lvl = calculateLevel(u.boobaPoints);
                return `
                  <tr>
                    <td><span class="admin-badge ${i === 0 ? 'badge-gold' : 'badge-blue'}">#${i + 1}</span></td>
                    <td>
                      <div style="font-weight: 700; color: var(--text-primary);">@${u.username}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${u.passportId}</div>
                    </td>
                    <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">${u.walletAddress || 'Not Connected'}</td>
                    <td><span class="admin-badge badge-purple">${lvl.title} (Lvl ${lvl.level})</span></td>
                    <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">${u.boobaPoints.toLocaleString()} BOOBA</td>
                    <td><span class="admin-badge badge-green">Rep: ${u.reputation || 90}/100</span></td>
                    <td>
                      <button class="btn-admin btn-admin-primary btn-sm direct-credit-btn" data-userid="${u.id}" data-username="${u.username}">
                        Credit Tokens
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachOverviewListeners() {
    document.getElementById('quickNewQuestBtn')?.addEventListener('click', () => this.switchTab('quests'));
    document.getElementById('quickAirdropBtn')?.addEventListener('click', () => this.switchTab('airdrop'));
    document.getElementById('quickReviewSubmissionsBtn')?.addEventListener('click', () => this.switchTab('submissions'));
    document.getElementById('viewAllUsersBtn')?.addEventListener('click', () => this.switchTab('users'));

    document.querySelectorAll('.direct-credit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-userid');
        this.switchTab('airdrop');
        setTimeout(() => {
          const userSelect = document.getElementById('airdropUserSelect');
          if (userSelect) userSelect.value = userId;
        }, 100);
      });
    });
  }

  /* --------------------------------------------------------------------------
     2. QUESTS CREATOR & UPLOAD TAB
     -------------------------------------------------------------------------- */
  getQuestsHTML(state) {
    return `
      <!-- Quest Upload Form Card -->
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Create & Publish New Quest</h3>
          <span class="admin-badge badge-gold">Live Website Upload</span>
        </div>

        <form id="createQuestForm">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Quest Title *</label>
              <input type="text" id="questTitleInput" class="form-control" placeholder="e.g. Retweet & Tag 3 Friends on X" required>
            </div>

            <div class="form-group">
              <label class="form-label">Category *</label>
              <select id="questCategoryInput" class="form-control">
                <option value="social">Social (Twitter / X, Discord, TG)</option>
                <option value="community">Community (Ambassador, Onboarding)</option>
                <option value="creative">Creative (Memes, Threads, TikTok/Reels)</option>
                <option value="special">Special Launch Campaign</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Reward Amount (BOOBA Points) *</label>
              <input type="number" id="questRewardInput" class="form-control" placeholder="500" min="10" step="10" required>
            </div>

            <div class="form-group">
              <label class="form-label">Verification Type *</label>
              <select id="questTypeInput" class="form-control">
                <option value="proof">Manual Proof Submission (Links, Screenshots)</option>
                <option value="social">Instant Link / Social Follow</option>
                <option value="special">Milestone / Special Criteria</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Target Link / URL (Optional)</label>
              <input type="url" id="questUrlInput" class="form-control" placeholder="https://x.com/BoobaBabyBNB/status/...">
            </div>

            <div class="form-group">
              <label class="form-label">Deadline / Schedule *</label>
              <input type="text" id="questDeadlineInput" class="form-control" placeholder="e.g. Active Bounty, Ends in 3 Days" required>
            </div>

            <div class="form-group">
              <label class="form-label">Button Action Text *</label>
              <input type="text" id="questActionTextInput" class="form-control" placeholder="e.g. Submit Meme Link, Follow on X" required>
            </div>

            <div class="form-group" style="display: flex; align-items: center; justify-content: center;">
              <label style="display: flex; align-items: center; gap: 0.6rem; font-weight: 600; cursor: pointer;">
                <input type="checkbox" id="questRepeatableInput" style="width: 18px; height: 18px; accent-color: var(--brand-yellow);">
                <span>Allow Repeatable Submissions</span>
              </label>
            </div>
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Quest Description *</label>
            <textarea id="questDescInput" class="form-control" placeholder="Explain what the participant must do to earn the bounty..." required></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Detailed Requirements & Instructions</label>
            <input type="text" id="questRequirementsInput" class="form-control" placeholder="e.g. Must include #BOOBA #BNBbaby in your post. Minimum 20 followers.">
          </div>

          <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 1rem;">
            <button type="reset" class="btn-admin btn-admin-secondary">Clear Form</button>
            <button type="submit" class="btn-admin btn-admin-primary">Publish Quest to Live Site</button>
          </div>
        </form>
      </div>

      <!-- Published Quests Table -->
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Published Quests & Bounties (${state.quests.length})</h3>
        </div>

        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title & Category</th>
                <th>Reward</th>
                <th>Type</th>
                <th>Deadline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.quests.map(q => `
                <tr>
                  <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${q.id}</td>
                  <td>
                    <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${q.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem;">
                      <span class="admin-badge badge-${q.category === 'creative' ? 'purple' : q.category === 'social' ? 'blue' : 'gold'}">${q.category}</span>
                      <span style="color: var(--text-muted); margin-left: 0.5rem;">${q.actionText}</span>
                    </div>
                  </td>
                  <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">
                    +${q.rewardBooba.toLocaleString()} BOOBA
                  </td>
                  <td><span class="admin-badge badge-blue">${q.type}</span></td>
                  <td style="font-size: 0.825rem; color: var(--text-secondary);">${q.deadline}</td>
                  <td>
                    <button class="btn-admin btn-admin-danger btn-sm delete-quest-btn" data-questid="${q.id}" title="Delete Quest">
                      Delete
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachQuestsListeners() {
    document.getElementById('createQuestForm')?.addEventListener('submit', (e) => {
      e.preventDefault();

      const title = document.getElementById('questTitleInput')?.value;
      const category = document.getElementById('questCategoryInput')?.value;
      const rewardBooba = parseInt(document.getElementById('questRewardInput')?.value, 10);
      const type = document.getElementById('questTypeInput')?.value;
      const targetUrl = document.getElementById('questUrlInput')?.value;
      const deadline = document.getElementById('questDeadlineInput')?.value;
      const actionText = document.getElementById('questActionTextInput')?.value;
      const repeatable = document.getElementById('questRepeatableInput')?.checked;
      const description = document.getElementById('questDescInput')?.value;
      const requirements = document.getElementById('questRequirementsInput')?.value;

      if (!title || !rewardBooba || !description) {
        this.showToast('Please fill all required fields.', 'error');
        return;
      }

      const res = db.createQuest({
        title,
        category,
        rewardBooba,
        type,
        targetUrl,
        deadline,
        actionText,
        repeatable,
        description,
        requirements
      });

      if (res.success) {
        this.showToast(`Quest "${title}" successfully published to the live website!`);
        document.getElementById('createQuestForm')?.reset();
        this.render();
      }
    });

    document.querySelectorAll('.delete-quest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const questId = btn.getAttribute('data-questid');
        if (confirm('Are you sure you want to remove this quest from the live website?')) {
          const state = db.getState();
          state.quests = state.quests.filter(q => q.id !== questId);
          localStorage.setItem('booba_quests_data', JSON.stringify(state.quests));
          db.notify();
          this.showToast('Quest deleted from live site.');
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     3. TOKEN & AIRDROP DISTRIBUTION ENGINE
     -------------------------------------------------------------------------- */
  getAirdropHTML(state) {
    return `
      <div class="airdrop-hub-grid">
        
        <!-- Single User Token Grant -->
        <div class="admin-card">
          <div class="admin-card-header">
            <h3 class="admin-card-title">Individual User Token Distribution</h3>
            <span class="admin-badge badge-gold">Direct Credit</span>
          </div>

          <form id="singleDistributeForm">
            <div class="form-group">
              <label class="form-label">Select Recipient User *</label>
              <select id="airdropUserSelect" class="form-control" required>
                <option value="">-- Choose User / Passport --</option>
                ${state.users.map(u => `
                  <option value="${u.id}">@${u.username} (${u.passportId}) — Balance: ${u.boobaPoints.toLocaleString()} BOOBA</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Token Amount to Credit (BOOBA) *</label>
              <input type="number" id="singleAmountInput" class="form-control" placeholder="1000" min="1" step="10" required>
            </div>

            <div class="form-group">
              <label class="form-label">Distribution Reason / Note *</label>
              <input type="text" id="singleReasonInput" class="form-control" placeholder="e.g. Bug Bounty Reward, AMA Stage Speaker Reward" required>
            </div>

            <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; margin-top: 1rem;">
              Credit Tokens to User Passport
            </button>
          </form>
        </div>

        <!-- Mass / Batch Airdrop Engine -->
        <div class="admin-card">
          <div class="admin-card-header">
            <h3 class="admin-card-title">Mass Community Airdrop</h3>
            <span class="admin-badge badge-purple">Batch Engine</span>
          </div>

          <form id="massAirdropForm">
            <div class="form-group">
              <label class="form-label">Target Audience Criteria *</label>
              <select id="massTargetCriteria" class="form-control">
                <option value="all">All Registered Passport Holders (${state.users.length} Users)</option>
                <option value="lvl5">Level 5+ Grinders & Warriors Only</option>
                <option value="lvl7">Level 7+ Booba Elites & Legends Only</option>
                <option value="referrers">Top Referrers (1+ Verified Referrals)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">BOOBA Amount Per User *</label>
              <input type="number" id="massAmountInput" class="form-control" placeholder="500" min="10" step="10" required>
            </div>

            <div class="form-group">
              <label class="form-label">Airdrop Campaign Name *</label>
              <input type="text" id="massCampaignInput" class="form-control" placeholder="e.g. Genesis Community Season 1 Airdrop" required>
            </div>

            <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; margin-top: 1rem; background: linear-gradient(135deg, #F3BA2F 0%, #E0A800 100%);">
              Execute Mass Airdrop Payout
            </button>
          </form>
        </div>

      </div>

      <!-- Airdrop Transaction & Audit Log -->
      <div class="admin-card" style="margin-top: 1.5rem;">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Token Distribution Ledger (${this.distributionLogs.length} Records)</h3>
          <button class="btn-admin btn-admin-secondary btn-sm" id="clearAirdropLogsBtn">Clear Log History</button>
        </div>

        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Recipient(s)</th>
                <th>Amount</th>
                <th>Reason / Campaign</th>
                <th>Admin Signature</th>
              </tr>
            </thead>
            <tbody>
              ${this.distributionLogs.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No distribution transactions recorded yet.</td></tr>
              ` : this.distributionLogs.map(log => `
                <tr>
                  <td style="font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono);">${log.timestamp}</td>
                  <td><span class="admin-badge ${log.type === 'Mass Airdrop' ? 'badge-purple' : 'badge-gold'}">${log.type}</span></td>
                  <td style="font-weight: 700; color: var(--text-primary);">${log.recipient}</td>
                  <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">+${log.amount.toLocaleString()} BOOBA</td>
                  <td style="font-size: 0.85rem; color: var(--text-secondary);">${log.reason}</td>
                  <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-emerald);">${log.admin}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachAirdropListeners() {
    // Single Transfer
    document.getElementById('singleDistributeForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const userId = document.getElementById('airdropUserSelect')?.value;
      const amount = parseInt(document.getElementById('singleAmountInput')?.value, 10);
      const reason = document.getElementById('singleReasonInput')?.value;

      if (!userId || !amount) {
        this.showToast('Please select user and amount.', 'error');
        return;
      }

      const res = db.adjustUserBooba(userId, amount, reason);
      if (res.success) {
        // Record log
        this.distributionLogs.unshift({
          timestamp: new Date().toLocaleString(),
          type: 'Single Grant',
          recipient: `@${res.user.username} (${res.user.passportId})`,
          amount,
          reason,
          admin: db.currentUser?.username || 'BoobaBoss'
        });
        localStorage.setItem('booba_admin_airdrop_logs', JSON.stringify(this.distributionLogs));

        this.showToast(`Successfully credited ${amount.toLocaleString()} BOOBA to @${res.user.username}!`);
        document.getElementById('singleDistributeForm')?.reset();
        this.render();
      }
    });

    // Mass Airdrop
    document.getElementById('massAirdropForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const criteria = document.getElementById('massTargetCriteria')?.value;
      const amount = parseInt(document.getElementById('massAmountInput')?.value, 10);
      const campaign = document.getElementById('massCampaignInput')?.value;

      if (!amount || !campaign) {
        this.showToast('Please specify amount and campaign name.', 'error');
        return;
      }

      const state = db.getState();
      let targetUsers = [];

      if (criteria === 'all') {
        targetUsers = state.users;
      } else if (criteria === 'lvl5') {
        targetUsers = state.users.filter(u => calculateLevel(u.boobaPoints).level >= 5);
      } else if (criteria === 'lvl7') {
        targetUsers = state.users.filter(u => calculateLevel(u.boobaPoints).level >= 7);
      } else if (criteria === 'referrers') {
        targetUsers = state.users.filter(u => (u.verifiedReferralsCount || 0) > 0);
      }

      if (targetUsers.length === 0) {
        this.showToast('No users match the selected criteria.', 'error');
        return;
      }

      const totalTokens = targetUsers.length * amount;
      if (!confirm(`Execute Airdrop to ${targetUsers.length} users (${totalTokens.toLocaleString()} total BOOBA)?`)) {
        return;
      }

      targetUsers.forEach(u => {
        u.boobaPoints += amount;
      });

      localStorage.setItem('booba_users_data', JSON.stringify(state.users));
      db.notify();

      this.distributionLogs.unshift({
        timestamp: new Date().toLocaleString(),
        type: 'Mass Airdrop',
        recipient: `${targetUsers.length} Users (${criteria})`,
        amount: totalTokens,
        reason: campaign,
        admin: db.currentUser?.username || 'BoobaBoss'
      });
      localStorage.setItem('booba_admin_airdrop_logs', JSON.stringify(this.distributionLogs));

      this.showToast(`Mass Airdrop Completed: ${totalTokens.toLocaleString()} BOOBA sent to ${targetUsers.length} users!`);
      document.getElementById('massAirdropForm')?.reset();
      this.render();
    });

    document.getElementById('clearAirdropLogsBtn')?.addEventListener('click', () => {
      this.distributionLogs = [];
      localStorage.removeItem('booba_admin_airdrop_logs');
      this.render();
      this.showToast('Airdrop ledger cleared.');
    });
  }

  /* --------------------------------------------------------------------------
     4. SUBMISSIONS MODERATION QUEUE TAB
     -------------------------------------------------------------------------- */
  getSubmissionsHTML(state) {
    const submissions = state.submissions;

    return `
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">Community Proof Submissions Queue (${submissions.length})</h3>
        </div>

        <div class="table-responsive">
          <table class="admin-table">
            <thead>
              <tr>
                <th>User / Passport</th>
                <th>Quest Bounty</th>
                <th>Reward</th>
                <th>Proof Submission Link</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Review Action</th>
              </tr>
            </thead>
            <tbody>
              ${submissions.length === 0 ? `
                <tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No submissions in queue.</td></tr>
              ` : submissions.map(sub => `
                <tr>
                  <td>
                    <div style="font-weight: 700; color: var(--text-primary);">@${sub.username}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${sub.passportId}</div>
                  </td>
                  <td style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${sub.questTitle}</td>
                  <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">+${sub.rewardBooba} BOOBA</td>
                  <td>
                    <a href="${sub.proofUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-sm" style="color: var(--accent-blue);">
                      View Proof ↗
                    </a>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem; max-width: 260px;">${sub.proofDescription || ''}</div>
                  </td>
                  <td style="font-size: 0.75rem; color: var(--text-secondary);">${sub.submittedAt}</td>
                  <td>
                    <span class="admin-badge ${sub.status === 'approved' ? 'badge-green' : sub.status === 'rejected' ? 'badge-red' : 'badge-gold'}">
                      ${sub.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    ${sub.status === 'pending' ? `
                      <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-admin btn-admin-success btn-sm approve-sub-btn" data-subid="${sub.id}">
                          Approve (+${sub.rewardBooba})
                        </button>
                        <button class="btn-admin btn-admin-danger btn-sm reject-sub-btn" data-subid="${sub.id}">
                          Reject
                        </button>
                      </div>
                    ` : `
                      <span style="font-size: 0.75rem; color: var(--text-muted);">Reviewed by ${sub.reviewedBy || 'Admin'}</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachSubmissionsListeners() {
    document.querySelectorAll('.approve-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = btn.getAttribute('data-subid');
        const res = db.reviewSubmission(subId, 'approved', 'Verified by Team Admin');
        if (res.success) {
          this.showToast(`Submission approved! Tokens credited to user's passport.`);
        }
      });
    });

    document.querySelectorAll('.reject-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = btn.getAttribute('data-subid');
        const note = prompt('Reason for rejection (optional):', 'Proof invalid or link broken');
        const res = db.reviewSubmission(subId, 'rejected', note || '');
        if (res.success) {
          this.showToast(`Submission rejected.`, 'info');
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     5. USER DIRECTORY TAB
     -------------------------------------------------------------------------- */
  getUsersHTML(state) {
    return `
      <div class="admin-card">
        <div class="admin-card-header">
          <h3 class="admin-card-title">All Registered Passports (${state.users.length})</h3>
          <div style="display: flex; gap: 0.75rem;">
            <input type="text" id="userSearchInput" class="form-control" placeholder="Search by username, ID, or wallet..." style="width: 260px; padding: 0.4rem 0.8rem; font-size: 0.85rem;">
          </div>
        </div>

        <div class="table-responsive">
          <table class="admin-table" id="usersTable">
            <thead>
              <tr>
                <th>Passport ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>BSC Wallet</th>
                <th>Level</th>
                <th>BOOBA Balance</th>
                <th>Quests</th>
                <th>Referrals</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.users.map(u => {
                const lvl = calculateLevel(u.boobaPoints);
                return `
                  <tr class="user-row" data-search="${u.username.toLowerCase()} ${u.passportId.toLowerCase()} ${(u.walletAddress || '').toLowerCase()}">
                    <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-yellow);">${u.passportId}</td>
                    <td>
                      <div style="font-weight: 700; color: var(--text-primary);">@${u.username}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${u.email}</div>
                    </td>
                    <td><span class="admin-badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}">${u.role.toUpperCase()}</span></td>
                    <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">${u.walletAddress || 'Not Connected'}</td>
                    <td><span class="admin-badge badge-purple">${lvl.title} (Lvl ${lvl.level})</span></td>
                    <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">${u.boobaPoints.toLocaleString()} BOOBA</td>
                    <td>${u.completedQuestsCount || 0}</td>
                    <td>${u.verifiedReferralsCount || 0}</td>
                    <td>
                      <button class="btn-admin btn-admin-primary btn-sm user-grant-btn" data-userid="${u.id}">
                        Grant Tokens
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachUsersListeners() {
    const searchInput = document.getElementById('userSearchInput');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.user-row').forEach(row => {
        const text = row.getAttribute('data-search') || '';
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });

    document.querySelectorAll('.user-grant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-userid');
        this.switchTab('airdrop');
        setTimeout(() => {
          const select = document.getElementById('airdropUserSelect');
          if (select) select.value = userId;
        }, 100);
      });
    });
  }
}

// Instantiate Team Admin App
document.addEventListener('DOMContentLoaded', () => {
  window.teamAdmin = new TeamAdminApp();
});
