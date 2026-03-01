/**
 * PDFix - Main JavaScript
 * Shared logic: navbar scroll, drag-and-drop, file handling, toasts, reveals
 */

// ── Navbar Scroll Effect ──────────────────────────────────────────────
(function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
})();

// ── Scroll Reveal ─────────────────────────────────────────────────────
(function initReveal() {
  const revealEls = document.querySelectorAll('.reveal');
  if (!revealEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  revealEls.forEach(el => observer.observe(el));
})();

// ── Counter Animation ─────────────────────────────────────────────────
(function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const formatNum = (n) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return n.toString();
  };

  const animateCounter = (el) => {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(eased * target);
      el.textContent = formatNum(current) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
})();

// ── Category Tabs Filter ──────────────────────────────────────────────
(function initCategoryTabs() {
  const tabs = document.querySelectorAll('.category-tab');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.dataset.filter;
      const cards = document.querySelectorAll('.tool-card');

      cards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = '';
          card.style.animation = 'none';
          requestAnimationFrame(() => {
            card.style.animation = '';
          });
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
})();

// ── Toast Notification System ─────────────────────────────────────────
const Toast = (() => {
  let container = null;

  const getContainer = () => {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  };

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const show = (message, type = 'info', duration = 3500) => {
    const c = getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${icons[type] || icons.info}</span>
      <span class="toast__msg">${message}</span>
    `;
    c.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };

  return { show };
})();

// Make Toast globally available
window.Toast = Toast;

// ── File Size Formatter ───────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
window.formatFileSize = formatFileSize;

// ── PDF Drop Zone Handler ─────────────────────────────────────────────
function createDropZone(options = {}) {
  const {
    zoneSelector = '.upload-zone',
    inputId = 'pdf-file-input',
    fileListSelector = '.file-list',
    accept = '.pdf,application/pdf',
    multiple = false,
    onFilesAdded = null,
    maxFileSizeMB = 100,
  } = options;

  const zone = document.querySelector(zoneSelector);
  const fileInput = document.getElementById(inputId);
  const fileListEl = document.querySelector(fileListSelector);

  if (!zone || !fileInput) return null;

  let files = [];

  // Only the button opens file dialog — NO zone-level click
  const browseBtn = zone.querySelector('.upload-zone__btn button, .upload-zone__btn');
  if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
  }

  // Drag events
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    e.target.value = ''; // reset so same file can be added again
  });

  // Global drag-over body (visual cue)
  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop', (e) => e.preventDefault());

  const validateFile = (file) => {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPDF && accept.includes('.pdf')) {
      Toast.show(`"${file.name}" is not a valid PDF file.`, 'error');
      return false;
    }
    if (file.size > maxFileSizeMB * 1024 * 1024) {
      Toast.show(`"${file.name}" exceeds the ${maxFileSizeMB}MB limit.`, 'error');
      return false;
    }
    return true;
  };

  const handleFiles = (newFiles) => {
    const valid = newFiles.filter(validateFile);
    if (!valid.length) return;

    if (!multiple) {
      files = [valid[0]];
    } else {
      valid.forEach(f => {
        if (!files.some(existing => existing.name === f.name && existing.size === f.size)) {
          files.push(f);
        }
      });
    }

    renderFileList();
    if (onFilesAdded) onFilesAdded(files);
  };

  const renderFileList = () => {
    if (!fileListEl) return;
    fileListEl.innerHTML = '';

    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <div class="file-item__icon">📄</div>
        <div class="file-item__info">
          <div class="file-item__name" title="${file.name}">${file.name}</div>
          <div class="file-item__size">${formatFileSize(file.size)}</div>
        </div>
        <button class="file-item__remove" data-index="${index}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      `;
      fileListEl.appendChild(item);
    });

    // Remove button handlers
    fileListEl.querySelectorAll('.file-item__remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index, 10);
        files.splice(idx, 1);
        renderFileList();
        if (onFilesAdded) onFilesAdded(files);
      });
    });

    // Show/hide zone content
    const zoneContent = zone.querySelector('.upload-zone__content');
    if (zoneContent) {
      zoneContent.style.display = files.length > 0 ? 'none' : '';
    }
  };

  const getFiles = () => files;
  const clearFiles = () => {
    files = [];
    renderFileList();
  };

  return { getFiles, clearFiles, handleFiles };
}
window.createDropZone = createDropZone;

// ── Simulated Processing (client-side demo) ───────────────────────────
function simulateProgress(options = {}) {
  const {
    progressBarSelector = '.progress-bar',
    progressWrapSelector = '.progress-bar-wrap',
    statusSelector = '.process-status',
    onComplete = null,
    duration = 2500,
  } = options;

  const bar = document.querySelector(progressBarSelector);
  const wrap = document.querySelector(progressWrapSelector);
  const statusEl = document.querySelector(statusSelector);

  if (!bar) return;
  if (wrap) wrap.style.display = 'block';

  const messages = ['Analyzing file...', 'Processing...', 'Optimizing...', 'Finalizing...'];
  let msgIdx = 0;
  let width = 0;
  const interval = 50;
  const steps = duration / interval;
  const increment = 100 / steps;

  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    if (statusEl) statusEl.textContent = messages[msgIdx];
  }, duration / messages.length);

  const progressInterval = setInterval(() => {
    width = Math.min(width + increment * (0.5 + Math.random()), 99);
    bar.style.width = width + '%';

    if (width >= 99) {
      clearInterval(progressInterval);
      clearInterval(msgInterval);
      bar.style.width = '100%';
      if (statusEl) statusEl.textContent = 'Done!';
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 300);
    }
  }, interval);
}
window.simulateProgress = simulateProgress;

// ── Ripple Effect ─────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.ripple-btn');
  if (!btn) return;
  const circle = document.createElement('span');
  circle.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.style.cssText = `
    width: ${size}px; height: ${size}px;
    left: ${e.clientX - rect.left - size / 2}px;
    top: ${e.clientY - rect.top - size / 2}px;
  `;
  btn.appendChild(circle);
  circle.addEventListener('animationend', () => circle.remove());
});

// ── Particle Background ───────────────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.r = Math.random() * 1.5 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = -(Math.random() * 0.5 + 0.2);
      this.alpha = Math.random() * 0.4 + 0.1;
      this.color = Math.random() > 0.5 ? '#FF6B35' : '#F72585';
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.alpha -= 0.0008;
      if (this.y < -10 || this.alpha <= 0) this.reset();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < 60; i++) particles.push(new Particle());

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    animId = requestAnimationFrame(animate);
  };

  animate();
})();

// ── Smooth anchor scroll ──────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
