/* ==========================================================================
   BOOBA (BNB baby) — Master Unified Application Controller (app.js)
   Single JS Core for all pages (index, dashboard, passport, quests, signin, etc.)
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS, PRESALE_CONFIG } from './services/db.js';
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
    this.wcProvider = null;
    this.selectedPresaleUsdt = 100;

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
    if (last === 'presale.html' || last === 'presale' || last === 'launchpad' || last === 'ico') return 'presale';
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
    if (rawPath.includes('/presale') || rawPath.includes('/launchpad')) return 'presale';
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
    if (hash === 'presale' || hash === 'launchpad' || hash.startsWith('dashboard/presale')) return 'presale';
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
        <div class="user-profile-pill" style="display: flex; align-items: center; gap: 0.65rem; background: var(--bg-surface-elevated); padding: 0.35rem 0.85rem; border-radius: var(--radius-full); border: 1.5px solid ${levelInfo.borderColor}; box-shadow: 0 0 15px ${levelInfo.glowColor};">
          <img src="${levelInfo.mascotImage || 'assets/mascot_level1.png'}" style="width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid ${levelInfo.accentColor}; object-fit: cover; background: rgba(0,0,0,0.5);">
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary);">
            ${user.username}
          </div>
          <span style="font-size: 0.78rem; font-weight: 800; color: ${levelInfo.accentColor}; background: ${levelInfo.glowColor}; padding: 0.15rem 0.55rem; border-radius: var(--radius-full); border: 1px solid ${levelInfo.borderColor};">
            Lv.${levelInfo.level} • ${Number(user.boobaPoints).toLocaleString()} BOOBA
          </span>
          <button class="btn btn-ghost btn-sm" onclick="window.boobaApp.logout()" title="Sign Out" style="padding: 0.2rem 0.4rem; color: var(--text-muted);">
            Sign Out
          </button>
        </div>
      `;

      authButtonsMobile = `
        <div style="padding: 0.85rem; background: var(--bg-surface-elevated); border-radius: 16px; margin-bottom: 0.75rem; border: 1.5px solid ${levelInfo.borderColor}; box-shadow: 0 0 15px ${levelInfo.glowColor};">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.65rem;">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <img src="${levelInfo.mascotImage || 'assets/mascot_level1.png'}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid ${levelInfo.accentColor}; object-fit: cover; background: rgba(0,0,0,0.5);">
              <div>
                <div style="font-weight: 800; color: var(--text-primary); font-size: 0.92rem;">${user.username}</div>
                <div style="font-size: 0.75rem; color: ${levelInfo.accentColor}; font-weight: 700;">${Number(user.boobaPoints).toLocaleString()} BOOBA • Lv.${levelInfo.level} ${levelInfo.title}</div>
              </div>
            </div>
            <a href="settings.html" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 0.25rem 0.6rem;">Settings</a>
          </div>
          <button type="button" class="btn ${isWalletConnected ? 'btn-secondary' : 'btn-primary'} btn-block btn-sm" onclick="window.boobaApp.openWalletModal()" style="display: flex; align-items: center; justify-content: center; gap: 0.45rem;">
            <span class="pulse-dot" style="width: 6px; height: 6px; background: ${isWalletConnected ? 'var(--accent-emerald)' : levelInfo.accentColor};"></span>
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
      case 'presale':
        this.renderPresaleView(mainContainer);
        break;
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
              <button type="button" class="btn-auth-pill btn-wallet" onclick="window.boobaApp.openWeb3AuthModal()">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#000000"/>
                  <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#000000" fill-opacity="0.8"/>
                </svg>
                ${isSignUp ? 'Sign Up with Web3 Wallet' : 'Sign In with Web3 Wallet'}
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
  // WEB3 AUTH MODAL ("Continue with Web3 Wallet" - Sign In / Sign Up)
  // --------------------------------------------------------------------------

  openWeb3AuthModal() {
    const existing = document.getElementById('web3AuthDynamicModal') || document.getElementById('walletConnectDynamicModal') || document.getElementById('addWalletDynamicModal');
    if (existing) existing.remove();

    // Trigger fresh EIP-6963 discovery
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eip6963:requestProvider'));
    }

    const modal = document.createElement('div');
    modal.id = 'web3AuthDynamicModal';
    modal.className = 'modal-backdrop open active';
    modal.innerHTML = `
      <div class="wallet-modal-card" style="position: relative; z-index: 1010; max-width: 480px; width: 100%; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.4); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(243, 186, 47, 0.2);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin: 0; line-height: 1.2;">Continue with Web3 Wallet</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">BNB Smart Chain (BEP-20)</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('web3AuthDynamicModal').remove()" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;" aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <!-- Recommendation Notice Popup -->
        <div style="background: rgba(243, 186, 47, 0.1); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 16px; padding: 0.95rem 1.15rem; margin-bottom: 1.25rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55;">
          <div style="display: flex; align-items: center; gap: 0.45rem; font-weight: 800; color: var(--brand-yellow); margin-bottom: 0.3rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Recommendation Notice
          </div>
          <div>We recommend <strong>Sign in with Google</strong> on standard mobile and desktop browsers.</div>
          <div style="margin-top: 0.45rem; color: #FFFFFF; font-weight: 600;">
            Sign up or Sign in with Web3 wallet natively inside your <strong>dApp browser</strong> (Trust Wallet, MetaMask, OKX, Binance Web3) or desktop browser extensions.
          </div>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.1rem;">
          Select your Web3 wallet provider below to authenticate and mint your Booba Passport (+100 BOOBA bonus):
        </p>

        <div id="walletOptionsContainer" class="wallet-options-list"></div>
      </div>
    `;

    document.body.appendChild(modal);
    this.renderWalletOptionsList();
  }

  // --------------------------------------------------------------------------
  // ADD WALLET MODAL (For logged-in users, e.g. Gmail signups - Manual Input)
  // --------------------------------------------------------------------------

  openAddWalletModal() {
    const existing = document.getElementById('addWalletDynamicModal') || document.getElementById('web3AuthDynamicModal') || document.getElementById('walletConnectDynamicModal');
    if (existing) existing.remove();

    const user = db.currentUser;
    const isConnected = Boolean(user && user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const currentAddr = isConnected ? user.walletAddress : '';

    const modal = document.createElement('div');
    modal.id = 'addWalletDynamicModal';
    modal.className = 'modal-backdrop open active';
    modal.innerHTML = `
      <div class="wallet-modal-card" style="position: relative; z-index: 1010; max-width: 480px; width: 100%; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.4); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(243, 186, 47, 0.2);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
            </div>
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin: 0; line-height: 1.2;">Add BEP-20 Wallet</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">BNB Smart Chain (BEP-20)</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('addWalletDynamicModal').remove()" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;" aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
          ${user ? `Link your BEP-20 wallet address to Passport <strong>${user.passportId || 'BB'}</strong> for token rewards and instant $BOOBA withdrawals.` : 'Input your BEP-20 wallet address below to link your account.'}
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

        <!-- Direct Manual BEP-20 Input Box -->
        <div style="background: rgba(243, 186, 47, 0.08); border: 1.5px solid rgba(243, 186, 47, 0.3); border-radius: 18px; padding: 1.25rem; margin-bottom: 1rem;">
          <label style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.4rem; display: block;">
            BEP-20 Wallet Address (0x...)
          </label>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <input type="text" id="manualAddWalletInputAddress" class="form-input text-mono" placeholder="0x... Paste your Trust/MetaMask/Binance address" style="flex: 1; font-size: 0.82rem; padding: 0.65rem 0.85rem; border-radius: 10px; background: rgba(0,0,0,0.5);" value="${currentAddr || ''}">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.boobaApp.pasteWalletAddressFromClipboard('manualAddWalletInputAddress')" style="padding: 0 0.85rem; font-size: 0.78rem; white-space: nowrap;">
              Paste
            </button>
          </div>
          <button type="button" id="saveManualAddWalletBtn" class="btn btn-primary btn-block btn-sm" onclick="window.boobaApp.handleSaveManualWallet()" style="margin-top: 0.85rem; font-weight: 800; font-size: 0.88rem; padding: 0.7rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>Link Wallet to My Account</span>
          </button>
        </div>

        <div style="padding-top: 0.75rem; font-size: 0.76rem; color: var(--text-muted); text-align: center; line-height: 1.45;">
          <strong>Tip:</strong> Open Trust Wallet, MetaMask, or Binance, copy your <strong>BNB Smart Chain (BEP-20)</strong> deposit address, and paste it above.
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // --------------------------------------------------------------------------
  // ADD USERNAME MODAL (For users who registered with wallet in dApp)
  // --------------------------------------------------------------------------

  openAddUsernameModal() {
    const existing = document.getElementById('addUsernameDynamicModal');
    if (existing) existing.remove();

    const user = db.currentUser;
    if (!user) {
      alert('Please sign in or connect your wallet first.');
      return;
    }

    const isDefaultWalletName = (user.username || '').startsWith('BNB_');

    const modal = document.createElement('div');
    modal.id = 'addUsernameDynamicModal';
    modal.className = 'modal-backdrop open active';
    modal.innerHTML = `
      <div class="wallet-modal-card" style="position: relative; z-index: 1010; max-width: 460px; width: 100%; border-radius: 24px; border: 1.5px solid rgba(243, 186, 47, 0.4); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(243, 186, 47, 0.2);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 800; color: #FFFFFF; margin: 0; line-height: 1.2;">${isDefaultWalletName ? 'Add Citizen Username' : 'Edit Username'}</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Booba Passport Identity</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('addUsernameDynamicModal').remove()" style="border-radius: 50%; width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center;" aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.5;">
          Choose your unique citizen username. This name will appear on the global leaderboard, your digital passport, and community quests.
        </p>

        <form id="addUsernameForm" onsubmit="window.boobaApp.handleSaveUsername(event)" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem; display: block;">Username</label>
            <input type="text" id="manualAddUsernameInput" class="x-input-field" placeholder="e.g. CryptoKing" value="${isDefaultWalletName ? '' : user.username}" required maxlength="20" autocomplete="username">
            <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.35rem;">
              3-20 characters: letters, numbers, and underscores only.
            </div>
          </div>

          <button type="submit" id="saveUsernameBtn" class="btn-x-submit" style="margin-top: 0.5rem;">
            Save Username
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // Universal Dispatcher
  openWalletModal(options = {}) {
    if (options?.mode === 'auth' || !db.currentUser) {
      this.openWeb3AuthModal();
    } else {
      this.openAddWalletModal();
    }
  }

  renderWalletOptionsList() {
    const container = document.getElementById('walletOptionsContainer');
    if (!container) return;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const cleanHostAndPath = (window.location.host + window.location.pathname + window.location.search + window.location.hash).replace(/\/+$/, '');
    const fullUrl = window.location.href;

    // Detect installed standard extensions / injected providers
    const hasMetaMask = Boolean(window.ethereum && (window.ethereum.isMetaMask || window.ethereum.providers?.some(p => p.isMetaMask)));
    const hasTrust = Boolean(window.trustwallet || window.ethereum?.isTrust || window.ethereum?.providers?.some(p => p.isTrust || p.isTrustWallet));
    const hasBinance = Boolean(window.BinanceChain || window.ethereum?.isBinance || window.ethereum?.providers?.some(p => p.isBinance));
    const hasOKX = Boolean(window.okxwallet || window.ethereum?.isOkxWallet || window.ethereum?.providers?.some(p => p.isOkxWallet));
    const hasCoinbase = Boolean(window.coinbaseWalletExtension || window.ethereum?.isCoinbaseWallet || window.ethereum?.providers?.some(p => p.isCoinbaseWallet));
    const hasGenericInjected = Boolean(window.ethereum || window.trustwallet || window.okxwallet || window.BinanceChain);

    let html = '';

    // If an injected wallet is active (e.g. inside Trust Wallet/MetaMask App Browser or Desktop Extension)
    if (hasGenericInjected) {
      html += `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1.5px solid rgba(16, 185, 129, 0.4); border-radius: 14px; padding: 0.85rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="pulse-dot" style="width: 8px; height: 8px; background: var(--accent-emerald);"></span>
            <div style="font-size: 0.82rem; font-weight: 700; color: #FFFFFF;">In-App Web3 Provider Detected</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.boobaApp.connectInjectedDirect()" style="font-size: 0.76rem; padding: 0.35rem 0.75rem;">
            1-Click Connect
          </button>
        </div>
      `;
    }

    // Dynamic EIP-6963 Wallets
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

    // 1. Trust Wallet
    html += `
      <div class="wallet-option-item" onclick="window.boobaApp.handleWalletOptionSelect('trust')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(5, 0, 255, 0.15); border: 1px solid rgba(51, 117, 255, 0.3);">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L6 7.5V15C6 22 10.5 27.5 16 29C21.5 27.5 26 22 26 15V7.5L16 3Z" fill="#3375BB"/>
              <path d="M16 5.5L8 9.5V15C8 20.8 11.5 25.5 16 26.8C20.5 25.5 24 20.8 24 15V9.5L16 5.5Z" fill="#0500FF"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Trust Wallet</div>
            <div class="wallet-option-desc">${isMobile ? 'Open & Connect in Trust Wallet App' : 'Multi-chain mobile & browser wallet'}</div>
          </div>
        </div>
        ${hasTrust ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${isMobile ? 'Open App →' : 'Connect →'}</span>`}
      </div>

      <!-- 2. MetaMask -->
      <div class="wallet-option-item" onclick="window.boobaApp.handleWalletOptionSelect('metamask')">
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
            <div class="wallet-option-desc">${isMobile ? 'Open & Connect in MetaMask App' : 'Connect with MetaMask wallet'}</div>
          </div>
        </div>
        ${hasMetaMask ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${isMobile ? 'Open App →' : 'Connect →'}</span>`}
      </div>

      <!-- 3. Binance Web3 Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.handleWalletOptionSelect('binance')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.3);">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#F3BA2F"/>
              <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#F3BA2F"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Binance Web3 Wallet</div>
            <div class="wallet-option-desc">${isMobile ? 'Open in Binance App' : 'Native BNB Chain wallet'}</div>
          </div>
        </div>
        ${hasBinance ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${isMobile ? 'Open App →' : 'Connect →'}</span>`}
      </div>

      <!-- 4. OKX Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.handleWalletOptionSelect('okx')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25);">
            <span style="font-weight: 900; font-size: 14px; color: #FFFFFF;">OKX</span>
          </div>
          <div>
            <div class="wallet-option-title">OKX Wallet</div>
            <div class="wallet-option-desc">${isMobile ? 'Open in OKX App' : 'Multi-chain EVM provider'}</div>
          </div>
        </div>
        ${hasOKX ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${isMobile ? 'Open App →' : 'Connect →'}</span>`}
      </div>

      <!-- 5. WalletConnect (Universal Pairing) -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletConnect()" style="background: rgba(59, 153, 252, 0.1); border: 1px solid rgba(59, 153, 252, 0.35);">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(59, 153, 252, 0.2); border: 1px solid rgba(59, 153, 252, 0.5);">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M6.5 10.5C11.75 5.25 20.25 5.25 25.5 10.5L26.2 11.2C26.5 11.5 26.5 12 26.2 12.3L23.9 14.6C23.7 14.8 23.4 14.8 23.2 14.6L22.2 13.6C18.8 10.2 13.2 10.2 9.8 13.6L8.8 14.6C8.6 14.8 8.3 14.8 8.1 14.6L5.8 12.3C5.5 12 5.5 11.5 5.8 11.2L6.5 10.5ZM29.2 14.2L31.2 16.2C31.5 16.5 31.5 17 31.2 17.3L22.1 26.4C21.8 26.7 21.3 26.7 21 26.4L16 21.4C15.9 21.3 15.7 21.3 15.6 21.4L10.6 26.4C10.3 26.7 9.8 26.7 9.5 26.4L0.4 17.3C0.1 17 0.1 16.5 0.4 16.2L2.4 14.2C2.7 13.9 3.2 13.9 3.5 14.2L8.5 19.2C8.6 19.3 8.8 19.3 8.9 19.2L13.9 14.2C14.2 13.9 14.7 13.9 15 14.2L16 15.2C16.1 15.3 16.3 15.3 16.4 15.2L17.4 14.2C17.7 13.9 18.2 13.9 18.5 14.2L23.5 19.2C23.6 19.3 23.8 19.3 23.9 19.2L28.9 14.2C29 13.9 29.5 13.9 29.2 14.2Z" fill="#3B99FC"/>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">WalletConnect (QR & Pairing)</div>
            <div class="wallet-option-desc">Connect via WalletConnect protocol</div>
          </div>
        </div>
        <span class="wallet-detected-badge" style="background: rgba(59, 153, 252, 0.2); color: #3B99FC; border-color: rgba(59, 153, 252, 0.4);">QR / Pairing</span>
      </div>
    `;

    container.innerHTML = html;
  }

  handleWalletOptionSelect(type) {
    // 1. If provider is directly injected in window (e.g. extension on desktop or inside wallet app), connect immediately
    let injected = this.getInjectedProvider(type);
    if (injected) {
      this.authenticateWithProvider(injected, type);
      return;
    }

    // 2. On Mobile (Chrome / Safari): Use WalletConnect pairing so user connects to their active Chrome account
    this.connectWalletConnect(type);
  }

  getInjectedProvider(type) {
    if (this.eip6963Providers && this.eip6963Providers.size > 0) {
      for (const [key, detail] of this.eip6963Providers.entries()) {
        const info = detail.info || {};
        const rdns = (info.rdns || '').toLowerCase();
        const name = (info.name || '').toLowerCase();
        if (type && (rdns.includes(type) || name.includes(type))) {
          return detail.provider;
        }
      }
    }
    if (type === 'trust') {
      return window.trustwallet?.ethereum || window.trustwallet || window.ethereum?.providers?.find(p => p.isTrust || p.isTrustWallet) || (window.ethereum?.isTrust ? window.ethereum : null);
    }
    if (type === 'metamask') {
      return window.ethereum?.providers?.find(p => p.isMetaMask && !p.isBraveWallet && !p.isTrust && !p.isOkxWallet) || (window.ethereum?.isMetaMask ? window.ethereum : null);
    }
    if (type === 'binance') {
      return window.BinanceChain || window.ethereum?.providers?.find(p => p.isBinance) || (window.ethereum?.isBinance ? window.ethereum : null);
    }
    if (type === 'okx') {
      return window.okxwallet || window.ethereum?.providers?.find(p => p.isOkxWallet) || (window.ethereum?.isOkxWallet ? window.ethereum : null);
    }
    if (type === 'coinbase') {
      return window.coinbaseWalletExtension || window.ethereum?.providers?.find(p => p.isCoinbaseWallet) || (window.ethereum?.isCoinbaseWallet ? window.ethereum : null);
    }
    return window.ethereum || null;
  }

  async connectInjectedDirect() {
    const provider = window.trustwallet?.ethereum || window.trustwallet || window.okxwallet || window.BinanceChain || window.ethereum;
    if (provider) {
      await this.authenticateWithProvider(provider, 'In-App Web3 Wallet');
    }
  }

  async pasteWalletAddressFromClipboard(targetId = 'manualAddWalletInputAddress') {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const input = document.getElementById(targetId) || document.getElementById('manualAddWalletInputAddress') || document.getElementById('manualWalletInputAddress');
        if (input && text) {
          input.value = text.trim();
        }
      } else {
        alert('Please paste your 0x BEP-20 address directly into the field.');
      }
    } catch (e) {
      alert('Please paste your 0x BEP-20 address directly into the field.');
    }
  }

  async handleSaveManualWallet() {
    const input = document.getElementById('manualAddWalletInputAddress') || document.getElementById('manualWalletInputAddress');
    const addr = (input?.value || '').trim();

    if (!addr || !addr.startsWith('0x') || addr.length < 20) {
      alert('Please enter a valid BEP-20 wallet address (starting with 0x...).');
      return;
    }

    const btn = document.getElementById('saveManualAddWalletBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Linking Wallet...';
    }

    try {
      if (db.currentUser) {
        const res = await db.updateWalletAddress(addr);
        if (res.success) {
          alert(`BEP-20 Wallet Linked Successfully!\nAddress: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
          const modal = document.getElementById('addWalletDynamicModal') || document.getElementById('walletConnectDynamicModal');
          if (modal) modal.remove();
          this.renderHeaderNav();
          this.renderPage();
        } else {
          alert(res.message || 'Failed to link wallet address.');
        }
      } else {
        const res = await db.loginOrSignupWithWallet({ walletAddress: addr });
        if (res.success) {
          const modal = document.getElementById('addWalletDynamicModal') || document.getElementById('walletConnectDynamicModal');
          if (modal) modal.remove();
          if (res.isNewUser && res.seedPhrase) {
            this.promptWeb3EmailInputModal(res.user, () => {
              this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
                window.location.href = 'dashboard.html';
              });
            });
          } else {
            this.renderHeaderNav();
            this.renderPage();
          }
        } else {
          alert(res.message || 'Failed to authenticate wallet.');
        }
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Link Wallet to My Account';
      }
    }
  }

  async handleSaveUsername(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('manualAddUsernameInput');
    const username = (input?.value || '').trim();

    if (!username || username.length < 3) {
      alert('Please enter a username with at least 3 characters.');
      return;
    }

    const btn = document.getElementById('saveUsernameBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving Username...';
    }

    try {
      const res = await db.updateUsername(username);
      if (res.success) {
        alert(`Username updated to "@${res.user.username}"!`);
        const modal = document.getElementById('addUsernameDynamicModal');
        if (modal) modal.remove();
        this.renderHeaderNav();
        this.renderPage();
      } else {
        alert(res.message || 'Failed to update username.');
      }
    } catch (err) {
      alert('An unexpected error occurred updating your username.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save Username';
      }
    }
  }

  async handleManualWalletConnect() {
    return this.handleSaveManualWallet();
  }

  async initWalletConnectProvider() {
    if (this.wcProvider) return this.wcProvider;
    try {
      let EthereumProvider = null;
      try {
        const mod = await import('https://esm.sh/@walletconnect/ethereum-provider@2.18.1');
        EthereumProvider = mod.EthereumProvider || mod.default?.EthereumProvider || mod.default;
      } catch (e1) {
        const mod2 = await import('https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.18.1/+esm');
        EthereumProvider = mod2.EthereumProvider || mod2.default?.EthereumProvider || mod2.default;
      }

      if (!EthereumProvider) {
        throw new Error('Unable to load WalletConnect provider bundle');
      }

      this.wcProvider = await EthereumProvider.init({
        projectId: '2f05ae7f0126a4bca992e4785e3bc43e',
        chains: [56],
        optionalChains: [56, 97],
        showQrModal: true,
        metadata: {
          name: 'BOOBA (BNB baby)',
          description: 'Official BOOBA BNB baby community platform on BNB Smart Chain.',
          url: window.location.origin,
          icons: [window.location.origin + '/assets/mascot.jpg']
        },
        qrModalOptions: {
          themeMode: 'dark',
          themeVariables: {
            '--wcm-z-index': '999999',
            '--wcm-accent-color': '#F3BA2F',
            '--wcm-background-color': '#0E121B'
          }
        }
      });

      this.wcProvider.on('display_uri', (uri) => {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        if (isMobile && this.targetWalletDeepLink) {
          const encoded = encodeURIComponent(uri);
          const wallet = this.targetWalletDeepLink;
          if (wallet === 'trust') {
            window.location.href = `trust://wc?uri=${encoded}`;
          } else if (wallet === 'metamask') {
            window.location.href = `metamask://wc?uri=${encoded}`;
          } else if (wallet === 'okx') {
            window.location.href = `okx://wallet/wc?uri=${encoded}`;
          } else if (wallet === 'binance') {
            window.location.href = `bnc://app.binance.com/wc?uri=${encoded}`;
          } else if (wallet === 'coinbase') {
            window.location.href = `cbwallet://wc?uri=${encoded}`;
          } else if (wallet === 'rainbow') {
            window.location.href = `rainbow://wc?uri=${encoded}`;
          } else {
            window.location.href = `wc:${uri}`;
          }
        }
      });

      return this.wcProvider;
    } catch (err) {
      console.warn('WalletConnect initialization notice:', err);
      return null;
    }
  }

  async connectWalletConnect(targetWallet = null) {
    try {
      this.targetWalletDeepLink = targetWallet;
      const modal = document.getElementById('walletConnectDynamicModal');
      if (modal) modal.remove();

      const provider = await this.initWalletConnectProvider();
      if (!provider) {
        alert('Could not initialize WalletConnect. Please check your internet connection.');
        return;
      }

      // If a previous session exists and is active, disconnect to request fresh pairing if needed
      if (provider.session && !provider.connected) {
        try { await provider.disconnect(); } catch (e) {}
      }

      const accounts = await provider.enable();
      if (accounts && accounts.length > 0) {
        const name = targetWallet === 'trust' ? 'Trust Wallet' : (targetWallet === 'metamask' ? 'MetaMask' : (targetWallet === 'binance' ? 'Binance Web3 Wallet' : (targetWallet === 'okx' ? 'OKX Wallet' : 'WalletConnect')));
        await this.authenticateWithProvider(provider, name);
      }
    } catch (err) {
      if (err.message && (err.message.includes('User rejected') || err.message.includes('User closed modal') || err.code === 4001)) {
        console.log('WalletConnect session request closed by user');
      } else {
        console.error('WalletConnect connection error:', err);
        alert(err.message || 'Could not connect via WalletConnect.');
      }
    }
  }

  async connectEIP6963Wallet(key) {
    const detail = this.eip6963Providers.get(key);
    if (!detail || !detail.provider) return;
    await this.authenticateWithProvider(detail.provider, detail.info?.name || 'Web3 Wallet');
  }

  async connectWalletProvider(type) {
    this.handleWalletOptionSelect(type);
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
            this.promptWeb3EmailInputModal(res.user, () => {
              this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
                window.location.href = 'dashboard.html';
              });
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

  promptWeb3EmailInputModal(user, onComplete) {
    const existing = document.getElementById('web3EmailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'web3EmailModal';
    modal.className = 'modal-backdrop open active';
    modal.innerHTML = `
      <div class="glass-panel" style="max-width: 460px; width: 100%; border-radius: 24px; padding: 2.25rem 2rem; border: 1.5px solid var(--brand-yellow); background: rgba(14, 18, 27, 0.98); box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(243, 186, 47, 0.2); position: relative; z-index: 1020; text-align: center;">
        <div style="width: 52px; height: 52px; border-radius: 16px; background: rgba(243, 186, 47, 0.15); border: 1px solid rgba(243, 186, 47, 0.35); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--brand-yellow);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        
        <h3 style="font-size: 1.4rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem;">
          Complete Your Web3 Profile
        </h3>
        <p style="font-size: 0.86rem; color: var(--text-secondary); line-height: 1.55; margin-bottom: 1.5rem;">
          Link your email address to your Booba Passport (<strong style="color: var(--brand-yellow);">${user.passportId || 'BB'}</strong>) for account recovery, reward notifications, and security alerts.
        </p>

        <form id="web3EmailForm" onsubmit="window.boobaApp.submitWeb3Email(event)">
          <div style="margin-bottom: 1.25rem; text-align: left;">
            <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.4rem; display: block;">Email Address</label>
            <input type="email" id="web3EmailField" placeholder="name@example.com" class="form-input" style="font-size: 0.95rem; padding: 0.85rem; border-radius: 12px; width: 100%; box-sizing: border-box; background: rgba(7, 9, 14, 0.8);" required autocomplete="email">
          </div>
          <button type="submit" id="web3EmailSubmitBtn" class="btn btn-primary btn-block btn-lg" style="font-weight: 800; margin-bottom: 0.75rem;">
            Save Email & Continue
          </button>
          <button type="button" class="btn btn-ghost btn-block btn-sm" onclick="window.boobaApp.skipWeb3Email()" style="color: var(--text-muted); font-size: 0.82rem;">
            Skip for now
          </button>
        </form>
      </div>
    `;

    this._pendingWeb3EmailCallback = onComplete;
    document.body.appendChild(modal);
  }

  async submitWeb3Email(e) {
    e.preventDefault();
    const email = document.getElementById('web3EmailField')?.value.trim();
    const btn = document.getElementById('web3EmailSubmitBtn');
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving Email...';
    }

    if (db.currentUser && supabase) {
      try {
        await supabase
          .from('booba_users')
          .update({ email: email.toLowerCase() })
          .eq('id', db.currentUser.id);
        db.currentUser.email = email.toLowerCase();
        db.saveLocalSession(db.currentUser);
        db.notify();
      } catch (err) {
        console.warn('Email update notice:', err);
      }
    }

    const modal = document.getElementById('web3EmailModal');
    if (modal) modal.remove();

    if (this._pendingWeb3EmailCallback) {
      this._pendingWeb3EmailCallback();
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  skipWeb3Email() {
    const modal = document.getElementById('web3EmailModal');
    if (modal) modal.remove();
    if (this._pendingWeb3EmailCallback) {
      this._pendingWeb3EmailCallback();
    } else {
      window.location.href = 'dashboard.html';
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
            <strong>3% Buy & 3% Sell Tax</strong> Protocol Growth & Liquidity
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
              Mint your digital Booba Passport, conquer live bounties, level up your citizen rank, and claim your share of the 1,000,000,000 $BOOBA treasury.
            </p>

            <div class="hero-actions">
              <a href="presale.html" class="btn btn-primary btn-lg" style="background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; font-weight: 800; display: inline-flex; align-items: center; gap: 0.5rem; box-shadow: 0 0 25px rgba(243, 186, 47, 0.4);">
                <span class="pulse-dot" style="width: 7px; height: 7px; background: #000;"></span>
                <span>⚡ Join Presale (Stage 1 Live)</span>
              </a>
              ${user ? `
                <a href="withdraw.html" class="btn btn-secondary btn-lg" style="display: inline-flex; align-items: center; gap: 0.45rem;">
                  <span>Withdraw</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
              ` : `
                <a href="signin.html#signup" class="btn btn-secondary btn-lg">
                  Mint Passport (+100 BOOBA)
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
            </div>
          </div>
        </div>
      </section>

      
            <!-- 3. ABOUT THE TOKEN (HOMEPAGE SHOWCASE - COINBASE FLAGSHIP STYLE) -->
      <section class="section-container coinbase-about-token-section" id="homeAboutTokenSection">
        <div class="coinbase-showcase-stage">
          <div class="container">
            
            <div class="section-header showcase-section-header">
              <h2 class="section-title showcase-main-heading">About The <span class="text-gradient-gold">$BOOBA</span> Token</h2>
            </div>

            <div class="coinbase-showcase-container">
              
              <!-- PILLAR 1: Built on BNB Smart Chain -->
              <div class="coinbase-showcase-row active">
                <div class="coinbase-content-col">
                  <div class="coinbase-text-block">
                    <h2 class="coinbase-hero-title">
                      Engineered on BNB Smart Chain
                    </h2>
                    <p class="coinbase-hero-desc">
                      Natively deployed on the high-throughput, low-latency BNB Smart Chain (BSC) with full EVM compatibility, sub-second block settlement times, negligible network gas fees, and institutional-grade Proof-of-Authority security.
                    </p>
                  </div>

                  <div class="coinbase-actions-group">
                    <a href="about.html" class="coinbase-action-btn">
                      <span>Learn more</span>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </a>
                    <a href="https://bscscan.com/token/0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B" target="_blank" rel="noopener" class="btn btn-secondary" style="border-radius: 9999px; padding: 0.95rem 1.6rem; font-weight: 700; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 0.4rem; border: 1.5px solid rgba(255, 255, 255, 0.2);">
                      <span>View on BscScan</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </a>
                  </div>
                </div>
                <div class="coinbase-canvas-col">
                <div class="booba-showcase-canvas">
                  <div class="booba-canvas-glow"></div>

                  <!-- Video Scene 1: Blockchain Engine & Sub-Second Settlement -->
                  <div class="video-scene-stage">
                    <div class="story-video-theater">
                      
                      <!-- Brand Anchor Header -->
                      <div class="story-brand-header">
                        <div class="story-brand-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                          </svg>
                        </div>
                        <div>
                          <div class="story-brand-title text-gradient-gold">BNB SMART CHAIN (BSC)</div>
                          <div class="story-brand-subtitle">High-Throughput EVM Layer 1 • Chain ID 56</div>
                        </div>
                      </div>

                      <!-- 3-Act Cinematic Viewport -->
                      <div class="story-timeline-stage">
                        
                        <!-- Act 1: Action Command Input -->
                        <div class="story-act-layer act-1">
                          <div class="story-search-bar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-yellow)" stroke-width="2.5"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                            <span class="search-input-mock">
                              <span>Deploy $BOOBA Smart Contract...</span>
                              <span class="typing-cursor"></span>
                            </span>
                            <span class="search-btn-badge">BEP-20</span>
                          </div>
                        </div>

                        <!-- Act 2: Mining Highway & Validator Consensus -->
                        <div class="story-act-layer act-2">
                          <div class="story-scanner-card">
                            <div class="scanner-top-row">
                              <span style="color: var(--brand-yellow); display: flex; align-items: center; gap: 0.4rem;">
                                <span class="pulse-dot-green"></span>
                                <span>Block #42,891,850 Mined</span>
                              </span>
                              <span style="color: #10B981;">0.8s Validation</span>
                            </div>
                            <div class="scan-radar-line">
                              <div class="scan-radar-beam"></div>
                            </div>
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; justify-content: space-between;">
                              <span>PoSA Validators: 21/21 Signed</span>
                              <span style="color: var(--brand-yellow);">Gas: $0.003</span>
                            </div>
                          </div>
                        </div>

                        <!-- Act 3: Settlement Confirmation Result Card -->
                        <div class="story-act-layer act-3">
                          <div class="story-result-card">
                            <div class="result-talent-row">
                              <img src="assets/coin.jpg" class="result-talent-avatar" style="border-color: var(--brand-yellow); box-shadow: 0 0 15px rgba(243,186,47,0.4);" alt="Coin">
                              <div>
                                <div class="result-talent-name">Sub-Second Settlement Confirmed</div>
                                <div class="result-talent-badge" style="color: #10B981;">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  <span>2,500+ TPS • &lt; $0.005 Avg Gas Fee</span>
                                </div>
                              </div>
                            </div>
                            <div class="result-footer-row">
                              <span style="color: var(--text-secondary);">Contract: 0x005f...B21B</span>
                              <span class="result-hire-pill" style="background: rgba(243,186,47,0.15); border-color: rgba(243,186,47,0.4); color: var(--brand-yellow); display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Mainnet Live</span>
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                  <!-- Video Player Footer & Scrubber -->
                  <div class="video-player-footer">
                    <div class="video-scrubber-track">
                      <div class="video-scrubber-fill"></div>
                    </div>
                    <div class="video-scrubber-meta">
                      <span><span class="meta-highlight">PoSA Consensus</span> • 3.0s Block Finality</span>
                      <span>00:08 / 00:08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PILLAR 2: 100% Powered by the Community -->
            <div class="coinbase-showcase-row reverse">
              <div class="coinbase-content-col">
                <div class="coinbase-text-block">
                  <h2 class="coinbase-hero-title">
                    100% Powered by the Community
                  </h2>
                  <p class="coinbase-hero-desc">
                    At its core, $BOOBA is driven entirely by its vibrant worldwide community. Through decentralized engagement rewards, daily quest bounties, viral creator incentives, and open governance, every milestone is shaped by active holders.
                  </p>
                </div>
                <div class="coinbase-actions-group">
                  <a href="quests.html" class="coinbase-action-btn">
                    <span>Join Community</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
              <div class="coinbase-canvas-col">
                <div class="booba-showcase-canvas community-theme">
                  <div class="booba-canvas-glow glow-emerald"></div>

                  <!-- Video Scene 2: Community Bounty & Reward Drop -->
                  <div class="video-scene-stage">
                    <div class="story-video-theater">
                      
                      <!-- Brand Anchor Header -->
                      <div class="story-brand-header" style="border-color: rgba(16,185,129,0.3);">
                        <div class="story-brand-icon icon-emerald">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </div>
                        <div>
                          <div class="story-brand-title" style="color: var(--accent-emerald);">100% COMMUNITY ECOSYSTEM</div>
                          <div class="story-brand-subtitle">Fair Launch • Proof-of-Engagement Rewards</div>
                        </div>
                      </div>

                      <!-- 3-Act Cinematic Viewport -->
                      <div class="story-timeline-stage">
                        
                        <!-- Act 1: Quest Dispatch Prompt -->
                        <div class="story-act-layer act-1">
                          <div class="story-search-bar theme-emerald">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>
                            <span class="search-input-mock">
                              <span>Bounty: Create Viral Meme Quest...</span>
                              <span class="typing-cursor cursor-emerald"></span>
                            </span>
                            <span class="search-btn-badge" style="background: var(--accent-emerald); color: #07090E;">+500 BOOBA</span>
                          </div>
                        </div>

                        <!-- Act 2: Proof Verification & Consensus -->
                        <div class="story-act-layer act-2">
                          <div class="story-scanner-card" style="border-color: rgba(16,185,129,0.3);">
                            <div class="scanner-top-row">
                              <span style="color: var(--accent-emerald); display: flex; align-items: center; gap: 0.4rem;">
                                <span class="pulse-dot-emerald"></span>
                                <span>@CryptoKing Submitted Proof</span>
                              </span>
                              <span style="color: var(--brand-yellow);">DAO Voting</span>
                            </div>
                            <div class="scan-radar-line">
                              <div class="scan-radar-beam beam-emerald"></div>
                            </div>
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; justify-content: space-between; align-items: center;">
                              <span>Community Votes: 100% Approval</span>
                              <span style="color: #10B981; display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Proof Verified</span></span>
                            </div>
                          </div>
                        </div>

                        <!-- Act 3: Instant Airdrop Reward Result Card -->
                        <div class="story-act-layer act-3">
                          <div class="story-result-card result-emerald">
                            <div class="result-talent-row">
                              <img src="assets/mascot.jpg" class="result-talent-avatar" style="border-color: var(--accent-emerald); box-shadow: 0 0 15px rgba(16,185,129,0.4);" alt="Mascot">
                              <div>
                                <div class="result-talent-name">+500 $BOOBA Reward Sent!</div>
                                <div class="result-talent-badge" style="color: var(--accent-emerald);">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  <span>400,000,000 $BOOBA Vault Pool</span>
                                </div>
                              </div>
                            </div>
                            <div class="result-footer-row">
                              <span style="color: var(--text-secondary);">Streak Boost: 7 Days Active</span>
                              <span class="result-hire-pill" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Instant On-Chain</span>
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                  <!-- Video Player Footer & Scrubber -->
                  <div class="video-player-footer">
                    <div class="video-scrubber-track">
                      <div class="video-scrubber-fill fill-emerald"></div>
                    </div>
                    <div class="video-scrubber-meta">
                      <span><span class="meta-highlight">100% Community-Led</span> • Proof-of-Engagement</span>
                      <span>00:08 / 00:08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PILLAR 3: Founder & Engine of Booba Market -->
            <div class="coinbase-showcase-row">
              <div class="coinbase-content-col">
                <div class="coinbase-text-block">
                  <h2 class="coinbase-hero-title">
                    Architect of Booba Market
                  </h2>
                  <p class="coinbase-hero-desc">
                    $BOOBA is the foundational cryptocurrency and core economic engine behind <strong>Booba Market</strong> — an innovative platform that empowers individuals to discover jobs, freelance opportunities, and professional services with verifiable Web3 reputation.
                  </p>
                </div>
                <div class="coinbase-actions-group">
                  <a href="about.html" class="coinbase-action-btn">
                    <span>Explore Booba Market</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
              <div class="coinbase-canvas-col">
                <div class="booba-showcase-canvas market-theme">
                  <div class="booba-canvas-glow glow-purple"></div>

                  <!-- Video Scene 3: Building SVG, Search Query & Result Card -->
                  <div class="video-scene-stage">
                    <div class="story-video-theater">
                      
                      <!-- Brand Anchor: Animated Building SVG + BOOBA MARKET text -->
                      <div class="story-brand-header" style="border-color: rgba(139,92,246,0.35);">
                        <div class="story-brand-icon icon-purple">
                          <!-- Animated Web3 Marketplace Storefront / Building SVG -->
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 21h18"></path>
                            <path d="M5 21V7l7-4 7 4v14"></path>
                            <path d="M9 10h1"></path>
                            <path d="M14 10h1"></path>
                            <path d="M9 14h1"></path>
                            <path d="M14 14h1"></path>
                            <path d="M10 21v-4h4v4"></path>
                          </svg>
                        </div>
                        <div>
                          <div class="story-brand-title" style="color: var(--accent-purple);">BOOBA MARKET</div>
                          <div class="story-brand-subtitle">Web3 Freelance, Services & Jobs Hub</div>
                        </div>
                      </div>

                      <!-- 3-Act Cinematic Viewport -->
                      <div class="story-timeline-stage">
                        
                        <!-- Act 1: Search Bar Pill with animated typing "I need a carpenter..." -->
                        <div class="story-act-layer act-1">
                          <div class="story-search-bar theme-purple">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <span class="search-input-mock">
                              <span>I need a carpenter...</span>
                              <span class="typing-cursor cursor-purple"></span>
                            </span>
                            <span class="search-btn-badge" style="background: var(--accent-purple); color: #FFFFFF;">Search</span>
                          </div>
                        </div>

                        <!-- Act 2: Live Credential Scan & Match -->
                        <div class="story-act-layer act-2">
                          <div class="story-scanner-card" style="border-color: rgba(139,92,246,0.3);">
                            <div class="scanner-top-row">
                              <span style="color: var(--accent-purple); display: flex; align-items: center; gap: 0.4rem;">
                                <span class="pulse-dot-purple"></span>
                                <span>Searching Web3 Talent Network...</span>
                              </span>
                              <span style="color: var(--brand-yellow);">1 Match Found</span>
                            </div>
                            <div class="scan-radar-line">
                              <div class="scan-radar-beam beam-purple"></div>
                            </div>
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; justify-content: space-between; align-items: center;">
                              <span>Category: Master Carpentry & Build</span>
                              <span style="color: #10B981; display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Escrow Ready</span></span>
                            </div>
                          </div>
                        </div>

                        <!-- Act 3: Professional Search Result Card & Instant Escrow Hire -->
                        <div class="story-act-layer act-3">
                          <div class="story-result-card result-purple">
                            <div class="result-talent-row">
                              <img src="assets/mascot.jpg" class="result-talent-avatar" alt="Talent Avatar">
                              <div>
                                <div class="result-talent-name">Alex D. (Master Carpenter & Builder)</div>
                                <div class="result-talent-badge" style="display: flex; align-items: center; gap: 0.35rem;">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--brand-yellow)" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                  <span>5.0 (48 Jobs Completed on BSC)</span>
                                </div>
                              </div>
                            </div>
                            <div class="result-footer-row">
                              <span style="color: var(--brand-yellow); font-weight: 800;">250 $BOOBA / Service</span>
                              <span class="result-hire-pill">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                <span>Smart Escrow Hire</span>
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                  <!-- Video Player Footer & Scrubber -->
                  <div class="video-player-footer">
                    <div class="video-scrubber-track">
                      <div class="video-scrubber-fill fill-purple"></div>
                    </div>
                    <div class="video-scrubber-meta">
                      <span><span class="meta-highlight">Verifiable Reputation</span> • Direct P2P Escrow</span>
                      <span>00:08 / 00:08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PILLAR 4: Multi-Functional Utility Token -->
            <div class="coinbase-showcase-row reverse">
              <div class="coinbase-content-col">
                <div class="coinbase-text-block">
                  <h2 class="coinbase-hero-title">
                    A Multi-Functional Utility Token
                  </h2>
                  <p class="coinbase-hero-desc">
                    Far beyond a digital currency, $BOOBA serves as the primary utility token across the ecosystem — unlocking reputation passport tiers (Lv.1 to Lv.10), powering daily arcade reward multipliers, marketplace transactions, and decentralized governance voting.
                  </p>
                </div>
                <div class="coinbase-actions-group">
                  <a href="about.html" class="coinbase-action-btn">
                    <span>Discover Utilities</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
              <div class="coinbase-canvas-col">
                <div class="booba-showcase-canvas utility-theme">
                  <div class="booba-canvas-glow glow-orange"></div>

                  <!-- Video Scene 4: Passport Leveling, Citizen Multipliers & DAO Governance -->
                  <div class="video-scene-stage">
                    <div class="story-video-theater">
                      
                      <!-- Brand Anchor Header -->
                      <div class="story-brand-header" style="border-color: rgba(255,122,0,0.35);">
                        <div class="story-brand-icon icon-orange">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                          </svg>
                        </div>
                        <div>
                          <div class="story-brand-title" style="color: var(--accent-orange);">DYNAMIC UTILITY MATRIX</div>
                          <div class="story-brand-subtitle">10 Passport Tiers • Multipliers • DAO Governance</div>
                        </div>
                      </div>

                      <!-- 3-Act Cinematic Viewport -->
                      <div class="story-timeline-stage">
                        
                        <!-- Act 1: Action Input -->
                        <div class="story-act-layer act-1">
                          <div class="story-search-bar theme-orange">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            <span class="search-input-mock">
                              <span>Upgrading to Lv.10 Emperor Passport...</span>
                              <span class="typing-cursor cursor-orange"></span>
                            </span>
                            <span class="search-btn-badge" style="background: var(--accent-orange); color: #FFFFFF;">Boost</span>
                          </div>
                        </div>

                        <!-- Act 2: Passport Level Up Progression -->
                        <div class="story-act-layer act-2">
                          <div class="story-scanner-card" style="border-color: rgba(255,122,0,0.3);">
                            <div class="scanner-top-row">
                              <span style="color: var(--accent-orange); display: flex; align-items: center; gap: 0.4rem;">
                                <span class="pulse-dot-orange"></span>
                                <span style="display: inline-flex; align-items: center; gap: 0.3rem;">Passport Leveling: Lv.1 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg> Lv.10</span>
                              </span>
                              <span style="color: var(--brand-yellow); display: inline-flex; align-items: center; gap: 0.3rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path></svg> <span>Max Tier</span></span>
                            </div>
                            <div class="scan-radar-line">
                              <div class="scan-radar-beam beam-orange"></div>
                            </div>
                            <div style="font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; justify-content: space-between; align-items: center;">
                              <span>Citizen Rank Multiplier: 3.5X Boost</span>
                              <span style="color: #10B981; display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>DAO Power Unlocked</span></span>
                            </div>
                          </div>
                        </div>

                        <!-- Act 3: Multiplier & DAO Governance Result Card -->
                        <div class="story-act-layer act-3">
                          <div class="story-result-card result-orange">
                            <div class="result-talent-row">
                              <div class="multiplier-gauge-circle" style="width: 44px; height: 44px; border-width: 2px; flex-shrink: 0;">
                                <span class="gauge-num text-gradient-gold" style="font-size: 0.95rem;">3.5X</span>
                              </div>
                              <div>
                                <div class="result-talent-name">Lv.10 Emperor Multiplier!</div>
                                <div class="result-talent-badge" style="color: var(--accent-orange);">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                  <span>10,000 DAO Votes (1 Token = 1 Vote)</span>
                                </div>
                              </div>
                            </div>
                            <div class="result-footer-row">
                              <span style="color: var(--text-secondary);">Proposal #08: Passed (98.7%)</span>
                              <span class="result-hire-pill" style="background: rgba(255,122,0,0.15); border-color: rgba(255,122,0,0.4); color: var(--accent-orange); display: inline-flex; align-items: center; gap: 0.35rem;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                <span>Active Governance</span>
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>

                  <!-- Video Player Footer & Scrubber -->
                  <div class="video-player-footer">
                    <div class="video-scrubber-track">
                      <div class="video-scrubber-fill fill-orange"></div>
                    </div>
                    <div class="video-scrubber-meta">
                      <span><span class="meta-highlight">10 Passport Tiers</span> • 3.5X Multiplier • DAO Governance</span>
                      <span>00:08 / 00:08</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>

      <section class="section-container pipeline-section" style="padding: 6rem 0;">
        <div class="container">
          <div class="section-header text-center" style="margin-bottom: 3.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
            <h2 class="section-title pipeline-main-heading">Earn in <span class="text-gradient-gold">4 Simple Steps</span></h2>
          </div>

          <div class="pipeline-showcase-stack">
            
            <!-- STEP 01 -->
            <div class="pipeline-showcase-card">
              <div class="pipeline-card-glow-1" aria-hidden="true"></div>
              <div class="pipeline-card-glow-2" aria-hidden="true"></div>
              <div class="pipeline-card-grid-texture" aria-hidden="true"></div>
              
              <div class="pipeline-card-content">
                <div class="pipeline-step-badge">
                  <span>STEP 01</span>
                </div>
                <h3 class="pipeline-showcase-title">Mint Passport</h3>
                <p class="pipeline-showcase-desc">
                  Sign up with 1-click Google OAuth or your username to instantly receive your digital Booba Passport and claim your +100 $BOOBA bonus.
                </p>
                <div class="pipeline-card-action">
                  <a href="signin.html#signup" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                    <span>Mint Free Passport (+100 BOOBA)</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
            </div>

            <!-- STEP 02 -->
            <div class="pipeline-showcase-card">
              <div class="pipeline-card-glow-1" aria-hidden="true"></div>
              <div class="pipeline-card-glow-2" aria-hidden="true"></div>
              <div class="pipeline-card-grid-texture" aria-hidden="true"></div>
              
              <div class="pipeline-card-content">
                <div class="pipeline-step-badge">
                  <span>STEP 02</span>
                </div>
                <h3 class="pipeline-showcase-title">Save Master Key</h3>
                <p class="pipeline-showcase-desc">
                  Save your private 12-word cryptographic seed phrase for 100% non-custodial password recovery, asset safety, and sovereign account security.
                </p>
                <div class="pipeline-card-action">
                  <a href="passport.html" class="btn btn-secondary btn-lg" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                    <span>Explore Passport Architecture</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
            </div>

            <!-- STEP 03 -->
            <div class="pipeline-showcase-card">
              <div class="pipeline-card-glow-1" aria-hidden="true"></div>
              <div class="pipeline-card-glow-2" aria-hidden="true"></div>
              <div class="pipeline-card-grid-texture" aria-hidden="true"></div>
              
              <div class="pipeline-card-content">
                <div class="pipeline-step-badge">
                  <span>STEP 03</span>
                </div>
                <h3 class="pipeline-showcase-title">Conquer Quests</h3>
                <p class="pipeline-showcase-desc">
                  Complete daily check-in streaks, viral meme bounties, and community challenges published by the core studio team to stack rewards.
                </p>
                <div class="pipeline-card-action">
                  <a href="quests.html" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                    <span>Explore Live Quests</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
            </div>

            <!-- STEP 04 -->
            <div class="pipeline-showcase-card">
              <div class="pipeline-card-glow-1" aria-hidden="true"></div>
              <div class="pipeline-card-glow-2" aria-hidden="true"></div>
              <div class="pipeline-card-grid-texture" aria-hidden="true"></div>
              
              <div class="pipeline-card-content">
                <div class="pipeline-step-badge">
                  <span>STEP 04</span>
                </div>
                <h3 class="pipeline-showcase-title">Claim & Level Up</h3>
                <p class="pipeline-showcase-desc">
                  Climb to Lv.10 Booba Commander, climb the community leaderboard, and lock in your share of exclusive airdrop snapshots and multiplier boosts.
                </p>
                <div class="pipeline-card-action">
                  <a href="leaderboard.html" class="btn btn-secondary btn-lg" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                    <span>View Leaderboard Rankings</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </a>
                </div>
              </div>
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
                  <a href="dashboard.html" class="btn btn-primary btn-lg" style="display: inline-flex; align-items: center; gap: 0.45rem;">
                    <span>Launch My Dashboard</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                  </a>
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
                  <div style="font-size: 0.64rem; color: var(--text-secondary);">Rewards Vault</div>
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
          
          <!-- ABOUT PAGE MAIN HEADING -->
          <div class="about-hero-header">
            <h1 class="page-title hero-title about-hero-title">
              About <span class="text-gradient-gold">Our Token</span>
            </h1>
          </div>

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
                    <div class="tv-channel-dot active" onclick="window.boobaApp.setTvStatSlide(0)" title="Channel 1: BOOBA Live"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(1)" title="Channel 2: Token Name"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(2)" title="Channel 3: Token Symbol"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(3)" title="Channel 4: Token Nickname"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(4)" title="Channel 5: Live Price"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(5)" title="Channel 6: 24h Volume"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(6)" title="Channel 7: Liquidity"></div>
                    <div class="tv-channel-dot" onclick="window.boobaApp.setTvStatSlide(7)" title="Channel 8: Market Cap"></div>
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
                <div class="tv-market-telemetry-widget" style="width: 100%; max-width: 640px; margin: 0 auto;">
                  <div style="text-align: center; margin-bottom: 1rem;">
                    <div style="font-size: 1.4rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-heading);">
                      BOOBA Live
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; width: 100%; text-align: left;">
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Price</div>
                      <div style="font-size: 1.18rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);" id="tvLivePrice">$0.00</div>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">24h Volume</div>
                      <div style="font-size: 1.18rem; font-weight: 900; color: var(--accent-emerald); font-family: var(--font-mono);" id="tvLiveVol">$0.00</div>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Liquidity</div>
                      <div style="font-size: 1.18rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono);" id="tvLiveLiq">$0.00</div>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Market Cap</div>
                      <div style="font-size: 1.18rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);" id="tvLiveMcap">$0.00</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      
      
      
      
      <!-- ==========================================================================
           ABOUT THE TOKEN: SPAROPAY SCROLL-PINNED 8-STEP PRESENTATION (EDITORIAL WATERMARK)
           ========================================================================== -->
      <section class="sparo-token-showcase-section" id="sparoTokenShowcaseSection">
        <div class="sparo-sticky-stage" id="sparoStickyStage">
          
          <!-- Ambient Radial Glow & Dot Matrix -->
          <div class="sparo-unboxed-ambient-glow"></div>
          <div class="sparo-unboxed-matrix-grid"></div>
          
          <div class="container" style="max-width: 1240px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 2.5rem 1.5rem; position: relative; z-index: 10;">
            
            <!-- TOP HEADER (BOLD HEADER TEXT) -->
            <div style="text-align: center; width: 100%; padding-bottom: 0.75rem;">
              <h3 style="font-size: clamp(1.4rem, 2.8vw, 2.1rem); font-weight: 900; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.08em; margin: 0; text-shadow: 0 0 25px rgba(243, 186, 47, 0.3);">
                About The Token
              </h3>
            </div>

            <!-- CENTER STAGE: EDITORIAL WATERMARK PRESENTATION -->
            <div class="sparo-unboxed-center-viewport">
              
          <div class="sparo-unboxed-slide active" id="sparoSlide0">
            <!-- SLIDE BACKDROP IMAGE (MOBILE FULLSCREEN & DESKTOP AMBIENCE) -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level1.png" alt="Verified BEP-20 Contract" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">01</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                Verified BEP-20 Smart Contract
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                Natively deployed on BNB Smart Chain with a permanently verified, immutable contract architecture. Zero proxy vulnerabilities, 100% open-source transparency on BscScan.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="https://bscscan.com/token/0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B" target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;">
                  <span>View on BscScan</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide1">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level2.png" alt="Fixed Total Supply" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">02</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                100 Quadrillion Fixed Total Supply
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                Strictly hard-capped at 100,000,000,000,000,000 $BOOBA tokens minted at genesis on BNB Chain. No additional tokens can ever be minted, guaranteeing complete protection against inflationary dilution.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="#tokenomics" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;">
                  <span>Explore Token Distribution</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide2">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level3.png" alt="3% Buy & 3% Sell Tax" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">03</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                3% Buy & 3% Sell Tax
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                A sustainable 3% Buy and 3% Sell protocol tax dedicated to liquidity pool depth, staking rewards, and continuous global marketing initiatives to ensure long-term ecosystem growth.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="https://pancakeswap.finance" target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;">
                  <span>Trade on PancakeSwap</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide3">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level4.png" alt="Community-First Architecture" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">04</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                Community-First Economic Architecture
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                Engineered to empower every citizen. Combining 40% locked PancakeSwap liquidity, 20% high-yield staking and multiplier rewards, and 10% community development grants, the $BOOBA ecosystem ensures sustainable value and decentralized growth for all holders.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="#tokenomics" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;">
                  <span>Explore Tokenomics</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide4">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level5.png" alt="Liquidity Lock" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">05</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                24-Month Liquidity Lock
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                100% of decentralized exchange liquidity is locked for 24 months via verifiable smart contract timelocks on BNB Smart Chain for complete rug-proof investor protection.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="https://bscscan.com" target="_blank" rel="noopener" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;">
                  <span>Verify Timelock on BscScan</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide5">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level6.png" alt="Smart Contract" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">06</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                Official Smart Contract
              </h2>

              <!-- CONTRACT ADDRESS MONOSPACE DISPLAY -->
              <div style="margin: 0.5rem 0 1.25rem 0;">
                <span class="text-mono" style="font-size: clamp(0.9rem, 2.2vw, 1.35rem); font-weight: 800; color: var(--brand-yellow); background: rgba(243, 186, 47, 0.08); padding: 0.6rem 1.4rem; border-radius: 14px; border: 1.5px solid rgba(243, 186, 47, 0.35); display: inline-block; word-break: break-all;">
                  0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B
                </span>
              </div>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                Verified BEP-20 immutable contract architecture natively deployed on BNB Smart Chain with 100% open-source transparency and zero proxy vulnerabilities.
              </p>

              <!-- BUTTONS (COPY & VIEW ON BSCSCAN) -->
              <div style="margin-top: 1.5rem; display: flex; gap: 0.85rem; justify-content: center; flex-wrap: wrap; width: 100%;">
                <button type="button" onclick="window.boobaApp.copyContractAddress()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>Copy Contract</span>
                </button>
                <a href="https://bscscan.com/token/0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B" target="_blank" rel="noopener" class="btn btn-secondary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2rem; font-weight: 800; font-size: 1rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
                  <span>View on BscScan</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide6">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level7.png" alt="Passport Progression" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">07</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                10 Passport Progression Tiers
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                Every citizen mints a non-custodial digital Booba Passport secured by a 12-word cryptographic seed phrase, leveling up from Level 1 Baby to Level 10 Master.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="passport.html" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center;">
                  <span>Mint Your Passport →</span>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
          <div class="sparo-unboxed-slide " id="sparoSlide7">
            <!-- SLIDE BACKDROP IMAGE -->
            <div class="sparo-slide-backdrop">
              <img src="assets/mascot_level10.png" alt="DAO Governance" class="sparo-slide-backdrop-img">
              <div class="sparo-slide-backdrop-overlay"></div>
            </div>

            <!-- LEFT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-left">08</div>

            <!-- CENTER CONTENT WRAP -->
            <div class="sparo-unboxed-content-wrap">
              
              <!-- GIANT TITLE -->
              <h2 class="sparo-unboxed-title">
                DAO Governance & Community Voting
              </h2>

              <!-- DESCRIPTION -->
              <p class="sparo-unboxed-desc">
                The $BOOBA coin grants decentralized voting rights on community treasury allocations, ecosystem grants, partnership proposals, and protocol roadmap decisions.
              </p>

              <!-- BUTTON -->
              <div style="margin-top: 1.5rem; width: 100%; display: flex; justify-content: center;">
                <a href="quests.html" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 0.9rem 2.4rem; font-weight: 800; font-size: 1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); display: inline-flex; align-items: center; justify-content: center;">
                  <span>Explore Ecosystem Utilities →</span>
                </a>
              </div>

            </div>

            <!-- RIGHT AMBIENT WATERMARK NUMBER (LOW OPACITY) -->
            <div class="sparo-watermark-right">08</div>

          </div>
        
            </div>

            <!-- EMPTY BOTTOM SPACER FOR BALANCE -->
            <div style="height: 1.5rem;"></div>

          </div>
        </div>
      </section>
    

      <!-- ==========================================================================
           3. UNBOXED 2D TOKEN ALLOCATION SHOWCASE (PRO EXPANSIVE DIAGRAMS)
           ========================================================================== -->
      <section id="tokenomics" class="section-container" style="padding: 6rem 0; background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle);">
        <div class="container">
          
          <!-- SECTION HEADER (BOLD GOLD HEADER TEXT) -->
          <div style="text-align: center; width: 100%; margin-bottom: 3.5rem;">
            <h3 style="font-size: clamp(1.4rem, 2.8vw, 2.1rem); font-weight: 900; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.08em; margin: 0; text-shadow: 0 0 25px rgba(243, 186, 47, 0.3);">
              Tokenomics
            </h3>
          </div>

          <!-- COINBASE SPLIT STAGE: LEFT TYPOGRAPHY + RIGHT PRO 2D DIAGRAM -->
          <div class="coinbase-showcase-row" style="align-items: center; gap: 3rem;">
            
            <!-- LEFT COLUMN: ONE-AT-A-TIME TYPOGRAPHY -->
            <div class="coinbase-content-col" style="flex: 1.1;">
              <div class="coinbase-alloc-viewport" style="position: relative; min-height: 380px;">
                
          <!-- SLIDE 0: 40% PANCAKESWAP LIQUIDITY -->
          <div class="coinbase-alloc-slide active" id="allocSlide0">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              PancakeSwap Liquidity
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              400 Million tokens (40% of total supply) permanently locked with BNB for PancakeSwap decentralized exchange liquidity pool trading depth. Secured by verifiable on-chain smart contract timelocks for 100% rug-proof safety.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        
          <!-- SLIDE 1: 20% STAKING & YIELD -->
          <div class="coinbase-alloc-slide" id="allocSlide1">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              Staking & Multiplier Yield
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              200 Million tokens (20% of total supply) dedicated to staking pools and dynamic citizen passport multipliers. Lock $BOOBA to earn high-yield compounding APY and amplify daily rewards across the ecosystem.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        
          <!-- SLIDE 2: 15% MARKETING -->
          <div class="coinbase-alloc-slide" id="allocSlide2">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              Marketing & Growth
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              150 Million tokens (15% of total supply) allocated for global viral marketing, international PR, Tier-1 crypto influencer campaigns, and rapid worldwide user acquisition.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        
          <!-- SLIDE 3: 10% PARTNERS -->
          <div class="coinbase-alloc-slide" id="allocSlide3">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              Strategic Partners
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              100 Million tokens (10% of total supply) reserved for tier-1 exchange market makers, Web3 venture partners, institutional liquidity backers, and ecosystem alliances.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>

          <!-- SLIDE 4: 10% COMMUNITY DEVELOPMENT -->
          <div class="coinbase-alloc-slide" id="allocSlide4">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              Community Development
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              100 Million tokens (10% of total supply) dedicated to community developer bounties, creator grants, meme contests, hackathons, and decentralized DAO ecosystem governance.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>

          <!-- SLIDE 5: 5% TEAM -->
          <div class="coinbase-alloc-slide" id="allocSlide5">
            <h2 class="coinbase-hero-title" style="font-size: clamp(2.4rem, 4.5vw, 3.8rem); font-weight: 900; line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.025em; color: #FFFFFF;">
              Core Team & Founders
            </h2>
            <p class="coinbase-hero-desc" style="font-size: clamp(1.05rem, 1.8vw, 1.25rem); color: var(--text-secondary); line-height: 1.7; max-width: 580px; margin-bottom: 2.5rem;">
              50 Million tokens (5% of total supply) allocated to the core development and smart contract engineering team, secured under a transparent 12-month linear smart contract vesting schedule.
            </p>
            <div>
              <button type="button" onclick="window.boobaApp.nextAllocSlide()" class="btn btn-primary btn-lg" style="border-radius: 9999px; padding: 1rem 3rem; font-weight: 800; font-size: 1.1rem; box-shadow: 0 8px 25px rgba(243, 186, 47, 0.35); cursor: pointer; display: inline-flex; align-items: center; gap: 0.65rem;">
                <span>Next</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </div>
          </div>
        
              </div>
            </div>

            <!-- RIGHT COLUMN: EXPANSIVE 2D DIAGRAM (SEAMLESS ON SAME BACKGROUND) -->
            <div class="coinbase-canvas-col" style="flex: 1.1;">
              <div class="unboxed-2d-diagram-stage" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 420px; position: relative;">

                <!-- 2D DIAGRAM CANVAS VIEWPORT (BIGGER & CRISP) -->
                <div style="position: relative; width: 100%; max-width: 480px; display: flex; align-items: center; justify-content: center; z-index: 10;">
                  
                  <!-- DIAGRAM 1: PRO 2D DONUT PIE CHART (LARGE & EXPANSIVE) -->
                  <div id="diagPie2D" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
                    <div style="position: relative; width: 340px; height: 340px; display: flex; align-items: center; justify-content: center;">
                      <svg width="340" height="340" viewBox="0 0 300 300" style="transform: rotate(-90deg); overflow: visible;">
                        <!-- Track Background -->
                        <circle cx="150" cy="150" r="110" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="34"></circle>
                        
                        <!-- Sector 0: 40% PancakeSwap Liquidity (Yellow) -->
                        <circle id="pieSlice0" cx="150" cy="150" r="110" fill="none" stroke="#F3BA2F" stroke-width="42" stroke-dasharray="276.46 691.15" stroke-dashoffset="0" style="transition: all 0.4s ease; cursor: pointer; filter: drop-shadow(0 0 16px rgba(243, 186, 47, 0.7));" onclick="window.boobaApp.setAllocSlide(0)"></circle>
                        
                        <!-- Sector 1: 20% Staking & Multipliers (Emerald) -->
                        <circle id="pieSlice1" cx="150" cy="150" r="110" fill="none" stroke="#10B981" stroke-width="34" stroke-dasharray="138.23 691.15" stroke-dashoffset="-276.46" style="transition: all 0.4s ease; cursor: pointer; opacity: 0.55;" onclick="window.boobaApp.setAllocSlide(1)"></circle>
                        
                        <!-- Sector 2: 15% Marketing & Growth (Violet) -->
                        <circle id="pieSlice2" cx="150" cy="150" r="110" fill="none" stroke="#8B5CF6" stroke-width="34" stroke-dasharray="103.67 691.15" stroke-dashoffset="-414.69" style="transition: all 0.4s ease; cursor: pointer; opacity: 0.55;" onclick="window.boobaApp.setAllocSlide(2)"></circle>
                        
                        <!-- Sector 3: 10% Strategic Partners (Cyan) -->
                        <circle id="pieSlice3" cx="150" cy="150" r="110" fill="none" stroke="#06B6D4" stroke-width="34" stroke-dasharray="69.12 691.15" stroke-dashoffset="-518.36" style="transition: all 0.4s ease; cursor: pointer; opacity: 0.55;" onclick="window.boobaApp.setAllocSlide(3)"></circle>
                        
                        <!-- Sector 4: 10% Community Development (Royal Blue) -->
                        <circle id="pieSlice4" cx="150" cy="150" r="110" fill="none" stroke="#3B82F6" stroke-width="34" stroke-dasharray="69.12 691.15" stroke-dashoffset="-587.48" style="transition: all 0.4s ease; cursor: pointer; opacity: 0.55;" onclick="window.boobaApp.setAllocSlide(4)"></circle>

                        <!-- Sector 5: 5% Core Team (Orange) -->
                        <circle id="pieSlice5" cx="150" cy="150" r="110" fill="none" stroke="#FF7A00" stroke-width="34" stroke-dasharray="34.56 691.15" stroke-dashoffset="-656.60" style="transition: all 0.4s ease; cursor: pointer; opacity: 0.55;" onclick="window.boobaApp.setAllocSlide(5)"></circle>
                      </svg>

                      <!-- Center Live 2D Readout (Large & Prominent) -->
                      <div style="position: absolute; text-align: center; pointer-events: none;">
                        <div id="pieCenterVal" style="font-size: 3rem; font-weight: 900; font-family: var(--font-mono); color: #F3BA2F; line-height: 1; text-shadow: 0 0 20px rgba(243, 186, 47, 0.4);">40%</div>
                        <div id="pieCenterLbl" style="font-size: 0.95rem; color: var(--text-secondary); margin-top: 0.45rem; font-weight: 800; font-family: var(--font-mono); letter-spacing: 0.02em;">400M $BOOBA</div>
                      </div>
                    </div>
                  </div>

                  <!-- DIAGRAM 2: PRO 2D FLAT BAR GRAPH (6 BARS) -->
                  <div id="diagBar2D" style="display: none; width: 100%; height: 260px; align-items: flex-end; justify-content: space-between; padding: 0 0.5rem; gap: 0.4rem;">
                    <!-- Bar 0 (40% - 175px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(0)">
                      <span id="barVal0" style="font-size: 0.88rem; font-weight: 800; color: #F3BA2F; transform: scale(1.15); font-family: var(--font-mono);">40%</span>
                      <div id="barCol0" style="width: 100%; max-width: 42px; height: 175px; background: #F3BA2F; border-radius: 8px 8px 3px 3px; box-shadow: 0 0 20px rgba(243, 186, 47, 0.6); opacity: 1; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: #FFFFFF; font-weight: 700; font-family: var(--font-mono);">400M</span>
                    </div>

                    <!-- Bar 1 (20% - 95px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(1)">
                      <span id="barVal1" style="font-size: 0.88rem; font-weight: 800; color: #10B981; font-family: var(--font-mono);">20%</span>
                      <div id="barCol1" style="width: 100%; max-width: 42px; height: 95px; background: #10B981; border-radius: 8px 8px 3px 3px; opacity: 0.45; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">200M</span>
                    </div>

                    <!-- Bar 2 (15% - 72px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(2)">
                      <span id="barVal2" style="font-size: 0.88rem; font-weight: 800; color: #8B5CF6; font-family: var(--font-mono);">15%</span>
                      <div id="barCol2" style="width: 100%; max-width: 42px; height: 72px; background: #8B5CF6; border-radius: 8px 8px 3px 3px; opacity: 0.45; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">150M</span>
                    </div>

                    <!-- Bar 3 (10% - 52px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(3)">
                      <span id="barVal3" style="font-size: 0.88rem; font-weight: 800; color: #06B6D4; font-family: var(--font-mono);">10%</span>
                      <div id="barCol3" style="width: 100%; max-width: 42px; height: 52px; background: #06B6D4; border-radius: 8px 8px 3px 3px; opacity: 0.45; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">100M</span>
                    </div>

                    <!-- Bar 4 (10% - 52px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(4)">
                      <span id="barVal4" style="font-size: 0.88rem; font-weight: 800; color: #3B82F6; font-family: var(--font-mono);">10%</span>
                      <div id="barCol4" style="width: 100%; max-width: 42px; height: 52px; background: #3B82F6; border-radius: 8px 8px 3px 3px; opacity: 0.45; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">100M</span>
                    </div>

                    <!-- Bar 5 (5% - 28px) -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.55rem; cursor: pointer; flex: 1;" onclick="window.boobaApp.setAllocSlide(5)">
                      <span id="barVal5" style="font-size: 0.88rem; font-weight: 800; color: #FF7A00; font-family: var(--font-mono);">5%</span>
                      <div id="barCol5" style="width: 100%; max-width: 42px; height: 28px; background: #FF7A00; border-radius: 8px 8px 3px 3px; opacity: 0.45; transition: all 0.35s ease;"></div>
                      <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: var(--font-mono);">50M</span>
                    </div>
                  </div>

                  <!-- DIAGRAM 3: PRO 2D LINE GRAPH (6 NODES) -->
                  <div id="diagLine2D" style="display: none; width: 100%; height: 260px; align-items: center; justify-content: center;">
                    <svg width="100%" height="220" viewBox="0 0 380 180" style="overflow: visible;">
                      <defs>
                        <linearGradient id="lineGrad2DPro" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stop-color="#F3BA2F" stop-opacity="0.4"></stop>
                          <stop offset="100%" stop-color="#F3BA2F" stop-opacity="0.0"></stop>
                        </linearGradient>
                      </defs>
                      <polygon points="20,155 20,25 88,85 156,105 224,125 292,125 360,145 360,155" fill="url(#lineGrad2DPro)"></polygon>
                      <polyline points="20,25 88,85 156,105 224,125 292,125 360,145" fill="none" stroke="#F3BA2F" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 12px rgba(243, 186, 47, 0.5));"></polyline>
                      
                      <!-- Nodes (6 Allocations) -->
                      <circle id="lineNode0" cx="20" cy="25" r="9" fill="#F3BA2F" stroke="#FFFFFF" stroke-width="2.5" style="cursor: pointer; filter: drop-shadow(0 0 10px #F3BA2F);" onclick="window.boobaApp.setAllocSlide(0)"></circle>
                      <circle id="lineNode1" cx="88" cy="85" r="6" fill="#10B981" stroke="#FFFFFF" stroke-width="2" style="cursor: pointer;" onclick="window.boobaApp.setAllocSlide(1)"></circle>
                      <circle id="lineNode2" cx="156" cy="105" r="6" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="2" style="cursor: pointer;" onclick="window.boobaApp.setAllocSlide(2)"></circle>
                      <circle id="lineNode3" cx="224" cy="125" r="5" fill="#06B6D4" stroke="#FFFFFF" stroke-width="2" style="cursor: pointer;" onclick="window.boobaApp.setAllocSlide(3)"></circle>
                      <circle id="lineNode4" cx="292" cy="125" r="5" fill="#3B82F6" stroke="#FFFFFF" stroke-width="2" style="cursor: pointer;" onclick="window.boobaApp.setAllocSlide(4)"></circle>
                      <circle id="lineNode5" cx="360" cy="145" r="5" fill="#FF7A00" stroke="#FFFFFF" stroke-width="2" style="cursor: pointer;" onclick="window.boobaApp.setAllocSlide(5)"></circle>
                    </svg>
                  </div>

                </div>

                <!-- UNBOXED BOTTOM CONTROLS & POOL INDICATOR (BELOW CHART, NO PILL) -->
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 480px; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.08); z-index: 10; flex-wrap: wrap; gap: 1rem;">
                  
                  <!-- UNBOXED TEXT TABS -->
                  <div class="unboxed-chart-switcher" style="display: flex; align-items: center; gap: 1.4rem;">
                    <button type="button" id="repTabPie" class="chart-tab-link active" onclick="window.boobaApp.switch2DDiagram('pie2d')" title="2D Pie Chart">
                      2D Pie
                    </button>
                    <button type="button" id="repTabColumn" class="chart-tab-link" onclick="window.boobaApp.switch2DDiagram('bar2d')" title="2D Bar Chart">
                      2D Bar
                    </button>
                    <button type="button" id="repTabLine" class="chart-tab-link" onclick="window.boobaApp.switch2DDiagram('line2d')" title="2D Line Graph">
                      2D Line
                    </button>
                  </div>

                  <!-- POOL COUNTER -->
                  <div style="font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase;">
                    POOL <span id="allocCurrentIdxNum" style="color: var(--brand-yellow); font-weight: 900;">01</span> / 06
                  </div>

                </div>

              </div>
            </div>

          </div>

        </div>
      </section>

      <!-- 5. CRYPTO EXPEDITION & PROTOCOL TRAJECTORY MAP -->
      <section class="crypto-expedition-map-section" id="roadmapMapSection">
        
        <!-- Ambient Grid & Radial Glow -->
        <div class="map-ambient-grid"></div>
        <div class="map-ambient-radial"></div>

        <div class="container" style="position: relative; z-index: 10;">
          
          <!-- SECTION HEADER (BOLD GOLD HEADER TEXT) -->
          <div style="text-align: center; width: 100%; margin-bottom: 3.5rem;">
            <h3 style="font-size: clamp(1.4rem, 2.8vw, 2.1rem); font-weight: 900; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.08em; margin: 0; text-shadow: 0 0 25px rgba(243, 186, 47, 0.3);">
              The Ecosystem Expedition Map
            </h3>
          </div>

          <!-- WINDING EXPEDITION TRAJECTORY MAP TRACK -->
          <div class="map-trajectory-container">
            
            <!-- Continuous Glowing Trajectory Spine -->
            <div class="map-trajectory-spine"></div>

            <!-- LOCATION 01: GENESIS BASECAMP -->
            <div class="map-waypoint-row">
              
              <!-- Left: Location Card -->
              <div class="map-waypoint-card-col">
                <div class="map-location-card card-achieved">
                  <div class="map-location-top">
                    <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0; display: inline-flex; align-items: center; gap: 0.35rem;">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg> Reached & Secured
                    </span>
                    <span class="map-location-coord">SECTOR 01 // 12.04°N 45.19°E</span>
                  </div>

                  <h3 class="map-location-title">Genesis Basecamp</h3>
                  <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                    Foundation deployment establishing verifiable decentralized identity, non-custodial cryptography, and immutable smart contracts on BNB Smart Chain.
                  </p>

                  <ul class="map-location-milestones">
                    <li>
                      <div class="map-milestone-icon achieved">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>Verified BEP-20 Smart Contract & Genesis Mint</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon achieved">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>12-Word Non-Custodial BIP-39 Vault Architecture</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon achieved">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>3% Tax Standard & Multi-Wallet EVM Integration</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center: Beacon Node -->
              <div class="map-waypoint-beacon-col">
                <div class="map-beacon-anchor achieved" title="Location 01: Reached">
                  <span>01</span>
                </div>
              </div>

              <!-- Right: Spacer -->
              <div class="map-waypoint-spacer-col"></div>
            </div>

            <!-- LOCATION 02: THE EXPEDITION FRONTIER (CURRENT ACTIVE MISSION) -->
            <div class="map-waypoint-row even">
              
              <!-- Right: Location Card -->
              <div class="map-waypoint-card-col">
                <div class="map-location-card card-active">
                  <div class="map-location-top">
                    <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800; font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0; display: inline-flex; align-items: center; gap: 0.35rem;">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Active Expedition
                    </span>
                    <span class="map-location-coord" style="color: var(--brand-yellow);">SECTOR 02 // 28.75°N 77.20°E</span>
                  </div>

                  <h3 class="map-location-title" style="color: #FFFFFF;">The Expedition Frontier</h3>
                  <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                    Unleashing community incentives, viral meme bounties, anti-sybil validation, and daily quest streaks to scale active on-chain citizens.
                  </p>

                  <ul class="map-location-milestones">
                    <li>
                      <div class="map-milestone-icon active">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>Daily Check-in Streak Multipliers & Quests</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon active">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>Anti-Sybil Proof Verification Matrix</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon active">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                      <span>Community Referral Network & Admin Moderation</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center: Beacon Node with Radar Ping -->
              <div class="map-waypoint-beacon-col">
                <div class="map-beacon-anchor active-expedition" title="Location 02: Current Expedition">
                  <div class="map-radar-pulse"></div>
                  <span>02</span>
                </div>
              </div>

              <!-- Left: Spacer -->
              <div class="map-waypoint-spacer-col"></div>
            </div>

            <!-- LOCATION 03: THE AUTONOMOUS CITADEL -->
            <div class="map-waypoint-row">
              
              <!-- Left: Location Card -->
              <div class="map-waypoint-card-col">
                <div class="map-location-card card-upcoming">
                  <div class="map-location-top">
                    <span class="badge-tag" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0;">
                      Approaching Waypoint
                    </span>
                    <span class="map-location-coord">SECTOR 03 // 41.90°N 12.49°E</span>
                  </div>

                  <h3 class="map-location-title">The Autonomous Citadel</h3>
                  <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                    Integrating decentralized token utilities, automated social raid infrastructure, community governance voting, and gamified arcade mechanics.
                  </p>

                  <ul class="map-location-milestones">
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>On-Chain Rewards Vault & Dynamic APY Multipliers</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Decentralized Community Bounty & Raid Protocol</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Automated Telegram & Social Raid Engine</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center: Beacon Node -->
              <div class="map-waypoint-beacon-col">
                <div class="map-beacon-anchor upcoming" title="Location 03: Approaching">
                  <span>03</span>
                </div>
              </div>

              <!-- Right: Spacer -->
              <div class="map-waypoint-spacer-col"></div>
            </div>

            <!-- LOCATION 04: THE SOVEREIGN METROPOLIS -->
            <div class="map-waypoint-row even">
              
              <!-- Right: Location Card -->
              <div class="map-waypoint-card-col">
                <div class="map-location-card card-target">
                  <div class="map-location-top">
                    <span class="badge-tag" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0;">
                      Target Horizon
                    </span>
                    <span class="map-location-coord">SECTOR 04 // 35.68°N 139.76°E</span>
                  </div>

                  <h3 class="map-location-title">The Sovereign Metropolis</h3>
                  <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                    Expanding institutional reach with Soulbound NFT Passport credentials, decentralized DAO community voting, and Tier-1 liquidity listings.
                  </p>

                  <ul class="map-location-milestones">
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>On-Chain Soulbound (SBT) Passport Minting</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Decentralized DAO Community Treasury Governance</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Tier-1 Global Centralized Exchange Listings</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center: Beacon Node -->
              <div class="map-waypoint-beacon-col">
                <div class="map-beacon-anchor target" title="Location 04: Target Horizon">
                  <span>04</span>
                </div>
              </div>

              <!-- Left: Spacer -->
              <div class="map-waypoint-spacer-col"></div>
            </div>

            <!-- LOCATION 05: THE INTERGALACTIC NEXUS -->
            <div class="map-waypoint-row">
              
              <!-- Left: Location Card -->
              <div class="map-waypoint-card-col">
                <div class="map-location-card card-summit">
                  <div class="map-location-top">
                    <span class="badge-tag" style="background: rgba(255, 111, 216, 0.15); color: #FF6FD8; border-color: rgba(255, 111, 216, 0.4); font-size: 0.76rem; padding: 0.25rem 0.65rem; margin: 0;">
                      Ultimate Summit
                    </span>
                    <span class="map-location-coord">SECTOR 05 // 00.00°N 00.00°E (ORBITAL)</span>
                  </div>

                  <h3 class="map-location-title">The Intergalactic Nexus</h3>
                  <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0;">
                    Realizing full decentralization, multi-chain bridge interoperability, and continuous developer innovation grants across the Web3 sphere.
                  </p>

                  <ul class="map-location-milestones">
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Cross-Chain Interoperability Standard & Bridges</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Community Ecosystem Grant & Innovation Fund</span>
                    </li>
                    <li>
                      <div class="map-milestone-icon pending">
                        <svg width="6" height="6" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="3.5"></circle></svg>
                      </div>
                      <span>Global Web3 Decentralized Mass Adoption</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Center: Beacon Node -->
              <div class="map-waypoint-beacon-col">
                <div class="map-beacon-anchor summit" title="Location 05: Ultimate Summit">
                  <span>05</span>
                </div>
              </div>

              <!-- Right: Spacer -->
              <div class="map-waypoint-spacer-col"></div>
            </div>

          </div>

        </div>
      </section>

      <!-- 6. FREQUENTLY ASKED QUESTIONS (INTERACTIVE ACCORDION) -->
      <section class="section-container" style="padding: 5rem 0;">
        <div class="container" style="max-width: 860px;">
          
          <div class="section-header showcase-section-header" style="margin-bottom: 3rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
            <h2 class="section-title showcase-main-heading">Frequently Asked <span class="text-gradient-gold">Questions</span></h2>
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
                $BOOBA is the utility and governance token powering the BNB Baby community ecosystem on BNB Smart Chain. It is used to reward quest conquerors, boost citizen rank multipliers, spin the arcade wheel, and upgrade digital Passport reputation tiers.
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
                <span>How do the Citizen Rank Multipliers work?</span>
                <span class="faq-chevron-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </button>
              <div class="faq-answer-panel">
                As you complete quests and level up your Booba Passport tier from Level 1 to Level 10, your citizen rank multiplier increases up to 3.5x. This multiplier automatically boosts all points and $BOOBA rewards you earn across daily check-ins and bounties.
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
                Yes. 40% of the total supply (400,000,000 $BOOBA) allocated for the PancakeSwap decentralized exchange liquidity pool is locked for 24 months via verifiable smart contract timelocks on BNB Smart Chain.
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
                $BOOBA operates with a transparent 3% Buy and 3% Sell tax on decentralized exchange transactions. The 3% tax is systematically allocated to strengthen PancakeSwap liquidity reserves, fund staking rewards, and accelerate global ecosystem marketing.
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
      `<span class="badge-tag" style="padding: 0.35rem 0.95rem; font-size: 0.82rem; background: rgba(139, 92, 246, 0.15); color: var(--accent-purple); border-color: rgba(139, 92, 246, 0.3); display: inline-flex; align-items: center; gap: 0.45rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> 3% Buy / 3% Sell Tax</span>`
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
    if (this._dexPollTimer) {
      clearInterval(this._dexPollTimer);
    }
    this._aboutTvCurrentIndex = 0;
    this.fetchLiveDexData(); // Immediate live fetch on page load
    
    // Auto-refresh DEX on-chain metrics every 20 seconds while page is open
    this._dexPollTimer = setInterval(() => {
      this.fetchLiveDexData();
    }, 20000);

    this._aboutTvTimer = setInterval(() => {
      this.nextTvStatSlide();
    }, 3500); // 3.5 seconds per slide for comfortable reading
  }

  async fetchLiveDexData() {
    const tokenAddress = '0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B';
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.pairs && data.pairs.length > 0) {
        const pair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        const price = Number(pair.priceUsd || 0);
        const vol = Number(pair.volume?.h24 || 0);
        const liq = Number(pair.liquidity?.usd || 0);
        const mcap = Number(pair.fdv || (price * 1000000000) || 0);

        this._liveDexData = {
          title: 'BOOBA Live',
          pair: `${pair.baseToken?.symbol || 'BOOBA'} / ${pair.quoteToken?.symbol || 'WBNB'} • ${pair.dexId || 'PancakeSwap'}`,
          price: price < 0.0001 ? `$${price.toFixed(8)}` : `$${price.toFixed(4)}`,
          volume24h: `$${vol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          liquidity: `$${liq.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          marketCap: `$${mcap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        };

        const pEl = document.getElementById('tvLivePrice');
        const vEl = document.getElementById('tvLiveVol');
        const lEl = document.getElementById('tvLiveLiq');
        const mEl = document.getElementById('tvLiveMcap');
        if (pEl) pEl.textContent = this._liveDexData.price;
        if (vEl) vEl.textContent = this._liveDexData.volume24h;
        if (lEl) lEl.textContent = this._liveDexData.liquidity;
        if (mEl) mEl.textContent = this._liveDexData.marketCap;
      }
    } catch (e) {
      // Gracefully handled if pool is pending initialization
    }
  }

  setTvStatSlide(idx) {
    const defaultMarket = this._liveDexData || {
      title: 'BOOBA Live',
      pair: 'BOOBA / WBNB • PancakeSwap',
      price: '$0.00',
      volume24h: '$0.00',
      liquidity: '$0.00',
      marketCap: '$0.00'
    };

    const slides = [
      {
        isMarket: true,
        ...defaultMarket
      },
      {
        num: 'BOOBA COIN',
        color: 'var(--brand-yellow)',
        label: 'Token Name',
        desc: 'Official registered token name on the BNB Smart Chain block explorer (BscScan).'
      },
      {
        num: 'BOOBA',
        color: 'var(--brand-yellow)',
        label: 'Token Symbol',
        desc: 'The official BEP-20 native token symbol on BNB Smart Chain.'
      },
      {
        num: 'BNB Baby',
        color: 'var(--accent-cyan)',
        label: 'Token Nickname',
        desc: 'The official mascot moniker and community identity of the Booba ecosystem.'
      },
      {
        num: defaultMarket.price,
        color: '#FFFFFF',
        label: 'Live DEX Price',
        desc: 'Real-time market price on PancakeSwap decentralized exchange (BNB Smart Chain).'
      },
      {
        num: defaultMarket.volume24h,
        color: 'var(--accent-emerald)',
        label: 'Live 24h Volume',
        desc: 'Rolling 24-hour decentralized trading volume on PancakeSwap liquidity pools.'
      },
      {
        num: defaultMarket.liquidity,
        color: 'var(--brand-yellow)',
        label: 'Total Liquidity',
        desc: 'Total decentralized pool liquidity depth paired with BNB on PancakeSwap.'
      },
      {
        num: defaultMarket.marketCap,
        color: '#FFFFFF',
        label: 'Live Market Cap',
        desc: 'Current on-chain market capitalization based on circulating valuation.'
      }
    ];

    const targetIdx = (idx + slides.length) % slides.length;
    this._aboutTvCurrentIndex = targetIdx;
    const slide = slides[targetIdx];

    const frame = document.getElementById('tvStatFrame');
    const chNum = document.getElementById('tvChannelNum');
    const chNumMob = document.getElementById('tvChannelNumMob');

    if (frame) {
      frame.style.opacity = '0';
      frame.style.transform = 'translateY(6px)';
      
      setTimeout(() => {
        if (chNum) chNum.textContent = String(targetIdx + 1);
        if (chNumMob) chNumMob.textContent = String(targetIdx + 1);

        if (slide.isMarket) {
          frame.innerHTML = `
            <div class="tv-market-telemetry-widget" style="width: 100%; max-width: 640px; margin: 0 auto;">
              <div style="text-align: center; margin-bottom: 1rem;">
                <div style="font-size: 1.4rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-heading);">
                  ${slide.title}
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; width: 100%; text-align: left;">
                <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                  <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Price</div>
                  <div style="font-size: 1.18rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);" id="tvLivePrice">${slide.price}</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                  <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">24h Volume</div>
                  <div style="font-size: 1.18rem; font-weight: 900; color: var(--accent-emerald); font-family: var(--font-mono);" id="tvLiveVol">${slide.volume24h}</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                  <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Liquidity</div>
                  <div style="font-size: 1.18rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono);" id="tvLiveLiq">${slide.liquidity}</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 0.8rem 1rem;">
                  <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Market Cap</div>
                  <div style="font-size: 1.18rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);" id="tvLiveMcap">${slide.marketCap}</div>
                </div>
              </div>
            </div>
          `;
        } else {
          frame.innerHTML = `
            <div class="tv-stat-number" id="tvStatNumber" style="color: ${slide.color};">${slide.num}</div>
            <div class="tv-stat-label" id="tvStatLabel">${slide.label}</div>
            <div class="tv-stat-desc" id="tvStatDesc">${slide.desc}</div>
          `;
        }
        
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

  
  // --------------------------------------------------------------------------
  // COINBASE-STYLE 2D TOKEN ALLOCATION CONTROLLER
  // --------------------------------------------------------------------------
  initAllocAutoRotation() {
    if (this._allocTimer) clearInterval(this._allocTimer);
    this._currentAllocIdx = 0;
  }

  setAllocSlide(idx) {
    const total = 6;
    const targetIdx = (idx + total) % total;
    this._currentAllocIdx = targetIdx;

    const data = [
      { color: '#F3BA2F', percent: '40%', amount: '400,000,000 $BOOBA', label: 'PancakeSwap Liquidity (40%)' },
      { color: '#10B981', percent: '20%', amount: '200,000,000 $BOOBA', label: 'Staking & Yield (20%)' },
      { color: '#8B5CF6', percent: '15%', amount: '150,000,000 $BOOBA', label: 'Global Marketing (15%)' },
      { color: '#06B6D4', percent: '10%', amount: '100,000,000 $BOOBA', label: 'Strategic Partners (10%)' },
      { color: '#3B82F6', percent: '10%', amount: '100,000,000 $BOOBA', label: 'Community Development (10%)' },
      { color: '#FF7A00', percent: '5%', amount: '50,000,000 $BOOBA', label: 'Core Team (5%)' }
    ];
    const cur = data[targetIdx];

    // 1. Update Left Text Slides
    for (let i = 0; i < total; i++) {
      const s = document.getElementById(`allocSlide${i}`);
      const t = document.querySelectorAll('.alloc-tab-btn')[i];
      if (s) {
        if (i === targetIdx) s.classList.add('active');
        else s.classList.remove('active');
      }
      if (t) {
        if (i === targetIdx) t.classList.add('active');
        else t.classList.remove('active');
      }
    }

    // 2. Update HUD Badge & Center Readout
    const hudDot = document.getElementById('allocHudDot');
    const hudLbl = document.getElementById('allocHudLabel');
    const idxNum = document.getElementById('allocCurrentIdxNum');
    const centerVal = document.getElementById('pieCenterVal');
    const centerLbl = document.getElementById('pieCenterLbl');

    if (hudDot) {
      hudDot.style.background = cur.color;
      hudDot.style.boxShadow = `0 0 10px ${cur.color}`;
    }
    if (hudLbl) hudLbl.textContent = cur.label.toUpperCase();
    if (idxNum) idxNum.textContent = `0${targetIdx + 1}`;
    if (centerVal) {
      centerVal.textContent = cur.percent;
      centerVal.style.color = cur.color;
    }
    if (centerLbl) centerLbl.textContent = cur.amount;

    // 3. Highlight 2D Pie Slices
    for (let i = 0; i < total; i++) {
      const slice = document.getElementById(`pieSlice${i}`);
      if (slice) {
        if (i === targetIdx) {
          slice.setAttribute('stroke-width', '42');
          slice.style.filter = `drop-shadow(0 0 16px ${data[i].color})`;
          slice.style.opacity = '1';
        } else {
          slice.setAttribute('stroke-width', '34');
          slice.style.filter = 'none';
          slice.style.opacity = '0.55';
        }
      }
    }

    // 4. Highlight 2D Bar Columns
    for (let i = 0; i < total; i++) {
      const col = document.getElementById(`barCol${i}`);
      const val = document.getElementById(`barVal${i}`);
      if (col && val) {
        if (i === targetIdx) {
          col.style.opacity = '1';
          col.style.boxShadow = `0 0 20px ${data[i].color}`;
          val.style.transform = 'scale(1.15)';
        } else {
          col.style.opacity = '0.45';
          col.style.boxShadow = 'none';
          val.style.transform = 'scale(1)';
        }
      }
    }

    // 5. Highlight 2D Line Nodes
    for (let i = 0; i < total; i++) {
      const node = document.getElementById(`lineNode${i}`);
      if (node) {
        if (i === targetIdx) {
          node.setAttribute('r', '9');
          node.style.filter = `drop-shadow(0 0 10px ${data[i].color})`;
        } else {
          node.setAttribute('r', '5');
          node.style.filter = 'none';
        }
      }
    }
  }

  nextAllocSlide() {
    const cur = typeof this._currentAllocIdx === 'number' ? this._currentAllocIdx : 0;
    this.setAllocSlide(cur + 1);
  }

  prevAllocSlide() {
    const cur = typeof this._currentAllocIdx === 'number' ? this._currentAllocIdx : 0;
    this.setAllocSlide(cur - 1);
  }

  switch2DDiagram(mode) {
    const dPie = document.getElementById('diagPie2D');
    const dBar = document.getElementById('diagBar2D');
    const dLine = document.getElementById('diagLine2D');

    const tabPie = document.getElementById('repTabPie');
    const tabBar = document.getElementById('repTabColumn');
    const tabLine = document.getElementById('repTabLine');

    if (dPie) dPie.style.setProperty('display', 'none', 'important');
    if (dBar) dBar.style.setProperty('display', 'none', 'important');
    if (dLine) dLine.style.setProperty('display', 'none', 'important');

    if (tabPie) tabPie.classList.remove('active');
    if (tabBar) tabBar.classList.remove('active');
    if (tabLine) tabLine.classList.remove('active');

    if (mode === 'bar2d') {
      if (dBar) dBar.style.setProperty('display', 'flex', 'important');
      if (tabBar) tabBar.classList.add('active');
    } else if (mode === 'line2d') {
      if (dLine) dLine.style.setProperty('display', 'flex', 'important');
      if (tabLine) tabLine.classList.add('active');
    } else {
      if (dPie) dPie.style.setProperty('display', 'flex', 'important');
      if (tabPie) tabPie.classList.add('active');
    }
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


  // --------------------------------------------------------------------------
  // SPAROPAY 8-STEP TOKEN SHOWCASE CONTROLLER
  // --------------------------------------------------------------------------
  setSparoStep(idx) {
    this.currentSparoStep = idx;
    const total = 8;
    for (let i = 0; i < total; i++) {
      const slide = document.getElementById(`sparoSlide${i}`);
      const pill = document.querySelectorAll('.sparo-nav-pill-btn')[i];

      if (i === idx) {
        if (slide) slide.classList.add('active');
        if (pill) pill.classList.add('active');
      } else {
        if (slide) slide.classList.remove('active');
        if (pill) pill.classList.remove('active');
      }
    }
  }

  nextSparoStep() {
    const current = this.currentSparoStep || 0;
    const next = (current + 1) % 8;
    this.setSparoStep(next);
  }

  prevSparoStep() {
    const current = this.currentSparoStep || 0;
    const prev = (current - 1 + 8) % 8;
    this.setSparoStep(prev);
  }

  copyContractAddress(elementId = 'tokenContractAddr') {
    const targetEl = document.getElementById(elementId) || document.getElementById('tokenContractAddr') || document.getElementById('homeTokenContractAddr');
    const addr = targetEl?.textContent?.trim() || '0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B';
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(addr).then(() => {
        const btnText = document.getElementById('copyContractBtnText');
        if (btnText) {
          const original = btnText.textContent;
          btnText.textContent = 'Copied!';
          setTimeout(() => { btnText.textContent = original; }, 2000);
        } else {
          alert('Official BEP-20 Contract Address copied to clipboard!\n' + addr);
        }
      }).catch(() => {
        prompt('Copy BOOBA BEP-20 Contract Address:', addr);
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
    const isWalletUser = user.authProvider === 'wallet' || (user.email && user.email.includes('@wallet.booba.crypto')) || (user.username && user.username.startsWith('BNB_'));
    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const formattedWallet = isWalletConnected ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : '';
    const isDefaultWalletName = isWalletUser && (user.username || '').startsWith('BNB_');

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- USER PROFILE QUICK HERO BANNER / PASSPORT IDENTITY HERO -->
        <div class="dashboard-hero-card ${levelInfo.themeClass}" style="background: ${levelInfo.bgGradient}; border: 1.5px solid ${levelInfo.borderColor}; border-radius: 24px; padding: 1.75rem 2rem; margin-bottom: 1.75rem; position: relative; overflow: hidden; box-shadow: 0 16px 45px rgba(0, 0, 0, 0.85), 0 0 35px ${levelInfo.glowColor};">
          
          <div class="dashboard-hero-bg-watermark" style="position: absolute; right: -15px; bottom: -25px; opacity: 0.1; pointer-events: none;">
            <img src="assets/mascot.jpg" style="width: 220px; height: 220px; border-radius: 50%;">
          </div>

          <div class="dashboard-hero-content" style="position: relative; z-index: 1;">
            
            <!-- Top Row: Avatar + Name + Badges -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
              
              <div class="dashboard-user-info" style="display: flex; align-items: center; gap: 1rem;">
                <div style="position: relative; flex-shrink: 0;">
                  <img src="${levelInfo.mascotImage || 'assets/mascot_level1.png'}" class="dashboard-user-avatar" style="width: 62px; height: 62px; border-radius: 16px; border: 2px solid ${levelInfo.accentColor}; object-fit: contain; background: rgba(0,0,0,0.5); box-shadow: 0 0 18px ${levelInfo.glowColor};">
                  <div style="position: absolute; bottom: -3px; right: -3px; background: ${levelInfo.accentColor}; color: #000000; font-size: 0.65rem; font-weight: 900; padding: 0.1rem 0.4rem; border-radius: 999px; border: 1.5px solid #000000;">
                    Lv.${levelInfo.level}
                  </div>
                </div>

                <div class="dashboard-user-meta">
                  <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <h2 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF; margin: 0; line-height: 1.2;">${user.username}</h2>
                    ${isWalletUser ? `
                      <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openAddUsernameModal()" style="font-size: 0.7rem; padding: 0.15rem 0.45rem; color: ${levelInfo.accentColor}; border: 1px solid ${levelInfo.borderColor}; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        ${isDefaultWalletName ? 'Add @name' : 'Edit @name'}
                      </button>
                    ` : ''}
                    <span class="badge-tag theme-badge" style="background: ${levelInfo.accentColor}; color: #000000; font-weight: 900; font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 999px;">
                      Lv.${levelInfo.level} ${levelInfo.title}
                    </span>
                    ${user.role === 'admin' ? `<a href="teamadmin.html" class="badge-tag" style="background: ${levelInfo.glowColor}; color: ${levelInfo.accentColor}; border: 1px solid ${levelInfo.borderColor}; font-weight: 800; font-size: 0.7rem; padding: 0.2rem 0.55rem; border-radius: 999px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.25rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Admin Access</a>` : ''}
                  </div>

                  <div class="dashboard-user-subdetails" style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.35rem; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                    <span>Passport: <strong class="text-mono" style="color: ${levelInfo.accentColor}; font-weight: 800;">${user.passportId}</strong></span>
                    <span>•</span>
                    <span>Ref: <strong class="text-mono" style="color: #FFFFFF;">${user.referralCode}</strong></span>
                    <span>•</span>
                    <span style="color: var(--accent-emerald); font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">
                      <span class="pulse-dot" style="width: 5px; height: 5px;"></span> Non-Custodial
                    </span>
                  </div>
                </div>
              </div>

            </div>

            <!-- Action Buttons Row (Unified Grid) -->
            <div class="dashboard-action-wrapper" style="margin-top: 1.25rem; display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap;">
              <a href="passport.html" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; text-decoration: none; border: 1.5px solid ${levelInfo.borderColor}; color: #FFFFFF; background: rgba(255,255,255,0.06); font-size: 0.8rem; font-weight: 700; border-radius: 10px; padding: 0.6rem 0.9rem;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${levelInfo.accentColor}" stroke-width="2.5"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
                <span>3D Passport</span>
              </a>

              ${isWalletConnected ? `
                <button type="button" class="btn btn-secondary" onclick="window.boobaApp.openAddWalletModal()" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; background: rgba(255,255,255,0.06); border: 1.5px solid ${levelInfo.borderColor}; color: #FFFFFF; font-size: 0.8rem; font-weight: 700; border-radius: 10px; padding: 0.6rem 0.75rem;">
                  <span class="pulse-dot" style="width: 5px; height: 5px; background: var(--accent-emerald);"></span>
                  <span class="text-mono">${formattedWallet}</span>
                </button>
              ` : `
                <button type="button" class="btn" onclick="window.boobaApp.openAddWalletModal()" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; background: ${levelInfo.accentColor}; color: #000000; font-weight: 900; font-size: 0.8rem; border: none; border-radius: 10px; padding: 0.6rem 0.9rem; box-shadow: 0 0 15px ${levelInfo.glowColor};">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
                  <span>+ Add Wallet</span>
                </button>
              `}

              <a href="withdraw.html" class="btn btn-secondary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; text-decoration: none; border: 1.5px solid ${levelInfo.borderColor}; background: rgba(255,255,255,0.06); color: #FFFFFF; font-size: 0.8rem; font-weight: 700; border-radius: 10px; padding: 0.6rem 0.9rem;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                <span>Withdraw</span>
              </a>
            </div>

            <!-- Level Progression Bar -->
            <div class="dashboard-progress-wrap" style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.45rem; color: var(--text-secondary);">
                <span>Next: <strong style="color: #FFFFFF;">${levelInfo.nextTier ? levelInfo.nextTier.title : 'MAX LEVEL'}</strong></span>
                <span><strong style="color: ${levelInfo.accentColor};">${Number(user.boobaPoints).toLocaleString()}</strong> / ${levelInfo.nextTier ? levelInfo.nextTier.min.toLocaleString() : 'MAX'} (${levelInfo.progressPercent}%)</span>
              </div>
              <div style="width: 100%; height: 7px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden;">
                <div style="height: 100%; width: ${levelInfo.progressPercent}%; background: linear-gradient(90deg, ${levelInfo.accentColor}99 0%, ${levelInfo.accentColor} 100%); border-radius: 999px; box-shadow: 0 0 10px ${levelInfo.glowColor};"></div>
              </div>
            </div>

          </div>
        </div>

        <!-- NOTIFICATION / PROMPT BANNER FOR MISSING WALLET OR MISSING USERNAME -->
        ${!isWalletConnected ? `
          <div style="background: ${levelInfo.glowColor}; border: 1.5px solid ${levelInfo.borderColor}; border-radius: 20px; padding: 1.15rem 1.6rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 0.85rem;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${levelInfo.borderColor}; display: flex; align-items: center; justify-content: center; color: ${levelInfo.accentColor}; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
              </div>
              <div>
                <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Link your BEP-20 Wallet Address</div>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">Input your BNB Smart Chain address to enable token airdrops, quest rewards & instant withdrawals.</div>
              </div>
            </div>
            <button type="button" class="btn btn-sm" onclick="window.boobaApp.openAddWalletModal()" style="background: ${levelInfo.accentColor}; color: #000000; white-space: nowrap; padding: 0.55rem 1.35rem; font-weight: 900; border-radius: 10px; border: none; box-shadow: 0 0 15px ${levelInfo.glowColor};">
              + Add Wallet
            </button>
          </div>
        ` : (isDefaultWalletName ? `
          <div style="background: ${levelInfo.glowColor}; border: 1.5px solid ${levelInfo.borderColor}; border-radius: 20px; padding: 1.15rem 1.6rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 0.85rem;">
              <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${levelInfo.borderColor}; display: flex; align-items: center; justify-content: center; color: ${levelInfo.accentColor}; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div>
                <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Claim Your Unique Citizen Username</div>
                <div style="font-size: 0.82rem; color: var(--text-secondary);">You're registered via Web3 dApp wallet. Choose your custom @username for your Booba Passport!</div>
              </div>
            </div>
            <button type="button" class="btn btn-sm" onclick="window.boobaApp.openAddUsernameModal()" style="background: ${levelInfo.accentColor}; color: #000000; white-space: nowrap; padding: 0.55rem 1.35rem; font-weight: 900; border-radius: 10px; border: none; box-shadow: 0 0 15px ${levelInfo.glowColor};">
              + Add Username
            </button>
          </div>
        ` : '')}

        <!-- 4 BENTO STATS METRICS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Token Balance</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${levelInfo.accentColor};"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: ${levelInfo.accentColor}; line-height: 1.1;" data-counter-target="${user.boobaPoints}">
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${levelInfo.accentColor};"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
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
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Referral Network</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-cyan);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">
              ${Number(user.referralCount || 0)} Citizens
            </div>
            <div style="font-size: 0.78rem; color: var(--brand-yellow); margin-top: 0.4rem;">
              <a href="referrals.html" style="color: var(--brand-yellow); font-weight: 700; text-decoration: none;">Invite & Earn 20% →</a>
            </div>
          </div>

        </div>

        <!-- 3 ACTION HUBS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 2.25rem; display: flex; flex-direction: column; justify-content: space-between; border-color: ${levelInfo.borderColor}; background: linear-gradient(180deg, ${levelInfo.glowColor} 0%, rgba(14, 18, 27, 0.9) 100%);">
            <div>
              <div class="bento-icon-badge" style="background: ${levelInfo.glowColor}; color: ${levelInfo.accentColor}; border-color: ${levelInfo.borderColor}; margin-bottom: 1.25rem;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem;">
                <h3 style="font-size: 1.3rem; margin: 0; color: #FFFFFF;">Digital Booba Passport</h3>
                <span class="badge-tag" style="background: ${levelInfo.accentColor}; color: #000000; font-weight: 900; font-size: 0.72rem;">Lv.${levelInfo.level}</span>
              </div>
              <div style="font-size: 0.75rem; color: ${levelInfo.accentColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.85rem;">
                ${levelInfo.material} • ${levelInfo.tierBadge}
              </div>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                Your ${levelInfo.title} card is live on BNB Smart Chain. View your 3D interactive holographic card, cryptographic chip, and tier unlock criteria.
              </p>
            </div>
            <a href="passport.html" class="btn btn-secondary btn-block" style="border-color: ${levelInfo.borderColor};">Open My Passport (${levelInfo.title}) →</a>
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
    const levelInfo = calculateLevel(user.boobaPoints);
    const currentAvatar = user.avatar || 'assets/mascot.jpg';

    container.innerHTML = `
      <div class="container page-content" style="max-width: 1060px;">
        
        <!-- SETTINGS PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Account & Security</span>
          </h1>
        </div>

        <!-- 2 CLEAN SETTINGS CARDS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
          
          <!-- CARD 1: PROFILE & WALLET -->
          <div class="card" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.1);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: ${levelInfo.glowColor}; display: flex; align-items: center; justify-content: center; color: ${levelInfo.accentColor}; border: 1px solid ${levelInfo.borderColor};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin: 0;">Profile & Wallet</h3>
                <div style="font-size: 0.75rem; color: ${levelInfo.accentColor}; font-weight: 700;">Lv.${levelInfo.level} ${levelInfo.title} • ${levelInfo.material}</div>
              </div>
            </div>

            <form id="settingsProfileForm" onsubmit="window.boobaApp.handleSaveProfileSettings(event)">
              
              <!-- Avatar Preview & Selection -->
              <div style="margin-bottom: 1.25rem; display: flex; align-items: center; gap: 1.25rem;">
                <img id="settingsAvatarPreview" src="${currentAvatar}" style="width: 56px; height: 56px; border-radius: 16px; border: 2px solid ${levelInfo.accentColor}; object-fit: cover; box-shadow: 0 0 15px ${levelInfo.glowColor};">
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

    const TIERS_CONFIG = LEVEL_TIERS;

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

        <!-- PASSPORT PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Mascots and Passports</span>
          </h1>
        </div>

        <!-- Vertical Scrolling Passport Feed (Level 1 to 10 - Pure Transparent Floating) -->
        <div class="passport-vertical-showcase-feed">
          ${TIERS_CONFIG.map((t) => {
            const isUnlocked = user.boobaPoints >= t.min;
            const isCurrent = levelInfo.level === t.level;
            
            // Format passport ID to 16-digit card style: 8008 XXXX XXXX XXXX
            const rawId = (user.passportId || 'BOOBA2026').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const paddedId = (rawId + '000000000000').slice(0, 12);
            const cardNumber = `8008 ${paddedId.slice(0,4)} ${paddedId.slice(4,8)} ${paddedId.slice(8,12)}`;

            // Metallic gradient color stops per tier
            const palettes = {
              1: ['#E0A96D', '#CD7F32', '#8C501E', '#3D1700'], // Bronze Metallic
              2: ['#A7F3D0', '#10B981', '#059669', '#022C19'], // Cyber Emerald
              3: ['#BFDBFE', '#3B82F6', '#1D4ED8', '#0B1D3A'], // Royal Sapphire
              4: ['#FDE68A', '#F59E0B', '#D97706', '#3D1700'], // Neon Amber
              5: ['#A78BFA', '#8B5CF6', '#6D28D9', '#2E1065'], // Obsidian Violet Nebula
              6: ['#FECDD3', '#F43F5E', '#E11D48', '#4C0519'], // Crimson Ruby Titanium
              7: ['#FFFFFF', '#E2E8F0', '#94A3B8', '#1E293B'], // Frosted Platinum Mirror
              8: ['#FFF59D', '#F3BA2F', '#D4AF37', '#543603'], // 24K Imperial Gold
              9: ['#FDE047', '#1E293B', '#0F172A', '#020617'], // Prismatic Liquid Chrome
              10: ['#FFFFFF', '#FF6FD8', '#3813C2', '#00F2FE'] // Celestial Quantum Prism
            };
            const p = palettes[t.level] || palettes[5];

            return `
              <div class="passport-level-section" id="passportSection-${t.level}" data-level="${t.level}">
                
                <!-- Background Level Watermark Identification -->
                <div class="passport-level-backdrop-text">LEVEL ${t.level}</div>

                <!-- Dual Column Stage: Mascot Left, Passport Card Right (Floating Directly on Animated Background) -->
                <div class="passport-dual-hero-stage">
                  
                  <!-- LEFT COLUMN: 3D Living Mascot -->
                  <div class="passport-hero-mascot-col">
                    <div class="passport-mascot-glow" style="background: ${t.glowColor};"></div>
                    <img src="${t.mascotImage || 'assets/mascot_level1.png'}" class="passport-hero-mascot-img mascot-anim-${t.level}" alt="Lv.${t.level} ${t.title}">
                  </div>

                  <!-- RIGHT COLUMN: Luxury 3D Flip Passport Card -->
                  <div class="passport-hero-card-col">
                    <div class="passport-card-3d-wrapper" id="cardWrapper-${t.level}" onclick="window.boobaApp.togglePassportCardFlip(${t.level})">
                      <div class="passport-card-inner">
                        
                        <!-- CARD FRONT: Luxury Metallic Sovereign Card -->
                        <div class="passport-card-face passport-card-front ${t.themeClass}">
                          
                          <!-- Dynamic Metallic Wave Texture (SVG Layer) -->
                          <svg class="passport-metallic-bg-svg" viewBox="0 0 480 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                              <linearGradient id="metalGrad-${t.level}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="${p[0]}"/>
                                <stop offset="35%" stop-color="${p[1]}"/>
                                <stop offset="70%" stop-color="${p[2]}"/>
                                <stop offset="100%" stop-color="${p[3]}"/>
                              </linearGradient>

                              <linearGradient id="ribbon1-${t.level}" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="${p[3]}" stop-opacity="0.85"/>
                                <stop offset="50%" stop-color="${p[1]}" stop-opacity="0.95"/>
                                <stop offset="100%" stop-color="${p[0]}" stop-opacity="0.5"/>
                              </linearGradient>

                              <linearGradient id="ribbon2-${t.level}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="${p[2]}" stop-opacity="0.9"/>
                                <stop offset="50%" stop-color="${p[0]}" stop-opacity="0.95"/>
                                <stop offset="100%" stop-color="${p[3]}" stop-opacity="0.7"/>
                              </linearGradient>

                              <linearGradient id="specularGlow-${t.level}" x1="0%" y1="0%" x2="100%" y2="80%">
                                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
                                <stop offset="35%" stop-color="#ffffff" stop-opacity="0.1"/>
                                <stop offset="45%" stop-color="#ffffff" stop-opacity="0.0"/>
                                <stop offset="75%" stop-color="#ffffff" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
                              </linearGradient>
                            </defs>

                            <!-- Base Metallic Plate -->
                            <rect width="480" height="300" rx="22" fill="url(#metalGrad-${t.level})"/>

                            <!-- Fine Harmonic Micro-Curved Lines -->
                            <g stroke="${p[0]}" stroke-width="0.8" stroke-opacity="0.4" fill="none">
                              <path d="M0,50 Q240,5 480,70"/>
                              <path d="M0,65 Q240,20 480,85"/>
                              <path d="M0,80 Q240,35 480,100"/>
                              <path d="M0,95 Q240,50 480,115"/>
                              <path d="M0,110 Q240,65 480,130"/>
                              <path d="M0,125 Q240,80 480,145"/>
                              <path d="M0,140 Q240,95 480,160"/>
                            </g>

                            <!-- Dynamic Flowing Ribbon Wave 1 (Deep Bottom-Right) -->
                            <path d="M0,150 C140,100 260,210 480,120 L480,300 L0,300 Z" fill="url(#ribbon1-${t.level})"/>

                            <!-- Dynamic Flowing Ribbon Wave 2 (Middle Smooth Sine) -->
                            <path d="M0,210 C160,260 300,140 480,200 L480,300 L0,300 Z" fill="url(#ribbon2-${t.level})"/>

                            <!-- Dynamic Highlight Ridge Line -->
                            <path d="M0,150 C140,100 260,210 480,120" fill="none" stroke="#FFFFFF" stroke-width="1.2" stroke-opacity="0.55"/>

                            <!-- Specular Light Sheen Overlay -->
                            <rect width="480" height="300" rx="22" fill="url(#specularGlow-${t.level})"/>
                          </svg>

                          <!-- Top Row: Mascot Emblem + Brand and Chain Info -->
                          <div class="passport-card-row-top" style="display: flex; justify-content: space-between; align-items: flex-start; z-index: 5;">
                            
                            <!-- Left: Level Mascot Emblem + Citizen Title -->
                            <div style="display: flex; align-items: center; gap: 0.65rem;">
                              <div class="passport-mascot-emblem-badge" style="border-color: ${t.borderColor}; background: rgba(0,0,0,0.6); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1.5px solid ${t.borderColor};">
                                <img src="${t.mascotImage || 'assets/mascot_level1.png'}" alt="Lv.${t.level} Mascot" style="width: 100%; height: 100%; object-fit: contain;">
                              </div>
                              <div>
                                <div class="passport-card-title-main" style="font-size: 0.95rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                                  BOOBA CITIZEN
                                </div>
                                <div class="passport-card-subtitle" style="font-size: 0.68rem; color: rgba(255, 255, 255, 0.75); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                                  PASSPORT CARD
                                </div>
                              </div>
                            </div>

                            <!-- Right: Chain + Material Tag -->
                            <div style="text-align: right;">
                              <div class="passport-card-chain-name" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; letter-spacing: 0.05em; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                                BNB SMART CHAIN
                              </div>
                              <div class="passport-card-chain-sub" style="font-size: 0.65rem; color: rgba(255, 255, 255, 0.75); font-weight: 600;">
                                BEP-20 • ${t.material}
                              </div>
                            </div>
                          </div>

                          <!-- Middle Row: EMV Chip + Contactless Wave -->
                          <div class="passport-card-row-chip" style="display: flex; align-items: center; gap: 0.85rem; margin-top: 1rem; margin-bottom: 0.5rem; z-index: 5;">
                            <!-- Gold EMV Chip -->
                            <div class="crypto-emv-chip"></div>

                            <!-- Contactless NFC Wave Icon -->
                            <svg class="contactless-wave-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M8.5 16.5a5 5 0 0 1 0-7"/>
                              <path d="M12 19a9 9 0 0 0 0-14"/>
                              <path d="M15.5 21.5a13 13 0 0 0 0-19"/>
                            </svg>
                          </div>

                          <!-- 16-Digit Embossed Card Number -->
                          <div class="passport-card-row-number" style="z-index: 5; margin: 0.5rem 0 1.25rem 0;">
                            <div class="card-number-embossed" style="font-size: clamp(1.2rem, 2.5vw, 1.6rem); letter-spacing: 0.18em;">
                              ${cardNumber}
                            </div>
                          </div>

                          <!-- Bottom Row: Cardholder Name, Member Since, Sovereign Tier Tag -->
                          <div class="passport-card-row-bottom" style="display: flex; justify-content: space-between; align-items: flex-end; z-index: 5;">
                            
                            <!-- Cardholder -->
                            <div>
                              <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                                CARD HOLDER
                              </div>
                              <div class="card-embossed-text card-embossed-holder" style="font-size: 0.95rem; font-weight: 800; color: #FFFFFF; letter-spacing: 0.05em; text-transform: uppercase;">
                                ${user.username || 'BOOBA CITIZEN'}
                              </div>
                            </div>

                            <!-- Member Since -->
                            <div>
                              <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                                MEMBER SINCE
                              </div>
                              <div class="card-embossed-text card-embossed-date" style="font-size: 0.88rem; font-weight: 800; color: #FFFFFF;">
                                ${new Date(user.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                              </div>
                            </div>

                            <!-- Sovereign Tier Pill -->
                            <div style="text-align: right;">
                              <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                                SOVEREIGN TIER
                              </div>
                              <div class="passport-tier-badge-pill" style="background: rgba(0, 0, 0, 0.65); border: 1px solid rgba(255, 255, 255, 0.25); color: #FFFFFF; font-size: 0.78rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 8px;">
                                LV.${t.level} ${t.title.toUpperCase()}
                              </div>
                            </div>

                          </div>

                        </div>

                        <!-- CARD BACK: Magnetic Strip, Hologram & Signature -->
                        <div class="passport-card-face passport-card-back ${t.themeClass}">
                          
                          <!-- Magnetic Strip -->
                          <div class="card-magnetic-strip"></div>

                          <div style="padding: 0 0.5rem; display: flex; flex-direction: column; justify-content: space-between; height: calc(100% - 60px); z-index: 5;">
                            
                            <!-- Signature Panel & CVV -->
                            <div style="margin-top: 1rem;">
                              <div class="card-signature-strip">
                                <span class="signature-text">${user.username || 'Authorized Citizen'}</span>
                                <span class="cvv-box">${cardNumber.slice(-3)}</span>
                              </div>
                            </div>

                            <!-- Holographic Authenticity Seal & QR -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin: 1rem 0;">
                              <div class="hologram-security-seal">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                                <span>SECURE</span>
                              </div>

                              <div style="text-align: right;">
                                <div style="font-size: 0.68rem; color: var(--text-secondary); font-family: var(--font-mono);">
                                  PASSPORT HASH: ${cardNumber.replace(/\s/g, '')}
                                </div>
                                <div style="font-size: 0.68rem; color: ${t.accentColor}; font-weight: 700;">
                                  ${t.unlock}
                                </div>
                              </div>
                            </div>

                            <!-- Flip Front Button -->
                            <div style="display: flex; justify-content: flex-end;">
                              <button type="button" class="flip-hint-pill" onclick="event.stopPropagation(); window.boobaApp.togglePassportCardFlip(${t.level})" style="padding: 0.25rem 0.75rem; font-size: 0.72rem;">
                                <span>↺ Flip to Front</span>
                              </button>
                            </div>

                          </div>

                        </div>

                      </div>
                    </div>
                  </div>

                </div>

              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.attachPassportCarouselListeners(levelInfo.level);
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
    const isWalletUser = user.authProvider === 'wallet' || (user.email && user.email.includes('@wallet.booba.crypto')) || (user.username && user.username.startsWith('BNB_'));
    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const formattedWallet = isWalletConnected ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : '';
    const isDefaultWalletName = isWalletUser && (user.username || '').startsWith('BNB_');
    const isAdmin = user.role === 'admin' || user.isAdmin === true || user.username === 'BoobaBoss';

    // Format passport ID to 16-digit card style: 8008 XXXX XXXX XXXX
    const rawId = (user.passportId || 'BOOBA2026').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const paddedId = (rawId + '000000000000').slice(0, 12);
    const cardNumber = `8008 ${paddedId.slice(0,4)} ${paddedId.slice(4,8)} ${paddedId.slice(8,12)}`;

    // Metallic gradient color stops per tier
    const palettes = {
      1: ['#E0A96D', '#CD7F32', '#8C501E', '#3D1700'], // Bronze Metallic
      2: ['#A7F3D0', '#10B981', '#059669', '#022C19'], // Cyber Emerald
      3: ['#BFDBFE', '#3B82F6', '#1D4ED8', '#0B1D3A'], // Royal Sapphire
      4: ['#FDE68A', '#F59E0B', '#D97706', '#3D1700'], // Neon Amber
      5: ['#A78BFA', '#8B5CF6', '#6D28D9', '#2E1065'], // Obsidian Violet Nebula
      6: ['#FECDD3', '#F43F5E', '#E11D48', '#4C0519'], // Crimson Ruby Titanium
      7: ['#FFFFFF', '#E2E8F0', '#94A3B8', '#1E293B'], // Frosted Platinum Mirror
      8: ['#FFF59D', '#F3BA2F', '#D4AF37', '#543603'], // 24K Imperial Gold
      9: ['#FDE047', '#1E293B', '#0F172A', '#020617'], // Prismatic Liquid Chrome
      10: ['#FFFFFF', '#FF6FD8', '#3813C2', '#00F2FE'] // Celestial Quantum Prism
    };
    const p = palettes[levelInfo.level] || palettes[5];
    const hasCustomUsername = user.username && !user.username.startsWith('BNB_');
    const welcomeName = hasCustomUsername ? user.username : (user.passportId || 'Citizen');

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- DASHBOARD WELCOME HEADER -->
        <div style="text-align: center; margin: 0 auto 2.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.15; font-family: var(--font-heading); margin-bottom: 0;">
            Welcome, <span class="text-gradient-gold">${welcomeName}</span>
          </h1>
        </div>

        <!-- UNBOXED LIVING MASCOT & PASSPORT STAGE (MATCHING PASSPORT.HTML) -->
        <div class="passport-level-section" id="passportSection-user" data-level="${levelInfo.level}" style="margin-bottom: 2.5rem; padding: 1.5rem 0;">
          
          <!-- Background Level Watermark Identification -->
          <div class="passport-level-backdrop-text">LEVEL ${levelInfo.level}</div>

          <!-- Dual Column Stage: Mascot Left, Passport Card Right (Floating Directly on Animated Background) -->
          <div class="passport-dual-hero-stage">
            
            <!-- LEFT COLUMN: 3D Living Mascot -->
            <div class="passport-hero-mascot-col">
              <div class="passport-mascot-glow" style="background: ${levelInfo.glowColor};"></div>
              <img src="${levelInfo.mascotImage || 'assets/mascot_level1.png'}" class="passport-hero-mascot-img mascot-anim-${levelInfo.level}" alt="Lv.${levelInfo.level} ${levelInfo.title}">
            </div>

            <!-- RIGHT COLUMN: Luxury 3D Flip Passport Card -->
            <div class="passport-hero-card-col">
              <div class="passport-card-3d-wrapper" id="cardWrapper-user" onclick="window.boobaApp.togglePassportCardFlip('user')">
                <div class="passport-card-inner">
                  
                  <!-- CARD FRONT: Luxury Metallic Sovereign Card -->
                  <div class="passport-card-face passport-card-front ${levelInfo.themeClass}">
                    
                    <!-- Dynamic Metallic Wave Texture (SVG Layer) -->
                    <svg class="passport-metallic-bg-svg" viewBox="0 0 480 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="dashMetalGrad-${levelInfo.level}" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="${p[0]}"/>
                          <stop offset="35%" stop-color="${p[1]}"/>
                          <stop offset="70%" stop-color="${p[2]}"/>
                          <stop offset="100%" stop-color="${p[3]}"/>
                        </linearGradient>

                        <linearGradient id="dashRibbon1-${levelInfo.level}" x1="0%" y1="100%" x2="100%" y2="0%">
                          <stop offset="0%" stop-color="${p[3]}" stop-opacity="0.85"/>
                          <stop offset="50%" stop-color="${p[1]}" stop-opacity="0.95"/>
                          <stop offset="100%" stop-color="${p[0]}" stop-opacity="0.5"/>
                        </linearGradient>

                        <linearGradient id="dashRibbon2-${levelInfo.level}" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="${p[2]}" stop-opacity="0.9"/>
                          <stop offset="50%" stop-color="${p[0]}" stop-opacity="0.95"/>
                          <stop offset="100%" stop-color="${p[3]}" stop-opacity="0.7"/>
                        </linearGradient>

                        <linearGradient id="dashSpecular-${levelInfo.level}" x1="0%" y1="0%" x2="100%" y2="80%">
                          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
                          <stop offset="35%" stop-color="#ffffff" stop-opacity="0.1"/>
                          <stop offset="45%" stop-color="#ffffff" stop-opacity="0.0"/>
                          <stop offset="75%" stop-color="#ffffff" stop-opacity="0.25"/>
                          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
                        </linearGradient>
                      </defs>

                      <!-- Base Metallic Plate -->
                      <rect width="480" height="300" rx="22" fill="url(#dashMetalGrad-${levelInfo.level})"/>

                      <!-- Fine Harmonic Micro-Curved Lines -->
                      <g stroke="${p[0]}" stroke-width="0.8" stroke-opacity="0.4" fill="none">
                        <path d="M0,50 Q240,5 480,70"/>
                        <path d="M0,65 Q240,20 480,85"/>
                        <path d="M0,80 Q240,35 480,100"/>
                        <path d="M0,95 Q240,50 480,115"/>
                        <path d="M0,110 Q240,65 480,130"/>
                        <path d="M0,125 Q240,80 480,145"/>
                        <path d="M0,140 Q240,95 480,160"/>
                      </g>

                      <!-- Dynamic Flowing Ribbon Wave 1 -->
                      <path d="M0,150 C140,100 260,210 480,120 L480,300 L0,300 Z" fill="url(#dashRibbon1-${levelInfo.level})"/>

                      <!-- Dynamic Flowing Ribbon Wave 2 -->
                      <path d="M0,210 C160,260 300,140 480,200 L480,300 L0,300 Z" fill="url(#dashRibbon2-${levelInfo.level})"/>

                      <!-- Dynamic Highlight Ridge Line -->
                      <path d="M0,150 C140,100 260,210 480,120" fill="none" stroke="#FFFFFF" stroke-width="1.2" stroke-opacity="0.55"/>

                      <!-- Specular Light Sheen Overlay -->
                      <rect width="480" height="300" rx="22" fill="url(#dashSpecular-${levelInfo.level})"/>
                    </svg>

                    <!-- Top Row: Mascot Emblem + Brand and Chain Info -->
                    <div class="passport-card-row-top" style="display: flex; justify-content: space-between; align-items: flex-start; z-index: 5;">
                      
                      <!-- Left: Level Mascot Emblem + Citizen Title -->
                      <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div class="passport-mascot-emblem-badge" style="border-color: ${levelInfo.borderColor}; background: rgba(0,0,0,0.6); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1.5px solid ${levelInfo.borderColor};">
                          <img src="${levelInfo.mascotImage || 'assets/mascot_level1.png'}" alt="Lv.${levelInfo.level} Mascot" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                        <div>
                          <div class="passport-card-title-main" style="font-size: 0.95rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #FFFFFF; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                            BOOBA CITIZEN
                          </div>
                          <div class="passport-card-subtitle" style="font-size: 0.68rem; color: rgba(255, 255, 255, 0.75); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                            PASSPORT CARD
                          </div>
                        </div>
                      </div>

                      <!-- Right: Chain + Material Tag -->
                      <div style="text-align: right;">
                        <div class="passport-card-chain-name" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; letter-spacing: 0.05em; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
                          BNB SMART CHAIN
                        </div>
                        <div class="passport-card-chain-sub" style="font-size: 0.65rem; color: rgba(255, 255, 255, 0.75); font-weight: 600;">
                          BEP-20 • ${levelInfo.material}
                        </div>
                      </div>
                    </div>

                    <!-- Middle Row: EMV Chip + Contactless Wave -->
                    <div class="passport-card-row-chip" style="display: flex; align-items: center; gap: 0.85rem; margin-top: 1rem; margin-bottom: 0.5rem; z-index: 5;">
                      <!-- Gold EMV Chip -->
                      <div class="crypto-emv-chip"></div>

                      <!-- Contactless NFC Wave Icon -->
                      <svg class="contactless-wave-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.5 16.5a5 5 0 0 1 0-7"/>
                        <path d="M12 19a9 9 0 0 0 0-14"/>
                        <path d="M15.5 21.5a13 13 0 0 0 0-19"/>
                      </svg>
                    </div>

                    <!-- 16-Digit Embossed Card Number -->
                    <div class="passport-card-row-number" style="z-index: 5; margin: 0.5rem 0 1.25rem 0;">
                      <div class="card-number-embossed" style="font-size: clamp(1.2rem, 2.5vw, 1.6rem); letter-spacing: 0.18em;">
                        ${cardNumber}
                      </div>
                    </div>

                    <!-- Bottom Row: Cardholder Name, Member Since, Sovereign Tier Tag -->
                    <div class="passport-card-row-bottom" style="display: flex; justify-content: space-between; align-items: flex-end; z-index: 5;">
                      
                      <!-- Cardholder -->
                      <div>
                        <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                          CARD HOLDER
                        </div>
                        <div class="card-embossed-text card-embossed-holder" style="font-size: 0.95rem; font-weight: 800; color: #FFFFFF; letter-spacing: 0.05em; text-transform: uppercase;">
                          ${user.username || 'BOOBA CITIZEN'}
                        </div>
                      </div>

                      <!-- Member Since -->
                      <div>
                        <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                          MEMBER SINCE
                        </div>
                        <div class="card-embossed-text card-embossed-date" style="font-size: 0.88rem; font-weight: 800; color: #FFFFFF;">
                          ${new Date(user.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      <!-- Sovereign Tier Pill -->
                      <div style="text-align: right;">
                        <div class="passport-card-label" style="font-size: 0.62rem; color: rgba(255, 255, 255, 0.7); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                          SOVEREIGN TIER
                        </div>
                        <div class="passport-tier-badge-pill" style="background: rgba(0, 0, 0, 0.65); border: 1px solid rgba(255, 255, 255, 0.25); color: #FFFFFF; font-size: 0.78rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 8px;">
                          LV.${levelInfo.level} ${levelInfo.title.toUpperCase()}
                        </div>
                      </div>

                    </div>

                  </div>

                  <!-- CARD BACK: Magnetic Strip, Hologram & Signature -->
                  <div class="passport-card-face passport-card-back ${levelInfo.themeClass}">
                    
                    <!-- Magnetic Strip -->
                    <div class="card-magnetic-strip"></div>

                    <div style="padding: 0 0.5rem; display: flex; flex-direction: column; justify-content: space-between; height: calc(100% - 60px); z-index: 5;">
                      
                      <!-- Signature Panel & CVV -->
                      <div style="margin-top: 1rem;">
                        <div class="card-signature-strip">
                          <span class="signature-text">${user.username || 'Authorized Citizen'}</span>
                          <span class="cvv-box">${cardNumber.slice(-3)}</span>
                        </div>
                      </div>

                      <!-- Holographic Authenticity Seal & QR -->
                      <div style="display: flex; justify-content: space-between; align-items: center; margin: 1rem 0;">
                        <div class="hologram-security-seal">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                          </svg>
                          <span>SECURE</span>
                        </div>

                        <div style="text-align: right;">
                          <div style="font-size: 0.68rem; color: var(--text-secondary); font-family: var(--font-mono);">
                            PASSPORT HASH: ${cardNumber.replace(/\s/g, '')}
                          </div>
                          <div style="font-size: 0.68rem; color: ${levelInfo.accentColor}; font-weight: 700;">
                            ${levelInfo.unlock || 'Sovereign Verified'}
                          </div>
                        </div>
                      </div>

                      <!-- Flip Front Button -->
                      <div style="display: flex; justify-content: flex-end;">
                        <button type="button" class="flip-hint-pill" onclick="event.stopPropagation(); window.boobaApp.togglePassportCardFlip('user')" style="padding: 0.25rem 0.75rem; font-size: 0.72rem;">
                          <span>↺ Flip to Front</span>
                        </button>
                      </div>

                    </div>

                  </div>

                </div>
              </div>

            </div>

          </div>

          <!-- PROFESSIONAL UNBOXED ACTION BUTTONS ROW (BELOW BOTH MASCOT AND CARD) -->
          <div class="dashboard-hero-actions" style="display: flex; gap: 0.75rem; align-items: center; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem; width: 100%;">
            
            ${isAdmin ? `
              <a href="teamadmin.html" class="btn" style="display: inline-flex; align-items: center; gap: 0.45rem; background: rgba(243, 186, 47, 0.15); border: 1.5px solid var(--brand-yellow); color: var(--brand-yellow); font-weight: 800; font-size: 0.85rem; padding: 0.65rem 1.25rem; border-radius: 12px; text-decoration: none; box-shadow: 0 0 16px rgba(243, 186, 47, 0.25);">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <span>Admin Console</span>
              </a>
            ` : ''}

            ${!isWalletConnected ? `
              <button type="button" class="btn" onclick="window.boobaApp.openAddWalletModal()" style="display: inline-flex; align-items: center; gap: 0.45rem; background: var(--brand-yellow); color: #000000; font-weight: 900; font-size: 0.85rem; border: none; border-radius: 12px; padding: 0.65rem 1.25rem; box-shadow: 0 0 20px rgba(243, 186, 47, 0.4);">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
                <span>+ Add Wallet</span>
              </button>
            ` : `
              <button type="button" class="btn btn-secondary" onclick="window.boobaApp.openAddWalletModal()" style="display: inline-flex; align-items: center; gap: 0.45rem; background: rgba(255,255,255,0.06); border: 1.5px solid var(--border-medium); color: #FFFFFF; font-size: 0.85rem; font-weight: 700; border-radius: 12px; padding: 0.65rem 1.15rem;">
                <span class="pulse-dot" style="width: 6px; height: 6px; background: var(--accent-emerald);"></span>
                <span class="text-mono">${formattedWallet}</span>
              </button>
            `}

            ${isDefaultWalletName ? `
              <button type="button" class="btn btn-secondary" onclick="window.boobaApp.openAddUsernameModal()" style="display: inline-flex; align-items: center; gap: 0.45rem; background: rgba(255,255,255,0.06); border: 1.5px solid var(--border-medium); color: #FFFFFF; font-weight: 700; font-size: 0.85rem; border-radius: 12px; padding: 0.65rem 1.15rem;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>+ Add Username</span>
              </button>
            ` : ''}

            <a href="presale.html" class="btn" style="display: inline-flex; align-items: center; gap: 0.45rem; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; font-weight: 800; font-size: 0.85rem; border-radius: 12px; padding: 0.65rem 1.25rem; box-shadow: 0 0 20px rgba(243,186,47,0.4); text-decoration: none;">
              <span class="pulse-dot" style="width: 6px; height: 6px; background: #000;"></span>
              <span>⚡ Presale (Stage 1)</span>
            </a>

            <a href="withdraw.html" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 0.45rem; text-decoration: none; border: 1.5px solid var(--border-medium); background: rgba(255,255,255,0.06); color: #FFFFFF; font-size: 0.85rem; font-weight: 700; border-radius: 12px; padding: 0.65rem 1.25rem;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
              <span>Withdraw $BOOBA</span>
            </a>

          </div>

        </div>

        <!-- 4 BENTO STATS METRICS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 1.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Token Balance</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${levelInfo.accentColor};"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: ${levelInfo.accentColor}; line-height: 1.1;" data-counter-target="${user.boobaPoints}">
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${levelInfo.accentColor};"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
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
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Referral Network</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent-cyan);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">
              ${Number(user.referralCount || 0)} Citizens
            </div>
            <div style="font-size: 0.78rem; color: var(--brand-yellow); margin-top: 0.4rem;">
              <a href="referrals.html" style="color: var(--brand-yellow); font-weight: 700; text-decoration: none;">Invite & Earn 20% →</a>
            </div>
          </div>

        </div>

        <!-- 3 ACTION HUBS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.75rem; margin-bottom: 2.5rem;">
          
          <div class="card card-hover" style="padding: 2.25rem; display: flex; flex-direction: column; justify-content: space-between; border-color: ${levelInfo.borderColor}; background: linear-gradient(180deg, ${levelInfo.glowColor} 0%, rgba(14, 18, 27, 0.9) 100%);">
            <div>
              <div class="bento-icon-badge" style="background: ${levelInfo.glowColor}; color: ${levelInfo.accentColor}; border-color: ${levelInfo.borderColor}; margin-bottom: 1.25rem;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem;">
                <h3 style="font-size: 1.3rem; margin: 0; color: #FFFFFF;">Digital Booba Passport</h3>
                <span class="badge-tag" style="background: ${levelInfo.accentColor}; color: #000000; font-weight: 900; font-size: 0.72rem;">Lv.${levelInfo.level}</span>
              </div>
              <div style="font-size: 0.75rem; color: ${levelInfo.accentColor}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.85rem;">
                ${levelInfo.material} • ${levelInfo.tierBadge}
              </div>
              <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                Your ${levelInfo.title} card is live on BNB Smart Chain. View your 3D interactive holographic card, cryptographic chip, and tier unlock criteria.
              </p>
            </div>
            <a href="passport.html" class="btn btn-secondary btn-block" style="border-color: ${levelInfo.borderColor};">Open My Passport (${levelInfo.title}) →</a>
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
        <div class="container page-content" style="max-width: 500px; margin: 4rem auto;">
          <div class="card text-center" style="padding: 3rem 2rem; background: rgba(14, 18, 27, 0.85); backdrop-filter: blur(20px); border: 1.5px solid rgba(255, 255, 255, 0.1); border-radius: 28px;">
            <div style="position: relative; width: 72px; height: 72px; margin: 0 auto 1.25rem auto;">
              <img src="assets/mascot.jpg" style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2); object-fit: cover;">
            </div>
            <h2 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem;">Access $BOOBA Withdrawal</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.75rem;">
              Sign in with your credentials to withdraw your earned tokens to your BNB Smart Chain wallet.
            </p>
            <a href="signin.html#signin" class="btn btn-primary btn-block btn-lg" style="font-weight: 800; justify-content: center;">Sign In to Account</a>
          </div>
        </div>
      `;
      return;
    }

    const isWalletConnected = Boolean(user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const userWithdrawals = db.getUserWithdrawals();

    container.innerHTML = `
      <div class="container page-content" style="max-width: 1060px; margin: 0 auto; padding-top: 2rem; padding-bottom: 4rem;">
        
        <!-- Back & Quick Navigation Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 0.75rem;">
          <a href="dashboard.html" class="back-dashboard-btn" style="padding: 0.45rem 0.85rem; font-size: 0.82rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Dashboard</span>
          </a>

          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.addTokenToWallet()" style="font-size: 0.78rem; padding: 0.35rem 0.75rem; color: var(--brand-yellow); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px;">
              + Add to Wallet
            </button>
            <a href="presale.html" class="btn btn-ghost btn-sm" style="font-size: 0.78rem; padding: 0.35rem 0.75rem; color: #FFFFFF; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px;">
              Presale Hub →
            </a>
          </div>
        </div>

        <!-- Sleek Hero Header -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3rem auto;">
          <div style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.85rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; margin-bottom: 1rem;">
            <span class="pulse-dot" style="width: 6px; height: 6px; background: var(--brand-yellow);"></span>
            <span style="font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.05em;">BNB SMART CHAIN (BEP-20)</span>
          </div>
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.6rem 0; line-height: 1.15;">
            Withdraw $BOOBA
          </h1>
          <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 0 auto; line-height: 1.6; max-width: 580px;">
            Transfer your earned tokens directly to your self-custody BEP-20 wallet with zero platform bridge fees.
          </p>
        </div>

        <!-- 2-COLUMN LEFT & RIGHT GRID (LIKE SETTINGS PAGE) -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 2.5rem; align-items: start;">
          
          <!-- LEFT BOX: BALANCE & SETTLEMENT INFO -->
          <div class="card" style="padding: clamp(1.5rem, 3.5vw, 2.25rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px);">
            
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(243,186,47,0.12); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow); font-weight: 900; font-size: 0.85rem;">
                💰
              </div>
              <div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin: 0;">Account Balance</h3>
                <div style="font-size: 0.72rem; color: var(--text-secondary);">Available on-chain withdrawal balance</div>
              </div>
            </div>

            <!-- Available Balance Strip -->
            <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem 1.35rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 0.2rem;">Available to Withdraw</div>
                <div style="font-size: 1.85rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); line-height: 1.15;">
                  <span id="withdrawAvailableBalance">${Number(user.boobaPoints).toLocaleString()}</span> <span style="font-size: 0.95rem; color: #FFFFFF;">$BOOBA</span>
                </div>
              </div>
              <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); font-size: 0.7rem; font-weight: 700; padding: 0.25rem 0.6rem;">
                0% Fee
              </span>
            </div>

            <!-- Clean Settlement Info Strip -->
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 14px; padding: 1rem; font-size: 0.78rem; line-height: 1.6;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-secondary);">Network:</span>
                <span style="color: #FFFFFF; font-weight: 600;">BNB Smart Chain (BEP-20)</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-secondary);">Platform Fee:</span>
                <span style="color: var(--accent-emerald); font-weight: 700;">0.00 $BOOBA (Free)</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: 800;">
                <span style="color: #FFFFFF;">Conversion:</span>
                <span style="color: var(--brand-yellow); font-family: var(--font-mono);">1:1 On-Chain Delivery</span>
              </div>
            </div>

          </div>

          <!-- RIGHT BOX: WITHDRAWAL FORM TERMINAL -->
          <div class="card" style="padding: clamp(1.5rem, 3.5vw, 2.25rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px);">
            
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald); font-weight: 900; font-size: 0.85rem;">
                🚀
              </div>
              <div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin: 0;">Request Withdrawal</h3>
                <div style="font-size: 0.72rem; color: var(--text-secondary);">Direct dispatch to your BEP-20 destination</div>
              </div>
            </div>

            <!-- Destination Wallet Input -->
            <div style="margin-bottom: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <label style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin: 0;">Destination BEP-20 Wallet</label>
                <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openWalletModal()" style="font-size: 0.72rem; color: var(--brand-yellow); padding: 0.15rem 0.5rem;">
                  ${isWalletConnected ? 'Switch Wallet' : 'Connect Wallet'}
                </button>
              </div>
              <div style="position: relative;">
                <input type="text" id="withdrawWalletInput" class="form-input text-mono" value="${isWalletConnected ? user.walletAddress : ''}" placeholder="0x... Connect or paste BSC address" style="padding-left: 2.35rem; font-size: 0.84rem; border-radius: 12px; height: 46px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: ${isWalletConnected ? 'var(--accent-emerald)' : 'var(--text-muted)'}; display: flex;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
                </div>
              </div>
            </div>

            <!-- Amount to Withdraw Input & Percentage Chips -->
            <div style="margin-bottom: 1.35rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <label style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin: 0;">Amount to Withdraw</label>
                <div style="display: flex; gap: 0.35rem;">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.max(1, Math.floor(${user.boobaPoints} * 0.25))" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.04); border-radius: 6px;">25%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.max(1, Math.floor(${user.boobaPoints} * 0.50))" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.04); border-radius: 6px;">50%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = Math.max(1, Math.floor(${user.boobaPoints} * 0.75))" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.04); border-radius: 6px;">75%</button>
                  <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('withdrawAmountInput').value = ${user.boobaPoints}" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.08); color: var(--brand-yellow); font-weight: 800; border-radius: 6px;">MAX</button>
                </div>
              </div>
              <input type="number" id="withdrawAmountInput" class="form-input text-mono" placeholder="0" min="1" max="${user.boobaPoints}" value="${user.boobaPoints > 0 ? user.boobaPoints : ''}" style="font-size: 1.25rem; font-weight: 900; color: var(--brand-yellow); border-radius: 12px; height: 50px; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);">
            </div>

            <!-- Big CTA Button -->
            <button type="button" id="executeWithdrawBtn" class="btn btn-primary btn-lg btn-block" onclick="window.boobaApp.handleExecuteWithdrawal()" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 900; font-size: 1rem; height: 50px; border-radius: 12px; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; box-shadow: 0 4px 20px rgba(243, 186, 47, 0.3);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
              <span>Withdraw $BOOBA to Wallet</span>
            </button>

          </div>

        </div>

        <!-- WITHDRAWAL HISTORY LEDGER -->
        <div class="card" style="padding: clamp(1.25rem, 3vw, 1.75rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); margin-bottom: 3rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <h3 style="font-size: 1.05rem; font-weight: 800; color: #FFFFFF; margin: 0;">Withdrawal History</h3>
            <span class="badge-tag" style="background: rgba(255,255,255,0.06); color: var(--text-secondary); font-size: 0.72rem;">
              ${userWithdrawals.length} ${userWithdrawals.length === 1 ? 'Record' : 'Records'}
            </span>
          </div>

          ${userWithdrawals.length === 0 ? `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--text-secondary); font-size: 0.82rem;">
              No withdrawals executed yet. Your withdrawal records will appear here.
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 0.65rem;">
              ${userWithdrawals.map(w => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1rem; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; flex-wrap: wrap; gap: 0.5rem;">
                  <div>
                    <div style="font-weight: 800; color: var(--brand-yellow); font-family: var(--font-mono); font-size: 0.95rem;">
                      -${Number(w.amount).toLocaleString()} $BOOBA
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.15rem;">
                      ${new Date(w.timestamp).toLocaleDateString()} • ${w.walletAddress ? w.walletAddress.slice(0, 6) + '...' + w.walletAddress.slice(-4) : 'BSC Wallet'}
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                    ${w.deliveryProofScreenshot ? `
                      <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openImageLightbox('${w.deliveryProofScreenshot}')" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; color: var(--accent-emerald); background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-weight: 700;">
                        ✓ Delivery Proof
                      </button>
                    ` : ''}
                    ${(w.status === 'Completed' || w.status === 'completed') && (w.sentTxHash || w.txHash) ? `
                      <a href="${w.explorerUrl || `https://bscscan.com/tx/${w.sentTxHash || w.txHash}`}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-emerald); text-decoration: underline; font-size: 0.75rem; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 0.25rem; font-weight: 700;">
                        <span>Tx: ${(w.sentTxHash || w.txHash).slice(0, 6)}...</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                      </a>
                    ` : ''}
                    ${w.status === 'Completed' || w.status === 'completed' ? `
                      <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); font-size: 0.68rem; padding: 0.15rem 0.45rem; font-weight: 700;">
                        ✓ Delivered
                      </span>
                    ` : w.status === 'rejected' ? `
                      <span class="badge-tag" style="background: rgba(244, 63, 94, 0.15); color: var(--accent-ruby); border-color: rgba(244, 63, 94, 0.3); font-size: 0.68rem; padding: 0.15rem 0.45rem; font-weight: 700;">
                        ✕ Rejected (Refunded)
                      </span>
                    ` : `
                      <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3); font-size: 0.68rem; padding: 0.15rem 0.45rem; font-weight: 700;">
                        <span class="pulse-dot" style="width: 4px; height: 4px; background: var(--brand-yellow);"></span>
                        Pending Delivery
                      </span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

      </div>
    `;
  }

  async handleExecuteWithdrawal() {
    const user = db.currentUser;
    if (!user) {
      alert('Please sign in to withdraw $BOOBA tokens.');
      return;
    }

    const walletInput = document.getElementById('withdrawWalletInput');
    const amountInput = document.getElementById('withdrawAmountInput');
    const btn = document.getElementById('executeWithdrawBtn');

    const destinationWallet = walletInput ? walletInput.value.trim() : '';
    const amount = amountInput ? Number(amountInput.value) : 0;

    if (!destinationWallet || !destinationWallet.startsWith('0x') || destinationWallet.length < 35) {
      alert('Please enter or connect a valid BEP-20 (BNB Smart Chain) destination wallet.');
      if (walletInput) walletInput.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount of $BOOBA tokens to withdraw.');
      if (amountInput) amountInput.focus();
      return;
    }

    if (amount > Number(user.boobaPoints || 0)) {
      alert(`Insufficient balance. You currently have ${Number(user.boobaPoints || 0).toLocaleString()} $BOOBA available.`);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="pulse-dot" style="width: 8px; height: 8px; background: #000;"></span>
        <span>Submitting Withdrawal Request...</span>
      `;
    }

    try {
      const res = await db.processWithdrawal(amount, destinationWallet);
      if (res.success) {
        this.showWithdrawalSuccessModal(res.receipt);
        this.renderWithdrawalView(document.getElementById('app'));
        this.updateNavState();
      } else {
        alert(res.message || 'Withdrawal failed.');
      }
    } catch (err) {
      alert('Withdrawal error: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
          <span>Withdraw $BOOBA to Wallet</span>
        `;
      }
    }
  }

  showWithdrawalSuccessModal(receipt) {
    const existing = document.getElementById('withdrawalSuccessModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'withdrawalSuccessModal';
    modal.className = 'modal-backdrop open active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.88); backdrop-filter: blur(20px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    modal.innerHTML = `
      <div class="card" style="max-width: 500px; width: 100%; padding: 2.25rem 2rem; border-radius: 28px; border: 1.5px solid rgba(16, 185, 129, 0.5); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); text-align: center; box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 50px rgba(16, 185, 129, 0.25); animation: popInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <div style="width: 68px; height: 68px; border-radius: 20px; background: rgba(16, 185, 129, 0.15); border: 1.5px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--accent-emerald);">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>

        <div style="display: flex; justify-content: center; margin-bottom: 0.65rem;">
          <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-weight: 800; font-size: 0.75rem;">
            WITHDRAWAL LOGGED
          </span>
        </div>

        <h3 style="font-size: 1.45rem; font-weight: 900; color: #FFFFFF; margin-bottom: 0.5rem;">
          ${Number(receipt.amount).toLocaleString()} $BOOBA Queued!
        </h3>

        <p style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.5; margin-bottom: 1.5rem;">
          Your withdrawal request has been submitted. The admin team will verify and dispatch your $BOOBA tokens to your BEP-20 destination wallet on BNB Smart Chain.
        </p>

        <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 1rem; margin-bottom: 1.5rem; text-align: left; font-size: 0.8rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
            <span style="color: var(--text-secondary);">Destination Wallet:</span>
            <strong class="text-mono" style="color: var(--brand-yellow);">${receipt.walletAddress.slice(0, 6)}...${receipt.walletAddress.slice(-4)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
            <span style="color: var(--text-secondary);">Network:</span>
            <strong style="color: #FFFFFF;">BNB Smart Chain (BEP-20)</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Status:</span>
            <strong style="color: var(--brand-yellow);">${receipt.status === 'Completed' || receipt.status === 'completed' ? '🟢 Dispatched' : '🟡 Pending Token Dispatch'}</strong>
          </div>
        </div>

        <button type="button" class="btn btn-primary btn-block" onclick="document.getElementById('withdrawalSuccessModal').remove()" style="font-weight: 900;">
          Close & View Withdrawal History
        </button>

      </div>
    `;

    document.body.appendChild(modal);
  }

  // --------------------------------------------------------------------------
  // 2C. OFFICIAL PRESALE & LAUNCHPAD VIEW (presale.html)
  // --------------------------------------------------------------------------

  renderPresaleView(container) {
    const user = db.currentUser;
    const telemetry = db.getPresaleTelemetry();
    const isWalletConnected = Boolean(user && user.walletAddress && user.walletAddress.startsWith('0x') && user.walletAddress.length >= 35 && !user.walletAddress.includes('...'));
    const userPurchases = db.getUserPresalePurchases();

    const totalUserAllocated = userPurchases.filter(p => p.status !== 'rejected').reduce((acc, p) => acc + (Number(p.totalTokens) || 0), 0);
    const totalUserUsdt = userPurchases.filter(p => p.status !== 'rejected').reduce((acc, p) => acc + (Number(p.usdtAmount) || 0), 0);

    const defaultUsdt = this.selectedPresaleUsdt || 25;
    const launchWorthUsd = Math.round(defaultUsdt * 1.2 * 100) / 100; // Pre-Sale Benefit: +20% worth of $BOOBA at launch ($25 → $30)

    container.innerHTML = `
      <div class="container page-content" style="max-width: 1060px; margin: 0 auto; padding-top: 2rem; padding-bottom: 4rem;">
        
        <!-- Header & Back Navigation -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <a href="dashboard.html" class="back-dashboard-btn" style="padding: 0.4rem 0.85rem; font-size: 0.82rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Dashboard</span>
          </a>

          <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.addTokenToWallet()" style="font-size: 0.78rem; padding: 0.35rem 0.75rem; color: var(--brand-yellow); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px;">
            + Add $BOOBA to Wallet
          </button>
        </div>

        <!-- Clean Header Title & Stage Info -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 1.75rem auto;">
          <div style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.85rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 999px; margin-bottom: 1rem;">
            <span class="pulse-dot" style="width: 6px; height: 6px; background: var(--brand-yellow);"></span>
            <span style="font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.05em;">${telemetry.stageName || 'Stage 1 Live'}</span>
          </div>

          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.02em; margin: 0 0 0.6rem 0; line-height: 1.15;">
            $BOOBA Token Presale
          </h1>
          <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 0 auto; line-height: 1.6; max-width: 580px;">
            Send BEP-20 USDT to the official presale treasury wallet, submit your payment proof, and receive your $BOOBA tokens directly to your wallet.
          </p>
        </div>

        <!-- PRE-SALE BENEFIT BANNER -->
        <div style="max-width: 660px; margin: 0 auto 2.25rem auto; display: flex; align-items: center; gap: 1.1rem; background: rgba(243, 186, 47, 0.05); border: 1px solid rgba(243, 186, 47, 0.35); border-radius: 18px; padding: 1.15rem 1.4rem;">
          <span style="font-size: 2.2rem; line-height: 1; flex-shrink: 0;">🎁</span>
          <div style="font-size: 0.95rem; line-height: 1.55;">
            <div style="font-size: 1.05rem; font-weight: 900; color: var(--brand-yellow); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.2rem;">
              Pre-Sale Benefit
            </div>
            <div style="color: #E7EAF0; font-weight: 600;">
              For every $25 you send,<br>
              you will receive <strong style="color: #FFFFFF; font-weight: 900;">$30</strong> worth of $BOOBA tokens <span style="color: var(--accent-emerald); font-weight: 800;">at launch.</span>
            </div>
          </div>
        </div>

        <!-- 2-COLUMN LEFT & RIGHT GRID (LIKE SETTINGS PAGE) -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 2.5rem; align-items: start;">
          
          <!-- LEFT BOX: OFFICIAL TREASURY WALLET & INFO -->
          <div class="card" style="padding: clamp(1.5rem, 3.5vw, 2.25rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px);">
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(243,186,47,0.12); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow); font-weight: 900; font-size: 0.85rem;">
                1
              </div>
              <div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin: 0;">Deposit USDT to Presale</h3>
                <div style="font-size: 0.72rem; color: var(--text-secondary);">Official BNB Smart Chain (BEP-20) Destination</div>
              </div>
            </div>

            <!-- Treasury Deposit Box -->
            <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem; margin-bottom: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.35rem;">
                <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">
                  Treasury Deposit Address
                </div>
                <button type="button" title="Copy address" aria-label="Copy treasury address" onclick="window.boobaApp.copyPresaleAddress('${telemetry.treasuryAddress}')" style="width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.14); color: #FFFFFF; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: var(--transition);">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
              <div id="presaleTreasuryAddressDisplay" class="text-mono" style="font-size: 0.88rem; font-weight: 800; color: var(--brand-yellow); word-break: break-all; margin-bottom: 0.85rem; line-height: 1.4;">
                ${telemetry.treasuryAddress}
              </div>
              <button type="button" id="copyPresaleTreasuryBtn" class="btn btn-primary btn-block btn-sm" onclick="window.boobaApp.copyPresaleAddress('${telemetry.treasuryAddress}')" style="font-size: 0.82rem; font-weight: 800; padding: 0.55rem 1rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; border-radius: 10px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy Treasury Address</span>
              </button>
            </div>

            <!-- Guidelines & Rate -->
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 14px; padding: 1rem; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span>Exchange Rate</span>
                <span style="color: #FFFFFF; font-weight: 800;">1 USDT = ${telemetry.baseRate} $BOOBA</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span>Accepted Token</span>
                <span style="color: #FFFFFF; font-weight: 700;">USDT (BEP-20)</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Delivery</span>
                <span style="color: var(--accent-emerald); font-weight: 700;">Direct to Sender Wallet</span>
              </div>
            </div>

            <!-- IMPORTANT: DEX/WALLET-ONLY WARNING -->
            <div style="margin-top: 1.1rem; background: rgba(239, 68, 68, 0.07); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 14px; padding: 1rem 1.1rem; display: flex; gap: 0.85rem; align-items: flex-start;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 0.2rem;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <div style="font-size: 0.8rem; line-height: 1.55;">
                <div style="font-weight: 900; color: #EF4444; margin-bottom: 0.25rem;">
                  IMPORTANT - SEND FROM DEX/WALLET ONLY!
                </div>
                <div style="color: #FCA5A5;">
                  Please send USDT directly from your DEX/Web3 wallet.<br>
                  Do NOT send from a centralized exchange (Binance, Bybit, OKX, etc.).<br>
                  Tokens are delivered automatically to the wallet that sends the USDT.<br>
                  If you send from a centralized exchange, your $BOOBA tokens may not be received in your personal wallet and may be lost.
                </div>
              </div>
            </div>

          </div>

          <!-- RIGHT BOX: PRESALE PAYMENT PROOF FORM -->
          <div class="card" style="padding: clamp(1.5rem, 3.5vw, 2.25rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px);">
            
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(243, 186, 47, 0.12); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow); font-weight: 900; font-size: 0.85rem;">
                2
              </div>
              <div>
                <h3 style="font-size: 1.1rem; font-weight: 800; color: #FFFFFF; margin: 0;">Payment Proof Submission</h3>
                <div style="font-size: 0.72rem; color: var(--text-secondary);">Submit transfer receipt to receive your $BOOBA</div>
              </div>
            </div>

            <form id="presalePaymentForm" onsubmit="window.boobaApp.handlePresalePaymentSubmit(event)">
              
              <!-- 1. Your Wallet Address -->
              <div class="form-field" style="margin-bottom: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem;">
                  <label class="form-label" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin: 0;">
                    Your BSC/Web3 Wallet Address (BEP-20) <span style="color: var(--accent-ruby);">*</span>
                  </label>
                  ${isWalletConnected ? `
                    <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('presaleWalletInput').value='${user.walletAddress}'" style="font-size: 0.72rem; padding: 0.15rem 0.45rem; color: var(--accent-emerald);">
                      Use Connected
                    </button>
                  ` : ''}
                </div>
                <input type="text" id="presaleWalletInput" class="form-input text-mono" placeholder="0x...  Wallet that will receive $BOOBA tokens" value="${user?.walletAddress || ''}" required style="border-radius: 12px; height: 46px; font-size: 0.84rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.3rem;">
                  Your $BOOBA tokens will be delivered to this exact same wallet.
                </div>
              </div>

              <!-- 2. Amount Sent (USDT) + Live Calculator -->
              <div class="form-field" style="margin-bottom: 1.25rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.4rem;">
                  <label class="form-label" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin: 0;">
                    Amount Sent (USDT) <span style="color: var(--accent-ruby);">*</span>
                  </label>
                  <span>Min: $${telemetry.minBuyUsdt} • Max: $${telemetry.maxBuyUsdt.toLocaleString()} (per wallet)</span>
                </div>

                <div style="position: relative;">
                  <input type="number" id="presaleUsdtInput" class="form-input text-mono" placeholder="25" min="${telemetry.minBuyUsdt}" max="${telemetry.maxBuyUsdt}" value="${defaultUsdt}" oninput="window.boobaApp.updatePresaleCalculation(this.value)" required style="padding-left: 2.75rem; font-size: 1.25rem; font-weight: 900; background: rgba(0,0,0,0.5); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; height: 50px;">
                  <div style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); font-weight: 900; color: #26A17B; font-size: 1.1rem;">
                    ₮
                  </div>
                </div>

                <!-- Quick Presets -->
                <div style="display: flex; gap: 0.35rem; margin-top: 0.55rem; flex-wrap: wrap;">
                  <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.setPresalePreset(25)" style="flex: 0 0 auto; min-width: 60px; font-size: 0.78rem; font-weight: 800; color: var(--brand-yellow); background: rgba(243, 186, 47, 0.1); border: 1px solid rgba(243, 186, 47, 0.35); border-radius: 999px; padding: 0.3rem 1rem;">$25</button>
                </div>

                <!-- Live Receive Preview Box -->
                <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 0.85rem 1rem; margin-top: 0.75rem;">
                  <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 0.25rem;">You Will Receive at Launch</div>
                  <div style="display: flex; align-items: baseline; gap: 0.4rem;">
                    <span id="presaleReceiveUsdDisplay" style="font-size: 1.65rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono); line-height: 1;">$${launchWorthUsd}</span>
                    <span style="font-size: 0.9rem; font-weight: 800; color: #FFFFFF;">worth of $BOOBA tokens</span>
                  </div>
                </div>
              </div>

              <!-- 2.5 Transaction Hash (TXID) -->
              <div class="form-field" style="margin-bottom: 1.25rem;">
                <label class="form-label" for="presaleTxHashInput" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.4rem; display: block;">
                  Transaction Hash (TXID) <span style="color: var(--accent-ruby);">*</span>
                </label>
                <input type="text" id="presaleTxHashInput" class="form-input text-mono" placeholder="0x...  Enter your BSC transaction hash" required style="border-radius: 12px; height: 46px; font-size: 0.84rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.3rem;">
                  Paste the transaction hash from your USDT transfer.
                </div>
              </div>

              <!-- 3. Screenshot of Payment Proof Upload -->
              <div class="form-field" style="margin-bottom: 1.5rem;">
                <label class="form-label" style="font-size: 0.82rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.4rem; display: block;">
                  Screenshot of Payment Proof <span style="color: var(--accent-ruby);">*</span>
                </label>

                <div id="presaleScreenshotUploadArea" style="border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: 14px; padding: 1.25rem 1rem; text-align: center; background: rgba(0,0,0,0.3); cursor: pointer; transition: var(--transition);" onclick="document.getElementById('presaleScreenshotFileInput').click()">
                  <input type="file" id="presaleScreenshotFileInput" accept="image/*" style="display: none;" onchange="window.boobaApp.handlePresaleScreenshotUpload(event)">
                  
                  <div id="presaleScreenshotPlaceholder">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; margin: 0 auto 0.5rem auto; color: var(--text-secondary);">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    </div>
                    <div style="font-size: 0.82rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.2rem;">
                      Click or Drag to Upload Screenshot
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">
                      Trust Wallet / Binance / Exchange transfer receipt
                    </div>
                  </div>

                  <!-- Active Image Preview Container -->
                  <div id="presaleScreenshotPreviewContainer" style="display: none; position: relative;">
                    <img id="presaleScreenshotPreviewImg" src="" alt="Payment Proof Preview" style="max-height: 180px; max-width: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 20px rgba(0,0,0,0.6); object-fit: contain; margin: 0 auto 0.6rem auto; display: block;">
                    <div style="display: flex; justify-content: center; gap: 0.5rem;">
                      <button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.boobaApp.removePresaleScreenshot()" style="color: var(--accent-ruby); font-size: 0.72rem; background: rgba(244,63,94,0.1); border-radius: 6px; padding: 0.2rem 0.6rem;">
                        Remove / Replace Screenshot
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Submit Button -->
              <button type="submit" id="presaleSubmitActionBtn" class="btn btn-primary btn-lg btn-block" style="height: 50px; font-size: 1rem; font-weight: 900; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 12px; background: linear-gradient(135deg, #F3BA2F 0%, #E2A016 100%); color: #000; box-shadow: 0 4px 20px rgba(243, 186, 47, 0.3);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Submit Payment Proof</span>
              </button>

            </form>

          </div>

        </div>

        <!-- RECENT USER PRESALE SUBMISSIONS & ORDER STATUS -->
        ${userPurchases.length > 0 ? `
          <div class="card" style="padding: clamp(1.25rem, 3vw, 1.75rem); border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(20px); margin-bottom: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <h4 style="font-size: 1rem; font-weight: 800; color: #FFFFFF; margin: 0;">Your Presale Orders & Delivery Status</h4>
              <span class="badge-tag" style="background: rgba(255, 255, 255, 0.06); color: var(--text-secondary); font-size: 0.72rem;">
                ${userPurchases.length} ${userPurchases.length === 1 ? 'Order' : 'Orders'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${userPurchases.map(p => `
                <div style="padding: 0.95rem 1.15rem; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                      <div style="font-weight: 900; color: var(--brand-yellow); font-size: 1.05rem; font-family: var(--font-mono);">
                        ${Number(p.totalTokens).toLocaleString()} $BOOBA
                      </div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);">
                        ${new Date(p.timestamp).toLocaleDateString()} • Paid $${Number(p.usdtAmount).toLocaleString()} USDT
                      </div>
                    </div>

                    <div>
                      ${p.status === 'completed' ? `
                        <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3); font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          Tokens Dispatched
                        </span>
                      ` : p.status === 'rejected' ? `
                        <span class="badge-tag" style="background: rgba(244, 63, 94, 0.15); color: var(--accent-ruby); border-color: rgba(244, 63, 94, 0.3); font-weight: 800; font-size: 0.72rem;">
                          Order Rejected
                        </span>
                      ` : `
                        <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3); font-weight: 800; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                          <span class="pulse-dot" style="width: 5px; height: 5px; background: var(--brand-yellow);"></span>
                          Pending Admin Delivery
                        </span>
                      `}
                    </div>
                  </div>

                  <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.2rem;">Your BEP-20 Wallet Address:</div>
                    <div class="text-mono" style="color: var(--brand-yellow); font-size: 0.78rem; word-break: break-all; font-weight: 700;">
                      ${p.receivingWallet || p.walletAddress || p.senderWallet || 'Registered Wallet'}
                    </div>
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                      ${p.proofScreenshot ? `
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openImageLightbox('${p.proofScreenshot}')" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; color: var(--text-secondary); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">
                          📷 Payment Receipt
                        </button>
                      ` : '<span style="color: var(--text-muted);">No receipt attached</span>'}
                      
                      ${p.deliveryProofScreenshot ? `
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openImageLightbox('${p.deliveryProofScreenshot}')" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; color: var(--accent-emerald); background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-weight: 700;">
                          ✓ Admin Delivery Proof
                        </button>
                      ` : ''}
                    </div>

                    <div>
                      ${p.sentTxHash ? `
                        <a href="https://bscscan.com/tx/${p.sentTxHash}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-emerald); font-weight: 700; text-decoration: underline;">
                          Tx: ${p.sentTxHash.slice(0, 6)}...${p.sentTxHash.slice(-4)} ↗
                        </a>
                      ` : ''}
                    </div>
                  </div>

                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 2D. PRESALE INTERACTION CONTROLLERS & FORM HANDLERS
  // --------------------------------------------------------------------------

  copyPresaleAddress(address) {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      const btn = document.getElementById('copyPresaleTreasuryBtn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `<span>✓ Copied!</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
      alert('Official Presale Treasury Address copied to clipboard!\n' + address);
    }).catch(() => {
      alert('Presale Address: ' + address);
    });
  }

  copySenderToReceiver() {
    const sender = document.getElementById('presaleSenderWalletInput')?.value || '';
    const receiverInput = document.getElementById('presaleReceivingWalletInput');
    if (receiverInput && sender) {
      receiverInput.value = sender;
    }
  }

  setPresalePreset(amount) {
    this.selectedPresaleUsdt = amount;
    const input = document.getElementById('presaleUsdtInput');
    if (input) {
      input.value = amount;
      this.updatePresaleCalculation(amount);
    }
  }

  updatePresaleCalculation(usdtAmount) {
    const val = Number(usdtAmount) || 0;
    this.selectedPresaleUsdt = val;

    // Pre-Sale Benefit: for every $25 sent, receive $30 worth of $BOOBA at launch (+20%)
    const launchWorthUsd = Math.round(val * 1.2 * 100) / 100;
    const receiveUsdEl = document.getElementById('presaleReceiveUsdDisplay');
    if (receiveUsdEl) receiveUsdEl.textContent = `$${launchWorthUsd.toLocaleString()}`;
  }

  handlePresaleScreenshotUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (.png, .jpg, .jpeg, .webp).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit. Please upload a smaller screenshot.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.presaleScreenshotBase64 = e.target.result;

      const placeholder = document.getElementById('presaleScreenshotPlaceholder');
      const previewContainer = document.getElementById('presaleScreenshotPreviewContainer');
      const previewImg = document.getElementById('presaleScreenshotPreviewImg');

      if (placeholder) placeholder.style.display = 'none';
      if (previewContainer) previewContainer.style.display = 'block';
      if (previewImg) previewImg.src = this.presaleScreenshotBase64;
    };
    reader.readAsDataURL(file);
  }

  removePresaleScreenshot() {
    this.presaleScreenshotBase64 = null;
    const fileInput = document.getElementById('presaleScreenshotFileInput');
    if (fileInput) fileInput.value = '';

    const placeholder = document.getElementById('presaleScreenshotPlaceholder');
    const previewContainer = document.getElementById('presaleScreenshotPreviewContainer');
    const previewImg = document.getElementById('presaleScreenshotPreviewImg');

    if (placeholder) placeholder.style.display = 'block';
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';
  }

  async handlePresalePaymentSubmit(e) {
    if (e) e.preventDefault();

    const walletAddress = document.getElementById('presaleWalletInput')?.value?.trim() || document.getElementById('presaleSenderWalletInput')?.value?.trim();
    const usdtAmount = Number(document.getElementById('presaleUsdtInput')?.value);
    const txHash = document.getElementById('presaleTxHashInput')?.value?.trim() || '';
    const btn = document.getElementById('presaleSubmitActionBtn');

    if (!walletAddress || walletAddress.length < 15 || !walletAddress.startsWith('0x')) {
      alert('Please enter a valid BEP-20 wallet address (starts with 0x).');
      return;
    }

    if (isNaN(usdtAmount) || usdtAmount < PRESALE_CONFIG.minBuyUsdt) {
      alert(`Minimum presale contribution is ${PRESALE_CONFIG.minBuyUsdt} USDT.`);
      return;
    }

    if (usdtAmount > PRESALE_CONFIG.maxBuyUsdt) {
      alert(`Maximum presale contribution is ${PRESALE_CONFIG.maxBuyUsdt} USDT per wallet.`);
      return;
    }

    if (!txHash || txHash.length < 10 || !txHash.startsWith('0x')) {
      alert('Please enter the transaction hash (TXID) from your USDT transfer.');
      return;
    }

    if (!this.presaleScreenshotBase64) {
      alert('Please upload a screenshot of your payment receipt as proof of transfer.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="pulse-dot" style="width: 8px; height: 8px; background: #000;"></span>
        <span>Submitting Payment Proof...</span>
      `;
    }

    try {
      const res = await db.submitPresalePaymentForm({
        senderWallet: walletAddress,
        receivingWallet: walletAddress,
        usdtAmount,
        proofScreenshot: this.presaleScreenshotBase64,
        txHash
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Submit Payment Proof</span>
        `;
      }

      if (res.success) {
        this.presaleScreenshotBase64 = null;
        this.showPresaleSuccessModal(res.order);
        this.renderPresaleView(document.getElementById('app'));
        this.updateNavState();
      } else {
        alert(res.message || 'Payment submission failed.');
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Submit Presale Payment Proof</span>`;
      }
      alert('Submission error: ' + err.message);
    }
  }

  showPresaleSuccessModal(order) {
    const existing = document.getElementById('presaleSuccessModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'presaleSuccessModal';
    modal.className = 'modal-backdrop open active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.88); backdrop-filter: blur(20px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    modal.innerHTML = `
      <div class="card" style="max-width: 520px; width: 100%; padding: 2.5rem 2rem; border-radius: 28px; border: 1.5px solid rgba(243, 186, 47, 0.5); background: linear-gradient(180deg, rgba(20, 26, 38, 0.98) 0%, rgba(10, 13, 20, 0.99) 100%); text-align: center; box-shadow: 0 25px 70px rgba(0,0,0,0.9), 0 0 50px rgba(243, 186, 47, 0.3); animation: popInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <div style="width: 70px; height: 70px; border-radius: 22px; background: rgba(243, 186, 47, 0.15); border: 1.5px solid rgba(243, 186, 47, 0.4); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto; color: var(--brand-yellow);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </div>

        <div style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.65rem;">
          <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-weight: 800; font-size: 0.75rem;">
            PAYMENT SUBMITTED TO ADMIN
          </span>
        </div>

        <h3 style="font-size: 1.5rem; font-weight: 900; color: #FFFFFF; margin-bottom: 0.6rem;">
          ${Number(order.totalTokens).toLocaleString()} $BOOBA Order Logged!
        </h3>

        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem;">
          Your payment proof for <strong>$${Number(order.usdtAmount).toLocaleString()} USDT</strong> has been submitted. The admin will verify your screenshot and dispatch your tokens to your DEX wallet.
        </p>

        <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.15rem; margin-bottom: 1.75rem; text-align: left; font-size: 0.82rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary);">Receiving DEX Wallet:</span>
            <strong class="text-mono" style="color: var(--brand-yellow);">${order.receivingWallet.slice(0, 6)}...${order.receivingWallet.slice(-4)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary);">Sender Wallet:</span>
            <strong class="text-mono" style="color: #FFFFFF;">${order.senderWallet.slice(0, 6)}...${order.senderWallet.slice(-4)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary);">Status:</span>
            <strong style="color: var(--brand-yellow);">🟡 Pending Token Distribution</strong>
          </div>
          ${order.proofScreenshot ? `
            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.boobaApp.openImageLightbox('${order.proofScreenshot}')" style="font-size: 0.74rem; color: var(--brand-yellow);">
                📷 View Uploaded Screenshot Proof
              </button>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 0.75rem; flex-direction: column;">
          <button type="button" class="btn btn-primary btn-block" onclick="document.getElementById('presaleSuccessModal').remove()" style="font-weight: 900;">
            Close & View Order Status
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  }

  openImageLightbox(imageUrl) {
    const existing = document.getElementById('imageLightboxModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'imageLightboxModal';
    modal.className = 'modal-backdrop open active';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(20px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 1rem; cursor: pointer;';
    modal.onclick = () => modal.remove();

    modal.innerHTML = `
      <div style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center;" onclick="event.stopPropagation()">
        <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('imageLightboxModal').remove()" style="position: absolute; top: -45px; right: 0; color: #FFFFFF; font-size: 1.1rem; background: rgba(255,255,255,0.1); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          ✕
        </button>
        <img src="${imageUrl}" alt="Payment Proof Fullscreen" style="max-width: 100%; max-height: 80vh; border-radius: 16px; border: 2px solid var(--brand-yellow); box-shadow: 0 0 50px rgba(0,0,0,0.9); object-fit: contain;">
        <div style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.85rem;">
          Payment Proof Receipt Preview
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async addTokenToWallet() {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const wasAdded = await window.ethereum.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: {
              address: '0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B',
              symbol: 'BOOBA',
              decimals: 18,
              image: window.location.origin + '/assets/mascot.jpg'
            }
          }
        });
        if (wasAdded) {
          alert('$BOOBA token successfully imported into your Web3 wallet!');
        }
      } catch (err) {
        navigator.clipboard.writeText('0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B');
        alert('Contract Address 0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B copied to clipboard! Paste into your wallet token import dialog.');
      }
    } else {
      navigator.clipboard.writeText('0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B');
      alert('Contract Address 0x005f17db06AF1Dc815C84Ec656d6ed120e48B21B copied to clipboard! Paste into MetaMask or Trust Wallet.');
    }
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
    const levelInfo = calculateLevel(user.boobaPoints);
    const currentAvatar = user.avatar || 'assets/mascot.jpg';

    container.innerHTML = `
      <div class="container page-content" style="max-width: 1060px;">
        
        <!-- SETTINGS PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Account & Security</span>
          </h1>
        </div>

        <!-- 2 CLEAN SETTINGS CARDS -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
          
          <!-- CARD 1: PROFILE & WALLET -->
          <div class="card" style="padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 255, 255, 0.1);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="width: 38px; height: 38px; border-radius: 10px; background: ${levelInfo.glowColor}; display: flex; align-items: center; justify-content: center; color: ${levelInfo.accentColor}; border: 1px solid ${levelInfo.borderColor};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #FFFFFF; margin: 0;">Profile & Wallet</h3>
                <div style="font-size: 0.75rem; color: ${levelInfo.accentColor}; font-weight: 700;">Lv.${levelInfo.level} ${levelInfo.title} • ${levelInfo.material}</div>
              </div>
            </div>

            <form id="settingsProfileForm" onsubmit="window.boobaApp.handleSaveProfileSettings(event)">
              
              <!-- Avatar Preview & Selection -->
              <div style="margin-bottom: 1.25rem; display: flex; align-items: center; gap: 1.25rem;">
                <img id="settingsAvatarPreview" src="${currentAvatar}" style="width: 56px; height: 56px; border-radius: 16px; border: 2px solid ${levelInfo.accentColor}; object-fit: cover; box-shadow: 0 0 15px ${levelInfo.glowColor};">
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

  togglePassportCardFlip(levelOrId) {
    const cardWrapper = document.getElementById(`cardWrapper-${levelOrId}`) || document.getElementById(levelOrId);
    if (cardWrapper) {
      cardWrapper.classList.toggle('is-flipped');
    }
  }

  scrollToPassportLevel(level) {
    const section = document.getElementById(`passportSection-${level}`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.passport-tier-pill').forEach(p => p.classList.remove('active'));
      const activePill = document.getElementById(`tierPill-${level}`);
      if (activePill) {
        activePill.classList.add('active');
        activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  selectPassportTier(level) {
    this.scrollToPassportLevel(level);
  }

  scrollPassportCarousel(direction) {
    // Legacy helper - redirects to next/prev section
    const currentActive = document.querySelector('.passport-tier-pill.active');
    let currentLvl = 1;
    if (currentActive && currentActive.id) {
      currentLvl = Number(currentActive.id.replace('tierPill-', '')) || 1;
    }
    let target = currentLvl + direction;
    if (target < 1) target = 1;
    if (target > 10) target = 10;
    this.scrollToPassportLevel(target);
  }

  attachPassportCarouselListeners(defaultLevel) {
    // Initialize active state observer for vertical scrolling
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const level = entry.target.getAttribute('data-level');
            if (level) {
              document.querySelectorAll('.passport-tier-pill').forEach(p => p.classList.remove('active'));
              const activePill = document.getElementById(`tierPill-${level}`);
              if (activePill) {
                activePill.classList.add('active');
                activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }
            }
          }
        });
      }, { rootMargin: '-20% 0px -60% 0px', threshold: 0.1 });

      document.querySelectorAll('.passport-level-section').forEach(sec => observer.observe(sec));
    }
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
    const userLevel = user ? calculateLevel(user.boobaPoints) : { level: 1, title: 'Booba Builder' };

    const communityCount = quests.filter(q => normalizeCategory(q.category) === 'community').length;
    const engagementCount = quests.filter(q => normalizeCategory(q.category) === 'engagement').length;
    const contentCount = quests.filter(q => normalizeCategory(q.category) === 'content').length;

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- Top Action & Navigation Row -->
        <div style="margin-bottom: 2.25rem;">
          <a href="dashboard.html" class="back-dashboard-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Dashboard</span>
          </a>
        </div>

        <!-- QUESTS PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Ecosystem Bounties</span>
          </h1>
        </div>

        <!-- 4-METRIC EXECUTIVE HUD BENTO -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1.25rem; margin-bottom: 3.5rem;">
          
          <div class="card card-hover" style="padding: 1.75rem 1.5rem; border-radius: 22px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(243, 186, 47, 0.35); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(243, 186, 47, 0.1);">
            <div style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; font-family: var(--font-mono); margin-bottom: 0.4rem;">Total Bounty Pool</div>
            <div style="font-size: 1.85rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono);">+${totalBountyPool.toLocaleString()} <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 700;">$BOOBA</span></div>
            <div style="font-size: 0.78rem; color: var(--accent-emerald); font-weight: 700; margin-top: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
              <span class="pulse-dot" style="width: 5px; height: 5px;"></span> Live Community Yield
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem 1.5rem; border-radius: 22px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(6, 182, 212, 0.3); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
            <div style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; font-family: var(--font-mono); margin-bottom: 0.4rem;">Active Missions</div>
            <div style="font-size: 1.85rem; font-weight: 900; color: #FFFFFF; font-family: var(--font-mono);">${quests.length} <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 700;">Tracks</span></div>
            <div style="font-size: 0.78rem; color: var(--accent-cyan); font-weight: 700; margin-top: 0.35rem;">
              Updated Continuously
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem 1.5rem; border-radius: 22px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(139, 92, 246, 0.3); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
            <div style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; font-family: var(--font-mono); margin-bottom: 0.4rem;">Your Earned Balance</div>
            <div style="font-size: 1.85rem; font-weight: 900; color: var(--brand-yellow); font-family: var(--font-mono);">${user ? Number(user.boobaPoints).toLocaleString() : '0'} <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 700;">$BOOBA</span></div>
            <div style="font-size: 0.78rem; color: var(--accent-purple); font-weight: 700; margin-top: 0.35rem;">
              ${user ? `${user.completedQuestsCount || 0} missions completed` : 'Sign in to claim'}
            </div>
          </div>

          <div class="card card-hover" style="padding: 1.75rem 1.5rem; border-radius: 22px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid rgba(255, 122, 0, 0.35); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
            <div style="font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; font-family: var(--font-mono); margin-bottom: 0.4rem;">Daily Check-In Streak</div>
            <div style="font-size: 1.85rem; font-weight: 900; color: var(--accent-orange); font-family: var(--font-mono); display: flex; align-items: center; gap: 0.4rem;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
              <span>${user ? user.streakDays || 1 : 1} Days</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--accent-orange); font-weight: 700; margin-top: 0.35rem;">
              ${user && (user.streakDays || 1) >= 100 ? 'Apex NFT Conquered' : `${100 - (user ? user.streakDays || 1 : 1)}d to Day 100 1/1 NFT`}
            </div>
          </div>

        </div>

        <!-- 1. LIVE BOUNTY QUESTS SECTION -->
        <div style="margin-bottom: 4.5rem;">
          
          <div class="quest-top-bar" style="margin-bottom: 3rem;">
            <!-- Header on Top Above Line -->
            <div style="margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
              <h2 class="section-title pipeline-main-heading" style="text-align: center; margin: 0; white-space: nowrap;">
                Available <span class="text-gradient-gold">Mission Tracks</span>
              </h2>
            </div>

            <!-- Centered Sector Switcher Tabs Below the Line -->
            <div style="display: flex; justify-content: center; align-items: center; width: 100%; overflow: hidden;">
              <div class="unboxed-chart-switcher quest-track-switcher" style="gap: 1.75rem; flex-wrap: wrap; justify-content: center;">
                <button type="button" class="chart-tab-link ${this.activeQuestFilter === 'all' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('all')">
                  All Tracks (${quests.length})
                </button>
                <button type="button" class="chart-tab-link ${this.activeQuestFilter === 'daily' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('daily')">
                  Daily Check-In (100D)
                </button>
                <button type="button" class="chart-tab-link ${this.activeQuestFilter === 'community' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('community')">
                  Community (${communityCount})
                </button>
                <button type="button" class="chart-tab-link ${this.activeQuestFilter === 'engagement' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('engagement')">
                  Engagement (${engagementCount})
                </button>
                <button type="button" class="chart-tab-link ${this.activeQuestFilter === 'content' ? 'active' : ''}" onclick="window.boobaApp.setQuestFilter('content')">
                  Content (${contentCount})
                </button>
              </div>
            </div>
          </div>

          <!-- 10-EPOCH 100-DAY EXPEDITION TRAJECTORY MAP -->
          ${this.activeQuestFilter === 'daily' ? `
            <div class="daily-expedition-map-container" style="margin-bottom: 4.5rem; position: relative;">
              
              <!-- Map Ambient Grid & Radial Glow -->
              <div class="map-ambient-grid" style="border-radius: 30px;"></div>
              <div class="map-ambient-radial"></div>

              <!-- Cyber Expedition HUD Header -->
              <div class="map-hud-bar" style="margin-bottom: 3.5rem;">
                <div class="map-hud-item">
                  <span class="pulse-dot"></span>
                  <span>100-DAY EXPEDITION ROUTE</span>
                </div>
                <div class="map-hud-item">
                  <span>ACTIVE STREAK:</span>
                  <span class="map-hud-highlight">${user ? user.streakDays || 1 : 1} / 100 DAYS</span>
                </div>
                <div class="map-hud-item">
                  <span>APEX HORIZON:</span>
                  <span style="color: var(--brand-yellow); font-weight: 800;">DAY 100 GENESIS 1/1 NFT</span>
                </div>
              </div>

              <!-- Trajectory Spine & Waypoint Rows -->
              <div class="map-trajectory-container">
                <!-- Vertical Curving Spine -->
                <div class="map-trajectory-spine"></div>

                ${(() => {
                  const allRewards = this.get100DaysRewardData();
                  const currentStreak = user ? Number(user.streakDays || 1) : 1;

                  const epochs = [
                    { index: 0, num: '01', title: 'Rookie Expedition', startDay: 1, endDay: 10, perk: '+1,400 BOOBA + 1.2x Boost', desc: 'Base Camp Genesis initialization. Establish your daily check-in cadence.' },
                    { index: 1, num: '02', title: 'Novice Challenger', startDay: 11, endDay: 20, perk: '+3,200 BOOBA + Alpha Pass', desc: 'Ascending through low-gravity foothills with compounding point velocity.' },
                    { index: 2, num: '03', title: 'Alpha Scout', startDay: 21, endDay: 30, perk: '+5,400 BOOBA + OG Discord Role', desc: 'Traversing the Lunar Plateau with unlocked citizen community privileges.' },
                    { index: 3, num: '04', title: 'Ecosystem Warrior', startDay: 31, endDay: 40, perk: '+7,600 BOOBA + VIP AMA Pass', desc: 'Frontier mission tracks with priority allocation in special community events.' },
                    { index: 4, num: '05', title: 'Gold Grinder', startDay: 41, endDay: 50, perk: '+10,500 BOOBA + 1.5x Boost', desc: 'Halfway summit milestone. Dynamic 1.5x APY multiplier unlocked on-chain.' },
                    { index: 5, num: '06', title: 'Syndicate Elite', startDay: 51, endDay: 60, perk: '+13,200 BOOBA + Core Alpha Briefings', desc: 'High-altitude stratosphere navigation with exclusive governance briefs.' },
                    { index: 6, num: '07', title: 'Mainnet Vanguard', startDay: 61, endDay: 70, perk: '+16,400 BOOBA + Airdrop Priority', desc: 'Elite mainnet trajectory with tier-1 snapshot weighting on future drops.' },
                    { index: 7, num: '08', title: 'Treasury Ambassador', startDay: 71, endDay: 80, perk: '+20,500 BOOBA + Ambassador Crest', desc: 'Sovereign tier privileges and official on-chain badge recognition.' },
                    { index: 8, num: '09', title: 'Senator Champion', startDay: 81, endDay: 90, perk: '+26,000 BOOBA + Governance Weight', desc: 'The Orbital Ridge. High-conviction governance proposal creation status.' },
                    { index: 9, num: '10', title: 'Genesis NFT Realm', startDay: 91, endDay: 100, perk: 'GENESIS 1/1 NFT + 50,000 BOOBA', desc: 'The Ultimate Summit. Permanent 2.5x multiplier and 1/1 BEP-721 non-fungible trophy.' }
                  ];

                  return epochs.map((ep, eIdx) => {
                    const epochRewards = allRewards.filter(r => r.day >= ep.startDay && r.day <= ep.endDay);
                    const isEpochActive = currentStreak >= ep.startDay && currentStreak <= ep.endDay;
                    const isEpochCompleted = currentStreak > ep.endDay;
                    const daysClaimed = Math.max(0, Math.min(10, currentStreak - ep.startDay));

                    let beaconClass = 'upcoming';
                    if (isEpochCompleted) beaconClass = 'achieved';
                    else if (isEpochActive) beaconClass = 'active-expedition';
                    else if (ep.index === 9) beaconClass = 'summit';
                    else if (ep.index >= 7) beaconClass = 'target';

                    const isEven = eIdx % 2 === 1;

                    return `
                      <div class="map-waypoint-row ${isEven ? 'even' : ''}" id="waypointRow_${ep.index}">
                        
                        <!-- Waypoint Card Column -->
                        <div class="map-waypoint-card-col">
                          <div class="card card-hover" style="padding: 2rem; border-radius: 26px; background: rgba(14, 18, 27, 0.9); border: 1.5px solid ${isEpochActive ? 'var(--brand-yellow)' : isEpochCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)'}; box-shadow: ${isEpochActive ? '0 10px 40px rgba(243, 186, 47, 0.25)' : '0 10px 30px rgba(0,0,0,0.5)'}; position: relative; overflow: hidden;">
                            
                            <!-- Header Row -->
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                              <div style="font-size: 0.75rem; font-weight: 800; font-family: var(--font-mono); color: ${isEpochCompleted ? 'var(--accent-emerald)' : isEpochActive ? 'var(--brand-yellow)' : 'var(--text-muted)'}; text-transform: uppercase; letter-spacing: 0.06em;">
                                EPOCH ${ep.num} • DAYS ${ep.startDay}–${ep.endDay}
                              </div>
                              <span class="badge-tag epoch-status-badge" style="font-size: 0.7rem; padding: 0.2rem 0.65rem; background: ${isEpochCompleted ? 'rgba(16, 185, 129, 0.15)' : isEpochActive ? 'rgba(243, 186, 47, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; color: ${isEpochCompleted ? 'var(--accent-emerald)' : isEpochActive ? 'var(--brand-yellow)' : 'var(--text-muted)'}; border-color: ${isEpochCompleted ? 'rgba(16, 185, 129, 0.3)' : isEpochActive ? 'rgba(243, 186, 47, 0.4)' : 'rgba(255, 255, 255, 0.1)'};">
                                ${isEpochCompleted ? `
                                  <span class="epoch-status-desktop">✓ Conquered</span>
                                  <span class="epoch-status-mobile">✓</span>
                                ` : isEpochActive ? `
                                  <span class="epoch-status-desktop">● Active Expedition</span>
                                  <span class="epoch-status-mobile" style="display: none; align-items: center; justify-content: center;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                  </span>
                                ` : `
                                  <span class="epoch-status-desktop">🔒 Locked</span>
                                  <span class="epoch-status-mobile">🔒</span>
                                `}
                              </span>
                            </div>

                            <h3 style="font-size: 1.4rem; font-weight: 900; color: #FFFFFF; letter-spacing: -0.01em; margin: 0 0 0.4rem 0;">
                              ${ep.title}
                            </h3>

                            <p class="daily-epoch-desc" style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 1.25rem 0;">
                              ${ep.desc}
                            </p>

                            <!-- Target Perk Chip -->
                            <div class="daily-epoch-target-chip" style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 0.65rem 0.95rem; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                              <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; font-family: var(--font-mono);">Milestone Target:</span>
                              <span style="font-size: 0.86rem; font-weight: 800; color: ${ep.index === 9 ? '#FFD700' : 'var(--brand-yellow)'}; font-family: var(--font-mono);">${ep.perk}</span>
                            </div>

                            <!-- 10 Interactive Subday Slots -->
                            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.45rem; margin-bottom: 1.25rem;">
                              ${epochRewards.map(r => {
                                const isClaimed = user && r.day < currentStreak;
                                const isActiveToday = user && r.day === currentStreak;
                                const isNft = r.day === 100;

                                return `
                                  <div style="background: ${isClaimed ? 'rgba(16, 185, 129, 0.12)' : isActiveToday ? 'rgba(243, 186, 47, 0.18)' : 'rgba(255, 255, 255, 0.03)'}; border: 1px solid ${isClaimed ? 'rgba(16, 185, 129, 0.35)' : isActiveToday ? 'var(--brand-yellow)' : 'rgba(255, 255, 255, 0.06)'}; border-radius: 10px; padding: 0.5rem 0.3rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: space-between; min-height: 58px; transition: all 0.2s ease;">
                                    <span style="font-size: 0.62rem; font-weight: 800; color: var(--text-muted); font-family: var(--font-mono);">${isNft ? 'NFT' : `D${r.day}`}</span>
                                    <span style="font-size: 0.72rem; font-weight: 900; color: ${isNft ? '#FFD700' : isClaimed ? 'var(--accent-emerald)' : isActiveToday ? '#FFFFFF' : 'var(--text-secondary)'}; font-family: var(--font-mono); margin: 0.15rem 0;">+${r.rewardVal}</span>
                                    ${isClaimed ? `
                                      <span style="font-size: 0.58rem; color: var(--accent-emerald); font-weight: 800;">✓ Done</span>
                                    ` : isActiveToday ? `
                                      <button type="button" onclick="window.boobaApp.handleClaimDailyStreak(${r.day})" style="background: var(--brand-yellow); color: #000; font-weight: 900; font-size: 0.58rem; padding: 0.15rem 0.35rem; border-radius: 999px; border: none; cursor: pointer; box-shadow: 0 0 8px rgba(243, 186, 47, 0.6); line-height: 1;">
                                        Claim
                                      </button>
                                    ` : `
                                      <span style="font-size: 0.58rem; color: var(--text-muted);">🔒</span>
                                    `}
                                  </div>
                                `;
                              }).join('')}
                            </div>

                            <!-- Progress Track -->
                            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem; font-weight: 700; color: var(--text-muted); font-family: var(--font-mono);">
                              <span>Epoch Progress: ${isEpochCompleted ? '10/10 Conquered' : `${daysClaimed}/10 Days`}</span>
                              <div style="width: 45%; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden;">
                                <div style="width: ${isEpochCompleted ? 100 : (daysClaimed / 10) * 100}%; height: 100%; background: ${isEpochCompleted ? 'var(--accent-emerald)' : 'var(--brand-yellow)'};"></div>
                              </div>
                            </div>

                          </div>
                        </div>

                        <!-- Center Beacon Node Column -->
                        <div class="map-waypoint-beacon-col">
                          <div class="map-beacon-anchor ${beaconClass}" title="Epoch ${ep.num}: ${ep.title}">
                            <span>${ep.num}</span>
                          </div>
                        </div>

                        <!-- Spacer Column -->
                        <div class="map-waypoint-spacer-col"></div>

                      </div>
                    `;
                  }).join('');
                })()}

              </div>

              <!-- Day 100 Apex Summit Showcase -->
              <div class="nft-grand-spotlight" style="margin-top: 4rem; border-radius: 28px; border: 2px solid #FFD700; background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(14, 18, 27, 0.95) 100%); box-shadow: 0 0 50px rgba(255, 215, 0, 0.25);">
                <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
                  <div style="width: 80px; height: 80px; border-radius: 22px; background: linear-gradient(135deg, #FFD700, #F3BA2F); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 35px rgba(255, 215, 0, 0.5); flex-shrink: 0;">
                    <svg width="42" height="42" viewBox="0 0 24 24" fill="#000000"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  </div>
                  <div>
                    <div class="nft-spotlight-badges" style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                      <span class="badge-tag" style="background: #FFD700; color: #000; font-weight: 900; font-size: 0.72rem; padding: 0.2rem 0.65rem;">
                        DAY 100 APEX SUMMIT REWARD
                      </span>
                      <span class="badge-tag" style="background: rgba(255, 255, 255, 0.08); color: #FFFFFF; font-size: 0.72rem;">
                        BEP-721 NON-FUNGIBLE ASSET
                      </span>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 900; color: #FFFFFF; margin: 0 0 0.35rem 0;">
                      Genesis Booba Master 1/1 NFT
                    </h3>
                    <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 620px; margin: 0; line-height: 1.6;">
                      The pinnacle achievement of the 100-day expedition. Grants permanent 2.5x multiplier, private DAO advisory council seat, and direct BNB Baby Treasury revenue sharing.
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
              ` : filtered.map(q => {
                const userStatus = db.getQuestUserStatus ? db.getQuestUserStatus(q.id) : { completed: false, status: 'unclaimed' };
                const isProofMode = q.type === 'proof' || q.category === 'content' || q.category === 'Content Production';
                const isDailyInstant = q.type === 'instant' || q.category === 'daily';

                return `
                <div class="card card-hover" style="display: flex; flex-direction: column; justify-content: space-between; padding: 2.25rem; border-radius: 24px; background: rgba(14, 18, 27, 0.85); border: 1.5px solid ${userStatus.completed ? 'rgba(16, 185, 129, 0.4)' : (userStatus.status === 'pending_review' ? 'rgba(243, 186, 47, 0.4)' : 'rgba(255, 255, 255, 0.08)')}; box-shadow: 0 10px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                  
                  <div>
                    <!-- Unboxed Header: Category & Reward -->
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.25rem; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 0.85rem;">
                      <div style="font-size: 0.76rem; font-weight: 800; color: var(--accent-cyan); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 0.4rem;">
                        <span>// ${getCategoryLabel(q.category)}</span>
                      </div>
                      <div style="font-size: 1.2rem; font-weight: 900; color: ${userStatus.completed ? 'var(--accent-emerald)' : 'var(--brand-yellow)'}; font-family: var(--font-mono); letter-spacing: -0.01em;">
                        +${Number(q.rewardBooba).toLocaleString()} <span style="font-size: 0.85rem; color: var(--text-secondary);">BOOBA</span>
                      </div>
                    </div>

                    <h3 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.65rem; color: #FFFFFF; line-height: 1.35;">${q.title}</h3>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1.5rem;">
                      ${q.description}
                    </p>

                    <!-- Unboxed Instructions Box -->
                    <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1.75rem; background: rgba(0,0,0,0.35); padding: 0.85rem 1rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); display: flex; align-items: flex-start; gap: 0.6rem;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${isProofMode ? 'var(--accent-violet)' : 'var(--brand-yellow)'}" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                      <span style="line-height: 1.5;">${isProofMode ? (q.requirements || 'Submit content proof link for admin verification.') : (q.requirements || 'Click action link to receive allocated coins immediately.')}</span>
                    </div>
                  </div>

                  <div>
                    ${userStatus.completed ? `
                      <button class="btn btn-outline btn-block" disabled style="opacity: 0.9; border-color: var(--accent-emerald); color: var(--accent-emerald); background: rgba(16, 185, 129, 0.08); font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: default;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Completed & Claimed (+${q.rewardBooba} BOOBA)</span>
                      </button>
                    ` : userStatus.status === 'pending_review' ? `
                      <button class="btn btn-outline btn-block" disabled style="opacity: 0.95; border-color: rgba(243, 186, 47, 0.5); color: var(--brand-yellow); background: rgba(243, 186, 47, 0.08); font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: default;">
                        <span class="pulse-dot" style="width: 6px; height: 6px; background: var(--brand-yellow);"></span>
                        <span>Proof Under Admin Review</span>
                      </button>
                    ` : userStatus.status === 'rejected' ? `
                      <button class="btn btn-block" onclick="window.boobaApp.openProofModal('${q.id}')" style="background: var(--accent-ruby); color: #FFFFFF; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        <span>Rejected • Resubmit Proof Link</span>
                      </button>
                    ` : isDailyInstant ? `
                      <button class="btn btn-primary btn-block" onclick="window.boobaApp.setQuestFilter('daily')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        <span>Open 100-Day Streak Matrix</span>
                      </button>
                    ` : isProofMode ? `
                      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                        ${q.targetUrl ? `
                          <a href="${q.targetUrl}" target="_blank" class="btn btn-outline btn-block" style="display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 700; font-size: 0.85rem;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            <span>Visit Mission Site</span>
                          </a>
                        ` : ''}
                        <button class="btn btn-primary btn-block" onclick="window.boobaApp.openProofModal('${q.id}')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800; font-size: 0.88rem;">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                          <span>Submit Proof Link (Coins on Approval)</span>
                        </button>
                      </div>
                    ` : `
                      <button class="btn btn-primary btn-block" onclick="window.boobaApp.handleSocialLinkAction('${q.id}')" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 800;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        <span>${q.targetUrl ? 'Open Link & Receive Coins' : (q.actionText || 'Claim Bounty')}</span>
                      </button>
                    `}
                  </div>

                </div>
              `;
              }).join('')}
            </div>
          `}
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

        <!-- LEADERBOARD PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Booba Legends</span>
          </h1>
        </div>

        <!-- 3D OLYMPIC PODIUM (Top 3 Holders) -->
        <div class="leaderboard-podium-container">
          
          <!-- DESKTOP PODIUM (Rank 2 Left, Rank 1 Center Elevated, Rank 3 Right) -->
          <div class="leaderboard-podium-desktop">
            <!-- Rank 2: Silver -->
            <div class="card card-hover text-center" style="padding: 2.25rem 1.5rem 2rem 1.5rem; border-radius: 26px; border: 1.5px solid rgba(226, 232, 240, 0.4); background: linear-gradient(180deg, rgba(226, 232, 240, 0.08) 0%, rgba(14, 18, 27, 0.85) 100%); display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(226, 232, 240, 0.15); border: 2px solid #E2E8F0; color: #E2E8F0; font-weight: 800; font-size: 1.1rem; margin-bottom: 0.5rem; box-shadow: 0 0 15px rgba(226, 232, 240, 0.25);">
                #2
              </div>
              
              <!-- Giant 3D Mascot Character Stage -->
              <div class="podium-mascot-stage" style="position: relative; width: 100%; height: 190px; display: flex; align-items: center; justify-content: center; margin: 0.5rem 0 1rem 0;">
                <div style="position: absolute; width: 140px; height: 140px; border-radius: 50%; background: ${top2Level.glowColor}; filter: blur(30px); opacity: 0.7; pointer-events: none;"></div>
                <img src="${top2Level.mascotImage || 'assets/mascot_level1.png'}" class="mascot-living-img mascot-anim-${top2Level.level}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 12px 24px rgba(0,0,0,0.65));" alt="${top2.username}">
              </div>

              <h3 style="font-size: 1.3rem; color: #FFFFFF; font-weight: 900; margin-bottom: 0.35rem;">${top2.username}</h3>
              <span class="badge-tag" style="background: ${top2Level.glowColor}; color: ${top2Level.accentColor}; border: 1px solid ${top2Level.borderColor}; font-size: 0.75rem; font-weight: 800; margin-bottom: 0.85rem;">Lv.${top2Level.level} ${top2Level.title}</span>
              <div style="font-size: 1.6rem; font-weight: 900; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${Number(top2.boobaPoints).toLocaleString()} <span style="font-size: 0.82rem; color: var(--text-secondary);">BOOBA</span>
              </div>
            </div>

            <!-- Rank 1: Gold (Center & Taller) -->
            <div class="card card-hover text-center" style="padding: 3rem 1.75rem 2.5rem 1.75rem; border-radius: 30px; border: 2px solid var(--brand-yellow); background: linear-gradient(180deg, rgba(243, 186, 47, 0.16) 0%, rgba(14, 18, 27, 0.95) 100%); box-shadow: 0 0 50px rgba(243, 186, 47, 0.35); transform: translateY(-14px); display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: var(--brand-yellow); color: #000; font-weight: 900; font-size: 1.4rem; margin-bottom: 0.5rem; box-shadow: 0 0 25px var(--brand-yellow-glow);">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"></path></svg>
              </div>
              
              <!-- Giant 3D Mascot Character Stage -->
              <div class="podium-mascot-stage" style="position: relative; width: 100%; height: 230px; display: flex; align-items: center; justify-content: center; margin: 0.5rem 0 1rem 0;">
                <div style="position: absolute; width: 170px; height: 170px; border-radius: 50%; background: var(--brand-yellow-glow); filter: blur(35px); opacity: 0.85; pointer-events: none;"></div>
                <img src="${top1Level.mascotImage || 'assets/mascot_level1.png'}" class="mascot-living-img mascot-anim-${top1Level.level}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 14px 28px rgba(0,0,0,0.75)) drop-shadow(0 0 25px rgba(243,186,47,0.4));" alt="${top1.username}">
              </div>

              <h3 style="font-size: 1.5rem; color: #FFFFFF; font-weight: 900; margin-bottom: 0.35rem;">${top1.username}</h3>
              <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 900; font-size: 0.8rem; margin-bottom: 0.85rem; padding: 0.3rem 0.8rem;">Lv.${top1Level.level} ${top1Level.title}</span>
              <div style="font-size: 2rem; font-weight: 900; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${Number(top1.boobaPoints).toLocaleString()} <span style="font-size: 0.92rem; color: var(--text-secondary);">BOOBA</span>
              </div>
            </div>

            <!-- Rank 3: Bronze -->
            <div class="card card-hover text-center" style="padding: 2.25rem 1.5rem 2rem 1.5rem; border-radius: 26px; border: 1.5px solid rgba(249, 115, 22, 0.4); background: linear-gradient(180deg, rgba(249, 115, 22, 0.08) 0%, rgba(14, 18, 27, 0.85) 100%); display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(249, 115, 22, 0.15); border: 2px solid #F97316; color: #F97316; font-weight: 800; font-size: 1.1rem; margin-bottom: 0.5rem; box-shadow: 0 0 15px rgba(249, 115, 22, 0.25);">
                #3
              </div>
              
              <!-- Giant 3D Mascot Character Stage -->
              <div class="podium-mascot-stage" style="position: relative; width: 100%; height: 190px; display: flex; align-items: center; justify-content: center; margin: 0.5rem 0 1rem 0;">
                <div style="position: absolute; width: 140px; height: 140px; border-radius: 50%; background: ${top3Level.glowColor}; filter: blur(30px); opacity: 0.7; pointer-events: none;"></div>
                <img src="${top3Level.mascotImage || 'assets/mascot_level1.png'}" class="mascot-living-img mascot-anim-${top3Level.level}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 12px 24px rgba(0,0,0,0.65));" alt="${top3.username}">
              </div>

              <h3 style="font-size: 1.3rem; color: #FFFFFF; font-weight: 900; margin-bottom: 0.35rem;">${top3.username}</h3>
              <span class="badge-tag" style="background: ${top3Level.glowColor}; color: ${top3Level.accentColor}; border: 1px solid ${top3Level.borderColor}; font-size: 0.75rem; font-weight: 800; margin-bottom: 0.85rem;">Lv.${top3Level.level} ${top3Level.title}</span>
              <div style="font-size: 1.6rem; font-weight: 900; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${Number(top3.boobaPoints).toLocaleString()} <span style="font-size: 0.82rem; color: var(--text-secondary);">BOOBA</span>
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
                  <img src="${top2Level.mascotImage || 'assets/mascot_level1.png'}" class="mob-avatar" alt="${top2.username}" style="object-fit: contain; background: rgba(0,0,0,0.5);">
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
                  <img src="${top1Level.mascotImage || 'assets/mascot_level1.png'}" class="mob-avatar" alt="${top1.username}" style="object-fit: contain; background: rgba(0,0,0,0.5);">
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
                  <img src="${top3Level.mascotImage || 'assets/mascot_level1.png'}" class="mob-avatar" alt="${top3.username}" style="object-fit: contain; background: rgba(0,0,0,0.5);">
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
                          <img src="${lvl.mascotImage || 'assets/mascot_level1.png'}" style="width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid ${lvl.accentColor}; object-fit: contain; background: rgba(0,0,0,0.5); box-shadow: 0 0 10px ${lvl.glowColor};">
                          <div>
                            <div style="font-weight: 700; color: #FFFFFF; display: flex; align-items: center; gap: 0.5rem;">
                              <span>${u.username}</span>
                              ${isMe ? '<span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-size: 0.65rem; padding: 0.15rem 0.45rem; font-weight: 800;">YOU</span>' : ''}
                              ${u.role === 'admin' ? '<span class="badge-tag" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">Admin</span>' : ''}
                            </div>
                            <div style="font-size: 0.75rem; color: ${lvl.accentColor};" class="text-mono">Passport: ${u.passportId || 'BB-MAIN'}</div>
                          </div>
                        </div>
                      </td>
                      <td style="padding: 1.25rem 1.5rem;">
                        <span style="font-weight: 800; font-size: 0.86rem; color: ${lvl.accentColor}; letter-spacing: 0.02em; text-transform: uppercase;">Lv.${lvl.level} ${lvl.title}</span>
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
                <div class="mob-rank-item ${isMe ? 'is-current-user' : ''}" style="animation-delay: ${idx * 0.035}s; border-color: ${isMe ? lvl.borderColor : 'rgba(255,255,255,0.08)'};">
                  <div class="mob-rank-left">
                    <div class="mob-rank-pill ${rankBadgeClass}">#${rank}</div>
                    <img src="${lvl.mascotImage || 'assets/mascot_level1.png'}" class="mob-item-avatar" alt="${u.username}" style="border: 1.5px solid ${lvl.accentColor}; object-fit: contain; background: rgba(0,0,0,0.5);">
                    <div class="mob-item-meta">
                      <div class="mob-item-name">
                        <span class="mob-item-uname">${u.username}</span>
                        ${isMe ? '<span class="mob-tag-you">YOU</span>' : ''}
                        ${u.role === 'admin' ? '<span class="mob-tag-admin">Admin</span>' : ''}
                      </div>
                        <span class="mob-item-streak" style="display: inline-flex; align-items: center; gap: 0.2rem;">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                          <span>${u.streakDays || 1}d</span>
                        </span>
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

        <!-- REFERRALS PAGE HEADER -->
        <div style="text-align: center; max-width: 860px; margin: 0 auto 3.5rem auto; position: relative; z-index: 10;">
          <h1 style="font-size: clamp(1.8rem, 4.5vw, 3.5rem); font-weight: 900; color: #FFFFFF; letter-spacing: -0.03em; line-height: 1.12; font-family: var(--font-heading); margin-bottom: 0; white-space: nowrap;">
            <span class="text-gradient-gold">Referrals</span>
          </h1>
        </div>

        <div class="card" style="max-width: 700px; margin: 0 auto 3rem auto; padding: 2.5rem; border-radius: 28px; border: 1.5px solid rgba(243, 186, 47, 0.35);">
          <h3 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF; margin-bottom: 1rem;">Your Referral Link</h3>
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
              No referrals yet. Share your referral link on Telegram or X/Twitter to start earning +300 $BOOBA rewards!
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

  // Immediately open social link AND credit allocated coins to citizen's balance
  async handleSocialLinkAction(questId) {
    if (!db.currentUser) {
      alert('Please sign in or mint your Booba Passport first to claim mission rewards.');
      window.location.href = 'signin.html#signup';
      return;
    }
    const quest = db.quests.find(q => q.id === questId);
    if (!quest) return;

    // 1. Immediately open target mission link in new tab if available
    if (quest.targetUrl) {
      window.open(quest.targetUrl, '_blank', 'noopener,noreferrer');
    }

    // 2. Immediately award allocated coins to user
    const res = await db.completeSocialQuest(questId);
    if (res.success) {
      alert(`Social Link Action Verified!\n\n+${res.reward} $BOOBA has been instantly credited to your passport balance!`);
      this.render();
    } else {
      alert(res.message || 'Unable to complete quest.');
    }
  }

  openSocialModal(questId) {
    this.handleSocialLinkAction(questId);
  }

  async handleConfirmSocial() {
    if (!this.selectedQuestForSocial) return;

    const confirmBtn = document.getElementById('confirmSocialVerifyBtn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Verifying status...';
    }

    const res = await db.completeSocialQuest(this.selectedQuestForSocial.id);
    this.closeModal();
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Verify & Claim Points';
    }

    if (res.success) {
      alert(`Social Mission Verified! +${res.reward} $BOOBA credited to your passport balance!`);
      this.render();
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
    if (rewardEl) rewardEl.textContent = `Reward: +${Number(quest.rewardBooba).toLocaleString()} BOOBA (Coins released upon Admin Approval)`;
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
      alert(`Proof Submitted Successfully!\n\nYour proof is now queued in the Admin Review Queue. Your +${Number(this.selectedQuestForProof.rewardBooba).toLocaleString()} $BOOBA coins will be credited once approved by the admin.`);
      this.render();
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
    const waypoint = document.getElementById(`waypointRow_${epochIndex}`);
    if (waypoint) {
      waypoint.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

