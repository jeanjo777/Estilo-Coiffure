/* ============================================
   ESTILO COIFFURE — Simulateur de Coiffure IA
   Flux : Genre → Upload + Style → Résultat
   ============================================ */

(function () {
  'use strict';

  // --- Éléments DOM ---
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');
  var navMenu = document.getElementById('navMenu');

  // Étape 1 : sélection genre
  var genderSection = document.getElementById('genderSection');
  var genderHomme = document.getElementById('genderHomme');
  var genderFemme = document.getElementById('genderFemme');

  // Étape 2-4 : simulateur
  var simulatorSection = document.getElementById('simulatorSection');
  var backBtn = document.getElementById('backBtn');
  var genderBadge = document.getElementById('genderBadge');
  var uploadZone = document.getElementById('uploadZone');
  var fileInput = document.getElementById('fileInput');
  var uploadPlaceholder = document.getElementById('uploadPlaceholder');
  var uploadPreview = document.getElementById('uploadPreview');
  var uploadChange = document.getElementById('uploadChange');
  var stylesTitle = document.getElementById('stylesTitle');
  var stylesGrid = document.getElementById('stylesGrid');
  var generateBtn = document.getElementById('generateBtn');
  var errorMsg = document.getElementById('errorMsg');
  var loadingZone = document.getElementById('loadingZone');
  var loadingText = document.getElementById('loadingText');
  var resultZone = document.getElementById('resultZone');
  var resultBefore = document.getElementById('resultBefore');
  var resultAfter = document.getElementById('resultAfter');

  // --- État ---
  var state = {
    gender: null,        // 'homme' ou 'femme'
    sourceImage: null,   // base64 de la photo du client
    selectedStyle: null, // index du style choisi
    processing: false
  };

  // =============================================
  // CATALOGUES DE COIFFURES
  // Ajouter les images dans :
  //   images/simulator/homme/  (coiffures masculines)
  //   images/simulator/femme/  (coiffures féminines)
  // Format : { src: 'images/simulator/homme/1.jpg', label: 'Nom du style' }
  // =============================================

  var hommeStyles = [
    // Ajouter les coiffures homme ici :
    // { src: 'images/simulator/homme/1.jpg', label: 'Dégradé Classique' },
    // { src: 'images/simulator/homme/2.jpg', label: 'Coupe Moderne' },
    // { src: 'images/simulator/homme/3.jpg', label: 'Buzz Cut' },
    // { src: 'images/simulator/homme/4.jpg', label: 'Pompadour' },
    // { src: 'images/simulator/homme/5.jpg', label: 'Undercut' },
    // { src: 'images/simulator/homme/6.jpg', label: 'Taper Fade' },
  ];

  var femmeStyles = [
    // Ajouter les coiffures femme ici :
    // { src: 'images/simulator/femme/1.jpg', label: 'Balayage' },
    // { src: 'images/simulator/femme/2.jpg', label: 'Coupe Bob' },
    // { src: 'images/simulator/femme/3.jpg', label: 'Boucles Naturelles' },
    // { src: 'images/simulator/femme/4.jpg', label: 'Lissage Brésilien' },
    // { src: 'images/simulator/femme/5.jpg', label: 'Coloration Blonde' },
    // { src: 'images/simulator/femme/6.jpg', label: 'Chignon Élégant' },
  ];

  // --- Navigation ---
  function handleNavScroll() {
    if (nav) {
      nav.classList.toggle('nav--scrolled', window.scrollY > 60);
    }
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

  // --- Helpers ---
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('sim-error--visible');
    setTimeout(function () {
      errorMsg.classList.remove('sim-error--visible');
    }, 8000);
  }

  function hideError() {
    errorMsg.classList.remove('sim-error--visible');
  }

  function updateGenerateBtn() {
    generateBtn.disabled = !state.sourceImage || state.selectedStyle === null || state.processing;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Erreur de lecture du fichier')); };
      reader.readAsDataURL(file);
    });
  }

  function imageUrlToBase64(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = function () { reject(new Error('Impossible de charger l\'image')); };
      img.src = url;
    });
  }

  // --- Obtenir les styles selon le genre ---
  function getCurrentStyles() {
    return state.gender === 'homme' ? hommeStyles : femmeStyles;
  }

  // =============================================
  // ÉTAPE 1 : SÉLECTION DU GENRE
  // =============================================

  function selectGender(gender) {
    state.gender = gender;
    state.selectedStyle = null;
    state.sourceImage = null;

    // Basculer les sections
    genderSection.style.display = 'none';
    simulatorSection.classList.add('simulator--visible');

    // Badge + titre
    var label = gender === 'homme' ? 'Homme' : 'Femme';
    genderBadge.textContent = label;
    stylesTitle.textContent = 'Styles ' + label;

    // Réinitialiser l'upload
    uploadPreview.hidden = true;
    uploadPlaceholder.hidden = false;
    uploadChange.hidden = false;
    uploadZone.classList.remove('sim-upload--has-image');

    // Afficher les coiffures
    renderStyles();
    updateGenerateBtn();

    // Scroll fluide vers le simulateur
    simulatorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  genderHomme.addEventListener('click', function () {
    selectGender('homme');
  });

  genderFemme.addEventListener('click', function () {
    selectGender('femme');
  });

  // --- Retour ---
  backBtn.addEventListener('click', function () {
    state.gender = null;
    state.selectedStyle = null;
    state.sourceImage = null;
    state.processing = false;

    simulatorSection.classList.remove('simulator--visible');
    genderSection.style.display = '';

    // Cacher résultat et loading
    resultZone.classList.remove('sim-result--visible');
    loadingZone.classList.remove('sim-loading--visible');
    hideError();

    // Réinitialiser upload
    uploadPreview.hidden = true;
    uploadPlaceholder.hidden = false;
    uploadChange.hidden = true;
    uploadZone.classList.remove('sim-upload--has-image');

    genderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // =============================================
  // ÉTAPE 2 : UPLOAD PHOTO
  // =============================================

  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Veuillez s\u00e9lectionner une image (JPG, PNG ou WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('Image trop volumineuse. Maximum 10 Mo.');
      return;
    }

    hideError();

    fileToBase64(file).then(function (base64) {
      state.sourceImage = base64;
      uploadPreview.src = base64;
      uploadPreview.hidden = false;
      uploadPlaceholder.hidden = true;
      uploadChange.hidden = false;
      uploadZone.classList.add('sim-upload--has-image');
      updateGenerateBtn();
    });
  }

  fileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
      handleFile(this.files[0]);
    }
  });

  uploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadZone.classList.add('sim-upload--drag');
  });

  uploadZone.addEventListener('dragleave', function () {
    uploadZone.classList.remove('sim-upload--drag');
  });

  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.classList.remove('sim-upload--drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // =============================================
  // ÉTAPE 3 : GRILLE DE STYLES
  // =============================================

  function renderStyles() {
    var styles = getCurrentStyles();

    if (styles.length === 0) {
      stylesGrid.innerHTML =
        '<div class="sim-styles__empty">' +
          '<p>Aucune coiffure disponible pour le moment.</p>' +
          '<p>Les styles seront bient&ocirc;t ajout&eacute;s.</p>' +
        '</div>';
      return;
    }

    var html = '';
    styles.forEach(function (style, index) {
      html +=
        '<button type="button" class="sim-style-card" data-index="' + index + '" aria-label="' + style.label + '">' +
          '<img src="' + style.src + '" alt="' + style.label + '" loading="lazy">' +
          '<span class="sim-style-card__label">' + style.label + '</span>' +
          '<span class="sim-style-card__check" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="#0e0e0e" stroke-width="3" width="14" height="14">' +
              '<path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
          '</span>' +
        '</button>';
    });
    stylesGrid.innerHTML = html;

    stylesGrid.querySelectorAll('.sim-style-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var index = parseInt(this.getAttribute('data-index'), 10);

        stylesGrid.querySelectorAll('.sim-style-card').forEach(function (c) {
          c.classList.remove('sim-style-card--selected');
        });

        this.classList.add('sim-style-card--selected');
        state.selectedStyle = index;
        updateGenerateBtn();
      });
    });
  }

  // =============================================
  // ÉTAPE 4 : GÉNÉRATION IA
  // =============================================

  generateBtn.addEventListener('click', function () {
    if (state.processing || !state.sourceImage || state.selectedStyle === null) return;

    var styles = getCurrentStyles();
    if (!styles[state.selectedStyle]) return;

    state.processing = true;
    updateGenerateBtn();
    hideError();

    loadingZone.classList.add('sim-loading--visible');
    resultZone.classList.remove('sim-result--visible');
    loadingText.textContent = 'Pr\u00e9paration de votre image...';

    var selectedStyle = styles[state.selectedStyle];

    imageUrlToBase64(selectedStyle.src)
      .then(function (targetBase64) {
        loadingText.textContent = 'Notre IA travaille sur votre nouvelle coiffure...';

        return fetch('/api/face-swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceImage: state.sourceImage,
            targetImage: targetBase64
          })
        });
      })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        if (data.error) {
          throw new Error(data.error);
        }

        loadingText.textContent = 'G\u00e9n\u00e9ration en cours, quelques secondes...';
        return pollResult(data.requestId);
      })
      .then(function (resultUrl) {
        loadingZone.classList.remove('sim-loading--visible');
        resultBefore.src = state.sourceImage;
        resultAfter.src = resultUrl;
        resultZone.classList.add('sim-result--visible');
        resultZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        loadingZone.classList.remove('sim-loading--visible');
        showError('Erreur : ' + err.message + '. Veuillez r\u00e9essayer.');
      })
      .finally(function () {
        state.processing = false;
        updateGenerateBtn();
      });
  });

  // --- Polling du résultat ---
  function pollResult(requestId) {
    var maxAttempts = 60;
    var attempt = 0;

    return new Promise(function (resolve, reject) {
      function check() {
        attempt++;

        if (attempt > maxAttempts) {
          reject(new Error('D\u00e9lai d\u00e9pass\u00e9. Veuillez r\u00e9essayer.'));
          return;
        }

        fetch('/api/status?id=' + encodeURIComponent(requestId))
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.error) {
              reject(new Error(data.error));
              return;
            }

            var status = data.status || data.state;

            if (status === 'completed' || status === 'Completed') {
              var url = data.output_url || data.result_url ||
                        (data.images && data.images[0] && data.images[0].url) ||
                        (data.output && data.output.url);

              if (url) {
                resolve(url);
              } else {
                reject(new Error('R\u00e9sultat introuvable dans la r\u00e9ponse.'));
              }
              return;
            }

            if (status === 'failed' || status === 'Failed' || status === 'nsfw') {
              reject(new Error('La g\u00e9n\u00e9ration a \u00e9chou\u00e9. Essayez avec une autre photo.'));
              return;
            }

            var progress = data.progress || '';
            if (progress) {
              loadingText.textContent = 'G\u00e9n\u00e9ration : ' + progress + '...';
            }

            setTimeout(check, 2000);
          })
          .catch(function (err) {
            reject(err);
          });
      }

      check();
    });
  }

})();
