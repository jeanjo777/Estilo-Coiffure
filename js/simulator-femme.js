/**
 * Estilo Coiffure — Simulateur Femme IA
 * Utilise Runway pour la generation de coiffures.
 */

function toDataUrl(file) {
  return new Promise(function (resolve, reject) {
    if (!file || file.size === 0) { reject(new Error('Fichier vide ou invalide.')); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      try {
        var size = Math.min(img.width, img.height);
        var ox = (img.width - size) / 2;
        var oy = (img.height - size) / 2;
        var canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        canvas.getContext('2d').drawImage(img, ox, oy, size, size, 0, 0, 1024, 1024);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) { reject(new Error('Impossible de traiter cette image.')); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Format non support\u00e9. Essayez JPG ou PNG.')); };
    img.src = url;
  });
}

function setStatus(message, tone) {
  var node = document.querySelector('[data-tryon-status]');
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone || 'neutral';
}

function setBadge(text, tone) {
  var badge = document.querySelector('[data-tryon-badge]');
  if (!badge) return;
  badge.textContent = text;
  badge.dataset.tone = tone || 'neutral';
}

function showResult(payload) {
  var image = document.querySelector('[data-tryon-result-image]');
  var placeholder = document.querySelector('[data-tryon-placeholder]');
  var summary = document.querySelector('[data-tryon-summary]');
  var title = document.querySelector('[data-tryon-summary-title]');
  var text = document.querySelector('[data-tryon-summary-text]');
  var bookLink = document.querySelector('[data-tryon-book]');
  var openLink = document.querySelector('[data-tryon-open]');

  if (!image || !summary || !title || !text) return;
  image.src = payload.imageUrl;
  image.hidden = false;
  if (placeholder) placeholder.hidden = true;
  title.textContent = payload.selectedStyle || 'Style retenu';
  text.textContent = 'Si ce rendu vous pla\u00eet, passez directement \u00e0 la r\u00e9servation.';
  summary.hidden = false;
  if (bookLink) bookLink.hidden = false;
  if (openLink) { openLink.hidden = false; openLink.href = payload.imageUrl; }
}

(function initSimulator() {
  'use strict';

  // --- Nav scroll ---
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');
  var navMenu = document.getElementById('navMenu');

  function handleNavScroll() {
    if (nav) nav.classList.toggle('nav--scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('nav__menu--open');
      navToggle.classList.toggle('nav__toggle--active');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navMenu.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('nav__menu--open');
        navToggle.classList.remove('nav__toggle--active');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  // --- Form ---
  var form = document.querySelector('[data-tryon-form]');
  if (!form) return;

  var submitBtn = form.querySelector('[data-tryon-submit]');
  var preview = document.querySelector('[data-upload-preview]');
  var uploadInput = form.querySelector('[data-upload-input]');
  var cameraInput = form.querySelector('[data-camera-fallback-input]');
  var state = { photoDataUrl: '' };

  function handleFile(input, label, msg) {
    var file = input && input.files && input.files[0];
    if (!file) return;

    toDataUrl(file).then(function (dataUrl) {
      state.photoDataUrl = dataUrl;
      if (preview) preview.innerHTML = '<img src="' + dataUrl + '" alt="Photo ' + label + '">';
      input.value = '';
      setStatus(msg, 'success');
    }).catch(function (e) {
      setStatus(e.message, 'error');
    });
  }

  if (cameraInput) {
    cameraInput.addEventListener('change', function () {
      handleFile(cameraInput, 'cam\u00e9ra', 'Photo ajout\u00e9e. Choisissez votre coiffure puis lancez la simulation.');
    });
  }

  if (uploadInput) {
    uploadInput.addEventListener('change', function () {
      handleFile(uploadInput, 'ajout\u00e9e', 'Image ajout\u00e9e. Choisissez votre coiffure puis lancez la simulation.');
    });
  }

  // --- Status check ---
  fetch('/api/try-on-status')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.configured) {
        setBadge('Module IA actif', 'success');
        setStatus('Module pr\u00eat. Ajoutez une photo puis lancez la simulation.', 'success');
      } else {
        setBadge('Module IA \u00e0 configurer', 'warning');
        setStatus('Cl\u00e9 API serveur absente (RUNWAY_API_KEY).', 'warning');
      }
    })
    .catch(function () {
      setBadge('Serveur requis', 'warning');
      setStatus('Lancez le serveur pour activer la simulation.', 'warning');
    });

  // --- Submit ---
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!state.photoDataUrl) {
      setStatus('Ajoutez une photo avant de g\u00e9n\u00e9rer.', 'error');
      return;
    }

    var data = new FormData(form);
    if (data.get('consent') !== 'yes') {
      setStatus('Consentement requis.', 'error');
      return;
    }

    var payload = {
      photoDataUrl: state.photoDataUrl,
      styleId: String(data.get('styleId') || ''),
      gender: 'femme',
      length: String(data.get('length') || 'long'),
      color: String(data.get('color') || 'noir'),
      finish: String(data.get('finish') || 'naturel'),
      parting: String(data.get('parting') || 'libre'),
      consent: true,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'G\u00e9n\u00e9ration en cours\u2026';
    }
    setStatus('Pr\u00e9paration de la photo puis g\u00e9n\u00e9ration du rendu\u2026', 'warning');

    fetch('/api/hairstyle-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.error || '\u00c9chec de la g\u00e9n\u00e9ration.');
        showResult(result);
        setStatus('Aper\u00e7u g\u00e9n\u00e9r\u00e9. Vous pouvez maintenant r\u00e9server ce look.', 'success');
      })
      .catch(function (err) {
        setStatus(err.message || 'G\u00e9n\u00e9ration impossible pour le moment.', 'error');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'G\u00e9n\u00e9rer mon aper\u00e7u';
        }
      });
  });
})();
