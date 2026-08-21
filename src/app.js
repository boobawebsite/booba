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
    if (last === 'signin.html' || last === 'signin' || last === 'login' || last === 'signup') return 'signin';
    if (last === 'dashboard.html' || last === 'dashboard' || last === 'overview') return 'dashboard';
    if (last === 'passport.html' || last === 'passport') return 'passport';
    if (last === 'quests.html' || last === 'quests') return 'quests';
    if (last === 'leaderboard.html' || last === 'leaderboard') return 'leaderboard';
    if (last === 'rewards.html' || last === 'rewards') return 'rewards';
    if (last === 'referrals.html' || last === 'referrals') return 'referrals';
    
    // 3. Sub-path matching (e.g. /dashboard/leaderboard or /dashboard/quests)
    if (rawPath.includes('/signin')) return 'signin';
    if (rawPath.includes('/passport')) return 'passport';
    if (rawPath.includes('/quests')) return 'quests';
    if (rawPath.includes('/leaderboard')) return 'leaderboard';
    if (rawPath.includes('/rewards')) return 'rewards';
    if (rawPath.includes('/referrals')) return 'referrals';
    if (rawPath.includes('/dashboard')) return 'dashboard';

    // 4. Hash routing fallback
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'signin' || hash === 'login' || hash === 'signup' || hash === 'auth') return 'signin';
    if (hash.startsWith('dashboard/passport') || hash === 'passport') return 'passport';
    if (hash.startsWith('dashboard/quests') || hash === 'quests') return 'quests';
    if (hash.startsWith('dashboard/leaderboard') || hash === 'leaderboard') return 'leaderboard';
    if (hash.startsWith('dashboard/rewards') || hash === 'rewards') return 'rewards';
    if (hash.startsWith('dashboard/referrals') || hash === 'referrals') return 'referrals';
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
        <div style="padding: 0.75rem; background: var(--bg-surface-elevated); border-radius: var(--radius-md); margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--brand-yellow);">
            <div>
              <div style="font-weight: 700; color: var(--text-primary);">${user.username}</div>
              <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">${Number(user.boobaPoints).toLocaleString()} BOOBA • Lv.${levelInfo.level}</div>
            </div>
          </div>
        </div>
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
    const existing = document.getElementById('walletConnectDynamicModal');
    if (existing) existing.remove();

    // Trigger fresh EIP-6963 discovery
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eip6963:requestProvider'));
    }

    const modal = document.createElement('div');
    modal.id = 'walletConnectDynamicModal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="wallet-modal-card" style="position: relative; z-index: 1010;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(243, 186, 47, 0.12); border: 1px solid rgba(243, 186, 47, 0.3); display: flex; align-items: center; justify-content: center; color: var(--brand-yellow);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            </div>
            <div>
              <h2 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF;">Connect Web3 Wallet</h2>
              <span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 600;">BNB Smart Chain (BEP-20)</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('walletConnectDynamicModal').remove()" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <p style="font-size: 0.84rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Select your Web3 wallet provider to choose your account and connect (+100 BOOBA bonus).
        </p>

        <div id="walletOptionsContainer" class="wallet-options-list"></div>

        <!-- Divider for manual address input -->
        <div class="x-auth-divider">
          <span>or sign in with address</span>
        </div>

        <form id="manualWalletForm" onsubmit="window.boobaApp.handleManualWalletSubmit(event)" style="display: flex; flex-direction: column; gap: 0.65rem;">
          <input type="text" id="manualWalletAddressInput" placeholder="Paste BNB / EVM address (0x...)" class="x-input-field text-mono" style="font-size: 0.88rem;" required>
          <button type="submit" class="btn btn-primary btn-sm" style="padding: 0.7rem;">
            Sign In with Address (+100 BOOBA)
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    this.renderWalletOptionsList();
  }

  renderWalletOptionsList() {
    const container = document.getElementById('walletOptionsContainer');
    if (!container) return;

    // Detect installed standard extensions
    const hasMetaMask = Boolean(window.ethereum && (window.ethereum.isMetaMask || window.ethereum.providers?.some(p => p.isMetaMask)));
    const hasTrust = Boolean(window.trustwallet || window.ethereum?.isTrust);
    const hasBinance = Boolean(window.BinanceChain || window.ethereum?.isBinance);
    const hasOKX = Boolean(window.okxwallet);
    const hasCoinbase = Boolean(window.coinbaseWalletExtension);
    const hasGenericWeb3 = Boolean(window.ethereum);

    let html = '';

    // If EIP-6963 providers exist, show them dynamically
    if (this.eip6963Providers && this.eip6963Providers.size > 0) {
      this.eip6963Providers.forEach((detail, key) => {
        const info = detail.info || {};
        html += `
          <div class="wallet-option-item" onclick="window.boobaApp.connectEIP6963Wallet('${key}')">
            <div class="wallet-option-left">
              <img src="${info.icon || 'assets/mascot.jpg'}" style="width: 32px; height: 32px; border-radius: 8px; object-fit: contain;">
              <div>
                <div class="wallet-option-title">${info.name || 'Web3 Wallet'}</div>
                <div class="wallet-option-desc">EIP-6963 Detected Extension</div>
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
            <div class="wallet-option-desc">Connect & choose account in MetaMask</div>
          </div>
        </div>
        ${hasMetaMask ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--text-muted);">Popular</span>`}
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
        ${hasTrust ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--text-muted);">BEP-20</span>`}
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
        ${hasBinance ? `<span class="wallet-detected-badge">Detected</span>` : `<span style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Native</span>`}
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
        ${hasOKX ? `<span class="wallet-detected-badge">Detected</span>` : ``}
      </div>

      <!-- 5. Coinbase / Other Browser Wallet -->
      <div class="wallet-option-item" onclick="window.boobaApp.connectWalletProvider('injected')">
        <div class="wallet-option-left">
          <div class="wallet-logo-icon" style="background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <div>
            <div class="wallet-option-title">Coinbase / Browser Wallet</div>
            <div class="wallet-option-desc">Connect any installed EVM Web3 provider</div>
          </div>
        </div>
        ${hasGenericWeb3 ? `<span class="wallet-detected-badge">Available</span>` : ``}
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

    if (type === 'trust') {
      walletName = 'Trust Wallet';
      if (window.trustwallet?.ethereum) provider = window.trustwallet.ethereum;
      else if (window.ethereum?.isTrust) provider = window.ethereum;
    } else if (type === 'binance') {
      walletName = 'Binance Web3 Wallet';
      if (window.BinanceChain) provider = window.BinanceChain;
      else if (window.ethereum?.isBinance) provider = window.ethereum;
    } else if (type === 'okx') {
      walletName = 'OKX Wallet';
      if (window.okxwallet) provider = window.okxwallet;
    } else if (type === 'metamask') {
      walletName = 'MetaMask';
      if (window.ethereum) {
        if (window.ethereum.providers) {
          provider = window.ethereum.providers.find(p => p.isMetaMask) || window.ethereum;
        } else {
          provider = window.ethereum;
        }
      }
    } else {
      if (window.ethereum) provider = window.ethereum;
    }

    if (!provider) {
      // Check mobile deep link redirection
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const currentUrl = encodeURIComponent(window.location.href);

      if (isMobile && type === 'metamask') {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        return;
      }
      if (isMobile && type === 'trust') {
        window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${currentUrl}`;
        return;
      }

      const shouldManual = confirm(`${walletName} was not detected in this browser.\n\nWould you like to enter your BNB wallet address manually to sign in?`);
      if (shouldManual) {
        const addrInput = document.getElementById('manualWalletAddressInput');
        if (addrInput) addrInput.focus();
      }
      return;
    }

    await this.authenticateWithProvider(provider, walletName);
  }

  async authenticateWithProvider(provider, walletName) {
    try {
      let accounts = [];

      // Request permissions first to trigger official account picker dialog
      try {
        if (typeof provider.request === 'function') {
          const perm = await provider.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
          });
          if (perm && perm[0] && perm[0].caveats) {
            accounts = await provider.request({ method: 'eth_accounts' });
          }
        }
      } catch (permErr) {
        // Fallback to standard eth_requestAccounts
      }

      if (!accounts || accounts.length === 0) {
        if (typeof provider.request === 'function') {
          accounts = await provider.request({ method: 'eth_requestAccounts' });
        } else if (typeof provider.enable === 'function') {
          accounts = await provider.enable();
        }
      }

      if (!accounts || accounts.length === 0) {
        alert('No account selected in your Web3 wallet.');
        return;
      }

      // Check BNB Chain network (Chain ID 56 / 0x38)
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
              if (switchError.code === 4902) {
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
      } catch (netErr) {
        console.warn('Network check:', netErr);
      }

      const walletAddress = accounts[0];
      const res = await db.loginOrSignupWithWallet({ walletAddress });

      const modal = document.getElementById('walletConnectDynamicModal');
      if (modal) modal.remove();

      if (res.success) {
        if (res.isNewUser && res.seedPhrase) {
          this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
            window.location.href = 'dashboard.html';
          });
        } else {
          alert(`Connected with ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}! Welcome ${res.user.username}.`);
          window.location.href = 'dashboard.html';
        }
      } else {
        alert(res.message || 'Failed to authenticate with Web3 wallet.');
      }
    } catch (err) {
      if (err.code === 4001) {
        alert('Connection rejected in your wallet.');
      } else {
        alert(err.message || 'Error connecting to Web3 wallet.');
      }
    }
  }

  async handleManualWalletSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('manualWalletAddressInput');
    const addr = input?.value.trim();

    if (!addr || !addr.startsWith('0x') || addr.length < 15) {
      alert('Please enter a valid BNB Chain / EVM address starting with 0x (42 characters).');
      return;
    }

    const res = await db.loginOrSignupWithWallet({ walletAddress: addr });
    const modal = document.getElementById('walletConnectDynamicModal');
    if (modal) modal.remove();

    if (res.success) {
      if (res.isNewUser && res.seedPhrase) {
        this.showSeedPhraseModal(res.seedPhrase, res.user, () => {
          window.location.href = 'dashboard.html';
        });
      } else {
        alert(`Welcome back, ${res.user.username}!`);
        window.location.href = 'dashboard.html';
      }
    } else {
      alert(res.message || 'Failed to sign in with address.');
    }
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
  // 1. HOME LANDING VIEW
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
            <strong>500,000 $BOOBA</strong> Season 1 Reward Pool
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <strong>Zero Gas Passport</strong> Instant Local & Cloud Sync
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
            <strong>Daily Check-In Streaks</strong> Up to 5x Points Multiplier
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
            <strong>500,000 $BOOBA</strong> Season 1 Reward Pool
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <strong>Zero Gas Passport</strong> Instant Local & Cloud Sync
          </div>
          <div class="ticker-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
            <strong>Daily Check-In Streaks</strong> Up to 5x Points Multiplier
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
              Mint your digital on-chain Booba Passport, conquer live bounties, climb decentralized leaderboards, and accumulate real $BOOBA rewards.
            </p>

            <div class="hero-actions">
              ${user ? `
                <a href="dashboard.html" class="btn btn-primary btn-lg">
                  Launch Dashboard ↗
                </a>
                <a href="quests.html" class="btn btn-secondary btn-lg">
                  Explore Quests & Bounties
                </a>
              ` : `
                <a href="signin.html#signup" class="btn btn-primary btn-lg">
                  Mint Passport (+100 BOOBA)
                </a>
                <a href="signin.html#signin" class="btn btn-secondary btn-lg">
                  Sign In to Account
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
                <div class="stat-label">$BOOBA Circulating</div>
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

      <!-- 3. CHAINDUSTRY-STYLE HIGH-TECH BENTO GRID -->
      <section class="section-container" style="background: var(--bg-surface); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); padding: 6rem 0;">
        <div class="container">
          <div class="section-header text-center" style="margin-bottom: 4rem;">
            <h2 class="section-title" style="font-size: clamp(2rem, 3.8vw, 3rem); color: #FFFFFF;">Engineered for True Web3 Dominance</h2>
            <p class="section-subtitle" style="font-size: 1.1rem; color: var(--text-secondary); max-width: 620px; margin: 0.75rem auto 0 auto;">
              A frictionless ecosystem combining non-custodial cryptographic passports, automated bounty verification, and fair on-chain distributions.
            </p>
          </div>

          <div class="bento-grid" id="dominanceBentoGrid">
            
            <!-- Bento Card 1 (Large 8-col): Digital Passport (Left) -->
            <div class="bento-card bento-col-8 bento-from-left">
              <div class="bento-glow-blob"></div>
              <div>
                <div class="bento-card-header">
                  <div class="bento-icon-badge">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><line x1="15" y1="8" x2="17" y2="8"></line><line x1="15" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line></svg>
                  </div>
                  <span class="badge-tag">BIP-39 Secured</span>
                </div>
                <h3 class="bento-title">Non-Custodial Digital Passport</h3>
                <p class="bento-desc">
                  Your cryptographic on-chain identity. Backed by a 12-word master seed phrase, instant Web3 wallet binding (MetaMask, Trust Wallet, Binance Web3), and automated reputation score tracking.
                </p>
              </div>

              <!-- Mini Passport Interactive Display -->
              <div class="bento-mini-passport">
                <div style="display: flex; align-items: center; gap: 1rem;">
                  <img src="assets/mascot.jpg" style="width: 44px; height: 44px; border-radius: 12px; border: 1.5px solid var(--brand-yellow);">
                  <div>
                    <div style="font-weight: 800; color: #FFFFFF; font-size: 0.95rem;">Booba Master Identity</div>
                    <div style="font-size: 0.75rem; color: var(--brand-yellow); font-family: var(--font-mono);">BEP-20 • ID: BB-994821</div>
                  </div>
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 0.7rem; color: var(--accent-emerald); font-weight: 700; background: rgba(16, 185, 129, 0.15); padding: 0.2rem 0.6rem; border-radius: 999px;">● 100% On-Chain</span>
                </div>
              </div>
            </div>

            <!-- Bento Card 2 (4-col): Live Bounty Engine (Right) -->
            <div class="bento-card bento-col-4 bento-from-right">
              <div class="bento-glow-blob" style="background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);"></div>
              <div>
                <div class="bento-card-header">
                  <div class="bento-icon-badge" style="background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  </div>
                  <span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); border-color: rgba(16, 185, 129, 0.3);">Live Bounties</span>
                </div>
                <h3 class="bento-title">Real-Time Quests</h3>
                <p class="bento-desc">
                  Daily check-in streaks, viral X/Twitter raids, and creative meme contests with instant team proof verification and reward claims.
                </p>
              </div>
              <a href="quests.html" class="btn btn-secondary btn-block btn-sm" style="margin-top: 1rem;">View Active Quests →</a>
            </div>

            <!-- Bento Card 3 (4-col): Real Leaderboard (Left) -->
            <div class="bento-card bento-col-4 bento-from-left">
              <div>
                <div class="bento-card-header">
                  <div class="bento-icon-badge" style="background: rgba(255, 122, 0, 0.12); color: var(--accent-orange); border-color: rgba(255, 122, 0, 0.3);">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                  </div>
                  <span class="badge-tag">Fair Ranking</span>
                </div>
                <h3 class="bento-title">Anti-Sybil Leaderboard</h3>
                <p class="bento-desc">
                  Rank up with genuine community contributions. Top tier holders qualify for exclusive airdrop snapshots and VIP alpha vault access.
                </p>
              </div>
              <a href="leaderboard.html" class="btn btn-secondary btn-block btn-sm" style="margin-top: 1rem;">Check Ranks →</a>
            </div>

            <!-- Bento Card 4 (Large 8-col): 10 Progression Tiers (Right) -->
            <div class="bento-card bento-col-8 bento-from-right">
              <div class="bento-glow-blob"></div>
              <div>
                <div class="bento-card-header">
                  <div class="bento-icon-badge">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
                  </div>
                  <span class="badge-tag">10 VIP Tiers</span>
                </div>
                <h3 class="bento-title">Progressive Level Unlocks & Vault Perks</h3>
                <p class="bento-desc">
                  From Lv.1 Explorer to Lv.10 Booba Master. As your $BOOBA balance expands, unlock custom Telegram badges, private alpha channels, boosted bounty multipliers, and governance voting weight.
                </p>
              </div>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin-top: 1rem;">
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); padding: 0.75rem; border-radius: 12px; text-align: center;">
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Lv.1 Explorer</div>
                  <div style="font-weight: 800; color: var(--brand-yellow); font-size: 0.9rem;">100 BOOBA</div>
                </div>
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); padding: 0.75rem; border-radius: 12px; text-align: center;">
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Lv.5 Guardian</div>
                  <div style="font-weight: 800; color: var(--brand-yellow); font-size: 0.9rem;">3,000 BOOBA</div>
                </div>
                <div style="background: rgba(243, 186, 47, 0.1); border: 1px solid rgba(243, 186, 47, 0.4); padding: 0.75rem; border-radius: 12px; text-align: center;">
                  <div style="font-size: 0.75rem; color: var(--brand-yellow); font-weight: 700;">Lv.10 Master</div>
                  <div style="font-weight: 800; color: #FFFFFF; font-size: 0.9rem;">20,000+ BOOBA</div>
                </div>
              </div>
            </div>

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
                <a href="signin.html#signin" class="btn btn-secondary btn-lg">Sign In with Existing Account</a>
              `}
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

    container.innerHTML = `
      <div class="container page-content">
        
        <!-- USER PROFILE QUICK HERO BANNER -->
        <div class="dashboard-hero-card" style="background: linear-gradient(135deg, rgba(243, 186, 47, 0.12) 0%, rgba(14, 18, 27, 0.85) 60%, rgba(7, 9, 14, 0.95) 100%); border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px; padding: 2.5rem; margin-bottom: 2.5rem; position: relative; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(243, 186, 47, 0.12);">
          
          <div style="position: absolute; right: -20px; bottom: -20px; opacity: 0.12; pointer-events: none;">
            <img src="assets/mascot.jpg" style="width: 260px; height: 260px; border-radius: 50%;">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; position: relative; z-index: 1;">
            <div style="display: flex; align-items: center; gap: 1.5rem;">
              <div style="position: relative;">
                <img src="${user.avatar || 'assets/mascot.jpg'}" style="width: 84px; height: 84px; border-radius: 20px; border: 2.5px solid var(--brand-yellow); object-fit: cover; box-shadow: 0 0 25px var(--brand-yellow-glow);">
                <div style="position: absolute; bottom: -4px; right: -4px; background: var(--brand-yellow); color: #000; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.45rem; border-radius: 999px; border: 2px solid #000;">
                  Lv.${levelInfo.level}
                </div>
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                  <span class="badge-tag" style="background: var(--brand-yellow); color: #000; font-weight: 800; font-size: 0.78rem;">
                    Lv.${levelInfo.level} ${levelInfo.title}
                  </span>
                  ${user.role === 'admin' ? '<a href="teamadmin.html" class="badge-tag" style="background: rgba(243, 186, 47, 0.2); color: var(--brand-yellow); border-color: var(--brand-yellow); font-weight: 800; display: inline-flex; align-items: center; gap: 0.35rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Admin Access</a>' : ''}
                </div>

                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.4rem; display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;">
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

            <!-- Quick Action Button -->
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
              <button class="btn btn-primary btn-lg" onclick="window.boobaApp.handleDailyCheckIn()" style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>
                <span>Claim Daily Streak (+50 BOOBA)</span>
              </button>
            </div>

          </div>

          <!-- Level Progression Bar -->
          <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
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
            <div style="font-size: 0.78rem; color: var(--accent-emerald); margin-top: 0.4rem; font-weight: 600; display: flex; align-items: center; gap: 0.3rem;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Instant Claim Active
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
            <button type="button" class="btn btn-outline btn-sm" onclick="window.boobaApp.showSeedPhraseModal(db.currentUser.seedPhrase, db.currentUser)">
              Backup & View Phrase
            </button>
          </div>
        ` : ''}

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
          <div class="card text-center" style="max-width: 500px; margin: 4rem auto; padding: 3.5rem 2.5rem; border: 1.5px solid rgba(243, 186, 47, 0.35); border-radius: 28px;">
            <img src="assets/mascot.jpg" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 1.5rem auto; border: 2.5px solid var(--brand-yellow);">
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
          
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 2rem;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin: 0;">Community Bounties & Missions</h2>
              <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">Complete active tasks below to earn cryptographic $BOOBA tokens and rank up.</p>
            </div>

            <!-- Filter Pills: All, Daily check-in, Community, Engagement, Content Production -->
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
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
                Content Production
              </button>
            </div>
          </div>

          <!-- Quests Grid OR 10-Card Apple Vision Pro Daily Carousel -->
          ${this.activeQuestFilter === 'daily' ? `
            <!-- 10-CARD APPLE VISION PRO DAILY CHECK-IN CAROUSEL -->
            <div style="margin-bottom: 3.5rem;">
              
              <!-- Top Streak Header -->
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
                    <span class="badge-tag" style="background: rgba(243, 186, 47, 0.15); color: var(--brand-yellow); border-color: rgba(243, 186, 47, 0.4); font-size: 0.82rem; padding: 0.35rem 0.9rem;">
                      <span class="pulse-dot" style="width: 6px; height: 6px;"></span>
                      <span>10-CARD 100-DAY EXPEDITION</span>
                    </span>
                    <span class="badge-tag" style="background: rgba(147, 51, 234, 0.15); color: #C084FC; border-color: rgba(147, 51, 234, 0.4); font-size: 0.82rem; padding: 0.35rem 0.9rem;">
                      CARD 10: GENESIS 1/1 NFT
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
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; max-width: 1000px; margin: 0 auto 3.5rem auto; align-items: flex-end;">
          
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

        <!-- FULL ON-CHAIN LEADERBOARD TABLE -->
        <div class="card" style="max-width: 1000px; margin: 0 auto; padding: 0; overflow: hidden; border-radius: 24px; background: rgba(14, 18, 27, 0.75);">
          <div style="padding: 1.75rem 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h3 style="font-size: 1.3rem; font-weight: 800; color: #FFFFFF; margin: 0;">Community Rankings (${users.length} Active Holders)</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0.2rem 0 0 0;">Updated in real-time from Supabase mainnet records.</p>
            </div>
          </div>

          <div style="overflow-x: auto;">
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

  async handleDailyCheckIn() {
    await this.handleClaimDailyStreak(db.currentUser ? Number(db.currentUser.streakDays || 1) : 1);
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

