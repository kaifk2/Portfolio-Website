/**
 * Smooth Scroll-Driven Frame Scrubbing Engine
 * Features:
 * - Preloads all sequence frames with hardware decode
 * - Dual-frame alpha cross-fading for seamless 60fps interpolation
 * - Smooth lerp momentum physics (inertia scroll)
 * - Cinematic subtle dolly zoom & interactive mouse parallax
 * - High-DPI / Retina responsive canvas cover logic
 */

(function () {
  'use strict';

  // --- Configuration ---
  const TOTAL_FRAMES = 11;
  const FRAME_PATH = (i) => `assets/frames/frame_${String(i).padStart(3, '0')}.png`;

  // Physics lerp speeds
  const SCROLL_EASE = 0.08;      // Smoothness factor for scroll momentum
  const PARALLAX_EASE = 0.06;    // Smoothness factor for mouse parallax

  // DOM Elements
  const canvas = document.getElementById('scrubCanvas');
  const ctx = canvas.getContext('2d');
  const loader = document.getElementById('loader');
  const progressBar = document.getElementById('progressBar');
  const scrollHint = document.getElementById('scrollHint');

  // State
  const images = [];
  let loadedCount = 0;
  let isReady = false;

  // Scroll targets & interpolated values
  let targetProgress = 0;
  let currentProgress = 0;

  // Mouse Parallax targets & interpolated values
  let targetMouseX = 0;
  let targetMouseY = 0;
  let currentMouseX = 0;
  let currentMouseY = 0;

  // Screen & Image Dimensions
  let canvasWidth = 0;
  let canvasHeight = 0;
  let dpr = 1;

  // --- Frame Preloading ---
  function preloadImages() {
    return new Promise((resolve) => {
      for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        img.src = FRAME_PATH(i);

        img.onload = async () => {
          if ('decode' in img) {
            try {
              await img.decode();
            } catch (_) {
              // fallback if decode fails
            }
          }
          loadedCount++;
          if (loadedCount === TOTAL_FRAMES) {
            resolve();
          }
        };

        img.onerror = () => {
          loadedCount++;
          if (loadedCount === TOTAL_FRAMES) {
            resolve();
          }
        };

        images.push(img);
      }
    });
  }

  // --- Responsive Canvas Resizing ---
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for optimal 60fps performance
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;

    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (isReady) {
      render();
    }
  }

  // --- Scroll Progress Calculation ---
  function updateScrollTarget() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    targetProgress = maxScroll > 0 ? Math.min(Math.max(scrollY / maxScroll, 0), 1) : 0;

    // Fade out scroll cue when user initiates scrolling
    const cue = scrollHint || document.querySelector('.scroll-cue');
    if (cue) {
      if (targetProgress > 0.02) {
        cue.style.opacity = '0';
        cue.style.transform = 'translateY(12px)';
        cue.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      } else {
        cue.style.opacity = '0.75';
        cue.style.transform = 'translateY(0)';
      }
    }
  }

  // --- Mouse Movement (Subtle 3D Parallax Tilt) ---
  function onMouseMove(e) {
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    targetMouseX = (e.clientX - halfW) / halfW; // -1 to +1
    targetMouseY = (e.clientY - halfH) / halfH; // -1 to +1
  }

  function onTouchMove(e) {
    if (e.touches && e.touches[0]) {
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      targetMouseX = ((e.touches[0].clientX - halfW) / halfW) * 0.5;
      targetMouseY = ((e.touches[0].clientY - halfH) / halfH) * 0.5;
    }
  }

  // --- Draw Image with Cinematic Cover & Offset ---
  function drawCoverImage(img, alpha, scaleFactor, offsetX, offsetY) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    // Aspect-ratio "cover" calculation
    const scale = Math.max(canvasWidth / imgW, canvasHeight / imgH) * scaleFactor;
    const renderW = imgW * scale;
    const renderH = imgH * scale;

    // Horizontal framing: On desktop widescreen, shift slightly right to balance left-side text
    let horizontalBias = 0.5;
    if (canvasWidth > 1100) {
      horizontalBias = 0.65; // Place subject slightly to the right side
    } else if (canvasWidth > 860) {
      horizontalBias = 0.58;
    }

    const dx = (canvasWidth - renderW) * (1 - horizontalBias) + offsetX;

    // Vertical framing: subtle 42% focal bias towards subject's face + parallax offset
    const dy = (canvasHeight - renderH) * 0.40 + offsetY;

    ctx.drawImage(img, dx, dy, renderW, renderH);
    ctx.restore();
  }

  // --- Main Render Function ---
  function render() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Subtle zoom dolly effect on scroll: scale from 1.0 to 1.045
    const dollyScale = 1.0 + currentProgress * 0.045;

    // Subtle parallax translation in pixels (±12px X, ±8px Y)
    const parallaxX = currentMouseX * 12;
    const parallaxY = currentMouseY * 8;

    // Calculate exact virtual frame position
    const totalSpan = TOTAL_FRAMES - 1;
    const virtualFrame = currentProgress * totalSpan;
    const frameIndexA = Math.min(Math.floor(virtualFrame), totalSpan);
    const frameIndexB = Math.min(frameIndexA + 1, totalSpan);
    const blendFraction = virtualFrame - frameIndexA;

    const imgA = images[frameIndexA];
    const imgB = images[frameIndexB];

    // Dual-frame crossfade interpolation for fluid 60fps motion
    if (imgA && imgB && frameIndexA !== frameIndexB) {
      // Base frame A
      drawCoverImage(imgA, 1.0, dollyScale, parallaxX, parallaxY);
      // Blended frame B on top
      if (blendFraction > 0.005) {
        drawCoverImage(imgB, blendFraction, dollyScale, parallaxX, parallaxY);
      }
    } else if (imgA) {
      drawCoverImage(imgA, 1.0, dollyScale, parallaxX, parallaxY);
    }

    // Update progress bar
    if (progressBar) {
      progressBar.style.height = `${(currentProgress * 100).toFixed(2)}%`;
    }
  }

  // --- Smooth Animation Loop ---
  function loop() {
    // Lerp scroll progress with inertia
    const scrollDiff = targetProgress - currentProgress;
    currentProgress += scrollDiff * SCROLL_EASE;

    // Lerp mouse parallax
    currentMouseX += (targetMouseX - currentMouseX) * PARALLAX_EASE;
    currentMouseY += (targetMouseY - currentMouseY) * PARALLAX_EASE;

    // Render frame
    render();

    requestAnimationFrame(loop);
  }

  // --- Initialization ---
  async function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('scroll', updateScrollTarget, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    // Initial scroll position
    updateScrollTarget();
    currentProgress = targetProgress;

    // Preload all frames
    await preloadImages();
    isReady = true;

    // Dismiss preloader smoothly
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 200);

    // Start 60fps render loop
    requestAnimationFrame(loop);

    // Subtle scroll reveal observer for cards and sections
    initScrollReveal();
  }

  function initScrollReveal() {
    const revealElements = document.querySelectorAll(
      '.about-card, .experience-card, .project-card, .tools-showcase-card, .services-chips-container, .tech-stack-card, .contact-card-main'
    );
    
    revealElements.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
      el.style.transition = 'opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px'
      }
    );

    revealElements.forEach((el) => observer.observe(el));
  }

  // Keyboard navigation support
  window.addEventListener('keydown', (e) => {
    const step = window.innerHeight * 0.4;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      window.scrollBy({ top: step, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      window.scrollBy({ top: -step, behavior: 'smooth' });
    } else if (e.key === 'Home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
