/* ==========================================================================
   BOOBA (BNB baby) — Team Admin Console Logic (teamadmin.js)
   Live Supabase Backend • Email Whitelist Security Guard • Real Data
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './src/services/db.js';
import { isUserAdmin, ADMIN_EMAILS } from './src/services/supabaseClient.js';

class TeamAdminApp {
  constructor() {
    this.activeTab = 'overview';
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
    alert((type === 'success' ? '✅ ' : '❌ ') + message);
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
      <div class="admin-gate-card">
        <img src="assets/mascot.jpg" style="width: 72px; height: 72px; border-radius: 50%; border: 2.5px solid var(--brand-yellow); margin-bottom: 1.25rem;">
        <h2 style="font-size: 1.4rem; color: #FFFFFF; margin-bottom: 0.5rem;">Core Team Admin Authorization</h2>
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.75rem;">
          This console is restricted to authorized team email addresses registered in the admin whitelist.
        </p>

        <form id="adminLoginForm" onsubmit="window.adminApp.handleAdminLogin(event)" style="text-align: left;">
          <div style="margin-bottom: 1rem;">
            <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 0.4rem;">
              Authorized Admin Email
            </label>
            <input type="email" id="adminEmailInput" placeholder="admin@gmail.com" class="form-input" style="width: 100%;" required>
          </div>
          
          <button type="submit" class="btn btn-primary btn-block" style="margin-top: 0.5rem;">
            Authenticate Admin Access ↗
          </button>
        </form>

        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-muted);">
          Whitelisted Emails: <span class="text-mono" style="color: var(--brand-yellow);">${ADMIN_EMAILS.join(', ')}</span>
        </div>

        <div style="margin-top: 1rem;">
          <a href="index.html" class="nav-link" style="font-size: 0.85rem; color: var(--text-secondary);">← Back to Main Website</a>
        </div>
      </div>
    `;
  }

  async handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput')?.value.trim().toLowerCase();
    if (!email) return;

    if (!isUserAdmin(email)) {
      alert(`❌ Access Denied: "${email}" is not listed in the ADMIN_EMAILS whitelist in code.`);
      return;
    }

    // Attempt to log in or create the admin session
    let res = await db.login({ emailOrUsername: email });
    if (!res.success) {
      // Auto-register admin account if first time
      res = await db.signup({
        username: 'BoobaBoss',
        email: email,
        referralCode: 'ADMIN'
      });
    }

    if (res.success) {
      alert(`🎉 Welcome to the Admin Studio, ${res.user.username}!`);
      this.render();
    } else {
      alert(res.message || 'Login failed');
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h1 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF;">Admin Dashboard Overview</h1>
            <p style="font-size: 0.85rem; color: var(--text-secondary);">Live metrics and recent activity from Supabase database.</p>
          </div>
          <div class="supabase-live-pill">
            <span class="pulse-dot"></span>
            <span>Live Supabase Connected</span>
          </div>
        </div>

        <!-- Metrics Cards Grid -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
          <div class="card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Real Passports</div>
            <div style="font-size: 2rem; font-weight: 800; color: #FFFFFF; margin: 0.35rem 0;">${Number(stats.totalUsers).toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--accent-emerald);">Registered Accounts</div>
          </div>

          <div class="card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Active Live Quests</div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--brand-yellow); margin: 0.35rem 0;">${Number(stats.activeQuestsCount).toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);"><a href="#" onclick="window.adminApp.switchTab('quests')" style="color: var(--brand-yellow);">Manage Quests →</a></div>
          </div>

          <div class="card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Pending Submissions</div>
            <div style="font-size: 2rem; font-weight: 800; color: ${stats.pendingSubmissions > 0 ? 'var(--accent-orange)' : 'var(--text-primary)'}; margin: 0.35rem 0;">
              ${Number(stats.pendingSubmissions).toLocaleString()}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);"><a href="#" onclick="window.adminApp.switchTab('submissions')" style="color: var(--brand-yellow);">Review Submissions →</a></div>
          </div>

          <div class="card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Total Points Circulating</div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--accent-gold); margin: 0.35rem 0;">${Number(stats.totalPointsDistributed).toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">$BOOBA Points</div>
          </div>
        </div>

        <!-- Recent Activity Sections -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
          <!-- Recent Submissions -->
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-size: 1.1rem; color: #FFFFFF;">Recent Proof Submissions</h3>
              <a href="#" onclick="window.adminApp.switchTab('submissions')" style="font-size: 0.8rem; color: var(--brand-yellow);">View All</a>
            </div>

            ${recentSubmissions.length === 0 ? `
              <p style="color: var(--text-secondary); font-size: 0.85rem;">No user submissions yet.</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                ${recentSubmissions.map(s => `
                  <div style="padding: 0.65rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong style="color: #FFFFFF; font-size: 0.85rem;">${s.username}</strong>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${s.questTitle}</div>
                    </div>
                    <span class="badge-tag" style="font-size: 0.7rem; text-transform: uppercase;">${s.status}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Recent Users -->
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="font-size: 1.1rem; color: #FFFFFF;">Recent Real Passports</h3>
              <a href="#" onclick="window.adminApp.switchTab('users')" style="font-size: 0.8rem; color: var(--brand-yellow);">View All</a>
            </div>

            ${recentUsers.length === 0 ? `
              <p style="color: var(--text-secondary); font-size: 0.85rem;">No registered passports yet.</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                ${recentUsers.map(u => `
                  <div style="padding: 0.65rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 24px; height: 24px; border-radius: 50%;">
                      <div>
                        <strong style="color: #FFFFFF; font-size: 0.85rem;">${u.username}</strong>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${u.passportId}</div>
                      </div>
                    </div>
                    <div style="font-weight: 700; color: var(--brand-yellow); font-size: 0.85rem;">${Number(u.boobaPoints).toLocaleString()} BOOBA</div>
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
          <h1 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF;">Upload & Manage Live Quests</h1>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Quests created here are saved directly to Supabase and appear immediately on the main website.</p>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
          <!-- Quest Creator Form -->
          <div class="card">
            <h3 style="font-size: 1.15rem; color: #FFFFFF; margin-bottom: 1.25rem;">Create New Quest</h3>
            
            <form onsubmit="window.adminApp.handleCreateQuest(event)">
              <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label">Quest Title</label>
                <input type="text" id="newQuestTitle" placeholder="e.g. Subscribe to Booba YouTube" class="form-input" required>
              </div>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label">Description</label>
                <textarea id="newQuestDesc" rows="2" placeholder="Explain what the user needs to do..." class="form-input" required></textarea>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
                <div>
                  <label class="form-label">Category</label>
                  <select id="newQuestCategory" class="form-input">
                    <option value="social">Social</option>
                    <option value="creative">Creative / Memes</option>
                    <option value="community">Community</option>
                    <option value="daily">Daily Check-in</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Reward (BOOBA)</label>
                  <input type="number" id="newQuestReward" value="150" class="form-input" required>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem;">
                <div>
                  <label class="form-label">Quest Type</label>
                  <select id="newQuestType" class="form-input">
                    <option value="proof">Proof Submission</option>
                    <option value="social">Social Link Action</option>
                    <option value="instant">Instant Claim</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Target URL (Optional)</label>
                  <input type="url" id="newQuestUrl" placeholder="https://..." class="form-input">
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label class="form-label">Requirements Summary</label>
                <input type="text" id="newQuestReqs" placeholder="e.g. Submit post link with #BOOBA tags" class="form-input">
              </div>

              <button type="submit" class="btn btn-primary btn-block">
                Publish Quest to Main Website ↗
              </button>
            </form>
          </div>

          <!-- Existing Quests List -->
          <div>
            <h3 style="font-size: 1.15rem; color: #FFFFFF; margin-bottom: 1.25rem;">Live Quests in Database (${quests.length})</h3>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${quests.map(q => `
                <div class="card" style="padding: 1.25rem;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div>
                      <span class="badge-tag" style="text-transform: uppercase; font-size: 0.7rem;">${q.category}</span>
                      <strong style="font-size: 1rem; color: #FFFFFF; display: block; margin-top: 0.35rem;">${q.title}</strong>
                    </div>
                    <div style="font-weight: 800; color: var(--brand-yellow);">+${q.rewardBooba} BOOBA</div>
                  </div>
                  <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">${q.description}</p>
                  
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Type: ${q.type}</span>
                    <button class="btn btn-ghost btn-sm" onclick="window.adminApp.handleDeleteQuest('${q.id}')" style="color: var(--accent-ruby); font-size: 0.75rem;">
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
      alert('🎉 Quest published live! Users can now view and complete it.');
      this.render();
    } else {
      alert(res.message || 'Failed to create quest');
    }
  }

  async handleDeleteQuest(questId) {
    if (!confirm('Are you sure you want to delete this quest?')) return;
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
          <h1 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF;">User Proof Submissions</h1>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Review creative content, verify task completion, and release $BOOBA tokens.</p>
        </div>

        ${submissions.length === 0 ? `
          <div class="card text-center" style="padding: 3rem;">
            <p style="color: var(--text-secondary);">No user submissions recorded in database yet.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${submissions.map(s => `
              <div class="card" style="padding: 1.5rem; border-left: 4px solid ${s.status === 'approved' ? 'var(--accent-emerald)' : s.status === 'rejected' ? 'var(--accent-ruby)' : 'var(--brand-yellow)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <strong style="font-size: 1.1rem; color: #FFFFFF;">${s.username}</strong>
                      <span class="text-mono" style="font-size: 0.8rem; color: var(--text-muted);">(${s.passportId})</span>
                      <span class="badge-tag" style="text-transform: uppercase; font-size: 0.7rem;">${s.status}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--brand-yellow); font-weight: 700; margin-top: 0.25rem;">
                      Quest: ${s.questTitle} • Reward: +${s.rewardBooba} BOOBA
                    </div>
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    Submitted: ${s.submittedAt}
                  </div>
                </div>

                <div style="background: rgba(0,0,0,0.25); padding: 1rem; border-radius: 8px; margin-bottom: 1.25rem;">
                  ${s.proofUrl ? `
                    <div style="margin-bottom: 0.5rem;">
                      <strong>Proof Link:</strong> <a href="${s.proofUrl}" target="_blank" style="color: var(--brand-yellow); text-decoration: underline;">${s.proofUrl} ↗</a>
                    </div>
                  ` : ''}
                  ${s.proofDescription ? `
                    <div><strong>Description / Notes:</strong> ${s.proofDescription}</div>
                  ` : ''}
                </div>

                ${s.status === 'pending' ? `
                  <div class="flex items-center gap-3">
                    <button class="btn btn-primary btn-sm" onclick="window.adminApp.handleReview('${s.id}', 'approved')">
                      ✓ Approve (+${s.rewardBooba} BOOBA)
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.adminApp.handleReview('${s.id}', 'rejected')" style="color: var(--accent-ruby);">
                      ✕ Reject
                    </button>
                  </div>
                ` : `
                  <div style="font-size: 0.8rem; color: var(--text-muted);">
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
      alert(`Submission marked as ${action}! User passport updated.`);
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
          <h1 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF;">Token & Airdrop Hub</h1>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Distribute bulk $BOOBA points to real registered passports in Supabase.</p>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
          <!-- Airdrop Form -->
          <div class="card">
            <h3 style="font-size: 1.15rem; color: #FFFFFF; margin-bottom: 1.25rem;">Execute Live Airdrop</h3>
            
            <form onsubmit="window.adminApp.handleAirdrop(event)">
              <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label">Target Recipient Group</label>
                <select id="airdropTarget" class="form-input">
                  <option value="all">All Registered Passports (${usersCount} users)</option>
                  <option value="top10">Top 10 Leaderboard Holders</option>
                  <option value="active">Active Questers (Completed > 0)</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label">Amount Per User (BOOBA)</label>
                <input type="number" id="airdropAmount" value="500" class="form-input" required>
              </div>

              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label class="form-label">Reason / Campaign Name</label>
                <input type="text" id="airdropReason" placeholder="e.g. Community Milestone Bonus" class="form-input" required>
              </div>

              <button type="submit" class="btn btn-primary btn-block">
                🚀 Distribute Airdrop to Supabase
              </button>
            </form>
          </div>

          <!-- Airdrop History -->
          <div>
            <h3 style="font-size: 1.15rem; color: #FFFFFF; margin-bottom: 1.25rem;">Airdrop Distribution History (${logs.length})</h3>
            
            ${logs.length === 0 ? `
              <div class="card text-center" style="padding: 2rem;">
                <p style="color: var(--text-secondary);">No airdrops recorded yet.</p>
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${logs.map(l => `
                  <div class="card" style="padding: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                      <strong style="color: #FFFFFF; font-size: 0.9rem;">${l.reason}</strong>
                      <span style="font-weight: 800; color: var(--brand-yellow);">+${Number(l.totalDistributed).toLocaleString()} BOOBA</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
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
      alert(`🎉 Airdrop successful! Distributed ${res.totalDistributed.toLocaleString()} BOOBA to ${res.recipientCount} accounts.`);
      this.render();
    } else {
      alert(res.message || 'Airdrop failed');
    }
  }

  // --------------------------------------------------------------------------
  // 5. PASSPORTS & USERS TAB
  // --------------------------------------------------------------------------

  renderUsersTab(container) {
    const users = db.users;

    container.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto;">
        <div style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF;">Registered Passports & Users</h1>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">All genuine community accounts registered in the live Supabase database.</p>
        </div>

        <div class="card" style="padding: 0; overflow: hidden; border-radius: 16px;">
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
              <thead>
                <tr style="background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-subtle); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">
                  <th style="padding: 1rem 1.25rem;">User / Mascot</th>
                  <th style="padding: 1rem 1.25rem;">Email</th>
                  <th style="padding: 1rem 1.25rem;">Passport ID</th>
                  <th style="padding: 1rem 1.25rem;">Role</th>
                  <th style="padding: 1rem 1.25rem;">Quests</th>
                  <th style="padding: 1rem 1.25rem; text-align: right;">BOOBA Balance</th>
                </tr>
              </thead>
              <tbody>
                ${users.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                      No users registered in database yet.
                    </td>
                  </tr>
                ` : users.map(u => `
                  <tr style="border-bottom: 1px solid var(--border-subtle);">
                    <td style="padding: 1rem 1.25rem;">
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 28px; height: 28px; border-radius: 50%;">
                        <strong style="color: #FFFFFF;">${u.username}</strong>
                      </div>
                    </td>
                    <td style="padding: 1rem 1.25rem; color: var(--text-secondary);">
                      ${u.email}
                    </td>
                    <td style="padding: 1rem 1.25rem; font-family: var(--font-mono); color: var(--brand-yellow);">
                      ${u.passportId}
                    </td>
                    <td style="padding: 1rem 1.25rem;">
                      <span class="badge-tag" style="font-size: 0.7rem; text-transform: uppercase;">${u.role}</span>
                    </td>
                    <td style="padding: 1rem 1.25rem; color: var(--text-secondary);">
                      ${u.completedQuestsCount || 0}
                    </td>
                    <td style="padding: 1rem 1.25rem; text-align: right; font-weight: 800; color: var(--brand-yellow); font-size: 1rem;">
                      ${Number(u.boobaPoints).toLocaleString()}
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
}

// Attach globally
window.adminApp = new TeamAdminApp();
