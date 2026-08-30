/* ==========================================================================
   BOOBA (BNB baby) — Team Admin Console Logic (teamadmin.js)
   Live Supabase Backend • Whitelist Guard • Professional Web3 Pro Studio
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
    this.airdropTopCount = 15;
    this.airdropSearchQuery = '';
    this.airdropSelectedUserIds = new Set();
    this.airdropAmount = 500;
    this.airdropReason = '';
    this.airdropShowBulkPaste = false;

    const hashTab = (window.location.hash || '').replace('#', '');
    if (['overview', 'quests', 'airdrop', 'submissions', 'users', 'presale'].includes(hashTab)) {
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
      if (['overview', 'quests', 'airdrop', 'submissions', 'users', 'presale'].includes(hashTab) && this.activeTab !== hashTab) {
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
    const container = document.getElementById('adminToastContainer');
    if (!container) {
      alert((type === 'success' ? 'Success: ' : type === 'error' ? 'Error: ' : 'Info: ') + message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    
    let iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--accent-emerald);"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--accent-ruby);"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else if (type === 'notice') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--brand-yellow);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    }

    toast.innerHTML = `
      <div style="flex-shrink: 0; display: flex; align-items: center;">${iconSvg}</div>
      <div style="flex: 1; font-size: 0.84rem; color: #FFFFFF; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  copyToClipboard(text, label = 'Copied to clipboard') {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label}: ${text.length > 20 ? text.slice(0, 8) + '...' + text.slice(-6) : text}`);
    }).catch(() => {
      this.showToast('Failed to copy', 'error');
    });
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
      case 'presale':
        this.renderPresaleTab(mainWorkspace);
        break;
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
      <div style="max-width: 440px; margin: 4rem auto; padding: 2.25rem; border-radius: var(--radius-md); background: var(--admin-surface); border: 1px solid var(--admin-border); text-align: center; box-shadow: var(--shadow-elevated);">
        
        <div style="width: 58px; height: 58px; border-radius: 50%; background: var(--brand-yellow-subtle); border: 1.5px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.35rem auto; color: var(--brand-yellow); box-shadow: 0 0 20px rgba(243, 186, 47, 0.15);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>

        <h2 style="font-size: 1.4rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.35rem; letter-spacing: -0.02em;">
          Core Admin Authentication
        </h2>
        <p style="font-size: 0.84rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1.6rem;">
          Restricted to authorized core team emails registered in the security whitelist.
        </p>

        <form id="adminLoginForm" onsubmit="window.adminApp.handleAdminLogin(event)" style="text-align: left;">
          <div class="form-field">
            <label class="form-field-label">Admin Email</label>
            <input type="email" id="adminEmailInput" placeholder="admin@gmail.com" class="admin-input" required autocomplete="username">
          </div>

          <div class="form-field" style="margin-bottom: 1.5rem;">
            <label class="form-field-label">Password</label>
            <input type="password" id="adminPasswordInput" placeholder="••••••••" class="admin-input" required autocomplete="current-password">
          </div>
          
          <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.8rem; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
            <span>Sign In to Console</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
          </button>
        </form>

        <div style="margin-top: 1.5rem; padding-top: 1.15rem; border-top: 1px solid var(--admin-border); font-size: 0.75rem; color: var(--text-muted);">
          Whitelisted: <span class="text-mono" style="color: var(--brand-yellow); font-weight: 600;">${ADMIN_EMAILS.join(', ')}</span>
        </div>

        <div style="margin-top: 1.25rem;">
          <a href="index.html" style="font-size: 0.82rem; color: var(--text-secondary); text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Back to Main Website</span>
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
      this.showToast(`Access Denied: "${email}" is not in whitelist.`, 'error');
      return;
    }

    const res = await db.login({ emailOrUsername: email, password });
    if (res.success) {
      this.showToast(`Welcome back, ${res.user.username}!`, 'success');
      this.render();
    } else {
      this.showToast(res.message || 'Authentication failed. Check credentials.', 'error');
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
            <p class="page-desc">Telemetry overview, creator proof queue, and live passport statistics.</p>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center;">
            <button type="button" class="btn-admin btn-admin-secondary" onclick="window.adminApp.switchTab('quests')">
              + Deploy Bounty
            </button>
            <button type="button" class="btn-admin btn-admin-primary" onclick="window.adminApp.switchTab('submissions')">
              Review Queue (${pendingSubmissions.length})
            </button>
          </div>
        </div>

        <!-- 4 Minimalist Metric Tiles -->
        <div class="metrics-row">
          
          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Registered Citizens</span>
              <div class="metric-tile-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </div>
            </div>
            <div class="metric-tile-value">${Number(stats.totalUsers).toLocaleString()}</div>
            <div class="metric-tile-sub" style="color: var(--accent-emerald);">
              <span class="live-pulse-dot" style="width: 5px; height: 5px;"></span>
              Verified Passports
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Active Quests</span>
              <div class="metric-tile-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: var(--brand-yellow);">${Number(stats.activeQuestsCount).toLocaleString()}</div>
            <div class="metric-tile-sub">
              <a href="#" onclick="window.adminApp.switchTab('quests')" style="color: var(--brand-yellow); text-decoration: none; font-weight: 600;">Manage Bounties →</a>
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Pending Proofs</span>
              <div class="metric-tile-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: ${pendingSubmissions.length > 0 ? 'var(--brand-yellow)' : '#FFFFFF'};">
              ${pendingSubmissions.length}
            </div>
            <div class="metric-tile-sub">
              <a href="#" onclick="window.adminApp.switchTab('submissions')" style="color: var(--brand-yellow); text-decoration: none; font-weight: 600;">Review Queue →</a>
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Tokens Distributed</span>
              <div class="metric-tile-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M17 10l-5-5-5 5"></path></svg>
              </div>
            </div>
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
              <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
                No submissions recorded yet.
              </div>
            ` : `
              <div>
                ${recentSubmissions.map(s => `
                  <div class="data-row">
                    <div style="min-width: 0; display: flex; flex-direction: column; gap: 0.25rem;">
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <strong style="color: #FFFFFF; font-size: 0.85rem;">${s.username}</strong>
                        <span class="badge-clean ${s.status === 'approved' ? 'badge-clean-green' : s.status === 'rejected' ? 'badge-clean-red' : 'badge-clean-yellow'}">
                          <span style="width: 5px; height: 5px; border-radius: 50%; background: currentColor;"></span>
                          ${s.status}
                        </span>
                      </div>
                      <div style="font-size: 0.76rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${s.questTitle} • <span style="color: var(--brand-yellow); font-family: var(--font-mono); font-weight: 600;">+${s.rewardBooba} BOOBA</span>
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
              <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
                No registered passports yet.
              </div>
            ` : `
              <div>
                ${recentUsers.map(u => `
                  <div class="data-row">
                    <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                      <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--brand-yellow); object-fit: cover; flex-shrink: 0;">
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
        
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 class="page-title">Quests Studio</h1>
            <p class="page-desc">Publish, test, and manage community bounties and reward allocations.</p>
          </div>
          <span class="badge-clean badge-clean-green" style="font-size: 0.78rem; padding: 0.35rem 0.85rem;">
            <span class="live-pulse-dot" style="width: 6px; height: 6px;"></span>
            ${quests.length} Active Bounties
          </span>
        </div>

        <!-- Mobile-Only Sub-Tab Switcher -->
        <div class="admin-mobile-only" style="margin-bottom: 1.25rem;">
          <div class="segmented-nav" style="width: 100%; display: flex; margin-bottom: 0;">
            <button type="button" class="segmented-btn ${(!this.questStudioTab || this.questStudioTab === 'list') ? 'active' : ''}" onclick="window.adminApp.switchQuestStudioTab('list')" style="flex: 1; text-align: center; justify-content: center; display: inline-flex; align-items: center; gap: 0.35rem;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              <span>Active Bounties (${quests.length})</span>
            </button>
            <button type="button" class="segmented-btn ${this.questStudioTab === 'create' ? 'active' : ''}" onclick="window.adminApp.switchQuestStudioTab('create')" style="flex: 1; text-align: center; justify-content: center; display: inline-flex; align-items: center; gap: 0.35rem;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Deploy Bounty</span>
            </button>
          </div>
        </div>

        <div class="quest-studio-layout">
          
          <!-- Quest Creator Panel -->
          <div class="clean-panel ${this.questStudioTab === 'list' ? 'admin-desktop-only' : ''}" id="questCreatorPanel">
            <div class="clean-panel-header">
              <div class="clean-panel-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Deploy New Bounty
              </div>
            </div>
            
            <form onsubmit="window.adminApp.handleCreateQuest(event)" style="padding: 1.35rem;">
              <div class="form-field">
                <label class="form-field-label">Quest Title *</label>
                <input type="text" id="newQuestTitle" placeholder="e.g. Follow @BoobaToken on X" class="admin-input" required>
              </div>

              <div class="form-field">
                <label class="form-field-label">Instructions *</label>
                <textarea id="newQuestDesc" rows="2" placeholder="Explain the exact steps for the citizen..." class="admin-input" required></textarea>
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
                  <input type="number" id="newQuestReward" value="150" class="admin-input" required style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-yellow);">
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div class="form-field">
                  <label class="form-field-label">Verification Mode *</label>
                  <select id="newQuestType" class="admin-input">
                    <option value="social">Social Link Action (Instant coins on click)</option>
                    <option value="proof">Proof Submission (Coins on Admin Approval)</option>
                    <option value="instant">Streak Matrix (Daily check-in claim)</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Target Action URL *</label>
                  <input type="url" id="newQuestUrl" placeholder="https://x.com/... or https://t.me/..." class="admin-input">
                </div>
              </div>

              <div class="form-field" style="margin-bottom: 1.35rem;">
                <label class="form-field-label">Requirements / Instructions Note</label>
                <input type="text" id="newQuestReqs" placeholder="e.g. Follow @BoobaToken on X / Submit tweet URL" class="admin-input">
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                <span>Publish Bounty Live</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
              </button>
            </form>
          </div>

          <!-- Existing Quests Table / Mobile Cards -->
          <div class="clean-panel ${this.questStudioTab === 'create' ? 'admin-desktop-only' : ''}" id="activeQuestsPanel">
            <div class="clean-panel-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div class="clean-panel-title">Active Database Quests (${quests.length})</div>
              <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm admin-mobile-only" onclick="window.adminApp.switchQuestStudioTab('create')">
                + New Bounty
              </button>
            </div>
            
            <!-- DESKTOP TABLE VIEW -->
            <div class="table-scroll-container admin-desktop-only">
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>Bounty</th>
                    <th>Category</th>
                    <th>Reward</th>
                    <th>Link</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${quests.length === 0 ? `
                    <tr>
                      <td colspan="5" style="text-align: center; padding: 3.5rem; color: var(--text-muted);">
                        No quests found in database.
                      </td>
                    </tr>
                  ` : quests.map(q => `
                    <tr>
                      <td>
                        <strong style="color: #FFFFFF; display: block; font-size: 0.85rem;">${q.title}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">${q.description ? q.description.slice(0, 48) + '...' : ''}</span>
                      </td>
                      <td>
                        <span class="badge-clean badge-clean-yellow" style="text-transform: uppercase;">${q.category}</span>
                      </td>
                      <td style="font-weight: 700; color: var(--brand-yellow); font-family: var(--font-mono);">
                        +${Number(q.rewardBooba).toLocaleString()}
                      </td>
                      <td>
                        ${q.targetUrl ? `
                          <a href="${q.targetUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-admin-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                            <span>Test</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                          </a>
                        ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">—</span>'}
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

            <!-- MOBILE CARDS LIST VIEW -->
            <div class="admin-mobile-only mobile-card-list">
              ${quests.length === 0 ? `
                <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-size: 0.88rem;">
                  No active bounties found in database.<br>
                  <button type="button" class="btn-admin btn-admin-primary btn-admin-sm" style="margin-top: 1rem; display: inline-flex; align-items: center; gap: 0.35rem;" onclick="window.adminApp.switchQuestStudioTab('create')">
                    <span>Deploy First Bounty</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                  </button>
                </div>
              ` : quests.map(q => `
                <div class="mobile-bounty-card">
                  <div class="mobile-card-header">
                    <div style="min-width: 0;">
                      <div class="mobile-card-title">${q.title}</div>
                      <div class="mobile-card-meta">
                        <span class="badge-clean badge-clean-yellow" style="text-transform: uppercase; font-size: 0.68rem;">${q.category}</span>
                        <span class="badge-clean" style="background: rgba(255,255,255,0.06); color: var(--text-secondary); font-size: 0.68rem;">
                          ${q.type === 'social' ? 'Social Link' : q.type === 'proof' ? 'Proof Submission' : 'Streak Matrix'}
                        </span>
                      </div>
                    </div>
                    <div style="font-weight: 800; font-size: 0.95rem; color: var(--brand-yellow); font-family: var(--font-mono); white-space: nowrap;">
                      +${Number(q.rewardBooba).toLocaleString()}
                    </div>
                  </div>

                  <div class="mobile-card-desc">
                    ${q.description || 'No description provided.'}
                  </div>

                  <div class="mobile-card-footer">
                    <div>
                      ${q.targetUrl ? `
                        <a href="${q.targetUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-admin-sm" style="font-size: 0.72rem; padding: 0.35rem 0.65rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                          <span>Test Link</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                        </a>
                      ` : '<span style="color: var(--text-muted); font-size: 0.72rem;">No Link</span>'}
                    </div>
                    <div class="mobile-card-actions">
                      <button type="button" class="btn-admin btn-admin-danger btn-admin-sm" onclick="window.adminApp.handleDeleteQuest('${q.id}')" style="padding: 0.4rem 0.85rem; font-weight: 700; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
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
      this.showToast('Target Action Link is required for Community and Engagement quests!', 'notice');
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
      this.showToast('Quest published live!', 'success');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to create quest', 'error');
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
      this.showToast(`Quest "${res.questTitle || questTitle}" was successfully deleted.`, 'success');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to delete quest', 'error');
    }
  }

  switchQuestStudioTab(tab) {
    this.questStudioTab = tab;
    this.render();
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
          
          <!-- DESKTOP TABLE VIEW -->
          <div class="table-scroll-container admin-desktop-only">
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
                        <a href="${s.proofUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-admin-sm" style="font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                          <span>Open Link</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                        </a>
                      ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">No link</span>'}
                    </td>
                    <td style="font-size: 0.78rem; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${s.proofDescription || '—'}
                    </td>
                    <td>
                      <span class="badge-clean ${s.status === 'approved' ? 'badge-clean-green' : s.status === 'rejected' ? 'badge-clean-red' : 'badge-clean-yellow'}">
                        <span style="width: 5px; height: 5px; border-radius: 50%; background: currentColor;"></span>
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

          <!-- MOBILE SMART CARDS VIEW -->
          <div class="admin-mobile-only mobile-card-list">
            ${filtered.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-size: 0.88rem;">
                No ${this.submissionFilter !== 'all' ? this.submissionFilter : ''} submissions found in review queue.
              </div>
            ` : filtered.map(s => `
              <div class="mobile-submission-card">
                <div class="mobile-card-header">
                  <div>
                    <strong style="color: #FFFFFF; font-size: 0.95rem; display: block;">${s.username}</strong>
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${s.passportId}</span>
                  </div>
                  <span class="badge-clean ${s.status === 'approved' ? 'badge-clean-green' : s.status === 'rejected' ? 'badge-clean-red' : 'badge-clean-yellow'}">
                    ${s.status}
                  </span>
                </div>

                <div>
                  <div style="font-size: 0.88rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.2rem;">${s.questTitle}</div>
                  <div style="font-size: 0.82rem; font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">
                    Reward: +${s.rewardBooba} $BOOBA
                  </div>
                </div>

                ${s.proofDescription ? `
                  <div style="font-size: 0.8rem; color: var(--text-secondary); background: rgba(0,0,0,0.3); padding: 0.6rem 0.8rem; border-radius: 8px; border: 1px solid var(--admin-border-subtle);">
                    ${s.proofDescription}
                  </div>
                ` : ''}

                <div class="mobile-card-footer">
                  <div>
                    ${s.proofUrl ? `
                      <a href="${s.proofUrl}" target="_blank" class="btn-admin btn-admin-secondary btn-admin-sm" style="font-size: 0.74rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                        <span>View Proof</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                      </a>
                    ` : '<span style="color: var(--text-muted); font-size: 0.72rem;">No link</span>'}
                  </div>
                  <div class="mobile-card-actions">
                    ${s.status === 'pending' ? `
                      <button type="button" class="btn-admin btn-admin-primary btn-admin-sm" onclick="window.adminApp.handleReview('${s.id}', 'approved')" style="padding: 0.4rem 0.8rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Approve</span>
                      </button>
                      <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.handleReview('${s.id}', 'rejected')" style="color: var(--accent-ruby); padding: 0.4rem 0.6rem;">
                        Reject
                      </button>
                    ` : `
                      <span style="font-size: 0.75rem; color: var(--text-muted);">Reviewed</span>
                    `}
                  </div>
                </div>
              </div>
            `).join('')}
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
      this.showToast(`Submission marked as ${action}!`, 'success');
      this.render();
    } else {
      this.showToast(res.message || 'Review failed', 'error');
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
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 class="page-title">Token & Airdrop Hub</h1>
            <p class="page-desc">Execute batch token distributions to highest holders, active questers, or custom user lists.</p>
          </div>

          <div class="airdrop-stats-card" style="display: flex; gap: 1.25rem; align-items: center;">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Recipients</div>
              <div style="font-size: 1.1rem; font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">${recipients.length} Accounts</div>
            </div>
            <div style="width: 1px; height: 28px; background: var(--admin-border);"></div>
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Outflow</div>
              <div style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; font-family: var(--font-mono);">${totalOutflow.toLocaleString()} $BOOBA</div>
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
          <div style="padding: 1.35rem;">
            
            ${this.airdropTargetMode === 'top_n' ? `
              <div style="margin-bottom: 1.35rem;">
                <label class="form-field-label" style="display: block; margin-bottom: 0.5rem;">Quick Presets</label>
                <div class="airdrop-presets-grid" style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem;">
                  ${[10, 15, 30, 50, 100, 500, 1000, 2000].map(cnt => `
                    <button type="button" class="btn-admin ${Number(this.airdropTopCount) === cnt ? 'btn-admin-primary' : 'btn-admin-secondary'} btn-admin-sm" onclick="window.adminApp.setAirdropTopCount(${cnt})">
                      Top ${cnt}
                    </button>
                  `).join('')}
                </div>

                <div class="form-field" style="max-width: 320px; margin-bottom: 0;">
                  <label class="form-field-label">Custom Highest Count</label>
                  <input type="number" id="airdropTopInput" value="${this.airdropTopCount}" min="1" max="${Math.max(1, usersCount)}" class="admin-input" style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-yellow);" oninput="window.adminApp.setAirdropTopCount(this.value)">
                </div>
              </div>
            ` : ''}

            ${this.airdropTargetMode === 'search_select' ? `
              <div style="margin-bottom: 1.35rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                  <label class="form-field-label">Search Username, Wallet, or Email</label>
                  <div style="display: flex; gap: 0.4rem;">
                    <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" onclick="window.adminApp.toggleBulkPasteModal()" style="display: inline-flex; align-items: center; gap: 0.3rem;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                      <span>Bulk Paste</span>
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
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
                <div class="form-field" style="margin-bottom: 0;">
                  <label class="form-field-label">Amount Per User ($BOOBA) *</label>
                  <input type="number" id="airdropAmount" value="${this.airdropAmount}" class="admin-input" style="font-weight: 800; font-family: var(--font-mono); color: var(--brand-yellow);" oninput="window.adminApp.handleAmountChange(this.value)" required>
                </div>

                <div class="form-field" style="margin-bottom: 0;">
                  <label class="form-field-label">Campaign Memo / Reason *</label>
                  <input type="text" id="airdropReason" placeholder="e.g. Top 15 Leaderboard Bonus" value="${this.airdropReason}" class="admin-input" required>
                </div>
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; padding: 0.85rem 1rem; font-size: 0.88rem; font-weight: 800; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; border-radius: 12px;" ${recipients.length === 0 ? 'disabled' : ''}>
                <span style="display: inline-flex; align-items: center; gap: 0.4rem;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  <span>Execute Airdrop: Distribute <strong>${totalOutflow.toLocaleString()} $BOOBA</strong></span>
                </span>
                <span style="font-size: 0.74rem; font-weight: 600; opacity: 0.85;">(${recipients.length} Target Accounts @ ${amount.toLocaleString()} $BOOBA each)</span>
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

            <div class="table-scroll-container" style="max-height: 320px; overflow-y: auto;">
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

            <div class="table-scroll-container" style="max-height: 320px; overflow-y: auto;">
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
    this.showToast(`Matched & selected ${matchedCount} accounts.`, 'success');
    this.renderAirdropTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  async handleAirdrop(e) {
    e.preventDefault();
    const recipients = this.getAirdropRecipients();
    const amount = Number(document.getElementById('airdropAmount')?.value) || Number(this.airdropAmount) || 500;
    const reason = document.getElementById('airdropReason')?.value.trim() || 'Treasury Grant';

    if (recipients.length === 0) {
      this.showToast('Error: No target recipients selected.', 'error');
      return;
    }

    if (amount <= 0) {
      this.showToast('Error: Amount must be greater than 0.', 'error');
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
      this.showToast(`Distributed ${res.totalDistributed.toLocaleString()} $BOOBA to ${res.recipientCount} accounts!`, 'success');
      this.airdropSelectedUserIds.clear();
      this.render();
    } else {
      this.showToast(res.message || 'Airdrop distribution failed.', 'error');
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
          
          <!-- DESKTOP TABLE VIEW -->
          <div class="table-scroll-container admin-desktop-only">
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
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid ${level.accentColor}; object-fit: cover; flex-shrink: 0; box-shadow: 0 0 8px ${level.glowColor};">
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
                            <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" style="padding: 0.15rem 0.45rem; font-size: 0.68rem;" onclick="window.adminApp.copyToClipboard('${u.walletAddress}', 'Wallet address')" title="Copy Wallet Address">
                              Copy
                            </button>
                          </div>
                        ` : `
                          <span style="color: var(--text-muted); font-size: 0.78rem; font-style: italic;">None</span>
                        `}
                      </td>
                      <td class="text-mono" style="color: ${level.accentColor}; font-weight: 700; font-size: 0.82rem;">
                        ${u.passportId || 'N/A'}
                      </td>
                      <td>
                        <span class="badge-clean" style="background: ${level.glowColor}; color: ${level.accentColor}; border: 1px solid ${level.borderColor}; font-weight: 800; font-size: 0.72rem; text-transform: uppercase;">Lv.${level.level} ${level.title}</span>
                      </td>
                      <td style="color: var(--text-secondary); font-weight: 600; font-size: 0.82rem;">
                        ${u.completedQuestsCount || 0}
                      </td>
                      <td style="text-align: right; font-weight: 800; color: ${level.accentColor}; font-size: 0.95rem;" class="text-mono">
                        ${Number(u.boobaPoints || 0).toLocaleString()}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- MOBILE SMART CARDS VIEW -->
          <div class="admin-mobile-only mobile-card-list">
            ${users.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); font-size: 0.88rem;">
                No matching citizens found in database.
              </div>
            ` : users.map(u => {
              const level = calculateLevel(u.boobaPoints || 0);
              const hasWallet = u.walletAddress && u.walletAddress.startsWith('0x');
              return `
                <div class="mobile-citizen-card">
                  <div class="mobile-card-header">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                      <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid ${level.accentColor}; object-fit: cover; flex-shrink: 0; box-shadow: 0 0 8px ${level.glowColor};">
                      <div>
                        <strong style="color: #FFFFFF; font-size: 0.92rem; display: block;">${u.username}</strong>
                        <span class="text-mono" style="font-size: 0.72rem; color: ${level.accentColor}; font-weight: 700;">${u.passportId || 'No Passport'}</span>
                      </div>
                    </div>
                    <span class="badge-clean" style="background: ${level.glowColor}; color: ${level.accentColor}; border: 1px solid ${level.borderColor}; font-weight: 800; font-size: 0.7rem;">
                      Lv.${level.level}
                    </span>
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 0.6rem 0.8rem; border-radius: 8px; border: 1px solid var(--admin-border-subtle);">
                    <div>
                      <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase;">Points Balance</div>
                      <div class="text-mono" style="font-size: 1.05rem; font-weight: 800; color: ${level.accentColor};">
                        ${Number(u.boobaPoints || 0).toLocaleString()} <span style="font-size: 0.75rem;">$BOOBA</span>
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase;">Quests Done</div>
                      <div style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF;">
                        ${u.completedQuestsCount || 0}
                      </div>
                    </div>
                  </div>

                  <div class="mobile-card-footer">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${hasWallet ? `0x: ${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}` : (u.email || 'dApp User')}
                    </div>
                    ${hasWallet ? `
                      <button type="button" class="btn-admin btn-admin-secondary btn-admin-sm" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.25rem;" onclick="window.adminApp.copyToClipboard('${u.walletAddress}', 'Wallet address')">
                        <span>Copy Wallet</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

        </div>
      </div>
    `;
  }

  handleUserSearch(query) {
    this.userSearchQuery = query.trim();
    this.renderUsersTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  // --------------------------------------------------------------------------
  // PRESALE & BRIDGE AUDIT TAB (WITH DYNAMIC RATE CONTROLLER & ALLOCATION)
  // --------------------------------------------------------------------------

  renderPresaleTab(container) {
    const telemetry = db.getPresaleTelemetry();
    const users = db.users || [];
    let globalPurchases = [];
    let globalWithdrawals = [];
    try {
      globalPurchases = JSON.parse(localStorage.getItem('booba_global_presale_logs') || '[]');
      globalWithdrawals = JSON.parse(localStorage.getItem('booba_global_withdrawals') || '[]');
    } catch (e) {}

    container.innerHTML = `
      <div class="admin-tab-pane active" id="pane-presale">
        
        <!-- Tab Header -->
        <div class="admin-view-header">
          <div>
            <h1 class="admin-view-title">Presale Rate & Allocation Center</h1>
            <p class="admin-view-subtitle">Set how many $BOOBA tokens to give for any amount of USDT, configure live presale stages, and grant custom allocations.</p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <a href="presale.html" target="_blank" class="btn-admin btn-admin-primary btn-admin-sm">
              <span>View Presale dApp ↗</span>
            </a>
          </div>
        </div>

        <!-- Telemetry Stat Grid -->
        <div class="admin-stat-grid" style="margin-bottom: 2rem;">
          <div class="admin-stat-card">
            <div class="admin-stat-label">Active Presale Rate</div>
            <div class="admin-stat-value" style="color: var(--brand-yellow); font-family: var(--font-mono);">
              1 USDT = ${telemetry.baseRate} $BOOBA
            </div>
            <div class="admin-stat-meta" style="color: var(--accent-emerald);">Price: $${telemetry.stagePriceUsdt} / token</div>
          </div>

          <div class="admin-stat-card">
            <div class="admin-stat-label">Total USDT Collected</div>
            <div class="admin-stat-value" style="color: #26A17B; font-family: var(--font-mono);">$${telemetry.totalUsdtRaised.toLocaleString()}</div>
            <div class="admin-stat-meta">Hard Cap: $${telemetry.hardCapUsdt.toLocaleString()} (${telemetry.progressPercent}%)</div>
          </div>

          <div class="admin-stat-card">
            <div class="admin-stat-label">Total Presale Orders</div>
            <div class="admin-stat-value" style="color: #818CF8; font-family: var(--font-mono);">${telemetry.totalParticipants.toLocaleString()}</div>
            <div class="admin-stat-meta">${globalPurchases.length} logged locally</div>
          </div>

          <div class="admin-stat-card">
            <div class="admin-stat-label">On-Chain Withdrawals</div>
            <div class="admin-stat-value" style="color: var(--accent-emerald); font-family: var(--font-mono);">${globalWithdrawals.length}</div>
            <div class="admin-stat-meta">BNB Smart Chain (BEP-20)</div>
          </div>
        </div>

        <!-- 2-COLUMN ADMIN MANAGERS GRID -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.75rem; margin-bottom: 2.5rem;">
          
          <!-- CARD 1: PRESALE EXCHANGE RATE & STAGE CONFIGURATOR -->
          <div class="admin-card" style="padding: 1.75rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--admin-border);">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(243,186,47,0.15); border: 1px solid rgba(243,186,47,0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              </div>
              <div>
                <h3 class="admin-card-title" style="margin: 0;">Presale Exchange Rate Manager</h3>
                <div style="font-size: 0.74rem; color: var(--text-secondary);">Set token exchange ratios for all buyers</div>
              </div>
            </div>

            <form id="adminPresaleConfigForm" onsubmit="window.adminApp.handleSavePresaleConfig(event)">
              
              <!-- Core Rate Input -->
              <div class="form-field" style="margin-bottom: 1.15rem;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                  <label class="form-field-label" style="margin: 0; color: var(--brand-yellow); font-weight: 800;">
                    $BOOBA Tokens Given per 1 USDT
                  </label>
                  <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">
                    e.g. 200 = ($0.005 / token)
                  </span>
                </div>
                <input type="number" id="adminPresaleRateInput" class="admin-input text-mono" value="${telemetry.baseRate}" min="1" required style="font-size: 1.1rem; font-weight: 800; color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4);">
              </div>

              <!-- Stage Title & Price per Token -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 1.15rem;">
                <div class="form-field">
                  <label class="form-field-label">Stage Name</label>
                  <input type="text" id="adminPresaleStageNameInput" class="admin-input" value="${telemetry.stageName || 'Stage 1: Early Bird Alpha'}" required>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Price / Token (USDT)</label>
                  <input type="number" step="0.0001" id="adminPresalePriceInput" class="admin-input text-mono" value="${telemetry.stagePriceUsdt || 0.005}" required>
                </div>
              </div>

              <!-- Min / Max Limits & Hard Cap -->
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.65rem; margin-bottom: 1.15rem;">
                <div class="form-field">
                  <label class="form-field-label">Min Buy (USDT)</label>
                  <input type="number" id="adminPresaleMinBuyInput" class="admin-input text-mono" value="${telemetry.minBuyUsdt || 10}" required>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Max Buy (USDT)</label>
                  <input type="number" id="adminPresaleMaxBuyInput" class="admin-input text-mono" value="${telemetry.maxBuyUsdt || 10000}" required>
                </div>
                <div class="form-field">
                  <label class="form-field-label">Hard Cap (USDT)</label>
                  <input type="number" id="adminPresaleHardCapInput" class="admin-input text-mono" value="${telemetry.hardCapUsdt || 250000}" required>
                </div>
              </div>

              <!-- Treasury Receiving Wallet -->
              <div class="form-field" style="margin-bottom: 1.5rem;">
                <label class="form-field-label">Presale Treasury Receiving Address (BEP-20)</label>
                <input type="text" id="adminPresaleTreasuryInput" class="admin-input text-mono" value="${telemetry.treasuryAddress}" required style="font-size: 0.8rem;">
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; justify-content: center; font-weight: 800; padding: 0.75rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Save & Apply Presale Settings</span>
              </button>

            </form>
          </div>

          <!-- CARD 2: DIRECT USER ALLOCATION BY USDT CALCULATOR -->
          <div class="admin-card" style="padding: 1.75rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--admin-border);">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line></svg>
              </div>
              <div>
                <h3 class="admin-card-title" style="margin: 0;">Direct $BOOBA Allocation Tool</h3>
                <div style="font-size: 0.74rem; color: var(--text-secondary);">Give any amount of $BOOBA for any amount of USDT</div>
              </div>
            </div>

            <form id="adminCreditPresaleForm" onsubmit="window.adminApp.handleAdminCreditPresaleTokens(event)">
              
              <!-- Select Target User -->
              <div class="form-field" style="margin-bottom: 1.15rem;">
                <label class="form-field-label">Select Recipient Citizen / Passport</label>
                <select id="adminAllocUserSelect" class="admin-input" style="font-size: 0.85rem;">
                  <option value="">-- Choose Registered Citizen --</option>
                  ${users.map(u => `
                    <option value="${u.id}">${u.username} (${u.passportId}) — ${u.walletAddress ? u.walletAddress.slice(0, 8) + '...' : 'No Wallet'}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Or Custom Wallet Address -->
              <div class="form-field" style="margin-bottom: 1.15rem;">
                <label class="form-field-label">Or Enter Destination BEP-20 Wallet Address</label>
                <input type="text" id="adminAllocWalletInput" class="admin-input text-mono" placeholder="0x... Recipient Wallet (if not chosen from list)">
              </div>

              <!-- USDT Paid + Calculated $BOOBA Allocation (Editable) -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 1.15rem;">
                <div class="form-field">
                  <label class="form-field-label">USDT Paid ($)</label>
                  <input type="number" id="adminAllocUsdtInput" class="admin-input text-mono" placeholder="100" min="0" oninput="window.adminApp.handlePresaleAdminUsdtInput(this.value)" required>
                </div>
                <div class="form-field">
                  <label class="form-field-label" style="color: var(--brand-yellow); font-weight: 800;">$BOOBA to Give</label>
                  <input type="number" id="adminAllocTokensInput" class="admin-input text-mono" placeholder="20000" min="1" required style="font-weight: 800; color: var(--brand-yellow);">
                </div>
              </div>

              <!-- Optional Tx Hash -->
              <div class="form-field" style="margin-bottom: 1.5rem;">
                <label class="form-field-label">BSC Transaction Hash (Optional)</label>
                <input type="text" id="adminAllocTxHashInput" class="admin-input text-mono" placeholder="0x... BSC TxID">
              </div>

              <button type="submit" class="btn-admin btn-admin-primary" style="width: 100%; justify-content: center; font-weight: 800; padding: 0.75rem; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Credit $BOOBA Tokens to User</span>
              </button>

            </form>
          </div>

        </div>

        <!-- SECTION 1: PRESALE ORDERS TABLE -->
        <div class="admin-card" style="margin-bottom: 2rem;">
          <div class="admin-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="pulse-dot" style="width: 7px; height: 7px; background: var(--brand-yellow);"></span>
              <h3 class="admin-card-title" style="margin: 0;">Presale USDT Deposit Transactions</h3>
            </div>
            <span class="badge-tag" style="background: rgba(243,186,47,0.15); color: var(--brand-yellow); font-size: 0.72rem;">
              ${globalPurchases.length} Logged
            </span>
          </div>

          <div style="padding: 1.25rem;">
            ${globalPurchases.length === 0 ? `
              <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No presale deposit transactions recorded yet.
              </div>
            ` : `
              <div style="overflow-x: auto;">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User / Passport</th>
                      <th>USDT Paid</th>
                      <th>$BOOBA Tokens</th>
                      <th>Method</th>
                      <th>Tx Hash</th>
                      <th style="text-align: right;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${globalPurchases.map(p => `
                      <tr>
                        <td style="color: var(--text-secondary); white-space: nowrap; font-size: 0.8rem;">
                          ${new Date(p.timestamp).toLocaleString()}
                        </td>
                        <td style="font-weight: 700; color: #FFFFFF;">
                          ${p.username || 'Citizen'} ${p.passportId ? `<span style="font-size: 0.72rem; color: var(--text-muted);">(${p.passportId})</span>` : ''}
                        </td>
                        <td style="font-weight: 800; color: #26A17B; font-family: var(--font-mono);">
                          $${Number(p.usdtAmount).toLocaleString()} USDT
                        </td>
                        <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">
                          ${Number(p.totalTokens).toLocaleString()} $BOOBA
                        </td>
                        <td style="text-transform: uppercase; font-size: 0.72rem; color: var(--text-secondary);">
                          ${p.method === 'web3' ? 'Web3 Direct' : (p.method === 'admin_allocation' ? 'Admin Grant' : 'Treasury')}
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 0.78rem;">
                          <a href="${p.explorerUrl || `https://bscscan.com/tx/${p.txHash}`}" target="_blank" rel="noopener noreferrer" style="color: var(--brand-yellow); text-decoration: none;">
                            ${p.txHash.slice(0, 8)}...${p.txHash.slice(-6)} ↗
                          </a>
                        </td>
                        <td style="text-align: right;">
                          <span class="admin-badge-live" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 6px;">
                            ${p.status || 'Confirmed'}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>

        <!-- SECTION 2: WITHDRAWAL BRIDGE LOGS TABLE -->
        <div class="admin-card">
          <div class="admin-card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="pulse-dot" style="width: 7px; height: 7px; background: var(--accent-emerald);"></span>
              <h3 class="admin-card-title" style="margin: 0;">On-Chain $BOOBA Withdrawal Bridge Logs</h3>
            </div>
            <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); font-size: 0.72rem;">
              ${globalWithdrawals.length} Dispatched
            </span>
          </div>

          <div style="padding: 1.25rem;">
            ${globalWithdrawals.length === 0 ? `
              <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No user token withdrawals recorded yet.
              </div>
            ` : `
              <div style="overflow-x: auto;">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Amount</th>
                      <th>Destination BEP-20 Wallet</th>
                      <th>Tx Hash</th>
                      <th style="text-align: right;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${globalWithdrawals.map(w => `
                      <tr>
                        <td style="color: var(--text-secondary); white-space: nowrap; font-size: 0.8rem;">
                          ${new Date(w.timestamp).toLocaleString()}
                        </td>
                        <td style="font-weight: 700; color: #FFFFFF;">
                          ${w.username || 'Citizen'}
                        </td>
                        <td style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono);">
                          ${Number(w.amount).toLocaleString()} $BOOBA
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 0.78rem; color: #FFFFFF;">
                          ${w.walletAddress.slice(0, 6)}...${w.walletAddress.slice(-4)}
                        </td>
                        <td style="font-family: var(--font-mono); font-size: 0.78rem;">
                          <a href="${w.explorerUrl || `https://bscscan.com/tx/${w.txHash}`}" target="_blank" rel="noopener noreferrer" style="color: var(--brand-yellow); text-decoration: none;">
                            ${w.txHash.slice(0, 8)}...${w.txHash.slice(-6)} ↗
                          </a>
                        </td>
                        <td style="text-align: right;">
                          <span class="admin-badge-live" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 6px;">
                            ${w.status || 'Completed'}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>

      </div>
    `;
  }

  handlePresaleAdminUsdtInput(usdtAmount) {
    const rateInput = document.getElementById('adminPresaleRateInput');
    const rate = rateInput ? Number(rateInput.value) || 200 : 200;
    const tokensInput = document.getElementById('adminAllocTokensInput');
    if (tokensInput && usdtAmount) {
      tokensInput.value = Math.floor(Number(usdtAmount) * rate);
    }
  }

  handleSavePresaleConfig(e) {
    if (e) e.preventDefault();
    const baseRate = Number(document.getElementById('adminPresaleRateInput')?.value) || 200;
    const stageName = document.getElementById('adminPresaleStageNameInput')?.value || 'Stage 1: Early Bird Alpha';
    const stagePriceUsdt = Number(document.getElementById('adminPresalePriceInput')?.value) || 0.005;
    const minBuyUsdt = Number(document.getElementById('adminPresaleMinBuyInput')?.value) || 10;
    const maxBuyUsdt = Number(document.getElementById('adminPresaleMaxBuyInput')?.value) || 10000;
    const hardCapUsdt = Number(document.getElementById('adminPresaleHardCapInput')?.value) || 250000;
    const treasuryAddress = document.getElementById('adminPresaleTreasuryInput')?.value || '0xb46af5a653D60e8891cAd13AB8688138e6361821';

    const res = db.updatePresaleConfig({
      baseRate,
      stageName,
      stagePriceUsdt,
      minBuyUsdt,
      maxBuyUsdt,
      hardCapUsdt,
      treasuryAddress
    });

    if (res.success) {
      this.showToast(`Presale Settings Saved! Rate is now 1 USDT = ${baseRate} $BOOBA`);
      this.render();
    }
  }

  handleAdminCreditPresaleTokens(e) {
    if (e) e.preventDefault();
    const userId = document.getElementById('adminAllocUserSelect')?.value || null;
    const walletAddress = document.getElementById('adminAllocWalletInput')?.value?.trim() || null;
    const usdtAmount = Number(document.getElementById('adminAllocUsdtInput')?.value) || 0;
    const customBoobaTokens = Number(document.getElementById('adminAllocTokensInput')?.value) || 0;
    const txHash = document.getElementById('adminAllocTxHashInput')?.value?.trim() || null;

    if (!userId && !walletAddress) {
      this.showToast('Please select a citizen or enter a wallet address', 'error');
      return;
    }

    if (!customBoobaTokens || customBoobaTokens <= 0) {
      this.showToast('Please enter a valid amount of $BOOBA tokens', 'error');
      return;
    }

    const res = db.adminCreditPresaleTokens({
      userId,
      walletAddress,
      usdtAmount,
      customBoobaTokens,
      txHash,
      notes: 'Admin manual allocation'
    });

    if (res.success) {
      this.showToast(`Successfully credited ${customBoobaTokens.toLocaleString()} $BOOBA!`);
      this.render();
    }
  }
}

// Attach globally
window.adminApp = new TeamAdminApp();


