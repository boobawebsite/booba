/* ==========================================================================
   BOOBA (BNB baby) — Master Unified Application Controller (app.js)
   Single JS Core for all pages (index, dashboard, passport, quests, signin, etc.)
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './services/db.js';
import { SupabaseService, SUPABASE_URL, supabase, isUserAdmin, ADMIN_EMAILS } from './services/supabaseClient.js';
import { motionEngine } from './services/motion.js';

class BoobaApp {
  constructor() {
    this.pageName = this.detectPageName();
    this.activeQuestFilter = 'all';
    this.dailyQuartile = 'all'; // 'all', 'q1', 'q2', 'q3', 'q4'
    this.authMode = 'signup'; // 'signup' or 'signin'
    this.selectedQuestForProof = null;
    this.selectedQuestForSocial = null;
    this.eip6963Providers = new Map();

    this.initEIP6963();
    this.init();
  }

  initEIP6963() {
    if (typeof window === 'undefined') return;
    window.addEventListener('eip6963:announceProvider', (event) => {
      if (event.detail && event.detail.info && event.detail.provider) {
        const key = event.detail.info.rdns || event.detail.info.uuid || event.detail.info.name;
        this.eip6963Providers.set(key, event.detail);
        if (document.getElementById('walletConnectDynamicModal')) {
          this.renderWalletOptionsList();
        }
      }
    });
    window.dispatchEvent(new CustomEvent('eip6963:requestProvider'));
  }

  detectPageName() {
    // 1. Check data-page attribute on body tag first (highest fidelity across all static/Vercel hosts)
    if (typeof document !== 'undefined' && document.body) {
      const bodyPage = document.body.getAttribute('data-page');
      if (bodyPage && bodyPage !== 'home') return bodyPage;
    }

    const rawPath = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
    const segments = rawPath.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';

    // 2. Direct path matching (supports .html and clean Vercel/production URLs)
    if (last === 'about.html' || last === 'about' || last === 'tokenomics') return 'about';
    if (last === 'signin.html' || last === 'signin' || last === 'login' || last === 'signup') return 'signin';
    if (last === 'dashboard.html' || last === 'dashboard' || last === 'overview') return 'dashboard';
    if (last === 'passport.html' || last === 'passport') return 'passport';
    if (last === 'quests.html' || last === 'quests') return 'quests';
    if (last === 'leaderboard.html' || last === 'leaderboard') return 'leaderboard';
    if (last === 'rewards.html' || last === 'rewards') return 'rewards';
    if (last === 'referrals.html' || last === 'referrals') return 'referrals';
    if (last === 'withdraw.html' || last === 'withdraw') return 'withdraw';
    if (last === 'settings.html' || last === 'settings') return 'settings';
    
    // 3. Sub-path matching (e.g. /dashboard/leaderboard or /dashboard/quests)
    if (rawPath.includes('/about') || rawPath.includes('/tokenomics')) return 'about';
    if (rawPath.includes('/signin')) return 'signin';
    if (rawPath.includes('/passport')) return 'passport';
    if (rawPath.includes('/quests')) return 'quests';
    if (rawPath.includes('/leaderboard')) return 'leaderboard';
    if (rawPath.includes('/rewards')) return 'rewards';
    if (rawPath.includes('/referrals')) return 'referrals';
    if (rawPath.includes('/withdraw')) return 'withdraw';
    if (rawPath.includes('/settings')) return 'settings';
    if (rawPath.includes('/dashboard')) return 'dashboard';

    // 4. Hash routing fallback
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'about' || hash === 'tokenomics') return 'about';
    if (hash === 'signin' || hash === 'login' || hash === 'signup' || hash === 'auth') return 'signin';
    if (hash.startsWith('dashboard/passport') || hash === 'passport') return 'passport';
    if (hash.startsWith('dashboard/quests') || hash === 'quests') return 'quests';
    if (hash.startsWith('dashboard/leaderboard') || hash === 'leaderboard') return 'leaderboard';
    if (hash.startsWith('dashboard/rewards') || hash === 'rewards') return 'rewards';
    if (hash.startsWith('dashboard/referrals') || hash === 'referrals') return 'referrals';
    if (hash.startsWith('dashboard/withdraw') || hash === 'withdraw') return 'withdraw';
    if (hash.startsWith('dashboard/settings') || hash === 'settings') return 'settings';
    if (hash.startsWith('dashboard/overview') || hash.startsWith('dashboard') || hash === 'overview') return 'dashboard';

    if (typeof document !== 'undefined' && document.body) {
      const bodyPage = document.body.getAttribute('data-page');
      if (bodyPage) return bodyPage;
    }

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
    this.checkOAuthSession();
    this.renderHeaderNav();
    this.renderPage();

    // Initialize Living Motion & WebGL Engine
    motionEngine.init();
  }

  async checkOAuthSession() {
    if (!supabase || !supabase.auth) return;
    try {
      // 1. Check existing active session
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user && !db.currentUser) {
        const email = session.user.email;
        const meta = session.user.user_metadata || {};
        const username = meta.full_name || meta.name || email.split('@')[0];
        const avatarUrl = meta.avatar_url || meta.picture || 'assets/mascot.jpg';

        const res = await db.loginOrSignupWithOAuth({ email, username, avatarUrl });
        if (res.success && res.isNewUser && res.seedPhrase) {
          this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
            window.location.href = 'dashboard.html';
          });
        }
      }

      // 2. Realtime listener for OAuth callback redirects
      supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && currentSession && currentSession.user && !db.currentUser) {
          const email = currentSession.user.email;
          const meta = currentSession.user.user_metadata || {};
          const username = meta.full_name || meta.name || email.split('@')[0];
          const avatarUrl = meta.avatar_url || meta.picture || 'assets/mascot.jpg';

          const res = await db.loginOrSignupWithOAuth({ email, username, avatarUrl });
          if (res.success && res.isNewUser && res.seedPhrase) {
            this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
              window.location.href = 'dashboard.html';
            });
          } else if (res.success) {
            window.location.href = 'dashboard.html';
          }
        }
      });
    } catch (err) {
      console.warn('OAuth session check:', err);
    }
  }

  setupGlobalEvents() {
    // Escape key closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeMobileNav();
      }
    });

    // Delegated clicks & outside tap handling
    const handleOutsideClickOrTouch = (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeModal();
      }
      if (e.target.id === 'mobileNavBackdrop' || e.target.closest('#mobileNavCloseBtn')) {
        this.closeMobileNav();
        return;
      }
      if (e.target.closest('#mobileNavToggleBtn')) {
        this.toggleMobileNav();
        return;
      }
      if (e.target.closest('.mobile-nav-link')) {
        this.closeMobileNav();
        return;
      }
      // If drawer is open and user tapped anywhere outside the drawer
      const drawer = document.getElementById('mobileNavDrawer');
      if (drawer && drawer.classList.contains('open') && !drawer.contains(e.target)) {
        this.closeMobileNav();
      }
    };

    document.addEventListener('click', handleOutsideClickOrTouch);
    document.addEventListener('touchend', (e) => {
      const backdrop = document.getElementById('mobileNavBackdrop');
      if (e.target === backdrop) {
        e.preventDefault();
        this.closeMobileNav();
      }
    }, { passive: false });

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
      const href = (link.getAttribute('href') || '').toLowerCase();
      if (
        href.includes(this.pageName + '.html') ||
        href.endsWith('/' + this.pageName) ||
        href === this.pageName ||
        (this.pageName === 'home' && (href === 'index.html' || href === '/' || href === '' || href === '#home'))
      ) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    let authButtonsDesktop = '';
    let authButtonsMobile = '';

    if (user) {
      const levelInfo = calculateLevel(user.boobaPoints);
      const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
      const formattedWallet = isWalletConnected ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : '';

      authButtonsDesktop = `
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
        <div style="padding: 0.85rem; background: var(--bg-surface-elevated); border-radius: 16px; margin-bottom: 0.75rem; border: 1px solid rgba(255,255,255,0.08);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.65rem;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
              <div>
                <div style="font-weight: 800; color: var(--text-primary); font-size: 0.92rem;">${user.username}</div>
                <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${Number(user.boobaPoints).toLocaleString()} BOOBA • Lv.${levelInfo.level}</div>
              </div>
            </div>
            <a href="settings.html" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 0.25rem 0.6rem;">Settings</a>
          </div>
          <button type="button" class="btn ${isWalletConnected ? 'btn-secondary' : 'btn-primary'} btn-block btn-sm" onclick="window.boobaApp.openWalletModal()" style="display: flex; align-items: center; justify-content: center; gap: 0.45rem;">
            <span class="pulse-dot" style="width: 6px; height: 6px; background: ${isWalletConnected ? 'var(--accent-emerald)' : 'var(--brand-yellow)'};"></span>
            <span>${isWalletConnected ? `Wallet: ${formattedWallet}` : 'Connect Web3 Wallet'}</span>
          </button>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <a href="withdraw.html" class="btn btn-secondary btn-block btn-sm" style="flex: 1; text-align: center;">Withdraw</a>
          <button class="btn btn-ghost btn-block btn-sm" onclick="window.boobaApp.logout()" style="flex: 1;">Sign Out</button>
        </div>
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

    this.renderMobileBottomDock();
  }

  renderMobileBottomDock() {
    let dock = document.getElementById('mobileBottomDock');
    if (!dock) {
      dock = document.createElement('nav');
      dock.id = 'mobileBottomDock';
      dock.className = 'mobile-bottom-dock';
      dock.setAttribute('aria-label', 'Mobile App Navigation');
      document.body.appendChild(dock);
    }

    const p = this.pageName;
    dock.innerHTML = `
      <a href="index.html" class="mobile-dock-item ${p === 'home' ? 'active' : ''}">
        <div class="dock-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <span>Home</span>
      </a>
      <a href="about.html" class="mobile-dock-item ${p === 'about' ? 'active' : ''}">
        <div class="dock-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        </div>
        <span>About</span>
      </a>
      <a href="passport.html" class="mobile-dock-item mobile-dock-center ${p === 'passport' || p === 'dashboard' ? 'active' : ''}">
        <div class="dock-icon-wrap center-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
        </div>
        <span>Passport</span>
      </a>
      <a href="quests.html" class="mobile-dock-item ${p === 'quests' ? 'active' : ''}">
        <div class="dock-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </div>
        <span>Quest</span>
      </a>
      <a href="leaderboard.html" class="mobile-dock-item ${p === 'leaderboard' ? 'active' : ''}">
        <div class="dock-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        </div>
        <span>Ranks</span>
      </a>
    `;
  }

  toggleMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer && backdrop) {
      const isOpen = drawer.classList.toggle('open');
      backdrop.classList.toggle('open', isOpen);
      backdrop.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    }
  }

  closeMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.classList.remove('active');
    }
    document.body.style.overflow = '';
  }

  closeModal() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    this.selectedQuestForProof = null;
    this.selectedQuestForSocial = null;
  }

  async logout() {
    await db.logout();
    if (supabase && supabase.auth) {
      try {
        await supabase.auth.signOut();
      } catch (e) {}
    }
    if (window.location.hash && window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
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
      case 'about':
        this.renderAboutView(mainContainer);
        break;
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
      case 'withdraw':
        this.renderWithdrawalView(mainContainer);
        break;
      case 'settings':
        this.renderSettingsView(mainContainer);
        break;
      case 'home':
      default:
        this.renderHomeView(mainContainer);
        break;
    }

    // Refresh dynamic tilts, parallax, and scroll triggers
    setTimeout(() => {
      motionEngine.refresh();
    }, 60);
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
              <button type="button" class="btn-auth-pill" onclick="window.boobaApp.handleGoogleAuth()">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <!-- 2. Web3 Multi-Wallet (MetaMask, Trust Wallet, Binance, etc.) -->
              <button type="button" class="btn-auth-pill btn-wallet" onclick="window.boobaApp.openWalletModal()">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#000000"/>
                  <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#000000" fill-opacity="0.8"/>
                </svg>
                Connect Web3 Wallet
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

              <!-- Password Input with SVG Eye Toggle -->
              <div class="password-field-wrapper">
                <input type="password" id="dedicatedPasswordInput" placeholder="${isSignUp ? 'Create password (min 6 chars)' : 'Enter password'}" class="x-input-field" required autocomplete="current-password">
                <button type="button" id="togglePassBtn1" class="password-toggle-btn" onclick="window.boobaApp.togglePasswordVisibility('dedicatedPasswordInput', 'togglePassBtn1')" title="Show password" aria-label="Toggle password visibility">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </div>

              <!-- Forgot Password Link (Only in Sign In Mode) -->
              ${!isSignUp ? `
                <div style="display: flex; justify-content: flex-end;">
                  <a href="javascript:void(0)" class="forgot-pass-link" onclick="window.boobaApp.openForgotPasswordModal()">
                    Forgot password? (Use Seed Phrase)
                  </a>
                </div>
              ` : ''}

              <!-- Confirm Password (Only on Sign Up) -->
              ${isSignUp ? `
                <div class="password-field-wrapper">
                  <input type="password" id="dedicatedConfirmPasswordInput" placeholder="Confirm password" class="x-input-field" required autocomplete="new-password">
                  <button type="button" id="togglePassBtn2" class="password-toggle-btn" onclick="window.boobaApp.togglePasswordVisibility('dedicatedConfirmPasswordInput', 'togglePassBtn2')" title="Show password" aria-label="Toggle confirm password visibility">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                </div>

                <input type="text" id="dedicatedReferralInput" value="${storedRef}" placeholder="Referral code (Optional)" class="x-input-field text-mono" style="text-transform: uppercase;">
              ` : ''}

              <button type="submit" id="dedicatedSubmitBtn" class="btn-x-submit">
                ${isSignUp ? 'Create Account & Mint Passport (+100 BOOBA)' : 'Sign In'}
              </button>

            </form>

            <div class="x-legal-text">
              By signing up, you agree to the <a href="terms.html">Terms of Service</a> and <a href="privacy.html">Privacy Policy</a>, including Token & Identity Guidelines.
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

  togglePasswordVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    if (isPassword) {
      // Eye Off SVG (Hide password)
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
      btn.setAttribute('title', 'Hide password');
    } else {
      // Eye Open SVG (Show password)
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
      btn.setAttribute('title', 'Show password');
    }
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
        const confirmPassword = document.getElementById('dedicatedConfirmPasswordInput')?.value;
        const referralCode = document.getElementById('dedicatedReferralInput')?.value.trim();

        if (!username || !emailOrUsername) {
          alert('Please enter both a username and email to mint your passport.');
          return;
        }

        if (!password || password.length < 6) {
          alert('Please choose a password with at least 6 characters.');
          return;
        }

        if (password !== confirmPassword) {
          alert('Passwords do not match. Please ensure both password fields are identical.');
          return;
        }

        const res = await db.signup({ username, email: emailOrUsername, password, referralCode });
        if (res.success) {
          if (res.seedPhrase) {
            this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
              if (res.user.role === 'admin') {
                window.location.href = 'teamadmin.html';
              } else {
                window.location.href = 'dashboard.html';
              }
            });
          } else {
            alert(`Welcome to BOOBA, ${res.user.username}! Your digital passport (${res.user.passportId}) has been minted!`);
            if (res.user.role === 'admin') {
              window.location.href = 'teamadmin.html';
            } else {
              window.location.href = 'dashboard.html';
            }
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
          alert(`Welcome back, ${res.user.username}!`);
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

  // --------------------------------------------------------------------------
  // SEED PHRASE ONBOARDING MODAL (Hidden by default until Eye clicked)
  // --------------------------------------------------------------------------

  showSeedPhraseModal(seedPhrase, user, onConfirmCallback) {
    const existing = document.getElementById('seedPhraseDynamicModal');
    if (existing) existing.remove();

    const words = (seedPhrase || '').split(' ').filter(Boolean);
    let isHidden = true;

    const modal = document.createElement('div');
    modal.id = 'seedPhraseDynamicModal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="seed-phrase-modal-card">
        
        <!-- Google Security Shield Icon -->
        <div class="google-sec-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        </div>

        <h2 class="google-sec-title">Save your recovery phrase</h2>
        <p class="google-sec-subtitle">
          These 12 words are your master key. If you ever forget your password, you'll need this exact recovery phrase to sign in.
        </p>

        <!-- Eye Reveal Control Header -->
        <div class="seed-header-controls">
          <span class="seed-phrase-badge">12-Word Master Key</span>
          <button type="button" id="toggleSeedVisibilityBtn" class="btn-toggle-seed" aria-label="Toggle seed phrase visibility">
            <svg id="seedEyeIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span id="seedEyeBtnText">Reveal Secret Phrase</span>
          </button>
        </div>

        <!-- 12-Word Grid (Hidden/Masked by default) -->
        <div class="seed-phrase-grid" id="seedPhraseGridContainer">
          ${words.map((w, i) => `
            <div class="seed-word-chip">
              <span class="seed-word-num">${i + 1}</span>
              <span class="seed-word-text masked" data-word="${w}">••••••</span>
            </div>
          `).join('')}
        </div>

        <!-- Google-Style Action Pills -->
        <div class="google-actions-row">
          <button type="button" id="copySeedPhraseBtn" class="btn-google-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="copySeedBtnText">Copy all words</span>
          </button>
          <button type="button" id="downloadSeedPhraseBtn" class="btn-google-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download text file</span>
          </button>
        </div>

        <div class="google-info-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Store these words securely. Booba will never ask for your phrase.</span>
        </div>

        <label class="seed-checkbox-label">
          <input type="checkbox" id="confirmSavedSeedCheckbox">
          <span>I've saved my 12-word recovery phrase</span>
        </label>

        <button type="button" id="enterDashboardWithSeedBtn" class="btn-x-submit" style="width: 100%; opacity: 0.45; cursor: not-allowed; padding: 0.75rem;" disabled>
          Continue to Dashboard →
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const toggleBtn = modal.querySelector('#toggleSeedVisibilityBtn');
    const eyeIcon = modal.querySelector('#seedEyeIcon');
    const eyeText = modal.querySelector('#seedEyeBtnText');
    const wordEls = modal.querySelectorAll('.seed-word-text');
    const copyBtn = modal.querySelector('#copySeedPhraseBtn');
    const copyText = modal.querySelector('#copySeedBtnText');
    const downloadBtn = modal.querySelector('#downloadSeedPhraseBtn');
    const checkbox = modal.querySelector('#confirmSavedSeedCheckbox');
    const proceedBtn = modal.querySelector('#enterDashboardWithSeedBtn');

    // Toggle Eye Reveal / Hide
    toggleBtn.addEventListener('click', () => {
      isHidden = !isHidden;
      if (!isHidden) {
        wordEls.forEach(el => {
          el.textContent = el.getAttribute('data-word');
          el.classList.remove('masked');
        });
        eyeText.textContent = 'Hide Secret Phrase';
        eyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        toggleBtn.style.borderColor = 'var(--brand-yellow)';
        toggleBtn.style.color = 'var(--brand-yellow)';
      } else {
        wordEls.forEach(el => {
          el.textContent = '••••••';
          el.classList.add('masked');
        });
        eyeText.textContent = 'Reveal Secret Phrase';
        eyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
        toggleBtn.style.borderColor = '';
        toggleBtn.style.color = '';
      }
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(seedPhrase);
        copyText.textContent = 'Copied to clipboard';
        copyBtn.style.borderColor = 'var(--accent-emerald)';
        copyBtn.style.color = 'var(--accent-emerald)';
        checkbox.checked = true;
        proceedBtn.disabled = false;
        proceedBtn.style.opacity = '1';
        proceedBtn.style.cursor = 'pointer';
        setTimeout(() => {
          copyText.textContent = 'Copy all words';
          copyBtn.style.borderColor = '';
          copyBtn.style.color = '';
        }, 3000);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = seedPhrase;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyText.textContent = 'Copied';
        checkbox.checked = true;
        proceedBtn.disabled = false;
        proceedBtn.style.opacity = '1';
        proceedBtn.style.cursor = 'pointer';
      }
    });

    // Download backup file
    downloadBtn.addEventListener('click', () => {
      const backupText = `=====================================================
BOOBA (BNB baby) — ACCOUNT RECOVERY PHRASE
Username: ${user?.username || 'Member'}
Passport ID: ${user?.passportId || 'BB-XXXXXX'}
Date: ${new Date().toUTCString()}
=====================================================

12-WORD RECOVERY PHRASE:
${seedPhrase}

HOW TO RECOVER YOUR ACCOUNT:
1. Go to the Sign In page.
2. Click "Forgot password? (Use Seed Phrase)".
3. Enter your email/username and paste these 12 words to set a new password.
=====================================================`;

      const blob = new Blob([backupText], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `booba_recovery_phrase_${user?.username || 'backup'}.txt`;
      link.click();

      checkbox.checked = true;
      proceedBtn.disabled = false;
      proceedBtn.style.opacity = '1';
      proceedBtn.style.cursor = 'pointer';
    });

    // Checkbox toggle
    checkbox.addEventListener('change', () => {
      proceedBtn.disabled = !checkbox.checked;
      proceedBtn.style.opacity = checkbox.checked ? '1' : '0.45';
      proceedBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
    });

    // Proceed button
    proceedBtn.addEventListener('click', () => {
      modal.remove();
      if (typeof onConfirmCallback === 'function') {
        onConfirmCallback();
      }
    });
  }

  // --------------------------------------------------------------------------
  // FORGOT PASSWORD / ACCOUNT RECOVERY MODAL
  // --------------------------------------------------------------------------

  openForgotPasswordModal() {
    const existing = document.getElementById('forgotPassDynamicModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'forgotPassDynamicModal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="seed-phrase-modal-card" style="max-width: 480px; position: relative; z-index: 1010;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(243, 186, 47, 0.12); border: 1px solid rgba(243, 186, 47, 0.3); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF;">Account Recovery</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 600;">Reset Password with Seed Phrase</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('forgotPassDynamicModal').remove()" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.45;">
          Enter your registered email or username, your <strong>12-word seed phrase</strong>, and your new password.
        </p>

        <form id="recoveryForm" onsubmit="window.boobaApp.handleForgotPasswordSubmit(event)" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem; display: block;">Email or Username</label>
            <input type="text" id="recoveryEmailOrUsername" placeholder="e.g. user@gmail.com or CryptoKing" class="x-input-field" required>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem; display: block;">12-Word Secret Seed Phrase</label>
            <textarea id="recoverySeedPhraseInput" rows="3" placeholder="Enter all 12 words separated by spaces (e.g. apple banana cat ...)" class="x-input-field text-mono" style="resize: none; font-size: 0.88rem;" required></textarea>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem; display: block;">New Password (min 6 chars)</label>
            <div class="password-field-wrapper" style="max-width: 100%;">
              <input type="password" id="recoveryNewPassword" placeholder="Enter new password" class="x-input-field" required autocomplete="new-password">
              <button type="button" id="togglePassBtnRecovery1" class="password-toggle-btn" onclick="window.boobaApp.togglePasswordVisibility('recoveryNewPassword', 'togglePassBtnRecovery1')" title="Show password">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem; display: block;">Confirm New Password</label>
            <div class="password-field-wrapper" style="max-width: 100%;">
              <input type="password" id="recoveryConfirmPassword" placeholder="Confirm new password" class="x-input-field" required autocomplete="new-password">
              <button type="button" id="togglePassBtnRecovery2" class="password-toggle-btn" onclick="window.boobaApp.togglePasswordVisibility('recoveryConfirmPassword', 'togglePassBtnRecovery2')" title="Show password">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          <button type="submit" id="recoverySubmitBtn" class="btn-x-submit" style="margin-top: 0.5rem;">
            Verify Seed Phrase & Reset Password
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('recoverySubmitBtn');
    const originalText = submitBtn ? submitBtn.textContent : 'Submit';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying Seed Phrase...';
    }

    try {
      const emailOrUsername = document.getElementById('recoveryEmailOrUsername')?.value.trim();
      const seedPhrase = document.getElementById('recoverySeedPhraseInput')?.value.trim();
      const newPassword = document.getElementById('recoveryNewPassword')?.value;
      const confirmPassword = document.getElementById('recoveryConfirmPassword')?.value;

      if (!emailOrUsername || !seedPhrase || !newPassword) {
        alert('Please fill in all recovery fields.');
        return;
      }

      if (newPassword.length < 6) {
        alert('Password must be at least 6 characters long.');
        return;
      }

      if (newPassword !== confirmPassword) {
        alert('Passwords do not match. Please re-enter.');
        return;
      }

      const res = await db.resetPasswordWithSeedPhrase({ emailOrUsername, seedPhrase, newPassword });
      if (res.success) {
        alert(`Success: Your password has been reset. Welcome back, ${res.user.username}!`);
        const modal = document.getElementById('forgotPassDynamicModal');
        if (modal) modal.remove();
        if (res.user.role === 'admin') {
          window.location.href = 'teamadmin.html';
        } else {
          window.location.href = 'dashboard.html';
        }
      } else {
        alert(res.message || 'Password reset failed. Please verify your seed phrase.');
      }
    } catch (err) {
      alert('An unexpected error occurred during password recovery.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  // --------------------------------------------------------------------------
  // WEB3 MULTI-WALLET CONNECT MODAL (MetaMask, Trust Wallet, Binance, EIP-6963)
  // --------------------------------------------------------------------------

  openWalletModal() {
    const existing = document.getElementById('walletConnectDynamicModal') || document.getElementById('web3WalletModal');
    if (existing) existing.remove();

    // Trigger fresh EIP-6963 discovery
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eip6963:requestProvider'));
    }

    const user = db.currentUser;
    const isConnected = Boolean(user && user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const currentAddr = isConnected ? user.walletAddress : '';

    const modal = document.createElement('div');
    modal.id = 'walletConnectDynamicModal';
    modal.className = 'modal-backdrop open active';
    modal.innerHTML = `
      <div class="wallet-modal-card" style="position: relative; z-index: 1010; max-width: 480px; width: 100%; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.4); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(243, 186, 47, 0.2);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin: 0; line-height: 1.2;">Connect Web3 Wallet</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">BNB Smart Chain (BEP-20)</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('walletConnectDynamicModal').remove()" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;" aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          ${user ? 'Connect your verified Web3 wallet for token claims, quests, and withdrawals.' : 'Select your Web3 wallet provider to instantly sign in or mint your Booba Passport (+100 BOOBA bonus).'}
        </p>

        ${isConnected ? `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 16px; padding: 0.9rem 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
            <div>
              <div style="font-size: 0.7rem; color: var(--accent-emerald); font-weight: 800; text-transform: uppercase; margin-bottom: 0.2rem; display: flex; align-items: center; gap: 0.35rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px; background: var(--accent-emerald);"></span>
                Active Connected Wallet
              </div>
              <div style="font-size: 0.85rem; font-family: var(--font-mono); font-weight: 800; color: #FFFFFF;">
                ${currentAddr.slice(0, 8)}...${currentAddr.slice(-6)}
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.handleDisconnectWallet()" style="color: var(--accent-rose); font-size: 0.75rem; padding: 0.3rem 0.6rem; border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px;">
              Disconnect
            </button>
          </div>
        ` : ''}

        <div id="walletOptionsContainer" class="wallet-options-list"></div>

        <div style="margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.75rem; color: var(--text-muted); text-align: center; line-height: 1.4;">
          💡 <strong>Mobile Tip:</strong> If your wallet app does not open automatically, open this page inside your wallet's built-in Web3 browser (MetaMask, Trust Wallet, OKX, or Binance Web3).
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.renderWalletOptionsList();
  }

  renderWalletOptionsList() {
    const container = document.getElementById('walletOptionsContainer');
    if (!container) return;

    // Detect installed standard extensions / injected providers
    const hasMetaMask = Boolean(window.ethereum && (window.ethereum.isMetaMask || window.ethereum.providers?.some(p => p.isMetaMask)));
    const hasTrust = Boolean(window.trustwallet || window.ethereum?.isTrust || window.ethereum?.providers?.some(p => p.isTrust || p.isTrustWallet));
    const hasBinance = Boolean(window.BinanceChain || window.ethereum?.isBinance || window.ethereum?.providers?.some(p => p.isBinance));
    const hasOKX = Boolean(window.okxwallet || window.ethereum?.isOkxWallet || window.ethereum?.providers?.some(p => p.isOkxWallet));
    const hasCoinbase = Boolean(window.coinbaseWalletExtension || window.ethereum?.isCoinbaseWallet || window.ethereum?.providers?.some(p => p.isCoinbaseWallet));
    const hasGenericWeb3 = Boolean(window.ethereum);

    let html = '';

    // If EIP-6963 providers exist, show them dynamically
    if (this.eip6963Providers && this.eip6963Providers.size > 0) {
      this.eip6963Providers.forEach((detail, key) => {
        const info = detail.info || {};
        html += `
          <div class="wallet-option-item" onclick="window.boobaApp.connectEIP6963Wallet('${key}')">
            <div class="wallet-option-left">
              <img src="${info.icon || 'assets/mascot.jpg'}" alt="${info.name || 'Wallet'}" style="width: 32px; height: 32px; border-radius: 8px; object-fit: contain;">
              <div>
                <div class="wallet-option-title">${info.name || 'Web3 Wallet'}</div>
                <div class="wallet-option-desc">Auto-detected Web3 Extension</div>
              </div>
            </div>
            <span class="wallet-detected-badge">Detected</span>
          </div>
        `;
      });
    }

    // Standard list
    html += `
      <!-- 1. MetaMask -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('metamask')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(230, 100, 30, 0.15); border: 1px solid rgba(230, 100, 30, 0.3);">
            <svg width="24" height="24" viewBox="0 0 32 32">
              <path fill="#E2761B" stroke="#E2761B" stroke-width="0.5" d="M29.5 2.5L18 10.5l2.2-5.1L29.5 2.5z"/>
              <path fill="#E4761B" stroke="#E4761B" stroke-width="0.5" d="M2.5 2.5L14 10.5l-2.2-5.1L2.5 2.5z"/>
              <path fill="#E4761B" stroke="#E4761B" stroke-width="0.5" d="M25 21.5l-3.3 5.1 7.1 2L30.7 21l-5.7.5z"/>
              <path fill="#E4761B" stroke="#E4761B" stroke-width="0.5" d="M1.3 21l1.9 7.6 7.1-2L7 21.5l-5.7-.5z"/>
              <path fill="#D7C1B3" stroke="#D7C1B3" stroke-width="0.5" d="M9.8 13.8l-1.9 2.9 6.8.3-.3-7.2-4.6 4z"/>
              <path fill="#D7C1B3" stroke="#D7C1B3" stroke-width="0.5" d="M22.2 13.8l4.6-4-.3 7.2 6.8-.3-1.9-2.9z"/>
              <path fill="#233447" stroke="#233447" stroke-width="0.5" d="M10.2 26.6l4-2-3.5-2.7-.5 4.7z"/>
              <path fill="#233447" stroke="#233447" stroke-width="0.5" d="M21.8 26.6l.5-4.7-3.5 2.7 4 2z"/>
              <path fill="#CD6116" stroke="#CD6116" stroke-width="0.5" d="M14.2 24.6l-3.9 2 4.1 3.2-.2-5.2z"/>
              <path fill="#CD6116" stroke="#CD6116" stroke-width="0.5" d="M17.8 24.6l-.2 5.2 4.1-3.2-3.9-2z"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">MetaMask</div>
            <div class="wallet-option-desc">Connect with MetaMask wallet</div>
          </div>
        </div>
        ${hasMetaMask ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Connect →</span>`}
      </div>

      <!-- 2. Trust Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('trust')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(5, 0, 255, 0.15); border: 1px solid rgba(51, 117, 255, 0.3);">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L6 7.5V15C6 22 10.5 27.5 16 29C21.5 27.5 26 22 26 15V7.5L16 3Z" fill="#3375BB"/>
              <path d="M16 5.5L8 9.5V15C8 20.8 11.5 25.5 16 26.8C20.5 25.5 24 20.8 24 15V9.5L16 5.5Z" fill="#0500FF"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Trust Wallet</div>
            <div class="wallet-option-desc">Multi-chain mobile & browser wallet</div>
          </div>
        </div>
        ${hasTrust ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Connect →</span>`}
      </div>

      <!-- 3. Binance Web3 Wallet / BNB Chain -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('binance')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.3);">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#F3BA2F"/>
              <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#F3BA2F"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Binance Web3 Wallet</div>
            <div class="wallet-option-desc">Native BNB Chain Ecosystem wallet</div>
          </div>
        </div>
        ${hasBinance ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Connect →</span>`}
      </div>

      <!-- 4. OKX Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('okx')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25);">
            <span style="font-weight: 900; font-size: 14px; color: #FFFFFF;">OKX</span>
          </div>
          <div>
            <div class="wallet-option-title">OKX Wallet</div>
            <div class="wallet-option-desc">Multi-chain EVM Web3 provider</div>
          </div>
        </div>
        ${hasOKX ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Connect →</span>`}
      </div>

      <!-- 5. Coinbase / Browser Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('coinbase')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(0, 82, 255, 0.15); border: 1px solid rgba(0, 82, 255, 0.3);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0052FF" stroke-width="2">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Coinbase / Browser Wallet</div>
            <div class="wallet-option-desc">Connect any installed EVM Web3 provider</div>
          </div>
        </div>
        ${(hasCoinbase || hasGenericWeb3) ? `<span class="wallet-detected-badge">Available</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Connect →</span>`}
      </div>
    `;

    container.innerHTML = html;
  }

  async connectEIP6963Wallet(key) {
    const detail = this.eip6963Providers.get(key);
    if (!detail || !detail.provider) return;
    await this.authenticateWithProvider(detail.provider, detail.info?.name || 'Web3 Wallet');
  }

  async connectWalletProvider(type) {
    let provider = null;
    let walletName = 'Web3 Wallet';

    // 1. Check EIP-6963 matching providers first
    if (this.eip6963Providers && this.eip6963Providers.size > 0) {
      for (const [key, detail] of this.eip6963Providers.entries()) {
        const info = detail.info || {};
        const rdns = (info.rdns || '').toLowerCase();
        const name = (info.name || '').toLowerCase();
        if (type === 'metamask' && (rdns.includes('metamask') || name.includes('metamask'))) {
          provider = detail.provider;
          walletName = info.name || 'MetaMask';
          break;
        } else if (type === 'trust' && (rdns.includes('trust') || name.includes('trust'))) {
          provider = detail.provider;
          walletName = info.name || 'Trust Wallet';
          break;
        } else if (type === 'binance' && (rdns.includes('binance') || name.includes('binance'))) {
          provider = detail.provider;
          walletName = info.name || 'Binance Web3 Wallet';
          break;
        } else if (type === 'okx' && (rdns.includes('okx') || rdns.includes('okex') || name.includes('okx'))) {
          provider = detail.provider;
          walletName = info.name || 'OKX Wallet';
          break;
        } else if (type === 'coinbase' && (rdns.includes('coinbase') || name.includes('coinbase'))) {
          provider = detail.provider;
          walletName = info.name || 'Coinbase Wallet';
          break;
        }
      }
    }

    // 2. Specific window objects
    if (!provider) {
      if (type === 'trust') {
        walletName = 'Trust Wallet';
        if (window.trustwallet?.ethereum) provider = window.trustwallet.ethereum;
        else if (window.trustwallet) provider = window.trustwallet;
        else if (window.ethereum?.providers) provider = window.ethereum.providers.find(p => p.isTrust || p.isTrustWallet);
        else if (window.ethereum?.isTrust) provider = window.ethereum;
      } else if (type === 'binance') {
        walletName = 'Binance Web3 Wallet';
        if (window.BinanceChain) provider = window.BinanceChain;
        else if (window.ethereum?.providers) provider = window.ethereum.providers.find(p => p.isBinance);
        else if (window.ethereum?.isBinance) provider = window.ethereum;
      } else if (type === 'okx') {
        walletName = 'OKX Wallet';
        if (window.okxwallet) provider = window.okxwallet;
        else if (window.ethereum?.providers) provider = window.ethereum.providers.find(p => p.isOkxWallet);
        else if (window.ethereum?.isOkxWallet) provider = window.ethereum;
      } else if (type === 'metamask') {
        walletName = 'MetaMask';
        if (window.ethereum) {
          if (window.ethereum.providers) {
            provider = window.ethereum.providers.find(p => p.isMetaMask && !p.isBraveWallet && !p.isTrust && !p.isOkxWallet) || window.ethereum.providers.find(p => p.isMetaMask) || window.ethereum;
          } else if (window.ethereum.isMetaMask) {
            provider = window.ethereum;
          }
        }
      } else if (type === 'coinbase') {
        walletName = 'Coinbase Wallet';
        if (window.coinbaseWalletExtension) provider = window.coinbaseWalletExtension;
        else if (window.ethereum?.providers) provider = window.ethereum.providers.find(p => p.isCoinbaseWallet);
        else if (window.ethereum?.isCoinbaseWallet) provider = window.ethereum;
      } else {
        walletName = 'Browser Wallet';
        if (window.ethereum) provider = window.ethereum;
      }
    }

    // Generic fallback if provider is available in window
    if (!provider && window.ethereum) {
      provider = window.ethereum;
    }

    if (!provider) {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      const cleanHostAndPath = (window.location.host + window.location.pathname + window.location.search + window.location.hash).replace(/\/+$/, '');
      const fullUrl = window.location.href;

      if (isMobile) {
        if (type === 'metamask') {
          window.location.href = `https://metamask.app.link/dapp/${cleanHostAndPath}`;
          return;
        } else if (type === 'trust') {
          window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(fullUrl)}`;
          return;
        } else if (type === 'okx') {
          window.location.href = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(fullUrl)}`;
          setTimeout(() => {
            window.location.href = 'https://www.okx.com/web3';
          }, 1500);
          return;
        } else if (type === 'binance') {
          window.location.href = `bnc://app.binance.com/cedefi/webview?url=${encodeURIComponent(fullUrl)}`;
          setTimeout(() => {
            window.location.href = 'https://www.binance.com/en/web3wallet';
          }, 1500);
          return;
        } else if (type === 'coinbase') {
          window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(fullUrl)}`;
          return;
        } else {
          window.location.href = `https://metamask.app.link/dapp/${cleanHostAndPath}`;
          return;
        }
      }

      alert(`${walletName} extension was not detected in this browser.\n\nPlease make sure your ${walletName} browser extension is installed and enabled, or try another wallet.`);
      return;
    }

    await this.authenticateWithProvider(provider, walletName);
  }

  async authenticateWithProvider(provider, walletName) {
    try {
      let accounts = [];

      // Request accounts using standard eth_requestAccounts
      if (typeof provider.request === 'function') {
        try {
          accounts = await provider.request({ method: 'eth_requestAccounts' });
        } catch (reqErr) {
          if (reqErr.code === 4001 || reqErr.code === '4001') {
            alert('Connection request was cancelled in your Web3 wallet.');
            return;
          }
          // Try fallback to eth_accounts
          try {
            accounts = await provider.request({ method: 'eth_accounts' });
          } catch (e) {}
        }
      } else if (typeof provider.enable === 'function') {
        accounts = await provider.enable();
      }

      if (!accounts || accounts.length === 0) {
        alert(`No account selected or permission denied in ${walletName}.`);
        return;
      }

      const walletAddress = accounts[0];

      // Verify and suggest BNB Smart Chain (Chain ID 56 / 0x38)
      try {
        if (typeof provider.request === 'function') {
          const chainId = await provider.request({ method: 'eth_chainId' });
          if (chainId !== '0x38' && chainId !== '0x61' && chainId !== 56) {
            try {
              await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x38' }]
              });
            } catch (switchError) {
              if (switchError.code === 4902 || switchError.message?.includes('4902')) {
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0x38',
                    chainName: 'BNB Smart Chain Mainnet',
                    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                    rpcUrls: ['https://bsc-dataseed.binance.org/'],
                    blockExplorerUrls: ['https://bscscan.com/']
                  }]
                });
              }
            }
          }
        }
      } catch (chainErr) {
        console.warn('Chain switch notice:', chainErr);
      }

      // Close modal
      const modal = document.getElementById('walletConnectDynamicModal') || document.getElementById('web3WalletModal');
      if (modal) modal.remove();

      // Check whether user is logged in
      if (db.currentUser) {
        const res = await db.updateWalletAddress(walletAddress);
        if (res.success) {
          alert(`Web3 Wallet Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
          this.renderHeaderNav();
          this.renderPage();
        } else {
          alert(res.message || 'Failed to update wallet address.');
        }
      } else {
        const res = await db.loginOrSignupWithWallet({ walletAddress });
        if (res.success) {
          if (res.isNewUser && res.seedPhrase) {
            this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
              window.location.href = 'dashboard.html';
            });
          } else {
            alert(`Connected with ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}! Welcome ${res.user.username}.`);
            window.location.href = 'dashboard.html';
          }
        } else {
          alert(res.message || 'Failed to authenticate with Web3 wallet.');
        }
      }
    } catch (err) {
      console.error('Wallet auth error:', err);
      if (err.code === 4001 || err.code === '4001') {
        alert('Connection rejected in your wallet.');
      } else {
        alert(err.message || 'Error connecting to Web3 wallet.');
      }
    }
  }

  async handleDisconnectWallet() {
    if (!db.currentUser) return;
    const res = await db.updateWalletAddress('');
    if (res.success) {
      alert('Web3 wallet disconnected.');
      const modal = document.getElementById('walletConnectDynamicModal') || document.getElementById('web3WalletModal');
      if (modal) modal.remove();
      this.renderHeaderNav();
      this.renderPage();
    }
  }

  updateNavState() {
    this.renderHeaderNav();
  }

  // --------------------------------------------------------------------------
  // GOOGLE & APPLE OAUTH & ACCOUNT CHOOSER
  // --------------------------------------------------------------------------

  async handleGoogleAuth() {
    try {
      const returnUrl = window.location.origin + '/dashboard.html';
      if (supabase && supabase.auth) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: returnUrl,
            queryParams: {
              prompt: 'select_account'
            }
          }
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url;
        }
      } else {
        const encodedUrl = encodeURIComponent(returnUrl);
        const googleAuthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=${encodedUrl}`;
        window.location.href = googleAuthUrl;
      }
    } catch (err) {
      console.warn('Google OAuth:', err);
      this.openGoogleAccountChooserModal();
    }
  }

  openGoogleAccountChooserModal() {
    const existing = document.getElementById('googleAccountChooserModal');
    if (existing) existing.remove();

    // Retrieve saved Google accounts from local cache or build default profile list
    let savedAccounts = [];
    try {
      const raw = localStorage.getItem('booba_google_accounts');
      if (raw) savedAccounts = JSON.parse(raw);
    } catch (e) {}

    if (savedAccounts.length === 0) {
      if (db.currentUser && db.currentUser.email) {
        savedAccounts.push({
          email: db.currentUser.email,
          name: db.currentUser.username || db.currentUser.email.split('@')[0],
          avatar: db.currentUser.avatar || 'assets/mascot.jpg'
        });
      }
    }

    const modal = document.createElement('div');
    modal.id = 'googleAccountChooserModal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="google-oauth-card" style="position: relative; z-index: 1010;">
        <div style="display: flex; justify-content: flex-end; margin-bottom: -10px;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('googleAccountChooserModal').remove()" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; color: #444746; display: flex; align-items: center; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="google-oauth-header">
          <svg width="40" height="40" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <h2 class="google-oauth-title">Choose an account</h2>
          <div class="google-oauth-subtitle">to continue to <strong style="color: #1F1F1F;">BOOBA (BNB baby)</strong></div>
        </div>

        <div class="google-account-list" id="googleAccountsList">
          ${savedAccounts.map(acc => `
            <button type="button" class="google-account-item" onclick="window.boobaApp.selectGoogleAccount('${acc.email}', '${acc.name}')">
              <div class="google-account-avatar">
                ${acc.name.charAt(0).toUpperCase()}
              </div>
              <div class="google-account-meta">
                <div class="google-account-name">${acc.name}</div>
                <div class="google-account-email">${acc.email}</div>
              </div>
            </button>
          `).join('')}

          <button type="button" class="google-use-another-btn" onclick="window.boobaApp.toggleNewGoogleAccountForm()">
            <div class="google-use-another-icon">+</div>
            <div>Use another Google account</div>
          </button>
        </div>

        <!-- Inline New Account Input Form (Hidden by default) -->
        <div id="newGoogleAccountForm" style="display: ${savedAccounts.length === 0 ? 'block' : 'none'}; margin-bottom: 1.5rem;">
          <form onsubmit="window.boobaApp.handleNewGoogleAccountSubmit(event)" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div>
              <label style="font-size: 0.8rem; font-weight: 600; color: #444746; margin-bottom: 0.25rem; display: block;">Google Email or Phone</label>
              <input type="email" id="googleCustomEmailInput" placeholder="name@gmail.com" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #747775; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none;" required autocomplete="email">
            </div>
            <div>
              <label style="font-size: 0.8rem; font-weight: 600; color: #444746; margin-bottom: 0.25rem; display: block;">Display Name (Optional)</label>
              <input type="text" id="googleCustomNameInput" placeholder="Your name" style="width: 100%; padding: 0.75rem 1rem; border: 1px solid #C4C7C5; border-radius: 8px; font-size: 0.95rem; box-sizing: border-box; outline: none;">
            </div>
            <button type="submit" style="background: #0B57D0; color: #FFFFFF; border: none; padding: 0.75rem 1.25rem; border-radius: var(--radius-full); font-weight: 600; font-size: 0.9rem; cursor: pointer; margin-top: 0.25rem;">
              Continue with Google
            </button>
          </form>
        </div>

        <div class="google-oauth-footer">
          To continue, Google will share your name, email address, and language preference with BOOBA. See BOOBA's <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a>.
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  toggleNewGoogleAccountForm() {
    const form = document.getElementById('newGoogleAccountForm');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      const input = document.getElementById('googleCustomEmailInput');
      if (input) input.focus();
    }
  }

  async selectGoogleAccount(email, name) {
    const modal = document.getElementById('googleAccountChooserModal');
    if (modal) modal.remove();

    const cleanEmail = email.trim().toLowerCase();
    const res = await db.loginOrSignupWithOAuth({
      email: cleanEmail,
      username: name || cleanEmail.split('@')[0],
      avatarUrl: 'assets/mascot.jpg'
    });

    if (res.success) {
      if (res.isNewUser && res.seedPhrase) {
        this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
          window.location.href = 'dashboard.html';
        });
      } else {
        alert(`Google Sign-in successful! Welcome back, ${res.user.username}.`);
        window.location.href = 'dashboard.html';
      }
    } else {
      alert(res.message || 'Google authentication failed.');
    }
  }

  async handleNewGoogleAccountSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('googleCustomEmailInput')?.value.trim();
    const name = document.getElementById('googleCustomNameInput')?.value.trim();

    if (!email || !email.includes('@')) {
      alert('Please enter a valid Google email address.');
      return;
    }

    // Save to local cache of accounts
    try {
      let saved = [];
      const raw = localStorage.getItem('booba_google_accounts');
      if (raw) saved = JSON.parse(raw);
      if (!saved.some(a => a.email.toLowerCase() === email.toLowerCase())) {
        saved.push({ email, name: name || email.split('@')[0], avatar: 'assets/mascot.jpg' });
        localStorage.setItem('booba_google_accounts', JSON.stringify(saved));
      }
    } catch (e) {}

    await this.selectGoogleAccount(email, name);
  }

  async handleAppleAuth() {
    try {
      if (supabase && supabase.auth) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        if (data && data.url) {
          window.location.href = data.url;
          return;
        }
      }
      throw new Error('Supabase client not initialized');
    } catch (err) {
      const email = prompt('Enter your Apple ID email address to connect:', 'user@icloud.com');
      if (!email) return;
      const cleanEmail = email.trim().toLowerCase();
      const res = await db.loginOrSignupWithOAuth({
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        avatarUrl: 'assets/mascot.jpg'
      });
      if (res.success) {
        if (res.isNewUser && res.seedPhrase) {
          this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
            window.location.href = 'dashboard.html';
          });
        } else {
          alert(`Apple ID login successful! Welcome ${res.user.username}.`);
          window.location.href = 'dashboard.html';
        }
      } else {
        alert(res.message || 'Apple login failed.');
      }
    }
  }

  // --------------------------------------------------------------------------
  // 1. HOME LANDING VIEW (Highlights 4 Core Pillars)
  // --------------------------------------------------------------------------

  renderHomeView(container) {
    const user = db.currentUser;
    const stats = db.getStats();

    container.innerHTML = `
      <!-- 1. LIVE INFINITE MARQUEE TICKER -->
      <div class="live-ticker-wrap">
        <div class="ticker-track">
          <div class="ticker-item">
            <span class="pulse-dot"></span>
            <strong>BNB Smart Chain (BEP-20)</strong> Mainnet Live
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
            <strong>+100 $BOOBA</strong> Instant Minting Welcome Reward
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <strong>100% Non-Custodial</strong> BIP-39 Cryptographic Seed
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34"></path><path d="M6 4h12v7a6 6 0 0 1-12 0V4z"></path></svg>
            <strong>1,000,000,000 $BOOBA</strong> Fixed Max Supply
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <strong>Zero Gas Passport</strong> Instant Local & Cloud Sync
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
            <strong>0% Buy & 0% Sell Tax</strong> Fair Web3 Economics
          </div>
          <!-- Duplicate set for infinite loop -->
          <div class="ticker-item">
            <span class="pulse-dot"></span>
            <strong>BNB Smart Chain (BEP-20)</strong> Mainnet Live
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
            <strong>+100 $BOOBA</strong> Instant Minting Welcome Reward
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <strong>100% Non-Custodial</strong> BIP-39 Cryptographic Seed
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34"></path><path d="M6 4h12v7a6 6 0 0 1-12 0V4z"></path></svg>
            <strong>1,000,000,000 $BOOBA</strong> Fixed Max Supply
          </div>
        </div>
      </div>

      <!-- 2. HERO SECTION -->
      <section class="hero-section">
        <div class="container hero-container">
          <div class="hero-content">
            <h1 class="hero-title">
              The Next-Gen Community Universe Powered by <span class="text-gradient-gold">BOOBA</span>
            </h1>
            
            <p class="hero-subtitle">
              Mint your digital non-custodial Booba Passport, conquer live bounties, stake in the multiplier vault, and claim your share of the 1,000,000,000 $BOOBA treasury.
            </p>

            <div class="hero-actions">
              ${user ? `
                <a href="dashboard.html" class="btn btn-primary btn-lg">
                  Launch Dashboard ↗
                </a>
                <a href="about.html" class="btn btn-secondary btn-lg">
                  About & Tokenomics
                </a>
              ` : `
                <a href="signin.html#signup" class="btn btn-primary btn-lg">
                  Mint Passport (+100 BOOBA)
                </a>
                <a href="about.html" class="btn btn-secondary btn-lg">
                  About & Tokenomics
                </a>
              `}
            </div>

            <div class="hero-stats-grid">
              <div class="stat-box">
                <div class="stat-value text-gradient-gold" data-counter-target="${stats.totalUsers}">${Number(stats.totalUsers).toLocaleString()}</div>
                <div class="stat-label">Passports Minted</div>
              </div>
              <div class="stat-box">
                <div class="stat-value text-gradient-gold" data-counter-target="${stats.activeQuestsCount}">${Number(stats.activeQuestsCount).toLocaleString()}</div>
                <div class="stat-label">Active Bounties</div>
              </div>
              <div class="stat-box">
                <div class="stat-value text-gradient-gold" data-counter-target="${stats.totalPointsDistributed}">${Number(stats.totalPointsDistributed).toLocaleString()}</div>
                <div class="stat-label">$BOOBA Distributed</div>
              </div>
            </div>
          </div>

          <div class="hero-media">
            <div class="mascot-hologram-wrapper">
              <img src="assets/mascot.jpg" alt="Booba Mascot" class="hero-mascot-img">
              <div class="mascot-glow-ring"></div>
              <div class="mascot-floating-pill">
                <span class="pulse-dot"></span>
                <span>BOOBA • BNB baby Mascot</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. ABOUT THE TOKEN (HOMEPAGE SHOWCASE) -->
      <section class="section-container" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); padding: 6rem 0;">
        <div class="container">
          <div class="section-header text-center" style="margin-bottom: 4rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">About The Token</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 650px; margin: 0.75rem auto 0 auto;">
              Discover the core token mechanics, real utilities, zero-tax economics, and fair distribution powering the $BOOBA coin on BNB Smart Chain.
            </p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.75rem;">
            
            <!-- COIN BOX 1: BEP-20 Foundation & 0% Tax (Golden Moving Edge Light) -->
            <div class="chain-glow-card card-speed-1">
              <div class="chain-glow-inner">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(243, 186, 47, 0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow); border: 1px solid rgba(243, 186, 47, 0.3);">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-5 0c0 2 5 2 5 4.5a3.5 3.5 0 0 1-5 0"></path></svg>
                    </div>
                    <span class="badge-tag" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3);">1B FIXED SUPPLY</span>
                  </div>

                  <h3 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.65rem; letter-spacing: -0.01em;">BNB Chain & Zero Tax</h3>
                  <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 1.35rem;">
                    The $BOOBA coin is natively minted on BNB Smart Chain (BEP-20) with a fixed supply of 1,000,000,000 tokens and 0% Buy / 0% Sell taxes for frictionless decentralized trading.
                  </p>

                  <div style="display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem;">
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">1,000,000,000 Supply</span>
                    <span style="font-size: 0.74rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--accent-emerald);">0% Buy / Sell Tax</span>
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">BEP-20 Standard</span>
                  </div>
                </div>

                <a href="about.html#tokenomics" class="btn btn-secondary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                  <span>View Token Specs</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>
            </div>

            <!-- COIN BOX 2: 40% Community Distribution (Golden Moving Edge Light) -->
            <div class="chain-glow-card card-speed-2">
              <div class="chain-glow-inner">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.3);">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
                    </div>
                    <span class="badge-tag" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);">400M $BOOBA POOL</span>
                  </div>

                  <h3 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.65rem; letter-spacing: -0.01em;">Fair Community Earning</h3>
                  <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 1.35rem;">
                    40% (400 Million $BOOBA) is distributed directly to active community members. Earn $BOOBA through daily check-in streaks, social raids, creative bounties, and genuine referrals.
                  </p>

                  <div style="display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem;">
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">40% Community Pool</span>
                    <span style="font-size: 0.74rem; background: rgba(243, 186, 47, 0.08); border: 1px solid rgba(243, 186, 47, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--brand-yellow);">Daily Streaks</span>
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">Anti-Bot Fair Play</span>
                  </div>
                </div>

                <a href="quests.html" class="btn btn-secondary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                  <span>Earn $BOOBA Today</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>
            </div>

            <!-- COIN BOX 3: Staking Multipliers & Vault Yield (Golden Moving Edge Light) -->
            <div class="chain-glow-card card-speed-3">
              <div class="chain-glow-inner">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(139, 92, 246, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-purple); border: 1px solid rgba(139, 92, 246, 0.3);">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                    </div>
                    <span class="badge-tag" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; background: rgba(139, 92, 246, 0.12); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3);">UP TO 3.5X BOOST</span>
                  </div>

                  <h3 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.65rem; letter-spacing: -0.01em;">Staking & Yield Boosts</h3>
                  <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 1.35rem;">
                    Stake $BOOBA or $BOOBA/BNB LP inside the Booba Vault to earn sustainable staking APY and multiply all your quest payouts by up to 3.5x across the entire platform.
                  </p>

                  <div style="display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem;">
                    <span style="font-size: 0.74rem; background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--accent-purple);">Up to 3.5x Multiplier</span>
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">Staking APY</span>
                    <span style="font-size: 0.74rem; background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--accent-cyan);">LP Locked 24 Mos</span>
                  </div>
                </div>

                <a href="about.html#tokenomics" class="btn btn-secondary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                  <span>Explore Vault Staking</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>
            </div>

            <!-- COIN BOX 4: Real Ecosystem Utility & Governance (Golden Moving Edge Light) -->
            <div class="chain-glow-card card-speed-4">
              <div class="chain-glow-inner">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(255, 122, 0, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-orange); border: 1px solid rgba(255, 122, 0, 0.3);">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                    </div>
                    <span class="badge-tag" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; background: rgba(255, 122, 0, 0.12); color: var(--accent-orange); border-color: rgba(255, 122, 0, 0.3);">REAL UTILITIES</span>
                  </div>

                  <h3 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.65rem; letter-spacing: -0.01em;">Arcade, Tiers & DAO</h3>
                  <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); margin-bottom: 1.35rem;">
                    The $BOOBA coin powers daily Lucky Wheel spins, unlocks all 10 Passport progression tiers (Lv.1 to Lv.10), and gives holders decentralized DAO voting rights on treasury allocations.
                  </p>

                  <div style="display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem;">
                    <span style="font-size: 0.74rem; background: rgba(255, 122, 0, 0.08); border: 1px solid rgba(255, 122, 0, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--accent-orange);">Daily Spin Wheel</span>
                    <span style="font-size: 0.74rem; background: rgba(243, 186, 47, 0.08); border: 1px solid rgba(243, 186, 47, 0.3); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--brand-yellow);">10 Passport Tiers</span>
                    <span style="font-size: 0.74rem; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); padding: 0.25rem 0.6rem; border-radius: 6px; color: var(--text-secondary);">DAO Voting Rights</span>
                  </div>
                </div>

                <a href="about.html" class="btn btn-secondary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
                  <span>Explore All Utilities</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>
            </div>

          </div>

          <!-- SPOTLIGHT PORTAL BANNER TO THE DEDICATED ABOUT & TOKENOMICS PAGE -->
          <div class="glass-panel" style="margin-top: 3.5rem; padding: 2.5rem; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.35); background: linear-gradient(135deg, rgba(243, 186, 47, 0.08) 0%, rgba(14, 18, 27, 0.85) 100%); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2rem;">
            <div style="max-width: 680px;">
              <h3 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem;">
                Want to Discover the Full Story & Official Tokenomics?
              </h3>
              <p class="portal-banner-desc" style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6;">
                Check out our dedicated About & Tokenomics hub to inspect the token distribution percentages, smart contract verification, 24-month liquidity lock, and 4-phase ecosystem roadmap.
              </p>
            </div>
            <a href="about.html" class="btn btn-primary btn-lg" style="white-space: nowrap;">
              Explore About & Tokenomics Hub →
            </a>
          </div>

        </div>
      </section>

      <!-- 4. 4-STEP PIPELINE: HOW TO WIN IN THE BOOBA UNIVERSE -->
      <section class="section-container" style="padding: 6rem 0;">
        <div class="container">
          <div class="section-header text-center" style="margin-bottom: 4rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">How to Join & Earn in 4 Simple Steps</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 600px; margin: 0.75rem auto 0 auto;">
              No gas required to mint your passport. Get started on BNB Smart Chain in seconds.
            </p>
          </div>

          <div class="pipeline-grid">
            
            <div class="pipeline-card">
              <div class="pipeline-step-num">STEP 01</div>
              <h3 class="pipeline-step-title">Mint Passport</h3>
              <p class="pipeline-step-desc">
                Sign up with 1-click Google OAuth or your username to instantly receive your digital Booba Passport and +100 $BOOBA bonus.
              </p>
            </div>

            <div class="pipeline-card">
              <div class="pipeline-step-num">STEP 02</div>
              <h3 class="pipeline-step-title">Save Master Key</h3>
              <p class="pipeline-step-desc">
                Save your private 12-word cryptographic seed phrase for 100% non-custodial password recovery and security.
              </p>
            </div>

            <div class="pipeline-card">
              <div class="pipeline-step-num">STEP 03</div>
              <h3 class="pipeline-step-title">Conquer Quests</h3>
              <p class="pipeline-step-desc">
                Complete daily check-in streaks, viral meme bounties, and community challenges published by the core studio team.
              </p>
            </div>

            <div class="pipeline-card">
              <div class="pipeline-step-num">STEP 04</div>
              <h3 class="pipeline-step-title">Claim & Level Up</h3>
              <p class="pipeline-step-desc">
                Climb to Lv.10 Booba Master, climb the community leaderboard, and lock in your share of exclusive airdrop snapshots.
              </p>
            </div>

          </div>
        </div>
      </section>

      <!-- 5. HIGH-IMPACT COMMUNITY CTA BANNER -->
      <section class="section-container" style="padding: 0 0 6rem 0;">
        <div class="container">
          <div class="cta-banner-card">
            
            <!-- DESKTOP VIEW CONTENT -->
            <div class="cta-desktop-content">
              <span class="badge-tag" style="margin-bottom: 1.25rem;">Join ${(db.users && db.users.length) ? db.users.length : 17}+ Active Members</span>
              <h2 style="font-size: clamp(2.2rem, 4.5vw, 3.4rem); font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em; margin-bottom: 1rem;">
                Ready to Enter the <span class="text-gradient-gold">Booba Universe</span>?
              </h2>
              <p style="font-size: 1.1rem; color: var(--text-secondary); max-width: 600px; margin: 0 auto 2.5rem auto; line-height: 1.65;">
                Mint your digital passport today, earn your first +100 $BOOBA tokens instantly, and start climbing the leaderboard.
              </p>

              <div style="display: flex; justify-content: center; gap: 1.25rem; flex-wrap: wrap;">
                ${user ? `
                  <a href="dashboard.html" class="btn btn-primary btn-lg">Launch My Dashboard ↗</a>
                  <a href="quests.html" class="btn btn-secondary btn-lg">Explore Live Quests</a>
                ` : `
                  <a href="signin.html#signup" class="btn btn-primary btn-lg">Mint Free Passport (+100 BOOBA)</a>
                  <a href="about.html" class="btn btn-secondary btn-lg">Explore Tokenomics</a>
                `}
              </div>
            </div>

            <!-- MOBILE VIEW PIECHART CONTENT (ONLY IN MOBILE DESIGN) -->
            <div class="cta-mobile-piechart">
              <h3 style="font-size: 1.45rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1.25rem; letter-spacing: -0.01em;">
                Official <span class="text-gradient-gold">Token Allocation</span>
              </h3>
              
              <!-- 3D Pie Chart Container (Enlarged for Mobile) -->
              <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 1.35rem; width: 100%;">
                <div class="chart-3d-stage" style="height: 240px; width: 240px; display: flex; align-items: center; justify-content: center;">
                  <div class="chart-3d-rotator">
                    <svg width="240" height="240" viewBox="0 0 100 100" style="overflow: visible;">
                      <!-- Base Depth Platform -->
                      <ellipse cx="50" cy="58" rx="43" ry="43" fill="rgba(0,0,0,0.85)"></ellipse>
                      <ellipse cx="50" cy="54" rx="42" ry="42" fill="rgba(10, 14, 22, 0.95)" stroke="rgba(243, 186, 47, 0.35)" stroke-width="1.5"></ellipse>

                      <!-- Slices -->
                      <path d="M50 50 L50 10 A40 40 0 0 1 73.5 82.4 Z" fill="#F3BA2F" style="filter: drop-shadow(0 0 12px rgba(243, 186, 47, 0.6)); stroke: #111; stroke-width: 0.75;"></path>
                      <path d="M50 50 L73.5 82.4 A40 40 0 0 1 26.5 82.4 Z" fill="#8B5CF6" style="filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.55)); stroke: #111; stroke-width: 0.75;"></path>
                      <path d="M50 50 L26.5 82.4 A40 40 0 0 1 11.9 37.6 Z" fill="#10B981" style="filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.55)); stroke: #111; stroke-width: 0.75;"></path>
                      <path d="M50 50 L11.9 37.6 A40 40 0 0 1 26.5 17.6 Z" fill="#06B6D4" style="filter: drop-shadow(0 0 10px rgba(6, 182, 212, 0.55)); stroke: #111; stroke-width: 0.75;"></path>
                      <path d="M50 50 L26.5 17.6 A40 40 0 0 1 50 10 Z" fill="#FF7A00" style="filter: drop-shadow(0 0 10px rgba(255, 122, 0, 0.55)); stroke: #111; stroke-width: 0.75;"></path>
                      <circle cx="50" cy="50" r="3.8" fill="#FFFFFF" opacity="0.95"></circle>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Token Distribution Legend List -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; text-align: left; margin-bottom: 1.35rem; width: 100%;">
                <div style="background: rgba(243, 186, 47, 0.08); border: 1px solid rgba(243, 186, 47, 0.25); border-radius: 10px; padding: 0.45rem 0.6rem;">
                  <div style="font-size: 0.72rem; font-weight: 800; color: var(--brand-yellow);">40% • 400M</div>
                  <div style="font-size: 0.64rem; color: var(--text-secondary);">Community Quests</div>
                </div>
                <div style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.25); border-radius: 10px; padding: 0.45rem 0.6rem;">
                  <div style="font-size: 0.72rem; font-weight: 800; color: var(--accent-purple);">20% • 200M</div>
                  <div style="font-size: 0.64rem; color: var(--text-secondary);">Vault Staking</div>
                </div>
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; padding: 0.45rem 0.6rem;">
                  <div style="font-size: 0.72rem; font-weight: 800; color: var(--accent-emerald);">20% • 200M</div>
                  <div style="font-size: 0.64rem; color: var(--text-secondary);">DEX Liquidity</div>
                </div>
                <div style="background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.25); border-radius: 10px; padding: 0.45rem 0.6rem;">
                  <div style="font-size: 0.72rem; font-weight: 800; color: var(--accent-cyan);">10% • 100M</div>
                  <div style="font-size: 0.64rem; color: var(--text-secondary);">Ecosystem Dev</div>
                </div>
              </div>

              <a href="about.html#tokenomics" class="btn btn-primary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; width: 100%; border-radius: 9999px;">
                <span>View Full Tokenomics Architecture</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </a>
            </div>

          </div>
        </div>
      </section>
    `;
  }

  // --------------------------------------------------------------------------
  // 1.5. ABOUT & TOKENOMICS DEDICATED VIEW (about.html)
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // 1.5. DEVELOPER-GRADE ABOUT & TOKENOMICS ARCHITECTURE VIEW (about.html)
  // --------------------------------------------------------------------------

  renderAboutView(container) {
    const user = db.currentUser;
    const stats = db.getStats();

    container.innerHTML = `
      <!-- 1. HERO BANNER WITH TELEMETRY -->
      <section class="section-container" style="padding: 4.5rem 0 3.5rem 0; border-bottom: 1px solid var(--border-subtle); background: radial-gradient(circle at 50% 0%, rgba(243, 186, 47, 0.1) 0%, transparent 70%); position: relative; overflow: hidden;">
        
        <div class="ambient-glow" style="top: -150px; left: 50%; transform: translateX(-50%); width: 700px; height: 350px;"></div>

        <div class="container text-center" style="position: relative; z-index: 2;">
          
          <!-- DESKTOP BADGES (SIDE-BY-SIDE IN ONE ROW) -->
          <div class="about-hero-badges-desktop">
            <span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); display: inline-flex; align-items: center; gap: 0.45rem;">
              <span class="pulse-dot"></span> BNB Smart Chain Mainnet
            </span>
            <span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); display: inline-flex; align-items: center; gap: 0.45rem;">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg> BEP-20 Standard
            </span>
            <span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3); display: inline-flex; align-items: center; gap: 0.45rem;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> 0% Buy / 0% Sell Tax
            </span>
          </div>

          <!-- MOBILE BADGES ROTATOR (ONE AFTER ANOTHER IN THE CENTER) -->
          <div class="about-hero-badges-mobile" id="aboutHeroBadgesMobile">
            <div id="aboutMobileBadgeSlot" style="display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.25s ease, transform 0.25s ease;">
              <span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); display: inline-flex; align-items: center; gap: 0.45rem;">
                <span class="pulse-dot"></span> BNB Smart Chain Mainnet
              </span>
            </div>
          </div>

          <h1 style="font-size: clamp(2.4rem, 5.5vw, 4.2rem); font-weight: 800; color: #FFFFFF; letter-spacing: -0.025em; max-width: 960px; margin: 0 auto 1.5rem auto; line-height: 1.12;">
            The Next-Generation Gamified Protocol on <span class="text-gradient-gold">BNB Chain</span>
          </h1>

          <p style="font-size: clamp(1.05rem, 2vw, 1.22rem); color: var(--text-secondary); max-width: 780px; margin: 0 auto 2.5rem auto; line-height: 1.7;">
            An all-in-one Web3 ecosystem unifying non-custodial cryptographic digital identity, decentralized quest bounties, dynamic multiplier staking vaults, and real-time community governance.
          </p>

          <!-- LIVING TV TELEMETRY BROADCAST SCREEN (ROTATING 1-BOX STATS) -->
          <div class="tv-telemetry-screen" id="aboutTvScreen">
            <div class="tv-screen-bezel">
              <div class="tv-top-bar">
                <div class="tv-live-badge">
                  <span class="pulse-dot"></span>
                  <span class="tv-live-text-desktop">LIVE NETWORK TELEMETRY • CH-0<span id="tvChannelNum">1</span></span>
                  <span class="tv-live-text-mobile">TELEMETRY • CH-0<span id="tvChannelNumMob">1</span></span>
                </div>
                <div class="tv-controls-group">
                  <div class="tv-channel-dots">
                    <div class="tv-channel-dot active" onclick="window.boobaApp.setTvStatSlide(0)" title="Channel 1"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(1)" title="Channel 2"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(2)" title="Channel 3"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(3)" title="Channel 4"></div>
                  </div>
                  <div class="tv-nav-arrows" style="display: flex; gap: 0.35rem;">
                    <button type="button" class="tv-nav-btn" onclick="window.boobaApp.prevTvStatSlide()" aria-label="Previous Channel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button type="button" class="tv-nav-btn" onclick="window.boobaApp.nextTvStatSlide()" aria-label="Next Channel">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- TV SCREEN DISPLAY FRAME -->
              <div class="tv-stat-card-frame" id="tvStatFrame">
                <div class="tv-stat-number" id="tvStatNumber" style="color: var(--brand-yellow);">1,000,000,000</div>
                <div class="tv-stat-label" id="tvStatLabel">Fixed Total Supply</div>
                <div class="tv-stat-desc" id="tvStatDesc">Strictly capped BEP-20 supply natively minted on BNB Smart Chain with zero inflation risk.</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <!-- 2. 8 CORE PILLARS ABOUT THE TOKEN -->
      <section class="section-container" style="padding: 5rem 0; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle);">
        <div class="container">
          
          <div class="section-header text-center" style="margin-bottom: 3.5rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">About The Token</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 720px; margin: 0.75rem auto 0 auto;">
              Engineered natively on BNB Smart Chain for maximum security, real GameFi & DeFi utility, and long-term community value.
            </p>
          </div>

          <!-- 8 Token Pillars Grid (Clean, Modern Responsive Layout with Typing Animation) -->
          <div class="grid" id="tokenPillarsGrid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem;">
            
            <!-- Pillar 1: Fixed 1 Billion Supply -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(243, 186, 47, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(243, 186, 47, 0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-5 0c0 2 5 2 5 4.5a3.5 3.5 0 0 1-5 0"></path></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3);">01 • SUPPLY</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Fixed 1 Billion Supply</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Strictly capped at 1,000,000,000 $BOOBA. Zero minting exploits, zero inflationary dilution, and no secondary tokens created.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ Hard-Capped BEP-20 Mint</div>
            </div>

            <!-- Pillar 2: 0% Tax Structure -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);">02 • TAX FREE</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">0% Buy & 0% Sell Tax</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Zero developer taxes on transactions. Trade freely across DEX protocols without unexpected fees or hidden slippage traps.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ 100% Frictionless Trading</div>
            </div>

            <!-- Pillar 3: 24-Month Liquidity Lock -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(6, 182, 212, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(6, 182, 212, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.3);">03 • SECURITY</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">24-Month Liquidity Lock</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">20% of total supply (200,000,000 $BOOBA) dedicated to DEX liquidity is locked for 24 months via verifiable smart contract timelocks.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ Rug-Proof Timelock</div>
            </div>

            <!-- Pillar 4: Dynamic Staking Multipliers -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(139, 92, 246, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(139, 92, 246, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-purple);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(139, 92, 246, 0.12); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3);">04 • YIELD BOOST</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Dynamic Staking Boost</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Deposit $BOOBA or LP tokens to activate dynamic 1.5x – 3.5x multiplier boosters on all daily check-in and bounty payouts.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-purple); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ Up to 3.5x Quest Multiplier</div>
            </div>

            <!-- Pillar 5: Non-Custodial Passport Identity -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(243, 186, 47, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(243, 186, 47, 0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3);">05 • IDENTITY</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Non-Custodial DID</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Client-side BIP-39 mnemonic seed generation with a unique citizen ID (BB-XXXXXX) for sovereign digital ownership.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ 12-Word Master Cryptography</div>
            </div>

            <!-- Pillar 6: Proof-of-Engagement Bounties -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);">06 • COMMUNITY</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Proof-of-Engagement</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">40% of tokens are earned by active community participants through daily streak check-ins, social raids, and creative bounties.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ Merit-Based Fair Allocation</div>
            </div>

            <!-- Pillar 7: Arcade & GameFi Ecosystem -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(255, 122, 0, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 122, 0, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-orange);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"></rect><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"></path></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(255, 122, 0, 0.12); color: var(--accent-orange); border-color: rgba(255, 122, 0, 0.3);">07 • GAMEFI</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Arcade & Gamification</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Use $BOOBA to play the Spin-to-Earn Lucky Wheel, unlock exclusive Lv.1–10 badge titles, and participate in competitive leaderboard seasons.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-orange); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ Spin-to-Earn & Tier Rewards</div>
            </div>

            <!-- Pillar 8: Decentralized DAO Governance -->
            <div class="glass-panel token-pillar-card" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(139, 92, 246, 0.3); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(139, 92, 246, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-purple);">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </div>
                <span class="badge-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(139, 92, 246, 0.12); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3);">08 • DAO</span>
              </div>
              <h3 class="typewriter-text" style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; min-height: 1.4em;">Decentralized Governance</h3>
              <p class="typewriter-text" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem; min-height: 4.8em;">Direct voting power over ecosystem treasury allocations, community grants, pool upgrades, and strategic multi-chain expansions.</p>
              <div class="typewriter-text" style="font-size: 0.75rem; color: var(--accent-purple); font-weight: 700; font-family: var(--font-mono); min-height: 1.2em;">✓ 100% Community Sovereign Rule</div>
            </div>

          </div>

        </div>
      </section>

      <!-- 3. INTERACTIVE STAKING MULTIPLIER CALCULATOR (DEVELOPER MINI-TOOL) -->
      <section class="section-container" style="padding: 5rem 0;">
        <div class="container">
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 3rem; align-items: center;">
            
            <div>
              <h2 style="font-size: clamp(1.8rem, 3.5vw, 2.5rem); font-weight: 800; color: #FFFFFF; line-height: 1.2; margin-bottom: 1rem;">
                Staking & Yield Multiplier Calculator
              </h2>
              <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 2rem;">
                Drag the slider to project your quest multiplier boost, daily check-in yield, and unlocked Passport Tier status when staking $BOOBA tokens.
              </p>

              <div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <label for="stakingCalcSlider" style="font-size: 0.9rem; font-weight: 700; color: #FFFFFF;">$BOOBA Tokens Staked:</label>
                  <span id="stakingCalcAmountDisplay" class="text-mono" style="font-size: 1.25rem; font-weight: 800; color: var(--brand-yellow);">10,000 $BOOBA</span>
                </div>
                <input type="range" id="stakingCalcSlider" class="calc-range-slider" min="0" max="50000" step="1000" value="10000" oninput="window.boobaApp.updateAboutStakingCalc(this.value)">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
                  <span>0 $BOOBA</span>
                  <span>25,000 $BOOBA</span>
                  <span>50,000+ $BOOBA</span>
                </div>
              </div>
            </div>

            <!-- Live Calculated Display Card -->
            <div class="glass-panel" style="padding: 2rem; border-radius: 20px; border: 1.5px solid var(--border-medium); background: rgba(7, 9, 14, 0.9);">
              <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
                Live Projected Benefits
              </div>

              <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.9rem;">Bounty Multiplier Boost:</span>
                  <strong id="calcMultiplierOutput" class="text-mono" style="font-size: 1.4rem; color: var(--brand-yellow);">2.00x Boost</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.9rem;">Est. Daily Streak Earnings:</span>
                  <strong id="calcDailyYieldOutput" class="text-mono" style="font-size: 1.15rem; color: var(--accent-emerald);">+100 BOOBA / day</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.9rem;">Unlocked Passport Tier:</span>
                  <strong id="calcTierOutput" style="font-size: 0.95rem; color: #FFFFFF; background: rgba(243, 186, 47, 0.15); padding: 0.2rem 0.6rem; border-radius: 999px; border: 1px solid rgba(243, 186, 47, 0.3);">Lv.6 Champion</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.9rem;">Base Vault APY:</span>
                  <strong class="text-mono" style="font-size: 1.05rem; color: var(--accent-purple);">18.5% Base APY</strong>
                </div>
              </div>

              <div style="margin-top: 1.75rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle); text-align: center;">
                <a href="quests.html" class="btn btn-primary btn-block btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
                  <span>Start Earning & Staking</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- 4. OFFICIAL TOKENOMICS & 3D MULTI-MODE DISTRIBUTION -->
      <section id="tokenomics" class="section-container" style="padding: 5rem 0; background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle);">
        <div class="container">
          
          <div class="section-header text-center" style="margin-bottom: 3.5rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">$BOOBA Official Tokenomics</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 680px; margin: 0.75rem auto 0 auto;">
              Designed with 0% transaction taxes, a fixed 1 Billion supply, and community-first distributions.
            </p>
          </div>

          <!-- SMART CONTRACT SPECIFICATIONS (CLEAN UNBOXED STRIP) -->
          <div style="margin-bottom: 3.5rem;">
            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Token Name</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">BOOBA (BNB baby)</div>
              </div>
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Ticker Symbol</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem; font-family: var(--font-mono);">$BOOBA</div>
              </div>
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Blockchain</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">BNB Chain (BEP-20)</div>
              </div>
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Total Supply</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem; font-family: var(--font-mono);">1,000,000,000</div>
              </div>
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Buy / Sell Tax</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">0% / 0% (Zero Tax)</div>
              </div>
              <div style="padding: 1rem 0;">
                <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Liquidity Lock</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-cyan); margin-top: 0.25rem;">24 Months Verifiable</div>
              </div>
            </div>

            <!-- Contract Address 1-Click Copy Bar -->
            <div style="background: rgba(7, 9, 14, 0.7); border: 1px solid var(--border-medium); border-radius: 14px; padding: 0.85rem 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span class="badge-tag" style="margin: 0;">Contract</span>
                <span id="tokenContractAddr" class="text-mono" style="font-size: 0.92rem; color: var(--brand-yellow); word-break: break-all;">0x712B00BA99E74f8812cCdA15D5881a7a1c92F3a1</span>
              </div>
              <div style="display: flex; gap: 0.75rem;">
                <button type="button" class="btn btn-primary btn-sm" onclick="window.boobaApp.copyContractAddress()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span id="copyContractBtnText">Copy Contract</span>
                </button>
                <a href="https://bscscan.com" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                  <span>View on BscScan</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
              </div>
            </div>
          </div>

          <!-- TOKEN ALLOCATION MULTI-REPRESENTATION VISUALIZER (UNBOXED SINGLE-LINE TABS) & BREAKDOWN -->
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 3rem; align-items: center;">
            
            <!-- 3D VISUALIZER PANEL (UNBOXED CLEAN CANVAS) -->
            <div style="text-align: center;">
              
              <!-- 3D Mode Switcher Tabs (In One Line) -->
              <div class="rep-switcher-bar" style="display: inline-flex; flex-wrap: nowrap; gap: 0.5rem; justify-content: center; margin-bottom: 2rem;">
                <button type="button" id="repTabPie" class="rep-switch-btn active" onclick="window.boobaApp.switchTokenomicsView('pie3d')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                  <span>3D Pie Chart</span>
                </button>
                <button type="button" id="repTabColumn" class="rep-switch-btn" onclick="window.boobaApp.switchTokenomicsView('column3d')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
                  <span>3D Column Chart</span>
                </button>
                <button type="button" id="repTabLine" class="rep-switch-btn" onclick="window.boobaApp.switchTokenomicsView('line3d')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  <span>3D Line Graph</span>
                </button>
              </div>

              <!-- VIEW 1: 3D SOLID ISOMETRIC PIE CHART -->
              <div id="viewPie3D" style="display: block;">
                <div class="chart-3d-stage">
                  <div class="chart-3d-rotator">
                    <svg width="230" height="230" viewBox="0 0 100 100" style="overflow: visible;">
                      <!-- 3D Base Thickness Shadow Platform -->
                      <ellipse cx="50" cy="58" rx="42" ry="42" fill="rgba(0,0,0,0.75)"></ellipse>
                      <ellipse cx="50" cy="54" rx="41" ry="41" fill="rgba(10, 14, 22, 0.9)" stroke="rgba(243, 186, 47, 0.2)" stroke-width="1.5"></ellipse>

                      <!-- Solid 3D Pie Slices (Layered & Shaded) -->
                      <!-- Sector 1: 40% Community (Yellow) - 0 to 144 deg -->
                      <path d="M50 50 L50 10 A40 40 0 0 1 73.5 82.4 Z" fill="#F3BA2F" style="filter: drop-shadow(0 0 10px rgba(243, 186, 47, 0.5)); stroke: #111; stroke-width: 0.75;"></path>
                      
                      <!-- Sector 2: 20% Staking Vault (Purple) - 144 to 216 deg -->
                      <path d="M50 50 L73.5 82.4 A40 40 0 0 1 26.5 82.4 Z" fill="#8B5CF6" style="filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5)); stroke: #111; stroke-width: 0.75;"></path>
                      
                      <!-- Sector 3: 20% DEX Liquidity (Emerald) - 216 to 288 deg -->
                      <path d="M50 50 L26.5 82.4 A40 40 0 0 1 11.9 37.6 Z" fill="#10B981" style="filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.5)); stroke: #111; stroke-width: 0.75;"></path>
                      
                      <!-- Sector 4: 10% Ecosystem (Cyan) - 288 to 324 deg -->
                      <path d="M50 50 L11.9 37.6 A40 40 0 0 1 26.5 17.6 Z" fill="#06B6D4" style="filter: drop-shadow(0 0 8px rgba(6, 182, 212, 0.5)); stroke: #111; stroke-width: 0.75;"></path>
                      
                      <!-- Sector 5: 10% Core Team (Orange) - 324 to 360 deg -->
                      <path d="M50 50 L26.5 17.6 A40 40 0 0 1 50 10 Z" fill="#FF7A00" style="filter: drop-shadow(0 0 8px rgba(255, 122, 0, 0.5)); stroke: #111; stroke-width: 0.75;"></path>

                      <!-- Center Specular Highlight -->
                      <circle cx="50" cy="50" r="3.5" fill="#FFFFFF" opacity="0.9"></circle>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- VIEW 2: 3D ISOMETRIC COLUMN / BAR CHART -->
              <div id="viewColumn3D" style="display: none; animation: fadeIn 0.25s ease;">
                <div class="column-3d-stage">
                  
                  <!-- Col 1: 40% Community (Yellow) -->
                  <div class="column-3d-bar" style="height: 165px;">
                    <div class="col-3d-val-tag" style="color: var(--brand-yellow);">40%</div>
                    <div class="col-3d-front" style="height: 165px; background: linear-gradient(180deg, #F3BA2F 0%, #B8860B 100%); box-shadow: 0 0 15px rgba(243, 186, 47, 0.4);"></div>
                    <div class="col-3d-top" style="background: #FEE75C;"></div>
                    <div class="col-3d-side" style="height: 165px; background: #996515;"></div>
                  </div>

                  <!-- Col 2: 20% Vault (Purple) -->
                  <div class="column-3d-bar" style="height: 95px;">
                    <div class="col-3d-val-tag" style="color: var(--accent-purple);">20%</div>
                    <div class="col-3d-front" style="height: 95px; background: linear-gradient(180deg, #8B5CF6 0%, #6D28D9 100%); box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);"></div>
                    <div class="col-3d-top" style="background: #C4B5FD;"></div>
                    <div class="col-3d-side" style="height: 95px; background: #4C1D95;"></div>
                  </div>

                  <!-- Col 3: 20% DEX LP (Emerald) -->
                  <div class="column-3d-bar" style="height: 95px;">
                    <div class="col-3d-val-tag" style="color: var(--accent-emerald);">20%</div>
                    <div class="col-3d-front" style="height: 95px; background: linear-gradient(180deg, #10B981 0%, #047857 100%); box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);"></div>
                    <div class="col-3d-top" style="background: #6EE7B7;"></div>
                    <div class="col-3d-side" style="height: 95px; background: #064E3B;"></div>
                  </div>

                  <!-- Col 4: 10% Ecosystem (Cyan) -->
                  <div class="column-3d-bar" style="height: 55px;">
                    <div class="col-3d-val-tag" style="color: var(--accent-cyan);">10%</div>
                    <div class="col-3d-front" style="height: 55px; background: linear-gradient(180deg, #06B6D4 0%, #0891B2 100%); box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);"></div>
                    <div class="col-3d-top" style="background: #67E8F9;"></div>
                    <div class="col-3d-side" style="height: 55px; background: #164E63;"></div>
                  </div>

                  <!-- Col 5: 10% Team (Orange) -->
                  <div class="column-3d-bar" style="height: 55px;">
                    <div class="col-3d-val-tag" style="color: var(--accent-orange);">10%</div>
                    <div class="col-3d-front" style="height: 55px; background: linear-gradient(180deg, #FF7A00 0%, #C2410C 100%); box-shadow: 0 0 10px rgba(255, 122, 0, 0.4);"></div>
                    <div class="col-3d-top" style="background: #FDBA74;"></div>
                    <div class="col-3d-side" style="height: 55px; background: #7C2D12;"></div>
                  </div>

                </div>
              </div>

              <!-- VIEW 3: 3D ISOMETRIC LINE GRAPH -->
              <div id="viewLine3D" style="display: none; animation: fadeIn 0.25s ease;">
                <div class="linegraph-3d-stage">
                  <div class="linegraph-3d-plane">
                    <svg width="100%" height="180" viewBox="0 0 360 140" style="overflow: visible;">
                      <defs>
                        <linearGradient id="line3dGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stop-color="#F3BA2F" stop-opacity="0.45"></stop>
                          <stop offset="100%" stop-color="#F3BA2F" stop-opacity="0.0"></stop>
                        </linearGradient>
                      </defs>

                      <!-- 3D Perspective Grid Lines -->
                      <line x1="20" y1="120" x2="340" y2="120" stroke="rgba(255,255,255,0.15)" stroke-dasharray="3,3"></line>
                      <line x1="20" y1="80" x2="340" y2="80" stroke="rgba(255,255,255,0.1)" stroke-dasharray="3,3"></line>
                      <line x1="20" y1="40" x2="340" y2="40" stroke="rgba(255,255,255,0.1)" stroke-dasharray="3,3"></line>

                      <!-- 3D Area Gradient Fill -->
                      <polygon points="30,120 30,25 105,75 180,75 255,100 330,100 330,120" fill="url(#line3dGrad)"></polygon>

                      <!-- 3D Elevated Polyline Ribbon -->
                      <polyline points="30,25 105,75 180,75 255,100 330,100" fill="none" stroke="#F3BA2F" stroke-width="4" style="filter: drop-shadow(0 6px 8px rgba(243,186,47,0.6)); stroke-linecap: round; stroke-linejoin: round;"></polyline>

                      <!-- Glowing 3D Data Nodes & Drop Indicators -->
                      <!-- Node 1: Community (400M) -->
                      <line x1="30" y1="25" x2="30" y2="120" stroke="rgba(243,186,47,0.3)" stroke-width="1.5" stroke-dasharray="2,2"></line>
                      <circle cx="30" cy="25" r="5.5" fill="#F3BA2F" stroke="#FFFFFF" stroke-width="2"></circle>
                      <text x="30" y="15" fill="#F3BA2F" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">400M</text>

                      <!-- Node 2: Vault (200M) -->
                      <line x1="105" y1="75" x2="105" y2="120" stroke="rgba(139,92,246,0.3)" stroke-width="1.5" stroke-dasharray="2,2"></line>
                      <circle cx="105" cy="75" r="5" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="1.5"></circle>
                      <text x="105" y="65" fill="#C4B5FD" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">200M</text>

                      <!-- Node 3: LP (200M) -->
                      <line x1="180" y1="75" x2="180" y2="120" stroke="rgba(16,185,129,0.3)" stroke-width="1.5" stroke-dasharray="2,2"></line>
                      <circle cx="180" cy="75" r="5" fill="#10B981" stroke="#FFFFFF" stroke-width="1.5"></circle>
                      <text x="180" y="65" fill="#6EE7B7" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">200M</text>

                      <!-- Node 4: Ecosystem (100M) -->
                      <line x1="255" y1="100" x2="255" y2="120" stroke="rgba(6,182,212,0.3)" stroke-width="1.5" stroke-dasharray="2,2"></line>
                      <circle cx="255" cy="100" r="4.5" fill="#06B6D4" stroke="#FFFFFF" stroke-width="1.5"></circle>
                      <text x="255" y="90" fill="#67E8F9" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">100M</text>

                      <!-- Node 5: Team (100M) -->
                      <line x1="330" y1="100" x2="330" y2="120" stroke="rgba(255,122,0,0.3)" stroke-width="1.5" stroke-dasharray="2,2"></line>
                      <circle cx="330" cy="100" r="4.5" fill="#FF7A00" stroke="#FFFFFF" stroke-width="1.5"></circle>
                      <text x="330" y="90" fill="#FDBA74" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">100M</text>
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Common Legend (Single-line on mobile) -->
              <div class="token-common-legend">
                <span class="legend-item"><span style="width: 8px; height: 8px; border-radius: 50%; background: #F3BA2F; flex-shrink: 0;"></span> 40% Community</span>
                <span class="legend-item"><span style="width: 8px; height: 8px; border-radius: 50%; background: #8B5CF6; flex-shrink: 0;"></span> 20% Vault</span>
                <span class="legend-item"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; flex-shrink: 0;"></span> 20% LP</span>
                <span class="legend-item"><span style="width: 8px; height: 8px; border-radius: 50%; background: #06B6D4; flex-shrink: 0;"></span> 10% Growth</span>
                <span class="legend-item"><span style="width: 8px; height: 8px; border-radius: 50%; background: #FF7A00; flex-shrink: 0;"></span> 10% Team</span>
              </div>
            </div>

            <!-- ALLOCATION DETAILED CARDS -->
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              
              <!-- 1. Community Quests -->
              <div class="glass-panel" style="padding: 1.15rem 1.5rem; border-radius: 16px; border-left: 4px solid var(--brand-yellow); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Community Quests & Airdrops</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">Earned via daily check-in streaks, bounties, and referrals</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 800; color: var(--brand-yellow); font-size: 1.1rem; font-family: var(--font-mono);">40%</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">400,000,000 $BOOBA</div>
                </div>
              </div>

              <!-- 2. Staking Vault Reserves -->
              <div class="glass-panel" style="padding: 1.15rem 1.5rem; border-radius: 16px; border-left: 4px solid var(--accent-purple); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Staking Vault & Yield Reserves</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">Yield rewards & multiplier bonuses for staking $BOOBA / LP</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 800; color: var(--accent-purple); font-size: 1.1rem; font-family: var(--font-mono);">20%</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">200,000,000 $BOOBA</div>
                </div>
              </div>

              <!-- 3. DEX Liquidity Pool -->
              <div class="glass-panel" style="padding: 1.15rem 1.5rem; border-radius: 16px; border-left: 4px solid var(--accent-emerald); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">PancakeSwap DEX Liquidity</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">Locked liquidity pair for seamless decentralized trading</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 800; color: var(--accent-emerald); font-size: 1.1rem; font-family: var(--font-mono);">20%</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">200,000,000 $BOOBA</div>
                </div>
              </div>

              <!-- 4. Ecosystem Growth -->
              <div class="glass-panel" style="padding: 1.15rem 1.5rem; border-radius: 16px; border-left: 4px solid var(--accent-cyan); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Ecosystem Growth & Exchange Listings</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">Strategic marketing, CEX market making, and ecosystem grants</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 800; color: var(--accent-cyan); font-size: 1.1rem; font-family: var(--font-mono);">10%</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">100,000,000 $BOOBA</div>
                </div>
              </div>

              <!-- 5. Core Team & Dev -->
              <div class="glass-panel" style="padding: 1.15rem 1.5rem; border-radius: 16px; border-left: 4px solid var(--accent-orange); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Core Team & Protocol Development</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">Subject to a 12-month linear smart contract vesting schedule</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 800; color: var(--accent-orange); font-size: 1.1rem; font-family: var(--font-mono);">10%</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">100,000,000 $BOOBA</div>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      <!-- 5. STRATEGIC ECOSYSTEM ROADMAP (PHASES 1-4) -->
      <section class="section-container" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); padding: 5rem 0;">
        <div class="container">
          
          <div class="section-header text-center" style="margin-bottom: 3.5rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">The Booba Strategic Roadmap</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 650px; margin: 0.75rem auto 0 auto;">
              Clear milestones guiding our expansion from genesis digital identity into a multi-chain decentralized kingdom.
            </p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem;">
            
            <!-- Phase 1 -->
            <div class="glass-panel" style="padding: 1.75rem; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.4); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; white-space: nowrap;">
                <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0; display: inline-flex; align-items: center; gap: 0.35rem;">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg> Completed
                </span>
                <span style="font-weight: 800; font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.04em;">PHASE 01</span>
              </div>
              <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Genesis & Identity</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem; color: var(--text-secondary);">
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> 3D Booba Passport Architecture</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> BIP-39 Non-Custodial Keys</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Multi-Wallet Web3 Connect</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Google & Apple OAuth Portal</li>
              </ul>
            </div>

            <!-- Phase 2 -->
            <div class="glass-panel" style="padding: 1.75rem; border-radius: 20px; border: 1.5px solid var(--brand-yellow); position: relative; box-shadow: 0 0 25px rgba(243, 186, 47, 0.12);">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; white-space: nowrap;">
                <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800; font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0; display: inline-flex; align-items: center; gap: 0.35rem;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Live & In Progress
                </span>
                <span style="font-weight: 800; font-size: 0.85rem; color: var(--brand-yellow); font-family: var(--font-mono); letter-spacing: 0.04em;">PHASE 02</span>
              </div>
              <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Quest Engine & Growth</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem; color: var(--text-secondary);">
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Daily Check-in Streak Multipliers</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Bounty & Meme Submissions</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Admin Moderation Dashboard</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Anti-Sybil Referral Tracking</li>
              </ul>
            </div>

            <!-- Phase 3 -->
            <div class="glass-panel" style="padding: 1.75rem; border-radius: 20px; border: 1px solid var(--border-medium); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; white-space: nowrap;">
                <span class="badge-tag" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0;">
                  Upcoming Q3 2026
                </span>
                <span style="font-weight: 800; font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.04em;">PHASE 03</span>
              </div>
              <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Vault Staking & Arcade</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem; color: var(--text-secondary);">
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-purple)"><circle cx="4" cy="4" r="3.5"></circle></svg> On-Chain $BOOBA Staking Vault</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-purple)"><circle cx="4" cy="4" r="3.5"></circle></svg> Up to 3.5x Multiplier Boosters</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-purple)"><circle cx="4" cy="4" r="3.5"></circle></svg> Spin-to-Earn Lucky Wheel Arcade</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-purple)"><circle cx="4" cy="4" r="3.5"></circle></svg> Automated Telegram Social Raid Bot</li>
              </ul>
            </div>

            <!-- Phase 4 -->
            <div class="glass-panel" style="padding: 1.75rem; border-radius: 20px; border: 1px solid var(--border-medium); position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 1rem; white-space: nowrap;">
                <span class="badge-tag" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0;">
                  Upcoming Q4 2026
                </span>
                <span style="font-weight: 800; font-size: 0.85rem; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.04em;">PHASE 04</span>
              </div>
              <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Soulbound NFTs & DAO</h3>
              <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem; color: var(--text-secondary);">
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-cyan)"><circle cx="4" cy="4" r="3.5"></circle></svg> On-Chain SBT Passport Minting</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-cyan)"><circle cx="4" cy="4" r="3.5"></circle></svg> PancakeSwap Syrup Pool Synergy</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-cyan)"><circle cx="4" cy="4" r="3.5"></circle></svg> Decentralized DAO Community Voting</li>
                <li style="display: flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="var(--accent-cyan)"><circle cx="4" cy="4" r="3.5"></circle></svg> Tier-1 Centralized Exchange Listings</li>
              </ul>
            </div>

          </div>

        </div>
      </section>

      <!-- 6. FREQUENTLY ASKED QUESTIONS (INTERACTIVE ACCORDION) -->
      <section class="section-container" style="padding: 5rem 0;">
        <div class="container" style="max-width: 860px;">
          
          <div class="section-header text-center" style="margin-bottom: 3.5rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">Frequently Asked Questions</h2>
            <p class="section-subtitle" style="font-size: 1.05rem; color: var(--text-secondary); margin: 0.75rem auto 0 auto;">
              Technical details and answers regarding the $BOOBA coin and ecosystem.
            </p>
          </div>

          <div id="aboutFaqContainer">
            
            <div class="faq-item-card open" id="faqItem0">
              <button type="button" class="faq-question-btn" onclick="window.boobaApp.toggleAboutFaq(0)">
                <span>What is the BOOBA ($BOOBA) coin?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel" style="display: block;">
                $BOOBA is the utility and governance token powering the BNB Baby community ecosystem on BNB Smart Chain. It is used to reward quest conquerors, boost staking multiplier yields, spin the arcade wheel, and upgrade digital Passport reputation tiers.
              </div>
            </div>

            <div class="faq-item-card" id="faqItem1">
              <button type="button" class="faq-question-btn" onclick="window.boobaApp.toggleAboutFaq(1)">
                <span>Do I need to pay BNB gas fees to mint my Passport?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel">
                No! Minting your Booba Passport is 100% gas-free. You receive an instant +100 $BOOBA welcome bonus and a 12-word cryptographic BIP-39 master recovery seed phrase without needing BNB in your wallet.
              </div>
            </div>

            <div class="faq-item-card" id="faqItem2">
              <button type="button" class="faq-question-btn" onclick="window.boobaApp.toggleAboutFaq(2)">
                <span>How do the Staking Vault Multipliers work?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel">
                When you deposit $BOOBA or $BOOBA/BNB LP tokens into the Booba Vault, the smart contract algorithm calculates a multiplier ranging from 1.5x up to 3.5x based on your lock tier. This multiplier automatically boosts all points and $BOOBA rewards you earn across daily check-ins and bounties.
              </div>
            </div>

            <div class="faq-item-card" id="faqItem3">
              <button type="button" class="faq-question-btn" onclick="window.boobaApp.toggleAboutFaq(3)">
                <span>Is the PancakeSwap liquidity pool locked?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel">
                Yes. 20% of the total supply (200,000,000 $BOOBA) allocated for the decentralized exchange liquidity pool is locked for 24 months via verifiable smart contract timelocks on BNB Smart Chain.
              </div>
            </div>

            <div class="faq-item-card" id="faqItem4">
              <button type="button" class="faq-question-btn" onclick="window.boobaApp.toggleAboutFaq(4)">
                <span>Are there any transaction taxes on $BOOBA transfers?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel">
                $BOOBA features a strict 0% Buy and 0% Sell tax standard. There are no hidden developer fees, honeypots, or transfer fees, ensuring complete compliance with standard BEP-20 protocols.
              </div>
            </div>

          </div>

        </div>
      </section>

      <!-- 7. COMMUNITY CTA BANNER -->
      <section class="section-container" style="padding: 0 0 6rem 0;">
        <div class="container">
          <div class="cta-banner-card">
            <h2 style="font-size: clamp(2.2rem, 4.5vw, 3.4rem); font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em; margin-bottom: 1rem;">
              Join the <span class="text-gradient-gold">BNB Baby Movement</span>
            </h2>
            <p style="font-size: 1.1rem; color: var(--text-secondary); max-width: 620px; margin: 0 auto 2.5rem auto; line-height: 1.65;">
              Mint your digital passport, claim your +100 $BOOBA welcome bonus, and begin conquering bounties on the BNB Smart Chain.
            </p>

            <div style="display: flex; justify-content: center; gap: 1.25rem; flex-wrap: wrap;">
              ${user ? `
                <a href="dashboard.html" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 0.45rem;">
                  <span>Launch My Dashboard</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
                <a href="quests.html" class="btn btn-secondary btn-lg">Conquer Quests</a>
              ` : `
                <a href="signin.html#signup" class="btn btn-primary btn-lg">Mint Free Passport (+100 BOOBA)</a>
                <a href="dashboard.html" class="btn btn-secondary btn-lg">Enter Dashboard</a>
              `}
            </div>
          </div>
        </div>
      </section>
    `;

    // Initialize TV Telemetry Auto-Rotation
    this.initAboutTvRotation();

    // Initialize Mobile Badge Auto-Rotation (one after another in the center)
    this.initAboutBadgeRotation();

    // Initialize Simultaneous Typewriter Effect on 8 Token Pillars
    this.initAboutTypewriter();
  }

  // --------------------------------------------------------------------------
  // ABOUT TV TELEMETRY & VIEW SWITCHER METHODS
  // --------------------------------------------------------------------------

  initAboutBadgeRotation() {
    if (this._aboutBadgeTimer) {
      clearInterval(this._aboutBadgeTimer);
      this._aboutBadgeTimer = null;
    }
    const badges = [
      `<span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); display: inline-flex; align-items: center; gap: 0.45rem;"><span class="pulse-dot"></span> BNB Smart Chain Mainnet</span>`,
      `<span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); display: inline-flex; align-items: center; gap: 0.45rem;"><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg> BEP-20 Standard</span>`,
      `<span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3); display: inline-flex; align-items: center; gap: 0.45rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> 0% Buy / 0% Sell Tax</span>`
    ];

    let bIdx = 0;
    const slot = document.getElementById('aboutMobileBadgeSlot');
    if (!slot) return;

    this._aboutBadgeTimer = setInterval(() => {
      bIdx = (bIdx + 1) % badges.length;
      slot.style.opacity = '0';
      slot.style.transform = 'scale(0.92)';
      setTimeout(() => {
        slot.innerHTML = badges[bIdx];
        slot.style.opacity = '1';
        slot.style.transform = 'scale(1)';
      }, 250);
    }, 2000); // 2 seconds per badge
  }

  initAboutTypewriter() {
    if (this._aboutTypewriterTimer) {
      clearInterval(this._aboutTypewriterTimer);
      this._aboutTypewriterTimer = null;
    }

    const grid = document.getElementById('tokenPillarsGrid');
    if (!grid) return;

    const targets = Array.from(grid.querySelectorAll('.token-pillar-card .typewriter-text'));
    if (!targets.length) return;

    // Cache the original target text for each element
    const items = targets.map(el => {
      const text = el.textContent.trim();
      el.innerHTML = '<span class="typewriter-cursor">|</span>';
      return { el, text, len: text.length };
    });

    const maxLen = Math.max(...items.map(it => it.len));
    let charIdx = 0;

    const startTyping = () => {
      if (this._aboutTypewriterTimer) return;
      this._aboutTypewriterTimer = setInterval(() => {
        charIdx++;
        let allDone = true;

        items.forEach(item => {
          if (charIdx <= item.len) {
            allDone = false;
            const currentSub = item.text.substring(0, charIdx);
            item.el.innerHTML = currentSub.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '<span class="typewriter-cursor">|</span>';
          } else {
            // Finished typing this item
            item.el.innerHTML = item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
        });

        if (charIdx >= maxLen || allDone) {
          clearInterval(this._aboutTypewriterTimer);
          this._aboutTypewriterTimer = null;
          items.forEach(item => {
            item.el.innerHTML = item.text;
          });
        }
      }, 20); // 20ms per character for silky smooth, synchronized simultaneous typing
    };

    // Use IntersectionObserver or start immediately if visible
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            startTyping();
            observer.disconnect();
          }
        });
      }, { threshold: 0.15 });
      observer.observe(grid);
    } else {
      startTyping();
    }
  }

  initAboutTvRotation() {
    if (this._aboutTvTimer) {
      clearInterval(this._aboutTvTimer);
    }
    this._aboutTvCurrentIndex = 0;
    this._aboutTvTimer = setInterval(() => {
      this.nextTvStatSlide();
    }, 2000); // 2 seconds per slide
  }

  setTvStatSlide(idx) {
    const slides = [
      {
        num: '1,000,000,000',
        color: 'var(--brand-yellow)',
        label: 'Fixed Total Supply',
        desc: 'Strictly capped BEP-20 supply natively minted on BNB Smart Chain with zero inflation risk.'
      },
      {
        num: '0% / 0%',
        color: 'var(--accent-emerald)',
        label: 'Tax Structure',
        desc: 'Zero buy and zero sell transaction taxes for frictionless decentralized trading and micro-transactions.'
      },
      {
        num: 'Up to 3.5x',
        color: 'var(--accent-purple)',
        label: 'Vault Multiplier',
        desc: 'Dynamic multiplier algorithm boosting daily check-in and bounty earnings for staking $BOOBA and LP tokens.'
      },
      {
        num: 'BIP-39 Non-Custodial',
        color: 'var(--accent-cyan)',
        label: 'Security Standard',
        desc: 'True client-side 12-word cryptographic seed key generation. Full sovereign ownership from day one.'
      }
    ];

    const targetIdx = (idx + slides.length) % slides.length;
    this._aboutTvCurrentIndex = targetIdx;
    const slide = slides[targetIdx];

    const frame = document.getElementById('tvStatFrame');
    const chNum = document.getElementById('tvChannelNum');
    const numEl = document.getElementById('tvStatNumber');
    const labelEl = document.getElementById('tvStatLabel');
    const descEl = document.getElementById('tvStatDesc');

    if (frame && numEl && labelEl && descEl) {
      frame.style.opacity = '0';
      frame.style.transform = 'translateY(6px)';
      
      setTimeout(() => {
        if (chNum) chNum.textContent = String(targetIdx + 1);
        const chNumMob = document.getElementById('tvChannelNumMob');
        if (chNumMob) chNumMob.textContent = String(targetIdx + 1);
        numEl.textContent = slide.num;
        numEl.style.color = slide.color;
        labelEl.textContent = slide.label;
        descEl.textContent = slide.desc;
        
        frame.style.opacity = '1';
        frame.style.transform = 'translateY(0)';
      }, 150);
    }

    // Update Dots
    const dots = document.querySelectorAll('.tv-channel-dot');
    dots.forEach((d, i) => {
      if (i === targetIdx) d.classList.add('active');
      else d.classList.remove('active');
    });
  }

  nextTvStatSlide() {
    const cur = typeof this._aboutTvCurrentIndex === 'number' ? this._aboutTvCurrentIndex : 0;
    this.setTvStatSlide(cur + 1);
  }

  prevTvStatSlide() {
    const cur = typeof this._aboutTvCurrentIndex === 'number' ? this._aboutTvCurrentIndex : 0;
    this.setTvStatSlide(cur - 1);
  }

  switchTokenomicsView(mode) {
    const vPie = document.getElementById('viewPie3D');
    const vColumn = document.getElementById('viewColumn3D');
    const vLine = document.getElementById('viewLine3D');

    const tabPie = document.getElementById('repTabPie');
    const tabColumn = document.getElementById('repTabColumn');
    const tabLine = document.getElementById('repTabLine');

    const views = [vPie, vColumn, vLine];
    const tabs = [tabPie, tabColumn, tabLine];

    views.forEach(v => { if (v) v.style.display = 'none'; });
    tabs.forEach(t => { if (t) t.classList.remove('active'); });

    if (mode === 'column3d' && vColumn) {
      vColumn.style.display = 'block';
      if (tabColumn) tabColumn.classList.add('active');
    } else if (mode === 'line3d' && vLine) {
      vLine.style.display = 'block';
      if (tabLine) tabLine.classList.add('active');
    } else {
      if (vPie) vPie.style.display = 'block';
      if (tabPie) tabPie.classList.add('active');
    }
  }

  updateAboutStakingCalc(amount) {
    const val = Number(amount);
    const amountDisp = document.getElementById('stakingCalcAmountDisplay');
    const multDisp = document.getElementById('calcMultiplierOutput');
    const yieldDisp = document.getElementById('calcDailyYieldOutput');
    const tierDisp = document.getElementById('calcTierOutput');

    if (amountDisp) amountDisp.textContent = `${Number(val).toLocaleString()} $BOOBA`;

    // Multiplier curve: 1.0x at 0 to 3.5x at 50k
    const mult = Math.min(3.5, 1.0 + (val / 50000) * 2.5).toFixed(2);
    if (multDisp) multDisp.textContent = `${mult}x Boost`;

    // Daily points estimate
    const dailyPts = Math.round(50 * Number(mult));
    if (yieldDisp) yieldDisp.textContent = `+${dailyPts} BOOBA / day`;

    // Tier projection
    let tierName = 'Lv.1 Explorer';
    if (val >= 40000) tierName = 'Lv.10 Booba Master';
    else if (val >= 30000) tierName = 'Lv.9 Warlord';
    else if (val >= 20000) tierName = 'Lv.8 Commander';
    else if (val >= 15000) tierName = 'Lv.7 Veteran';
    else if (val >= 10000) tierName = 'Lv.6 Champion';
    else if (val >= 5000) tierName = 'Lv.5 Guardian';
    else if (val >= 2000) tierName = 'Lv.3 Pioneer';
    else if (val >= 500) tierName = 'Lv.2 Pathfinder';

    if (tierDisp) tierDisp.textContent = tierName;
  }

  toggleAboutFaq(idx) {
    const card = document.getElementById(`faqItem${idx}`);
    if (!card) return;
    const isOpen = card.classList.contains('open');
    document.querySelectorAll('.faq-item-card').forEach(c => {
      c.classList.remove('open');
      const ans = c.querySelector('.faq-answer-panel');
      if (ans) ans.style.display = 'none';
    });

    if (!isOpen) {
      card.classList.add('open');
      const ans = card.querySelector('.faq-answer-panel');
      if (ans) ans.style.display = 'block';
    }
  }

  copyContractAddress() {
    const addr = document.getElementById('tokenContractAddr')?.textContent || '0x712B00BA99E74f8812cCdA15D5881a7a1c92F3a1';
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(addr).then(() => {
        const btnText = document.getElementById('copyContractBtnText');
        if (btnText) {
          const original = btnText.textContent;
          btnText.textContent = 'Copied!';
          setTimeout(() => { btnText.textContent = original; }, 2000);
        }
      }).catch(() => {
        alert(`Contract Address: ${addr}`);
      });
    } else {
      prompt('Copy BOOBA BEP-20 Contract Address:', addr);
    }
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
          <div class="card text-center" style="max-width: 540px; margin: 4rem auto; padding: 3.5rem 2.5rem; background: rgba(14, 18, 27, 0.85); backdrop-filter: blur(20px); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px; box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(243, 186, 47, 0.15);">
            <div style="position: relative; width: 88px; height: 88px; margin: 0 auto 1.5rem auto;">
              <img src="assets/mascot.jpg" style="width: 88px; height: 88px; border-radius: 50%; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 25px var(--brand-yellow-glow); object-fit: cover;">
            </div>
            <h2 style="font-size: 1.8rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Access Your Dashboard</h2>
            <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">
              Sign in with your secret credentials or mint your cryptographic Booba Passport on BNB Smart Chain to view your stats.
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
              <a href="signin.html#signin" class="btn btn-primary btn-block btn-lg">Sign In to Account</a>
              <a href="signin.html#signup" class="btn btn-secondary btn-block">Mint New Passport (+100 BOOBA)</a>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const levelInfo = calculateLevel(user.boobaPoints);
    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- USER PROFILE QUICK HERO BANNER -->
        <div class="dashboard-hero-card" style="background: linear-gradient(135deg, rgba(243, 186, 47, 0.12) 0%, rgba(14, 18, 27, 0.85) 60%, rgba(7, 9, 14, 0.95) 100%); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px; padding: 2.5rem; margin-bottom: 2rem; position: relative; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(243, 186, 47, 0.12);">
          
          <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.12; pointer-events: none;">
            <img src="assets/mascot.jpg" style="width: 260px; height: 260px; border-radius: 50%;">
          </div>

          <div class="dashboard-hero-content" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; position: relative; z-index: 1;">
            <div class="dashboard-user-info" style="display: flex; align-items: center; gap: 1.5rem;">
              <div style="position: relative; flex-shrink: 0;">
                <img src="${user.avatar || 'assets/mascot.jpg'}" class="dashboard-user-avatar" style="width: 84px; height: 84px; border-radius: 20px; border: 2.5px solid var(--brand-yellow); object-fit: cover; box-shadow: 0 0 25px var(--brand-yellow-glow);">
                <div style="position: absolute; bottom: -4px; right: -4px; background: var(--brand-yellow); color: #000; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.45rem; border-radius: 999px; border: 2px solid #000;">
                  Lv.${levelInfo.level}
                </div>
              </div>
              <div class="dashboard-user-meta">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                  <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800; font-size: 0.78rem;">
                    Lv.${levelInfo.level} ${levelInfo.title}
                  </span>
                  ${user.role === 'admin' ? '<a href="teamadmin.html" class="badge-tag" style="background: rgba(243, 186, 47, 0.2); color: var(--brand-yellow); border-color: var(--brand-yellow); font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Admin Access</a>' : ''}
                </div>

                <div class="dashboard-user-subdetails" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.4rem; display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
                  <span>Passport: <strong class="text-mono" style="color: var(--brand-yellow);">${user.passportId}</strong></span>
                  <span>•</span>
                  <span>Ref: <strong class="text-mono" style="color: var(--text-primary);">${user.referralCode}</strong></span>
                  <span>•</span>
                  <span style="color: var(--accent-emerald); font-weight: 600; display: flex; align-items: center; gap: 0.35rem;">
                    <span class="pulse-dot" style="width: 6px; height: 6px;"></span> Non-Custodial BIP-39 Active
                  </span>
                </div>
              </div>
            </div>

            <!-- Quick Action Buttons -->
            <div class="dashboard-action-wrapper" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
              <button class="btn ${isWalletConnected ? 'btn-outline' : 'btn-primary'} btn-lg" onclick="window.boobaApp.openWalletModal()" style="display: inline-flex; align-items: center; gap: 0.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
                <span>${isWalletConnected ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Connect Wallet'}</span>
              </button>

              <a href="withdraw.html" class="btn btn-secondary btn-lg" style="display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                <span>Withdraw $BOOBA</span>
              </a>
            </div>

          </div>

          <!-- Level Progression Bar -->
          <div class="dashboard-progress-wrap" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.6rem; color: var(--text-secondary);">
              <span>Next Milestone: <strong style="color: #FFFFFF;">${levelInfo.nextTier ? levelInfo.nextTier.title : 'MAX LEVEL'}</strong></span>
              <span><strong style="color: var(--brand-yellow);">${Number(user.boobaPoints).toLocaleString()}</strong> / ${levelInfo.nextTier ? levelInfo.nextTier.min.toLocaleString() : 'MAX'} $BOOBA (${levelInfo.progressPercent}%)</span>
            </div>
            <div style="width: 100%; height: 10px; background: rgba(255, 255, 255, 0.06); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="height: 100%; width: ${levelInfo.progressPercent}%; background: linear-gradient(90deg, var(--brand-yellow-light) 0%, var(--brand-yellow) 100%); border-radius: 999px; box-shadow: 0 0 15px var(--brand-yellow-glow);"></div>
            </div>
          </div>
        </div>

        <!-- 4 BENTO STATS METRICS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Token Balance</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--brand-yellow);"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--brand-yellow); line-height: 1.1;" data-counter-target="${user.boobaPoints}">
              ${Number(user.boobaPoints).toLocaleString()}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
              <div style="font-size: 0.78rem; color: var(--accent-emerald); font-weight: 600; display: flex; align-items: center; gap: 0.3rem;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Verified
              </div>
              <a href="withdraw.html" style="font-size: 0.8rem; color: var(--brand-yellow); font-weight: 800; text-decoration: none;">Withdraw →</a>
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Daily Streak</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-orange);"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--accent-orange); line-height: 1.1;">
              ${Number(user.streakDays || 1)} Days
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem;">
              Boost multiplier active (1.5x)
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Completed Quests</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--brand-yellow);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary); line-height: 1.1;">
              ${Number(user.completedQuestsCount || 0)}
            </div>
            <div style="font-size: 0.78rem; color: var(--brand-yellow); margin-top: 0.4rem;">
              <a href="quests.html" style="color: var(--brand-yellow); font-weight: 600;">Earn more bounties →</a>
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Reputation Trust</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-emerald);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--accent-emerald); line-height: 1.1;">
              ${Number(user.reputation || 75)}/100
            </div>
            <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem;">
              Verified Human Identity
            </div>
          </div>

        </div>

        <!-- 3 ACTION HUBS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 2.25rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="bento-icon-badge" style="margin-bottom: 1.25rem;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
              </div>
              <h3 style="font-size: 1.3rem; margin-bottom: 0.6rem; color: #FFFFFF;">Digital Booba Passport</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                View your 3D interactive metal identity card, holographic security chip, and progress through the 10 VIP rank tiers.
              </p>
            </div>
            <a href="passport.html" class="btn btn-secondary btn-block">Open My Passport →</a>
          </div>

          <div class="card card-hover" style="padding: 2.25rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="bento-icon-badge" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); margin-bottom: 1.25rem;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </div>
              <h3 style="font-size: 1.3rem; margin-bottom: 0.6rem; color: #FFFFFF;">Quests & Rewards Vault</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                Complete daily check-ins, social tasks, and bounties to earn instant token rewards and unlock airdrop multipliers.
              </p>
            </div>
            <a href="quests.html" class="btn btn-primary btn-block">Explore Quests & Rewards →</a>
          </div>

          <div class="card card-hover" style="padding: 2.25rem; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="bento-icon-badge" style="background: rgba(255, 122, 0, 0.12); color: var(--accent-orange); border-color: rgba(255, 122, 0, 0.3); margin-bottom: 1.25rem;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </div>
              <h3 style="font-size: 1.3rem; margin-bottom: 0.6rem; color: #FFFFFF;">Referrals</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                Invite other crypto community members with your unique referral code <strong class="text-mono" style="color: var(--brand-yellow);">${user.referralCode}</strong> to earn +300 $BOOBA per invite.
              </p>
            </div>
            <a href="referrals.html" class="btn btn-secondary btn-block">Referral Center →</a>
          </div>

        </div>

        <!-- CRYPTOGRAPHIC SECURITY CENTER -->
        ${user.seedPhrase ? `
          <div class="card" style="padding: 2rem; background: rgba(14, 18, 27, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(243, 186, 47, 0.1); border: 1px solid rgba(243, 186, 47, 0.3); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <div>
                <h4 style="color: #FFFFFF; font-size: 1.1rem; margin-bottom: 0.25rem;">12-Word Non-Custodial Recovery Key</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Your master recovery phrase is stored locally and securely. Never share these words with anyone.</p>
              </div>
            </div>
            <div>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.boobaApp.showSeedPhraseModal(db.currentUser.seedPhrase, db.currentUser)">
                Backup & View Phrase
              </button>
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 2B. WITHDRAWAL BRIDGE VIEW (withdraw.html)
  // --------------------------------------------------------------------------

  renderWithdrawalView(container) {
    const user = db.currentUser;

    if (!user) {
      container.innerHTML = `
        <div class="container page-content">
          <div class="card text-center" style="max-width: 500px; margin: 4rem auto; padding: 3.5rem 2.5rem; background: rgba(14, 18, 27, 0.85); backdrop-filter: blur(20px); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px;">
            <div style="position: relative; width: 80px; height: 80px; margin: 0 auto 1.5rem auto;">
              <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 25px var(--brand-yellow-glow); object-fit: cover;">
            </div>
            <h2 style="font-size: 1.8rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Access Token Withdrawal</h2>
            <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">
              Sign in with your credentials or connect your Web3 wallet to manage $BOOBA withdrawals to BNB Smart Chain.
            </p>
            <a href="signin.html#signin" class="btn btn-primary btn-block btn-lg">Sign In to Account</a>
          </div>
        </div>
      `;
      return;
    }

    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- Back Navigation -->
        <div style="margin-bottom: 2rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>
        </div>

        <!-- HERO HEADER -->
        <div class="card" style="background: linear-gradient(135deg, rgba(243, 186, 47, 0.12) 0%, rgba(14, 18, 27, 0.9) 60%, rgba(7, 9, 14, 0.98) 100%); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px; padding: 2.5rem; margin-bottom: 2.5rem; position: relative; overflow: hidden;">
          <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.1; pointer-events: none;">
            <img src="assets/mascot.jpg" style="width: 240px; height: 240px; border-radius: 50%;">
          </div>
          <div style="position: relative; z-index: 1; max-width: 700px;">
            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
              <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-weight: 800; font-size: 0.8rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px;"></span> BEP-20 TOKEN BRIDGE
              </span>
              <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.4); font-weight: 800; font-size: 0.8rem;">
                BNB SMART CHAIN MAINNET
              </span>
            </div>
            <h1 style="font-size: clamp(1.8rem, 3.5vw, 2.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin-bottom: 0.75rem;">
              $BOOBA Token Withdrawal Bridge
            </h1>
            <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; margin: 0;">
              Transfer your earned $BOOBA tokens, daily check-in rewards, and bounty distributions directly to your self-custody Web3 wallet.
            </p>
          </div>
        </div>

        <!-- 2-COLUMN MAIN WITHDRAWAL INTERFACE -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
          
          <!-- Column 1: Withdrawal Form Terminal -->
          <div class="card" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(20px);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin: 0;">Withdrawal Terminal</h3>
              <span style="font-size: 0.75rem; color: var(--accent-emerald); font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px;"></span> 0% Fee Tier
              </span>
            </div>

            <!-- Balance Display -->
            <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(243, 186, 47, 0.25); border-radius: 18px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.25rem;">Available $BOOBA Balance</div>
              <div style="font-size: 2.2rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); line-height: 1.1;">
                ${Number(user.boobaPoints).toLocaleString()} <span style="font-size: 1.1rem;">$BOOBA</span>
              </div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.4rem;">
                100% Non-Custodial Snapshot Verified
              </div>
            </div>

            <!-- Destination Web3 Wallet Selection -->
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <label class="form-label" style="margin: 0;">Destination Web3 Wallet Address</label>
                <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openWalletModal()" style="font-size: 0.75rem; color: var(--brand-yellow); padding: 0.15rem 0.5rem;">
                  ${isWalletConnected ? 'Switch Wallet' : 'Connect Wallet'}
                </button>
              </div>
              <div style="position: relative;">
                <input type="text" id="withdrawWalletInput" class="form-input text-mono" value="${isWalletConnected ? user.walletAddress : ''}" placeholder="0x... Connect BEP-20 Wallet" style="padding-left: 2.5rem;" ${isWalletConnected ? 'readonly' : ''}>
                <div style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: ${isWalletConnected ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
                </div>
              </div>
            </div>

            <!-- Network Selection -->
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label class="form-label">Transfer Network</label>
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.15rem; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px;">
                <div style="display: flex; align-items: center; gap: 0.65rem;">
                  <div style="width: 26px; height: 26px; border-radius: 50%; background: #F3BA2F; color: #000; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.72rem;">
                    BNB
                  </div>
                  <div>
                    <div style="font-weight: 800; color: #FFFFFF; font-size: 0.9rem;">BNB Smart Chain (BEP-20)</div>
                    <div style="font-size: 0.74rem; color: var(--text-muted);">Mainnet Chain ID: 56 (0x38)</div>
                  </div>
                </div>
                <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); font-size: 0.68rem; padding: 0.15rem 0.45rem;">Fast (3s)</span>
              </div>
            </div>

            <!-- Amount Input with Percentage Quick Buttons -->
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <label class="form-label" style="margin: 0;">Amount to Withdraw</label>
                <div style="display: flex; gap: 0.35rem;">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.floor(${user.boobaPoints} * 0.25)" style="font-size: 0.7rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.05);">25%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.floor(${user.boobaPoints} * 0.50)" style="font-size: 0.7rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.05);">50%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.floor(${user.boobaPoints} * 0.75)" style="font-size: 0.7rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.05);">75%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = ${user.boobaPoints}" style="font-size: 0.7rem; padding: 0.15rem 0.45rem; background: rgba(243,186,47,0.15); color: var(--brand-yellow); font-weight: 800;">MAX</button>
                </div>
              </div>
              <input type="number" id="withdrawAmountInput" class="form-input text-mono" placeholder="0" min="1" max="${user.boobaPoints}" value="${user.boobaPoints}">
            </div>

            <!-- Bridge Fee & Net Receive Info -->
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 0.85rem 1.15rem; margin-bottom: 1.75rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.4rem;">
                <span style="color: var(--text-secondary);">Platform Fee:</span>
                <span style="color: var(--accent-emerald); font-weight: 700;">0% (Free)</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.4rem;">
                <span style="color: var(--text-secondary);">Estimated Gas:</span>
                <span style="color: #FFFFFF; font-family: var(--font-mono);">0.0005 BNB (~$0.15)</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; font-weight: 800; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.06);">
                <span style="color: #FFFFFF;">You Will Receive:</span>
                <span style="color: var(--brand-yellow); font-family: var(--font-mono);">1:1 $BOOBA On-Chain</span>
              </div>
            </div>

            <!-- Action Button -->
            <button type="button" class="btn btn-primary btn-lg btn-block" onclick="window.boobaApp.showTgeWithdrawModal()" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 900;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Submit Withdrawal Request</span>
            </button>
          </div>

          <!-- Column 2: Smart Contract Protocol Notice & Roadmap Box -->
          <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            
            <div class="card" style="padding: 2.25rem; border-radius: 24px; background: linear-gradient(180deg, rgba(243, 186, 47, 0.08) 0%, rgba(14, 18, 27, 0.85) 100%); border: 1.5px solid rgba(243, 186, 47, 0.35);">
              <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1rem;">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(243, 186, 47, 0.2); border: 1px solid rgba(243, 186, 47, 0.4); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <div>
                  <h4 style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin: 0;">Mainnet TGE Bridge Protocol</h4>
                  <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Smart Contract Timelock Active</div>
                </div>
              </div>

              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                In accordance with BNB Smart Chain decentralized fair-launch protocols, direct on-chain liquidity withdrawals will open concurrently with the official <strong>$BOOBA Token Generation Event (TGE)</strong> and PancakeSwap liquidity lock.
              </p>

              <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem; margin-bottom: 1.5rem;">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 0.85rem;">TGE Deployment Phasing</div>
                
                <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                  <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
                    <span style="width: 20px; height: 20px; border-radius: 50%; background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 900; flex-shrink: 0; margin-top: 0.1rem;">✓</span>
                    <div>
                      <div style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF;">Phase 1: Proof-of-Engagement Distribution</div>
                      <div style="font-size: 0.76rem; color: var(--text-secondary);">400M $BOOBA pool allocated to early bounties and daily streaks. [ACTIVE]</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
                    <span style="width: 20px; height: 20px; border-radius: 50%; background: rgba(243, 186, 47, 0.2); color: var(--brand-yellow); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 900; flex-shrink: 0; margin-top: 0.1rem;">●</span>
                    <div>
                      <div style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF;">Phase 2: Timelock & Security Audit Verification</div>
                      <div style="font-size: 0.76rem; color: var(--text-secondary);">24-month DEX liquidity lock contract certification. [IN PROGRESS]</div>
                    </div>
                  </div>

                  <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
                    <span style="width: 20px; height: 20px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: var(--text-muted); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 900; flex-shrink: 0; margin-top: 0.1rem;">3</span>
                    <div>
                      <div style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF;">Phase 3: Official TGE & Live DEX Bridge</div>
                      <div style="font-size: 0.76rem; color: var(--text-secondary);">Instant 1:1 token minting unlocked for all connected BEP-20 wallets. [UPCOMING]</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 0.65rem; font-size: 0.8rem; color: var(--accent-emerald);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Your accumulated balance is 100% snapshot-protected.</span>
              </div>
            </div>

            <!-- Quick Access Bento -->
            <div class="card" style="padding: 1.75rem; border-radius: 20px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h4 style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.25rem;">Need to update your wallet?</h4>
                <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0;">Manage your connected Web3 address in Account Settings.</p>
              </div>
              <a href="settings.html" class="btn btn-outline btn-sm">Settings →</a>
            </div>

          </div>

        </div>

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 2C. ACCOUNT, SECURITY & WEB3 SETTINGS VIEW (settings.html)
  // --------------------------------------------------------------------------

  renderSettingsView(container) {
    const user = db.currentUser;

    if (!user) {
      container.innerHTML = `
        <div class="container page-content">
          <div class="card text-center" style="max-width: 500px; margin: 4rem auto; padding: 3.5rem 2.5rem; background: rgba(14, 18, 27, 0.85); backdrop-filter: blur(20px); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px;">
            <div style="position: relative; width: 80px; height: 80px; margin: 0 auto 1.5rem auto;">
              <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 25px var(--brand-yellow-glow); object-fit: cover;">
            </div>
            <h2 style="font-size: 1.8rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.75rem;">Account Settings</h2>
            <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">
              Sign in to manage your profile details, connected Web3 wallets, and non-custodial cryptographic keys.
            </p>
            <a href="signin.html#signin" class="btn btn-primary btn-block btn-lg">Sign In to Account</a>
          </div>
        </div>
      `;
      return;
    }

    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const currentAvatar = user.avatar || 'assets/mascot.jpg';

    container.innerHTML = `
      <div class="container page-content" style="max-width: 1060px;">
        
        <!-- PAGE HEADER -->
        <div style="margin-bottom: 2.25rem; text-align: center;">
          <h1 style="font-size: clamp(2rem, 3.5vw, 2.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin-bottom: 0.5rem;">
            Account & Security Settings
          </h1>
          <p style="color: var(--text-secondary); font-size: 0.95rem; margin: 0 auto; max-width: 600px;">
            Update your public profile handle, connect your self-custody Web3 wallet, and secure your password.
          </p>
        </div>

        <!-- 2 CLEAN SETTINGS CARDS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
          
          <!-- CARD 1: PROFILE & WALLET -->
          <div class="card" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.1);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(243, 186, 47, 0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin: 0;">Profile & Wallet</h3>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Public identity and BEP-20 address</div>
              </div>
            </div>

            <form id="settingsProfileForm" onsubmit="window.boobaApp.handleSaveProfileSettings(event)">
              
              <!-- Avatar Preview & Selection -->
              <div style="margin-bottom: 1.25rem; display: flex; align-items: center; gap: 1.25rem;">
                <img id="settingsAvatarPreview" src="${currentAvatar}" style="width: 56px; height: 56px; border-radius: 16px; border: 2px solid var(--brand-yellow); object-fit: cover; box-shadow: 0 0 15px rgba(243, 186, 47, 0.4);">
                <div>
                  <div style="font-size: 0.85rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.25rem;">Mascot Avatar</div>
                  <div style="display: flex; gap: 0.35rem;">
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.handleAvatarSelect('assets/mascot.jpg')" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.05);">Classic</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.handleAvatarSelect('assets/chart-3d-rings.png')" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.05);">Gold 3D</button>
                  </div>
                </div>
              </div>

              <!-- Username Field -->
              <div class="form-group" style="margin-bottom: 1.15rem;">
                <label class="form-label" for="settingsUsernameInput">Username</label>
                <input type="text" id="settingsUsernameInput" class="form-input" value="${user.username}" placeholder="Enter new username" required>
                <div id="usernameFeedback" style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.3rem;">
                  Unique citizen username.
                </div>
              </div>

              <!-- Gmail / Email Field -->
              <div class="form-group" style="margin-bottom: 1.25rem;">
                <label class="form-label" for="settingsEmailInput">Email / Gmail Address</label>
                <input type="email" id="settingsEmailInput" class="form-input" value="${user.email}" placeholder="yourname@gmail.com" required>
              </div>

              <!-- Web3 Wallet Connection -->
              <div class="form-group" style="margin-bottom: 1.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                  <label class="form-label" style="margin: 0;">Connected Web3 Wallet</label>
                  <span style="font-size: 0.72rem; color: ${isWalletConnected ? 'var(--accent-emerald)' : 'var(--text-muted)'}; font-weight: 700;">
                    ${isWalletConnected ? '● Connected' : '○ Not Connected'}
                  </span>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <input type="text" class="form-input text-mono" value="${isWalletConnected ? user.walletAddress : ''}" placeholder="No wallet connected" readonly style="font-size: 0.82rem; background: rgba(0,0,0,0.3);">
                  <button type="button" class="btn ${isWalletConnected ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="window.boobaApp.openWalletModal()" style="white-space: nowrap;">
                    ${isWalletConnected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              </div>

              <button type="submit" id="saveProfileBtn" class="btn btn-primary btn-block">
                Save Profile Changes
              </button>
            </form>
          </div>

          <!-- CARD 2: PASSWORD & SECURITY -->
          <div class="card" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(243, 186, 47, 0.35);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(243, 186, 47, 0.15); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin: 0;">Change Password</h3>
                <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">12-Word Seed Verification Required</div>
              </div>
            </div>

            <form id="settingsPasswordForm" onsubmit="window.boobaApp.handleChangePasswordSettings(event)">
              
              <!-- 12-Word Seed Phrase Input -->
              <div class="form-group" style="margin-bottom: 1.15rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                  <label class="form-label" for="settingsSeedInput" style="margin: 0;">12-Word Seed Phrase</label>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.showSeedPhraseModal(db.currentUser.seedPhrase, db.currentUser)" style="font-size: 0.7rem; padding: 0; color: var(--brand-yellow);">View My Phrase</button>
                </div>
                <textarea id="settingsSeedInput" class="form-input text-mono" rows="2" placeholder="word1 word2 word3 ... word12" style="font-size: 0.82rem; resize: none;" required></textarea>
              </div>

              <!-- New Password -->
              <div class="form-group" style="margin-bottom: 1.15rem;">
                <label class="form-label" for="settingsNewPassInput">New Password</label>
                <input type="password" id="settingsNewPassInput" class="form-input" placeholder="Min 6 characters" required autocomplete="new-password">
              </div>

              <!-- Confirm New Password -->
              <div class="form-group" style="margin-bottom: 1.75rem;">
                <label class="form-label" for="settingsConfirmPassInput">Confirm New Password</label>
                <input type="password" id="settingsConfirmPassInput" class="form-input" placeholder="Re-enter new password" required autocomplete="new-password">
              </div>

              <button type="submit" id="savePasswordBtn" class="btn btn-primary btn-block">
                Verify Seed & Update Password
              </button>
            </form>
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
          <div class="card text-center passport-mint-card" style="max-width: 500px; margin: 3rem auto; padding: 3.5rem 2.5rem; border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px;">
            <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 1.5rem auto; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 25px var(--brand-yellow-glow);">
            <h2 style="font-size: 1.75rem; color: #FFFFFF; font-weight: 800;">Mint Your Official Booba Passport</h2>
            <p style="color: var(--text-secondary); margin: 0.75rem 0 2rem 0; font-size: 0.95rem; line-height: 1.6;">
              Generate your unique on-chain digital identity on BNB Smart Chain and claim your initial +100 $BOOBA welcome bounty.
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

    const TIERS_CONFIG = [
      {
        level: 1,
        title: 'Booba Baby',
        min: 0,
        unlock: 'Basic Booba Passport & Community Access',
        themeClass: 'card-theme-lv1',
        accentColor: '#CD7F32',
        tierBadge: 'Genesis Member',
        material: 'Bronze Brushed Titanium'
      },
      {
        level: 2,
        title: 'Booba Rookie',
        min: 500,
        unlock: 'Custom Passport Badge & Daily Streak Bonus',
        themeClass: 'card-theme-lv2',
        accentColor: '#10B981',
        tierBadge: 'Certified Rookie',
        material: 'Cyber Emerald Matrix'
      },
      {
        level: 3,
        title: 'Booba Starter',
        min: 1500,
        unlock: 'Special Profile Badge & Discord Role',
        themeClass: 'card-theme-lv3',
        accentColor: '#3B82F6',
        tierBadge: 'Active Starter',
        material: 'Royal Sapphire Cobalt'
      },
      {
        level: 4,
        title: 'Booba Hustler',
        min: 3000,
        unlock: 'Multiplier on Creative Quest Rewards (+10%)',
        themeClass: 'card-theme-lv4',
        accentColor: '#F59E0B',
        tierBadge: '1.1x Multiplier',
        material: 'Neon Amber Cyberpunk'
      },
      {
        level: 5,
        title: 'Booba Grinder',
        min: 5000,
        unlock: 'Exclusive Community Alpha Channel Access',
        themeClass: 'card-theme-lv5',
        accentColor: '#A855F7',
        tierBadge: 'Alpha Syndicate',
        material: 'Obsidian Violet Nebula'
      },
      {
        level: 6,
        title: 'Booba Warrior',
        min: 10000,
        unlock: 'Early Access to BOOBA Airdrop Allocation',
        themeClass: 'card-theme-lv6',
        accentColor: '#F43F5E',
        tierBadge: 'Airdrop Priority',
        material: 'Crimson Ruby Titanium'
      },
      {
        level: 7,
        title: 'Booba Elite',
        min: 25000,
        unlock: 'VIP Pass to Virtual AMAs & Special Merch Drops',
        themeClass: 'card-theme-lv7',
        accentColor: '#E2E8F0',
        tierBadge: 'VIP AMA Pass',
        material: 'Frosted Platinum Mirror'
      },
      {
        level: 8,
        title: 'Booba Legend',
        min: 50000,
        unlock: 'Exclusive Governance Voting Rights',
        themeClass: 'card-theme-lv8',
        accentColor: '#F3BA2F',
        tierBadge: 'Governance Senator',
        material: '24K Imperial Gold'
      },
      {
        level: 9,
        title: 'Booba OG',
        min: 100000,
        unlock: 'BNB Baby Treasury Allocation Perks',
        themeClass: 'card-theme-lv9',
        accentColor: '#C084FC',
        tierBadge: 'Treasury Royalty',
        material: 'Prismatic Liquid Chrome'
      },
      {
        level: 10,
        title: 'Booba Master',
        min: 250000,
        unlock: 'Ambassador Status & Direct Team Advisory',
        themeClass: 'card-theme-lv10',
        accentColor: '#FFD700',
        tierBadge: 'Grandmaster Council',
        material: 'Celestial Quantum Void & Gold'
      }
    ];

    container.innerHTML = `
      <div class="container page-content">
        <!-- Back to Dashboard Navigation -->
        <div style="margin-bottom: 2rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>
        </div>

        <!-- Apple Vision Pro Style Interactive Passport Carousel -->
        <div class="passport-carousel-wrapper">
          
          <!-- Level Selection Quick Navigation Tabs -->
          <div class="passport-tier-nav" id="passportTierNav">
            ${TIERS_CONFIG.map((t, idx) => {
              const isUnlocked = user.boobaPoints >= t.min;
              const isCurrent = levelInfo.level === t.level;
              return `
                <button type="button" class="passport-tier-pill ${isCurrent ? 'active' : ''}" id="tierPill-${t.level}" onclick="window.boobaApp.selectPassportTier(${t.level})">
                  <span>Lv.${t.level}</span>
                  <span style="font-weight: 400; opacity: 0.85;">${t.title}</span>
                  ${isUnlocked ? `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="color: var(--accent-emerald);"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  ` : `
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  `}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Carousel Viewport & Slides -->
          <div class="passport-carousel-viewport">
            
            <!-- Left & Right Floating Navigation Controls -->
            <button type="button" class="carousel-nav-btn prev-btn" onclick="window.boobaApp.scrollPassportCarousel(-1)" aria-label="Previous Level Card">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            <button type="button" class="carousel-nav-btn next-btn" onclick="window.boobaApp.scrollPassportCarousel(1)" aria-label="Next Level Card">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            <div class="passport-carousel-track" id="passportCarouselTrack">
              ${TIERS_CONFIG.map((t) => {
                const isUnlocked = user.boobaPoints >= t.min;
                const isCurrent = levelInfo.level === t.level;

                return `
                  <div class="passport-slide" id="passportSlide-${t.level}" data-level="${t.level}">
                    
                    <!-- 3D Interactive Flip Passport Card -->
                    <div class="passport-card-3d-wrapper" id="cardWrapper-${t.level}" onclick="window.boobaApp.togglePassportCardFlip(${t.level})">
                      <div class="passport-card-inner">
                        
                        <!-- CARD FRONT: Luxury Identity Card -->
                        <div class="passport-card-face passport-card-front ${t.themeClass}">
                          
                          <!-- Holographic Watermark -->
                          <div style="position: absolute; right: -25px; bottom: -25px; opacity: 0.09; pointer-events: none;">
                            <img src="assets/mascot.jpg" style="width: 260px; height: 260px; border-radius: 50%;">
                          </div>

                          <!-- Card Header Row -->
                          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: nowrap; margin-bottom: 1.25rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 0.85rem;">
                            <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0; flex: 1;">
                              <img src="assets/mascot.jpg" style="width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid ${t.accentColor}; flex-shrink: 0;">
                              <div style="min-width: 0;">
                                <div style="font-weight: 800; font-size: 0.95rem; letter-spacing: 0.05em; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">BOOBA PASSPORT</div>
                                <div style="font-size: 0.68rem; color: ${t.accentColor}; font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">BNB Smart Chain • ${t.material}</div>
                              </div>
                            </div>

                            <span class="badge-tag theme-badge" style="font-size: 0.76rem; padding: 0.35rem 0.85rem; font-weight: 800; white-space: nowrap; flex-shrink: 0;">
                              Lv.${t.level} ${t.title}
                            </span>
                          </div>

                          <!-- EMV Chip & Contactless Symbol -->
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                            <div class="crypto-emv-chip"></div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
                            </div>
                          </div>

                          <!-- Card User Identity Block -->
                          <div style="display: flex; gap: 1.25rem; align-items: center; margin-bottom: 1.25rem;">
                            <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 74px; height: 74px; border-radius: 16px; border: 2.5px solid ${t.accentColor}; object-fit: cover; box-shadow: 0 0 20px ${t.accentColor}40; flex-shrink: 0;">
                            <div style="min-width: 0; flex: 1;">
                              <div style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.username}</div>
                              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                Passport ID: <span class="text-mono" style="color: ${t.accentColor}; font-weight: 700;">${user.passportId}</span>
                              </div>
                              <div style="font-size: 0.74rem; margin-top: 0.3rem; font-weight: 700; display: flex; align-items: center; gap: 0.35rem; white-space: nowrap;">
                                ${isUnlocked ? `
                                  <span style="color: var(--accent-emerald); display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    Unlocked • ${isCurrent ? 'Active Tier' : 'Tier Unlocked'}
                                  </span>
                                ` : `
                                  <span style="color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.25rem;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    Locked (${t.min.toLocaleString()} BOOBA)
                                  </span>
                                `}
                              </div>
                            </div>
                          </div>

                          <!-- Card Footer Info & Flip Prompt -->
                          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.85rem; margin-top: auto; gap: 0.5rem; flex-wrap: nowrap;">
                            <div style="font-size: 0.74rem; color: var(--text-muted); white-space: nowrap;">
                              Issued: ${user.memberSince}
                            </div>
                            <div class="flip-hint-pill">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                              <span>Click to view criteria</span>
                            </div>
                          </div>

                        </div>

                        <!-- CARD BACK: Criteria & Unlocked Perks -->
                        <div class="passport-card-face passport-card-back ${t.themeClass}">
                          
                          <!-- Back Header -->
                          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: nowrap; margin-bottom: 1.25rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 0.85rem;">
                            <div style="min-width: 0; flex: 1;">
                              <div style="font-size: 0.7rem; color: ${t.accentColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">LEVEL ${t.level} CRITERIA</div>
                              <h3 style="font-size: 1.15rem; font-weight: 800; color: #FFFFFF; margin: 0.15rem 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.title}</h3>
                            </div>
                            <button type="button" class="flip-hint-pill" onclick="event.stopPropagation(); window.boobaApp.togglePassportCardFlip(${t.level})">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                              <span>Flip Front</span>
                            </button>
                          </div>

                          <!-- Criteria Breakdown Box -->
                          <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem; margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                              <span style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Required Points</span>
                              <strong style="font-size: 1.05rem; color: ${t.accentColor};" class="text-mono">${t.min.toLocaleString()}+ BOOBA</strong>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: center;">
                              <span style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Your Status</span>
                              ${isUnlocked ? `
                                <span style="color: var(--accent-emerald); font-size: 0.8rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.25rem;">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  Unlocked & Active
                                </span>
                              ` : `
                                <span style="color: var(--accent-orange); font-size: 0.8rem; font-weight: 700;">
                                  Need ${(t.min - user.boobaPoints).toLocaleString()} more BOOBA
                                </span>
                              `}
                            </div>
                          </div>

                          <!-- Unlocked Privilege Details -->
                          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 16px; padding: 1.15rem; margin-bottom: 1.25rem;">
                            <div style="font-size: 0.7rem; color: ${t.accentColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
                              Unlocked Privileges & Perks
                            </div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: #FFFFFF; line-height: 1.45;">
                              ${t.unlock}
                            </div>
                          </div>

                          <!-- Action Row inside Card Back -->
                          <div style="margin-top: auto;">
                            ${isUnlocked ? `
                              ${user.seedPhrase ? `
                                <button type="button" class="btn btn-outline btn-block btn-sm" onclick="event.stopPropagation(); window.boobaApp.showSeedPhraseModal(db.currentUser.seedPhrase, db.currentUser)" style="font-size: 0.82rem; border-color: rgba(255,255,255,0.25);">
                                  Backup 12-Word Master Key
                                </button>
                              ` : `
                                <div style="text-align: center; font-size: 0.8rem; color: var(--accent-emerald); font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  <span>Tier Requirements Verified</span>
                                </div>
                              `}
                            ` : `
                              <a href="quests.html" class="btn btn-primary btn-block btn-sm" onclick="event.stopPropagation();" style="font-size: 0.84rem; text-decoration: none;">
                                Conquer Quests to Earn ${t.min.toLocaleString()} BOOBA →
                              </a>
                            `}
                          </div>

                        </div>

                      </div>
                    </div>

                  </div>
                `;
              }).join('')}
            </div>
          </div>

        </div>

      </div>
    `;

    // Initialize carousel active scroll listeners
    setTimeout(() => {
      this.attachPassportCarouselListeners(levelInfo.level);
    }, 50);
  }

  togglePassportCardFlip(level) {
    const cardWrapper = document.getElementById(`cardWrapper-${level}`);
    if (cardWrapper) {
      cardWrapper.classList.toggle('is-flipped');
    }
  }

  selectPassportTier(level) {
    const slide = document.getElementById(`passportSlide-${level}`);
    const track = document.getElementById('passportCarouselTrack');
    if (slide && track) {
      slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      document.querySelectorAll('.passport-tier-pill').forEach(p => p.classList.remove('active'));
      const activePill = document.getElementById(`tierPill-${level}`);
      if (activePill) {
        activePill.classList.add('active');
        activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  scrollPassportCarousel(direction) {
    const track = document.getElementById('passportCarouselTrack');
    if (!track) return;
    const slides = Array.from(track.querySelectorAll('.passport-slide'));
    if (slides.length === 0) return;

    const trackCenter = track.scrollLeft + track.clientWidth / 2;
    let currentIdx = 0;
    let minDistance = Infinity;

    slides.forEach((slide, idx) => {
      const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
      const dist = Math.abs(slideCenter - trackCenter);
      if (dist < minDistance) {
        minDistance = dist;
        currentIdx = idx;
      }
    });

    let targetIdx = currentIdx + direction;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx >= slides.length) targetIdx = slides.length - 1;

    const targetLevel = Number(slides[targetIdx].dataset.level);
    this.selectPassportTier(targetLevel);
  }

  attachPassportCarouselListeners(defaultLevel) {
    const track = document.getElementById('passportCarouselTrack');
    if (!track) return;

    // Scroll to initial user level
    if (defaultLevel) {
      const initialSlide = document.getElementById(`passportSlide-${defaultLevel}`);
      if (initialSlide) {
        initialSlide.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
    }

    let scrollTimeout;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const slides = Array.from(track.querySelectorAll('.passport-slide'));
        const trackCenter = track.scrollLeft + track.clientWidth / 2;
        let closestLevel = 1;
        let minDistance = Infinity;

        slides.forEach(slide => {
          const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
          const dist = Math.abs(slideCenter - trackCenter);
          if (dist < minDistance) {
            minDistance = dist;
            closestLevel = Number(slide.dataset.level);
          }
        });

        document.querySelectorAll('.passport-tier-pill').forEach(p => p.classList.remove('active'));
        const activePill = document.getElementById(`tierPill-${closestLevel}`);
        if (activePill) {
          activePill.classList.add('active');
          activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 60);
    });
  }

  // --------------------------------------------------------------------------
  // 4. QUESTS & REWARDS VAULT VIEW (MERGED)
  // --------------------------------------------------------------------------

  renderQuestsView(container) {
    this.renderUnifiedQuestsAndRewardsView(container);
  }

  renderRewardsView(container) {
    this.renderUnifiedQuestsAndRewardsView(container);
  }

  renderUnifiedQuestsAndRewardsView(container) {
    const user = db.currentUser;
    const quests = db.quests;

    const normalizeCategory = (cat) => {
      if (!cat) return 'community';
      const c = cat.toLowerCase().trim();
      if (c.includes('daily')) return 'daily';
      if (c.includes('content') || c.includes('creative') || c.includes('meme')) return 'content';
      if (c.includes('engagement') || c.includes('social')) return 'engagement';
      if (c.includes('community') || c.includes('ecosystem')) return 'community';
      return c;
    };

    const getCategoryLabel = (cat) => {
      const norm = normalizeCategory(cat);
      switch (norm) {
        case 'daily': return 'Daily Check-In';
        case 'community': return 'Community';
        case 'engagement': return 'Engagement';
        case 'content': return 'Content Production';
        default: return cat;
      }
    };

    let filtered = quests;
    if (this.activeQuestFilter && this.activeQuestFilter !== 'all') {
      filtered = quests.filter(q => normalizeCategory(q.category) === this.activeQuestFilter);
    }

    const totalBountyPool = quests.reduce((acc, q) => acc + (Number(q.rewardBooba) || 0), 0);
    const userLevel = user ? calculateLevel(user.boobaPoints) : { level: 1, title: 'Booba Baby' };

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- Top Action & Navigation Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.25rem; flex-wrap: wrap; gap: 1rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>

          ${user ? `
            <div style="display: flex; align-items: center; gap: 0.85rem;">
              <span class="badge-tag" style="background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.35); font-size: 0.82rem; padding: 0.4rem 0.95rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px;"></span>
                <span>Lv.${userLevel.level} ${userLevel.title}</span>
              </span>
              <a href="passport.html" class="btn btn-outline btn-sm" style="white-space: nowrap;">
                View Passport →
              </a>
            </div>
          ` : ''}
        </div>

        <!-- LIVE QUESTS SUMMARY HUD BANNER -->
        <div class="card" style="background: linear-gradient(135deg, rgba(243, 186, 47, 0.12) 0%, rgba(14, 18, 27, 0.85) 60%, rgba(7, 9, 14, 0.95) 100%); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px; padding: 2.25rem 2.5rem; margin-bottom: 3rem; position: relative; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(243, 186, 47, 0.1);">
          
          <div style="position: absolute; right: -25px; bottom: -25px; opacity: 0.1; pointer-events: none;">
            <img src="assets/mascot.jpg" style="width: 260px; height: 260px; border-radius: 50%;">
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.75rem; position: relative; z-index: 1;">
            <div>
              <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Total Bounty Pool</div>
              <div style="font-size: 2rem; font-weight: 900; color: var(--brand-yellow);" class="text-mono">+${totalBountyPool.toLocaleString()} <span style="font-size: 1.1rem;">BOOBA</span></div>
              <div style="font-size: 0.78rem; color: var(--accent-emerald); margin-top: 0.25rem; font-weight: 700;">Live Community Rewards</div>
            </div>

            <div>
              <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Active Quests</div>
              <div style="font-size: 2rem; font-weight: 900; color: #FFFFFF;" class="text-mono">${quests.length} <span style="font-size: 1.1rem; color: var(--text-secondary);">Bounties</span></div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.25rem;">Updated Regularly</div>
            </div>

            <div>
              <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Your Balance</div>
              <div style="font-size: 2rem; font-weight: 900; color: var(--brand-yellow);" class="text-mono">${user ? Number(user.boobaPoints).toLocaleString() : '0'} <span style="font-size: 1.1rem;">BOOBA</span></div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.25rem;">${user ? `${user.completedQuestsCount || 0} completed` : 'Sign in to track'}</div>
            </div>

            <div>
              <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Daily Streak Status</div>
              <div style="font-size: 2rem; font-weight: 900; color: var(--accent-orange); display: flex; align-items: center; gap: 0.4rem;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
                <span class="text-mono">${user ? user.streakDays || 1 : 1} Days</span>
              </div>
              <div style="font-size: 0.78rem; color: var(--accent-orange); margin-top: 0.25rem; font-weight: 700;">Multiplier Active</div>
            </div>
          </div>

        </div>

        <!-- 1. LIVE BOUNTY QUESTS SECTION -->
        <div style="margin-bottom: 4.5rem;">
          
          <div class="quest-top-bar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 2rem;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin: 0;">Community Bounties & Missions</h2>
              <p class="quest-header-desc" style="font-size: 0.9rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">Complete active tasks below to earn cryptographic $BOOBA tokens and rank up.</p>
            </div>

            <!-- Filter Pills in Horizontal Scroller -->
            <div class="quest-filter-bar">
              <button type="button" class="passport-tier-pill ${this.activeQuestFilter === 'all' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('all')">
                All Quests (${quests.length})
              </button>
              <button type="button" class="passport-tier-pill ${this.activeQuestFilter === 'daily' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('daily')">
                Daily Check-In
              </button>
              <button type="button" class="passport-tier-pill ${this.activeQuestFilter === 'community' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('community')">
                Community
              </button>
              <button type="button" class="passport-tier-pill ${this.activeQuestFilter === 'engagement' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('engagement')">
                Engagement
              </button>
              <button type="button" class="passport-tier-pill ${this.activeQuestFilter === 'content' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('content')">
                Content
              </button>
            </div>
          </div>

          <!-- Quests Grid OR 10-Card Apple Vision Pro Daily Carousel -->
          ${this.activeQuestFilter === 'daily' ? `
            <!-- 10-CARD APPLE VISION PRO DAILY CHECK-IN CAROUSEL -->
            <div style="margin-bottom: 3.5rem;">
              
              <!-- Desktop Streak Header -->
              <div class="daily-streak-header-desktop">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-size: 0.82rem; padding: 0.35rem 0.9rem;">
                      <span class="pulse-dot" style="width: 6px; height: 6px;"></span>
                      <span>10-CARD 100-DAY EXPEDITION</span>
                    </span>
                  </div>
                  <h2 style="font-size: 2rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.5rem 0;">
                    Daily Streak Reward Matrix
                  </h2>
                  <p style="color: var(--text-secondary); max-width: 620px; margin: 0; font-size: 0.92rem; line-height: 1.6;">
                    Each card holds 10 consecutive days of rewards. <strong>Click any card to flip and reveal its 10-day matrix</strong>, claim active bonuses, and conquer all 10 epochs for the <strong>Day 100 Genesis NFT</strong>.
                  </p>
                </div>

                <div style="background: rgba(0, 0, 0, 0.4); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 20px; padding: 1.25rem 1.75rem; text-align: center; min-width: 220px;">
                  <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Active Streak</div>
                  <div style="font-size: 2.2rem; font-weight: 900; color: var(--accent-orange); display: flex; align-items: center; justify-content: center; gap: 0.35rem;" class="text-mono">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
                    <span>${user ? user.streakDays || 1 : 1} / 100</span>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--accent-emerald); font-weight: 700; margin-top: 0.25rem;">
                    ${user && (user.streakDays || 1) >= 100 ? 'Expedition Conquered!' : `${100 - (user ? user.streakDays || 1 : 1)} Days to Genesis NFT`}
                  </div>
                </div>
              </div>

              <!-- Mobile Compact Streak HUD -->
              <div class="daily-streak-hud-mobile">
                <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                  <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(255, 122, 0, 0.15); border: 1px solid rgba(255, 122, 0, 0.35); display: flex; align-items: center; justify-content: center; color: var(--accent-orange); flex-shrink: 0;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
                  </div>
                  <div style="min-width: 0;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800;">Active Streak</div>
                    <div style="font-size: 1.15rem; font-weight: 900; color: #FFFFFF;" class="text-mono">
                      <span style="color: var(--accent-orange);">${user ? user.streakDays || 1 : 1}</span> / 100 Days
                    </div>
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <span class="badge-tag" style="background: rgba(147, 51, 234, 0.15); color: #C084FC; border-color: rgba(147, 51, 234, 0.4); font-size: 0.68rem; padding: 0.2rem 0.55rem; font-weight: 800;">
                    ${user && (user.streakDays || 1) >= 100 ? 'Conquered' : `${100 - (user ? user.streakDays || 1 : 1)}d to NFT`}
                  </span>
                </div>
              </div>

              <!-- 10 Epoch Quick Pill Selector Navigation -->
              <div class="passport-tier-nav" style="margin-bottom: 1.5rem;">
                ${[
                  'Days 1–10', 'Days 11–20', 'Days 21–30', 'Days 31–40', 'Days 41–50',
                  'Days 51–60', 'Days 61–70', 'Days 71–80', 'Days 81–90', 'Days 91–100'
                ].map((range, idx) => `
                  <button type="button" class="passport-tier-pill" onclick="window.boobaApp.scrollToDailyEpoch(${idx})" id="dailyEpochPill_${idx}">
                    ${range}
                  </button>
                `).join('')}
              </div>

              <!-- Full-Bleed 10-Card Carousel -->
              <div class="daily-carousel-wrapper">
                <div class="daily-carousel-viewport">
                  
                  <!-- Nav Arrow Left -->
                  <button type="button" class="carousel-nav-btn prev-btn" onclick="window.boobaApp.scrollDailyEpochCarousel(-1)" aria-label="Previous Epoch">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>

                  <!-- Nav Arrow Right -->
                  <button type="button" class="carousel-nav-btn next-btn" onclick="window.boobaApp.scrollDailyEpochCarousel(1)" aria-label="Next Epoch">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>

                  <!-- Carousel Track -->
                  <div class="daily-carousel-track" id="dailyEpochTrack">
                    ${(() => {
                      const allRewards = this.get100DaysRewardData();
                      const currentStreak = user ? Number(user.streakDays || 1) : 1;

                      const epochs = [
                        { index: 0, title: 'Rookie Expedition', startDay: 1, endDay: 10, theme: 'card-theme-lv1', perk: '+1,400 BOOBA + 1.2x Multiplier' },
                        { index: 1, title: 'Novice Challenger', startDay: 11, endDay: 20, theme: 'card-theme-lv2', perk: '+3,200 BOOBA + Alpha Pass' },
                        { index: 2, title: 'Alpha Scout', startDay: 21, endDay: 30, theme: 'card-theme-lv3', perk: '+5,400 BOOBA + OG Discord Role' },
                        { index: 3, title: 'Ecosystem Warrior', startDay: 31, endDay: 40, theme: 'card-theme-lv4', perk: '+7,600 BOOBA + VIP AMA Pass' },
                        { index: 4, title: 'Gold Grinder', startDay: 41, endDay: 50, theme: 'card-theme-lv5', perk: '+10,500 BOOBA + 1.5x Multiplier' },
                        { index: 5, title: 'Syndicate Elite', startDay: 51, endDay: 60, theme: 'card-theme-lv6', perk: '+13,200 BOOBA + Core Alpha Briefings' },
                        { index: 6, title: 'Mainnet Vanguard', startDay: 61, endDay: 70, theme: 'card-theme-lv7', perk: '+16,400 BOOBA + Airdrop Priority' },
                        { index: 7, title: 'Treasury Ambassador', startDay: 71, endDay: 80, theme: 'card-theme-lv8', perk: '+20,500 BOOBA + Ambassador Crest' },
                        { index: 8, title: 'Senator Champion', startDay: 81, endDay: 90, theme: 'card-theme-lv9', perk: '+26,000 BOOBA + Governance Voting' },
                        { index: 9, title: 'Genesis NFT Realm', startDay: 91, endDay: 100, theme: 'card-theme-lv10', perk: 'GENESIS 1/1 NFT + 50,000 BOOBA' }
                      ];

                      return epochs.map(ep => {
                        const epochRewards = allRewards.filter(r => r.day >= ep.startDay && r.day <= ep.endDay);
                        const isEpochActive = currentStreak >= ep.startDay && currentStreak <= ep.endDay;
                        const isEpochCompleted = currentStreak > ep.endDay;
                        const isEpochLocked = currentStreak < ep.startDay;
                        const daysClaimedInEpoch = Math.max(0, Math.min(10, currentStreak - ep.startDay));

                        return `
                          <div class="daily-carousel-slide" id="dailySlide_${ep.index}">
                            
                            <!-- 3D Flip Compact GameFi Capsule for 10 Days -->
                            <div class="daily-epoch-card-3d-wrapper" id="dailyEpochWrapper_${ep.index}" onclick="window.boobaApp.toggleDailyCardFlip(${ep.index})">
                              <div class="daily-epoch-card-inner">
                                
                                <!-- FRONT FACE: Compact Daily Reward Capsule -->
                                <div class="daily-epoch-card-face daily-epoch-card-front">
                                  
                                  <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                      <span class="badge-tag" style="background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3); font-size: 0.7rem; padding: 0.2rem 0.65rem; font-weight: 800;">
                                        EPOCH 0${ep.index + 1}
                                      </span>
                                      <span style="font-size: 0.75rem; color: ${isEpochCompleted ? 'var(--accent-emerald)' : isEpochActive ? 'var(--brand-yellow)' : 'var(--text-muted)'}; font-weight: 700;">
                                        ${isEpochCompleted ? 'Conquered' : isEpochActive ? 'Active Today' : 'Locked'}
                                      </span>
                                    </div>

                                    <!-- Glowing Capsule Badge Icon -->
                                    <div class="capsule-badge-icon ${ep.index === 9 ? 'nft-apex' : ''}">
                                      ${ep.index === 9 ? `
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                      ` : `
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                      `}
                                    </div>

                                    <h3 style="font-size: 1.35rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.01em; margin: 0 0 0.25rem 0;">
                                      Days ${ep.startDay}–${ep.endDay}
                                    </h3>
                                    <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1rem; font-weight: 600;">
                                      ${ep.title}
                                    </div>

                                    <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 0.75rem 0.85rem; margin-bottom: 0.75rem;">
                                      <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.2rem;">Epoch Target</div>
                                      <div style="font-size: 0.92rem; font-weight: 800; color: ${ep.index === 9 ? '#FFD700' : 'var(--brand-yellow)'};" class="text-mono">
                                        ${ep.perk}
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    <!-- 10-Dot Progress Indicator -->
                                    <div style="margin-bottom: 0.85rem;">
                                      <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem;">
                                        <span>Progress</span>
                                        <span style="color: ${isEpochCompleted ? 'var(--accent-emerald)' : 'var(--brand-yellow)'}; font-weight: 800;">
                                          ${isEpochCompleted ? '10/10' : `${daysClaimedInEpoch}/10`}
                                        </span>
                                      </div>
                                      <div style="display: flex; gap: 0.25rem;">
                                        ${epochRewards.map(r => {
                                          const claimed = currentStreak > r.day;
                                          const active = currentStreak === r.day;
                                          return `
                                            <div style="flex: 1; height: 5px; border-radius: 999px; background: ${claimed ? 'var(--accent-emerald)' : active ? 'var(--brand-yellow)' : 'rgba(255,255,255,0.1)'}; box-shadow: ${active ? '0 0 6px var(--brand-yellow)' : 'none'};"></div>
                                          `;
                                        }).join('')}
                                      </div>
                                    </div>

                                    <!-- Action Button -->
                                    <div class="flip-hint-pill" style="width: 100%; justify-content: center; font-size: 0.75rem; font-weight: 800; color: #FFFFFF; display: flex; align-items: center; gap: 0.35rem; background: rgba(255,255,255,0.06); padding: 0.45rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15);">
                                      <span>Tap to View 10 Days</span>
                                      <span style="color: var(--brand-yellow);">⟳</span>
                                    </div>
                                  </div>

                                </div>

                                <!-- BACK FACE: 10 Revealed Daily Reward Slots -->
                                <div class="daily-epoch-card-face daily-epoch-card-back" onclick="event.stopPropagation()">
                                  
                                  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.5rem; margin-bottom: 0.35rem;">
                                    <div>
                                      <div style="font-size: 0.68rem; text-transform: uppercase; color: var(--text-muted); font-weight: 800;">
                                        EPOCH 0${ep.index + 1} BREAKDOWN
                                      </div>
                                      <div style="font-size: 1rem; font-weight: 900; color: #FFFFFF;">
                                        Days ${ep.startDay}–${ep.endDay}
                                      </div>
                                    </div>

                                    <button type="button" class="btn btn-outline btn-sm" onclick="window.boobaApp.toggleDailyCardFlip(${ep.index})" style="font-size: 0.7rem; padding: 0.25rem 0.6rem; border-radius: 999px;">
                                      <span>Back ⟳</span>
                                    </button>
                                  </div>

                                  <!-- 10 Sub-Days Grid -->
                                  <div class="epoch-subdays-grid">
                                    ${epochRewards.map(r => {
                                      const isClaimed = user && r.day < currentStreak;
                                      const isActiveToday = user && r.day === currentStreak;
                                      const isNft = r.day === 100;

                                      let itemClass = 'subday-item';
                                      if (isNft) itemClass += ' day-100-nft';
                                      else if (isClaimed) itemClass += ' claimed';
                                      else if (isActiveToday) itemClass += ' active-today';

                                      return `
                                        <div class="${itemClass}">
                                          <div style="font-size: 0.62rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.15rem;">
                                            ${isNft ? 'NFT' : `D${r.day}`}
                                          </div>

                                          <div style="font-family: var(--font-mono); font-size: 0.74rem; font-weight: 900; color: ${isNft ? '#FFD700' : 'var(--brand-yellow)'}; margin-bottom: 0.25rem; white-space: nowrap;">
                                            ${isNft ? '1/1 NFT' : `+${r.rewardVal}B`}
                                          </div>

                                          <div style="width: 100%;">
                                            ${isClaimed ? `
                                              <span class="day-status-btn" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald); border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.58rem; padding: 0.15rem 0.25rem;">
                                                Done
                                              </span>
                                            ` : isActiveToday ? `
                                              <button type="button" class="day-status-btn" onclick="window.boobaApp.handleClaimDailyStreak(${r.day})" style="background: var(--brand-yellow); color: #000000; font-weight: 900; font-size: 0.58rem; padding: 0.2rem 0.25rem; box-shadow: 0 0 8px rgba(243,186,47,0.6);">
                                                Claim
                                              </button>
                                            ` : `
                                              <span class="day-status-btn" style="background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.58rem; padding: 0.15rem 0.25rem;">
                                                Lock
                                              </span>
                                            `}
                                          </div>
                                        </div>
                                      `;
                                    }).join('')}
                                  </div>

                                  <div style="font-size: 0.72rem; color: var(--text-muted); text-align: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.35rem;">
                                    ${isEpochActive ? 'Active Epoch' : isEpochCompleted ? 'All 10 Days Conquered' : 'Complete preceding days'}
                                  </div>

                                </div>

                              </div>
                            </div>

                          </div>
                        `;
                      }).join('');
                    })()}
                  </div>

                </div>
              </div>

              <!-- Day 100 NFT Spotlight Hero -->
              <div class="nft-grand-spotlight">
                <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
                  <div style="width: 80px; height: 80px; border-radius: 22px; background: linear-gradient(135deg, #FFD700, #F3BA2F); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 35px rgba(255, 215, 0, 0.5); flex-shrink: 0;">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="#000000"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                      <span class="badge-tag" style="background: #FFD700; color: #000; font-weight: 900; font-size: 0.72rem; padding: 0.2rem 0.65rem;">
                        DAY 100 APEX REWARD
                      </span>
                      <span class="badge-tag" style="background: rgba(255, 255, 255, 0.08); color: #FFFFFF; font-size: 0.72rem;">
                        BEP-721 NON-FUNGIBLE ASSET
                      </span>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 900; color: #FFFFFF; margin: 0 0 0.35rem 0;">
                      Genesis Booba Master 1/1 NFT
                    </h3>
                    <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 620px; margin: 0; line-height: 1.6;">
                      The pinnacle on-chain achievement. Unlocks permanent 2.5x ecosystem multiplier, private DAO advisory council seat, BNB Baby Treasury profit allocation, and VIP merchandise delivery.
                    </p>
                  </div>
                </div>

                <div>
                  <button type="button" class="btn btn-primary btn-lg" onclick="window.boobaApp.handleClaimDailyStreak(${user ? user.streakDays || 1 : 1})" style="white-space: nowrap; font-weight: 900;">
                    ${user && (user.streakDays || 1) >= 100 ? 'Claim Day 100 NFT' : `Claim Day ${user ? user.streakDays || 1 : 1} Streak →`}
                  </button>
                </div>
              </div>

            </div>
          ` : `
            <!-- Standard Category Quests Grid -->
            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem;">
              ${filtered.length === 0 ? `
                <div style="grid-column: 1 / -1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4.5rem 2rem; border-radius: 28px; background: rgba(14, 18, 27, 0.75); border: 1.5px dashed rgba(243, 186, 47, 0.25); box-sizing: border-box; position: relative;">
                  
                  <!-- Icon -->
                  <div style="width: 64px; height: 64px; border-radius: 20px; background: rgba(243, 186, 47, 0.1); border: 1.5px solid rgba(243, 186, 47, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: var(--brand-yellow); flex-shrink: 0;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                  </div>

                  <!-- Title directly ABOVE description -->
                  <h3 style="font-size: 1.45rem; font-weight: 800; color: #FFFFFF; letter-spacing: -0.01em; margin: 0 auto 0.75rem auto; text-align: center; width: 100%;">
                    No Active Bounties in This Sector
                  </h3>

                  <!-- Description centered under title -->
                  <p style="color: var(--text-secondary); max-width: 540px; margin: 0 auto 2rem auto; font-size: 0.95rem; line-height: 1.65; text-align: center;">
                    All missions in this track are currently completed or undergoing batch verification. New community campaigns, creator bounties, and on-chain quests are deployed regularly by core contributors.
                  </p>

                  <!-- Centered Action Buttons -->
                  <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 0 auto;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="window.boobaApp.setQuestFilter('all')">
                      Explore All Available Quests
                    </button>
                    <a href="dashboard.html" class="btn btn-outline btn-sm">
                      Return to Dashboard
                    </a>
                  </div>

                </div>
              ` : filtered.map(q => `
                <div class="card card-hover" style="display: flex; flex-direction: column; justify-content: space-between; padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); position: relative; overflow: hidden;">
                  
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                      <span class="badge-tag" style="text-transform: uppercase; font-size: 0.72rem; padding: 0.3rem 0.75rem; letter-spacing: 0.04em;">
                        ${getCategoryLabel(q.category)}
                      </span>
                      <div style="font-size: 0.88rem; font-weight: 900; color: var(--brand-yellow); background: rgba(243, 186, 47, 0.14); border: 1px solid rgba(243, 186, 47, 0.35); padding: 0.35rem 0.85rem; border-radius: 999px;" class="text-mono">
                        +${Number(q.rewardBooba).toLocaleString()} BOOBA
                      </div>
                    </div>

                    <h3 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 0.65rem; color: #FFFFFF; line-height: 1.35;">${q.title}</h3>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                      ${q.description}
                    </p>

                    <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1.75rem; background: rgba(0,0,0,0.4); padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 0.5rem;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand-yellow)" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                      <span style="color: var(--text-secondary);">${q.requirements || 'Complete mission and submit proof'}</span>
                    </div>
                  </div>

                  <div>
                    ${q.type === 'instant' ? `
                      <button class="btn btn-primary btn-block" onclick="window.boobaApp.setQuestFilter('daily')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        <span>Open 100-Day Streak Matrix</span>
                      </button>
                    ` : q.category === 'content' || q.type === 'proof' ? `
                      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                        ${q.targetUrl ? `
                          <a href="${q.targetUrl}" target="_blank" class="btn btn-outline btn-block" style="display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 700; font-size: 0.85rem;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            <span>Visit Mission Site ↗</span>
                          </a>
                        ` : ''}
                        <button class="btn btn-primary btn-block" onclick="window.boobaApp.openProofModal('${q.id}')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800; font-size: 0.88rem;">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                          <span>Submit Proof Link</span>
                        </button>
                      </div>
                    ` : `
                      <button class="btn btn-primary btn-block" onclick="window.boobaApp.openSocialModal('${q.id}')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        <span>${q.actionText || 'Follow & Verify'}</span>
                      </button>
                    `}
                  </div>

                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- 2. REWARDS VAULT PERKS SECTION -->
        <div style="margin-bottom: 4rem;">
          
          <div style="margin-bottom: 2rem;">
            <h2 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin: 0;">Treasury & Airdrop Rewards Vault</h2>
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">Unlock ecosystem multipliers, private founder alpha, and community governance voting weight.</p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.75rem;">
            
            <div class="card card-hover" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
              <div class="bento-icon-badge" style="margin-bottom: 1.25rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
              </div>
              <h3 style="font-size: 1.25rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.6rem;">Airdrop Multiplier</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.25rem;">
                Maintain your daily check-in streak to receive up to a 2.5x point multiplier on future BNB Baby ecosystem snapshot distributions.
              </p>
              <div style="font-size: 0.82rem; color: var(--accent-emerald); font-weight: 700; display: flex; align-items: center; gap: 0.35rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px;"></span>
                <span>Active on Mainnet</span>
              </div>
            </div>

            <div class="card card-hover" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
              <div class="bento-icon-badge" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); margin-bottom: 1.25rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </div>
              <h3 style="font-size: 1.25rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.6rem;">Private Alpha Channels</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.25rem;">
                Reach Level 5 (Booba Grinder) to gain automatic access to private community alpha chats and core team briefings.
              </p>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Requires Lv.5+</div>
            </div>

            <div class="card card-hover" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
              <div class="bento-icon-badge" style="background: rgba(255, 122, 0, 0.12); color: var(--accent-orange); border-color: rgba(255, 122, 0, 0.3); margin-bottom: 1.25rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16"></path><path d="M4 18h16"></path><path d="M7 18V9"></path><path d="M12 18V9"></path><path d="M17 18V9"></path><path d="M2 9l10-7 10 7H2z"></path></svg>
              </div>
              <h3 style="font-size: 1.25rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.6rem;">Governance Voting</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.25rem;">
                Top tier passport holders participate in community grant proposals, marketing allocations, and new quest bounties.
              </p>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Requires Lv.8+</div>
            </div>

            <div class="card card-hover" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
              <div class="bento-icon-badge" style="background: rgba(192, 132, 252, 0.12); color: #C084FC; border-color: rgba(192, 132, 252, 0.3); margin-bottom: 1.25rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              </div>
              <h3 style="font-size: 1.25rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.6rem;">Treasury Royalty Allocation</h3>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.25rem;">
                Level 9 & 10 holders receive priority allocations from the BNB Baby Ecosystem Treasury and advisory status.
              </p>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Requires Lv.9+</div>
            </div>

          </div>
        </div>

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 5. COMMUNITY LEADERBOARD VIEW
  // --------------------------------------------------------------------------

  renderLeaderboardView(container) {
    const currentUser = db.currentUser;
    const users = db.users && db.users.length > 0 ? [...db.users] : [];

    // Ensure sorted descending by points
    users.sort((a, b) => (b.boobaPoints || 0) - (a.boobaPoints || 0));

    const top1 = users[0] || { username: 'BoobaKing_BNB', boobaPoints: 84500, passportId: 'BB-889210', avatar: 'assets/mascot.jpg', streakDays: 28, reputation: 99 };
    const top2 = users[1] || { username: 'CryptoWhale_56', boobaPoints: 62400, passportId: 'BB-552190', avatar: 'assets/mascot.jpg', streakDays: 21, reputation: 95 };
    const top3 = users[2] || { username: 'BNB_Satoshi', boobaPoints: 49800, passportId: 'BB-100234', avatar: 'assets/mascot.jpg', streakDays: 19, reputation: 92 };

    const top1Level = calculateLevel(top1.boobaPoints);
    const top2Level = calculateLevel(top2.boobaPoints);
    const top3Level = calculateLevel(top3.boobaPoints);

    container.innerHTML = `
      <div class="container page-content">
        <!-- Back to Dashboard Navigation -->
        <div style="margin-bottom: 2rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>
        </div>

        <!-- 3D OLYMPIC PODIUM (Top 3 Holders) -->
        <div class="leaderboard-podium-container">
          
          <!-- DESKTOP PODIUM (Rank 2 Left, Rank 1 Center Elevated, Rank 3 Right) -->
          <div class="leaderboard-podium-desktop">
            <!-- Rank 2: Silver -->
            <div class="card card-hover text-center" style="padding: 2.25rem 1.5rem; border-radius: 24px; border: 1.5px solid rgba(226, 232, 240, 0.4); background: linear-gradient(180deg, rgba(226, 232, 240, 0.08) 0%, rgba(14, 18, 27, 0.8) 100%);">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(226, 232, 240, 0.15); border: 2px solid #E2E8F0; color: #E2E8F0; font-weight: 800; font-size: 1.1rem; margin-bottom: 1rem;">
                #2
              </div>
              <img src="${top2.avatar || 'assets/mascot.jpg'}" style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #E2E8F0; margin: 0 auto 0.75rem auto; object-fit: cover;">
              <h3 style="font-size: 1.2rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.25rem;">${top2.username}</h3>
              <span class="badge-tag" style="font-size: 0.72rem; margin-bottom: 0.85rem;">Lv.${top2Level.level} ${top2Level.title}</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.5rem;">
                ${Number(top2.boobaPoints).toLocaleString()} <span style="font-size: 0.8rem; color: var(--text-secondary);">BOOBA</span>
              </div>
            </div>

            <!-- Rank 1: Gold (Center & Taller) -->
            <div class="card card-hover text-center" style="padding: 3rem 1.75rem; border-radius: 28px; border: 2px solid var(--brand-yellow); background: linear-gradient(180deg, rgba(243, 186, 47, 0.15) 0%, rgba(14, 18, 27, 0.95) 100%); box-shadow: 0 0 40px rgba(243, 186, 47, 0.25); transform: translateY(-10px);">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: var(--brand-yellow); color: #000; font-weight: 900; font-size: 1.3rem; margin-bottom: 1rem; box-shadow: 0 0 20px var(--brand-yellow-glow);">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"></path></svg>
              </div>
              <img src="${top1.avatar || 'assets/mascot.jpg'}" style="width: 88px; height: 88px; border-radius: 50%; border: 3px solid var(--brand-yellow); margin: 0 auto 0.75rem auto; object-fit: cover; box-shadow: 0 0 25px var(--brand-yellow-glow);">
              <h3 style="font-size: 1.4rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.25rem;">${top1.username}</h3>
              <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800; font-size: 0.75rem; margin-bottom: 0.85rem;">Lv.${top1Level.level} ${top1Level.title}</span>
              <div style="font-size: 1.85rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.5rem;">
                ${Number(top1.boobaPoints).toLocaleString()} <span style="font-size: 0.9rem; color: var(--text-secondary);">BOOBA</span>
              </div>
            </div>

            <!-- Rank 3: Bronze -->
            <div class="card card-hover text-center" style="padding: 2.25rem 1.5rem; border-radius: 24px; border: 1.5px solid rgba(249, 115, 22, 0.4); background: linear-gradient(180deg, rgba(249, 115, 22, 0.08) 0%, rgba(14, 18, 27, 0.8) 100%);">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); border: 2px solid #F97316; color: #F97316; font-weight: 800; font-size: 1.1rem; margin-bottom: 1rem;">
                #3
              </div>
              <img src="${top3.avatar || 'assets/mascot.jpg'}" style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid #F97316; margin: 0 auto 0.75rem auto; object-fit: cover;">
              <h3 style="font-size: 1.2rem; color: #FFFFFF; font-weight: 800; margin-bottom: 0.25rem;">${top3.username}</h3>
              <span class="badge-tag" style="font-size: 0.72rem; margin-bottom: 0.85rem;">Lv.${top3Level.level} ${top3Level.title}</span>
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.5rem;">
                ${Number(top3.boobaPoints).toLocaleString()} <span style="font-size: 0.8rem; color: var(--text-secondary);">BOOBA</span>
              </div>
            </div>
          </div>

          <!-- MOBILE LUXURY OLYMPIC PODIUM (3-Step Pedestal with #1 Elevated in Center) -->
          <div class="leaderboard-podium-mobile">
            <div class="mob-podium-stage-glow"></div>
            
            <!-- Mobile Rank 2: Silver Pedestal -->
            <div class="mob-podium-col mob-rank-2">
              <div class="mob-avatar-wrap">
                <div class="mob-avatar-ring mob-ring-silver">
                  <img src="${top2.avatar || 'assets/mascot.jpg'}" class="mob-avatar" alt="${top2.username}">
                </div>
                <div class="mob-rank-badge mob-badge-silver">#2</div>
              </div>
              <div class="mob-user-info">
                <div class="mob-username" title="${top2.username}">${top2.username}</div>
                <div class="mob-points text-mono">${Number(top2.boobaPoints).toLocaleString()}</div>
                <div class="mob-tier-tag mob-tier-silver">Lv.${top2Level.level}</div>
              </div>
              <div class="mob-pedestal mob-pedestal-silver">
                <div class="mob-pedestal-cap"></div>
                <div class="mob-pedestal-body">
                  <span class="mob-pedestal-num">2</span>
                </div>
              </div>
            </div>

            <!-- Mobile Rank 1: Gold Champion Pedestal (Elevated in Center) -->
            <div class="mob-podium-col mob-rank-1">
              <div class="mob-crown-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="url(#crownGoldGrad)" style="filter: drop-shadow(0 0 10px rgba(243, 186, 47, 0.9));">
                  <defs>
                    <linearGradient id="crownGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#FFF5C0" />
                      <stop offset="40%" stop-color="#F3BA2F" />
                      <stop offset="100%" stop-color="#C2820A" />
                    </linearGradient>
                  </defs>
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"></path>
                </svg>
              </div>
              <div class="mob-avatar-wrap">
                <div class="mob-avatar-ring mob-ring-gold">
                  <div class="mob-halo-pulse"></div>
                  <img src="${top1.avatar || 'assets/mascot.jpg'}" class="mob-avatar" alt="${top1.username}">
                </div>
                <div class="mob-rank-badge mob-badge-gold">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  #1
                </div>
              </div>
              <div class="mob-user-info">
                <div class="mob-username mob-username-gold" title="${top1.username}">${top1.username}</div>
                <div class="mob-points mob-points-gold text-mono">${Number(top1.boobaPoints).toLocaleString()}</div>
                <div class="mob-tier-tag mob-tier-gold">Lv.${top1Level.level}</div>
              </div>
              <div class="mob-pedestal mob-pedestal-gold">
                <div class="mob-pedestal-cap"></div>
                <div class="mob-pedestal-body">
                  <span class="mob-pedestal-num">1</span>
                </div>
              </div>
            </div>

            <!-- Mobile Rank 3: Bronze Pedestal -->
            <div class="mob-podium-col mob-rank-3">
              <div class="mob-avatar-wrap">
                <div class="mob-avatar-ring mob-ring-bronze">
                  <img src="${top3.avatar || 'assets/mascot.jpg'}" class="mob-avatar" alt="${top3.username}">
                </div>
                <div class="mob-rank-badge mob-badge-bronze">#3</div>
              </div>
              <div class="mob-user-info">
                <div class="mob-username" title="${top3.username}">${top3.username}</div>
                <div class="mob-points text-mono">${Number(top3.boobaPoints).toLocaleString()}</div>
                <div class="mob-tier-tag mob-tier-bronze">Lv.${top3Level.level}</div>
              </div>
              <div class="mob-pedestal mob-pedestal-bronze">
                <div class="mob-pedestal-cap"></div>
                <div class="mob-pedestal-body">
                  <span class="mob-pedestal-num">3</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- FULL ON-CHAIN LEADERBOARD -->
        <div class="card leaderboard-table-wrapper" style="max-width: 1000px; margin: 0 auto; padding: 0; overflow: hidden; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
          <div style="padding: 1.5rem 1.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin: 0;">Community Rankings (${users.length} Active Holders)</h3>
              <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0.2rem 0 0 0;">Updated in real-time from on-chain mainnet records.</p>
            </div>
          </div>

          <!-- DESKTOP TABLE VIEW -->
          <div class="leaderboard-table-desktop" style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">
                  <th style="padding: 1.25rem 1.5rem;">Rank</th>
                  <th style="padding: 1.25rem 1.5rem;">Passport Holder</th>
                  <th style="padding: 1.25rem 1.5rem;">Level Tier</th>
                  <th style="padding: 1.25rem 1.5rem;">Trust</th>
                  <th style="padding: 1.25rem 1.5rem;">Streak</th>
                  <th style="padding: 1.25rem 1.5rem; text-align: right;">Total BOOBA</th>
                </tr>
              </thead>
              <tbody>
                ${users.map((u, idx) => {
                  const rank = idx + 1;
                  const lvl = calculateLevel(u.boobaPoints);
                  const isMe = currentUser && (currentUser.id === u.id || currentUser.username === u.username);

                  return `
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: ${isMe ? 'rgba(243, 186, 47, 0.08)' : 'transparent'}; transition: background 0.2s ease;">
                      <td style="padding: 1.25rem 1.5rem;">
                        <span style="font-weight: 800; font-size: 0.95rem; color: ${rank === 1 ? 'var(--brand-yellow)' : rank === 2 ? '#E2E8F0' : rank === 3 ? '#F97316' : 'var(--text-secondary)'};">
                          #${rank}
                        </span>
                      </td>
                      <td style="padding: 1.25rem 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.85rem;">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid ${isMe ? 'var(--brand-yellow)' : 'rgba(255, 255, 255, 0.15)'}; object-fit: cover;">
                          <div>
                            <div style="font-weight: 700; color: #FFFFFF; display: flex; align-items: center; gap: 0.5rem;">
                              <span>${u.username}</span>
                              ${isMe ? '<span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-size: 0.65rem; padding: 0.15rem 0.45rem; font-weight: 800;">YOU</span>' : ''}
                              ${u.role === 'admin' ? '<span class="badge-tag" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">Admin</span>' : ''}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);" class="text-mono">Passport: ${u.passportId || 'BB-MAIN'}</div>
                          </div>
                        </div>
                      </td>
                      <td style="padding: 1.25rem 1.5rem;">
                        <span class="badge-tag" style="font-size: 0.75rem;">Lv.${lvl.level} ${lvl.title}</span>
                      </td>
                      <td style="padding: 1.25rem 1.5rem;">
                        <span style="color: var(--accent-emerald); font-weight: 700; font-size: 0.88rem;">${u.reputation || 75}/100</span>
                      </td>
                      <td style="padding: 1.25rem 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.35rem; color: var(--accent-orange); font-weight: 700; font-size: 0.88rem;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
                          <span>${u.streakDays || 1}d</span>
                        </div>
                      </td>
                      <td style="padding: 1.25rem 1.5rem; text-align: right;">
                        <strong style="color: var(--brand-yellow); font-size: 1.05rem;" class="text-mono">${Number(u.boobaPoints).toLocaleString()}</strong>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- MOBILE SMART CARDS LIST VIEW -->
          <div class="leaderboard-cards-mobile">
            ${users.map((u, idx) => {
              const rank = idx + 1;
              const lvl = calculateLevel(u.boobaPoints);
              const isMe = currentUser && (currentUser.id === u.id || currentUser.username === u.username);
              let rankBadgeClass = 'mob-rank-badge-other';
              if (rank === 1) rankBadgeClass = 'mob-rank-badge-gold';
              else if (rank === 2) rankBadgeClass = 'mob-rank-badge-silver';
              else if (rank === 3) rankBadgeClass = 'mob-rank-badge-bronze';

              return `
                <div class="mob-rank-item ${isMe ? 'is-current-user' : ''}" style="animation-delay: ${idx * 0.035}s;">
                  <div class="mob-rank-left">
                    <div class="mob-rank-pill ${rankBadgeClass}">#${rank}</div>
                    <img src="${u.avatar || 'assets/mascot.jpg'}" class="mob-item-avatar" alt="${u.username}">
                    <div class="mob-item-meta">
                      <div class="mob-item-name">
                        <span class="mob-item-uname">${u.username}</span>
                        ${isMe ? '<span class="mob-tag-you">YOU</span>' : ''}
                        ${u.role === 'admin' ? '<span class="mob-tag-admin">Admin</span>' : ''}
                      </div>
                      <div class="mob-item-sub">
                        <span class="mob-item-tier">Lv.${lvl.level}</span>
                        <span class="mob-item-streak">🔥 ${u.streakDays || 1}d</span>
                      </div>
                    </div>
                  </div>
                  <div class="mob-rank-right">
                    <div class="mob-item-score text-mono">${Number(u.boobaPoints).toLocaleString()}</div>
                    <div class="mob-item-currency">$BOOBA</div>
                  </div>
                </div>
              `;
            }).join('')}
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
          <div class="card text-center" style="max-width: 500px; margin: 4rem auto; padding: 3.5rem 2.5rem; border-radius: 28px;">
            <div class="bento-icon-badge" style="margin: 0 auto 1rem auto;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <h2 style="font-size: 1.75rem; color: #FFFFFF; font-weight: 800;">Referrals</h2>
            <p style="color: var(--text-secondary); margin: 0.75rem 0 2rem 0; font-size: 0.95rem;">
              Please mint your digital passport to get your unique referral code and earn +300 $BOOBA per invite!
            </p>
            <a href="signin.html#signup" class="btn btn-primary btn-lg btn-block">
              Mint Passport (+100 BOOBA)
            </a>
          </div>
        </div>
      `;
      return;
    }

    const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
    const refLink = `${window.location.origin}${basePath}/signin.html?ref=${user.referralCode}#signup`;
    const myReferrals = referrals.filter(r => r.referrerUsername?.toLowerCase() === user.username?.toLowerCase() || r.referrerUsername?.toUpperCase() === user.referralCode?.toUpperCase());

    container.innerHTML = `
      <div class="container page-content">
        <!-- Back to Dashboard Navigation -->
        <div style="margin-bottom: 2rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>
        </div>

        <div class="card" style="max-width: 700px; margin: 0 auto 3rem auto; padding: 2.5rem; border-radius: 28px; border: 1.5px solid rgba(243, 186, 47, 0.35);">
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1rem;">Your Ambassador Link</h3>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <input type="text" readonly value="${refLink}" id="refLinkInput" class="form-input text-mono" style="flex: 1; min-width: 250px; background: rgba(0,0,0,0.4); font-size: 0.9rem;">
            <button class="btn btn-primary btn-lg" onclick="navigator.clipboard.writeText('${refLink}'); alert('Referral link copied to clipboard!');">
              Copy Link
            </button>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 1rem;">
            Your Referral Code: <strong class="text-mono" style="color: var(--brand-yellow); font-size: 1rem;">${user.referralCode}</strong>
          </div>
        </div>

        <!-- Verified Referrals Feed -->
        <div class="card" style="max-width: 850px; margin: 0 auto; padding: 2.5rem; border-radius: 28px;">
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1.25rem;">Your Verified Referrals (${myReferrals.length})</h3>
          ${myReferrals.length === 0 ? `
            <p style="color: var(--text-secondary); font-size: 0.95rem; text-align: center; padding: 3rem 1rem;">
              No referrals yet. Share your ambassador link on Telegram or X/Twitter to start earning +300 $BOOBA rewards!
            </p>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${myReferrals.map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: rgba(255, 255, 255, 0.03); border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.06);">
                  <div>
                    <strong style="color: #FFFFFF; font-size: 0.95rem;">${r.referredUsername}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">Passport: ${r.passportId} • Joined: ${r.joinedDate}</div>
                  </div>
                  <div style="color: var(--accent-emerald); font-weight: 800; font-size: 0.92rem;">
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
    const reopenBtn = document.getElementById('reopenTargetUrlBtn');

    if (titleEl) titleEl.textContent = quest.title;
    if (rewardEl) rewardEl.textContent = `+${quest.rewardBooba} BOOBA`;

    if (reopenBtn) {
      reopenBtn.onclick = () => {
        if (quest.targetUrl) window.open(quest.targetUrl, '_blank');
      };
    }

    if (quest.targetUrl) {
      window.open(quest.targetUrl, '_blank');
    }

    if (modal) modal.classList.add('active');
  }

  async handleConfirmSocial() {
    if (!this.selectedQuestForSocial) return;

    const confirmBtn = document.getElementById('confirmSocialVerifyBtn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Verifying API status...';
    }

    await new Promise(r => setTimeout(r, 1200));

    const res = await db.completeSocialQuest(this.selectedQuestForSocial.id);
    this.closeModal();
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Verify & Claim Points';
    }

    if (res.success) {
      alert(`Social Mission Verified! +${res.reward} BOOBA credited to your passport balance!`);
    } else {
      alert(res.message || 'Verification failed');
    }
  }

  openProofModal(questId) {
    if (!db.currentUser) {
      alert('Please sign in or connect your passport first to submit mission proofs.');
      window.location.href = 'signin.html#signup';
      return;
    }
    const quest = db.quests.find(q => q.id === questId);
    if (!quest) {
      alert('Quest details not found.');
      return;
    }
    this.selectedQuestForProof = quest;

    const modal = document.getElementById('proofModal');
    const titleEl = document.getElementById('proofQuestTitle');
    const rewardEl = document.getElementById('proofRewardText');
    const inputEl = document.getElementById('proofUrlInput');
    const descEl = document.getElementById('proofDescriptionInput');

    if (titleEl) titleEl.textContent = quest.title;
    if (rewardEl) rewardEl.textContent = `Reward: +${Number(quest.rewardBooba).toLocaleString()} BOOBA on team verification`;
    if (inputEl) inputEl.value = '';
    if (descEl) descEl.value = '';

    if (modal) {
      modal.classList.add('active');
      modal.classList.add('open');
      setTimeout(() => inputEl?.focus(), 150);
    }
  }

  async handleProofSubmit(e) {
    e.preventDefault();
    if (!this.selectedQuestForProof) return;

    const proofUrl = document.getElementById('proofUrlInput')?.value.trim();
    const proofDesc = document.getElementById('proofDescriptionInput')?.value.trim();

    const isContentQuest = this.selectedQuestForProof.category === 'content' || this.selectedQuestForProof.category === 'Content Production';

    if (isContentQuest && !proofUrl) {
      alert('A direct link to your published content/post is COMPULSORY for Content Production missions!');
      document.getElementById('proofUrlInput')?.focus();
      return;
    }

    if (!proofUrl && !proofDesc) {
      alert('Please provide a direct URL or description of your completed mission.');
      return;
    }

    const res = await db.submitProof({
      questId: this.selectedQuestForProof.id,
      proofUrl,
      proofDescription: proofDesc
    });

    this.closeModal();
    if (res.success) {
      alert('Proof submitted successfully! The core team will review your content in the Admin Console.');
    } else {
      alert(res.message || 'Submission failed');
    }
  }

  setDailyQuartile(q) {
    this.dailyQuartile = q;
    this.render();
  }

  get100DaysRewardData() {
    const list = [];
    for (let day = 1; day <= 100; day++) {
      let rewardType = 'booba';
      let rewardVal = 50 + ((day - 1) * 20);
      let isMilestone = false;
      let perk = '';

      if (day === 7) {
        rewardVal = 300;
        isMilestone = true;
        perk = '+ 1.2x Multiplier';
      } else if (day === 14) {
        rewardVal = 600;
        isMilestone = true;
        perk = '+ Alpha Pass';
      } else if (day === 21) {
        rewardVal = 900;
        isMilestone = true;
        perk = '+ Silver Crest';
      } else if (day === 30) {
        rewardVal = 1500;
        isMilestone = true;
        perk = '+ OG Discord Role';
      } else if (day === 50) {
        rewardVal = 3500;
        isMilestone = true;
        perk = '+ 1.5x Multiplier';
      } else if (day === 75) {
        rewardVal = 7500;
        isMilestone = true;
        perk = '+ Gold Ambassador';
      } else if (day === 90) {
        rewardVal = 12500;
        isMilestone = true;
        perk = '+ Senator Vote';
      } else if (day === 100) {
        rewardType = 'nft';
        rewardVal = 50000;
        isMilestone = true;
        perk = 'GENESIS 1/1 NFT';
      }

      list.push({ day, rewardType, rewardVal, isMilestone, perk });
    }
    return list;
  }

  async handleClaimDailyStreak(dayNum) {
    if (!db.currentUser) {
      window.location.href = 'signin.html#signup';
      return;
    }

    const currentStreak = Number(db.currentUser.streakDays || 1);
    if (dayNum > currentStreak) {
      alert(`Day ${dayNum} is currently locked! Complete preceding days first to unlock this reward.`);
      return;
    }
    if (dayNum < currentStreak) {
      alert(`Day ${dayNum} has already been claimed! Keep building your streak tomorrow.`);
      return;
    }

    const rewardsList = this.get100DaysRewardData();
    const rewardData = rewardsList.find(r => r.day === dayNum);
    const bonusPoints = rewardData ? rewardData.rewardVal : 50;

    const res = await db.dailyCheckIn(bonusPoints);
    if (res.success) {
      if (dayNum === 100) {
        this.openGenesisNftClaimModal();
      } else {
        this.openDailyRewardSuccessModal(dayNum, bonusPoints, rewardData?.perk);
      }
      this.render();
    } else {
      alert(res.message || 'Check-in failed');
    }
  }

  openDailyRewardSuccessModal(dayNum, points, perk) {
    const existing = document.getElementById('dailyRewardSuccessModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dailyRewardSuccessModal';
    modal.className = 'modal-backdrop open';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';

    modal.innerHTML = `
      <div class="card" style="max-width: 480px; width: 100%; padding: 3rem 2.25rem; text-align: center; border-radius: 32px; border: 2px solid var(--brand-yellow); background: linear-gradient(135deg, rgba(243, 186, 47, 0.15) 0%, rgba(14, 18, 27, 0.98) 100%); box-shadow: 0 0 60px rgba(243, 186, 47, 0.35); position: relative; animation: popInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(243, 186, 47, 0.15); border: 2px solid var(--brand-yellow); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; color: var(--brand-yellow); box-shadow: 0 0 30px rgba(243, 186, 47, 0.4);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>

        <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 900; font-size: 0.8rem; margin-bottom: 1rem; padding: 0.3rem 0.85rem;">
          DAY ${dayNum} CONQUERED!
        </span>

        <h2 style="font-size: 2rem; font-weight: 900; color: #FFFFFF; margin: 0.5rem 0 0.5rem 0; letter-spacing: -0.02em;">
          +${points.toLocaleString()} $BOOBA Claimed
        </h2>

        ${perk ? `
          <div style="font-size: 0.92rem; color: var(--accent-emerald); font-weight: 800; margin-bottom: 1.25rem; background: rgba(16, 185, 129, 0.12); padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid rgba(16, 185, 129, 0.3); width: fit-content; margin-left: auto; margin-right: auto;">
            Perk Unlocked: ${perk}
          </div>
        ` : ''}

        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 2rem;">
          Your consecutive daily check-in streak has increased to <strong>${dayNum} Days</strong>! Return tomorrow to continue your journey toward the <strong>Day 100 Genesis Master NFT</strong>.
        </p>

        <button type="button" class="btn btn-primary btn-lg btn-block" onclick="document.getElementById('dailyRewardSuccessModal').remove()" style="font-weight: 900;">
          Continue Expeditions
        </button>

      </div>
    `;

    document.body.appendChild(modal);
  }

  openGenesisNftClaimModal() {
    const existing = document.getElementById('genesisNftModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'genesisNftModal';
    modal.className = 'modal-backdrop open';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1.5rem;';

    modal.innerHTML = `
      <div class="card" style="max-width: 540px; width: 100%; padding: 3.5rem 2.5rem; text-align: center; border-radius: 36px; border: 2.5px solid #FFD700; background: linear-gradient(135deg, rgba(255, 215, 0, 0.25) 0%, rgba(147, 51, 234, 0.25) 50%, rgba(10, 12, 18, 0.98) 100%); box-shadow: 0 0 80px rgba(255, 215, 0, 0.6), 0 0 120px rgba(147, 51, 234, 0.4); position: relative; animation: popInScale 0.5s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <div style="width: 100px; height: 100px; border-radius: 30px; background: linear-gradient(135deg, #FFD700, #F3BA2F); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.75rem auto; box-shadow: 0 0 50px rgba(255, 215, 0, 0.8);">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="#000000"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>

        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.85rem;">
          <span class="badge-tag" style="background: #FFD700; color: #000; font-weight: 900; font-size: 0.8rem; padding: 0.35rem 0.95rem;">
            100-DAY APEX LEGEND
          </span>
          <span class="badge-tag" style="background: rgba(147, 51, 234, 0.3); color: #C084FC; font-weight: 800; font-size: 0.8rem;">
            BEP-721 1/1 NFT
          </span>
        </div>

        <h2 style="font-size: 2.2rem; font-weight: 900; color: #FFFFFF; margin: 0.5rem 0 0.5rem 0; letter-spacing: -0.02em;">
          Genesis Booba Master NFT Unlocked!
        </h2>

        <div style="font-size: 1.3rem; font-weight: 900; color: var(--brand-yellow); margin-bottom: 1.25rem;" class="text-mono">
          +50,000 $BOOBA Treasury Grant Credited
        </div>

        <p style="color: var(--text-secondary); font-size: 0.92rem; line-height: 1.65; margin-bottom: 2.25rem;">
          You have conquered the 100-Day Ambassador Expedition! You are now enshrined as a Lifetime Genesis Member with 2.5x ecosystem multiplier, BNB Baby Treasury royalty allocation, and founder status.
        </p>

        <button type="button" class="btn btn-primary btn-lg btn-block" onclick="document.getElementById('genesisNftModal').remove()" style="font-weight: 900; font-size: 1.05rem; padding: 1.1rem;">
          Enshrine in Hall of Legends </button>

      </div>
    `;

    document.body.appendChild(modal);
  }

  toggleDailyCardFlip(epochIndex) {
    const wrapper = document.getElementById(`dailyEpochWrapper_${epochIndex}`);
    if (wrapper) {
      wrapper.classList.toggle('is-flipped');
    }
  }

  scrollToDailyEpoch(epochIndex) {
    const track = document.getElementById('dailyEpochTrack');
    const slide = document.getElementById(`dailySlide_${epochIndex}`);
    if (track && slide) {
      const slideLeft = slide.offsetLeft - track.offsetLeft;
      const targetScroll = slideLeft - (track.clientWidth - slide.clientWidth) / 2;
      track.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });

      document.querySelectorAll('[id^="dailyEpochPill_"]').forEach((btn, i) => {
        if (i === epochIndex) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  scrollDailyEpochCarousel(direction) {
    const track = document.getElementById('dailyEpochTrack');
    if (!track) return;
    const slideWidth = track.querySelector('.daily-carousel-slide')?.offsetWidth || 450;
    const scrollAmount = (slideWidth + 32) * direction;
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }


  showTgeWithdrawModal() {
    const existing = document.getElementById('tgeNoticeModal');
    if (existing) existing.remove();

    const user = db.currentUser;
    const modal = document.createElement('div');
    modal.id = 'tgeNoticeModal';
    modal.className = 'modal-backdrop open active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.88); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    modal.innerHTML = `
      <div class="card" style="max-width: 520px; width: 100%; padding: 2.5rem 2rem; border-radius: 28px; border: 1.5px solid rgba(243, 186, 47, 0.45); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); text-align: center; box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 50px rgba(243, 186, 47, 0.25); animation: popInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <div style="width: 70px; height: 70px; border-radius: 22px; background: rgba(243, 186, 47, 0.15); border: 1.5px solid rgba(243, 186, 47, 0.4); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--brand-yellow);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>

        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.65rem;">
          <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-weight: 800; font-size: 0.75rem;">
            MAINNET BRIDGE TIMELOCK
          </span>
        </div>

        <h3 style="font-size: 1.6rem; font-weight: 900; color: #FFFFFF; margin-bottom: 0.6rem; letter-spacing: -0.01em;">
          Withdrawal Available at Token Launch
        </h3>

        <p style="color: var(--text-secondary); font-size: 0.92rem; line-height: 1.65; margin-bottom: 1.75rem;">
          On-chain $BOOBA withdrawals will activate automatically upon the official <strong>Token Generation Event (TGE)</strong> & PancakeSwap liquidity lock on BNB Smart Chain.
        </p>

        <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem; margin-bottom: 1.75rem; text-align: left;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary);">Your Snapshot Balance:</span>
            <strong style="color: var(--brand-yellow); font-family: var(--font-mono);">${Number(user ? user.boobaPoints : 0).toLocaleString()} $BOOBA</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary);">Target Network:</span>
            <strong style="color: #FFFFFF;">BNB Smart Chain (BEP-20)</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Claim Ratio:</span>
            <strong style="color: var(--accent-emerald);">1:1 Guaranteed Mint</strong>
          </div>
        </div>

        <button type="button" class="btn btn-primary btn-lg btn-block" onclick="document.getElementById('tgeNoticeModal').remove()" style="font-weight: 900;">
          Acknowledge & Continue Earning
        </button>

      </div>
    `;

    document.body.appendChild(modal);
  }

  async handleSaveProfileSettings(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('settingsUsernameInput');
    const emailInput = document.getElementById('settingsEmailInput');
    const saveBtn = document.getElementById('saveProfileBtn');

    if (!usernameInput || !emailInput) return;

    const newUsername = usernameInput.value.trim();
    const newEmail = emailInput.value.trim();

    if (!newUsername) {
      alert('Username cannot be empty.');
      return;
    }
    if (!newEmail) {
      alert('Email address cannot be empty.');
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving Profile...';
    }

    const res = await db.updateProfile({
      username: newUsername,
      email: newEmail,
      avatar: this.selectedSettingsAvatar || db.currentUser.avatar
    });

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Profile Changes';
    }

    if (res.success) {
      alert('Profile updated successfully!');
      this.updateNavState();
      this.renderPage();
    } else {
      alert(res.message || 'Failed to update profile.');
    }
  }

  handleAvatarSelect(url) {
    this.selectedSettingsAvatar = url;
    const preview = document.getElementById('settingsAvatarPreview');
    if (preview) preview.src = url;
  }

  async handleChangePasswordSettings(e) {
    e.preventDefault();
    const seedInput = document.getElementById('settingsSeedInput');
    const newPassInput = document.getElementById('settingsNewPassInput');
    const confirmPassInput = document.getElementById('settingsConfirmPassInput');
    const btn = document.getElementById('savePasswordBtn');

    if (!seedInput || !newPassInput || !confirmPassInput) return;

    const seedPhrase = seedInput.value.trim();
    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

    if (newPass !== confirmPass) {
      alert('New passwords do not match. Please re-enter your password.');
      return;
    }

    if (newPass.length < 6) {
      alert('New password must be at least 6 characters long.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying Cryptographic Seed...';
    }

    const res = await db.changePasswordWithSeedPhrase({
      userId: db.currentUser.id,
      seedPhrase,
      newPassword: newPass
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify Seed & Update Password';
    }

    if (res.success) {
      alert('Password successfully updated and secured!');
      seedInput.value = '';
      newPassInput.value = '';
      confirmPassInput.value = '';
    } else {
      alert(res.message || 'Security verification failed.');
    }
  }

  closeModal() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      if (m.id !== 'seedPhraseDynamicModal') {
        m.classList.remove('active');
        m.classList.remove('open');
      }
    });
  }
}

// Attach globally
window.boobaApp = new BoobaApp();

