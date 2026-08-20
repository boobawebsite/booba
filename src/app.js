/* ==========================================================================
   BOOBA (BNB baby) — Master Unified Application Controller (app.js)
   Single JS Core for all pages (index, dashboard, passport, quests, signin, etc.)
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './services/db.js';
import { SupabaseService, isUserAdmin, ADMIN_EMAILS } from './services/supabaseClient.js';

class BoobaApp {
  constructor() {
    this.pageName = this.detectPageName();
    this.activeQuestFilter = 'all';
    this.authMode = 'signup'; // 'signup' or 'signin'
    this.selectedQuestForProof = null;
    this.selectedQuestForSocial = null;

    this.init();
  }

  detectPageName() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('signin.html')) return 'signin';
    if (path.endsWith('dashboard.html')) return 'dashboard';
    if (path.endsWith('passport.html')) return 'passport';
    if (path.endsWith('quests.html')) return 'quests';
    if (path.endsWith('leaderboard.html')) return 'leaderboard';
    if (path.endsWith('rewards.html')) return 'rewards';
    if (path.endsWith('referrals.html')) return 'referrals';
    
    // Hash routing fallback
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'signin' || hash === 'login' || hash === 'signup' || hash === 'auth') return 'signin';
    if (hash.startsWith('dashboard/passport')) return 'passport';
    if (hash.startsWith('dashboard/quests')) return 'quests';
    if (hash.startsWith('dashboard/leaderboard')) return 'leaderboard';
    if (hash.startsWith('dashboard/rewards')) return 'rewards';
    if (hash.startsWith('dashboard/referrals')) return 'referrals';
    if (hash.startsWith('dashboard/overview') || hash === 'dashboard') return 'dashboard';

    return 'home';
  }

  init() {
    // Check referral query param
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      sessionStorage.setItem('booba_ref_code', ref);
    }

    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'login' || hash === 'signin') {
      this.authMode = 'signin';
    } else if (hash === 'signup') {
      this.authMode = 'signup';
    }

    // Subscribe to DB state
    db.subscribe(() => {
      this.renderHeaderNav();
      this.renderPage();
    });

    // Handle hash change
    window.addEventListener('hashchange', () => {
      this.pageName = this.detectPageName();
      const currentHash = window.location.hash.replace(/^#/, '');
      if (currentHash === 'login' || currentHash === 'signin') {
        this.authMode = 'signin';
      } else if (currentHash === 'signup') {
        this.authMode = 'signup';
      }
      this.renderHeaderNav();
      this.renderPage();
    });

    this.setupGlobalEvents();
    this.renderHeaderNav();
    this.renderPage();
  }

  setupGlobalEvents() {
    // Escape key closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeMobileNav();
      }
    });

    // Delegated clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeModal();
      }
      if (e.target.id === 'mobileNavBackdrop' || e.target.closest('#mobileNavCloseBtn')) {
        this.closeMobileNav();
      }
      if (e.target.closest('#mobileNavToggleBtn')) {
        this.toggleMobileNav();
      }
      if (e.target.closest('.mobile-nav-link')) {
        this.closeMobileNav();
      }
    });

    // Creative proof submission form
    const proofForm = document.getElementById('proofForm');
    if (proofForm) {
      proofForm.addEventListener('submit', (e) => this.handleProofSubmit(e));
    }

    // Social verify button
    const confirmSocialBtn = document.getElementById('confirmSocialVerifyBtn');
    if (confirmSocialBtn) {
      confirmSocialBtn.addEventListener('click', () => this.handleConfirmSocial());
    }
  }

  // --------------------------------------------------------------------------
  // HEADER & NAVIGATION
  // --------------------------------------------------------------------------

  renderHeaderNav() {
    const user = db.currentUser;
    const headerActions = document.getElementById('headerNavActions');
    const mobileFooter = document.getElementById('mobileNavFooter');

    // Highlight active nav links
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href.includes(this.pageName + '.html') || (this.pageName === 'home' && (href === 'index.html' || href === '#home'))) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    let adminBadgeHtml = '';
    if (user && isUserAdmin(user)) {
      adminBadgeHtml = `
        <a href="teamadmin.html" class="header-admin-badge" title="Open Core Studio Admin Console">
          <span>⚡ Admin Console</span>
        </a>
      `;
    }

    let authButtonsDesktop = '';
    let authButtonsMobile = '';

    if (user) {
      const levelInfo = calculateLevel(user.boobaPoints);
      authButtonsDesktop = `
        ${adminBadgeHtml}
        <div class="user-profile-pill" style="display: flex; align-items: center; gap: 0.65rem; background: var(--bg-surface-elevated); padding: 0.35rem 0.85rem; border-radius: var(--radius-full); border: 1px solid var(--border-medium);">
          <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">
            ${user.username}
          </div>
          <span style="font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); background: var(--brand-yellow-subtle); padding: 0.15rem 0.5rem; border-radius: var(--radius-full);">
            ${Number(user.boobaPoints).toLocaleString()} BOOBA
          </span>
          <button class="btn btn-ghost btn-sm" onclick="window.boobaApp.logout()" title="Sign Out" style="padding: 0.2rem 0.4rem; color: var(--text-muted);">
            Sign Out
          </button>
        </div>
      `;

      authButtonsMobile = `
        <div style="padding: 0.75rem; background: var(--bg-surface-elevated); border-radius: var(--radius-md); margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
            <div>
              <div style="font-weight: 700; color: var(--text-primary);">${user.username}</div>
              <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${Number(user.boobaPoints).toLocaleString()} BOOBA • Lv.${levelInfo.level}</div>
            </div>
          </div>
        </div>
        ${user && isUserAdmin(user) ? `<a href="teamadmin.html" class="btn btn-outline btn-block btn-sm" style="margin-bottom: 0.5rem;">⚡ Open Admin Console</a>` : ''}
        <button class="btn btn-secondary btn-block btn-sm" onclick="window.boobaApp.logout()">Sign Out</button>
      `;
    } else {
      authButtonsDesktop = `
        <a href="signin.html#signin" class="btn btn-ghost btn-sm">
          Sign In
        </a>
        <a href="signin.html#signup" class="btn btn-primary btn-sm">
          Mint Passport (+100 BOOBA)
        </a>
      `;

      authButtonsMobile = `
        <a href="signin.html#signup" class="btn btn-primary btn-block" style="margin-bottom: 0.5rem; text-align: center;">
          Mint Passport (+100 BOOBA)
        </a>
        <a href="signin.html#signin" class="btn btn-secondary btn-block" style="text-align: center;">
          Sign In
        </a>
      `;
    }

    if (headerActions) headerActions.innerHTML = authButtonsDesktop;
    if (mobileFooter) mobileFooter.innerHTML = authButtonsMobile;
  }

  toggleMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer && backdrop) {
      drawer.classList.toggle('open');
      backdrop.classList.toggle('active');
    }
  }

  closeMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  closeModal() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    this.selectedQuestForProof = null;
    this.selectedQuestForSocial = null;
  }

  logout() {
    db.logout();
    alert('You have signed out.');
    window.location.href = 'index.html';
  }

  // --------------------------------------------------------------------------
  // PAGE RENDER ROUTING
  // --------------------------------------------------------------------------

  renderPage() {
    const mainContainer = document.getElementById('app');
    if (!mainContainer) return;

    switch (this.pageName) {
      case 'signin':
        this.renderSigninView(mainContainer);
        break;
      case 'dashboard':
        this.renderDashboardView(mainContainer);
        break;
      case 'passport':
        this.renderPassportView(mainContainer);
        break;
      case 'quests':
        this.renderQuestsView(mainContainer);
        break;
      case 'leaderboard':
        this.renderLeaderboardView(mainContainer);
        break;
      case 'rewards':
        this.renderRewardsView(mainContainer);
        break;
      case 'referrals':
        this.renderReferralsView(mainContainer);
        break;
      case 'home':
      default:
        this.renderHomeView(mainContainer);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // DEDICATED SIGN IN / SIGN UP (signin.html) VIEW
  // --------------------------------------------------------------------------

  renderSigninView(container) {
    const isSignUp = this.authMode === 'signup';
    const storedRef = sessionStorage.getItem('booba_ref_code') || '';

    container.innerHTML = `
      <div class="container" style="max-width: 1200px; padding: 2rem 1.5rem 4rem 1.5rem;">
        <div class="x-auth-layout">
          
          <!-- LEFT SIDE: Grand 3D BNB baby Mascot & Emblem -->
          <div class="x-auth-left">
            <div style="position: relative; text-align: center;">
              <img src="assets/mascot.jpg" class="x-auth-giant-logo" alt="Booba BNB baby Mascot">
              
              <div class="glass-panel" style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.25rem; border-radius: var(--radius-full); border: 1.5px solid var(--brand-yellow); display: flex; align-items: center; gap: 0.6rem; white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,0.8); background: rgba(14, 18, 27, 0.9);">
                <span style="font-weight: 800; font-size: 0.9rem; color: #FFFFFF;">BOOBA • BNB baby</span>
              </div>
            </div>
          </div>

          <!-- RIGHT SIDE: X-Style Auth Form & Actions -->
          <div class="x-auth-right">
            
            <h1 class="x-auth-headline" style="font-size: clamp(2rem, 4vw, 3rem); margin-bottom: 0.75rem;">
              Happening now
            </h1>

            <h2 class="x-auth-subhead" style="font-size: clamp(1.3rem, 2.5vw, 1.8rem); margin-bottom: 2rem; color: var(--text-secondary);">
              ${isSignUp ? 'Join the Booba Universe today.' : 'Sign in to access your Booba Passport.'}
            </h2>

            <div class="x-auth-actions-group">
              
              <!-- 1. Google One-Click -->
              <button type="button" class="btn-auth-pill" onclick="window.boobaApp.handleFastAuth('google')">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <!-- 2. Web3 Wallet -->
              <button type="button" class="btn-auth-pill btn-wallet" onclick="window.boobaApp.handleFastAuth('wallet')">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#F3BA2F"/>
                  <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#F3BA2F" fill-opacity="0.8"/>
                </svg>
                Continue with Web3 Wallet
              </button>

            </div>

            <!-- Divider -->
            <div class="x-auth-divider">
              <span>or</span>
            </div>

            <!-- Main Live Form -->
            <form id="dedicatedAuthForm" onsubmit="window.boobaApp.handleDedicatedAuthSubmit(event)" class="x-auth-input-box">
              
              ${isSignUp ? `
                <input type="text" id="dedicatedUsernameInput" placeholder="Choose username (e.g. CryptoKing)" class="x-input-field" required autocomplete="username">
              ` : ''}

              <input type="text" id="dedicatedEmailInput" placeholder="Email or username" class="x-input-field" required autocomplete="email">

              <input type="password" id="dedicatedPasswordInput" placeholder="Password (min 6 characters)" class="x-input-field" required autocomplete="current-password">

              ${isSignUp ? `
                <input type="text" id="dedicatedReferralInput" value="${storedRef}" placeholder="Referral code (Optional)" class="x-input-field text-mono" style="text-transform: uppercase;">
              ` : ''}

              <button type="submit" id="dedicatedSubmitBtn" class="btn-x-submit">
                ${isSignUp ? 'Create Account & Mint Passport (+100 BOOBA)' : 'Sign In'}
              </button>

            </form>

            <div class="x-legal-text">
              By signing up, you agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>, including Cookie Use.
            </div>

            <!-- Mode Switcher -->
            <div class="x-switch-account-row">
              ${isSignUp ? `
                Already have a Booba Passport? <a href="signin.html#signin" onclick="window.boobaApp.switchDedicatedAuthMode('signin')">Sign in</a>
              ` : `
                Don't have an account? <a href="signin.html#signup" onclick="window.boobaApp.switchDedicatedAuthMode('signup')">Mint Passport (Sign Up)</a>
              `}
            </div>

          </div>
        </div>
      </div>
    `;
  }

  switchDedicatedAuthMode(mode) {
    this.authMode = mode;
    window.location.hash = mode === 'signin' ? 'signin' : 'signup';
    this.renderPage();
  }

  async handleDedicatedAuthSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('dedicatedSubmitBtn');
    const originalText = submitBtn ? submitBtn.textContent : 'Submit';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating with Supabase...';
    }

    try {
      const emailOrUsername = document.getElementById('dedicatedEmailInput')?.value.trim();
      const password = document.getElementById('dedicatedPasswordInput')?.value;

      if (this.authMode === 'signup') {
        const username = document.getElementById('dedicatedUsernameInput')?.value.trim();
        const referralCode = document.getElementById('dedicatedReferralInput')?.value.trim();

        if (!username || !emailOrUsername) {
          alert('Please enter both a username and email to mint your passport.');
          return;
        }

        if (!password || password.length < 6) {
          alert('Please choose a password with at least 6 characters.');
          return;
        }

        const res = await db.signup({ username, email: emailOrUsername, password, referralCode });
        if (res.success) {
          alert(`🎉 Welcome to BOOBA, ${res.user.username}! Your digital passport (${res.user.passportId}) has been minted with +100 BOOBA!`);
          if (res.user.role === 'admin') {
            window.location.href = 'teamadmin.html';
          } else {
            window.location.href = 'dashboard.html';
          }
        } else {
          alert(res.message || 'Signup failed');
        }
      } else {
        if (!emailOrUsername || !password) {
          alert('Please enter both your email/username and password.');
          return;
        }

        const res = await db.login({ emailOrUsername, password });
        if (res.success) {
          alert(`👋 Welcome back, ${res.user.username}!`);
          if (res.user.role === 'admin') {
            window.location.href = 'teamadmin.html';
          } else {
            window.location.href = 'dashboard.html';
          }
        } else {
          alert(res.message || 'Login failed');
        }
      }
    } catch (err) {
      alert('An error occurred during authentication. Please check your network.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  async handleFastAuth(provider) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const mockUsername = provider === 'wallet' ? `Web3Panda_${randomSuffix}` : `Panda_${randomSuffix}`;
    const mockEmail = `${mockUsername.toLowerCase()}@booba.crypto`;
    const mockPass = 'boobapassword123';

    let res = await db.login({ emailOrUsername: mockEmail, password: mockPass });
    if (!res.success) {
      res = await db.signup({
        username: mockUsername,
        email: mockEmail,
        password: mockPass,
        walletAddress: provider === 'wallet' ? `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 6)}` : ''
      });
    }

    if (res.success) {
      alert(`Connected successfully with ${provider}! Welcome ${res.user.username}.`);
      window.location.href = 'dashboard.html';
    }
  }

  // --------------------------------------------------------------------------
  // 1. HOME LANDING VIEW
  // --------------------------------------------------------------------------

  renderHomeView(container) {
    const user = db.currentUser;
    const stats = db.getStats();

    container.innerHTML = `
      <!-- HERO SECTION -->
      <section class="hero-section">
        <div class="container hero-container">
          <div class="hero-content">
            <div class="hero-badge">
              <span class="pulse-dot"></span>
              <span>BNB Smart Chain (BEP-20) Ecosystem</span>
            </div>
            
            <h1 class="hero-title">
              The BNB Baby Revolution Powered by <span class="text-gradient-gold">BOOBA</span>
            </h1>
            
            <p class="hero-subtitle">
              Mint your digital Booba Passport, conquer live community bounties, climb the on-chain leaderboard, and earn real $BOOBA rewards.
            </p>

            <div class="hero-actions">
              ${user ? `
                <a href="dashboard.html" class="btn btn-primary btn-lg">
                  Launch Dashboard ↗
                </a>
                <a href="quests.html" class="btn btn-secondary btn-lg">
                  Explore Quests
                </a>
              ` : `
                <a href="signin.html#signup" class="btn btn-primary btn-lg">
                  Mint Passport (+100 BOOBA)
                </a>
                <a href="signin.html#signin" class="btn btn-secondary btn-lg">
                  Sign In
                </a>
              `}
            </div>

            <div class="hero-stats-grid">
              <div class="stat-box">
                <div class="stat-value text-gradient-gold">${Number(stats.totalUsers).toLocaleString()}</div>
                <div class="stat-label">Passports Minted</div>
              </div>
              <div class="stat-box">
                <div class="stat-value text-gradient-gold">${Number(stats.activeQuestsCount).toLocaleString()}</div>
                <div class="stat-label">Active Quests</div>
              </div>
              <div class="stat-box">
                <div class="stat-value text-gradient-gold">${Number(stats.totalPointsDistributed).toLocaleString()}</div>
                <div class="stat-label">BOOBA Distributed</div>
              </div>
            </div>
          </div>

          <div class="hero-media">
            <div class="mascot-hologram-wrapper">
              <img src="assets/mascot.jpg" alt="Booba Mascot" class="hero-mascot-img">
              <div class="mascot-glow-ring"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ECOSYSTEM PILLARS -->
      <section class="section-container" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle);">
        <div class="container">
          <div class="section-header text-center">
            <span class="badge-tag">Community Architecture</span>
            <h2 class="section-title">Everything You Need In One Ecosystem</h2>
            <p class="section-subtitle">Live on BNB Chain with decentralized community reputation and instant task rewards.</p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
            <div class="card card-hover">
              <div class="card-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
              </div>
              <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Digital Booba Passport</h3>
              <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6;">
                Your on-chain identity in the BNB Baby movement. Track your rank tier, reputation score, and verified achievements.
              </p>
              <a href="passport.html" class="nav-link" style="margin-top: 1rem; display: inline-block; color: var(--brand-yellow); font-weight: 700;">View Passport →</a>
            </div>

            <div class="card card-hover">
              <div class="card-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
              <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Live Quests & Bounties</h3>
              <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6;">
                Daily check-ins, social actions, and creative meme contests created directly by the core team with instant $BOOBA claims.
              </p>
              <a href="quests.html" class="nav-link" style="margin-top: 1rem; display: inline-block; color: var(--brand-yellow); font-weight: 700;">Browse Quests →</a>
            </div>

            <div class="card card-hover">
              <div class="card-icon-wrapper">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              </div>
              <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Real Leaderboard</h3>
              <p style="font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6;">
                Climb the ranks of genuine community holders. Top performers qualify for exclusive airdrop allocations and perks.
              </p>
              <a href="leaderboard.html" class="nav-link" style="margin-top: 1rem; display: inline-block; color: var(--brand-yellow); font-weight: 700;">View Rankings →</a>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // --------------------------------------------------------------------------
  // 2. DASHBOARD OVERVIEW VIEW
  // --------------------------------------------------------------------------

  renderDashboardView(container) {
    const user = db.currentUser;
    const stats = db.getStats();

    if (!user) {
      container.innerHTML = `
        <div class="container page-content">
          <div class="card text-center" style="max-width: 540px; margin: 3rem auto; padding: 3rem 2rem;">
            <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 1.5rem auto; border: 2px solid var(--brand-yellow);">
            <h2>Connect Your Booba Passport</h2>
            <p style="color: var(--text-secondary); margin: 0.75rem 0 2rem 0; font-size: 0.95rem;">
              You are currently viewing guest mode. Mint your free passport or sign in to track your personal BOOBA points, daily streak, and bounties.
            </p>
            <div class="flex items-center justify-center gap-3">
              <a href="signin.html#signup" class="btn btn-primary">Mint Passport (+100 BOOBA)</a>
              <a href="signin.html#signin" class="btn btn-secondary">Sign In</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const levelInfo = calculateLevel(user.boobaPoints);

    container.innerHTML = `
      <div class="container page-content">
        <!-- User Welcome Bar -->
        <div class="card" style="margin-bottom: 2rem; background: linear-gradient(135deg, rgba(243, 186, 47, 0.1) 0%, rgba(14, 18, 27, 0.9) 100%); border-color: rgba(243, 186, 47, 0.25);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 1.25rem;">
              <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 20px var(--brand-yellow-glow);">
              <div>
                <div style="display: flex; align-items: center; gap: 0.65rem;">
                  <h1 style="font-size: 1.5rem; margin: 0;">Welcome, ${user.username}!</h1>
                  <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800;">Lv.${levelInfo.level} ${levelInfo.title}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.35rem;">
                  Passport ID: <strong class="text-mono" style="color: var(--text-primary);">${user.passportId}</strong> • Member Since: ${user.memberSince}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button class="btn btn-primary" onclick="window.boobaApp.handleDailyCheckIn()">
                ⚡ Daily Check-In (+50 BOOBA)
              </button>
            </div>
          </div>

          <!-- Level Progress Bar -->
          <div style="margin-top: 1.75rem; padding-top: 1.5rem; border-top: 1px solid var(--border-subtle);">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
              <span>Level Progress: <strong>${levelInfo.title}</strong></span>
              <span><strong>${Number(user.boobaPoints).toLocaleString()}</strong> / ${levelInfo.nextTier ? levelInfo.nextTier.min.toLocaleString() : 'MAX'} BOOBA (${levelInfo.progressPercent}%)</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${levelInfo.progressPercent}%;"></div>
            </div>
          </div>
        </div>

        <!-- Dashboard Stats Grid -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
          <div class="card">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Your Balance</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--brand-yellow); margin: 0.35rem 0;">
              ${Number(user.boobaPoints).toLocaleString()}
            </div>
            <div style="font-size: 0.75rem; color: var(--accent-emerald);">+100 Welcome Bonus Active</div>
          </div>

          <div class="card">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Completed Quests</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-primary); margin: 0.35rem 0;">
              ${Number(user.completedQuestsCount || 0)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);"><a href="quests.html" style="color: var(--brand-yellow);">Earn more in Quests →</a></div>
          </div>

          <div class="card">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Current Streak</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent-orange); margin: 0.35rem 0;">
              🔥 ${Number(user.streakDays || 1)} Days
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Refreshes every 24h</div>
          </div>

          <div class="card">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Reputation Score</div>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent-emerald); margin: 0.35rem 0;">
              ${Number(user.reputation || 75)}/100
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Verified Community Standing</div>
          </div>
        </div>

        <!-- Quick Action Cards -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
          <div class="card">
            <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Digital Passport</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              View your digital passport card with customized badges and reputation watermark.
            </p>
            <a href="passport.html" class="btn btn-secondary btn-block btn-sm">Open My Passport</a>
          </div>

          <div class="card">
            <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Active Quests & Bounties</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              Complete community tasks and submit proofs to earn instant and reviewed BOOBA token rewards.
            </p>
            <a href="quests.html" class="btn btn-primary btn-block btn-sm">Explore Quests</a>
          </div>

          <div class="card">
            <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem;">Referral Headquarters</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              Invite friends with your unique code <strong class="text-mono" style="color: var(--brand-yellow);">${user.referralCode}</strong> to earn +300 BOOBA each.
            </p>
            <a href="referrals.html" class="btn btn-secondary btn-block btn-sm">Referral Center</a>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 3. PASSPORT VIEW
  // --------------------------------------------------------------------------

  renderPassportView(container) {
    const user = db.currentUser;

    if (!user) {
      container.innerHTML = `
        <div class="container page-content">
          <div class="card text-center" style="max-width: 500px; margin: 3rem auto; padding: 3rem 2rem;">
            <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 1.5rem auto; border: 2px solid var(--brand-yellow);">
            <h2>Mint Your Official Booba Passport</h2>
            <p style="color: var(--text-secondary); margin: 0.75rem 0 2rem 0; font-size: 0.95rem;">
              You do not have an active passport yet. Sign up or log in to generate your unique on-chain Booba Passport card!
            </p>
            <a href="signin.html#signup" class="btn btn-primary btn-lg btn-block">
              Mint Passport (+100 BOOBA)
            </a>
          </div>
        </div>
      `;
      return;
    }

    const levelInfo = calculateLevel(user.boobaPoints);

    container.innerHTML = `
      <div class="container page-content">
        <div class="section-header text-center" style="margin-bottom: 2.5rem;">
          <span class="badge-tag">Identity Document</span>
          <h1 class="section-title">Official Booba Digital Passport</h1>
          <p class="section-subtitle">Your cryptographic identity in the BNB Baby movement.</p>
        </div>

        <div style="display: flex; justify-content: center; margin-bottom: 3rem;">
          <!-- HOLOGRAPHIC PASSPORT CARD -->
          <div class="passport-card-real" style="max-width: 480px; width: 100%; background: linear-gradient(145deg, #101522 0%, #080B12 100%); border: 1.5px solid rgba(243, 186, 47, 0.4); border-radius: 20px; padding: 2rem; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(243, 186, 47, 0.2); position: relative; overflow: hidden;">
            
            <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.08; pointer-events: none;">
              <img src="assets/mascot.jpg" style="width: 220px; height: 220px; border-radius: 50%;">
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <img src="assets/mascot.jpg" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
                <div>
                  <div style="font-weight: 800; font-size: 0.9rem; letter-spacing: 0.05em; color: #FFFFFF;">BOOBA PASSPORT</div>
                  <div style="font-size: 0.65rem; color: var(--brand-yellow); font-weight: 700; text-transform: uppercase;">BNB Smart Chain</div>
                </div>
              </div>
              <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800;">
                Lv.${levelInfo.level}
              </span>
            </div>

            <div style="display: flex; gap: 1.25rem; align-items: center; margin-bottom: 1.5rem;">
              <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 80px; height: 80px; border-radius: 14px; border: 2px solid var(--brand-yellow); object-fit: cover;">
              <div>
                <div style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF;">${user.username}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
                  ID: <span class="text-mono" style="color: var(--brand-yellow); font-weight: 700;">${user.passportId}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem; font-weight: 600;">
                  ● Verified Community Member
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; background: rgba(0, 0, 0, 0.3); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.05);">
              <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">BOOBA Points</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--brand-yellow);">${Number(user.boobaPoints).toLocaleString()}</div>
              </div>
              <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Reputation</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--accent-emerald);">${user.reputation || 75}/100</div>
              </div>
              <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Quests Done</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">${user.completedQuestsCount || 0}</div>
              </div>
              <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Streak</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: var(--accent-orange);">🔥 ${user.streakDays || 1} Days</div>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
              <span>Issue Date: ${user.memberSince}</span>
              <span>Ref: ${user.referralCode}</span>
            </div>
          </div>
        </div>

        <!-- Level Perks Table -->
        <div class="card" style="max-width: 800px; margin: 0 auto;">
          <h3 style="font-size: 1.2rem; margin-bottom: 1rem;">Passport Level Progression Tiers</h3>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${LEVEL_TIERS.map(t => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-radius: 8px; background: ${user.boobaPoints >= t.min ? 'rgba(243, 186, 47, 0.08)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${user.boobaPoints >= t.min ? 'rgba(243, 186, 47, 0.3)' : 'var(--border-subtle)'};">
                <div>
                  <strong>Lv.${t.level} ${t.title}</strong>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">${t.unlock}</div>
                </div>
                <div style="text-align: right;">
                  <span class="text-mono" style="font-size: 0.85rem; color: var(--brand-yellow); font-weight: 700;">${t.min.toLocaleString()}+ BOOBA</span>
                  <div>${user.boobaPoints >= t.min ? '<span style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700;">✓ Unlocked</span>' : '<span style="font-size: 0.75rem; color: var(--text-muted);">Locked</span>'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 4. QUESTS & BOUNTIES VIEW
  // --------------------------------------------------------------------------

  renderQuestsView(container) {
    const user = db.currentUser;
    const quests = db.quests;

    let filtered = quests;
    if (this.activeQuestFilter !== 'all') {
      filtered = quests.filter(q => q.category === this.activeQuestFilter);
    }

    container.innerHTML = `
      <div class="container page-content">
        <div class="section-header text-center" style="margin-bottom: 2rem;">
          <span class="badge-tag">Live Task Hub</span>
          <h1 class="section-title">Community Quests & Bounties</h1>
          <p class="section-subtitle">Complete tasks published by the core team to earn real $BOOBA tokens.</p>
        </div>

        <div class="flex items-center justify-center gap-2" style="margin-bottom: 2.5rem; flex-wrap: wrap;">
          <button class="btn btn-sm ${this.activeQuestFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="window.boobaApp.setQuestFilter('all')">All Quests (${quests.length})</button>
          <button class="btn btn-sm ${this.activeQuestFilter === 'daily' ? 'btn-primary' : 'btn-secondary'}" onclick="window.boobaApp.setQuestFilter('daily')">Daily Check-In</button>
          <button class="btn btn-sm ${this.activeQuestFilter === 'social' ? 'btn-primary' : 'btn-secondary'}" onclick="window.boobaApp.setQuestFilter('social')">Social Tasks</button>
          <button class="btn btn-sm ${this.activeQuestFilter === 'creative' ? 'btn-primary' : 'btn-secondary'}" onclick="window.boobaApp.setQuestFilter('creative')">Creative & Memes</button>
          <button class="btn btn-sm ${this.activeQuestFilter === 'community' ? 'btn-primary' : 'btn-secondary'}" onclick="window.boobaApp.setQuestFilter('community')">Community</button>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
          ${filtered.length === 0 ? `
            <div class="card text-center" style="grid-column: 1 / -1; padding: 3rem;">
              <p style="color: var(--text-secondary);">No active quests in this category. Check back soon!</p>
            </div>
          ` : filtered.map(q => `
            <div class="card card-hover" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <span class="badge-tag" style="text-transform: uppercase;">${q.category}</span>
                  <div class="quest-reward-pill">+${Number(q.rewardBooba).toLocaleString()} BOOBA</div>
                </div>

                <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem; color: #FFFFFF;">${q.title}</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 1rem;">
                  ${q.description}
                </p>

                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px;">
                  📋 ${q.requirements || 'Complete task and claim reward'}
                </div>
              </div>

              <div>
                ${q.type === 'instant' ? `
                  <button class="btn btn-primary btn-block btn-sm" onclick="window.boobaApp.handleDailyCheckIn()">
                    ⚡ ${q.actionText}
                  </button>
                ` : q.type === 'social' ? `
                  <button class="btn btn-primary btn-block btn-sm" onclick="window.boobaApp.openSocialModal('${q.id}')">
                    🔗 ${q.actionText}
                  </button>
                ` : `
                  <button class="btn btn-primary btn-block btn-sm" onclick="window.boobaApp.openProofModal('${q.id}')">
                    📝 ${q.actionText}
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  setQuestFilter(filter) {
    this.activeQuestFilter = filter;
    this.renderPage();
  }

  openSocialModal(questId) {
    if (!db.currentUser) {
      window.location.href = 'signin.html#signup';
      return;
    }
    const quest = db.quests.find(q => q.id === questId);
    if (!quest) return;
    this.selectedQuestForSocial = quest;

    const modal = document.getElementById('socialVerifyModal');
    const titleEl = document.getElementById('socialModalTitle');
    const rewardEl = document.getElementById('socialModalReward');

    if (titleEl) titleEl.textContent = quest.title;
    if (rewardEl) rewardEl.textContent = `+${quest.rewardBooba} BOOBA`;

    if (quest.targetUrl) {
      window.open(quest.targetUrl, '_blank');
    }

    if (modal) modal.classList.add('active');
  }

  async handleConfirmSocial() {
    if (!this.selectedQuestForSocial) return;
    const res = await db.completeSocialQuest(this.selectedQuestForSocial.id);
    this.closeModal();
    if (res.success) {
      alert(`🎉 Verified! +${res.reward} BOOBA credited to your passport!`);
    } else {
      alert(res.message || 'Verification failed');
    }
  }

  openProofModal(questId) {
    if (!db.currentUser) {
      window.location.href = 'signin.html#signup';
      return;
    }
    const quest = db.quests.find(q => q.id === questId);
    if (!quest) return;
    this.selectedQuestForProof = quest;

    const modal = document.getElementById('proofModal');
    const titleEl = document.getElementById('proofQuestTitle');
    const rewardEl = document.getElementById('proofRewardText');

    if (titleEl) titleEl.textContent = quest.title;
    if (rewardEl) rewardEl.textContent = `Reward: +${quest.rewardBooba} BOOBA on team approval`;

    if (modal) modal.classList.add('active');
  }

  async handleProofSubmit(e) {
    e.preventDefault();
    if (!this.selectedQuestForProof) return;

    const proofUrl = document.getElementById('proofUrlInput')?.value.trim();
    const proofDesc = document.getElementById('proofDescriptionInput')?.value.trim();

    if (!proofUrl && !proofDesc) {
      alert('Please provide a URL or brief description of your proof.');
      return;
    }

    const res = await db.submitProof({
      questId: this.selectedQuestForProof.id,
      proofUrl,
      proofDescription: proofDesc
    });

    this.closeModal();
    if (res.success) {
      alert('✅ Proof submitted successfully! The team will review it shortly in the Admin Console.');
    } else {
      alert(res.message || 'Submission failed');
    }
  }

  async handleDailyCheckIn() {
    if (!db.currentUser) {
      window.location.href = 'signin.html#signup';
      return;
    }
    const res = await db.dailyCheckIn();
    if (res.success) {
      alert(`🔥 Streak: ${res.streak} Days! +${res.bonus} BOOBA added to your passport balance!`);
    } else {
      alert(res.message || 'Check-in failed');
    }
  }

  // --------------------------------------------------------------------------
  // 5. LEADERBOARD VIEW
  // --------------------------------------------------------------------------

  renderLeaderboardView(container) {
    const users = db.users;

    container.innerHTML = `
      <div class="container page-content">
        <div class="section-header text-center" style="margin-bottom: 2.5rem;">
          <span class="badge-tag">Real-Time Rankings</span>
          <h1 class="section-title">Community Leaderboard</h1>
          <p class="section-subtitle">Real registered holders ranked by $BOOBA points and reputation.</p>
        </div>

        <div class="card" style="padding: 0; overflow: hidden; border-radius: 16px;">
          <div style="overflow-x: auto;">
            <table class="leaderboard-table" style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-subtle); font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted);">
                  <th style="padding: 1rem 1.25rem;">Rank</th>
                  <th style="padding: 1rem 1.25rem;">Panda Member</th>
                  <th style="padding: 1rem 1.25rem;">Passport ID</th>
                  <th style="padding: 1rem 1.25rem;">Tier</th>
                  <th style="padding: 1rem 1.25rem;">Quests Done</th>
                  <th style="padding: 1rem 1.25rem; text-align: right;">BOOBA Points</th>
                </tr>
              </thead>
              <tbody>
                ${users.length === 0 ? `
                  <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                      No registered passports yet. Mint the first one and take the #1 spot!
                    </td>
                  </tr>
                ` : users.map((u, idx) => {
                  const rank = idx + 1;
                  const levelInfo = calculateLevel(u.boobaPoints);
                  const isCurrent = db.currentUser && db.currentUser.id === u.id;

                  return `
                    <tr style="border-bottom: 1px solid var(--border-subtle); background: ${isCurrent ? 'rgba(243, 186, 47, 0.08)' : 'transparent'};">
                      <td style="padding: 1rem 1.25rem; font-weight: 800; font-size: 1rem;">
                        ${rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`}
                      </td>
                      <td style="padding: 1rem 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
                          <div>
                            <strong style="color: #FFFFFF;">${u.username}</strong>
                            ${isCurrent ? '<span class="badge-tag" style="margin-left: 0.35rem; font-size: 0.65rem;">YOU</span>' : ''}
                            ${u.role === 'admin' ? '<span style="font-size: 0.65rem; color: var(--brand-yellow); margin-left: 0.35rem; font-weight: 700;">[Admin]</span>' : ''}
                          </div>
                        </div>
                      </td>
                      <td style="padding: 1rem 1.25rem; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary);">
                        ${u.passportId}
                      </td>
                      <td style="padding: 1rem 1.25rem;">
                        <span class="badge-tag" style="font-size: 0.72rem;">Lv.${levelInfo.level} ${levelInfo.title}</span>
                      </td>
                      <td style="padding: 1rem 1.25rem; font-weight: 600; color: var(--text-secondary);">
                        ${u.completedQuestsCount || 0}
                      </td>
                      <td style="padding: 1rem 1.25rem; text-align: right; font-weight: 800; color: var(--brand-yellow); font-size: 1.05rem;">
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

  // --------------------------------------------------------------------------
  // 6. REWARDS VAULT VIEW
  // --------------------------------------------------------------------------

  renderRewardsView(container) {
    container.innerHTML = `
      <div class="container page-content">
        <div class="section-header text-center" style="margin-bottom: 2.5rem;">
          <span class="badge-tag">Treasury Allocation</span>
          <h1 class="section-title">BOOBA Rewards Vault</h1>
          <p class="section-subtitle">Unlock community perks, airdrop multipliers, and BNB Baby treasury governance.</p>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
          <div class="card">
            <h3 style="font-size: 1.2rem; color: var(--brand-yellow); margin-bottom: 0.5rem;">Airdrop Multiplier</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Maintain your daily streak to receive up to a 2.5x point multiplier on future BNB baby ecosystem snapshot drops.
            </p>
            <div style="font-size: 0.8rem; color: var(--accent-emerald); font-weight: 700;">● Active on Mainnet</div>
          </div>

          <div class="card">
            <h3 style="font-size: 1.2rem; color: var(--brand-yellow); margin-bottom: 0.5rem;">Exclusive Discord Perks</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Reach Level 5 (Booba Grinder) to gain automatic access to private community alpha channels and founder AMAs.
            </p>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Requires Lv.5+</div>
          </div>

          <div class="card">
            <h3 style="font-size: 1.2rem; color: var(--brand-yellow); margin-bottom: 0.5rem;">Governance Voting</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Top passport holders participate in community proposals, marketing allocations, and new quest grants.
            </p>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Requires Lv.8+</div>
          </div>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 7. REFERRALS HQ VIEW
  // --------------------------------------------------------------------------

  renderReferralsView(container) {
    const user = db.currentUser;
    const referrals = db.referrals;

    if (!user) {
      container.innerHTML = `
        <div class="container page-content">
          <div class="card text-center" style="max-width: 500px; margin: 3rem auto; padding: 3rem 2rem;">
            <h2>Referral Headquarters</h2>
            <p style="color: var(--text-secondary); margin: 0.75rem 0 2rem 0;">
              Please mint your passport to get your unique referral link and earn +300 BOOBA per invite!
            </p>
            <a href="signin.html#signup" class="btn btn-primary btn-block">
              Mint Passport (+100 BOOBA)
            </a>
          </div>
        </div>
      `;
      return;
    }

    const refLink = `${window.location.origin}/signin.html?ref=${user.referralCode}`;
    const myReferrals = referrals.filter(r => r.referrerUsername?.toLowerCase() === user.username?.toLowerCase() || r.referrerUsername?.toUpperCase() === user.referralCode?.toUpperCase());

    container.innerHTML = `
      <div class="container page-content">
        <div class="section-header text-center" style="margin-bottom: 2.5rem;">
          <span class="badge-tag">Invite & Earn</span>
          <h1 class="section-title">Referral Headquarters</h1>
          <p class="section-subtitle">Earn +300 BOOBA for every friend who mints a passport with your code.</p>
        </div>

        <div class="card" style="max-width: 650px; margin: 0 auto 2.5rem auto;">
          <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Your Unique Referral Link</h3>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <input type="text" readonly value="${refLink}" id="refLinkInput" class="form-input text-mono" style="flex: 1; min-width: 250px;">
            <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${refLink}'); alert('Referral link copied to clipboard!');">
              Copy Link
            </button>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.75rem;">
            Your Referral Code: <strong class="text-mono" style="color: var(--brand-yellow);">${user.referralCode}</strong>
          </div>
        </div>

        <div class="card" style="max-width: 800px; margin: 0 auto;">
          <h3 style="font-size: 1.15rem; margin-bottom: 1rem;">Your Verified Referrals (${myReferrals.length})</h3>
          ${myReferrals.length === 0 ? `
            <p style="color: var(--text-secondary); font-size: 0.9rem; text-align: center; padding: 2rem;">
              No referrals yet. Share your link with other crypto enthusiasts to start earning!
            </p>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${myReferrals.map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border: 1px solid var(--border-subtle);">
                  <div>
                    <strong>${r.referredUsername}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Passport: ${r.passportId} • Joined: ${r.joinedDate}</div>
                  </div>
                  <div style="color: var(--accent-emerald); font-weight: 700; font-size: 0.85rem;">
                    +${r.rewardClaimed} BOOBA Verified
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }
}

// Attach globally
window.boobaApp = new BoobaApp();
