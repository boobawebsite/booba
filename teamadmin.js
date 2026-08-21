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
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.render();

    // Subscribe to DB updates
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

    document.getElementById('mobileSidebarCloseBtn')?.addEventListener('click', () => {
      closeSidebar();
    });

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
      <div style="max-width: 480px; margin: 4rem auto; padding: 2.5rem; border-radius: 28px; background: linear-gradient(135deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); border: 1.5px solid rgba(243, 186, 47, 0.4); text-align: center; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);">
        
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(243, 186, 47, 0.15); border: 2px solid var(--brand-yellow); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--brand-yellow);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>

        <h2 style="font-size: 1.5rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; letter-spacing: -0.01em;">
          Core Team Admin Authorization
        </h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.75rem;">
          Restricted to authorized core team emails registered in the administrator whitelist.
        </p>

        <form id="adminLoginForm" onsubmit="window.adminApp.handleAdminLogin(event)" style="text-align: left;">
          <div style="margin-bottom: 1.25rem;">
            <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 0.4rem;">
              Authorized Admin Email
            </label>
            <input type="email" id="adminEmailInput" placeholder="admin@gmail.com" class="form-input" style="width: 100%; border-radius: 12px;" required>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 0.4rem;">
              Account Password
            </label>
            <input type="password" id="adminPasswordInput" placeholder="••••••••" class="form-input" style="width: 100%; border-radius: 12px;" required>
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" style="font-weight: 800; border-radius: 12px; padding: 0.85rem;">
            Authenticate Admin Access ↗
          </button>
        </form>

        <div style="margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.78rem; color: var(--text-muted);">
          Whitelisted Emails: <span class="text-mono" style="color: var(--brand-yellow);">${ADMIN_EMAILS.join(', ')}</span>
        </div>

        <div style="margin-top: 1.25rem;">
          <a href="index.html" class="nav-link" style="font-size: 0.85rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 0.35rem;">
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
      alert(`Welcome to the Admin Studio, ${res.user.username}!`);
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
    const recentSubmissions = db.submissions.slice(0, 5);
    const recentUsers = db.users.slice(0, 5);

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1.25rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
              <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-size: 0.75rem;">
                CORE STUDIO CONSOLE
              </span>
              <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.4); font-size: 0.75rem;">
                <span class="pulse-dot" style="width: 5px; height: 5px;"></span>
                <span>BNB SMART CHAIN</span>
              </span>
            </div>
            <h1 style="font-size: 1.8rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0;">
              Admin Dashboard Overview
            </h1>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">
              Live telemetry, proof review queue, and treasury distribution metrics.
            </p>
          </div>

          <div style="display: flex; gap: 0.75rem;">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.adminApp.switchTab('quests')">
              + Publish Quest
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.adminApp.switchTab('submissions')">
              Review Proofs (${stats.pendingSubmissions})
            </button>
          </div>
        </div>

        <!-- Metrics Cards Grid -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
          
          <div class="card" style="padding: 1.5rem; border-radius: 20px; background: rgba(14, 18, 27, 0.85); border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">
                Total Passports
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-yellow)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div style="font-size: 2.2rem; font-weight: 900; color: #FFFFFF; margin-bottom: 0.25rem;" class="text-mono">
              ${Number(stats.totalUsers).toLocaleString()}
            </div>
            <div style="font-size: 0.78rem; color: var(--accent-emerald); font-weight: 700;">
              Registered Community Holders
            </div>
          </div>

          <div class="card" style="padding: 1.5rem; border-radius: 20px; background: rgba(14, 18, 27, 0.85); border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">
                Live Quests
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-yellow)" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div style="font-size: 2.2rem; font-weight: 900; color: var(--brand-yellow); margin-bottom: 0.25rem;" class="text-mono">
              ${Number(stats.activeQuestsCount).toLocaleString()}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary);">
              <a href="#" onclick="window.adminApp.switchTab('quests')" style="color: var(--brand-yellow); font-weight: 700;">Manage Active Quests →</a>
            </div>
          </div>

          <div class="card" style="padding: 1.5rem; border-radius: 20px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid ${stats.pendingSubmissions > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">
                Pending Proofs
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stats.pendingSubmissions > 0 ? 'var(--accent-ruby)' : 'var(--text-muted)'}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div style="font-size: 2.2rem; font-weight: 900; color: ${stats.pendingSubmissions > 0 ? 'var(--accent-orange)' : '#FFFFFF'}; margin-bottom: 0.25rem;" class="text-mono">
              ${Number(stats.pendingSubmissions).toLocaleString()}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary);">
              <a href="#" onclick="window.adminApp.switchTab('submissions')" style="color: var(--brand-yellow); font-weight: 700;">Review Queue →</a>
            </div>
          </div>

          <div class="card" style="padding: 1.5rem; border-radius: 20px; background: rgba(14, 18, 27, 0.85); border: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.04em;">
                Points Circulating
              </span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-yellow)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><line x1="12" y1="6" x2="12" y2="8"></line><line x1="12" y1="16" x2="12" y2="18"></line></svg>
            </div>
            <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-gold); margin-bottom: 0.25rem;" class="text-mono">
              ${Number(stats.totalPointsDistributed).toLocaleString()}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 700;">
              $BOOBA Tokens Granted
            </div>
          </div>

        </div>

        <!-- Recent Activity Sections -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.75rem;">
          
          <!-- Recent Submissions -->
          <div class="card" style="padding: 1.75rem; border-radius: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <div>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin: 0;">Recent Submissions</h3>
                <div style="font-size: 0.78rem; color: var(--text-muted);">Creator content & mission proofs</div>
              </div>
              <a href="#" onclick="window.adminApp.switchTab('submissions')" style="font-size: 0.8rem; color: var(--brand-yellow); font-weight: 700;">View All →</a>
            </div>

            ${recentSubmissions.length === 0 ? `
              <p style="color: var(--text-secondary); font-size: 0.88rem; text-align: center; padding: 2rem 0;">No user submissions recorded yet.</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${recentSubmissions.map(s => `
                  <div style="padding: 0.85rem 1rem; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong style="color: #FFFFFF; font-size: 0.88rem;">${s.username}</strong>
                      <div style="font-size: 0.76rem; color: var(--text-muted);">${s.questTitle}</div>
                    </div>
                    <span class="badge-tag" style="font-size: 0.7rem; text-transform: uppercase; background: ${s.status === 'approved' ? 'rgba(16,185,129,0.15)' : s.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(243,186,47,0.15)'}; color: ${s.status === 'approved' ? 'var(--accent-emerald)' : s.status === 'rejected' ? 'var(--accent-ruby)' : 'var(--brand-yellow)'};">
                      ${s.status}
                    </span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Recent Passports -->
          <div class="card" style="padding: 1.75rem; border-radius: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <div>
                <h3 style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin: 0;">Recent Passports</h3>
                <div style="font-size: 0.78rem; color: var(--text-muted);">Newly minted community accounts</div>
              </div>
              <a href="#" onclick="window.adminApp.switchTab('users')" style="font-size: 0.8rem; color: var(--brand-yellow); font-weight: 700;">View All →</a>
            </div>

            ${recentUsers.length === 0 ? `
              <p style="color: var(--text-secondary); font-size: 0.88rem; text-align: center; padding: 2rem 0;">No registered passports yet.</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${recentUsers.map(u => `
                  <div style="padding: 0.85rem 1rem; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                      <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
                      <div>
                        <strong style="color: #FFFFFF; font-size: 0.88rem;">${u.username}</strong>
                        <div style="font-size: 0.74rem; color: var(--text-muted);" class="text-mono">${u.passportId}</div>
                      </div>
                    </div>
                    <div style="font-weight: 800; color: var(--brand-yellow); font-size: 0.88rem;" class="text-mono">
                      +${Number(u.boobaPoints).toLocaleString()} B
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
    const quests = db.quests;

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <div style="margin-bottom: 2rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
            <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); font-size: 0.75rem;">
              BOUNTY & EXPEDITION BUILDER
            </span>
          </div>
          <h1 style="font-size: 1.8rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.25rem 0;">
            Upload & Manage Live Quests
          </h1>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">
            Publish active bounties across Community, Engagement, and Content Production. Quests appear immediately on the main portal.
          </p>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 2rem;">
          
          <!-- Quest Creator Form -->
          <div class="card" style="padding: 2rem; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.35);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin: 0;">Deploy New Bounty</h3>
              <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">Live Sync</span>
            </div>
            
            <form onsubmit="window.adminApp.handleCreateQuest(event)">
              <div class="form-group" style="margin-bottom: 1.15rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Quest Title *</label>
                <input type="text" id="newQuestTitle" placeholder="e.g. Follow @BoobaToken on X" class="form-input" style="border-radius: 12px;" required>
              </div>

              <div class="form-group" style="margin-bottom: 1.15rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Mission Instructions & Description *</label>
                <textarea id="newQuestDesc" rows="2" placeholder="Explain the exact instructions the user must follow..." class="form-input" style="border-radius: 12px;" required></textarea>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.15rem;">
                <div>
                  <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Category *</label>
                  <select id="newQuestCategory" class="form-input" style="border-radius: 12px;">
                    <option value="community">Community</option>
                    <option value="engagement">Engagement</option>
                    <option value="content">Content Production</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Reward ($BOOBA) *</label>
                  <input type="number" id="newQuestReward" value="150" class="form-input" style="border-radius: 12px;" required>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.15rem;">
                <div>
                  <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Verification Type *</label>
                  <select id="newQuestType" class="form-input" style="border-radius: 12px;">
                    <option value="social">Social Link Action</option>
                    <option value="proof">Proof Submission</option>
                    <option value="instant">Instant Claim</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">
                    Target Link <span style="color: var(--brand-yellow);">*Compulsory for Community/Engagement</span>
                  </label>
                  <input type="url" id="newQuestUrl" placeholder="https://x.com/... or https://t.me/..." class="form-input" style="border-radius: 12px;">
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1.75rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Requirements Summary (Shown on Card)</label>
                <input type="text" id="newQuestReqs" placeholder="e.g. Follow handle & submit tweet link" class="form-input" style="border-radius: 12px;">
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="font-weight: 800; border-radius: 12px; padding: 0.85rem;">
                Publish Bounty to Main Website ↗
              </button>
            </form>
          </div>

          <!-- Existing Quests List -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin: 0;">
                Live Database Quests (${quests.length})
              </h3>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${quests.map(q => `
                <div class="card" style="padding: 1.5rem; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
                    <div>
                      <span class="badge-tag" style="text-transform: uppercase; font-size: 0.72rem; font-weight: 800;">${q.category}</span>
                      <strong style="font-size: 1.05rem; color: #FFFFFF; display: block; margin-top: 0.4rem;">${q.title}</strong>
                    </div>
                    <div style="font-weight: 900; color: var(--brand-yellow); font-size: 1rem;" class="text-mono">
                      +${Number(q.rewardBooba).toLocaleString()} BOOBA
                    </div>
                  </div>
                  <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">${q.description}</p>
                  
                  <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.75rem;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">
                      Type: <strong>${q.type}</strong> ${q.targetUrl ? `• <a href="${q.targetUrl}" target="_blank" style="color: var(--brand-yellow);">Link ↗</a>` : ''}
                    </span>
                    <button class="btn btn-ghost btn-sm" onclick="window.adminApp.handleDeleteQuest('${q.id}')" style="color: var(--accent-ruby); font-size: 0.75rem; font-weight: 700;">
                      Delete Quest
                    </button>
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
      alert('Target Action Link is COMPULSORY for Community and Engagement quests! Users must be redirected to the official link to complete their mission.');
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
      alert('Quest published live! Users can now view and complete it.');
      this.render();
    } else {
      alert(res.message || 'Failed to create quest');
    }
  }

  async handleDeleteQuest(questId) {
    if (!confirm('Are you sure you want to delete this quest from the database?')) return;
    const res = await db.deleteQuest(questId);
    if (res.success) {
      alert('Quest deleted.');
      this.render();
    } else {
      alert(res.message || 'Failed to delete quest');
    }
  }

  // --------------------------------------------------------------------------
  // 3. PROOF SUBMISSIONS TAB (REVIEW & APPROVE)
  // --------------------------------------------------------------------------

  renderSubmissionsTab(container) {
    const submissions = db.submissions;

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <div style="margin-bottom: 2rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
            <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); font-size: 0.75rem;">
              PROOF OF WORK REVIEW QUEUE
            </span>
          </div>
          <h1 style="font-size: 1.8rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.25rem 0;">
            User Proof Submissions
          </h1>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">
            Review creative creator content, verify link authenticity, and release $BOOBA tokens to user passports.
          </p>
        </div>

        ${submissions.length === 0 ? `
          <div class="card text-center" style="padding: 4rem 2rem; border-radius: 24px;">
            <p style="color: var(--text-secondary); font-size: 0.95rem;">No user submissions recorded in database yet.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            ${submissions.map(s => `
              <div class="card" style="padding: 1.75rem; border-radius: 20px; border-left: 5px solid ${s.status === 'approved' ? 'var(--accent-emerald)' : s.status === 'rejected' ? 'var(--accent-ruby)' : 'var(--brand-yellow)'};">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.15rem;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                      <strong style="font-size: 1.15rem; color: #FFFFFF;">${s.username}</strong>
                      <span class="text-mono" style="font-size: 0.82rem; color: var(--text-muted);">(${s.passportId})</span>
                      <span class="badge-tag" style="font-size: 0.72rem; text-transform: uppercase; background: ${s.status === 'approved' ? 'rgba(16,185,129,0.15)' : s.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(243,186,47,0.15)'}; color: ${s.status === 'approved' ? 'var(--accent-emerald)' : s.status === 'rejected' ? 'var(--accent-ruby)' : 'var(--brand-yellow)'}; font-weight: 800;">
                        ${s.status}
                      </span>
                    </div>
                    <div style="font-size: 0.88rem; color: var(--brand-yellow); font-weight: 800;">
                      Quest: ${s.questTitle} • Reward: +${s.rewardBooba} BOOBA
                    </div>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">
                    Submitted: ${s.submittedAt}
                  </div>
                </div>

                <div style="background: rgba(0,0,0,0.35); padding: 1.15rem; border-radius: 14px; margin-bottom: 1.25rem; border: 1px solid rgba(255,255,255,0.06);">
                  ${s.proofUrl ? `
                    <div style="margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; background: rgba(243, 186, 47, 0.08); padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid rgba(243, 186, 47, 0.25);">
                      <div>
                        <div style="font-size: 0.72rem; text-transform: uppercase; color: var(--brand-yellow); font-weight: 800; margin-bottom: 0.2rem;">Submitted Content Link (No Media Uploads)</div>
                        <span style="font-family: var(--font-mono); font-size: 0.85rem; color: #FFFFFF; word-break: break-all;">${s.proofUrl}</span>
                      </div>
                      <a href="${s.proofUrl}" target="_blank" class="btn btn-outline btn-sm" style="font-weight: 800; font-size: 0.78rem; white-space: nowrap;">
                        Open Content Link ↗
                      </a>
                    </div>
                  ` : ''}
                  ${s.proofDescription ? `
                    <div style="font-size: 0.85rem; color: var(--text-secondary);"><strong style="color: #FFFFFF;">Creator Notes:</strong> ${s.proofDescription}</div>
                  ` : ''}
                </div>

                ${s.status === 'pending' ? `
                  <div class="flex items-center gap-3">
                    <button class="btn btn-primary btn-sm" onclick="window.adminApp.handleReview('${s.id}', 'approved')" style="font-weight: 800;">
                      Approve & Grant (+${s.rewardBooba} BOOBA)
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.adminApp.handleReview('${s.id}', 'rejected')" style="color: var(--accent-ruby); font-weight: 800;">
                      Reject Submission
                    </button>
                  </div>
                ` : `
                  <div style="font-size: 0.82rem; color: var(--text-muted);">
                    Reviewed by <strong>${s.reviewedBy || 'Admin'}</strong> on ${s.reviewedAt || 'N/A'}
                  </div>
                `}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  async handleReview(submissionId, action) {
    const res = await db.reviewSubmission(submissionId, action);
    if (res.success) {
      alert(`Submission marked as ${action}! User passport balance updated.`);
      this.render();
    } else {
      alert(res.message || 'Review failed');
    }
  }

  // --------------------------------------------------------------------------
  // 4. TOKEN & AIRDROP TAB
  // --------------------------------------------------------------------------

  renderAirdropTab(container) {
    const logs = db.airdropLogs;
    const usersCount = db.users.length;

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <div style="margin-bottom: 2rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
            <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); font-size: 0.75rem;">
              TREASURY DISPATCHER
            </span>
          </div>
          <h1 style="font-size: 1.8rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.25rem 0;">
            Token & Airdrop Hub
          </h1>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">
            Execute direct batch token grants and treasury allocations to registered passport holders in Supabase.
          </p>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
          
          <!-- Airdrop Form -->
          <div class="card" style="padding: 2rem; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.35);">
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1.5rem;">Execute Live Airdrop</h3>
            
            <form onsubmit="window.adminApp.handleAirdrop(event)">
              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Target Recipient Group</label>
                <select id="airdropTarget" class="form-input" style="border-radius: 12px;">
                  <option value="all">All Registered Passports (${usersCount} accounts)</option>
                  <option value="top10">Top 10 Leaderboard Holders</option>
                  <option value="active">Active Questers (Completed > 0)</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Amount Per User ($BOOBA)</label>
                <input type="number" id="airdropAmount" value="500" class="form-input" style="border-radius: 12px;" required>
              </div>

              <div class="form-group" style="margin-bottom: 1.75rem;">
                <label class="form-label" style="font-weight: 700; font-size: 0.82rem;">Reason / Campaign Tag</label>
                <input type="text" id="airdropReason" placeholder="e.g. Mainnet Launch Celebration Grant" class="form-input" style="border-radius: 12px;" required>
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="font-weight: 800; border-radius: 12px; padding: 0.85rem;">
                Distribute Airdrop Batch ↗
              </button>
            </form>
          </div>

          <!-- Airdrop History -->
          <div>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1.25rem;">
              Airdrop Distribution History (${logs.length})
            </h3>
            
            ${logs.length === 0 ? `
              <div class="card text-center" style="padding: 3rem; border-radius: 20px;">
                <p style="color: var(--text-secondary); font-size: 0.88rem;">No treasury airdrops recorded yet.</p>
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                ${logs.map(l => `
                  <div class="card" style="padding: 1.25rem; border-radius: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                      <strong style="color: #FFFFFF; font-size: 0.95rem;">${l.reason}</strong>
                      <span style="font-weight: 900; color: var(--brand-yellow);" class="text-mono">+${Number(l.totalDistributed).toLocaleString()} BOOBA</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">
                      ${l.recipientCount} Recipients (+${l.amountPerUser} each) • Executed by ${l.adminUsername} on ${l.date}
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

  async handleAirdrop(e) {
    e.preventDefault();
    const targetGroup = document.getElementById('airdropTarget')?.value;
    const amountPerUser = document.getElementById('airdropAmount')?.value;
    const reason = document.getElementById('airdropReason')?.value.trim();

    if (!amountPerUser || Number(amountPerUser) <= 0) return;

    if (!confirm(`Are you sure you want to airdrop ${amountPerUser} BOOBA points to ${targetGroup} users?`)) return;

    const res = await db.distributeAirdrop({ targetGroup, amountPerUser, reason });
    if (res.success) {
      alert(`Airdrop successful! Distributed ${res.totalDistributed.toLocaleString()} BOOBA to ${res.recipientCount} accounts.`);
      this.render();
    } else {
      alert(res.message || 'Airdrop failed');
    }
  }

  // --------------------------------------------------------------------------
  // 5. PASSPORTS & USERS TAB
  // --------------------------------------------------------------------------

  renderUsersTab(container) {
    let users = db.users;

    if (this.userSearchQuery) {
      const q = this.userSearchQuery.toLowerCase();
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.passportId && u.passportId.toLowerCase().includes(q))
      );
    }

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
              <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); font-size: 0.75rem;">
                PASSPORT REGISTRY
              </span>
            </div>
            <h1 style="font-size: 1.8rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.25rem 0;">
              Registered Passports & Users
            </h1>
            <p style="font-size: 0.88rem; color: var(--text-secondary); margin: 0;">
              All genuine community accounts registered in the live Supabase database.
            </p>
          </div>

          <div>
            <input type="text" id="userSearchInput" placeholder="Search by username, email, passport ID..." value="${this.userSearchQuery}" oninput="window.adminApp.handleUserSearch(this.value)" class="form-input" style="min-width: 280px; border-radius: 12px; font-size: 0.85rem;">
          </div>
        </div>

        <div class="card" style="padding: 0; overflow: hidden; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08);">
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.88rem;">
              <thead>
                <tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.04em;">
                  <th style="padding: 1.15rem 1.25rem;">Holder / Mascot</th>
                  <th style="padding: 1.15rem 1.25rem;">Email Address</th>
                  <th style="padding: 1.15rem 1.25rem;">Passport ID</th>
                  <th style="padding: 1.15rem 1.25rem;">Tier Status</th>
                  <th style="padding: 1.15rem 1.25rem;">Quests</th>
                  <th style="padding: 1.15rem 1.25rem; text-align: right;">BOOBA Balance</th>
                </tr>
              </thead>
              <tbody>
                ${users.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 3.5rem; color: var(--text-secondary);">
                      No matching user passports found in database.
                    </td>
                  </tr>
                ` : users.map(u => {
                  const level = calculateLevel(u.boobaPoints || 0);
                  return `
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04); transition: background 0.2s ease;">
                      <td style="padding: 1.15rem 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid var(--brand-yellow);">
                          <div>
                            <strong style="color: #FFFFFF; font-size: 0.9rem;">${u.username}</strong>
                            <div style="font-size: 0.72rem; color: var(--accent-emerald);">Streak: ${u.streakDays || 1} Days</div>
                          </div>
                        </div>
                      </td>
                      <td style="padding: 1.15rem 1.25rem; color: var(--text-secondary);">
                        ${u.email}
                      </td>
                      <td style="padding: 1.15rem 1.25rem; font-family: var(--font-mono); color: var(--brand-yellow); font-weight: 700;">
                        ${u.passportId}
                      </td>
                      <td style="padding: 1.15rem 1.25rem;">
                        <span class="badge-tag" style="font-size: 0.72rem; text-transform: uppercase;">Lv.${level.level} ${level.title}</span>
                      </td>
                      <td style="padding: 1.15rem 1.25rem; color: var(--text-secondary); font-weight: 700;">
                        ${u.completedQuestsCount || 0}
                      </td>
                      <td style="padding: 1.15rem 1.25rem; text-align: right; font-weight: 900; color: var(--brand-yellow); font-size: 1.05rem;" class="text-mono">
                        ${Number(u.boobaPoints).toLocaleString()}
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

