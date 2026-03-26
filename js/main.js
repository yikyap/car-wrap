// === Sticky header ===
const header = document.querySelector('.header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 60);
});

// === Mobile menu ===
const hamburger = document.querySelector('.hamburger');
const mobileNav = document.querySelector('.mobile-nav');
hamburger.addEventListener('click', () => {
  mobileNav.classList.toggle('open');
  document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
});
mobileNav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// === Scroll reveal ===
const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.15 });
reveals.forEach(el => revealObserver.observe(el));

// === Lightbox ===
const lightbox = document.getElementById('lightbox');
if (lightbox) {
  const lbImg = lightbox.querySelector('.lightbox-img');
  const lbCounter = lightbox.querySelector('.lightbox-counter');
  const mosaicItems = [...document.querySelectorAll('.mosaic-item[data-src]')];
  let currentIdx = 0;

  const showImage = (idx) => {
    currentIdx = idx;
    lbImg.src = mosaicItems[idx].dataset.src;
    lbImg.alt = mosaicItems[idx].querySelector('img').alt;
    lbCounter.textContent = `${idx + 1} / ${mosaicItems.length}`;
  };

  mosaicItems.forEach((item, i) => {
    item.addEventListener('click', () => {
      showImage(i);
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  lightbox.querySelector('.lightbox-close').addEventListener('click', () => {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  });

  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => {
    showImage((currentIdx - 1 + mosaicItems.length) % mosaicItems.length);
  });

  lightbox.querySelector('.lightbox-next').addEventListener('click', () => {
    showImage((currentIdx + 1) % mosaicItems.length);
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') { lightbox.classList.remove('open'); document.body.style.overflow = ''; }
    if (e.key === 'ArrowLeft') showImage((currentIdx - 1 + mosaicItems.length) % mosaicItems.length);
    if (e.key === 'ArrowRight') showImage((currentIdx + 1) % mosaicItems.length);
  });
}

// === Estimate bar expand ===
const expandBtn = document.getElementById('estimate-expand-btn');
const quoteSection = document.getElementById('quote-form-section');
const quoteClose = document.getElementById('quote-form-close');
const estimateBarForm = document.getElementById('estimate-bar-form');

if (expandBtn && quoteSection) {
  expandBtn.addEventListener('click', () => {
    quoteSection.classList.add('open');
    // Pre-fill full form from inline bar values
    const fullForm = document.getElementById('contact-form');
    if (fullForm && estimateBarForm) {
      const barData = Object.fromEntries(new FormData(estimateBarForm));
      if (barData.fullname) {
        const parts = barData.fullname.trim().split(/\s+/);
        const firstInput = fullForm.querySelector('[name="firstName"]');
        const lastInput = fullForm.querySelector('[name="lastName"]');
        if (firstInput) firstInput.value = parts[0] || '';
        if (lastInput) lastInput.value = parts.slice(1).join(' ') || '';
      }
      if (barData.phone) {
        const phoneInput = fullForm.querySelector('[name="phone"]');
        if (phoneInput) phoneInput.value = barData.phone;
      }
      if (barData.service) {
        const serviceSelect = fullForm.querySelector('[name="service"]');
        if (serviceSelect) serviceSelect.value = barData.service;
      }
      if (barData.year || barData.make || barData.model) {
        const vehicleInput = fullForm.querySelector('[name="vehicle"]');
        if (vehicleInput) vehicleInput.value = [barData.year, barData.make, barData.model].filter(Boolean).join(' ');
      }
      if (barData.year) {
        const yearInput = fullForm.querySelector('[name="year"]');
        if (yearInput) yearInput.value = barData.year;
      }
    }
    setTimeout(() => quoteSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  });
}

if (quoteClose && quoteSection) {
  quoteClose.addEventListener('click', () => {
    quoteSection.classList.remove('open');
  });
}

// === Contact form ===
const form = document.getElementById('contact-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const data = Object.fromEntries(new FormData(form));
    const hearAbout = [...form.querySelectorAll('[name="hearAbout"]:checked')].map(c => c.value).join(', ');

    try {
      const name = (data.firstName || '') + ' ' + (data.lastName || '');
      const subject = encodeURIComponent('Quote Request: ' + (data.vehicle || 'Vehicle'));
      const body = encodeURIComponent(
        `Name: ${name.trim()}\nEmail: ${data.email}\nPhone: ${data.phone}\nVehicle: ${data.vehicle}\nYear: ${data.year || 'N/A'}\nService: ${data.service}\n\nAdditional Info:\n${data.message || 'N/A'}\n\nHow they heard of us: ${hearAbout || 'N/A'}`
      );
      window.location.href = `mailto:Contact@hausofwraps.com?subject=${subject}&body=${body}`;
      btn.textContent = 'Sent!';
      form.reset();
    } catch (err) {
      btn.textContent = 'Error — try again';
    }
    setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 3000);
  });
}

// === Auto-scroll reviews ===
const reviewsContainer = document.querySelector('.trust-reviews');
if (reviewsContainer) {
  let reviewInterval;
  const startAutoScroll = () => {
    reviewInterval = setInterval(() => {
      const card = reviewsContainer.querySelector('.trust-review-card');
      if (!card) return;
      const cardWidth = card.offsetWidth + 12; // card + gap
      const maxScroll = reviewsContainer.scrollWidth - reviewsContainer.clientWidth;
      if (reviewsContainer.scrollLeft >= maxScroll - 2) {
        reviewsContainer.scrollLeft = 0;
      } else {
        reviewsContainer.scrollLeft += cardWidth;
      }
    }, 2000);
  };
  startAutoScroll();
  reviewsContainer.addEventListener('pointerdown', () => clearInterval(reviewInterval));
  reviewsContainer.addEventListener('pointerup', () => startAutoScroll());
}

// === Smooth scroll for nav links ===
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
