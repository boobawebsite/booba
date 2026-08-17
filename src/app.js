/* ==========================================================================
   BOOBA (baby BNB) — Main Application Controller
   SPA Architecture • X-Style Auth Page • Google-Standard Polish
   ========================================================================== */

import { db, calculateLevel, LEVEL_TIERS } from './services/db.js';
import { SupabaseService } from './services/supabaseClient.js';

class BoobaApp {
  constructor() {
    this.currentRoute = 'home';
    this.activeDashboardTab = 'overview';
    this.activeAdminTab = 'submissions';
    this.activeQuestFilter = 'all';
    this.authMode = 'signup'; // 'signup' or 'signin'

    this.init();
  }

  init() {
    // Check URL query parameters for referral code
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    if (refParam) {
      window.sessionStorage.setItem('booba_ref_code', refParam);
      window.location.hash = 'auth';
    }

    // Subscribe to DB state updates
    db.subscribe((state) => {
      this.render();
    });

    // Handle browser hash routing
    window.addEventListener('hashchange', () => {
      this.handleRouting();
    });

    // Setup DOM event listeners
    this.setupGlobalEvents();

    // Initial route handling
    this.handleRouting();
    this.render();
  }

  handleRouting() {
    const hash = window.location.hash.replace(/^#/, '');

    if (hash.startsWith('dashboard')) {
      const parts = hash.split('/');
      this.currentRoute = 'dashboard';
      if (parts[1]) this.activeDashboardTab = parts[1];
    } else if (hash.startsWith('admin')) {
      const parts = hash.split('/');
      this.currentRoute = 'admin';
      if (parts[1]) this.activeAdminTab = parts[1];
    } else if (hash === 'auth' || hash === 'login' || hash === 'signup') {
      this.currentRoute = 'auth';
      this.authMode = hash === 'login' ? 'signin' : 'signup';
    } else {
      this.currentRoute = 'home';
    }

    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setupGlobalEvents() {
    // Close modal on escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeMobileNav();
      }
    });

