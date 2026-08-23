/* ==========================================================================
   BOOBA (BNB baby) — Team Admin Console Logic (teamadmin.js)
   Live Supabase Backend • Whitelist Guard • Professional Web3 Studio
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './src/services/db.js';
import { isUserAdmin, ADMIN_EMAILS } from './src/services/supabaseClient.js';

class TeamAdminApp {
  constructor() {
    this.activeTab = 'overview';
    this.userSearchQuery = '';
    this.submissionFilter = 'all'; // 'all' | 'pending' | 'approved' | 'rejected'
    
    // Token & Airdrop Hub state
    this.airdropTargetMode = 'top_n'; // 'top_n' | 'search_select' | 'all' | 'active'
    this.airdropTopCount = 15; // default 15, customizable e.g. 15, 30, 100, 2000
    this.airdropSearchQuery = '';
    this.airdropSelectedUserIds = new Set();
    this.airdropAmount = 500;
    this.airdropReason = '';
    const hashTab = (window.location.hash || '').replace('#', '');
    if (['overview', 'quests', 'airdrop', 'submissions', 'users'].includes(hashTab)) {
      this.activeTab = hashTab;
    }
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();

    // Subscribe to DB updates
    db.subscribe(() => {
      this.render();
    });

    window.addEventListener('hashchange', () => {
      const hashTab = (window.location.hash || '').replace('#', '');
      if (['overview', 'quests', 'airdrop', 'submissions', 'users'].includes(hashTab) && this.activeTab !== hashTab) {
        this.switchTab(hashTab);
      }
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

    document.getElementById('mobileSidebarCloseBtn')?.addEventListener('click', () => {
      closeSidebar();
    });

    backdrop?.addEventListener('click', () => {
      closeSidebar();
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    window.location.hash = tabName;
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
    alert((type === 'success' ? 'Success: ' : 'Notice: ') + message);
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  render() {
    const mainWorkspace = document.getElementById('adminWorkspace') || document.getElementById('adminContentBody');
    if (!mainWorkspace) return;

    const user = db.currentUser;
    const isAuthorized = user && isUserAdmin(user);

    // If not authenticated or not an admin, render the access restriction gate
    if (!isAuthorized) {
      this.renderAccessGate(mainWorkspace);
      return;
    }

    // Update active tab styling in sidebar
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === this.activeTab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update pending submissions badge in sidebar
    const pendingCount = db.submissions.filter(s => s.status === 'pending').length;
    const badge = document.getElementById('pendingSubmissionsBadge');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    switch (this.activeTab) {
      case 'quests':
        this.renderQuestsTab(mainWorkspace);
        break;
      case 'airdrop':
        this.renderAirdropTab(mainWorkspace);
        break;
      case 'submissions':
        this.renderSubmissionsTab(mainWorkspace);
        break;
      case 'users':
        this.renderUsersTab(mainWorkspace);
        break;
      case 'overview':
      default:
        this.renderOverviewTab(mainWorkspace);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN ACCESS RESTRICTION GATE
  // --------------------------------------------------------------------------

  renderAccessGate(container) {
    container.innerHTML = `
      <div style="max-width: 420px; margin: 5rem auto; padding: 2rem; border-radius: var(--radius-md); background: var(--admin-surface); border: 1px solid var(--admin-border); text-align: center;">
        
        <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--brand-yellow-subtle); border: 1px solid rgba(243, 186, 47, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--brand-yellow);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>

        <h2 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.35rem; letter-spacing: -0.01em;">
          Core Admin Authentication
        </h2>
        <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1.5rem;">
          Restricted to authorized core team emails registered in the whitelist.
        </p>

        <form id="adminLoginForm" onsubmit="window.adminApp.handleAdminLogin(event)" style="text-align: left;">
          <div class="form-field">
            <label class="form-field-label">Admin Email</label>
            <input type="email" id="adminEmailInput" placeholder="admin@gmail.com" class="admin-input" required>
          </div>

          <div class="form-field" style="margin-bottom: 1.5rem;">
            <label class="form-field-label">Password</label>
            <input type="password" id="adminPasswordInput" placeholder="••••••••" class="admin-input" required>
          </div>
          
          <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.75rem; font-size: 0.9rem;">
            Sign In to Console ↗
          </button>
        </form>

        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--admin-border); font-size: 0.75rem; color: var(--text-muted);">
          Whitelisted: <span class="text-mono" style="color: var(--brand-yellow);">${ADMIN_EMAILS.join(', ')}</span>
        </div>

        <div style="margin-top: 1rem;">
          <a href="index.html" style="font-size: 0.8rem; color: var(--text-secondary); text-decoration: none;">
            ← Back to Main Website
          </a>
        </div>
      </div>
    `;
  }

  async handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput')?.value.trim().toLowerCase();
    const password = document.getElementById('adminPasswordInput')?.value;
    if (!email || !password) return;

    if (!isUserAdmin(email)) {
      alert(`Access Denied: "${email}" is not registered in the ADMIN_EMAILS whitelist.`);
      return;
    }

    const res = await db.login({ emailOrUsername: email, password });
    if (res.success) {
      alert(`Welcome to Admin Console, ${res.user.username}!`);
      this.render();
    } else {
      alert(res.message || 'Authentication failed. Please check your credentials.');
    }
  }

  // --------------------------------------------------------------------------
  // 1. OVERVIEW TAB
  // --------------------------------------------------------------------------

  renderOverviewTab(container) {
    const stats = db.getStats();
    const pendingSubmissions = db.submissions.filter(s => s.status === 'pending');
    const recentSubmissions = db.submissions.slice(0, 6);
    const recentUsers = db.users.slice(0, 6);

    container.innerHTML = `
      <div>
        
        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">Admin Dashboard</h1>
            <p class="page-desc">Telemetry overview, pending creator proofs, and passport statistics.</p>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button type="button" class="btn-admin btn-admin-secondary" onclick="window.adminApp.switchTab('quests')">
              + Deploy Quest
            </button>
            <button type="button" class="btn-admin btn-admin-primary" onclick="window.adminApp.switchTab('submissions')">
              Review Queue (${pendingSubmissions.length})
            </button>
          </div>
        </div>

        <!-- 4 Minimalist Metric Tiles -->
        <div class="metrics-row">
          
          <div class="metric-tile">
            <span class="metric-tile-label">Registered Citizens</span>
            <div class="metric-tile-value">${Number(stats.totalUsers).toLocaleString()}</div>
            <div class="metric-tile-sub" style="color: var(--accent-emerald);">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-emerald);"></span>
              Verified Passports
            </div>
          </div>

          <div class="metric-tile">
            <span class="metric-tile-label">Active Quests</span>
            <div class="metric-tile-value" style="color: var(--brand-yellow);">${Number(stats.activeQuestsCount).toLocaleString()}</div>
            <div class="metric-tile-sub">
              <a href="#" onclick="window.adminApp.switchTab('quests')" style="color: var(--brand-yellow); text-decoration: none; font-weight: 600;">Manage Bounties →</a>
            </div>
          </div>

          <div class="metric-tile">
            <span class="metric-tile-label">Pending Proofs</span>
            <div class="metric-tile-value" style="color: ${pendingSubmissions.length > 0 ? 'var(--brand-yellow)' : '#FFFFFF'};">
              ${pendingSubmissions.length}
            </div>
            <div class="metric-tile-sub">
              <a href="#" onclick="window.adminApp.switchTab('submissions')" style="color: var(--brand-yellow); text-decoration: none; font-weight: 600;">Review Queue →</a>
            </div>
          </div>

          <div class="metric-tile">
            <span class="metric-tile-label">Tokens Distributed</span>
            <div class="metric-tile-value">${Number(stats.totalPointsDistributed).toLocaleString()}</div>
            <div class="metric-tile-sub">$BOOBA Points Total</div>
          </div>

        </div>

        <!-- 2 Clean Side-by-Side Tables -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; align-items: start;">
          
          <!-- Pending Proof Reviews -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div>
                <div class="clean-panel-title">Proof Review Queue</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Creator submissions awaiting approval</div>
              </div>
              <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.switchTab('submissions')">
                View All →
              </button>
            </div>

            ${recentSubmissions.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
                No submissions recorded yet.
              </div>
            ` : `
              <div>
                ${recentSubmissions.map(s => `
                  <div class="data-row">
                    <div style="min-width: 0; display: flex; flex-direction: column; gap: 0.2rem;">
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <strong style="color: #FFFFFF; font-size: 0.85rem;">${s.username}</strong>
                        <span class="badge-clean ${s.status === 'approved' ? 'badge-clean-green' : s.status === 'rejected' ? 'badge-clean-red' : 'badge-clean-yellow'}">
                          ${s.status}
                        </span>
                      </div>
                      <div style="font-size: 0.76rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${s.questTitle} • +${s.rewardBooba} BOOBA
                      </div>
                    </div>

                    ${s.status === 'pending' ? `
                      <button class="btn-admin btn-admin-primary btn-admin-sm" onclick="window.adminApp.handleReview('${s.id}', 'approved')">
                        Approve
                      </button>
                    ` : `
                      <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">${s.submittedAt ? s.submittedAt.slice(0, 10) : ''}</span>
                    `}
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Recent Citizens -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div>
                <div class="clean-panel-title">Citizens & Passports</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Newly registered community members</div>
              </div>
              <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.switchTab('users')">
                View All →
              </button>
            </div>

            ${recentUsers.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
                No registered passports yet.
              </div>
            ` : `
              <div>
                ${recentUsers.map(u => `
                  <div class="data-row">
                    <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
                      <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--brand-yellow); object-fit: cover; flex-shrink: 0;">
                      <div style="min-width: 0;">
                        <strong style="color: #FFFFFF; font-size: 0.85rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.username}</strong>
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${u.passportId}</span>
                      </div>
                    </div>
                    <div style="font-weight: 800; color: var(--brand-yellow); font-size: 0.85rem; font-family: var(--font-mono); flex-shrink: 0;">
                      ${Number(u.boobaPoints || 0).toLocaleString()} B
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 2. QUESTS TAB (CREATE & MANAGE)
  // --------------------------------------------------------------------------

  renderQuestsTab(container) {
    const quests = db.quests || [];

    container.innerHTML = `
      <div>
        
        <div class="page-header">
          <div>
            <h1 class="page-title">Quests Studio</h1>
            <p class="page-desc">Publish and manage community, engagement, and creator bounties.</p>
          </div>
          <span class="badge-clean badge-clean-green">${quests.length} Live Bounties</span>
        </div>

        <div style="display: grid; grid-template-columns: minmax(300px, 1fr) minmax(360px, 1.4fr); gap: 1.75rem; align-items: start;">
          
          <!-- Quest Creator Panel -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div class="clean-panel-title">Deploy New Bounty</div>
            </div>
            
            <form onsubmit="window.adminApp.handleCreateQuest(event)" style="padding: 1.25rem;">
              <div class="form-field">
                <label class="form-field-label">Quest Title *</label>
                <input type="text" id="newQuestTitle" placeholder="e.g. Follow @BoobaToken on X" class="admin-input" required>
              </div>

              <div class="form-field">
                <label class="form-field-label">Instructions *</label>
                <textarea id="newQuestDesc" rows="2" placeholder="Explain the exact instructions for the citizen..." class="admin-input" required></textarea>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div class="form-field">
                  <label class="form-field-label">Category *</label>
                  <select id="newQuestCategory" class="admin-input">
                    <option value="community">Community</option>
                    <option value="engagement">Engagement</option>
                    <option value="content">Content Production</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Reward ($BOOBA) *</label>
                  <input type="number" id="newQuestReward" value="150" class="admin-input" required>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div class="form-field">
                  <label class="form-field-label">Verification *</label>
                  <select id="newQuestType" class="admin-input">
                    <option value="social">Social Link Action</option>
                    <option value="proof">Proof Submission</option>
                    <option value="instant">Instant Claim</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Target URL</label>
                  <input type="url" id="newQuestUrl" placeholder="https://x.com/..." class="admin-input">
                </div>
              </div>

              <div class="form-field" style="margin-bottom: 1.25rem;">
                <label class="form-field-label">Requirements Note</label>
                <input type="text" id="newQuestReqs" placeholder="e.g. Submit post link" class="admin-input">
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.65rem;">
                Publish Bounty Live ↗
              </button>
            </form>
          </div>

          <!-- Existing Quests Table -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div class="clean-panel-title">Active Database Quests (${quests.length})</div>
            </div>
            
            <div style="overflow-x: auto;">
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>Bounty</th>
                    <th>Category</th>
                    <th>Reward</th>
                    <th>Action Link</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${quests.length === 0 ? `
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        No quests found in database.
                      </td>
                    </tr>
                  ` : quests.map(q => `
                    <tr>
                      <td>
                        <strong style="color: #FFFFFF; display: block; font-size: 0.85rem;">${q.title}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">${q.description ? q.description.slice(0, 50) + '...' : ''}</span>
                      </td>
                      <td>
                        <span class="badge-clean badge-clean-yellow" style="text-transform: uppercase;">${q.category}</span>
                      </td>
                      <td style="font-weight: 700; color: var(--brand-yellow); font-family: var(--font-mono);">
                        +${Number(q.rewardBooba).toLocaleString()}
                      </td>
                      <td>
                        ${q.targetUrl ? `
                          <a href="${q.targetUrl}" target="_blank" style="color: var(--text-secondary); text-decoration: none; font-size: 0.78rem;">
                            Test Link ↗
                          </a>
                        ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>'}
                      </td>
                      <td style="text-align: right;">
                        <button class="btn-admin btn-admin-danger btn-admin-sm" onclick="window.adminApp.handleDeleteQuest('${q.id}')">
                          Delete
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  async handleCreateQuest(e) {
    e.preventDefault();
    const title = document.getElementById('newQuestTitle')?.value.trim();
    const description = document.getElementById('newQuestDesc')?.value.trim();
    const category = document.getElementById('newQuestCategory')?.value;
    const rewardBooba = document.getElementById('newQuestReward')?.value;
    const type = document.getElementById('newQuestType')?.value;
    const targetUrl = document.getElementById('newQuestUrl')?.value.trim();
    const requirements = document.getElementById('newQuestReqs')?.value.trim();

    if (!title || !description) return;

    if ((category === 'community' || category === 'engagement') && !targetUrl) {
      alert('Target Action Link is compulsory for Community and Engagement quests!');
      document.getElementById('newQuestUrl')?.focus();
      return;
    }

    const res = await db.createQuest({
      title,
      description,
      category,
      rewardBooba,
      type,
      targetUrl,
      requirements
    });

    if (res.success) {
      alert('Quest published live!');
      this.render();
    } else {
      alert(res.message || 'Failed to create quest');
    }
  }

  async handleDeleteQuest(questId) {
    const quest = (db.quests || []).find(q => q.id === questId);
    const questTitle = quest ? quest.title : 'this quest';
    const adminUser = db.currentUser?.username || 'Admin';
    const adminEmail = db.currentUser?.email || '';

    const confirmMsg = `CONFIRM QUEST DELETION:\n\n` +
      `• Bounty: "${questTitle}"\n` +
      `• Action: Permanent removal from database and app\n` +
      `• Executing Admin: @${adminUser} ${adminEmail ? `(${adminEmail})` : ''}\n\n` +
      `Do you want to proceed with deleting this quest?`;

    if (!confirm(confirmMsg)) return;

    const res = await db.deleteQuest(questId);
    if (res.success) {
      alert(`✅ Quest "${res.questTitle || questTitle}" was successfully deleted by Admin @${res.deletedBy || adminUser}.`);
      this.render();
    } else {
      alert(res.message || 'Failed to delete quest');
    }
  }

  // --------------------------------------------------------------------------
  // 3. PROOF SUBMISSIONS TAB (REVIEW & APPROVE)
  // --------------------------------------------------------------------------

  renderSubmissionsTab(container) {
    const allSubmissions = db.submissions || [];
    const pendingCount = allSubmissions.filter(s => s.status === 'pending').length;
    const approvedCount = allSubmissions.filter(s => s.status === 'approved').length;
    const rejectedCount = allSubmissions.filter(s => s.status === 'rejected').length;

    let filtered = allSubmissions;
    if (this.submissionFilter !== 'all') {
      filtered = allSubmissions.filter(s => s.status === this.submissionFilter);
    }

    container.innerHTML = `
      <div>
        
        <div class="page-header">
          <div>
            <h1 class="page-title">Proof Review Queue</h1>
            <p class="page-desc">Review creator content links and release $BOOBA tokens to passports.</p>
          </div>
        </div>

        <!-- Filter Segmented Tabs -->
        <div class="segmented-nav">
          <button type="button" class="segmented-btn ${this.submissionFilter === 'all' ? 'active' : ''}" onclick="window.adminApp.switchSubmissionsFilter('all')">
            All (${allSubmissions.length})
          </button>
          <button type="button" class="segmented-btn ${this.submissionFilter === 'pending' ? 'active' : ''}" onclick="window.adminApp.switchSubmissionsFilter('pending')">
            Pending (${pendingCount})
          </button>
          <button type="button" class="segmented-btn ${this.submissionFilter === 'approved' ? 'active' : ''}" onclick="window.adminApp.switchSubmissionsFilter('approved')">
            Approved (${approvedCount})
          </button>
          <button type="button" class="segmented-btn ${this.submissionFilter === 'rejected' ? 'active' : ''}" onclick="window.adminApp.switchSubmissionsFilter('rejected')">
            Rejected (${rejectedCount})
          </button>
        </div>

        <div class="clean-panel">
          <div style="overflow-x: auto;">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>Bounty</th>
                  <th>Reward</th>
                  <th>Submitted Proof Link</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th style="text-align: right;">Review Action</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                      No ${this.submissionFilter !== 'all' ? this.submissionFilter : ''} submissions found.
                    </td>
                  </tr>
                ` : filtered.map(s => `
                  <tr>
                    <td>
                      <strong style="color: #FFFFFF; font-size: 0.85rem; display: block;">${s.username}</strong>
                      <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${s.passportId}</span>
                    </td>
                    <td style="color: var(--text-secondary); font-size: 0.82rem;">
                      ${s.questTitle}
                    </td>
                    <td style="font-weight: 700; color: var(--brand-yellow); font-family: var(--font-mono);">
                      +${s.rewardBooba}
                    </td>
                    <td>
                      ${s.proofUrl ? `
                        <a href="${s.proofUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-admin-sm" style="font-size: 0.74rem;">
                          Open Link ↗
                        </a>
                      ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">No link</span>'}
                    </td>
                    <td style="font-size: 0.78rem; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${s.proofDescription || '—'}
                    </td>
                    <td>
                      <span class="badge-clean ${s.status === 'approved' ? 'badge-clean-green' : s.status === 'rejected' ? 'badge-clean-red' : 'badge-clean-yellow'}">
                        ${s.status}
                      </span>
                    </td>
                    <td style="text-align: right;">
                      ${s.status === 'pending' ? `
                        <div style="display: inline-flex; gap: 0.4rem;">
                          <button class="btn-admin btn-admin-primary btn-admin-sm" onclick="window.adminApp.handleReview('${s.id}', 'approved')">
                            Approve
                          </button>
                          <button class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.handleReview('${s.id}', 'rejected')" style="color: var(--accent-ruby);">
                            Reject
                          </button>
                        </div>
                      ` : `
                        <span style="font-size: 0.74rem; color: var(--text-muted);">Reviewed</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  }

  switchSubmissionsFilter(filter) {
    this.submissionFilter = filter;
    this.renderSubmissionsTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  async handleReview(submissionId, action) {
    const res = await db.reviewSubmission(submissionId, action);
    if (res.success) {
      alert(`Submission marked as ${action}!`);
      this.render();
    } else {
      alert(res.message || 'Review failed');
    }
  }

  // --------------------------------------------------------------------------
  // 4. TOKEN & AIRDROP TAB
  // --------------------------------------------------------------------------

  getAirdropRecipients() {
    const allUsers = db.users || [];
    if (this.airdropTargetMode === 'top_n') {
      const sorted = [...allUsers].sort((a, b) => (Number(b.boobaPoints) || 0) - (Number(a.boobaPoints) || 0));
      const count = Math.max(1, Number(this.airdropTopCount) || 15);
      return sorted.slice(0, count);
    }
    
    if (this.airdropTargetMode === 'search_select') {
      if (this.airdropSelectedUserIds.size > 0) {
        return allUsers.filter(u => this.airdropSelectedUserIds.has(String(u.id)));
      }
      if (this.airdropSearchQuery) {
        const q = this.airdropSearchQuery.toLowerCase();
        return allUsers.filter(u =>
          (u.username && u.username.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.walletAddress && u.walletAddress.toLowerCase().includes(q)) ||
          (u.passportId && u.passportId.toLowerCase().includes(q))
        );
      }
      return [];
    }

    if (this.airdropTargetMode === 'active') {
      return allUsers.filter(u => (Number(u.completedQuestsCount) || 0) > 0);
    }

    return [...allUsers];
  }

  renderAirdropTab(container) {
    const logs = db.airdropLogs || [];
    const allUsers = db.users || [];
    const usersCount = allUsers.length;
    const recipients = this.getAirdropRecipients();
    const amount = Number(this.airdropAmount) || 500;
    const totalOutflow = recipients.length * amount;

    let filteredPickerUsers = allUsers;
    if (this.airdropSearchQuery) {
      const q = this.airdropSearchQuery.toLowerCase();
      filteredPickerUsers = allUsers.filter(u =>
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.walletAddress && u.walletAddress.toLowerCase().includes(q)) ||
        (u.passportId && u.passportId.toLowerCase().includes(q))
      );
    }

    container.innerHTML = `
      <div>
        
        <!-- Header -->
        <div class="page-header">
          <div>
            <h1 class="page-title">Token & Airdrop Hub</h1>
            <p class="page-desc">Execute batch token distributions to highest holders, active questers, or custom user lists.</p>
          </div>

          <div style="display: flex; gap: 1rem; align-items: center;">
            <div style="text-align: right;">
              <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Recipients</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">${recipients.length} Accounts</div>
            </div>
            <div style="width: 1px; height: 28px; background: var(--admin-border);"></div>
            <div style="text-align: right;">
              <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Outflow</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; font-family: var(--font-mono);">${totalOutflow.toLocaleString()} $BOOBA</div>
            </div>
          </div>
        </div>

        <!-- Target Mode Segmented Navigation -->
        <div class="segmented-nav">
          <button type="button" class="segmented-btn ${this.airdropTargetMode === 'top_n' ? 'active' : ''}" onclick="window.adminApp.switchAirdropMode('top_n')">
            Highest Holders (Top N)
          </button>
          <button type="button" class="segmented-btn ${this.airdropTargetMode === 'search_select' ? 'active' : ''}" onclick="window.adminApp.switchAirdropMode('search_select')">
            Search Citizen
          </button>
          <button type="button" class="segmented-btn ${this.airdropTargetMode === 'all' ? 'active' : ''}" onclick="window.adminApp.switchAirdropMode('all')">
            All Passports (${usersCount})
          </button>
          <button type="button" class="segmented-btn ${this.airdropTargetMode === 'active' ? 'active' : ''}" onclick="window.adminApp.switchAirdropMode('active')">
            Active Questers
          </button>
        </div>

        <!-- Main Form Panel -->
        <div class="clean-panel" style="margin-bottom: 2rem;">
          <div style="padding: 1.5rem;">
            
            ${this.airdropTargetMode === 'top_n' ? `
              <div style="margin-bottom: 1.5rem;">
                <label class="form-field-label" style="display: block; margin-bottom: 0.5rem;">Quick Presets</label>
                <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem;">
                  ${[10, 15, 30, 50, 100, 500, 1000, 2000].map(cnt => `
                    <button type="button" class="btn-admin ${Number(this.airdropTopCount) === cnt ? 'btn-admin-primary' : 'btn-admin-secondary'} btn-admin-sm" onclick="window.adminApp.setAirdropTopCount(${cnt})">
                      Top ${cnt}
                    </button>
                  `).join('')}
                </div>

                <div class="form-field" style="max-width: 320px;">
                  <label class="form-field-label">Custom Highest Count</label>
                  <input type="number" id="airdropTopInput" value="${this.airdropTopCount}" min="1" max="${Math.max(1, usersCount)}" class="admin-input" style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-yellow);" oninput="window.adminApp.setAirdropTopCount(this.value)">
                </div>
              </div>
            ` : ''}

            ${this.airdropTargetMode === 'search_select' ? `
              <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                  <label class="form-field-label">Search Username, Wallet, or Email</label>
                  <div style="display: flex; gap: 0.4rem;">
                    <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.toggleBulkPasteModal()">
                      📋 Bulk Paste
                    </button>
                    <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.clearSelectedAirdropUsers()">
                      Clear
                    </button>
                  </div>
                </div>

                <input type="text" id="airdropSearchInput" placeholder="Search by @username, 0x wallet address, or email..." value="${this.airdropSearchQuery}" oninput="window.adminApp.handleAirdropSearch(this.value)" class="admin-input" style="margin-bottom: 0.75rem;">

                ${this.airdropShowBulkPaste ? `
                  <div style="background: var(--admin-bg); border: 1px dashed var(--admin-border); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.78rem; font-weight: 600; color: var(--brand-yellow); margin-bottom: 0.35rem;">Paste addresses, emails, or usernames separated by commas or lines:</div>
                    <textarea id="bulkPasteInput" rows="3" placeholder="0x123..., alice@gmail.com, @Bob..." class="admin-input" style="font-family: var(--font-mono); font-size: 0.8rem; margin-bottom: 0.5rem;"></textarea>
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                      <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.toggleBulkPasteModal()">Cancel</button>
                      <button type="button" class="btn-admin btn-admin-primary btn-admin-sm" onclick="window.adminApp.processBulkPasteRecipients()">Match & Select</button>
                    </div>
                  </div>
                ` : ''}

                <!-- User Selection Rows -->
                <div style="max-height: 220px; overflow-y: auto; border: 1px solid var(--admin-border); border-radius: var(--radius-sm);">
                  ${filteredPickerUsers.length === 0 ? `
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.82rem;">No matching citizens found.</div>
                  ` : filteredPickerUsers.map(u => {
                    const isSelected = this.airdropSelectedUserIds.has(String(u.id));
                    return `
                      <div class="data-row" style="cursor: pointer;" onclick="window.adminApp.toggleAirdropUser('${u.id}')">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                          <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.adminApp.toggleAirdropUser('${u.id}')" style="cursor: pointer; accent-color: var(--brand-yellow);">
                          <strong style="color: #FFFFFF; font-size: 0.85rem;">${u.username}</strong>
                          <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${u.walletAddress ? `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}` : (u.email || u.passportId)}</span>
                        </div>
                        <div style="font-weight: 700; color: var(--brand-yellow); font-size: 0.82rem; font-family: var(--font-mono);">
                          ${Number(u.boobaPoints || 0).toLocaleString()} B
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Distribution Parameters -->
            <form onsubmit="window.adminApp.handleAirdrop(event)">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
                <div class="form-field">
                  <label class="form-field-label">Amount Per User ($BOOBA) *</label>
                  <input type="number" id="airdropAmount" value="${this.airdropAmount}" class="admin-input" style="font-weight: 800; font-family: var(--font-mono); color: var(--brand-yellow);" oninput="window.adminApp.handleAmountChange(this.value)" required>
                </div>

                <div class="form-field">
                  <label class="form-field-label">Campaign Memo / Reason *</label>
                  <input type="text" id="airdropReason" placeholder="e.g. Top 15 Leaderboard Bonus" value="${this.airdropReason}" class="admin-input" required>
                </div>
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.75rem; font-size: 0.9rem;" ${recipients.length === 0 ? 'disabled' : ''}>
                Execute Airdrop: Distribute ${totalOutflow.toLocaleString()} $BOOBA to ${recipients.length} Accounts ↗
              </button>
            </form>

          </div>
        </div>

        <!-- 2 Clean Tables: Preview & Logs -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; align-items: start;">
          
          <!-- Recipient Preview Table -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div class="clean-panel-title">Target Recipients Preview (${recipients.length})</div>
              <span class="badge-clean badge-clean-yellow">+${amount} each</span>
            </div>

            <div style="max-height: 320px; overflow-y: auto;">
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Citizen</th>
                    <th>Current</th>
                    <th style="text-align: right;">After Grant</th>
                  </tr>
                </thead>
                <tbody>
                  ${recipients.length === 0 ? `
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                        No recipients targeted.
                      </td>
                    </tr>
                  ` : recipients.map((u, idx) => `
                    <tr>
                      <td style="color: var(--text-muted); font-size: 0.75rem;">${idx + 1}</td>
                      <td>
                        <strong style="color: #FFFFFF; font-size: 0.85rem; display: block;">${u.username}</strong>
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${u.passportId}</span>
                      </td>
                      <td style="font-family: var(--font-mono); color: var(--text-secondary);">
                        ${Number(u.boobaPoints || 0).toLocaleString()}
                      </td>
                      <td style="text-align: right; font-weight: 800; color: var(--accent-emerald); font-family: var(--font-mono);">
                        ${(Number(u.boobaPoints || 0) + amount).toLocaleString()}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Airdrop Treasury History -->
          <div class="clean-panel">
            <div class="clean-panel-header">
              <div class="clean-panel-title">Airdrop Treasury Logs (${logs.length})</div>
            </div>

            <div style="max-height: 320px; overflow-y: auto;">
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>Campaign / Memo</th>
                    <th>Recipients</th>
                    <th style="text-align: right;">Total Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.length === 0 ? `
                    <tr>
                      <td colspan="3" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                        No airdrop logs recorded yet.
                      </td>
                    </tr>
                  ` : logs.map(l => `
                    <tr>
                      <td>
                        <strong style="color: #FFFFFF; font-size: 0.85rem; display: block;">${l.reason}</strong>
                        <span style="font-size: 0.72rem; color: var(--text-muted);">${l.date} • by ${l.adminUsername}</span>
                      </td>
                      <td style="color: var(--text-secondary); font-size: 0.8rem;">
                        ${l.recipientCount} (+${l.amountPerUser})
                      </td>
                      <td style="text-align: right; font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">
                        +${Number(l.totalDistributed).toLocaleString()} B
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    `;
  }

  switchAirdropMode(mode) {
    this.airdropTargetMode = mode;
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  setAirdropTopCount(count) {
    const num = Math.max(1, parseInt(count, 10) || 1);
    this.airdropTopCount = num;
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  handleAirdropSearch(query) {
    this.airdropSearchQuery = query.trim();
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  handleAmountChange(val) {
    this.airdropAmount = Math.max(1, parseInt(val, 10) || 1);
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  toggleAirdropUser(userId) {
    const idStr = String(userId);
    if (this.airdropSelectedUserIds.has(idStr)) {
      this.airdropSelectedUserIds.delete(idStr);
    } else {
      this.airdropSelectedUserIds.add(idStr);
    }
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  selectAllFilteredAirdropUsers() {
    const allUsers = db.users || [];
    let filtered = allUsers;
    if (this.airdropSearchQuery) {
      const q = this.airdropSearchQuery.toLowerCase();
      filtered = allUsers.filter(u =>
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.walletAddress && u.walletAddress.toLowerCase().includes(q)) ||
        (u.passportId && u.passportId.toLowerCase().includes(q))
      );
    }
    filtered.forEach(u => this.airdropSelectedUserIds.add(String(u.id)));
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  clearSelectedAirdropUsers() {
    this.airdropSelectedUserIds.clear();
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  toggleBulkPasteModal() {
    this.airdropShowBulkPaste = !this.airdropShowBulkPaste;
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  processBulkPasteRecipients() {
    const text = document.getElementById('bulkPasteInput')?.value || '';
    if (!text.trim()) return;

    const rawTokens = text.split(/[\n,; ]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    const allUsers = db.users || [];
    let matchedCount = 0;

    rawTokens.forEach(token => {
      const cleanToken = token.startsWith('@') ? token.slice(1) : token;
      const matched = allUsers.find(u =>
        (u.email && u.email.toLowerCase() === token) ||
        (u.walletAddress && u.walletAddress.toLowerCase() === token) ||
        (u.username && (u.username.toLowerCase() === token || u.username.toLowerCase() === cleanToken)) ||
        (u.passportId && u.passportId.toLowerCase() === token)
      );
      if (matched) {
        this.airdropSelectedUserIds.add(String(matched.id));
        matchedCount++;
      }
    });

    this.airdropShowBulkPaste = false;
    alert(`Matched & selected ${matchedCount} user accounts.`);
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  async handleAirdrop(e) {
    e.preventDefault();
    const recipients = this.getAirdropRecipients();
    const amount = Number(document.getElementById('airdropAmount')?.value) || Number(this.airdropAmount) || 500;
    const reason = document.getElementById('airdropReason')?.value.trim() || 'Treasury Grant';

    if (recipients.length === 0) {
      alert('Error: No target recipients selected.');
      return;
    }

    if (amount <= 0) {
      alert('Error: Amount must be greater than 0.');
      return;
    }

    const totalDistributed = recipients.length * amount;
    let targetDescription = '';

    if (this.airdropTargetMode === 'top_n') {
      targetDescription = `Top ${recipients.length} Highest Holders`;
    } else if (this.airdropTargetMode === 'search_select') {
      targetDescription = `Selected ${recipients.length} Users`;
    } else if (this.airdropTargetMode === 'active') {
      targetDescription = `Active Questers (${recipients.length})`;
    } else {
      targetDescription = `All Registered Passports (${recipients.length})`;
    }

    const confirmMsg = `CONFIRM AIRDROP:\n\n` +
      `• Target: ${targetDescription}\n` +
      `• Recipients: ${recipients.length} accounts\n` +
      `• Amount per user: ${amount.toLocaleString()} $BOOBA\n` +
      `• Total Outflow: ${totalDistributed.toLocaleString()} $BOOBA\n` +
      `• Memo: "${reason}"\n\n` +
      `Execute distribution now?`;

    if (!confirm(confirmMsg)) return;

    const res = await db.distributeAirdrop({
      targetGroup: this.airdropTargetMode,
      topCount: this.airdropTopCount,
      recipientUserIds: recipients.map(u => u.id),
      amountPerUser: amount,
      reason,
      targetDescription
    });

    if (res.success) {
      alert(`🎉 Distributed ${res.totalDistributed.toLocaleString()} $BOOBA tokens to ${res.recipientCount} accounts.`);
      this.airdropSelectedUserIds.clear();
      this.render();
    } else {
      alert(res.message || 'Airdrop distribution failed.');
    }
  }

  // --------------------------------------------------------------------------
  // 5. PASSPORTS & USERS TAB
  // --------------------------------------------------------------------------

  renderUsersTab(container) {
    let users = db.users || [];

    if (this.userSearchQuery) {
      const q = this.userSearchQuery.toLowerCase();
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.walletAddress && u.walletAddress.toLowerCase().includes(q)) ||
        (u.passportId && u.passportId.toLowerCase().includes(q))
      );
    }

    container.innerHTML = `
      <div>
        
        <div class="page-header">
          <div>
            <h1 class="page-title">Citizens & Passports</h1>
            <p class="page-desc">Directory of all genuine community accounts, wallet links, and token balances.</p>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 320px;">
            <input type="text" id="userSearchInput" placeholder="Search username, wallet 0x, email..." value="${this.userSearchQuery}" oninput="window.adminApp.handleUserSearch(this.value)" class="admin-input">
            ${this.userSearchQuery ? `
              <button class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.handleUserSearch('')">
                Clear
              </button>
            ` : ''}
          </div>
        </div>

        <div class="clean-panel">
          <div style="overflow-x: auto;">
            <table class="clean-table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>Email Address</th>
                  <th>Wallet Address</th>
                  <th>Passport ID</th>
                  <th>Tier</th>
                  <th>Quests</th>
                  <th style="text-align: right;">$BOOBA Balance</th>
                </tr>
              </thead>
              <tbody>
                ${users.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                      No matching citizens found in database.
                    </td>
                  </tr>
                ` : users.map(u => {
                  const level = calculateLevel(u.boobaPoints || 0);
                  const hasWallet = u.walletAddress && u.walletAddress.startsWith('0x');
                  return `
                    <tr>
                      <td>
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--brand-yellow); object-fit: cover; flex-shrink: 0;">
                          <div>
                            <strong style="color: #FFFFFF; font-size: 0.88rem; display: block;">${u.username}</strong>
                            <span style="font-size: 0.72rem; color: var(--accent-emerald);">Streak: ${u.streakDays || 1}d</span>
                          </div>
                        </div>
                      </td>
                      <td style="color: var(--text-secondary); font-size: 0.82rem;">
                        ${u.email || '<span style="color: var(--text-muted); font-style: italic;">dApp Wallet User</span>'}
                      </td>
                      <td>
                        ${hasWallet ? `
                          <div style="display: flex; align-items: center; gap: 0.45rem;">
                            <span class="text-mono" style="font-size: 0.78rem; color: var(--text-secondary);">${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}</span>
                            <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" style="padding: 0.15rem 0.45rem; font-size: 0.68rem;" onclick="navigator.clipboard.writeText('${u.walletAddress}'); alert('Copied wallet address: ${u.walletAddress}');" title="Copy Wallet Address">
                              Copy
                            </button>
                          </div>
                        ` : `
                          <span style="color: var(--text-muted); font-size: 0.78rem; font-style: italic;">None</span>
                        `}
                      </td>
                      <td class="text-mono" style="color: var(--brand-yellow); font-weight: 700; font-size: 0.82rem;">
                        ${u.passportId || 'N/A'}
                      </td>
                      <td>
                        <span class="badge-clean badge-clean-yellow" style="text-transform: uppercase;">Lv.${level.level} ${level.title}</span>
                      </td>
                      <td style="color: var(--text-secondary); font-weight: 600; font-size: 0.82rem;">
                        ${u.completedQuestsCount || 0}
                      </td>
                      <td style="text-align: right; font-weight: 800; color: var(--brand-yellow); font-size: 0.95rem;" class="text-mono">
                        ${Number(u.boobaPoints || 0).toLocaleString()}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  handleUserSearch(query) {
    this.userSearchQuery = query.trim();
    this.renderUsersTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }
}

// Attach globally
window.adminApp = new TeamAdminApp();

