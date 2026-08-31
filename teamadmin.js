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

    // Update pending badges in sidebar
    const pendingSubmissionsCount = (db.submissions || []).filter(s => s.status === 'pending').length;
    const badgeSub = document.getElementById('pendingSubmissionsBadge');
    if (badgeSub) {
      badgeSub.textContent = pendingSubmissionsCount;
      badgeSub.style.display = pendingSubmissionsCount > 0 ? 'inline-block' : 'none';
    }

    const pendingPresaleCount = (db.presalePurchases || []).filter(p => p.status === 'pending').length;
    const badgePre = document.getElementById('pendingPresaleBadge');
    if (badgePre) {
      badgePre.textContent = pendingPresaleCount;
      badgePre.style.display = pendingPresaleCount > 0 ? 'inline-block' : 'none';
    }

    const pendingWdCount = (db.withdrawals || []).filter(w => w.status === 'pending').length;
    const badgeWd = document.getElementById('pendingWithdrawalsBadge');
    if (badgeWd) {
      badgeWd.textContent = pendingWdCount;
      badgeWd.style.display = pendingWdCount > 0 ? 'inline-block' : 'none';
    }

    switch (this.activeTab) {
      case 'presale':
        this.renderPresaleTab(mainWorkspace);
        break;
      case 'withdrawals':
      case 'withdraw':
        this.renderWithdrawalsTab(mainWorkspace);
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

        <!-- Quick Navigation Panels: Presale & Withdrawals -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="clean-panel" style="padding: 1.15rem; border: 1px solid rgba(243, 186, 47, 0.2); background: rgba(14, 18, 27, 0.85); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <div style="font-size: 0.72rem; color: var(--brand-yellow); font-weight: 800; text-transform: uppercase; margin-bottom: 0.2rem;">⚡ Presale Terminal</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF;">${(db.presalePurchases || []).filter(p => p.status === 'pending').length} Orders Pending Delivery</div>
              <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 0.15rem;">$${db.getPresaleTelemetry().totalUsdtRaised.toLocaleString()} USDT Raised</div>
            </div>
            <button type="button" class="btn-admin btn-admin-primary btn-sm" onclick="window.adminApp.switchTab('presale')" style="font-weight: 800;">
              Manage Presale →
            </button>
          </div>

          <div class="clean-panel" style="padding: 1.15rem; border: 1px solid rgba(16, 185, 129, 0.2); background: rgba(14, 18, 27, 0.85); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <div style="font-size: 0.72rem; color: var(--accent-emerald); font-weight: 800; text-transform: uppercase; margin-bottom: 0.2rem;">🏦 Token Withdrawals Bridge</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF;">${(db.withdrawals || []).filter(w => w.status === 'pending').length} Withdrawals Pending Delivery</div>
              <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 0.15rem;">${(db.withdrawals || []).length} Total Requests</div>
            </div>
            <button type="button" class="btn-admin btn-admin-primary btn-sm" onclick="window.adminApp.switchTab('withdrawals')" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); font-weight: 800;">
              Manage Withdrawals →
            </button>
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
  // PRESALE OPERATIONS & TREASURY TAB
  // --------------------------------------------------------------------------

  renderPresaleTab(container) {
    const telemetry = db.getPresaleTelemetry();
    const users = db.users || [];
    let presaleOrders = db.presalePurchases || [];

    // Initialize presale filter if unset
    if (!this.presaleFilter) this.presaleFilter = 'all';
    if (!this.presaleSearchQuery) this.presaleSearchQuery = '';

    // Apply Filter & Search
    let filteredOrders = [...presaleOrders];
    if (this.presaleFilter === 'pending') {
      filteredOrders = filteredOrders.filter(p => p.status === 'pending');
    } else if (this.presaleFilter === 'completed') {
      filteredOrders = filteredOrders.filter(p => p.status === 'completed');
    } else if (this.presaleFilter === 'rejected') {
      filteredOrders = filteredOrders.filter(p => p.status === 'rejected');
    }

    if (this.presaleSearchQuery) {
      const q = this.presaleSearchQuery.toLowerCase();
      filteredOrders = filteredOrders.filter(p => 
        (p.username && p.username.toLowerCase().includes(q)) ||
        (p.passportId && p.passportId.toLowerCase().includes(q)) ||
        (p.receivingWallet && p.receivingWallet.toLowerCase().includes(q)) ||
        (p.senderWallet && p.senderWallet.toLowerCase().includes(q)) ||
        (p.txHash && p.txHash.toLowerCase().includes(q))
      );
    }

    const pendingCount = presaleOrders.filter(p => p.status === 'pending').length;
    const completedCount = presaleOrders.filter(p => p.status === 'completed').length;
    const rejectedCount = presaleOrders.filter(p => p.status === 'rejected').length;

    container.innerHTML = `
      <div class="admin-tab-pane active" id="pane-presale">
        
        <!-- Header -->
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 class="page-title" style="display: flex; align-items: center; gap: 0.6rem;">
              <span>⚡ Presale Orders & Treasury</span>
            </h1>
            <p class="page-desc">Verify USDT payment receipts, 1-click copy buyer DEX receiving wallets (Trust Wallet / MetaMask), dispatch $BOOBA tokens, and manage treasury settings.</p>
          </div>
          <div style="display: flex; gap: 0.6rem; align-items: center;">
            <a href="presale.html" target="_blank" class="btn-admin btn-admin-primary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 800;">
              <span>View Presale dApp ↗</span>
            </a>
          </div>
        </div>

        <!-- 4 KPI Metric Cards -->
        <div class="metrics-row" style="margin-bottom: 1.75rem;">
          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Pending Token Orders</span>
              <div class="metric-tile-icon" style="color: var(--brand-yellow);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: var(--brand-yellow); font-weight: 900;">${pendingCount}</div>
            <div class="metric-tile-sub" style="color: ${pendingCount > 0 ? 'var(--brand-yellow)' : 'var(--accent-emerald)'}; font-weight: 600;">
              <span class="pulse-dot" style="width: 5px; height: 5px; background: ${pendingCount > 0 ? 'var(--brand-yellow)' : 'var(--accent-emerald)'};"></span>
              ${pendingCount > 0 ? 'Requires Token Delivery' : 'All Orders Delivered'}
            </div>
          </div>


          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Presale Exchange Rate</span>
              <div class="metric-tile-icon" style="color: #818CF8;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: #818CF8; font-size: 1.45rem; font-weight: 900;">1 USDT = ${telemetry.baseRate}</div>
            <div class="metric-tile-sub" style="color: var(--text-secondary);">
              Price: $${telemetry.stagePriceUsdt} / token
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Total Presale Orders</span>
              <div class="metric-tile-icon" style="color: var(--accent-emerald);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: #FFFFFF; font-weight: 900;">${presaleOrders.length}</div>
            <div class="metric-tile-sub" style="color: var(--text-secondary);">
              ${completedCount} Delivered • ${rejectedCount} Rejected
            </div>
          </div>
        </div>

        <!-- 1. PRESALE TREASURY WALLET CONTROLLER -->
        <div style="background: rgba(20, 26, 38, 0.95); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 16px; padding: 1.15rem 1.35rem; margin-bottom: 1.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; gap: 0.85rem; min-width: 0;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(243,186,47,0.15); border: 1.5px solid rgba(243,186,47,0.4); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow); flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 15h0M2 9.5h20"></path></svg>
            </div>
            <div style="min-width: 0;">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.15rem;">
                Official Presale USDT Treasury Wallet:
              </div>
              <div class="text-mono" style="font-size: 0.95rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all;">
                ${telemetry.treasuryAddress || '<span style="color: var(--accent-ruby);">No Treasury Wallet Added</span>'}
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            ${telemetry.treasuryAddress ? `
              <button type="button" class="btn-admin btn-admin-secondary btn-sm" onclick="window.adminApp.copyToClipboard('${telemetry.treasuryAddress}', 'Treasury Wallet')" style="font-weight: 800; padding: 0.5rem 0.85rem;">
                📋 Copy
              </button>
              <button type="button" class="btn-admin btn-admin-primary btn-sm" onclick="window.adminApp.openTreasuryWalletModal()" style="font-weight: 900; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; padding: 0.5rem 1.15rem;">
                ✏️ Change Wallet
              </button>
            ` : `
              <button type="button" class="btn-admin btn-admin-primary btn-sm" onclick="window.adminApp.openTreasuryWalletModal()" style="font-weight: 900; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; padding: 0.5rem 1.25rem;">
                ➕ Add Treasury Wallet
              </button>
            `}
          </div>
        </div>

        <!-- 2. PRIMARY PRESALE ORDERS & FULFILLMENT TABLE -->
        <div class="clean-panel" style="margin-bottom: 1.75rem;">
          
          <div class="clean-panel-header" style="flex-wrap: wrap; gap: 0.85rem; padding: 1.15rem 1.25rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="pulse-dot" style="width: 7px; height: 7px; background: var(--brand-yellow);"></span>
              <h3 class="clean-panel-title" style="margin: 0; font-size: 1.05rem;">
                Presale Payment Orders & Token Dispatch
              </h3>
            </div>

            <!-- Segmented Filter Controls -->
            <div class="segmented-nav" style="margin-bottom: 0;">
              <button type="button" class="segmented-btn ${this.presaleFilter === 'all' ? 'active' : ''}" onclick="window.adminApp.handlePresaleFilterChange('all')">
                All (${presaleOrders.length})
              </button>
              <button type="button" class="segmented-btn ${this.presaleFilter === 'pending' ? 'active' : ''}" onclick="window.adminApp.handlePresaleFilterChange('pending')" style="${pendingCount > 0 ? 'color: var(--brand-yellow); font-weight: 800;' : ''}">
                Pending (${pendingCount})
              </button>
              <button type="button" class="segmented-btn ${this.presaleFilter === 'completed' ? 'active' : ''}" onclick="window.adminApp.handlePresaleFilterChange('completed')">
                Delivered (${completedCount})
              </button>
              <button type="button" class="segmented-btn ${this.presaleFilter === 'rejected' ? 'active' : ''}" onclick="window.adminApp.handlePresaleFilterChange('rejected')">
                Rejected (${rejectedCount})
              </button>
            </div>
          </div>

          <!-- Search Bar -->
          <div style="padding: 0.85rem 1.25rem 0.4rem 1.25rem;">
            <div style="position: relative;">
              <input type="text" class="admin-input" placeholder="Search citizen, passport, DEX wallet, or TxID..." value="${this.presaleSearchQuery}" oninput="window.adminApp.handlePresaleSearch(this.value)" style="border-radius: 8px; font-size: 0.82rem; height: 38px; padding-left: 2.2rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
          </div>

          <!-- Desktop Table View -->
          <div class="table-scroll-container admin-desktop-only" style="padding: 0 0.5rem 0.85rem 0.5rem;">
            ${filteredOrders.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No presale orders match your filter.
              </div>
            ` : `
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>Time & Citizen</th>
                    <th>USDT Paid</th>
                    <th>$BOOBA to Send</th>
                    <th style="min-width: 230px;">DEX Receiving Wallet (Trust Wallet)</th>
                    <th style="text-align: center;">Proof Receipts</th>
                    <th>Status</th>
                    <th style="text-align: right; min-width: 130px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredOrders.map(p => `
                    <tr style="${p.status === 'pending' ? 'background: rgba(243, 186, 47, 0.025);' : ''}">
                      
                      <!-- Time & Citizen -->
                      <td>
                        <div style="font-weight: 800; color: #FFFFFF; font-size: 0.85rem;">
                          ${p.username || 'Citizen'}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                          ${p.passportId ? `<span class="text-mono" style="color: var(--brand-yellow); font-weight: 700;">${p.passportId}</span> • ` : ''}${new Date(p.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      <!-- USDT Paid -->
                      <td>
                        <div style="font-weight: 900; color: #26A17B; font-family: var(--font-mono); font-size: 0.95rem;">
                          $${Number(p.usdtAmount).toLocaleString()}
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">USDT</div>
                      </td>

                      <!-- $BOOBA to Send -->
                      <td>
                        <div style="font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); font-size: 1.05rem;">
                          ${Number(p.totalTokens).toLocaleString()}
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">$BOOBA</div>
                      </td>

                      <!-- DEX Receiving Wallet with 1-Click Copy -->
                      <td>
                        <div class="dex-wallet-pill">
                          <span class="text-mono" style="color: var(--brand-yellow); font-size: 0.76rem; font-weight: 700; flex: 1; word-break: break-all;">
                            ${p.receivingWallet || p.walletAddress || 'No Address'}
                          </span>
                          <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${p.receivingWallet || p.walletAddress}', 'DEX Wallet')" style="font-size: 0.7rem; padding: 0.25rem 0.55rem; white-space: nowrap; font-weight: 800;" title="Copy DEX wallet address">
                            📋 Copy
                          </button>
                        </div>
                      </td>

                      <!-- Payment Screenshot & Delivery Proof -->
                      <td style="text-align: center;">
                        <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: center;">
                          ${p.proofScreenshot ? `
                            <button type="button" class="proof-thumbnail-btn" onclick="window.adminApp.openProofLightbox('${p.proofScreenshot}', 'Buyer Payment Receipt', 'Paid by ${p.username} • $${Number(p.usdtAmount).toLocaleString()} USDT')" title="View buyer's payment receipt">
                              <img src="${p.proofScreenshot}" alt="Payment Proof" class="proof-thumbnail-img">
                              <span style="font-size: 0.65rem; color: var(--brand-yellow); font-weight: 700;">Buyer</span>
                            </button>
                          ` : `
                            <span style="font-size: 0.7rem; color: var(--text-muted);">No Receipt</span>
                          `}

                          ${p.deliveryProofScreenshot ? `
                            <button type="button" class="proof-thumbnail-btn" onclick="window.adminApp.openProofLightbox('${p.deliveryProofScreenshot}', 'Admin Delivery Verification Proof', 'Tokens sent to ${p.receivingWallet}')" style="border-color: rgba(16, 185, 129, 0.5);" title="View admin's delivery proof">
                              <img src="${p.deliveryProofScreenshot}" alt="Delivery Proof" class="proof-thumbnail-img" style="border-color: var(--accent-emerald);">
                              <span style="font-size: 0.65rem; color: var(--accent-emerald); font-weight: 800;">Admin</span>
                            </button>
                          ` : ''}
                        </div>
                      </td>

                      <!-- Status Badge -->
                      <td>
                        ${p.status === 'completed' ? `
                          <span class="badge-clean badge-clean-green" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            ✓ Delivered
                          </span>
                        ` : p.status === 'rejected' ? `
                          <span class="badge-clean badge-clean-red" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            ✕ Rejected
                          </span>
                        ` : `
                          <span class="badge-clean badge-clean-yellow" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            <span class="pulse-dot" style="width: 5px; height: 5px; background: var(--brand-yellow);"></span>
                            Pending
                          </span>
                        `}
                      </td>

                      <!-- Admin Actions -->
                      <td style="text-align: right;">
                        <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
                          ${p.status === 'pending' ? `
                            <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.openFulfillPresaleModal('${p.id}')" style="font-weight: 900; background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 0.35rem 0.65rem;" title="Send tokens, upload screenshot proof, and fulfill">
                              🚀 Deliver & Proof
                            </button>
                            <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.handleRejectPresaleOrder('${p.id}')" style="color: var(--accent-ruby); padding: 0.35rem 0.5rem;" title="Reject submission">
                              ✕
                            </button>
                          ` : `
                            <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openFulfillPresaleModal('${p.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                              Edit
                            </button>
                            <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.handleDeletePresaleOrder('${p.id}')" style="color: var(--text-muted); font-size: 0.72rem; padding: 0.25rem 0.4rem;" title="Delete record">
                              🗑
                            </button>
                          `}
                        </div>
                      </td>

                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>

          <!-- Mobile Cards View -->
          <div class="mobile-card-list admin-mobile-only" style="padding: 0.75rem;">
            ${filteredOrders.length === 0 ? `
              <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No presale submissions found.
              </div>
            ` : filteredOrders.map(p => `
              <div class="mobile-submission-card" style="${p.status === 'pending' ? 'border-color: rgba(243,186,47,0.35); background: rgba(243,186,47,0.02);' : ''}">
                <div class="mobile-card-header">
                  <div>
                    <div class="mobile-card-title">${p.username || 'Citizen'}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                      ${p.passportId ? `<span class="text-mono" style="color: var(--brand-yellow); font-weight: 700;">${p.passportId}</span> • ` : ''}${new Date(p.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    ${p.status === 'completed' ? `
                      <span class="badge-clean badge-clean-green">✓ Delivered</span>
                    ` : p.status === 'rejected' ? `
                      <span class="badge-clean badge-clean-red">✕ Rejected</span>
                    ` : `
                      <span class="badge-clean badge-clean-yellow">🟡 Pending</span>
                    `}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: baseline; background: rgba(0,0,0,0.35); border-radius: 8px; padding: 0.55rem 0.75rem;">
                  <div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">USDT Paid</div>
                    <div style="font-weight: 900; color: #26A17B; font-family: var(--font-mono); font-size: 1.05rem;">
                      $${Number(p.usdtAmount).toLocaleString()}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Tokens to Send</div>
                    <div style="font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); font-size: 1.1rem;">
                      ${Number(p.totalTokens).toLocaleString()} <span style="font-size: 0.72rem;">$BOOBA</span>
                    </div>
                  </div>
                </div>

                <!-- DEX Receiving Wallet Box -->
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(243,186,47,0.25); border-radius: 8px; padding: 0.55rem 0.75rem;">
                  <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">
                    DEX Receiving Wallet (Trust Wallet):
                  </div>
                  <div class="text-mono" style="font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all; margin-bottom: 0.35rem;">
                    ${p.receivingWallet || p.walletAddress || 'No Address'}
                  </div>
                  <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${p.receivingWallet || p.walletAddress}', 'DEX Wallet')" style="width: 100%; font-weight: 800; justify-content: center;">
                    📋 Copy DEX Wallet
                  </button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.35rem; border-top: 1px solid var(--admin-border-subtle); flex-wrap: wrap; gap: 0.4rem;">
                  <div style="display: flex; gap: 0.35rem;">
                    ${p.proofScreenshot ? `
                      <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openProofLightbox('${p.proofScreenshot}', 'Buyer Receipt', '${p.username}')" style="color: var(--brand-yellow); font-weight: 700;">
                        📷 Buyer Proof
                      </button>
                    ` : ''}
                    ${p.deliveryProofScreenshot ? `
                      <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openProofLightbox('${p.deliveryProofScreenshot}', 'Delivery Proof', 'Sent to ${p.receivingWallet}')" style="color: var(--accent-emerald); font-weight: 700;">
                        ✓ Sent Proof
                      </button>
                    ` : ''}
                  </div>

                  <div style="display: flex; gap: 0.35rem;">
                    ${p.status === 'pending' ? `
                      <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.openFulfillPresaleModal('${p.id}')" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); font-weight: 800;">
                        🚀 Deliver & Proof
                      </button>
                      <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.handleRejectPresaleOrder('${p.id}')" style="color: var(--accent-ruby);">
                        ✕
                      </button>
                    ` : `
                      <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openFulfillPresaleModal('${p.id}')">
                        Edit
                      </button>
                    `}
                  </div>
                </div>

              </div>
            `).join('')}
          </div>

        </div>

        <!-- 3. COMPACT PRESALE EXCHANGE RATE & LIMITS CONFIGURATOR -->
        <div class="clean-panel" style="padding: 1.5rem; margin-bottom: 2rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.15rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--admin-border-subtle);">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(243,186,47,0.15); border: 1px solid rgba(243,186,47,0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </div>
            <div>
              <h3 class="clean-panel-title" style="margin: 0;">Presale Pricing & Limit Settings</h3>
              <div style="font-size: 0.72rem; color: var(--text-secondary);">Set token exchange ratios and hard caps for presale rounds</div>
            </div>
          </div>

          <form id="adminPresaleConfigForm" onsubmit="window.adminApp.handleSavePresaleConfig(event)">
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
              
              <div class="form-field">
                <label class="form-field-label" style="color: var(--brand-yellow); font-weight: 800;">
                  Tokens / 1 USDT ($BOOBA)
                </label>
                <input type="number" id="adminPresaleRateInput" class="admin-input text-mono" value="${telemetry.baseRate}" min="1" required style="font-weight: 800; color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); height: 40px;">
              </div>

              <div class="form-field">
                <label class="form-field-label">Stage Title</label>
                <input type="text" id="adminPresaleStageNameInput" class="admin-input" value="${telemetry.stageName || 'Stage 1: Early Bird Alpha'}" required style="height: 40px;">
              </div>

              <div class="form-field">
                <label class="form-field-label">Token Price (USDT)</label>
                <input type="number" step="0.0001" id="adminPresalePriceInput" class="admin-input text-mono" value="${telemetry.stagePriceUsdt || 0.005}" required style="height: 40px;">
              </div>

              <div class="form-field">
                <label class="form-field-label">Min Buy (USDT)</label>
                <input type="number" id="adminPresaleMinBuyInput" class="admin-input text-mono" value="${telemetry.minBuyUsdt || 10}" required style="height: 40px;">
              </div>

              <div class="form-field">
                <label class="form-field-label">Max Buy (USDT)</label>
                <input type="number" id="adminPresaleMaxBuyInput" class="admin-input text-mono" value="${telemetry.maxBuyUsdt || 10000}" required style="height: 40px;">
              </div>

              <div class="form-field">
                <label class="form-field-label">Hard Cap (USDT)</label>
                <input type="number" id="adminPresaleHardCapInput" class="admin-input text-mono" value="${telemetry.hardCapUsdt || 250000}" required style="height: 40px;">
              </div>

            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="btn-admin btn-admin-primary btn-sm" style="font-weight: 800; padding: 0.6rem 1.5rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Save Presale Pricing Settings</span>
              </button>
            </div>

          </form>
        </div>

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // TOKEN WITHDRAWALS & BRIDGE TAB (DEDICATED SECTION)
  // --------------------------------------------------------------------------

  renderWithdrawalsTab(container) {
    let withdrawals = db.withdrawals || [];
    
    if (!this.withdrawalFilter) this.withdrawalFilter = 'all';
    if (!this.withdrawalSearchQuery) this.withdrawalSearchQuery = '';

    let filtered = [...withdrawals];
    if (this.withdrawalFilter === 'pending') {
      filtered = filtered.filter(w => w.status === 'pending');
    } else if (this.withdrawalFilter === 'completed') {
      filtered = filtered.filter(w => w.status === 'completed' || w.status === 'Completed');
    } else if (this.withdrawalFilter === 'rejected') {
      filtered = filtered.filter(w => w.status === 'rejected');
    }

    if (this.withdrawalSearchQuery) {
      const q = this.withdrawalSearchQuery.toLowerCase();
      filtered = filtered.filter(w => 
        (w.username && w.username.toLowerCase().includes(q)) ||
        (w.passportId && w.passportId.toLowerCase().includes(q)) ||
        (w.walletAddress && w.walletAddress.toLowerCase().includes(q)) ||
        (w.sentTxHash && w.sentTxHash.toLowerCase().includes(q)) ||
        (w.txHash && w.txHash.toLowerCase().includes(q))
      );
    }

    const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
    const completedCount = withdrawals.filter(w => w.status === 'completed' || w.status === 'Completed').length;
    const rejectedCount = withdrawals.filter(w => w.status === 'rejected').length;
    const totalRequestedTokens = withdrawals.reduce((acc, w) => acc + (Number(w.amount) || 0), 0);
    const completedTokens = withdrawals.filter(w => w.status === 'completed' || w.status === 'Completed').reduce((acc, w) => acc + (Number(w.amount) || 0), 0);

    container.innerHTML = `
      <div class="admin-tab-pane active" id="pane-withdrawals">
        
        <!-- Header -->
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 class="page-title" style="display: flex; align-items: center; gap: 0.6rem;">
              <span>🏦 On-Chain Token Withdrawals</span>
            </h1>
            <p class="page-desc">1-Click copy citizen BEP-20 destination wallets, dispatch $BOOBA tokens via your wallet app (Trust Wallet / MetaMask), upload sent screenshot proof, and verify disbursements.</p>
          </div>
          <div style="display: flex; gap: 0.6rem; align-items: center;">
            <a href="withdraw.html" target="_blank" class="btn-admin btn-admin-primary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 800;">
              <span>View Withdrawal Page ↗</span>
            </a>
          </div>
        </div>

        <!-- Metric Tiles -->
        <div class="metrics-row" style="margin-bottom: 1.75rem;">
          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Pending Deliveries</span>
              <div class="metric-tile-icon" style="color: var(--brand-yellow);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: var(--brand-yellow); font-weight: 900;">${pendingCount}</div>
            <div class="metric-tile-sub" style="color: ${pendingCount > 0 ? 'var(--brand-yellow)' : 'var(--accent-emerald)'}; font-weight: 600;">
              <span class="pulse-dot" style="width: 5px; height: 5px; background: ${pendingCount > 0 ? 'var(--brand-yellow)' : 'var(--accent-emerald)'};"></span>
              ${pendingCount > 0 ? 'Requires Token Delivery' : 'All Requests Delivered'}
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Tokens Dispatched</span>
              <div class="metric-tile-icon" style="color: var(--accent-emerald);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: var(--accent-emerald); font-weight: 900;">${completedTokens.toLocaleString()}</div>
            <div class="metric-tile-sub" style="color: var(--text-secondary);">
              ${completedCount} Withdrawals Delivered
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Total Requested</span>
              <div class="metric-tile-icon" style="color: var(--brand-yellow);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: #FFFFFF; font-weight: 900;">${totalRequestedTokens.toLocaleString()}</div>
            <div class="metric-tile-sub" style="color: var(--text-secondary);">
              ${withdrawals.length} Total Citizen Requests
            </div>
          </div>

          <div class="metric-tile">
            <div class="metric-tile-header">
              <span class="metric-tile-label">Rejected / Refunded</span>
              <div class="metric-tile-icon" style="color: var(--accent-ruby);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              </div>
            </div>
            <div class="metric-tile-value" style="color: var(--accent-ruby); font-weight: 900;">${rejectedCount}</div>
            <div class="metric-tile-sub" style="color: var(--text-secondary);">
              Points Auto-Refunded
            </div>
          </div>
        </div>

        <!-- WITHDRAWALS MAIN TABLE PANEL -->
        <div class="clean-panel" style="margin-bottom: 2rem;">
          <div class="clean-panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.85rem; padding: 1.15rem 1.25rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="pulse-dot" style="width: 7px; height: 7px; background: var(--accent-emerald);"></span>
              <h3 class="clean-panel-title" style="margin: 0; font-size: 1.05rem;">
                Citizen Token Withdrawal Requests & On-Chain Delivery
              </h3>
            </div>

            <!-- Search and Filter Bar -->
            <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
              <div class="segmented-nav" style="margin-bottom: 0;">
                <button type="button" class="segmented-btn ${this.withdrawalFilter === 'all' ? 'active' : ''}" onclick="window.adminApp.handleWithdrawalFilterChange('all')">
                  All (${withdrawals.length})
                </button>
                <button type="button" class="segmented-btn ${this.withdrawalFilter === 'pending' ? 'active' : ''}" onclick="window.adminApp.handleWithdrawalFilterChange('pending')" style="${pendingCount > 0 ? 'color: var(--brand-yellow); font-weight: 800;' : ''}">
                  Pending (${pendingCount})
                </button>
                <button type="button" class="segmented-btn ${this.withdrawalFilter === 'completed' ? 'active' : ''}" onclick="window.adminApp.handleWithdrawalFilterChange('completed')">
                  Delivered (${completedCount})
                </button>
                <button type="button" class="segmented-btn ${this.withdrawalFilter === 'rejected' ? 'active' : ''}" onclick="window.adminApp.handleWithdrawalFilterChange('rejected')">
                  Rejected (${rejectedCount})
                </button>
              </div>
            </div>
          </div>

          <!-- Search Input -->
          <div style="padding: 0.85rem 1.25rem 0.4rem 1.25rem;">
            <div style="position: relative;">
              <input type="text" class="admin-input" placeholder="Search citizen, passport, BEP-20 wallet, or TxID..." value="${this.withdrawalSearchQuery || ''}" oninput="window.adminApp.handleWithdrawalSearch(this.value)" style="height: 38px; font-size: 0.82rem; padding-left: 2.2rem; border-radius: 8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
          </div>

          <!-- Desktop Table -->
          <div class="table-scroll-container admin-desktop-only" style="padding: 0 0.5rem 0.85rem 0.5rem;">
            ${filtered.length === 0 ? `
              <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No withdrawal requests found matching your filter.
              </div>
            ` : `
              <table class="clean-table">
                <thead>
                  <tr>
                    <th>Time & Citizen</th>
                    <th>$BOOBA to Send</th>
                    <th style="min-width: 230px;">Destination BEP-20 Wallet Address</th>
                    <th style="text-align: center;">Delivery Proof</th>
                    <th>Tx Hash</th>
                    <th>Status</th>
                    <th style="text-align: right; min-width: 130px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map(w => `
                    <tr style="${w.status === 'pending' ? 'background: rgba(243, 186, 47, 0.025);' : ''}">
                      
                      <!-- Time & Citizen -->
                      <td>
                        <div style="font-weight: 800; color: #FFFFFF; font-size: 0.85rem;">
                          ${w.username || 'Citizen'}
                        </div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                          ${w.passportId ? `<span class="text-mono" style="color: var(--brand-yellow); font-weight: 700;">${w.passportId}</span> • ` : ''}${new Date(w.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      <!-- Amount -->
                      <td>
                        <div style="font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); font-size: 1.05rem;">
                          ${Number(w.amount).toLocaleString()}
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">$BOOBA</div>
                      </td>

                      <!-- Destination Wallet with 1-Click Copy -->
                      <td>
                        <div class="dex-wallet-pill">
                          <span class="text-mono" style="color: var(--brand-yellow); font-size: 0.76rem; font-weight: 700; flex: 1; word-break: break-all;">
                            ${w.walletAddress || 'No Wallet Address'}
                          </span>
                          <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${w.walletAddress}', 'Withdrawal Destination Wallet')" style="font-size: 0.7rem; padding: 0.25rem 0.55rem; white-space: nowrap; font-weight: 800;" title="Copy wallet address to paste into Trust Wallet / MetaMask">
                            📋 Copy
                          </button>
                        </div>
                      </td>

                      <!-- Delivery Proof Screenshot -->
                      <td style="text-align: center;">
                        ${w.deliveryProofScreenshot ? `
                          <button type="button" class="proof-thumbnail-btn" onclick="window.adminApp.openProofLightbox('${w.deliveryProofScreenshot}', 'Admin Delivery Verification Proof', 'Sent ${Number(w.amount).toLocaleString()} $BOOBA to ${w.walletAddress}')" style="border-color: rgba(16, 185, 129, 0.5);" title="Click to view delivery proof screenshot">
                            <img src="${w.deliveryProofScreenshot}" alt="Delivery Proof" class="proof-thumbnail-img" style="border-color: var(--accent-emerald);">
                            <span style="font-size: 0.65rem; color: var(--accent-emerald); font-weight: 800;">✓ Sent Proof</span>
                          </button>
                        ` : `
                          <span style="font-size: 0.7rem; color: var(--text-muted);">No Proof</span>
                        `}
                      </td>

                      <!-- Tx Hash Link -->
                      <td>
                        ${(w.sentTxHash || w.txHash) ? `
                          <a href="${w.explorerUrl || `https://bscscan.com/tx/${w.sentTxHash || w.txHash}`}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-emerald); text-decoration: underline; font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700;">
                            ${(w.sentTxHash || w.txHash).slice(0, 8)}... ↗
                          </a>
                        ` : `
                          <span style="font-size: 0.72rem; color: var(--text-muted);">—</span>
                        `}
                      </td>

                      <!-- Status Badge -->
                      <td>
                        ${w.status === 'completed' || w.status === 'Completed' ? `
                          <span class="badge-clean badge-clean-green" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            ✓ Delivered
                          </span>
                        ` : w.status === 'rejected' ? `
                          <span class="badge-clean badge-clean-red" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            ✕ Rejected
                          </span>
                        ` : `
                          <span class="badge-clean badge-clean-yellow" style="font-size: 0.72rem; padding: 0.25rem 0.55rem;">
                            <span class="pulse-dot" style="width: 5px; height: 5px; background: var(--brand-yellow);"></span>
                            Pending
                          </span>
                        `}
                      </td>

                      <!-- Admin Actions -->
                      <td style="text-align: right;">
                        <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
                          ${w.status === 'pending' ? `
                            <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.openFulfillWithdrawalModal('${w.id}')" style="font-weight: 900; background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 0.35rem 0.65rem;" title="Send tokens, upload proof screenshot, and confirm fulfillment">
                              🚀 Deliver & Proof
                            </button>
                            <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.handleRejectWithdrawal('${w.id}')" style="color: var(--accent-ruby); padding: 0.35rem 0.5rem;" title="Reject request and refund points to citizen">
                              ✕
                            </button>
                          ` : `
                            <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openFulfillWithdrawalModal('${w.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.5rem;">
                              Edit
                            </button>
                            <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.handleDeleteWithdrawal('${w.id}')" style="color: var(--text-muted); font-size: 0.72rem; padding: 0.25rem 0.4rem;" title="Delete record">
                              🗑
                            </button>
                          `}
                        </div>
                      </td>

                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>

          <!-- Mobile Cards -->
          <div class="mobile-card-list admin-mobile-only" style="padding: 0.75rem;">
            ${filtered.length === 0 ? `
              <div style="text-align: center; padding: 2rem 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                No user token withdrawals recorded yet.
              </div>
            ` : filtered.map(w => `
              <div class="mobile-bounty-card" style="${w.status === 'pending' ? 'border-color: rgba(243,186,47,0.35);' : ''}">
                <div class="mobile-card-header">
                  <div>
                    <div class="mobile-card-title">${w.username || 'Citizen'}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">${new Date(w.timestamp).toLocaleDateString()}</div>
                  </div>
                  <div>
                    ${w.status === 'completed' || w.status === 'Completed' ? `
                      <span class="badge-clean badge-clean-green">✓ Delivered</span>
                    ` : w.status === 'rejected' ? `
                      <span class="badge-clean badge-clean-red">✕ Rejected</span>
                    ` : `
                      <span class="badge-clean badge-clean-yellow">🟡 Pending</span>
                    `}
                  </div>
                </div>

                <div style="background: rgba(0,0,0,0.35); border-radius: 8px; padding: 0.55rem 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.72rem; color: var(--text-secondary);">Amount to Send:</span>
                  <span style="color: var(--brand-yellow); font-weight: 900; font-family: var(--font-mono); font-size: 1.1rem;">
                    ${Number(w.amount).toLocaleString()} $BOOBA
                  </span>
                </div>

                <!-- Destination Wallet Box -->
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(243,186,47,0.25); border-radius: 8px; padding: 0.55rem 0.75rem;">
                  <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">
                    Destination Wallet (BEP-20):
                  </div>
                  <div class="text-mono" style="font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all; margin-bottom: 0.35rem;">
                    ${w.walletAddress || 'No Wallet Address'}
                  </div>
                  <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${w.walletAddress}', 'Destination Wallet')" style="width: 100%; font-weight: 800; justify-content: center;">
                    📋 Copy Wallet Address
                  </button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.35rem; border-top: 1px solid var(--admin-border-subtle); flex-wrap: wrap; gap: 0.4rem;">
                  <div>
                    ${w.deliveryProofScreenshot ? `
                      <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openProofLightbox('${w.deliveryProofScreenshot}', 'Delivery Proof', 'Sent ${Number(w.amount).toLocaleString()} $BOOBA')" style="color: var(--accent-emerald); font-weight: 700;">
                        ✓ Sent Proof
                      </button>
                    ` : (w.sentTxHash || w.txHash) ? `
                      <a href="${w.explorerUrl || `https://bscscan.com/tx/${w.sentTxHash || w.txHash}`}" target="_blank" rel="noopener noreferrer" style="color: var(--text-secondary); font-size: 0.72rem; text-decoration: underline;">
                        BscScan ↗
                      </a>
                    ` : ''}
                  </div>

                  <div style="display: flex; gap: 0.35rem;">
                    ${w.status === 'pending' ? `
                      <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.openFulfillWithdrawalModal('${w.id}')" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); font-weight: 800;">
                        🚀 Deliver & Proof
                      </button>
                      <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.handleRejectWithdrawal('${w.id}')" style="color: var(--accent-ruby);">
                        ✕
                      </button>
                    ` : `
                      <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.openFulfillWithdrawalModal('${w.id}')">
                        Edit
                      </button>
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

  handlePresaleFilterChange(filter) {
    this.presaleFilter = filter;
    this.renderPresaleTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  handlePresaleSearch(query) {
    this.presaleSearchQuery = query.trim();
    this.renderPresaleTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  handleWithdrawalFilterChange(filter) {
    this.withdrawalFilter = filter;
    this.renderWithdrawalsTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  handleWithdrawalSearch(query) {
    this.withdrawalSearchQuery = query.trim();
    this.renderWithdrawalsTab(document.getElementById('adminWorkspace') || document.getElementById('adminContentBody'));
  }

  copyToClipboard(text, label = 'Address') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label} copied to clipboard!`);
    }).catch(() => {
      prompt(`Copy ${label}:`, text);
    });
  }

  // --------------------------------------------------------------------------
  // PROOF IMAGE LIGHTBOX & UPLOADER HANDLERS
  // --------------------------------------------------------------------------

  openProofLightbox(imageSrc, title = 'Verification Proof', subtitle = '') {
    if (!imageSrc) return;
    const existing = document.getElementById('adminUniversalProofModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminUniversalProofModal';
    modal.className = 'admin-modal-backdrop active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(20px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';
    modal.onclick = () => modal.remove();

    modal.innerHTML = `
      <div class="admin-card" style="max-width: 680px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 1.75rem; border: 1.5px solid var(--brand-yellow); background: var(--admin-surface);" onclick="event.stopPropagation()">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--admin-border);">
          <div>
            <h3 class="admin-card-title" style="margin: 0; font-size: 1.1rem;">${title}</h3>
            ${subtitle ? `<div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 0.2rem;">${subtitle}</div>` : ''}
          </div>
          <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('adminUniversalProofModal').remove()" style="font-size: 1.1rem;">
            ✕
          </button>
        </div>

        <div style="text-align: center; margin-bottom: 1.25rem;">
          <img src="${imageSrc}" alt="Proof Full" style="max-width: 100%; max-height: 60vh; border-radius: 12px; border: 1px solid var(--admin-border); object-fit: contain; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
          <a href="${imageSrc}" download="booba-token-proof.png" class="btn-admin btn-admin-secondary btn-admin-sm" target="_blank" rel="noopener noreferrer">
            💾 Download Image
          </a>
          <button type="button" class="btn-admin btn-admin-primary btn-admin-sm" onclick="document.getElementById('adminUniversalProofModal').remove()">
            Close
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  }

  handleProofFileSelect(input, previewContainerId, previewImgId, base64InputId, dropzoneId) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 8 * 1024 * 1024) {
      this.showToast('File is too large. Please select an image under 8MB.', 'error');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target.result;
      const base64Input = document.getElementById(base64InputId);
      const previewContainer = document.getElementById(previewContainerId);
      const previewImg = document.getElementById(previewImgId);
      const dropzone = document.getElementById(dropzoneId);

      if (base64Input) base64Input.value = base64Data;
      if (previewImg) previewImg.src = base64Data;
      if (previewContainer) previewContainer.style.display = 'block';
      if (dropzone) dropzone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  removeProofFile(previewContainerId, previewImgId, base64InputId, dropzoneId, fileInputId) {
    const base64Input = document.getElementById(base64InputId);
    const previewContainer = document.getElementById(previewContainerId);
    const previewImg = document.getElementById(previewImgId);
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(fileInputId);

    if (base64Input) base64Input.value = '';
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (dropzone) dropzone.style.display = 'block';
    if (fileInput) fileInput.value = '';
  }

  // --------------------------------------------------------------------------
  // PRESALE FULFILLMENT MODAL & EXECUTION
  // --------------------------------------------------------------------------

  openFulfillPresaleModal(orderId) {
    const order = (db.presalePurchases || []).find(p => p.id === orderId);
    if (!order) return;

    const existing = document.getElementById('adminFulfillPresaleModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminFulfillPresaleModal';
    modal.className = 'admin-modal-backdrop active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.88); backdrop-filter: blur(20px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';

    modal.innerHTML = `
      <div class="admin-card" style="max-width: 580px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 2rem; border: 1.5px solid rgba(16, 185, 129, 0.4); background: var(--admin-surface); box-shadow: 0 25px 70px rgba(0,0,0,0.9);" onclick="event.stopPropagation()">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--admin-border);">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div>
              <h3 class="admin-card-title" style="margin: 0; font-size: 1.15rem;">Deliver Presale $BOOBA Tokens</h3>
              <div style="font-size: 0.74rem; color: var(--text-secondary);">Transfer tokens to buyer and upload verification proof</div>
            </div>
          </div>
          <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('adminFulfillPresaleModal').remove()" style="font-size: 1.1rem;">
            ✕
          </button>
        </div>

        <!-- 1. Copy Recipient DEX Wallet & Amount -->
        <div style="background: rgba(0,0,0,0.5); border: 1.5px solid rgba(243, 186, 47, 0.3); border-radius: 14px; padding: 1.15rem; margin-bottom: 1.25rem;">
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">1. Copy Destination DEX Wallet Address:</div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
              <span class="text-mono" style="font-size: 0.85rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all; flex: 1;">
                ${order.receivingWallet}
              </span>
              <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${order.receivingWallet}', 'Trust Wallet Address')">
                📋 Copy
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.65rem; border-top: 1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">2. Tokens to Send:</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);">
                ${Number(order.totalTokens).toLocaleString()} $BOOBA
              </div>
            </div>
            <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${order.totalTokens}', 'Token Amount')">
              Copy Amount
            </button>
          </div>
        </div>

        <form id="adminFulfillForm" onsubmit="window.adminApp.handleExecutePresaleFulfillment(event, '${order.id}')">
          
          <!-- Hidden Base64 Storage for Admin Proof -->
          <input type="hidden" id="fulfillPresaleProofBase64" value="${order.deliveryProofScreenshot || ''}">

          <!-- 3. Upload Token Delivery Screenshot Proof -->
          <div class="form-field" style="margin-bottom: 1.25rem;">
            <label class="form-field-label" style="font-weight: 800; color: #FFFFFF; margin-bottom: 0.4rem; display: block;">
              3. Upload Token Delivery Screenshot Proof (Trust Wallet / MetaMask / BscScan)
            </label>

            <!-- Dropzone -->
            <div id="presaleProofDropzone" style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 1.25rem 1rem; text-align: center; background: rgba(16, 185, 129, 0.04); cursor: pointer; display: ${order.deliveryProofScreenshot ? 'none' : 'block'};" onclick="document.getElementById('presaleProofFileInput').click()">
              <input type="file" id="presaleProofFileInput" accept="image/*" style="display: none;" onchange="window.adminApp.handleProofFileSelect(this, 'presaleProofPreviewBox', 'presaleProofPreviewImg', 'fulfillPresaleProofBase64', 'presaleProofDropzone')">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2" style="margin: 0 auto 0.5rem auto; display: block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <div style="font-size: 0.82rem; font-weight: 700; color: #FFFFFF;">Click or Drag to Upload Sent Token Screenshot</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">PNG, JPG, or WEBP (Max 8MB)</div>
            </div>

            <!-- Preview Box -->
            <div id="presaleProofPreviewBox" style="display: ${order.deliveryProofScreenshot ? 'block' : 'none'}; text-align: center; background: rgba(0,0,0,0.5); border: 1.5px solid rgba(16,185,129,0.5); border-radius: 12px; padding: 0.85rem;">
              <img id="presaleProofPreviewImg" src="${order.deliveryProofScreenshot || ''}" alt="Delivery Proof Preview" style="max-height: 160px; max-width: 100%; border-radius: 8px; object-fit: contain; margin: 0 auto 0.5rem auto; display: block;">
              <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.removeProofFile('presaleProofPreviewBox', 'presaleProofPreviewImg', 'fulfillPresaleProofBase64', 'presaleProofDropzone', 'presaleProofFileInput')" style="color: var(--accent-ruby); font-size: 0.72rem;">
                ✕ Remove / Replace Screenshot
              </button>
            </div>
          </div>

          <!-- 4. BSC Transaction Hash (Optional) -->
          <div class="form-field" style="margin-bottom: 1.15rem;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
              <label class="form-field-label" style="margin: 0; font-weight: 700;">
                4. BSC Transaction Hash (TxID) — Optional
              </label>
              <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('fulfillTxHashInput').value = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')" style="font-size: 0.7rem; color: var(--accent-emerald);">
                Auto-generate TxID
              </button>
            </div>
            <input type="text" id="fulfillTxHashInput" class="admin-input text-mono" placeholder="0x... BSC TxID of the $BOOBA transfer" value="${order.sentTxHash || ''}" style="font-size: 0.82rem; height: 42px;">
          </div>

          <!-- 5. Admin Notes -->
          <div class="form-field" style="margin-bottom: 1.5rem;">
            <label class="form-field-label" style="margin-bottom: 0.35rem;">5. Admin Fulfillment Notes (Optional)</label>
            <input type="text" id="fulfillAdminNotesInput" class="admin-input" placeholder="e.g. Sent via Core Treasury Wallet" value="${order.adminNotes || ''}" style="font-size: 0.82rem; height: 42px;">
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <button type="button" class="btn-admin btn-admin-secondary" onclick="document.getElementById('adminFulfillPresaleModal').remove()" style="flex: 1; justify-content: center;">
              Cancel
            </button>
            <button type="submit" class="btn-admin btn-admin-primary" style="flex: 2; justify-content: center; font-weight: 900; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
              ✓ Confirm Token Delivery & Save Proof
            </button>
          </div>

        </form>

      </div>
    `;

    document.body.appendChild(modal);
  }

  async handleExecutePresaleFulfillment(e, orderId) {
    if (e) e.preventDefault();
    const sentTxHash = document.getElementById('fulfillTxHashInput')?.value?.trim() || '';
    const adminNotes = document.getElementById('fulfillAdminNotesInput')?.value?.trim() || '';
    const deliveryProofScreenshot = document.getElementById('fulfillPresaleProofBase64')?.value || '';

    const res = await db.adminFulfillPresaleOrder(orderId, { sentTxHash, adminNotes, deliveryProofScreenshot });
    const modal = document.getElementById('adminFulfillPresaleModal');
    if (modal) modal.remove();

    if (res.success) {
      this.showToast('Presale Token Delivery Confirmed & Proof Saved!');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to update order', 'error');
    }
  }

  async handleRejectPresaleOrder(orderId) {
    const reason = prompt('Enter reason for rejecting this presale submission:', 'Invalid payment proof or unconfirmed transaction');
    if (reason === null) return;

    const res = await db.adminRejectPresaleOrder(orderId, { reason });
    if (res.success) {
      this.showToast('Presale submission rejected');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to reject order', 'error');
    }
  }

  async handleDeletePresaleOrder(orderId) {
    if (!confirm('Are you sure you want to delete this presale order record?')) return;
    const res = await db.adminDeletePresaleOrder(orderId);
    if (res.success) {
      this.showToast('Order record deleted');
      this.render();
    }
  }

  handlePresaleAdminUsdtInput(usdtAmount) {
    const rateInput = document.getElementById('adminPresaleRateInput');
    const rate = rateInput ? Number(rateInput.value) || 200 : 200;
    const tokensInput = document.getElementById('adminAllocTokensInput');
    if (tokensInput && usdtAmount) {
      tokensInput.value = Math.floor(Number(usdtAmount) * rate);
    }
  }

  openTreasuryWalletModal() {
    const telemetry = db.getPresaleTelemetry();
    const currentAddress = telemetry.treasuryAddress || '';
    const isExisting = Boolean(currentAddress && currentAddress.length >= 20);

    const existing = document.getElementById('adminTreasuryModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminTreasuryModal';
    modal.className = 'admin-modal-backdrop active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(15px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';
    modal.onclick = () => modal.remove();

    modal.innerHTML = `
      <div class="admin-card" style="max-width: 520px; width: 100%; padding: 2rem; border: 1.5px solid var(--brand-yellow); background: var(--admin-surface); box-shadow: 0 20px 60px rgba(0,0,0,0.9);" onclick="event.stopPropagation()">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--admin-border);">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(243,186,47,0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 15h0M2 9.5h20"></path></svg>
            </div>
            <div>
              <h3 class="admin-card-title" style="margin: 0; font-size: 1.15rem; color: #FFFFFF;">
                ${isExisting ? 'Change Treasury Wallet' : 'Add Treasury Wallet'}
              </h3>
              <div style="font-size: 0.72rem; color: var(--text-secondary);">The address where buyers will send USDT</div>
            </div>
          </div>
          <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('adminTreasuryModal').remove()" style="font-size: 1.1rem;">
            ✕
          </button>
        </div>

        <form onsubmit="window.adminApp.handleSaveTreasuryModal(event)">
          <div class="form-field" style="margin-bottom: 1.5rem;">
            <label class="form-field-label" style="font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; display: block;">
              BEP-20 Wallet Address (USDT Deposit Target)
            </label>
            <input type="text" id="modalTreasuryWalletInput" class="admin-input text-mono" placeholder="0x... Enter BEP-20 wallet address" value="${currentAddress}" required style="height: 48px; font-size: 0.88rem; font-weight: 700; color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4);">
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem;">
              All buyers on the presale page will be shown this address.
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button type="button" class="btn-admin btn-admin-secondary" onclick="document.getElementById('adminTreasuryModal').remove()">
              Cancel
            </button>
            <button type="submit" class="btn-admin btn-admin-primary" style="font-weight: 900; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; padding: 0.6rem 1.5rem;">
              ${isExisting ? 'Save & Change Wallet' : 'Add Treasury Wallet'}
            </button>
          </div>
        </form>

      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      document.getElementById('modalTreasuryWalletInput')?.focus();
    }, 100);
  }

  handleSaveTreasuryModal(e) {
    if (e) e.preventDefault();
    const newAddress = document.getElementById('modalTreasuryWalletInput')?.value?.trim();
    if (!newAddress || newAddress.length < 20 || !newAddress.startsWith('0x')) {
      this.showToast('Please enter a valid BEP-20 wallet address (starts with 0x)', 'error');
      return;
    }

    const res = db.updatePresaleConfig({
      treasuryAddress: newAddress
    });

    if (res.success) {
      this.showToast(`Presale Treasury Wallet updated to ${newAddress.slice(0, 6)}...${newAddress.slice(-4)}!`);
      const modal = document.getElementById('adminTreasuryModal');
      if (modal) modal.remove();
      this.render();
    } else {
      this.showToast(res.message || 'Failed to update treasury wallet', 'error');
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

  // --------------------------------------------------------------------------
  // WITHDRAWAL BRIDGE FULFILLMENT MODAL & HANDLERS
  // --------------------------------------------------------------------------

  openFulfillWithdrawalModal(withdrawalId) {
    const wd = (db.withdrawals || []).find(w => w.id === withdrawalId);
    if (!wd) return;

    const existing = document.getElementById('adminFulfillWithdrawalModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminFulfillWithdrawalModal';
    modal.className = 'admin-modal-backdrop active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.88); backdrop-filter: blur(20px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';

    modal.innerHTML = `
      <div class="admin-card" style="max-width: 580px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 2rem; border: 1.5px solid rgba(16, 185, 129, 0.4); background: var(--admin-surface); box-shadow: 0 25px 70px rgba(0,0,0,0.9);" onclick="event.stopPropagation()">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--admin-border);">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div>
              <h3 class="admin-card-title" style="margin: 0; font-size: 1.15rem;">Deliver Withdrawal $BOOBA Tokens</h3>
              <div style="font-size: 0.74rem; color: var(--text-secondary);">
                Transfer tokens to ${wd.username || 'Citizen'} (${wd.passportId || 'Citizen'}) & upload proof
              </div>
            </div>
          </div>
          <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('adminFulfillWithdrawalModal').remove()" style="font-size: 1.1rem;">
            ✕
          </button>
        </div>

        <div style="background: rgba(0,0,0,0.5); border: 1.5px solid rgba(243, 186, 47, 0.3); border-radius: 14px; padding: 1.15rem; margin-bottom: 1.25rem;">
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">1. Copy Destination BEP-20 Wallet Address:</div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
              <span class="text-mono" style="font-size: 0.85rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all; flex: 1;">
                ${wd.walletAddress || 'No Wallet'}
              </span>
              <button type="button" class="btn-admin btn-admin-primary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${wd.walletAddress}', 'Citizen Wallet Address')">
                📋 Copy
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.65rem; border-top: 1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">2. Tokens to Send:</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);">
                ${Number(wd.amount).toLocaleString()} $BOOBA
              </div>
            </div>
            <button type="button" class="btn-admin btn-admin-secondary btn-admin-xs" onclick="window.adminApp.copyToClipboard('${wd.amount}', 'Token Amount')">
              Copy Amount
            </button>
          </div>
        </div>

        <form id="adminFulfillWdForm" onsubmit="window.adminApp.handleExecuteWithdrawalFulfillment(event, '${wd.id}')">
          
          <!-- Hidden Base64 Storage for Admin Proof -->
          <input type="hidden" id="fulfillWdProofBase64" value="${wd.deliveryProofScreenshot || ''}">

          <!-- 3. Upload Token Delivery Screenshot Proof -->
          <div class="form-field" style="margin-bottom: 1.25rem;">
            <label class="form-field-label" style="font-weight: 800; color: #FFFFFF; margin-bottom: 0.4rem; display: block;">
              3. Upload Token Delivery Screenshot Proof (Trust Wallet / MetaMask / BscScan)
            </label>

            <!-- Dropzone -->
            <div id="wdProofDropzone" style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 1.25rem 1rem; text-align: center; background: rgba(16, 185, 129, 0.04); cursor: pointer; display: ${wd.deliveryProofScreenshot ? 'none' : 'block'};" onclick="document.getElementById('wdProofFileInput').click()">
              <input type="file" id="wdProofFileInput" accept="image/*" style="display: none;" onchange="window.adminApp.handleProofFileSelect(this, 'wdProofPreviewBox', 'wdProofPreviewImg', 'fulfillWdProofBase64', 'wdProofDropzone')">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2" style="margin: 0 auto 0.5rem auto; display: block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <div style="font-size: 0.82rem; font-weight: 700; color: #FFFFFF;">Click or Drag to Upload Sent Token Screenshot</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">PNG, JPG, or WEBP (Max 8MB)</div>
            </div>

            <!-- Preview Box -->
            <div id="wdProofPreviewBox" style="display: ${wd.deliveryProofScreenshot ? 'block' : 'none'}; text-align: center; background: rgba(0,0,0,0.5); border: 1.5px solid rgba(16,185,129,0.5); border-radius: 12px; padding: 0.85rem;">
              <img id="wdProofPreviewImg" src="${wd.deliveryProofScreenshot || ''}" alt="Delivery Proof Preview" style="max-height: 160px; max-width: 100%; border-radius: 8px; object-fit: contain; margin: 0 auto 0.5rem auto; display: block;">
              <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="window.adminApp.removeProofFile('wdProofPreviewBox', 'wdProofPreviewImg', 'fulfillWdProofBase64', 'wdProofDropzone', 'wdProofFileInput')" style="color: var(--accent-ruby); font-size: 0.72rem;">
                ✕ Remove / Replace Screenshot
              </button>
            </div>
          </div>

          <!-- 4. BSC Transaction Hash (Optional) -->
          <div class="form-field" style="margin-bottom: 1.15rem;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
              <label class="form-field-label" style="margin: 0; font-weight: 700;">
                4. BSC Transaction Hash (TxID) — Optional
              </label>
              <button type="button" class="btn-admin btn-admin-ghost btn-admin-xs" onclick="document.getElementById('fulfillWdTxHashInput').value = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')" style="font-size: 0.7rem; color: var(--accent-emerald);">
                Auto-generate TxID
              </button>
            </div>
            <input type="text" id="fulfillWdTxHashInput" class="admin-input text-mono" placeholder="0x... BSC TxID of the $BOOBA transfer" value="${wd.sentTxHash || wd.txHash || ''}" style="font-size: 0.82rem; height: 42px;">
          </div>

          <!-- 5. Admin Notes -->
          <div class="form-field" style="margin-bottom: 1.5rem;">
            <label class="form-field-label" style="margin-bottom: 0.35rem;">5. Admin Notes (Optional)</label>
            <input type="text" id="fulfillWdAdminNotesInput" class="admin-input" placeholder="e.g. Sent via Core Treasury Hot Wallet" value="${wd.adminNotes || wd.notes || ''}" style="font-size: 0.82rem; height: 42px;">
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <button type="button" class="btn-admin btn-admin-secondary" onclick="document.getElementById('adminFulfillWithdrawalModal').remove()" style="flex: 1; justify-content: center;">
              Cancel
            </button>
            <button type="submit" class="btn-admin btn-admin-primary" style="flex: 2; justify-content: center; font-weight: 900; background: linear-gradient(135deg, #10B981 0%, #059669 100%);">
              ✓ Confirm Token Delivery & Save Proof
            </button>
          </div>

        </form>

      </div>
    `;

    document.body.appendChild(modal);
  }

  async handleExecuteWithdrawalFulfillment(e, withdrawalId) {
    if (e) e.preventDefault();
    const sentTxHash = document.getElementById('fulfillWdTxHashInput')?.value?.trim() || '';
    const adminNotes = document.getElementById('fulfillWdAdminNotesInput')?.value?.trim() || '';
    const deliveryProofScreenshot = document.getElementById('fulfillWdProofBase64')?.value || '';

    const res = await db.adminFulfillWithdrawal(withdrawalId, { sentTxHash, adminNotes, deliveryProofScreenshot });
    const modal = document.getElementById('adminFulfillWithdrawalModal');
    if (modal) modal.remove();

    if (res.success) {
      this.showToast('Withdrawal Token Delivery Confirmed & Proof Saved!');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to fulfill withdrawal', 'error');
    }
  }

  async handleRejectWithdrawal(withdrawalId) {
    const reason = prompt('Enter reason for rejecting this withdrawal request (Points will be refunded to citizen):', 'Invalid BEP-20 wallet address or unverified user');
    if (reason === null) return;

    const res = await db.adminRejectWithdrawal(withdrawalId, { reason });
    if (res.success) {
      this.showToast('Withdrawal rejected and points refunded to citizen.');
      this.render();
    } else {
      this.showToast(res.message || 'Failed to reject withdrawal', 'error');
    }
  }

  async handleDeleteWithdrawal(withdrawalId) {
    if (!confirm('Are you sure you want to delete this withdrawal record?')) return;
    const res = await db.adminDeleteWithdrawal(withdrawalId);
    if (res.success) {
      this.showToast('Withdrawal record deleted');
      this.render();
    }
  }
}

// Attach globally
window.adminApp = new TeamAdminApp();