    // Global Click Delegation
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
  }

  toggleMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer && backdrop) {
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        this.closeMobileNav();
      } else {
        drawer.classList.add('open');
        backdrop.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }
  }

  closeMobileNav() {
    const drawer = document.getElementById('mobileNavDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
    
    toast.innerHTML = `
      <div style="font-size: 1.25rem;">${icon}</div>
      <div style="flex: 1; font-size: 0.9rem; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  openAuthModal(mode = 'signup') {
    this.authMode = mode;
    window.location.hash = mode === 'signin' ? 'login' : 'signup';
  }

  closeModal() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  }

  // Render entry dispatcher
  render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const state = db.getState();
    const currentUser = state.currentUser;

    // Render Navigation
    this.renderHeader(currentUser);

    // Route Views
    const footerEl = document.getElementById('siteFooter');
    if (footerEl) {
      footerEl.style.display = this.currentRoute === 'auth' ? 'none' : 'block';
    }

    if (this.currentRoute === 'home') {
      appEl.innerHTML = this.getHomepageHTML(state);
      this.attachHomeListeners();
    } else if (this.currentRoute === 'auth') {
      appEl.innerHTML = this.getXAuthPageHTML(state);
      this.attachXAuthListeners();
    } else if (this.currentRoute === 'dashboard') {
      if (!currentUser) {
        window.location.hash = 'login';
        return;
      }
      appEl.innerHTML = this.getDashboardHTML(state);
      this.attachDashboardListeners();
    } else if (this.currentRoute === 'admin') {
      if (!currentUser || currentUser.role !== 'admin') {
        this.showToast('Admin privileges required. Switched to Admin preview account.', 'info');
        db.switchDemoUser('admin');
      }
      appEl.innerHTML = this.getAdminHTML(state);
      this.attachAdminListeners();
    }

    // Attach Passport 3D tilt effects if passport card is on screen
    this.initPassportTilt();
  }

  renderHeader(currentUser) {
    const navRight = document.getElementById('headerNavActions');
    const mobileDrawerFooter = document.getElementById('mobileNavFooter');

    if (currentUser) {
      const userLevel = calculateLevel(currentUser.boobaPoints);
      if (navRight) {
        navRight.innerHTML = `
          <div class="flex items-center gap-2 nav-actions-user">
            <a href="#dashboard/overview" class="btn btn-secondary btn-sm flex items-center gap-2 header-user-pill" style="border-radius: var(--radius-full); padding: 0.35rem 0.75rem;">
              <img src="${currentUser.avatar || 'assets/mascot.jpg'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-yellow); flex-shrink: 0;">
              <span class="header-username" style="font-weight: 700; color: var(--text-primary);">@${currentUser.username}</span>
              <span class="badge-tag header-lvl-tag" style="padding: 0.1rem 0.35rem; font-size: 0.65rem;">Lvl ${userLevel.level}</span>
            </a>
            <div class="quest-reward-pill header-points-pill" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
              <span>🍼</span>
              <span>${currentUser.boobaPoints.toLocaleString()} BOOBA</span>
            </div>
            ${currentUser.role === 'admin' ? `
              <a href="teamadmin.html" class="btn btn-outline btn-sm header-admin-btn" style="font-size: 0.8rem; padding: 0.35rem 0.65rem;" title="Open Team Admin Console">
                🛡️ Admin
              </a>
            ` : ''}
            <button id="logoutBtn" class="btn btn-ghost btn-sm btn-icon-action" title="Sign Out" aria-label="Sign Out" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; min-width: 32px; padding: 0; border-radius: var(--radius-full); flex-shrink: 0;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        `;
      }

      if (mobileDrawerFooter) {
        mobileDrawerFooter.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; background: var(--bg-surface-elevated); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
            <img src="${currentUser.avatar || 'assets/mascot.jpg'}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-yellow); flex-shrink: 0;">
            <div style="min-width: 0; overflow: hidden;">
              <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">@${currentUser.username}</div>
              <div style="font-size: 0.75rem; color: var(--brand-yellow); font-family: var(--font-mono);">${currentUser.passportId} • ${currentUser.boobaPoints.toLocaleString()} BOOBA</div>
            </div>
          </div>
          <button id="mobileDrawerLogoutBtn" class="btn btn-secondary btn-block btn-sm" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3); font-weight: 600;">
            Sign Out
          </button>
        `;
        document.getElementById('mobileDrawerLogoutBtn')?.addEventListener('click', () => {
          this.closeMobileNav();
          db.logout();
          this.showToast('You have been logged out.');
          window.location.hash = 'home';
        });
      }

      document.getElementById('logoutBtn')?.addEventListener('click', () => {
        db.logout();
        this.showToast('You have been logged out.');
        window.location.hash = 'home';
      });
    } else {
      if (navRight) {
        navRight.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="#login" class="btn btn-ghost btn-sm" style="font-size: 0.85rem; padding: 0.4rem 0.65rem;">Sign In</a>
            <a href="#signup" class="btn btn-primary btn-sm header-signup-btn" style="font-size: 0.825rem; padding: 0.4rem 0.85rem;">Create Passport</a>
          </div>
        `;
      }

      if (mobileDrawerFooter) {
        mobileDrawerFooter.innerHTML = `
          <a href="#signup" class="btn btn-primary btn-block mobile-nav-link" style="justify-content: center; font-weight: 700;">
            🪪 Create Your Booba Passport
          </a>
          <a href="#login" class="btn btn-secondary btn-block mobile-nav-link" style="justify-content: center;">
            Sign In to Existing Account
          </a>
        `;
      }
    }
  }

  /* --------------------------------------------------------------------------
     1. X-STYLE AUTH PAGE VIEW (Login & Sign Up Together)
     -------------------------------------------------------------------------- */
  getXAuthPageHTML(state) {
    const isSignUp = this.authMode === 'signup';
    const storedRef = window.sessionStorage.getItem('booba_ref_code') || '';

    return `
      <div class="auth-page-container">
        <div class="x-auth-layout">
          
          <!-- LEFT SIDE: Grand 3D Baby BNB Mascot & Emblem -->
          <div class="x-auth-left">
            <div style="position: relative; text-align: center;">
              <img src="assets/mascot.jpg" class="x-auth-giant-logo" alt="Booba Baby BNB Mascot">
              
              <!-- Floating Brand Tag -->
              <div class="glass-panel" style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); padding: 0.6rem 1.25rem; border-radius: var(--radius-full); border: 1.5px solid var(--brand-yellow); display: flex; align-items: center; gap: 0.6rem; white-space: nowrap; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                <span style="font-size: 1.2rem;">🍼</span>
                <span style="font-weight: 800; font-size: 0.9rem; color: #FFFFFF;">BOOBA • baby BNB</span>
              </div>
            </div>
          </div>

          <!-- RIGHT SIDE: X-Style Auth Form & Actions -->
          <div class="x-auth-right">
            
            <h2 class="x-auth-subhead" style="font-size: clamp(1.8rem, 3.5vw, 2.75rem); line-height: 1.2; margin-bottom: 2rem;">
              ${isSignUp ? 'Join the Booba Universe today.' : 'Sign in to get your Booba Passport.'}
            </h2>

            <div class="x-auth-actions-group">
              
              <!-- 1. Continue with Google -->
              <button type="button" id="btnGoogleAuth" class="btn-auth-pill">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <!-- 2. Continue with Web3 Wallet -->
              <button type="button" id="btnWalletAuth" class="btn-auth-pill btn-wallet">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L2 9L16 16L30 9L16 2Z" fill="#000000"/>
                  <path d="M2 23L16 30L30 23V9L16 16L2 9V23Z" fill="#000000" fill-opacity="0.8"/>
                </svg>
                Continue with Web3 Wallet
              </button>

              <!-- 3. Continue with Apple -->
              <button type="button" id="btnAppleAuth" class="btn-auth-pill btn-apple">
                <svg width="18" height="18" viewBox="0 0 170 170" fill="#FFFFFF">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-5.35.12-10.26-2.04-14.75-6.47-3.28-3.07-7.23-7.97-11.87-14.7-5.9-8.58-10.46-18.42-13.68-29.54-3.21-11.12-4.83-21.78-4.83-31.99 0-14.65 3.63-26.69 10.9-36.14 7.26-9.45 16.51-14.28 27.75-14.5 4.35 0 9.47 1.15 15.36 3.44 5.9 2.29 9.87 3.47 11.93 3.55 1.63 0 5.86-1.28 12.69-3.83 6.83-2.55 12.28-3.6 16.34-3.17 12.8.96 22.84 5.93 30.13 14.92-11.45 6.94-17.06 16.5-16.84 28.69.21 9.53 3.88 17.48 11.01 23.85 7.14 6.37 15.53 10.02 25.19 10.96-2.24 6.83-5.01 13.82-8.31 20.97zM119.22 31.02c0-7.3 2.66-14.1 7.98-20.4 5.32-6.3 11.83-10.05 19.53-11.24.65 6.94-1.68 13.79-7 20.55-5.32 6.76-11.82 10.74-19.51 11.93-.22-.28-.56-.56-1-.84z"/>
                </svg>
                Continue with Apple
              </button>

            </div>

            <!-- Divider -->
            <div class="x-auth-divider">
              <span>or</span>
            </div>

            <!-- Input Box & Email Submit -->
            <form id="xAuthForm" class="x-auth-input-box">
              
              ${isSignUp ? `
                <input type="text" id="xUsernameInput" placeholder="Choose username (e.g. CryptoKing)" class="x-input-field" required>
              ` : ''}

              <input type="text" id="xEmailInput" placeholder="Email or username" class="x-input-field" required>

              <input type="password" id="xPasswordInput" placeholder="Password" class="x-input-field">

              ${isSignUp ? `
                <input type="text" id="xReferralInput" value="${storedRef}" placeholder="Referral code (Optional)" class="x-input-field text-mono" style="text-transform: uppercase;">
              ` : ''}

              <button type="submit" id="xSubmitBtn" class="btn-x-submit">
                ${isSignUp ? 'Create account & Mint Passport (+100 BOOBA)' : 'Sign In'}
              </button>

            </form>

            <div class="x-legal-text">
              By signing up, you agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>, including <a href="#">Cookie Use</a>.
            </div>

            <!-- Switch between Sign Up & Sign In -->
            <div class="x-switch-account-row">
              ${isSignUp ? `
                Already have an account? <a id="toggleToSigninLink">Sign in</a>
              ` : `
                Don't have an account? <a id="toggleToSignupLink">Sign up</a>
              `}
            </div>

          </div>

        </div>

        <!-- Floating QR Card (Bottom Right like X) -->
        <div class="x-floating-qr-card">
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-primary); text-transform: uppercase;">Scan for Mobile Passport</div>
          <div style="width: 60px; height: 60px; background: #fff; padding: 4px; border-radius: 6px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;">
            <div style="background: #000;"></div><div style="background: #000;"></div><div></div><div style="background: #000;"></div>
            <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div></div>
            <div></div><div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div>
            <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div style="background: #000;"></div>
          </div>
          <div style="font-size: 0.65rem; color: var(--brand-yellow);">baby BNB App</div>
        </div>

      </div>
    `;
  }

  attachXAuthListeners() {
    // Toggle Sign Up / Sign In
    document.getElementById('toggleToSigninLink')?.addEventListener('click', () => {
      this.authMode = 'signin';
      window.location.hash = 'login';
    });

    document.getElementById('toggleToSignupLink')?.addEventListener('click', () => {
      this.authMode = 'signup';
      window.location.hash = 'signup';
    });

    // 1. Google Auth Click
    document.getElementById('btnGoogleAuth')?.addEventListener('click', () => {
      const mockEmail = 'cryptouser@gmail.com';
      const res = db.login(mockEmail, '') || db.register({ username: 'GooglePanda', email: mockEmail });
      if (res.user) {
        db.currentUser = res.user;
        this.showToast(`✨ Successfully authenticated with Google (${mockEmail})!`);
        window.location.hash = 'dashboard/overview';
      }
    });

    // 2. Web3 Wallet Auth Click
    document.getElementById('btnWalletAuth')?.addEventListener('click', () => {
      const mockWallet = '0x' + Math.random().toString(16).substring(2, 10) + '...' + Math.random().toString(16).substring(2, 6);
      const res = db.loginWithWallet(mockWallet);
      this.showToast(`🔗 Connected Web3 Wallet (${mockWallet})! Passport ready.`);
      window.location.hash = 'dashboard/overview';
    });

    // 3. Apple Auth Click
    document.getElementById('btnAppleAuth')?.addEventListener('click', () => {
      const mockEmail = 'appleuser@icloud.com';
      const res = db.register({ username: 'ApplePanda', email: mockEmail });
      if (res.user) {
        db.currentUser = res.user;
        this.showToast(`🍎 Successfully authenticated with Apple ID!`);
        window.location.hash = 'dashboard/overview';
      }
    });

    // Email Form Submit
    document.getElementById('xAuthForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const isSignUp = this.authMode === 'signup';
      const email = (document.getElementById('xEmailInput')?.value || '').trim();
      const password = (document.getElementById('xPasswordInput')?.value || '').trim();
      const username = (document.getElementById('xUsernameInput')?.value || '').trim();
      const refCode = (document.getElementById('xReferralInput')?.value || '').trim();

      const cleanEmail = email.toLowerCase();
      const cleanUsername = username.toLowerCase();
      const isAdminCredentials = (cleanEmail === 'admin@gmail.com' || cleanEmail === 'admin@booba.crypto' || cleanUsername === 'admin' || cleanUsername === 'boobaboss') && (password === 'booba' || isSignUp);

      // Core Team Admin Login / Signup
      if (isAdminCredentials) {
        db.switchDemoUser('admin');
        this.showToast('🛡️ Welcome Core Admin! Opening Team Admin Console...');
        setTimeout(() => {
          window.location.href = 'teamadmin.html';
        }, 400);
        return;
      }

      if (isSignUp) {
        if (!username || !email) {
          this.showToast('Please enter both username and email.', 'error');
          return;
        }
        const res = db.register({ username, email, password, referralCodeInput: refCode });
        if (res.success) {
          if (res.isAdmin || res.user.role === 'admin') {
            this.showToast('🛡️ Admin Passport Minted! Redirecting to Admin Console...');
            setTimeout(() => { window.location.href = 'teamadmin.html'; }, 400);
          } else {
            this.showToast(`🎉 Passport Minted! ID: ${res.user.passportId}. Welcome bonus +100 BOOBA credited!`);
            window.location.hash = 'dashboard/passport';
          }
        } else {
          this.showToast(res.message, 'error');
        }
      } else {
        if (!email) {
          this.showToast('Please enter your email or username.', 'error');
          return;
        }
        const res = db.login(email, password);
        if (res.success) {
          if (res.isAdmin || res.user.role === 'admin') {
            this.showToast(`🛡️ Welcome back, Admin @${res.user.username}! Opening Admin Console...`);
            setTimeout(() => { window.location.href = 'teamadmin.html'; }, 400);
          } else {
            this.showToast(`Welcome back, @${res.user.username}!`);
            window.location.hash = 'dashboard/overview';
          }
        } else {
          this.showToast(res.message, 'error');
        }
      }
    });

    // Demo Switchers
    document.getElementById('xDemoMemberBtn')?.addEventListener('click', () => {
      db.switchDemoUser('member');
      this.showToast('Logged in as Member: @CryptoKing (Level 7 Booba Elite)');
      window.location.hash = 'dashboard/overview';
    });

    document.getElementById('xDemoAdminBtn')?.addEventListener('click', () => {
      db.switchDemoUser('admin');
      this.showToast('🛡️ Logged in as Admin: @BoobaBoss. Opening Team Admin Console...');
      setTimeout(() => {
        window.location.href = 'teamadmin.html';
      }, 400);
    });
  }

  /* --------------------------------------------------------------------------
     2. HOMEPAGE VIEW
     -------------------------------------------------------------------------- */
  getHomepageHTML(state) {
    const topLeaderboard = [...state.users]
      .sort((a, b) => b.boobaPoints - a.boobaPoints)
      .slice(0, 5);

    const activeQuests = state.quests.slice(0, 4);

    return `
      <!-- HERO SECTION -->
      <section style="position: relative; padding: 5rem 0 4rem 0; overflow: hidden;">
        <div class="container">
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 3.5rem; align-items: center;">
            
            <!-- Left Hero Content -->
            <div>
              <h1 style="margin-bottom: 1.25rem; line-height: 1.15;">
                WELCOME TO THE <br>
                <span class="text-gradient-gold">BOOBA UNIVERSE</span>
              </h1>
              <p style="font-size: 1.15rem; color: var(--text-secondary); margin-bottom: 2rem; max-width: 540px;">
                Complete quests. Build your digital reputation. Grow the community. Earn your place in the most rewarding meme & utility ecosystem on BNB Chain.
              </p>

              <!-- Hero CTAs -->
              <div class="flex items-center gap-4" style="flex-wrap: wrap; margin-bottom: 2.5rem;">
                <a href="#signup" class="btn btn-primary btn-lg">
                  🪪 Create Your Booba Passport
                </a>
                <a href="#dashboard/quests" class="btn btn-secondary btn-lg">
                  🎯 Explore Quests
                </a>
              </div>

              <!-- Live Stats Counter Strip (4 items) -->
              <div class="glass-panel" style="padding: 1.25rem 1.5rem; border-radius: var(--radius-md); display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 1rem;">
                <div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Active Passports</div>
                  <div class="text-mono" style="font-size: 1.35rem; font-weight: 700; color: var(--brand-yellow);">14,820+</div>
                </div>
                <div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">BOOBA Distributed</div>
                  <div class="text-mono" style="font-size: 1.35rem; font-weight: 700; color: #FFFFFF;">4.85M 🍼</div>
                </div>
                <div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Ticker Symbol</div>
                  <div class="text-mono" style="font-size: 1.35rem; font-weight: 700; color: var(--accent-emerald);">$BOOBA</div>
                </div>
                <div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Nickname</div>
                  <div class="text-mono" style="font-size: 1.35rem; font-weight: 700; color: #FFFFFF;">baby BNB</div>
                </div>
              </div>
            </div>

            <!-- Right Hero Mascot & 3D Showcase -->
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              
              <!-- Ambient Mascot Light Ring -->
              <div style="position: absolute; width: 340px; height: 340px; border-radius: 50%; background: radial-gradient(circle, rgba(243, 186, 47, 0.25) 0%, transparent 70%); filter: blur(40px); z-index: 1;"></div>
              
              <!-- Mascot Image Frame -->
              <div style="position: relative; z-index: 2; text-align: center;">
                <img src="assets/mascot.jpg" alt="Booba Mascot - Baby BNB Panda" style="width: 100%; max-width: 380px; border-radius: var(--radius-xl); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 40px rgba(243, 186, 47, 0.25); border: 2px solid rgba(243, 186, 47, 0.4);">
              </div>

            </div>

          </div>
        </div>
      </section>

      <!-- HOW THE SYSTEM WORKS (5-Step Journey) -->
      <section style="padding: 4.5rem 0; background: rgba(14, 18, 27, 0.4); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle);">
        <div class="container">
          <div style="text-align: center; max-width: 650px; margin: 0 auto 3.5rem auto;">
            <span class="badge-tag" style="margin-bottom: 0.75rem;">HOW IT WORKS</span>
            <h2>Your Journey Inside The <span class="text-gradient-gold">Booba Ecosystem</span></h2>
            <p>From a curious newcomer to an elite community leader — here is how your digital identity evolves.</p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem;">
            
            <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); position: relative;">
              <div style="font-size: 2rem; margin-bottom: 1rem;">🪪</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.35rem;">STEP 1</div>
              <h4 style="margin-bottom: 0.6rem;">JOIN</h4>
              <p style="font-size: 0.88rem;">Create your Booba account and automatically mint your unique digital Booba Passport ID.</p>
            </div>

            <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); position: relative;">
              <div style="font-size: 2rem; margin-bottom: 1rem;">🎯</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.35rem;">STEP 2</div>
              <h4 style="margin-bottom: 0.6rem;">PARTICIPATE</h4>
              <p style="font-size: 0.88rem;">Complete daily check-ins, social actions, and community activities to earn BOOBA rewards.</p>
            </div>

            <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); position: relative;">
              <div style="font-size: 2rem; margin-bottom: 1rem;">📈</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.35rem;">STEP 3</div>
              <h4 style="margin-bottom: 0.6rem;">GROW</h4>
              <p style="font-size: 0.88rem;">Earn BOOBA points to level up through 10 progressive tiers from Booba Baby to Booba Master.</p>
            </div>

            <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); position: relative;">
              <div style="font-size: 2rem; margin-bottom: 1rem;">🤝</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.35rem;">STEP 4</div>
              <h4 style="margin-bottom: 0.6rem;">CONTRIBUTE</h4>
              <p style="font-size: 0.88rem;">Refer verified genuine members, create memes, write threads, and build community reputation.</p>
            </div>

            <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); position: relative;">
              <div style="font-size: 2rem; margin-bottom: 1rem;">👑</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.35rem;">STEP 5</div>
              <h4 style="margin-bottom: 0.6rem;">UNLOCK</h4>
              <p style="font-size: 0.88rem;">Gain exclusive token airdrop multipliers, VIP AMA access, governance voting, and badges.</p>
            </div>

          </div>
        </div>
      </section>

      <!-- THE BOOBA PASSPORT SPOTLIGHT -->
      <section style="padding: 5rem 0;">
        <div class="container">
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 3.5rem; align-items: center;">
            
            <div>
              <span class="badge-tag" style="margin-bottom: 0.75rem;">THE CENTRAL FEATURE</span>
              <h2 style="margin-bottom: 1.25rem;">The <span class="text-gradient-gold">Booba Passport</span></h2>
              <p style="font-size: 1.05rem; margin-bottom: 1.5rem;">
                More than a profile — the Booba Passport is your immutable digital identity and reputation record within the entire Baby BNB ecosystem.
              </p>

              <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
                <div class="flex items-center gap-3">
                  <span style="font-size: 1.3rem;">🛡️</span>
                  <div>
                    <div style="font-weight: 700; color: var(--text-primary);">Unique Passport ID</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">Permanent tracking for every contribution and verified milestone.</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span style="font-size: 1.3rem;">⭐</span>
                  <div>
                    <div style="font-weight: 700; color: var(--text-primary);">Reputation Score (0 - 100)</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">Dynamic trust rating built from genuine engagement and verified referrals.</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span style="font-size: 1.3rem;">🎖️</span>
                  <div>
                    <div style="font-weight: 700; color: var(--text-primary);">Holographic Collectible Badges</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">Unlock milestone insignias to display on your passport and share on socials.</div>
                  </div>
                </div>
              </div>

              <a href="#signup" class="btn btn-primary">
                Claim Your Passport ID
              </a>
            </div>

            <!-- Interactive 3D Passport Preview -->
            <div class="passport-container">
              <div class="passport-card-3d" id="spotlightPassportCard">
                
                <!-- FRONT FACE -->
                <div class="passport-face passport-front">
                  <div class="passport-top-row">
                    <div class="passport-emblem">
                      <img src="assets/mascot.jpg" class="passport-emblem-icon" alt="Booba">
                      <div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); letter-spacing: 0.08em;">BOOBA PASSPORT</div>
                        <div style="font-size: 0.6rem; color: var(--text-muted);">BABY BNB OFFICIAL IDENTITY</div>
                      </div>
                    </div>
                    <div class="passport-chip"></div>
                  </div>

                  <div class="passport-body">
                    <img src="assets/mascot.jpg" class="passport-user-avatar" alt="Avatar">
                    <div class="passport-info-grid">
                      <div class="passport-username">
                        <span>@CryptoKing</span>
                        <span style="color: var(--brand-yellow); font-size: 0.9rem;">✓</span>
                      </div>
                      <div class="passport-id-badge">ID: BB-008421</div>
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        Level 7 — <strong style="color: var(--brand-yellow);">Booba Elite</strong>
                      </div>
                    </div>
                  </div>

                  <div class="passport-metrics-strip">
                    <div class="passport-metric-item">
                      <div class="passport-metric-label">BOOBA Balance</div>
                      <div class="passport-metric-value text-gold">28,450 🍼</div>
                    </div>
                    <div class="passport-metric-item">
                      <div class="passport-metric-label">Reputation</div>
                      <div class="passport-metric-value">91 / 100</div>
                    </div>
                    <div class="passport-metric-item">
                      <div class="passport-metric-label">Referrals</div>
                      <div class="passport-metric-value">42 Verified</div>
                    </div>
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; color: var(--text-muted); margin-top: 0.5rem;">
                    <span>MEMBER SINCE: AUG 2026</span>
                    <span style="color: var(--brand-yellow); cursor: pointer;" id="flipPassportBtn">Click card to Flip ↷</span>
                  </div>
                </div>

                <!-- BACK FACE -->
                <div class="passport-face passport-back">
                  <div class="passport-top-row">
                    <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow);">VERIFICATION RECORD</div>
                    <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981; border-color: rgba(16, 185, 129, 0.3);">ACTIVE CITIZEN</span>
                  </div>

                  <div style="display: flex; gap: 1rem; align-items: center; margin: 0.75rem 0;">
                    <div style="width: 70px; height: 70px; background: #fff; padding: 5px; border-radius: 8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;">
                      <div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div><div></div>
                      <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div></div>
                      <div></div><div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div>
                      <div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4;">
                      <div><strong>Hash:</strong> 0x9f8...a73e</div>
                      <div><strong>Quests:</strong> 96 Completed</div>
                      <div><strong>Tier Perk:</strong> VIP AMA & Merch Access</div>
                    </div>
                  </div>

                  <div style="font-size: 0.65rem; color: var(--text-muted); line-height: 1.3;">
                    This passport certifies active, verified status in the Booba (baby BNB) decentralized community. Non-transferable digital credential.
                  </div>

                  <div style="text-align: right; margin-top: 0.5rem;">
                    <span style="font-size: 0.65rem; color: var(--brand-yellow); cursor: pointer;" id="flipPassportBackBtn">Flip Back ↶</span>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- ACTIVE QUESTS PREVIEW -->
      <section style="padding: 4.5rem 0; background: rgba(14, 18, 27, 0.5); border-top: 1px solid var(--border-subtle);">
        <div class="container">
          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 1rem; margin-bottom: 2.5rem;">
            <div>
              <span class="badge-tag" style="margin-bottom: 0.5rem;">EARN BOOBA</span>
              <h2>Community Quests & Bounties</h2>
            </div>
            <a href="#dashboard/quests" class="btn btn-outline btn-sm">View All Quests →</a>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
            ${activeQuests.map(q => `
              <div class="quest-card">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
                    <span class="quest-category-badge cat-${q.category}">${q.category}</span>
                    <span class="quest-reward-pill">+${q.rewardBooba} BOOBA</span>
                  </div>
                  <h4 style="margin-bottom: 0.5rem;">${q.title}</h4>
                  <p style="font-size: 0.85rem; color: var(--text-secondary);">${q.description}</p>
                </div>
                <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">🕒 ${q.deadline}</span>
                  <a href="#dashboard/quests" class="btn btn-secondary btn-sm">${q.actionText}</a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- GOOGLE-STANDARD LEADERBOARD SHOWCASE -->
      <section style="padding: 5rem 0; position: relative;">
        <div class="container">
          
          <div style="text-align: center; max-width: 650px; margin: 0 auto 2.5rem auto;">
            <span class="badge-tag" style="margin-bottom: 0.75rem;">🏆 HALL OF FAME</span>
            <h2>Top <span class="text-gradient-gold">Booba Legends</span></h2>
            <p>Real-time community rankings of top questers, content creators, and Baby BNB ambassadors.</p>
            
            <!-- Timeframe Segmented Switcher -->
            <div style="margin-top: 1.5rem;">
              <div class="leaderboard-segmented-control">
                <button type="button" class="leaderboard-segment-btn active">🌟 All-Time</button>
                <button type="button" class="leaderboard-segment-btn">⚡ This Week</button>
                <button type="button" class="leaderboard-segment-btn">🔥 Monthly Sprint</button>
              </div>
            </div>
          </div>

          <!-- TOP 3 PODIUM CARDS -->
          <div class="podium-grid">
            
            <!-- Rank 2 (Silver) -->
            ${topLeaderboard[1] ? `
              <div class="podium-card podium-rank-2">
                <div class="podium-avatar-wrapper">
                  <img src="${topLeaderboard[1].avatar || 'assets/mascot.jpg'}" class="podium-avatar" style="border-color: #C0C0C0;" alt="Rank 2">
                  <div class="podium-rank-badge" style="background: #E0E0E0; color: #000;">2</div>
                </div>
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.15rem;">
                  @${topLeaderboard[1].username}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                  ${topLeaderboard[1].passportId} • ${calculateLevel(topLeaderboard[1].boobaPoints).title}
                </div>
                <div class="quest-reward-pill" style="font-size: 0.9rem; margin-bottom: 0.5rem;">
                  🍼 ${topLeaderboard[1].boobaPoints.toLocaleString()} BOOBA
                </div>
                <div style="font-size: 0.75rem; color: var(--accent-emerald);">⭐ ${topLeaderboard[1].reputation || 95}/100 Trust</div>
              </div>
            ` : ''}

            <!-- Rank 1 (Gold Champion) -->
            ${topLeaderboard[0] ? `
              <div class="podium-card podium-rank-1">
                <div class="podium-crown">👑</div>
                <div class="podium-avatar-wrapper">
                  <img src="${topLeaderboard[0].avatar || 'assets/mascot.jpg'}" class="podium-avatar" alt="Rank 1 Champion">
                  <div class="podium-rank-badge" style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000;">1</div>
                </div>
                <div class="badge-tag" style="margin-bottom: 0.4rem; background: rgba(243, 186, 47, 0.2); color: var(--brand-yellow); border-color: var(--brand-yellow);">
                  GRANDMASTER
                </div>
                <div style="font-weight: 800; font-size: 1.35rem; color: #FFFFFF; margin-bottom: 0.15rem;">
                  @${topLeaderboard[0].username}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                  ${topLeaderboard[0].passportId} • ${calculateLevel(topLeaderboard[0].boobaPoints).title}
                </div>
                <div class="quest-reward-pill" style="font-size: 1.05rem; padding: 0.4rem 1rem; margin-bottom: 0.6rem; border-color: var(--brand-yellow);">
                  🍼 ${topLeaderboard[0].boobaPoints.toLocaleString()} BOOBA
                </div>
                <div style="font-size: 0.8rem; color: var(--accent-emerald); font-weight: 700;">⭐ ${topLeaderboard[0].reputation || 99}/100 Reputation</div>
              </div>
            ` : ''}

            <!-- Rank 3 (Bronze) -->
            ${topLeaderboard[2] ? `
              <div class="podium-card podium-rank-3">
                <div class="podium-avatar-wrapper">
                  <img src="${topLeaderboard[2].avatar || 'assets/mascot.jpg'}" class="podium-avatar" style="border-color: #CD7F32;" alt="Rank 3">
                  <div class="podium-rank-badge" style="background: #CD7F32; color: #FFF;">3</div>
                </div>
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.15rem;">
                  @${topLeaderboard[2].username}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                  ${topLeaderboard[2].passportId} • ${calculateLevel(topLeaderboard[2].boobaPoints).title}
                </div>
                <div class="quest-reward-pill" style="font-size: 0.9rem; margin-bottom: 0.5rem;">
                  🍼 ${topLeaderboard[2].boobaPoints.toLocaleString()} BOOBA
                </div>
                <div style="font-size: 0.75rem; color: var(--accent-emerald);">⭐ ${topLeaderboard[2].reputation || 91}/100 Trust</div>
              </div>
            ` : ''}

          </div>

          <!-- RANKS 4-5 LIST CARD -->
          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-lg); max-width: 960px; margin: 0 auto; box-sizing: border-box; width: 100%; overflow: hidden;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1.25rem; letter-spacing: 0.05em;">
              Runner-Up Champions
            </div>

            <div class="runner-ups-list">
              ${topLeaderboard.slice(3).map((u, index) => {
                const level = calculateLevel(u.boobaPoints);
                return `
                  <div class="runner-up-item">
                    <div class="flex items-center gap-3" style="min-width: 0;">
                      <span class="rank-badge rank-sub">${index + 4}</span>
                      <img src="${u.avatar || 'assets/mascot.jpg'}" class="runner-up-avatar" alt="${u.username}">
                      <div style="min-width: 0; overflow: hidden;">
                        <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                          @${u.username}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                          ${u.passportId} • <span style="color: var(--brand-yellow);">${level.title}</span>
                        </div>
                      </div>
                    </div>

                    <div style="text-align: right; flex-shrink: 0; margin-left: 0.75rem;">
                      <div class="text-mono" style="font-weight: 800; color: var(--brand-yellow); font-size: 1.05rem;">
                        ${u.boobaPoints.toLocaleString()} 🍼
                      </div>
                      <div style="font-size: 0.72rem; color: var(--accent-emerald);">
                        ⭐ ${u.reputation || 90}/100 Trust
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 1rem; margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
              <div style="font-size: 0.85rem; color: var(--text-secondary);">
                Want to climb the ranks? Mint your passport and start completing community quests.
              </div>
              <a href="#dashboard/leaderboard" class="btn btn-primary btn-sm" style="width: auto;">
                View Full Top 100 Leaderboard →
              </a>
            </div>
          </div>

        </div>
      </section>

      <!-- COMMUNITY & JOIN CTA BANNER -->
      <section style="padding: 4.5rem 0; background: linear-gradient(180deg, transparent 0%, rgba(243, 186, 47, 0.06) 100%);">
        <div class="container">
          <div class="glass-panel" style="padding: 3rem 2rem; border-radius: var(--radius-xl); border: 1px solid rgba(243, 186, 47, 0.3); text-align: center; max-width: 900px; margin: 0 auto; position: relative; overflow: hidden;">
            <div style="position: relative; z-index: 2;">
              <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--brand-yellow); margin-bottom: 1.25rem; box-shadow: 0 0 25px var(--brand-yellow-glow);">
              <h2 style="margin-bottom: 1rem;">Ready to Claim Your <span class="text-gradient-gold">Booba Passport?</span></h2>
              <p style="font-size: 1.05rem; max-width: 580px; margin: 0 auto 2rem auto;">
                Join thousands of baby BNB holders. Complete quests, build verified reputation, and unlock the next frontier of gamified crypto rewards.
              </p>
              <div class="flex items-center justify-center gap-4" style="flex-wrap: wrap;">
                <a href="#signup" class="btn btn-primary btn-lg">Mint Passport Now</a>
                <a href="https://t.me/boobababybnb" target="_blank" class="btn btn-secondary btn-lg">Join Telegram 💬</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  attachHomeListeners() {
    // Passport 3D Flip
    const card = document.getElementById('spotlightPassportCard');
    const flipFront = document.getElementById('flipPassportBtn');
    const flipBack = document.getElementById('flipPassportBackBtn');

    if (card) {
      card.addEventListener('click', () => card.classList.toggle('flipped'));
      flipFront?.addEventListener('click', (e) => { e.stopPropagation(); card.classList.add('flipped'); });
      flipBack?.addEventListener('click', (e) => { e.stopPropagation(); card.classList.remove('flipped'); });
    }
  }

  /* --------------------------------------------------------------------------
     3. USER DASHBOARD VIEW (Google Developer & Cloud Console Standard)
     -------------------------------------------------------------------------- */
  getDashboardHTML(state) {
    const user = state.currentUser;
    const userLevel = calculateLevel(user.boobaPoints);
    const tabTitles = {
      overview: 'Overview',
      passport: 'My Passport',
      quests: 'Quests & Bounties',
      rewards: 'BOOBA Vault',
      referrals: 'Referrals',
      achievements: 'Achievements',
      leaderboard: 'Leaderboard',
      settings: 'Settings & Cloud'
    };
    const currentTabTitle = tabTitles[this.activeDashboardTab] || 'Overview';

    return `
      <div class="dashboard-shell" id="dashboardShell">
        
        <!-- GOOGLE-STYLE MINIMALIST NAVIGATION DRAWER -->
        <aside class="dashboard-drawer" id="dashboardDrawer">
          <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
            
            <div>
              <!-- User Identification Header -->
              <div style="padding: 0 0.5rem 1.25rem 0.5rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.5rem;">
                <div class="flex items-center gap-3">
                  <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--border-medium);">
                  <div class="nav-item-text" style="overflow: hidden;">
                    <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                      @${user.username}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--brand-yellow); font-family: var(--font-mono);">
                      ${user.passportId}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Clean Google Navigation Links -->
              <ul class="dashboard-nav-list">
                <li class="nav-section-title">Get Started</li>
                <li>
                  <a href="#dashboard/overview" class="dashboard-nav-item ${this.activeDashboardTab === 'overview' ? 'active' : ''}">
                    <span class="nav-item-text">Overview</span>
                  </a>
                </li>

                <li class="nav-section-title">Passport & Identity</li>
                <li>
                  <a href="#dashboard/passport" class="dashboard-nav-item ${this.activeDashboardTab === 'passport' ? 'active' : ''}">
                    <span class="nav-item-text">My Passport</span>
                  </a>
                </li>
                <li>
                  <a href="#dashboard/quests" class="dashboard-nav-item ${this.activeDashboardTab === 'quests' ? 'active' : ''}">
                    <span class="nav-item-text">Quests & Bounties</span>
                  </a>
                </li>

                <li class="nav-section-title">Rewards & Growth</li>
                <li>
                  <a href="#dashboard/rewards" class="dashboard-nav-item ${this.activeDashboardTab === 'rewards' ? 'active' : ''}">
                    <span class="nav-item-text">BOOBA Vault</span>
                  </a>
                </li>
                <li>
                  <a href="#dashboard/referrals" class="dashboard-nav-item ${this.activeDashboardTab === 'referrals' ? 'active' : ''}">
                    <span class="nav-item-text">Referrals</span>
                  </a>
                </li>
                <li>
                  <a href="#dashboard/achievements" class="dashboard-nav-item ${this.activeDashboardTab === 'achievements' ? 'active' : ''}">
                    <span class="nav-item-text">Achievements</span>
                  </a>
                </li>

                <li class="nav-section-title">Community & System</li>
                <li>
                  <a href="#dashboard/leaderboard" class="dashboard-nav-item ${this.activeDashboardTab === 'leaderboard' ? 'active' : ''}">
                    <span class="nav-item-text">Leaderboard</span>
                  </a>
                </li>
                <li>
                  <a href="#dashboard/settings" class="dashboard-nav-item ${this.activeDashboardTab === 'settings' ? 'active' : ''}">
                    <span class="nav-item-text">Settings</span>
                  </a>
                </li>
              </ul>
            </div>

            <!-- Bottom Drawer Collapse Button (Google Docs Style) -->
            <div style="padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
              <div class="drawer-user-meta" style="font-size: 0.75rem; color: var(--text-muted);">
                Level ${userLevel.level} • ${userLevel.title}
              </div>
              <button type="button" id="dashDrawerCollapseBtn" style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                ◀
              </button>
            </div>

          </div>
        </aside>

        <!-- MAIN DASHBOARD CONTENT AREA -->
        <div class="dashboard-main-wrapper">
          
          <!-- GOOGLE-STYLE MOBILE SUB-NAVIGATION TABS (Mobile/Tablet Only) -->
          <nav class="dashboard-mobile-nav-bar" aria-label="Dashboard Tabs">
            <div class="dashboard-mobile-nav-scroll">
              <a href="#dashboard/overview" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'overview' ? 'active' : ''}">Overview</a>
              <a href="#dashboard/passport" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'passport' ? 'active' : ''}">Passport</a>
              <a href="#dashboard/quests" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'quests' ? 'active' : ''}">Quests</a>
              <a href="#dashboard/rewards" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'rewards' ? 'active' : ''}">Vault</a>
              <a href="#dashboard/referrals" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'referrals' ? 'active' : ''}">Referrals</a>
              <a href="#dashboard/achievements" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'achievements' ? 'active' : ''}">Achievements</a>
              <a href="#dashboard/leaderboard" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'leaderboard' ? 'active' : ''}">Leaderboard</a>
              <a href="#dashboard/settings" class="dashboard-mobile-tab-btn ${this.activeDashboardTab === 'settings' ? 'active' : ''}">Settings</a>
            </div>
          </nav>

          <!-- DASHBOARD TAB CONTENT -->
          <div class="dashboard-content-container">
            ${this.renderDashboardTabContent(state)}
          </div>

        </div>

      </div>
    `;
  }

  renderDashboardTabContent(state) {
    const tab = this.activeDashboardTab;
    const user = state.currentUser;
    const userLevel = calculateLevel(user.boobaPoints);

    if (tab === 'passport') {
      return `
        <div>
          <!-- Google Information Banner -->
          <div class="google-info-banner">
            <strong>Booba Passport Active:</strong> Your digital soulbound passport ID <strong>${user.passportId}</strong> is verified on BNB Chain. Level ${userLevel.level} tier status unlocks priority community perks and upcoming airdrop tiers.
          </div>

          <div class="flex items-center justify-between" style="margin-bottom: 1.75rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Booba Passport</h1>
              <p style="font-size: 0.9rem; color: var(--text-secondary);">Digital identity, reputation record, and verifiable credentials inside Baby BNB.</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="sharePassportBtn" class="btn btn-secondary btn-sm">
                Share to X
              </button>
              <button id="downloadPassportBtn" class="btn btn-outline btn-sm">
                Download Passport
              </button>
            </div>
          </div>

          <!-- 3D Flippable Passport Card -->
          <div class="passport-container" style="max-width: 460px; margin: 0 auto 3rem auto;">
            <div class="passport-card-3d" id="myPassportCard">
              
              <!-- Front -->
              <div class="passport-face passport-front" style="min-height: 280px;">
                <div class="passport-top-row">
                  <div class="passport-emblem">
                    <img src="assets/mascot.jpg" class="passport-emblem-icon">
                    <div>
                      <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow); letter-spacing: 0.06em;">BOOBA PASSPORT</div>
                      <div style="font-size: 0.6rem; color: var(--text-muted);">BABY BNB DIGITAL IDENTITY</div>
                    </div>
                  </div>
                  <div class="passport-chip"></div>
                </div>

                <div class="passport-body">
                  <img src="${user.avatar || 'assets/mascot.jpg'}" class="passport-user-avatar">
                  <div class="passport-info-grid">
                    <div class="passport-username">
                      <span>@${user.username}</span>
                      <span style="color: var(--brand-yellow); font-size: 0.85rem;">✓</span>
                    </div>
                    <div class="passport-id-badge">ID: ${user.passportId}</div>
                    <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.25rem;">
                      Level ${userLevel.level} — <strong style="color: var(--brand-yellow);">${userLevel.title}</strong>
                    </div>
                  </div>
                </div>

                <div class="passport-metrics-strip">
                  <div class="passport-metric-item">
                    <div class="passport-metric-label">BOOBA Points</div>
                    <div class="passport-metric-value text-gold">${user.boobaPoints.toLocaleString()}</div>
                  </div>
                  <div class="passport-metric-item">
                    <div class="passport-metric-label">Reputation</div>
                    <div class="passport-metric-value">${user.reputation || 91} / 100</div>
                  </div>
                  <div class="passport-metric-item">
                    <div class="passport-metric-label">Referrals</div>
                    <div class="passport-metric-value">${user.verifiedReferralsCount || 0} Verified</div>
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: var(--text-muted); margin-top: 0.5rem;">
                  <span>ISSUED: ${user.memberSince.toUpperCase()}</span>
                  <span style="color: var(--brand-yellow); cursor: pointer;" id="myPassportFlipBtn">Click card to Flip ↷</span>
                </div>
              </div>

              <!-- Back -->
              <div class="passport-face passport-back" style="min-height: 280px;">
                <div class="passport-top-row">
                  <div style="font-size: 0.75rem; font-weight: 800; color: var(--brand-yellow);">SECURITY CREDENTIALS</div>
                  <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">VERIFIED PASSPORT</span>
                </div>

                <div style="display: flex; gap: 1.25rem; align-items: center; margin: 1rem 0;">
                  <div style="width: 70px; height: 70px; background: #fff; padding: 5px; border-radius: 6px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;">
                    <div style="background: #000;"></div><div style="background: #000;"></div><div></div><div style="background: #000;"></div>
                    <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div></div>
                    <div></div><div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div>
                    <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div style="background: #000;"></div>
                  </div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5;">
                    <div><strong>Wallet:</strong> ${user.walletAddress || '0x71C...49b2'}</div>
                    <div><strong>Quests Done:</strong> ${user.completedQuestsCount || 0}</div>
                    <div><strong>Current Streak:</strong> ${user.streakDays || 1} Days</div>
                  </div>
                </div>

                <div style="font-size: 0.68rem; color: var(--text-muted);">
                  The Booba Passport is your immutable digital soulbound credential. All rights reserved by Baby BNB ecosystem.
                </div>

                <div style="text-align: right; margin-top: 0.75rem;">
                  <span style="font-size: 0.68rem; color: var(--brand-yellow); cursor: pointer;" id="myPassportFlipBackBtn">Flip to Front ↶</span>
                </div>
              </div>

            </div>
          </div>

          <!-- Unlocked Badges Section (Clean Google Standard) -->
          <div style="margin-top: 3rem;">
            <div style="margin-bottom: 1.25rem;">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Unlocked Badges & Insignias</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary);">Earned milestones on your Booba journey.</p>
            </div>
            
            <div class="achievements-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
              ${(user.badges || ['Pioneer', 'Baby BNB OG']).map(b => `
                <div class="google-card" style="padding: 1.1rem 1.25rem; display: flex; align-items: center; justify-content: space-between;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${b}</div>
                    <div style="font-size: 0.72rem; color: var(--accent-emerald); margin-top: 0.2rem;">Verified ✓</div>
                  </div>
                  <span style="font-size: 1.25rem;">🎖️</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (tab === 'quests') {
      const filteredQuests = this.activeQuestFilter === 'all' 
        ? state.quests 
        : state.quests.filter(q => q.category === this.activeQuestFilter);

      return `
        <div>
          <div class="google-info-banner">
            <strong>Bounties & Task Verification:</strong> Submit proofs for completed tasks to earn verified BOOBA points and level up your passport credentials.
          </div>

          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 1rem; margin-bottom: 1.75rem;">
            <div>
              <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Community Quests</h1>
              <p style="font-size: 0.9rem; color: var(--text-secondary);">Explore official ecosystem tasks and contribution bounties.</p>
            </div>
            <div class="quest-reward-pill text-mono" style="font-size: 0.85rem;">
              Balance: ${user.boobaPoints.toLocaleString()} BOOBA
            </div>
          </div>

          <!-- Category Filter Tabs -->
          <div class="flex items-center gap-2" style="flex-wrap: wrap; margin-bottom: 1.75rem;">
            ${['all', 'daily', 'social', 'community', 'creative', 'special'].map(cat => `
              <button class="btn btn-sm ${this.activeQuestFilter === cat ? 'btn-primary' : 'btn-secondary'} quest-filter-btn" data-category="${cat}" style="font-size: 0.8rem; text-transform: capitalize;">
                ${cat === 'all' ? 'All Bounties' : cat}
              </button>
            `).join('')}
          </div>

          <!-- Quests Grid - Full Width Auto Distributing -->
          <div class="quests-grid">
            ${filteredQuests.map(q => `
              <div class="google-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
                    <span class="badge-tag" style="font-size: 0.72rem;">${q.category}</span>
                    <span class="text-mono" style="font-size: 0.85rem; font-weight: 700; color: var(--brand-yellow);">+${q.rewardBooba} BOOBA</span>
                  </div>
                  <h3 style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.4rem;">${q.title}</h3>
                  <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.85rem; line-height: 1.45;">${q.description}</p>
                  <div style="font-size: 0.75rem; color: var(--text-muted); background: var(--bg-input); padding: 0.5rem 0.75rem; border-radius: var(--radius-xs); border: 1px solid var(--border-subtle);">
                    <strong>Requirement:</strong> ${q.requirements}
                  </div>
                </div>

                <div style="margin-top: 1.25rem; display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle);">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">Deadline: ${q.deadline}</span>
                  <button class="btn btn-secondary btn-sm quest-action-btn" data-id="${q.id}" data-type="${q.type}" data-title="${q.title}" data-reward="${q.rewardBooba}" style="font-size: 0.8rem;">
                    ${q.actionText}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (tab === 'rewards') {
      return `
        <div>
          <div class="google-info-banner">
            <strong>Token Distribution Vault:</strong> BOOBA tokens grant upcoming airdrop allocation multipliers and governance voting power.
          </div>

          <div style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">BOOBA Vault</h1>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Your token balance, allocation tier multipliers, and level unlocks.</p>
          </div>

          <div class="metric-cards-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
            <div class="google-card">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">BOOBA Balance</div>
              <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${user.boobaPoints.toLocaleString()}
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem;">Active & Verified</div>
            </div>

            <div class="google-card">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Airdrop Multiplier</div>
              <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">
                ${(1 + (userLevel.level * 0.25)).toFixed(2)}x
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Based on Level ${userLevel.level}</div>
            </div>

            <div class="google-card">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Reputation Trust</div>
              <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--accent-emerald); margin-top: 0.25rem;">
                ${user.reputation || 91} / 100
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem;">Tier 1 Verified Citizen</div>
            </div>
          </div>

          <div style="margin-top: 1rem;">
            <div style="margin-bottom: 1.25rem;">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Level Unlock Hierarchy</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary);">Progression perks, multiplier boosts, and governance access across all 10 ranks.</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.6rem;">
              ${LEVEL_TIERS.map(tier => {
                const isUnlocked = user.boobaPoints >= tier.min;
                const isCurrent = userLevel.level === tier.level;
                return `
                  <div class="google-card" style="padding: 0.9rem 1.25rem; display: flex; align-items: center; justify-content: space-between; ${isCurrent ? 'border-color: var(--brand-yellow); background: rgba(243, 186, 47, 0.05);' : ''}">
                    <div class="flex items-center gap-3">
                      <span class="badge-tag" style="${isCurrent ? 'background: var(--brand-yellow); color: #000;' : ''}">
                        Lvl ${tier.level}
                      </span>
                      <div>
                        <div style="font-weight: 600; font-size: 0.9rem; color: ${isCurrent ? 'var(--brand-yellow)' : 'var(--text-primary)'};">
                          ${tier.title} ${isCurrent ? '(Current Level)' : ''}
                        </div>
                        <div style="font-size: 0.78rem; color: var(--text-secondary);">${tier.unlock}</div>
                      </div>
                    </div>
                    <div class="text-mono" style="font-size: 0.825rem; font-weight: 700; color: ${isUnlocked ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                      ${tier.min.toLocaleString()}+ BOOBA ${isUnlocked ? '✓' : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (tab === 'referrals') {
      const userReferrals = state.referrals.filter(r => r.referrerUsername.toLowerCase() === user.username.toLowerCase());
      const verifiedCount = userReferrals.filter(r => r.status === 'verified').length;
      const pendingCount = userReferrals.filter(r => r.status === 'pending').length;
      const totalEarned = userReferrals.reduce((sum, r) => sum + (r.rewardClaimed || 0), 0);
      const inviteUrl = `https://booba.crypto/invite/${user.referralCode || user.username.toUpperCase()}`;

      return `
        <div>
          <div class="google-info-banner">
            <strong>Referral System:</strong> Earn <strong>+300 BOOBA</strong> for every member who mints a verified Passport using your invite link.
          </div>

          <div style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Referrals</h1>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Track invited community members, verification states, and rewards.</p>
          </div>

          <div style="margin-bottom: 2rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.05em;">Your Referral URL</div>
            <div class="flex items-center gap-3" style="flex-wrap: wrap;">
              <input type="text" readonly value="${inviteUrl}" id="userReferralLinkInput" class="form-input" style="flex: 1; min-width: 260px; font-family: var(--font-mono); font-weight: 600; color: var(--brand-yellow);">
              <button id="copyRefLinkBtn" class="btn btn-primary btn-sm">
                Copy URL
              </button>
              <button id="shareRefXBtn" class="btn btn-secondary btn-sm">
                Share to X
              </button>
            </div>
          </div>

          <div class="metric-cards-grid" style="grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));">
            <div class="google-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Total Clicks</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">
                ${userReferrals.length + 12}
              </div>
            </div>
            <div class="google-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Verified Members</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 700; color: var(--accent-emerald); margin-top: 0.25rem;">
                ${verifiedCount + (user.verifiedReferralsCount || 0)}
              </div>
            </div>
            <div class="google-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Pending</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 700; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${pendingCount}
              </div>
            </div>
            <div class="google-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">BOOBA Earned</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 700; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${(totalEarned + (user.verifiedReferralsCount || 0) * 300).toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <div style="margin-bottom: 1rem;">
              <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Invited Members</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary);">Direct record of community members registered with your code.</p>
            </div>
            <div class="table-container">
              <table class="leaderboard-table">
                <thead>
                  <tr style="color: var(--text-muted); font-size: 0.78rem; text-align: left; background: var(--bg-surface-elevated);">
                    <th style="padding: 0.75rem 1rem;">MEMBER</th>
                    <th style="padding: 0.75rem 1rem;">JOINED</th>
                    <th style="padding: 0.75rem 1rem;">STATUS</th>
                    <th style="padding: 0.75rem 1rem; text-align: right;">REWARD</th>
                  </tr>
                </thead>
                <tbody>
                  ${userReferrals.length > 0 ? userReferrals.map(ref => `
                    <tr class="leaderboard-row">
                      <td class="leaderboard-cell">
                        <div style="font-weight: 600;">@${ref.referredUsername}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${ref.passportId}</div>
                      </td>
                      <td class="leaderboard-cell" style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${ref.joinedDate}
                      </td>
                      <td class="leaderboard-cell">
                        <span class="badge-tag" style="${ref.status === 'verified' ? 'background: rgba(16, 185, 129, 0.15); color: #10B981;' : 'background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow);'}">
                          ${ref.status === 'verified' ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td class="leaderboard-cell text-mono" style="text-align: right; font-weight: 600; color: ${ref.status === 'verified' ? 'var(--brand-yellow)' : 'var(--text-muted)'};">
                        +${ref.status === 'verified' ? 300 : 0} BOOBA
                      </td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        No referrals yet. Share your invite link above to start earning +300 BOOBA per member.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    if (tab === 'achievements') {
      const completedCount = state.achievements.filter(a => a.completed).length;
      const totalCount = state.achievements.length;
      const completionPercent = Math.round((completedCount / totalCount) * 100);

      return `
        <div>
          <div class="google-info-banner">
            <strong>Milestone Badges & Trophy Room:</strong> Permanent ecosystem credentials acknowledging your accomplishments in Baby BNB. (${completedCount}/${totalCount} Unlocked • ${completionPercent}%)
          </div>

          <div class="flex items-center justify-between" style="margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Achievements & Trophies</h1>
              <p style="font-size: 0.9rem; color: var(--text-secondary);">Earn prestigious milestone badges and boost your soulbound passport trust rank.</p>
            </div>
            <div class="quest-reward-pill text-mono" style="font-size: 0.85rem;">
              Unlocked: ${completedCount} / ${totalCount} (${completionPercent}%)
            </div>
          </div>

          <!-- Achievements Grid - Fills Full Width Across Columns and Flows to Next Rows -->
          <div class="achievements-grid">
            ${state.achievements.map(ach => `
              <div class="google-card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: ${ach.completed ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}; background: ${ach.completed ? 'rgba(16, 185, 129, 0.03)' : 'var(--bg-surface)'};">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
                    <div style="font-size: 1.75rem;">${ach.icon || '🏆'}</div>
                    <span class="text-mono" style="font-size: 0.8rem; color: var(--brand-yellow); font-weight: 700;">+${ach.rewardBooba} BOOBA</span>
                  </div>
                  <h4 style="font-weight: 700; font-size: 1rem; color: var(--text-primary); margin-bottom: 0.35rem;">${ach.title}</h4>
                  <p style="font-size: 0.825rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 1rem;">${ach.desc}</p>
                </div>
                <div class="flex items-center justify-between" style="font-size: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle);">
                  <span style="color: ${ach.completed ? 'var(--accent-emerald)' : 'var(--text-muted)'}; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                    ${ach.completed ? '✅ Unlocked' : ach.progress ? `⏳ Progress: ${ach.progress}` : '🔒 In Progress'}
                  </span>
                  ${ach.completed ? '<span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.65rem;">Claimed</span>' : `<span class="badge-tag" style="opacity: 0.6; font-size: 0.65rem;">Locked</span>`}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (tab === 'leaderboard') {
      const sortedUsers = [...state.users].sort((a, b) => b.boobaPoints - a.boobaPoints);

      return `
        <div>
          <div class="google-info-banner">
            <strong>Leaderboard Rank:</strong> Global rankings calculated by total BOOBA points and verified contributions.
          </div>

          <div style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Global Leaderboard</h1>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Top community contributors and ambassadors in the Baby BNB universe.</p>
          </div>

          <!-- Top 3 Podium Showcase -->
          <div class="podium-grid">
            <!-- Rank 2 -->
            ${sortedUsers[1] ? `
              <div class="podium-card podium-rank-2">
                <div class="podium-avatar-wrapper">
                  <img src="${sortedUsers[1].avatar || 'assets/mascot.jpg'}" class="podium-avatar">
                  <div class="podium-rank-badge" style="background: #C0C0C0; color: #000;">2</div>
                </div>
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">@${sortedUsers[1].username}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${sortedUsers[1].passportId}</div>
                <div class="text-mono" style="font-size: 1.25rem; font-weight: 800; color: #C0C0C0; margin-top: 0.5rem;">
                  ${sortedUsers[1].boobaPoints.toLocaleString()} BOOBA
                </div>
              </div>
            ` : ''}

            <!-- Rank 1 -->
            ${sortedUsers[0] ? `
              <div class="podium-card podium-rank-1">
                <div class="podium-crown">👑</div>
                <div class="podium-avatar-wrapper">
                  <img src="${sortedUsers[0].avatar || 'assets/mascot.jpg'}" class="podium-avatar">
                  <div class="podium-rank-badge" style="background: var(--brand-yellow); color: #000;">1</div>
                </div>
                <div style="font-weight: 800; font-size: 1.2rem; color: var(--brand-yellow);">@${sortedUsers[0].username}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${sortedUsers[0].passportId}</div>
                <div class="text-mono text-gold" style="font-size: 1.5rem; font-weight: 800; margin-top: 0.5rem;">
                  ${sortedUsers[0].boobaPoints.toLocaleString()} BOOBA
                </div>
                <span class="badge-tag" style="margin-top: 0.5rem; background: var(--brand-yellow); color: #000;">Reign Leader</span>
              </div>
            ` : ''}

            <!-- Rank 3 -->
            ${sortedUsers[2] ? `
              <div class="podium-card podium-rank-3">
                <div class="podium-avatar-wrapper">
                  <img src="${sortedUsers[2].avatar || 'assets/mascot.jpg'}" class="podium-avatar">
                  <div class="podium-rank-badge" style="background: #CD7F32; color: #000;">3</div>
                </div>
                <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">@${sortedUsers[2].username}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${sortedUsers[2].passportId}</div>
                <div class="text-mono" style="font-size: 1.25rem; font-weight: 800; color: #CD7F32; margin-top: 0.5rem;">
                  ${sortedUsers[2].boobaPoints.toLocaleString()} BOOBA
                </div>
              </div>
            ` : ''}
          </div>

          <div class="table-container">
            <table class="leaderboard-table">
              <thead>
                <tr style="color: var(--text-muted); font-size: 0.78rem; text-align: left; background: var(--bg-surface-elevated);">
                  <th style="padding: 0.75rem 1rem; width: 60px;">RANK</th>
                  <th style="padding: 0.75rem 1rem;">MEMBER & PASSPORT</th>
                  <th style="padding: 0.75rem 1rem;">REPUTATION</th>
                  <th style="padding: 0.75rem 1rem; text-align: right;">TOTAL BOOBA</th>
                </tr>
              </thead>
              <tbody>
                ${sortedUsers.map((u, index) => {
                  const isUser = u.id === user.id;
                  const level = calculateLevel(u.boobaPoints);
                  return `
                    <tr class="leaderboard-row" style="${isUser ? 'border: 1px solid var(--brand-yellow); background: rgba(243, 186, 47, 0.08);' : ''}">
                      <td class="leaderboard-cell" style="text-align: center; font-weight: 700; color: var(--text-muted);">
                        ${index + 1}
                      </td>
                      <td class="leaderboard-cell">
                        <div class="flex items-center gap-3">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-medium);">
                          <div>
                            <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
                              @${u.username} ${isUser ? '<span class="badge-tag" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;">YOU</span>' : ''}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${u.passportId} • ${level.title}</div>
                          </div>
                        </div>
                      </td>
                      <td class="leaderboard-cell">
                        <span class="badge-tag" style="background: rgba(16, 185, 129, 0.12); color: #10B981;">
                          ${u.reputation || 90} / 100
                        </span>
                      </td>
                      <td class="leaderboard-cell" style="text-align: right;">
                        <div class="text-mono" style="font-weight: 700; color: var(--brand-yellow); font-size: 1.05rem;">
                          ${u.boobaPoints.toLocaleString()}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${u.completedQuestsCount || 0} quests • ${u.verifiedReferralsCount || 0} refs</div>
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

    if (tab === 'settings') {
      return `
        <div>
          <div class="google-info-banner">
            <strong>Account Security:</strong> Your Booba Passport <strong>${user.passportId}</strong> is bound to wallet <strong>${user.walletAddress || '0x71C...49b2'}</strong> on BNB Chain.
          </div>

          <div style="margin-bottom: 2rem;">
            <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.25rem;">Account Settings</h1>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Manage your profile details, connected Web3 wallet, and privacy preferences.</p>
          </div>

          <div style="margin-bottom: 2.5rem; max-width: 650px;">
            <div style="padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 1.5rem;">
              <h3 style="font-size: 1.2rem; font-weight: 700;">Profile Information</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Public identification details associated with your Booba Passport.</p>
            </div>
            
            <form id="userProfileSettingsForm" style="display: flex; flex-direction: column; gap: 1.25rem;">
              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Passport ID</label>
                <input type="text" readonly value="${user.passportId}" class="form-input text-mono" style="opacity: 0.7; background: var(--bg-input); font-weight: 700; color: var(--brand-yellow);">
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Username</label>
                <input type="text" readonly value="@${user.username}" class="form-input" style="opacity: 0.7; background: var(--bg-input);">
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Display Name</label>
                <input type="text" id="settingsDisplayName" value="${user.username}" placeholder="Enter your display name" class="form-input">
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Email Address</label>
                <input type="email" id="settingsEmail" value="${user.email || user.username + '@gmail.com'}" class="form-input">
              </div>

              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem;">Connected Web3 Wallet (BNB Chain)</label>
                <div class="flex items-center gap-2">
                  <input type="text" readonly value="${user.walletAddress || '0x71C...49b2'}" class="form-input text-mono" style="flex: 1; opacity: 0.85;">
                  <span class="badge-tag" style="background: rgba(16, 185, 129, 0.12); color: #10B981; font-size: 0.75rem;">Connected</span>
                </div>
              </div>

              <div style="margin-top: 0.5rem;">
                <button type="submit" class="btn btn-primary btn-sm">Save Profile Changes</button>
              </div>
            </form>
          </div>

          <div style="max-width: 650px;">
            <div style="padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 1.5rem;">
              <h3 style="font-size: 1.2rem; font-weight: 700;">Privacy & Preferences</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Manage your visibility across public leaderboards and alert preferences.</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <div class="flex items-center justify-between" style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle);">
                <div>
                  <div style="font-weight: 600; font-size: 0.9rem;">Public Passport Record</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">Allow other community members to view your passport badges and level.</div>
                </div>
                <input type="checkbox" checked style="accent-color: var(--brand-yellow); width: 18px; height: 18px; cursor: pointer;">
              </div>

              <div class="flex items-center justify-between" style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle);">
                <div>
                  <div style="font-weight: 600; font-size: 0.9rem;">Global Leaderboard Visibility</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">Display your username and points on the Hall of Fame.</div>
                </div>
                <input type="checkbox" checked style="accent-color: var(--brand-yellow); width: 18px; height: 18px; cursor: pointer;">
              </div>

              <div class="flex items-center justify-between" style="padding: 0.75rem 0;">
                <div>
                  <div style="font-weight: 600; font-size: 0.9rem;">Bounty & Quest Alerts</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">Receive notifications when new high-reward community tasks drop.</div>
                </div>
                <input type="checkbox" checked style="accent-color: var(--brand-yellow); width: 18px; height: 18px; cursor: pointer;">
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Default Overview (Google Developer Standard)
    return `
      <div>
        
        <!-- Google Info Callout Banner -->
        <div class="google-info-banner">
          <strong>Booba Ecosystem Status:</strong> You are currently logged in as <strong>@${user.username}</strong> with Passport ID <strong>${user.passportId}</strong>. Complete community bounties to increase your tier rank and unlock token distribution weight.
        </div>

        <div style="margin-bottom: 2rem;">
          <h1 style="font-size: 1.85rem; font-weight: 700; margin-bottom: 0.35rem;">Overview</h1>
          <p style="font-size: 0.9rem; color: var(--text-secondary);">Summary of your passport progress, community bounties, and rewards balance.</p>
        </div>

        <!-- 4 Google-Standard Metric Cards -->
        <div class="metric-cards-grid">
          
          <div class="google-card">
            <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total BOOBA Points</span>
              <span class="badge-tag" style="background: rgba(16, 185, 129, 0.12); color: #10B981; font-size: 0.7rem;">+50 Claim Ready</span>
            </div>
            <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--brand-yellow); margin-bottom: 0.25rem;">
              ${user.boobaPoints.toLocaleString()}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Accrued Community Tokens</div>
          </div>

          <div class="google-card">
            <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Reputation Score</span>
              <span class="badge-tag" style="background: rgba(6, 182, 212, 0.12); color: #06B6D4; font-size: 0.7rem;">Top 5%</span>
            </div>
            <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">
              ${user.reputation || 91} / 100
            </div>
            <div style="font-size: 0.75rem; color: var(--accent-emerald);">High Trust Index</div>
          </div>

          <div class="google-card">
            <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Completed Quests</span>
              <span class="badge-tag" style="background: rgba(139, 92, 246, 0.12); color: #8B5CF6; font-size: 0.7rem;">Active</span>
            </div>
            <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--accent-cyan); margin-bottom: 0.25rem;">
              ${user.completedQuestsCount || 96}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Across All Categories</div>
          </div>

          <div class="google-card">
            <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Verified Referrals</span>
              <span class="badge-tag" style="background: rgba(243, 186, 47, 0.12); color: var(--brand-yellow); font-size: 0.7rem;">+12.6k Generated</span>
            </div>
            <div class="text-mono" style="font-size: 1.85rem; font-weight: 700; color: var(--accent-emerald); margin-bottom: 0.25rem;">
              ${user.verifiedReferralsCount || 42}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Verified Community Members</div>
          </div>

        </div>

        <!-- Tier Progression (Clean Google Standard) -->
        <div style="margin-bottom: 2.5rem;">
          <div class="flex items-center justify-between" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Tier Progression</div>
              <h3 style="font-size: 1.35rem; font-weight: 700; margin-top: 0.2rem;">
                Level ${userLevel.level} — <span style="color: var(--brand-yellow);">${userLevel.title}</span>
              </h3>
            </div>
            <div class="flex items-center gap-3">
              <button id="dashDailyCheckInBtn" class="btn btn-primary btn-sm">
                Claim Daily Bonus (+50)
              </button>
              <a href="#dashboard/passport" class="btn btn-secondary btn-sm">
                View Passport
              </a>
            </div>
          </div>

          <!-- Progression Bar -->
          <div style="height: 8px; background: var(--bg-surface-elevated); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--border-subtle); margin-bottom: 0.6rem;">
            <div style="width: ${userLevel.progressPercent}%; height: 100%; background: var(--brand-yellow); transition: width 0.4s ease;"></div>
          </div>
          <div class="flex items-center justify-between" style="font-size: 0.78rem; color: var(--text-muted);">
            <span>Progress: ${user.boobaPoints.toLocaleString()} / ${userLevel.nextTier ? userLevel.nextTier.min.toLocaleString() : 'MAX'} Points (${userLevel.progressPercent}%)</span>
            <span>Next Tier: ${userLevel.nextTier ? userLevel.nextTier.unlock : 'Max Rank Achieved'}</span>
          </div>
        </div>

        <!-- Recommended Bounties Section (Clean Google Standard) -->
        <div>
          <div class="flex items-center justify-between" style="margin-bottom: 1.25rem;">
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 700;">Recommended Bounties</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Tasks available for submission.</p>
            </div>
            <a href="#dashboard/quests" class="btn btn-ghost btn-sm">View All Bounties →</a>
          </div>

          <div class="quests-grid">
            ${state.quests.slice(0, 3).map(q => `
              <div class="google-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.5rem;">
                    <span class="badge-tag" style="font-size: 0.7rem;">${q.category}</span>
                    <span class="text-mono" style="font-size: 0.825rem; font-weight: 700; color: var(--brand-yellow);">+${q.rewardBooba} BOOBA</span>
                  </div>
                  <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.35rem;">${q.title}</h4>
                  <p style="font-size: 0.825rem; color: var(--text-secondary); line-height: 1.45;">${q.description}</p>
                </div>
                <div style="margin-top: 1.25rem; text-align: right;">
                  <button class="btn btn-secondary btn-sm quest-action-btn" data-id="${q.id}" data-type="${q.type}" data-title="${q.title}" data-reward="${q.rewardBooba}" style="font-size: 0.8rem;">
                    ${q.actionText}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    `;
  }

  attachDashboardListeners() {
    // Drawer Hamburger and Collapse Toggles
    const drawer = document.getElementById('dashboardDrawer');
    const hamburger = document.getElementById('dashHamburgerBtn');
    const collapseBtn = document.getElementById('dashDrawerCollapseBtn');

    const toggleDrawer = () => {
      if (window.innerWidth <= 900) {
        drawer?.classList.toggle('mobile-open');
      } else {
        drawer?.classList.toggle('collapsed');
      }
    };

    hamburger?.addEventListener('click', toggleDrawer);
    collapseBtn?.addEventListener('click', toggleDrawer);

    // Daily Check-in Buttons
    const handleDailyClaim = () => {
      const res = db.claimDailyCheckIn();
      if (res.success) {
        this.showToast(`Daily Check-in Claimed! +${res.bonus} BOOBA. Current streak: ${res.streak} days.`, 'success');
      }
    };

    document.getElementById('dashDailyCheckInBtn')?.addEventListener('click', handleDailyClaim);
    document.getElementById('topDailyCheckInBtn')?.addEventListener('click', handleDailyClaim);

    // Passport Flipping
    const myCard = document.getElementById('myPassportCard');
    if (myCard) {
      myCard.addEventListener('click', () => myCard.classList.toggle('flipped'));
      document.getElementById('myPassportFlipBtn')?.addEventListener('click', (e) => { e.stopPropagation(); myCard.classList.add('flipped'); });
      document.getElementById('myPassportFlipBackBtn')?.addEventListener('click', (e) => { e.stopPropagation(); myCard.classList.remove('flipped'); });
    }

    // Share & Download Passport
    document.getElementById('sharePassportBtn')?.addEventListener('click', () => {
      const u = db.getState().currentUser;
      const tweetText = encodeURIComponent(`I just minted my official Booba Passport (ID: ${u?.passportId}) in the @BoobaBabyBNB ecosystem! Level ${calculateLevel(u?.boobaPoints).level} ${calculateLevel(u?.boobaPoints).title}. Join me: https://booba.crypto/invite/${u?.username}`);
      window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
    });

    document.getElementById('downloadPassportBtn')?.addEventListener('click', () => {
      this.showToast('Booba Passport credential saved to downloads.', 'success');
    });

    // Referral Copy & Share
    document.getElementById('copyRefLinkBtn')?.addEventListener('click', () => {
      const input = document.getElementById('userReferralLinkInput');
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        this.showToast('📋 Referral link copied to clipboard!');
      }
    });

    document.getElementById('shareRefXBtn')?.addEventListener('click', () => {
      const u = db.getState().currentUser;
      const tweet = encodeURIComponent(`Join me on Booba (baby BNB) — Complete quests, level up your Booba Passport, and earn $BOOBA rewards! 🍼🐼 https://booba.crypto/invite/${u?.username}`);
      window.open(`https://twitter.com/intent/tweet?text=${tweet}`, '_blank');
    });

    // Quest Filter Pills
    document.querySelectorAll('.quest-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeQuestFilter = e.currentTarget.dataset.category;
        this.render();
      });
    });

    // Quest Actions
    document.querySelectorAll('.quest-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const type = e.currentTarget.dataset.type;
        const title = e.currentTarget.dataset.title;
        const reward = parseInt(e.currentTarget.dataset.reward, 10);

        if (type === 'instant') {
          const res = db.claimDailyCheckIn();
          this.showToast(`🔥 Claimed +${reward} BOOBA for ${title}!`);
        } else if (type === 'social') {
          this.openSocialVerifyModal(id, title, reward);
        } else {
          this.openProofSubmissionModal(id, title, reward);
        }
      });
    });

    // User Profile Settings Form
    document.getElementById('userProfileSettingsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const displayName = document.getElementById('settingsDisplayName')?.value;
      const email = document.getElementById('settingsEmail')?.value;
      
      const user = db.getState().currentUser;
      if (user) {
        user.displayName = displayName || user.username;
        user.email = email || user.email;
        db.saveState();
        this.showToast('Profile and preferences updated successfully.', 'success');
        this.render();
      }
    });
  }

  openSocialVerifyModal(questId, title, reward) {
    const modal = document.getElementById('socialVerifyModal');
    if (!modal) return;

    document.getElementById('socialModalTitle').textContent = title;
    document.getElementById('socialModalReward').textContent = `+${reward} BOOBA`;

    const confirmBtn = document.getElementById('confirmSocialVerifyBtn');
    confirmBtn.onclick = () => {
      db.completeSocialQuest(questId);
      this.closeModal();
      this.showToast(`🎉 Verified! +${reward} BOOBA added to your passport.`);
    };

    modal.classList.add('open');
  }

  openProofSubmissionModal(questId, title, reward) {
    const modal = document.getElementById('proofModal');
    if (!modal) return;

    document.getElementById('proofModalTitle').textContent = title;
    document.getElementById('proofModalReward').textContent = `+${reward} BOOBA`;
    document.getElementById('proofQuestId').value = questId;

    modal.classList.add('open');
  }

  /* --------------------------------------------------------------------------
     4. ADMIN DASHBOARD VIEW
     -------------------------------------------------------------------------- */
  getAdminHTML(state) {
    const pendingSubs = state.submissions.filter(s => s.status === 'pending');
    const totalUsers = state.users.length;
    const totalBooba = state.users.reduce((sum, u) => sum + (u.boobaPoints || 0), 0);

    return `
      <div class="container" style="padding-top: 2rem; padding-bottom: 4rem;">
        
        <div class="flex items-center justify-between" style="margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div class="flex items-center gap-2">
              <span class="badge-tag" style="background: rgba(239, 68, 68, 0.15); color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">
                🛡️ ADMIN MANAGEMENT CONSOLE
              </span>
            </div>
            <h2 style="margin-top: 0.35rem;">Booba Platform Administration</h2>
          </div>
          <button id="adminCreateQuestBtn" class="btn btn-primary">
            + Mint New Quest
          </button>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
          <div class="google-card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total Citizens</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">
              ${totalUsers.toLocaleString()}
            </div>
          </div>
          <div class="google-card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Total BOOBA Distributed</div>
            <div class="text-mono text-gold" style="font-size: 1.6rem; font-weight: 800; margin-top: 0.25rem;">
              ${totalBooba.toLocaleString()} 🍼
            </div>
          </div>
          <div class="google-card" style="border-color: rgba(243, 186, 47, 0.4);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Pending Submissions</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
              ${pendingSubs.length}
            </div>
          </div>
          <div class="google-card">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Active Bounties</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">
              ${state.quests.length}
            </div>
          </div>
        </div>

        <div style="margin-bottom: 3rem;">
          <div style="margin-bottom: 1.25rem;">
            <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Quest Proof Review Queue (${pendingSubs.length})</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary);">Review creative submissions and community tasks. Approving automatically awards BOOBA points directly to the user's passport.</p>
          </div>

          ${pendingSubs.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${pendingSubs.map(sub => `
                <div class="google-card" style="padding: 1.25rem; background: var(--bg-surface);">
                  <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div>
                      <strong style="font-size: 1.05rem; color: var(--text-primary);">${sub.questTitle}</strong>
                      <span class="quest-reward-pill" style="font-size: 0.75rem; margin-left: 0.5rem;">+${sub.rewardBooba} BOOBA</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                      User: <strong class="text-gold">@${sub.username}</strong> (${sub.passportId}) • ${sub.submittedAt}
                    </div>
                  </div>

                  <div style="background: var(--bg-input); padding: 0.75rem 1rem; border-radius: var(--radius-xs); margin-bottom: 1rem; font-size: 0.85rem; border: 1px solid var(--border-subtle);">
                    <div><strong>Proof Link / Content:</strong> <a href="${sub.proofUrl}" target="_blank" style="color: var(--brand-yellow); text-decoration: underline;">${sub.proofUrl}</a></div>
                    ${sub.proofDescription ? `<div style="color: var(--text-secondary); margin-top: 0.25rem;"><strong>Notes:</strong> ${sub.proofDescription}</div>` : ''}
                  </div>

                  <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 0.75rem;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Verification Status: <strong>Awaiting Approval</strong></div>
                    <div class="flex items-center gap-2">
                      <button class="btn btn-secondary btn-sm admin-reject-btn" data-id="${sub.id}">
                        ✕ Reject
                      </button>
                      <button class="btn btn-primary btn-sm admin-approve-btn" data-id="${sub.id}" data-reward="${sub.rewardBooba}" data-user="${sub.username}">
                        ✓ Approve & Award +${sub.rewardBooba} BOOBA
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm);">
              ✅ All quest submissions have been reviewed!
            </div>
          `}
        </div>

        <div>
          <div style="margin-bottom: 1.25rem;">
            <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">User Passports & Balances</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary);">Audit registered community members and manage bonus rewards.</p>
          </div>
          <div class="table-container">
            <table class="leaderboard-table">
              <thead>
                <tr style="color: var(--text-muted); font-size: 0.8rem; text-align: left; background: var(--bg-surface-elevated);">
                  <th style="padding: 0.75rem 1rem;">CITIZEN</th>
                  <th style="padding: 0.75rem 1rem;">PASSPORT ID</th>
                  <th style="padding: 0.75rem 1rem;">BOOBA BALANCE</th>
                  <th style="padding: 0.75rem 1rem; text-align: right;">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                ${state.users.map(u => `
                  <tr class="leaderboard-row">
                    <td class="leaderboard-cell">
                      <div class="flex items-center gap-2">
                        <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                        <div>
                          <strong>@${u.username}</strong>
                          <span class="badge-tag" style="font-size: 0.6rem;">${u.role}</span>
                        </div>
                      </div>
                    </td>
                    <td class="leaderboard-cell text-mono text-gold">${u.passportId}</td>
                    <td class="leaderboard-cell text-mono" style="font-weight: 700;">${u.boobaPoints.toLocaleString()} BOOBA</td>
                    <td class="leaderboard-cell" style="text-align: right;">
                      <button class="btn btn-secondary btn-sm admin-bonus-btn" data-id="${u.id}" data-user="${u.username}">
                        + Award Bonus
                      </button>
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

  attachAdminListeners() {
    // Approve submission
    document.querySelectorAll('.admin-approve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const reward = e.currentTarget.dataset.reward;
        const user = e.currentTarget.dataset.user;
        db.reviewSubmission(id, 'approved');
        this.showToast(`✅ Approved submission! Awarded +${reward} BOOBA to @${user}.`);
      });
    });

    // Reject submission
    document.querySelectorAll('.admin-reject-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        db.reviewSubmission(id, 'rejected', 'Proof link did not meet task criteria');
        this.showToast(`Submission rejected.`, 'error');
      });
    });

    // Mint Quest Modal
    document.getElementById('adminCreateQuestBtn')?.addEventListener('click', () => {
      const modal = document.getElementById('createQuestModal');
      modal?.classList.add('open');
    });

    // Award user bonus
    document.querySelectorAll('.admin-bonus-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const user = e.currentTarget.dataset.user;
        const bonusStr = prompt(`Enter BOOBA points to award to @${user}:`, '500');
        if (bonusStr && !isNaN(bonusStr)) {
          const bonus = parseInt(bonusStr, 10);
          db.adjustUserBooba(id, bonus);
          this.showToast(`Awarded +${bonus} BOOBA to @${user}!`);
        }
      });
    });
  }

  // 3D Card Interactive Tilt & Physics
  initPassportTilt() {
    const cards = document.querySelectorAll('.passport-card-3d');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;
        
        if (!card.classList.contains('flipped')) {
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        if (!card.classList.contains('flipped')) {
          card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        }
      });
    });
  }
}

