/* ============================================
   ESTILO COIFFURE — Interactions
   ============================================ */

(function () {
  'use strict';

  /* --- Navigation scroll effect --- */
  const nav = document.getElementById('nav');

  function handleNavScroll() {
    if (window.scrollY > 60) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });

  /* --- Mobile menu toggle --- */
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  navToggle.addEventListener('click', function () {
    const isOpen = navMenu.classList.toggle('nav__menu--open');
    navToggle.classList.toggle('nav__toggle--active');
    navToggle.setAttribute('aria-expanded', isOpen);
    navToggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Fermer le menu au clic sur un lien
  navMenu.querySelectorAll('.nav__link').forEach(function (link) {
    link.addEventListener('click', function () {
      navMenu.classList.remove('nav__menu--open');
      navToggle.classList.remove('nav__toggle--active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  /* --- Scroll reveal --- */
  var revealTargets = document.querySelectorAll(
    '.about__grid, .service-card, .gallery__item, .hours__grid, .contact__grid, .section-label, .section-title'
  );

  revealTargets.forEach(function (el) {
    el.classList.add('reveal');
  });

  var revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  revealTargets.forEach(function (el) {
    revealObserver.observe(el);
  });

  /* --- Animated counters --- */
  var counters = document.querySelectorAll('[data-count]');

  var counterObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach(function (el) {
    counterObserver.observe(el);
  });

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var duration = 1500;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target;
      }
    }

    requestAnimationFrame(step);
  }

  /* --- Contact form (frontend-only feedback) --- */
  var form = document.getElementById('contactForm');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = form.querySelector('#name').value.trim();
    var phone = form.querySelector('#phone').value.trim();
    var service = form.querySelector('#service').value;

    if (!name || !phone || !service) {
      showFormMessage('Veuillez remplir tous les champs obligatoires.', 'error');
      return;
    }

    // Pas de backend configuré — afficher un message de confirmation
    showFormMessage(
      'Merci ' + name + ' ! Votre demande a bien été envoyée. Nous vous recontacterons rapidement.',
      'success'
    );
    form.reset();
  });

  function showFormMessage(text, type) {
    var existing = form.querySelector('.form__message');
    if (existing) existing.remove();

    var msg = document.createElement('div');
    msg.className = 'form__message';
    msg.textContent = text;
    msg.style.padding = '12px 16px';
    msg.style.borderRadius = '4px';
    msg.style.fontSize = '0.875rem';
    msg.style.marginTop = '8px';

    if (type === 'success') {
      msg.style.backgroundColor = 'rgba(200, 164, 110, 0.15)';
      msg.style.color = '#c8a46e';
      msg.style.border = '1px solid rgba(200, 164, 110, 0.3)';
      msg.setAttribute('role', 'status');
    } else {
      msg.style.backgroundColor = 'rgba(220, 80, 80, 0.15)';
      msg.style.color = '#dc5050';
      msg.style.border = '1px solid rgba(220, 80, 80, 0.3)';
      msg.setAttribute('role', 'alert');
    }

    form.appendChild(msg);

    setTimeout(function () {
      msg.remove();
    }, 6000);
  }

  /* --- Smooth scroll pour les ancres --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
