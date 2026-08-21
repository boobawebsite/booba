/* ==========================================================================
   BOOBA (BNB baby) — Living Motion & WebGL Interactive Engine (motion.js)
   WebGL Starfield • Lenis Smooth Scroll • GSAP Spring Physics • 3D Tilt Glare
   Inspired by Apple Vision Pro, Chaindustry, Firewatch & Wayfinder
   ========================================================================== */

export class MotionEngine {
  constructor() {
    this.lenis = null;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animFrameId = null;
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.targetMouseX = -1000;
    this.targetMouseY = -1000;
    this.cursorSpotlight = null;
    this.isReducedMotion = false;
    this.isInitialized = false;

    // Check accessibility preference
    if (typeof window !== 'undefined') {
      this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  /**
   * Main Initialization
   */
  init() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    this.setupCursorSpotlight();
    this.initLenisScroll();
    this.initParticleConstellation();
    this.initMagneticCardTilts();
    this.initScrollAnimations();
    this.initFloatingParallaxCoins();

    // Listen for resize and visibility
    window.addEventListener('resize', () => this.handleResize(), { passive: true });
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e), { passive: true });
  }

  /**
   * 1. NATIVE BROWSER SCROLLING (Standard, natural, responsive scroll)
   */
  initLenisScroll() {
    // Disabled inertia momentum scroll to use natural standard browser scrolling
    if (this.lenis && typeof this.lenis.destroy === 'function') {
      this.lenis.destroy();
      this.lenis = null;
    }
  }

  /**
   * 2. LUMINOUS CURSOR SPOTLIGHT (Follows mouse across dark glass surfaces)
   */
  setupCursorSpotlight() {
    let spotlight = document.getElementById('cursorSpotlight');
    if (!spotlight) {
      spotlight = document.createElement('div');
      spotlight.id = 'cursorSpotlight';
      spotlight.className = 'cursor-spotlight';
      document.body.appendChild(spotlight);
    }
    this.cursorSpotlight = spotlight;

    let currentX = -1000;
    let currentY = -1000;

    const updateSpotlight = () => {
      if (this.cursorSpotlight && this.targetMouseX > -500) {
        // Fluid spring interpolation
        currentX += (this.targetMouseX - currentX) * 0.12;
        currentY += (this.targetMouseY - currentY) * 0.12;
        this.cursorSpotlight.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
      requestAnimationFrame(updateSpotlight);
    };
    requestAnimationFrame(updateSpotlight);
  }

  handleMouseMove(e) {
    this.targetMouseX = e.clientX;
    this.targetMouseY = e.clientY;
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;

    // Update CSS variables for radial gradients on interactive cards
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
  }

  /**
   * 3. WEBGL / CANVAS INTERACTIVE CONSTELLATION & GOLDEN DUST (Wayfinder / Chaindustry)
   */
  initParticleConstellation() {
    let canvas = document.getElementById('bgConstellationCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'bgConstellationCanvas';
      canvas.className = 'bg-constellation-canvas';
      document.body.prepend(canvas);
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    this.handleResize();
    this.spawnParticles();
    this.renderParticles();
  }

  handleResize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawnParticles() {
    const count = Math.min(75, Math.floor(window.innerWidth / 22));
    this.particles = [];

    for (let i = 0; i < count; i++) {
      const isGold = Math.random() > 0.4;
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        baseRadius: Math.random() * 2 + 0.8,
        radius: Math.random() * 2 + 0.8,
        color: isGold ? 'rgba(243, 186, 47, ' : 'rgba(255, 255, 255, ',
        alpha: Math.random() * 0.6 + 0.2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
        pulseVal: Math.random() * Math.PI,
        mass: Math.random() * 1.5 + 0.5
      });
    }
  }

  renderParticles() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    const mouseRadius = 160;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Update position
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      // Pulse glow
      p.pulseVal += p.pulseSpeed;
      const currentAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulseVal));

      // Cursor gravity / gentle magnetic repulsion
      const dx = this.mouseX - p.x;
      const dy = this.mouseY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouseRadius && dist > 0) {
        const force = (1 - dist / mouseRadius) * 2.5;
        p.x -= (dx / dist) * force;
        p.y -= (dy / dist) * force;
      }

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${currentAlpha})`;
      ctx.fill();

      // Connect nearby particles with luminous gold filaments
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const linkDist = Math.hypot(p.x - p2.x, p.y - p2.y);
        const maxDist = 110;

        if (linkDist < maxDist) {
          const lineAlpha = (1 - linkDist / maxDist) * 0.15;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(243, 186, 47, ${lineAlpha})`;
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.renderParticles());
  }

  /**
   * 4. 3D MAGNETIC CARD TILTS & SPECULAR GLARE (Apple Vision Pro)
   */
  initMagneticCardTilts() {
    if (this.isReducedMotion) return;

    // Attach to all major interactive cards
    const tiltCards = document.querySelectorAll(
      '.card, .passport-card, .x-auth-layout, .quest-item-card, .stat-badge, .feature-card, .hero-mascot-card, .bento-card, .pipeline-card, .cta-banner-card, .mascot-hologram-wrapper'
    );

    tiltCards.forEach((card) => {
      if (card.dataset.hasTiltListener) return;
      card.dataset.hasTiltListener = 'true';

      // Insert specular glare overlay if missing
      let glare = card.querySelector('.card-specular-glare');
      if (!glare) {
        glare = document.createElement('div');
        glare.className = 'card-specular-glare';
        card.appendChild(glare);
      }

      let isHovered = false;

      card.addEventListener('mouseenter', () => {
        isHovered = true;
        card.style.transition = 'transform 0.1s ease-out, box-shadow 0.25s ease';
      });

      card.addEventListener('mousemove', (e) => {
        if (!isHovered) return;
        const rect = card.getBoundingClientRect();
        const cardX = e.clientX - rect.left;
        const cardY = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((cardY - centerY) / centerY) * -7; // Max tilt 7deg
        const rotateY = ((cardX - centerX) / centerX) * 7;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translate3d(0, -4px, 10px)`;

        // Position specular glare
        if (glare) {
          const glareX = (cardX / rect.width) * 100;
          const glareY = (cardY / rect.height) * 100;
          glare.style.opacity = '1';
          glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.15) 0%, rgba(243, 186, 47, 0.05) 40%, transparent 80%)`;
        }
      });

      card.addEventListener('mouseleave', () => {
        isHovered = false;
        card.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.6s ease';
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)';
        if (glare) {
          glare.style.opacity = '0';
        }
      });
    });
  }

  /**
   * 5. ENERGETIC POP-INTO-SPACE SCROLL REVEALS
   */
  initScrollAnimations() {
    if (this.isReducedMotion) return;

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);

      // 1. Dedicated Flying In from Left & Right for "Engineered for True Web3 Dominance" Bento Grid
      const bentoLeft = document.querySelectorAll('.bento-from-left');
      const bentoRight = document.querySelectorAll('.bento-from-right');

      if (bentoLeft.length > 0) {
        window.gsap.fromTo(
          bentoLeft,
          {
            opacity: 0,
            x: -260,
            scale: 0.92
          },
          {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: 0.9,
            stagger: 0.15,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '#dominanceBentoGrid',
              start: 'top 85%',
              toggleActions: 'restart none none reset' // Always replays when scrolled to
            }
          }
        );
      }

      if (bentoRight.length > 0) {
        window.gsap.fromTo(
          bentoRight,
          {
            opacity: 0,
            x: 260,
            scale: 0.92
          },
          {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: 0.9,
            stagger: 0.15,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: '#dominanceBentoGrid',
              start: 'top 85%',
              toggleActions: 'restart none none reset' // Always replays when scrolled to
            }
          }
        );
      }

      // 2. Staggered Pop-In for Other Grids & Containers (Pipeline, Stats, etc.)
      const otherGridContainers = document.querySelectorAll('.pipeline-grid, .hero-stats-grid, .grid');
      otherGridContainers.forEach((container) => {
        const items = container.children;
        if (items.length > 0) {
          window.gsap.fromTo(
            items,
            {
              opacity: 0,
              y: 55,
              scale: 0.88,
              transformOrigin: '50% 100%'
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.75,
              stagger: 0.12,
              ease: 'back.out(1.6)', // Lively pop spring bounce
              scrollTrigger: {
                trigger: container,
                start: 'top 85%',
                toggleActions: 'restart none none reset'
              }
            }
          );
        }
      });

      // 2. Individual Section Headers & Standalone Cards
      const standaloneElements = document.querySelectorAll(
        '.section-header, .cta-banner-card, .podium-card, .leaderboard-table, .passport-container, .admin-gate-card'
      );

      standaloneElements.forEach((el) => {
        if (!el.dataset.hasScrollAnim) {
          el.dataset.hasScrollAnim = 'true';
          window.gsap.fromTo(
            el,
            {
              opacity: 0,
              y: 50,
              scale: 0.92
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.8,
              ease: 'back.out(1.5)',
              scrollTrigger: {
                trigger: el,
                start: 'top 86%',
                toggleActions: 'play none none none'
              }
            }
          );
        }
      });

      // 3. 3D Floating Mascot Spring Pulse
      const mascot = document.querySelector('.hero-mascot-img, .x-auth-giant-logo');
      if (mascot && !mascot.dataset.hasFloatAnim) {
        mascot.dataset.hasFloatAnim = 'true';
        window.gsap.to(mascot, {
          y: -12,
          rotation: 1.5,
          duration: 3,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }

      // 4. Animate Numeric Counters
      this.animateNumberCounters();
    } else {
      // Fallback IntersectionObserver with Pop-In animation
      this.initIntersectionObserverFallback();
    }
  }

  initIntersectionObserverFallback() {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('pop-in-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.bento-card, .pipeline-card, .card, .cta-banner-card, .section-header').forEach((el) => {
      el.classList.add('pop-in-init');
      observer.observe(el);
    });
  }

  animateNumberCounters() {
    const counterElements = document.querySelectorAll('[data-counter-target]');
    counterElements.forEach((el) => {
      const target = parseFloat(el.getAttribute('data-counter-target')) || 0;
      const prefix = el.getAttribute('data-counter-prefix') || '';
      const suffix = el.getAttribute('data-counter-suffix') || '';

      if (window.gsap) {
        const obj = { val: 0 };
        window.gsap.to(obj, {
          val: target,
          duration: 1.8,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = `${prefix}${Math.round(obj.val).toLocaleString()}${suffix}`;
          }
        });
      } else {
        el.textContent = `${prefix}${target.toLocaleString()}${suffix}`;
      }
    });
  }

  /**
   * 6. FLOATING 3D COINS & PARALLAX DUST (Firewatch Depth)
   */
  initFloatingParallaxCoins() {
    let container = document.getElementById('floatingCoinsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floatingCoinsContainer';
      container.className = 'floating-coins-container';
      container.innerHTML = `
        <div class="floating-coin coin-1"></div>
        <div class="floating-coin coin-2"></div>
        <div class="floating-coin coin-3"></div>
      `;
      document.body.prepend(container);
    }

    if (window.gsap) {
      window.gsap.to('.coin-1', {
        y: 'random(-20, 20)',
        x: 'random(-15, 15)',
        rotation: 360,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
      window.gsap.to('.coin-2', {
        y: 'random(-25, 25)',
        x: 'random(-20, 20)',
        rotation: -360,
        duration: 11,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
      window.gsap.to('.coin-3', {
        y: 'random(-30, 30)',
        rotation: 180,
        duration: 9,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }
  }

  /**
   * Refresh dynamic elements (called on page switch or data render)
   */
  refresh() {
    this.initMagneticCardTilts();
    this.initScrollAnimations();
  }
}

export const motionEngine = new MotionEngine();