// Instantiate global app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.boobaApp = new BoobaApp();

  // Creative Proof Submit Form
  document.getElementById('proofForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const questId = document.getElementById('proofQuestId')?.value;
    const proofUrl = document.getElementById('proofUrlInput')?.value;
    const proofDescription = document.getElementById('proofNotesInput')?.value;

    if (!proofUrl) {
      window.boobaApp.showToast('Please provide a valid proof link or image URL.', 'error');
      return;
    }

    db.submitCreativeProof({ questId, proofUrl, proofDescription });
    window.boobaApp.closeModal();
    window.boobaApp.showToast('🚀 Proof submitted successfully! Sent to Admin review queue.');
  });

  // Admin Create Quest Form
  document.getElementById('createQuestForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('newQuestTitle')?.value;
    const category = document.getElementById('newQuestCategory')?.value;
    const rewardBooba = document.getElementById('newQuestReward')?.value;
    const description = document.getElementById('newQuestDesc')?.value;
    const requirements = document.getElementById('newQuestReqs')?.value;

    db.createQuest({ title, category, rewardBooba, description, requirements, actionText: 'Submit Proof' });
    window.boobaApp.closeModal();
    window.boobaApp.showToast(`✨ New quest "${title}" successfully minted & published!`);
  });
});
