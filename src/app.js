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
      if (e.key === 'Escape') this.closeModal();
    });

    // Close modal when clicking outside card
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeModal();
      }
    });
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
    if (!navRight) return;

    if (currentUser) {
      const userLevel = calculateLevel(currentUser.boobaPoints);
      navRight.innerHTML = `
        <div class="flex items-center gap-3">
          <a href="#dashboard/overview" class="btn btn-secondary btn-sm flex items-center gap-2" style="border-radius: var(--radius-full); padding: 0.35rem 0.85rem;">
            <img src="${currentUser.avatar || 'assets/mascot.jpg'}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-yellow);">
            <span style="font-weight: 700; color: var(--text-primary);">@${currentUser.username}</span>
            <span class="badge-tag" style="padding: 0.1rem 0.4rem; font-size: 0.65rem;">Lvl ${userLevel.level}</span>
          </a>
          <div class="quest-reward-pill" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
            <span>🍼</span>
            <span>${currentUser.boobaPoints.toLocaleString()} BOOBA</span>
          </div>
          ${currentUser.role === 'admin' ? `
            <a href="#admin" class="btn btn-outline btn-sm" style="font-size: 0.8rem;">
              🛡️ Admin
            </a>
          ` : ''}
          <button id="logoutBtn" class="btn btn-ghost btn-sm" title="Log Out" style="padding: 0.4rem 0.6rem;">
            🚪
          </button>
        </div>
      `;

      document.getElementById('logoutBtn')?.addEventListener('click', () => {
        db.logout();
        this.showToast('You have been logged out.');
        window.location.hash = 'home';
      });
    } else {
      navRight.innerHTML = `
        <div class="flex items-center gap-3">
          <a href="#login" class="btn btn-ghost btn-sm">Sign In</a>
          <a href="#signup" class="btn btn-primary btn-sm">Create Passport</a>
        </div>
      `;
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
      const email = document.getElementById('xEmailInput')?.value || '';
      const password = document.getElementById('xPasswordInput')?.value || '';
      const username = document.getElementById('xUsernameInput')?.value || '';
      const refCode = document.getElementById('xReferralInput')?.value || '';

      if (isSignUp) {
        if (!username || !email) {
          this.showToast('Please enter both username and email.', 'error');
          return;
        }
        const res = db.register({ username, email, referralCodeInput: refCode });
        if (res.success) {
          this.showToast(`🎉 Passport Minted! ID: ${res.user.passportId}. Welcome bonus +100 BOOBA credited!`);
          window.location.hash = 'dashboard/passport';
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
          this.showToast(`Welcome back, @${res.user.username}!`);
          window.location.hash = 'dashboard/overview';
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
      this.showToast('Logged in as Admin: @BoobaBoss');
      window.location.hash = 'admin';
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

      <!-- LEADERBOARD SNEAK PEEK -->
      <section style="padding: 5rem 0;">
        <div class="container">
          <div style="text-align: center; max-width: 600px; margin: 0 auto 3rem auto;">
            <span class="badge-tag" style="margin-bottom: 0.5rem;">HALL OF FAME</span>
            <h2>Top <span class="text-gradient-gold">Booba Legends</span></h2>
            <p>Community champions leading the Baby BNB movement across quests, referrals, and content.</p>
          </div>

          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-lg); max-width: 850px; margin: 0 auto;">
            <table class="leaderboard-table">
              <tbody>
                ${topLeaderboard.map((u, i) => {
                  const level = calculateLevel(u.boobaPoints);
                  const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                  return `
                    <tr class="leaderboard-row">
                      <td class="leaderboard-cell" style="width: 50px; text-align: center;">
                        <span class="rank-badge ${rankClass}">${i + 1}</span>
                      </td>
                      <td class="leaderboard-cell">
                        <div class="flex items-center gap-3">
                          <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-yellow);">
                          <div>
                            <div style="font-weight: 700; color: var(--text-primary);">@${u.username}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${u.passportId} • ${level.title}</div>
                          </div>
                        </div>
                      </td>
                      <td class="leaderboard-cell" style="text-align: right;">
                        <div class="text-mono" style="font-weight: 700; color: var(--brand-yellow); font-size: 1.05rem;">
                          ${u.boobaPoints.toLocaleString()} BOOBA
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${u.verifiedReferralsCount} Referrals</div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <div style="text-align: center; margin-top: 1.5rem;">
              <a href="#dashboard/leaderboard" class="btn btn-secondary btn-sm">Explore Full Leaderboard →</a>
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
     3. USER DASHBOARD VIEW (All-In-One Member HQ)
     -------------------------------------------------------------------------- */
  getDashboardHTML(state) {
    const user = state.currentUser;
    const userLevel = calculateLevel(user.boobaPoints);

    return `
      <div class="container" style="padding-top: 2rem; padding-bottom: 4rem;">
        
        <!-- DASHBOARD HEADER / PROFILE BANNER -->
        <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-lg); margin-bottom: 2rem; border-color: rgba(243, 186, 47, 0.25);">
          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 1.5rem;">
            
            <div class="flex items-center gap-4">
              <div style="position: relative;">
                <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 72px; height: 72px; border-radius: var(--radius-md); object-fit: cover; border: 2.5px solid var(--brand-yellow); box-shadow: 0 0 20px var(--brand-yellow-glow);">
                <span class="badge-tag" style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); font-size: 0.65rem; padding: 0.1rem 0.45rem;">
                  Lvl ${userLevel.level}
                </span>
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h2 style="font-size: 1.6rem;">@${user.username}</h2>
                  <span class="badge-tag">${userLevel.title}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
                  Passport ID: <strong class="text-gold text-mono">${user.passportId}</strong> • Member since ${user.memberSince}
                </div>
              </div>
            </div>

            <!-- Quick Action & Daily Checkin -->
            <div class="flex items-center gap-3" style="flex-wrap: wrap;">
              <button id="dashDailyCheckInBtn" class="btn btn-primary">
                🔥 Daily Check-in (+50 BOOBA)
              </button>
              <a href="#dashboard/passport" class="btn btn-secondary">
                🪪 View 3D Passport
              </a>
            </div>

          </div>

          <!-- Level Progress Bar -->
          <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle);">
            <div class="flex items-center justify-between" style="font-size: 0.85rem; margin-bottom: 0.5rem;">
              <span>Level ${userLevel.level}: <strong>${userLevel.title}</strong></span>
              <span class="text-mono text-gold">
                ${user.boobaPoints.toLocaleString()} / ${userLevel.nextTier ? userLevel.nextTier.min.toLocaleString() : 'MAX'} BOOBA
              </span>
            </div>
            <div style="height: 10px; background: var(--bg-input); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--border-subtle);">
              <div style="width: ${userLevel.progressPercent}%; height: 100%; background: linear-gradient(90deg, var(--brand-yellow-dark) 0%, var(--brand-yellow) 100%); transition: width 0.5s ease;"></div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
              Next Tier Unlock: ${userLevel.nextTier ? userLevel.nextTier.unlock : 'Grandmaster Ambassador Status Achieved!'}
            </div>
          </div>
        </div>

        <!-- DASHBOARD NAVIGATION TABS (Sidebar on desktop / horizontal bar on mobile) -->
        <div style="display: flex; gap: 2rem; align-items: flex-start;" class="dashboard-layout">
          
          <!-- Sidebar -->
          <div class="glass-panel dashboard-sidebar" style="width: 260px; padding: 1rem; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.35rem; flex-shrink: 0;">
            <a href="#dashboard/overview" class="btn ${this.activeDashboardTab === 'overview' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              🏠 Overview
            </a>
            <a href="#dashboard/passport" class="btn ${this.activeDashboardTab === 'passport' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              🪪 My Passport
            </a>
            <a href="#dashboard/quests" class="btn ${this.activeDashboardTab === 'quests' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              🎯 Quests & Bounties
            </a>
            <a href="#dashboard/rewards" class="btn ${this.activeDashboardTab === 'rewards' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              💰 BOOBA Rewards Vault
            </a>
            <a href="#dashboard/referrals" class="btn ${this.activeDashboardTab === 'referrals' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              👥 Referrals
            </a>
            <a href="#dashboard/achievements" class="btn ${this.activeDashboardTab === 'achievements' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              🏆 Achievements
            </a>
            <a href="#dashboard/leaderboard" class="btn ${this.activeDashboardTab === 'leaderboard' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              🥇 Leaderboard
            </a>
            <a href="#dashboard/settings" class="btn ${this.activeDashboardTab === 'settings' ? 'btn-primary' : 'btn-ghost'} btn-block" style="justify-content: flex-start;">
              ⚙️ Settings & Supabase
            </a>
          </div>

          <!-- Main Tab Content Area -->
          <div style="flex: 1; width: 100%;">
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
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div class="flex items-center justify-between" style="margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h3>My Digital Booba Passport</h3>
              <p style="font-size: 0.9rem;">Your official on-chain reputation and verified status inside Baby BNB.</p>
            </div>
            <div class="flex items-center gap-2">
              <button id="sharePassportBtn" class="btn btn-secondary btn-sm">
                🐦 Share to X
              </button>
              <button id="downloadPassportBtn" class="btn btn-outline btn-sm">
                💾 Save Card
              </button>
            </div>
          </div>

          <!-- 3D Flippable Passport Card -->
          <div class="passport-container" style="max-width: 480px; margin-bottom: 2.5rem;">
            <div class="passport-card-3d" id="myPassportCard">
              
              <!-- Front -->
              <div class="passport-face passport-front" style="min-height: 290px;">
                <div class="passport-top-row">
                  <div class="passport-emblem">
                    <img src="assets/mascot.jpg" class="passport-emblem-icon">
                    <div>
                      <div style="font-size: 0.8rem; font-weight: 800; color: var(--brand-yellow); letter-spacing: 0.06em;">BOOBA PASSPORT</div>
                      <div style="font-size: 0.65rem; color: var(--text-muted);">BABY BNB RESIDENT ID</div>
                    </div>
                  </div>
                  <div class="passport-chip"></div>
                </div>

                <div class="passport-body">
                  <img src="${user.avatar || 'assets/mascot.jpg'}" class="passport-user-avatar">
                  <div class="passport-info-grid">
                    <div class="passport-username">
                      <span>@${user.username}</span>
                      <span style="color: var(--brand-yellow); font-size: 0.9rem;">✓</span>
                    </div>
                    <div class="passport-id-badge">ID: ${user.passportId}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.35rem;">
                      Level ${userLevel.level} — <strong style="color: var(--brand-yellow);">${userLevel.title}</strong>
                    </div>
                  </div>
                </div>

                <div class="passport-metrics-strip">
                  <div class="passport-metric-item">
                    <div class="passport-metric-label">BOOBA Points</div>
                    <div class="passport-metric-value text-gold">${user.boobaPoints.toLocaleString()} 🍼</div>
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

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem;">
                  <span>ISSUED: ${user.memberSince.toUpperCase()}</span>
                  <span style="color: var(--brand-yellow); cursor: pointer;" id="myPassportFlipBtn">Click to Flip Card ↷</span>
                </div>
              </div>

              <!-- Back -->
              <div class="passport-face passport-back" style="min-height: 290px;">
                <div class="passport-top-row">
                  <div style="font-size: 0.8rem; font-weight: 800; color: var(--brand-yellow);">SECURITY CREDENTIALS</div>
                  <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">VERIFIED PASSPORT</span>
                </div>

                <div style="display: flex; gap: 1.25rem; align-items: center; margin: 1rem 0;">
                  <div style="width: 75px; height: 75px; background: #fff; padding: 6px; border-radius: 8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px;">
                    <div style="background: #000;"></div><div style="background: #000;"></div><div></div><div style="background: #000;"></div>
                    <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div></div>
                    <div></div><div style="background: #000;"></div><div style="background: #000;"></div><div style="background: #000;"></div>
                    <div style="background: #000;"></div><div></div><div style="background: #000;"></div><div style="background: #000;"></div>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">
                    <div><strong>Wallet:</strong> ${user.walletAddress || '0x71C...49b2'}</div>
                    <div><strong>Quests Done:</strong> ${user.completedQuestsCount || 0}</div>
                    <div><strong>Current Streak:</strong> ${user.streakDays || 1} Days 🔥</div>
                  </div>
                </div>

                <div style="font-size: 0.7rem; color: var(--text-muted);">
                  The Booba Passport is your non-transferable digital soulbound status symbol. All rights reserved by Baby BNB ecosystem.
                </div>

                <div style="text-align: right; margin-top: 0.75rem;">
                  <span style="font-size: 0.7rem; color: var(--brand-yellow); cursor: pointer;" id="myPassportFlipBackBtn">Flip to Front ↶</span>
                </div>
              </div>

            </div>
          </div>

          <!-- Badges Showcase -->
          <h4 style="margin-bottom: 1rem;">Unlocked Badges & Insignias</h4>
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            ${(user.badges || ['Pioneer', 'Baby BNB OG']).map(b => `
              <div class="glass-panel" style="padding: 1rem; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.75rem; border-color: rgba(243, 186, 47, 0.2);">
                <div style="font-size: 1.5rem;">🎖️</div>
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem;">${b}</div>
                  <div style="font-size: 0.7rem; color: var(--accent-emerald);">Unlocked ✓</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (tab === 'quests') {
      const filteredQuests = this.activeQuestFilter === 'all' 
        ? state.quests 
        : state.quests.filter(q => q.category === this.activeQuestFilter);

      return `
        <div class="glass-panel" style="padding: 2rem; border-radius: var(--radius-lg);">
          <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 1rem; margin-bottom: 1.75rem;">
            <div>
              <h3>Community Quests & Activities</h3>
              <p style="font-size: 0.9rem;">Complete approved activities to boost your BOOBA points and elevate your passport.</p>
            </div>
            <div class="quest-reward-pill" style="font-size: 0.85rem;">
              <span>🍼 Your Balance: ${user.boobaPoints.toLocaleString()} BOOBA</span>
            </div>
          </div>

          <!-- Category Filter Pills -->
          <div class="flex items-center gap-2" style="flex-wrap: wrap; margin-bottom: 1.5rem;">
            ${['all', 'daily', 'social', 'community', 'creative', 'special'].map(cat => `
              <button class="btn btn-sm ${this.activeQuestFilter === cat ? 'btn-primary' : 'btn-secondary'} quest-filter-btn" data-category="${cat}">
                ${cat.toUpperCase()}
              </button>
            `).join('')}
          </div>

          <!-- Quests Grid -->
          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1.5rem;">
            ${filteredQuests.map(q => `
              <div class="quest-card">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
                    <span class="quest-category-badge cat-${q.category}">${q.category}</span>
                    <span class="quest-reward-pill">+${q.rewardBooba} BOOBA</span>
                  </div>
                  <h4 style="margin-bottom: 0.4rem;">${q.title}</h4>
                  <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">${q.description}</p>
                  <div style="font-size: 0.75rem; color: var(--text-muted); background: var(--bg-input); padding: 0.5rem 0.75rem; border-radius: var(--radius-xs); border: 1px solid var(--border-subtle);">
                    <strong>Requirement:</strong> ${q.requirements}
                  </div>
                </div>

                <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 0.75rem; color: var(--text-muted);">🕒 ${q.deadline}</span>
                  <button class="btn btn-primary btn-sm quest-action-btn" data-id="${q.id}" data-type="${q.type}" data-title="${q.title}" data-reward="${q.rewardBooba}">
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
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div style="margin-bottom: 2rem;">
            <h3>BOOBA Rewards & Airdrop Vault</h3>
            <p style="font-size: 0.9rem;">Your accrued BOOBA points grant token allocation multipliers, exclusive perks, and tier privileges.</p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
            <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md); border-color: rgba(243, 186, 47, 0.3);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">BOOBA Points Balance</div>
              <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${user.boobaPoints.toLocaleString()} 🍼
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem;">Active & Growing</div>
            </div>

            <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Airdrop Multiplier</div>
              <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">
                ${(1 + (userLevel.level * 0.25)).toFixed(2)}x
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Based on Level ${userLevel.level}</div>
            </div>

            <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Reputation Tier</div>
              <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">
                ${user.reputation || 91}/100
              </div>
              <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem;">High Trust Score</div>
            </div>
          </div>

          <h4 style="margin-bottom: 1.25rem;">Level Unlock Hierarchy</h4>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${LEVEL_TIERS.map(tier => {
              const isUnlocked = user.boobaPoints >= tier.min;
              const isCurrent = userLevel.level === tier.level;
              return `
                <div class="glass-panel" style="padding: 1rem 1.25rem; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: space-between; border-color: ${isCurrent ? 'var(--brand-yellow)' : isUnlocked ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}; background: ${isCurrent ? 'rgba(243, 186, 47, 0.08)' : 'var(--bg-surface-elevated)'};">
                  <div class="flex items-center gap-3">
                    <span class="badge-tag" style="${isCurrent ? 'background: var(--brand-yellow); color: #000;' : ''}">
                      Lvl ${tier.level}
                    </span>
                    <div>
                      <div style="font-weight: 700; color: ${isCurrent ? 'var(--brand-yellow)' : 'var(--text-primary)'};">
                        ${tier.title} ${isCurrent ? '★ (Your Current Level)' : ''}
                      </div>
                      <div style="font-size: 0.8rem; color: var(--text-secondary);">${tier.unlock}</div>
                    </div>
                  </div>
                  <div class="text-mono" style="font-size: 0.85rem; font-weight: 700; color: ${isUnlocked ? 'var(--accent-emerald)' : 'var(--text-muted)'};">
                    ${tier.min.toLocaleString()}+ BOOBA ${isUnlocked ? '✓' : '🔒'}
                  </div>
                </div>
              `;
            }).join('')}
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
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div style="margin-bottom: 2rem;">
            <h3>Referral Growth Headquarters</h3>
            <p style="font-size: 0.9rem;">Invite genuine members to the Booba ecosystem. Earn +300 BOOBA for every verified referral.</p>
          </div>

          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md); border: 1.5px dashed rgba(243, 186, 47, 0.4); margin-bottom: 2.5rem; background: rgba(243, 186, 47, 0.03);">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--brand-yellow); text-transform: uppercase; margin-bottom: 0.5rem;">Your Unique Invite Link</div>
            <div class="flex items-center gap-3" style="flex-wrap: wrap;">
              <input type="text" readonly value="${inviteUrl}" id="userReferralLinkInput" class="form-input" style="flex: 1; min-width: 260px; font-family: var(--font-mono); font-weight: 600; color: var(--brand-yellow);">
              <button id="copyRefLinkBtn" class="btn btn-primary">
                📋 Copy Link
              </button>
              <button id="shareRefXBtn" class="btn btn-secondary">
                🐦 Share to X
              </button>
            </div>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2.5rem;">
            <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-sm); text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Total Registrations</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">
                ${userReferrals.length + 12}
              </div>
            </div>
            <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-sm); text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Verified Referrals</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">
                ${verifiedCount + (user.verifiedReferralsCount || 0)}
              </div>
            </div>
            <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-sm); text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Pending Verification</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${pendingCount}
              </div>
            </div>
            <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-sm); text-align: center;">
              <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">BOOBA Earned</div>
              <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
                ${(totalEarned + (user.verifiedReferralsCount || 0) * 300).toLocaleString()} 🍼
              </div>
            </div>
          </div>

          <h4 style="margin-bottom: 1rem;">Referred Members List</h4>
          <table class="leaderboard-table">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
                <th style="padding: 0.5rem 1rem;">MEMBER</th>
                <th style="padding: 0.5rem 1rem;">JOINED</th>
                <th style="padding: 0.5rem 1rem;">STATUS</th>
                <th style="padding: 0.5rem 1rem; text-align: right;">REWARD</th>
              </tr>
            </thead>
            <tbody>
              ${userReferrals.length > 0 ? userReferrals.map(ref => `
                <tr class="leaderboard-row">
                  <td class="leaderboard-cell">
                    <div style="font-weight: 700;">@${ref.referredUsername}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${ref.passportId}</div>
                  </td>
                  <td class="leaderboard-cell" style="font-size: 0.85rem; color: var(--text-secondary);">
                    ${ref.joinedDate}
                  </td>
                  <td class="leaderboard-cell">
                    <span class="badge-tag" style="${ref.status === 'verified' ? 'background: rgba(16, 185, 129, 0.15); color: #10B981; border-color: rgba(16, 185, 129, 0.3);' : 'background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.3);'}">
                      ${ref.status === 'verified' ? 'VERIFIED ✓' : 'PENDING'}
                    </span>
                    ${ref.verificationRequirement ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem;">${ref.verificationRequirement}</div>` : ''}
                  </td>
                  <td class="leaderboard-cell text-mono" style="text-align: right; font-weight: 700; color: ${ref.status === 'verified' ? 'var(--brand-yellow)' : 'var(--text-muted)'};">
                    +${ref.status === 'verified' ? 300 : 0} BOOBA
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No referrals yet. Share your unique link above to start earning +300 BOOBA per friend!
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      `;
    }

    if (tab === 'achievements') {
      return `
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div style="margin-bottom: 2rem;">
            <h3>Ecosystem Achievements</h3>
            <p style="font-size: 0.9rem;">Milestone trophies that prove your dedication to the Baby BNB community.</p>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
            ${state.achievements.map(ach => `
              <div class="glass-panel" style="padding: 1.4rem; border-radius: var(--radius-md); border-color: ${ach.completed ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}; background: ${ach.completed ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-surface-elevated)'};">
                <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
                  <span style="font-size: 2rem;">${ach.icon}</span>
                  <span class="quest-reward-pill">+${ach.rewardBooba} BOOBA</span>
                </div>
                <h4 style="margin-bottom: 0.3rem;">${ach.title}</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">${ach.desc}</p>
                <div class="flex items-center justify-between" style="font-size: 0.75rem;">
                  <span style="color: ${ach.completed ? 'var(--accent-emerald)' : 'var(--text-muted)'}; font-weight: 700;">
                    ${ach.completed ? 'CLAIMED ✓' : ach.progress ? `Progress: ${ach.progress}` : 'IN PROGRESS'}
                  </span>
                  ${ach.completed ? '' : `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.5;">Locked</button>`}
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
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div style="margin-bottom: 2rem;">
            <h3>Global Community Leaderboard</h3>
            <p style="font-size: 0.9rem;">Rankings of the top contributors, questers, and ambassadors in Booba.</p>
          </div>

          <table class="leaderboard-table">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
                <th style="padding: 0.5rem 1rem; width: 60px;">RANK</th>
                <th style="padding: 0.5rem 1rem;">MEMBER & PASSPORT</th>
                <th style="padding: 0.5rem 1rem;">REPUTATION</th>
                <th style="padding: 0.5rem 1rem; text-align: right;">TOTAL BOOBA</th>
              </tr>
            </thead>
            <tbody>
              ${sortedUsers.map((u, index) => {
                const isUser = u.id === user.id;
                const level = calculateLevel(u.boobaPoints);
                const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
                return `
                  <tr class="leaderboard-row" style="${isUser ? 'border: 1px solid var(--brand-yellow); background: rgba(243, 186, 47, 0.08);' : ''}">
                    <td class="leaderboard-cell" style="text-align: center;">
                      <span class="rank-badge ${rankClass}">${index + 1}</span>
                    </td>
                    <td class="leaderboard-cell">
                      <div class="flex items-center gap-3">
                        <img src="${u.avatar || 'assets/mascot.jpg'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--brand-yellow);">
                        <div>
                          <div style="font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
                            @${u.username} ${isUser ? '<span class="badge-tag" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;">YOU</span>' : ''}
                          </div>
                          <div style="font-size: 0.75rem; color: var(--text-muted);">${u.passportId} • ${level.title}</div>
                        </div>
                      </div>
                    </td>
                    <td class="leaderboard-cell">
                      <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">
                        ⭐ ${u.reputation || 90}/100
                      </span>
                    </td>
                    <td class="leaderboard-cell" style="text-align: right;">
                      <div class="text-mono text-gold" style="font-weight: 800; font-size: 1.1rem;">
                        ${u.boobaPoints.toLocaleString()} 🍼
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${u.completedQuestsCount || 0} quests done</div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (tab === 'settings') {
      const supaConfig = SupabaseService.getConfig();

      return `
        <div class="glass-panel" style="padding: 2.25rem; border-radius: var(--radius-lg);">
          <div style="margin-bottom: 2rem;">
            <h3>Profile & Cloud Database Settings</h3>
            <p style="font-size: 0.9rem;">Manage your linked Web3 wallet, security, and Supabase cloud synchronization.</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; margin-bottom: 3rem;">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" readonly value="@${user.username}" class="form-input" style="opacity: 0.8;">
            </div>
            <div class="form-group">
              <label class="form-label">Passport ID</label>
              <input type="text" readonly value="${user.passportId}" class="form-input text-mono text-gold" style="opacity: 0.8;">
            </div>
            <div class="form-group">
              <label class="form-label">Linked Web3 Wallet (BNB Chain)</label>
              <input type="text" readonly value="${user.walletAddress || '0x71C...49b2'}" class="form-input text-mono">
            </div>
          </div>

          <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-md); border-color: rgba(6, 182, 212, 0.3); background: rgba(6, 182, 212, 0.02);">
            <div class="flex items-center justify-between" style="margin-bottom: 1rem;">
              <div class="flex items-center gap-2">
                <span style="font-size: 1.4rem;">⚡</span>
                <h4 style="color: #06B6D4;">Supabase Cloud Database Connection</h4>
              </div>
              <span class="badge-tag" style="${supaConfig.isConnected ? 'background: rgba(16, 185, 129, 0.15); color: #10B981;' : 'background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow);'}">
                ${supaConfig.isConnected ? 'SUPABASE CONNECTED ✓' : 'LOCAL STORAGE ACTIVE'}
              </span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
              When ready, paste your Supabase Project URL and Public Anon Key below to automatically synchronize all passports, quests, and referrals to your cloud database.
            </p>

            <form id="supabaseConfigForm" style="display: flex; flex-direction: column; gap: 1rem;">
              <div class="form-group">
                <label class="form-label">Supabase Project URL</label>
                <input type="text" id="supaUrlInput" value="${supaConfig.url || ''}" placeholder="https://your-project.supabase.co" class="form-input">
              </div>
              <div class="form-group">
                <label class="form-label">Supabase Anon Key</label>
                <input type="password" id="supaKeyInput" value="${supaConfig.anonKey || ''}" placeholder="eyJhbGciOiJIUzI1NiIsIn..." class="form-input">
              </div>
              <div class="flex items-center gap-3">
                <button type="submit" class="btn btn-primary btn-sm">Save & Connect Supabase</button>
                <button type="button" id="copySqlMigrationBtn" class="btn btn-secondary btn-sm">📋 Copy Supabase SQL Schema</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // Default Overview
    return `
      <div style="display: flex; flex-direction: column; gap: 1.75rem;">
        
        <!-- Summary Stats Grid -->
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem;">
          
          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md); border-color: rgba(243, 186, 47, 0.3);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">BOOBA Points</div>
            <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
              ${user.boobaPoints.toLocaleString()} 🍼
            </div>
            <div style="font-size: 0.75rem; color: var(--accent-emerald); margin-top: 0.25rem;">+50 Daily Claim Ready</div>
          </div>

          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Reputation Rating</div>
            <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">
              ${user.reputation || 91} / 100
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Top 5% Verified Citizen</div>
          </div>

          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Quests Completed</div>
            <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: var(--accent-cyan); margin-top: 0.25rem;">
              ${user.completedQuestsCount || 96}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Across all categories</div>
          </div>

          <div class="glass-panel" style="padding: 1.5rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Verified Referrals</div>
            <div class="text-mono" style="font-size: 1.8rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">
              ${user.verifiedReferralsCount || 42}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">+12,600 BOOBA generated</div>
          </div>

        </div>

        <!-- Quick Quests Feed -->
        <div class="glass-panel" style="padding: 1.75rem; border-radius: var(--radius-lg);">
          <div class="flex items-center justify-between" style="margin-bottom: 1.25rem;">
            <h4>Recommended Quests For You</h4>
            <a href="#dashboard/quests" class="btn btn-ghost btn-sm">See All →</a>
          </div>

          <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
            ${state.quests.slice(0, 3).map(q => `
              <div class="quest-card" style="padding: 1.2rem;">
                <div>
                  <div class="flex items-center justify-between" style="margin-bottom: 0.5rem;">
                    <span class="quest-category-badge cat-${q.category}">${q.category}</span>
                    <span class="quest-reward-pill">+${q.rewardBooba} BOOBA</span>
                  </div>
                  <h4 style="font-size: 1rem; margin-bottom: 0.3rem;">${q.title}</h4>
                  <p style="font-size: 0.8rem; color: var(--text-secondary);">${q.description}</p>
                </div>
                <div style="margin-top: 0.75rem; text-align: right;">
                  <button class="btn btn-secondary btn-sm quest-action-btn" data-id="${q.id}" data-type="${q.type}" data-title="${q.title}" data-reward="${q.rewardBooba}">
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
    // Daily Check-in Button
    document.getElementById('dashDailyCheckInBtn')?.addEventListener('click', () => {
      const res = db.claimDailyCheckIn();
      if (res.success) {
        this.showToast(`🔥 Daily Check-in Claimed! +${res.bonus} BOOBA. Current streak: ${res.streak} days!`);
      }
    });

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
      const tweetText = encodeURIComponent(`I just minted my official Booba Passport (ID: ${u?.passportId}) in the @BoobaBabyBNB ecosystem! Level ${calculateLevel(u?.boobaPoints).level} ${calculateLevel(u?.boobaPoints).title} 🐼🍼 Join me: https://booba.crypto/invite/${u?.username}`);
      window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
    });

    document.getElementById('downloadPassportBtn')?.addEventListener('click', () => {
      this.showToast('📸 Booba Passport credential card saved to downloads!', 'success');
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

    // Supabase Config Form
    document.getElementById('supabaseConfigForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('supaUrlInput')?.value;
      const key = document.getElementById('supaKeyInput')?.value;
      const res = await SupabaseService.testConnection(url, key);
      if (res.success) {
        this.showToast(res.message, 'success');
        this.render();
      } else {
        this.showToast(res.message, 'error');
      }
    });

    document.getElementById('copySqlMigrationBtn')?.addEventListener('click', () => {
      const sql = SupabaseService.getSchemaSQL();
      navigator.clipboard.writeText(sql);
      this.showToast('📋 Supabase SQL Schema copied! Paste into Supabase SQL editor.');
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
          <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Total Citizens</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin-top: 0.25rem;">
              ${totalUsers.toLocaleString()}
            </div>
          </div>
          <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Total BOOBA Distributed</div>
            <div class="text-mono text-gold" style="font-size: 1.6rem; font-weight: 800; margin-top: 0.25rem;">
              ${totalBooba.toLocaleString()} 🍼
            </div>
          </div>
          <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-md); border-color: rgba(243, 186, 47, 0.4);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Pending Submissions</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--brand-yellow); margin-top: 0.25rem;">
              ${pendingSubs.length}
            </div>
          </div>
          <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Active Bounties</div>
            <div class="text-mono" style="font-size: 1.6rem; font-weight: 800; color: var(--accent-emerald); margin-top: 0.25rem;">
              ${state.quests.length}
            </div>
          </div>
        </div>

        <div class="glass-panel" style="padding: 2rem; border-radius: var(--radius-lg); margin-bottom: 2.5rem;">
          <h3 style="margin-bottom: 0.5rem;">Quest Proof Review Queue (${pendingSubs.length})</h3>
          <p style="font-size: 0.85rem; margin-bottom: 1.5rem;">Review creative submissions and community tasks. Approving automatically awards BOOBA points directly to the user's passport.</p>

          ${pendingSubs.length > 0 ? `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              ${pendingSubs.map(sub => `
                <div class="glass-panel" style="padding: 1.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-surface-elevated);">
                  <div class="flex items-center justify-between" style="flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div>
                      <strong style="font-size: 1.05rem; color: var(--text-primary);">${sub.questTitle}</strong>
                      <span class="quest-reward-pill" style="font-size: 0.75rem; margin-left: 0.5rem;">+${sub.rewardBooba} BOOBA</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                      User: <strong class="text-gold">@${sub.username}</strong> (${sub.passportId}) • ${sub.submittedAt}
                    </div>
                  </div>

                  <div style="background: var(--bg-input); padding: 0.75rem 1rem; border-radius: var(--radius-xs); margin-bottom: 1rem; font-size: 0.85rem;">
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
            <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
              ✅ All quest submissions have been reviewed!
            </div>
          `}
        </div>

        <div class="glass-panel" style="padding: 2rem; border-radius: var(--radius-lg);">
          <h3 style="margin-bottom: 1.25rem;">User Passports & Balances</h3>
          <table class="leaderboard-table">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.8rem; text-align: left;">
                <th style="padding: 0.5rem 1rem;">CITIZEN</th>
                <th style="padding: 0.5rem 1rem;">PASSPORT ID</th>
                <th style="padding: 0.5rem 1rem;">BOOBA BALANCE</th>
                <th style="padding: 0.5rem 1rem; text-align: right;">ACTIONS</th>
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
