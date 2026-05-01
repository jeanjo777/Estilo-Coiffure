(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');
  var navMenu = document.getElementById('navMenu');
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.filter-btn'));
  var productsSearch = document.getElementById('productsSearch');
  var productsSort = document.getElementById('productsSort');
  var productsSection = document.querySelector('.products');
  var productsGrid = document.getElementById('productsGrid');
  var productsCount = document.getElementById('productsCount');
  var productsPageInfo = document.getElementById('productsPageInfo');
  var productsEmpty = document.getElementById('productsEmpty');
  var productsPagination = document.getElementById('productsPagination');
  var paginationList = document.getElementById('paginationList');
  var paginationPrev = document.getElementById('paginationPrev');
  var paginationNext = document.getElementById('paginationNext');
  var sourceProducts = Array.isArray(window.ESTILO_PRODUCTS)
    ? window.ESTILO_PRODUCTS.map(prepareProduct)
    : [];
  var revealObserver;
  var state = {
    filter: 'all',
    currentPage: 1,
    pageSize: 24,
    searchQuery: '',
    sortKey: 'default'
  };

  var pluralLabels = {
    all: 'Tous',
    shampoing: 'Shampooings',
    soin: 'Soins',
    huile: 'Huiles',
    accessoire: 'Accessoires'
  };

  var placeholderIcon =
    '<div class="product-card__placeholder" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">' +
        '<rect x="4" y="4" width="16" height="16" rx="3"></rect>' +
        '<path d="M8 15l2.5-2.5L13 15l3-3 2 2" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none"></circle>' +
      '</svg>' +
    '</div>';

  var priceFormatter = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function prepareProduct(product, index) {
    var priceNumber = Number(product && product.price);

    return Object.assign({}, product, {
      _index: index,
      _titleSort: normalizeSearchText(product && product.title),
      _searchBlob: normalizeSearchText([
        product && product.title,
        product && product.vendor,
        product && product.productType,
        product && product.categoryLabel
      ].join(' ')),
      _priceNumber: Number.isFinite(priceNumber) ? priceNumber : null
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function handleNavScroll() {
    if (!nav) {
      return;
    }

    nav.classList.toggle('nav--scrolled', window.scrollY > 60);
  }

  function closeMobileMenu() {
    if (!navMenu || !navToggle) {
      return;
    }

    navMenu.classList.remove('nav__menu--open');
    navToggle.classList.remove('nav__toggle--active');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Ouvrir le menu');
    document.body.style.overflow = '';
  }

  function setupNavigation() {
    handleNavScroll();
    window.addEventListener('scroll', handleNavScroll, { passive: true });

    if (!navToggle || !navMenu) {
      return;
    }

    navToggle.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('nav__menu--open');
      navToggle.classList.toggle('nav__toggle--active');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Fermer le menu' : 'Ouvrir le menu');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navMenu.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        closeMobileMenu();
      }
    });
  }

  function getRevealObserver() {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      return null;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('reveal--visible');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
      );
    }

    return revealObserver;
  }

  function registerReveal(element) {
    if (!element) {
      return;
    }

    element.classList.add('reveal');

    var observer = getRevealObserver();
    if (!observer) {
      element.classList.add('reveal--visible');
      return;
    }

    observer.observe(element);
  }

  function registerStaticReveals() {
    document.querySelectorAll(
      '.products__summary, .products__notice, .products__empty, .products__pagination, .section-label, .section-title'
    ).forEach(registerReveal);
  }

  function formatPrice(value) {
    var number = Number(value);
    return Number.isFinite(number) ? priceFormatter.format(number) : 'Prix en salon';
  }

  function formatCount(filter, total) {
    var parts = [total + ' produits'];

    if (filter === 'all') {
      parts[0] = total + ' produits au catalogue';
    } else {
      parts.push(pluralLabels[filter]);
    }

    if (state.searchQuery) {
      parts.push('“' + state.searchQuery + '”');
    }

    return parts.join(' · ');
  }

  function formatPageInfo(startIndex, endIndex, totalPages) {
    return 'Affichage ' + startIndex + '–' + endIndex + ' · page ' + state.currentPage + '/' + totalPages;
  }

  function buildMeta(product) {
    var parts = [];

    if (product.vendor) {
      parts.push(product.vendor);
    }

    if (product.size) {
      parts.push(product.size);
    } else if (product.productType) {
      parts.push(product.productType);
    }

    return parts.join(' · ') || 'Produit professionnel';
  }

  function createCardMarkup(product) {
    var url = escapeHtml(product.url || '#');
    var title = escapeHtml(product.title);
    var categoryLabel = escapeHtml(product.categoryLabel || 'Produit');
    var meta = escapeHtml(buildMeta(product));
    var price = escapeHtml(formatPrice(product.price));
    var imageMarkup = product.image
      ? '<a class="product-card__image" href="' + url + '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' + escapeHtml(product.image) + '" alt="' + title + '" loading="lazy" decoding="async">' +
        '</a>'
      : '<div class="product-card__image">' + placeholderIcon + '</div>';

    return '' +
      '<article class="product-card" data-category="' + escapeHtml(product.category || 'soin') + '">' +
        imageMarkup +
        '<div class="product-card__body">' +
          '<span class="product-card__category">' + categoryLabel + '</span>' +
          '<h2 class="product-card__title">' +
            '<a class="product-card__title-link" href="' + url + '" target="_blank" rel="noopener noreferrer">' + title + '</a>' +
          '</h2>' +
          '<p class="product-card__meta">' + meta + '</p>' +
          '<div class="product-card__footer">' +
            '<span class="product-card__price">' + price + '</span>' +
            '<a class="product-card__link" href="' + url + '" target="_blank" rel="noopener noreferrer">Voir produit</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function compareByTitle(a, b) {
    return a.title.localeCompare(b.title, 'fr-CA', {
      sensitivity: 'base',
      numeric: true
    });
  }

  function sortProducts(products) {
    return products.slice().sort(function (a, b) {
      var aPrice = a._priceNumber;
      var bPrice = b._priceNumber;
      var titleComparison = compareByTitle(a, b);

      switch (state.sortKey) {
        case 'name-asc':
          return titleComparison || (a._index - b._index);

        case 'name-desc':
          return (titleComparison * -1) || (a._index - b._index);

        case 'price-asc':
          if (aPrice === null && bPrice === null) {
            return titleComparison || (a._index - b._index);
          }

          if (aPrice === null) {
            return 1;
          }

          if (bPrice === null) {
            return -1;
          }

          return (aPrice - bPrice) || titleComparison || (a._index - b._index);

        case 'price-desc':
          if (aPrice === null && bPrice === null) {
            return titleComparison || (a._index - b._index);
          }

          if (aPrice === null) {
            return 1;
          }

          if (bPrice === null) {
            return -1;
          }

          return (bPrice - aPrice) || titleComparison || (a._index - b._index);

        default:
          return a._index - b._index;
      }
    });
  }

  function getFilteredProducts() {
    var queryTokens = normalizeSearchText(state.searchQuery)
      .split(/\s+/)
      .filter(Boolean);
    var filtered = sourceProducts.filter(function (product) {
      var matchesFilter = state.filter === 'all' || product.category === state.filter;
      var matchesSearch = !queryTokens.length || queryTokens.every(function (token) {
        return product._searchBlob.indexOf(token) !== -1;
      });

      return matchesFilter && matchesSearch;
    });

    if (!filtered.length) {
      return filtered;
    }

    return sortProducts(filtered);
  }

  function getTotalPages(totalItems) {
    return Math.max(1, Math.ceil(totalItems / state.pageSize));
  }

  function clampPage(page, totalPages) {
    return Math.min(Math.max(page, 1), totalPages);
  }

  function smoothScrollToProducts() {
    if (!productsSection) {
      return;
    }

    productsSection.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function updateFilterButtons(activeFilter) {
    var counts = {
      all: sourceProducts.length,
      shampoing: 0,
      soin: 0,
      huile: 0,
      accessoire: 0
    };

    sourceProducts.forEach(function (product) {
      if (counts[product.category] !== undefined) {
        counts[product.category] += 1;
      }
    });

    filterButtons.forEach(function (button) {
      var filter = button.getAttribute('data-filter');
      var label = button.getAttribute('data-label') || pluralLabels[filter] || button.textContent;
      var isActive = filter === activeFilter;

      button.textContent = label + ' (' + (counts[filter] || 0) + ')';
      button.classList.toggle('filter-btn--active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function getPaginationItems(totalPages) {
    var items = [];
    var start;
    var end;
    var page;

    if (totalPages <= 7) {
      for (page = 1; page <= totalPages; page += 1) {
        items.push(page);
      }
      return items;
    }

    items.push(1);
    start = Math.max(2, state.currentPage - 1);
    end = Math.min(totalPages - 1, state.currentPage + 1);

    if (state.currentPage <= 3) {
      end = 4;
    }

    if (state.currentPage >= totalPages - 2) {
      start = totalPages - 3;
    }

    if (start > 2) {
      items.push('ellipsis-left');
    }

    for (page = start; page <= end; page += 1) {
      items.push(page);
    }

    if (end < totalPages - 1) {
      items.push('ellipsis-right');
    }

    items.push(totalPages);

    return items;
  }

  function renderPagination(totalItems) {
    if (!productsPagination || !paginationList || !paginationPrev || !paginationNext) {
      return;
    }

    var totalPages = getTotalPages(totalItems);
    var showPagination = totalItems > state.pageSize;

    productsPagination.hidden = !showPagination;

    if (!showPagination) {
      paginationList.innerHTML = '';
      paginationPrev.disabled = true;
      paginationNext.disabled = true;
      return;
    }

    paginationPrev.disabled = state.currentPage <= 1;
    paginationNext.disabled = state.currentPage >= totalPages;

    paginationList.innerHTML = getPaginationItems(totalPages)
      .map(function (item) {
        if (typeof item === 'string') {
          return '<span class="pagination__ellipsis" aria-hidden="true">…</span>';
        }

        var isActive = item === state.currentPage;
        return '' +
          '<button type="button" class="pagination__page' + (isActive ? ' pagination__page--active' : '') + '"' +
          ' data-page="' + item + '"' +
          (isActive ? ' aria-current="page"' : '') +
          '>' + item + '</button>';
      })
      .join('');
  }

  function renderProducts(options) {
    if (!productsGrid || !productsCount || !productsEmpty) {
      return;
    }

    var filteredProducts = getFilteredProducts();
    var totalItems = filteredProducts.length;
    var totalPages = getTotalPages(totalItems);
    var shouldScroll = Boolean(options && options.scroll);
    var startOffset;
    var endOffset;
    var visibleProducts;

    state.currentPage = clampPage(state.currentPage, totalPages);
    startOffset = totalItems ? (state.currentPage - 1) * state.pageSize : 0;
    endOffset = Math.min(startOffset + state.pageSize, totalItems);
    visibleProducts = filteredProducts.slice(startOffset, endOffset);

    productsCount.textContent = formatCount(state.filter, totalItems);

    if (productsPageInfo) {
      productsPageInfo.textContent = totalItems
        ? formatPageInfo(startOffset + 1, endOffset, totalPages)
        : '';
    }

    productsEmpty.hidden = totalItems > 0;
    productsEmpty.textContent = state.searchQuery
      ? 'Aucun produit ne correspond à « ' + state.searchQuery + ' ».'
      : 'Aucun produit ne correspond à ce filtre pour le moment.';
    productsGrid.innerHTML = visibleProducts.map(createCardMarkup).join('');

    renderPagination(totalItems);

    if (totalItems === 0) {
      registerReveal(productsEmpty);
    } else {
      productsGrid.querySelectorAll('.product-card').forEach(registerReveal);
    }

    if (shouldScroll) {
      smoothScrollToProducts();
    }
  }

  function goToPage(nextPage) {
    var totalPages = getTotalPages(getFilteredProducts().length);
    var targetPage = clampPage(nextPage, totalPages);

    if (targetPage === state.currentPage) {
      return;
    }

    state.currentPage = targetPage;
    renderProducts({ scroll: true });
  }

  function setupFilters() {
    if (!filterButtons.length) {
      return;
    }

    updateFilterButtons(state.filter);
    renderProducts();

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.filter = button.getAttribute('data-filter') || 'all';
        state.currentPage = 1;
        updateFilterButtons(state.filter);
        renderProducts({ scroll: true });
      });
    });
  }

  function setupSearchAndSort() {
    if (productsSearch) {
      state.searchQuery = productsSearch.value.trim();

      productsSearch.addEventListener('input', function () {
        state.searchQuery = productsSearch.value.trim();
        state.currentPage = 1;
        renderProducts();
      });
    }

    if (productsSort) {
      state.sortKey = productsSort.value || 'default';

      productsSort.addEventListener('change', function () {
        state.sortKey = productsSort.value || 'default';
        state.currentPage = 1;
        renderProducts({ scroll: true });
      });
    }
  }

  function setupPagination() {
    if (!productsPagination || !paginationList || !paginationPrev || !paginationNext) {
      return;
    }

    paginationPrev.addEventListener('click', function () {
      goToPage(state.currentPage - 1);
    });

    paginationNext.addEventListener('click', function () {
      goToPage(state.currentPage + 1);
    });

    paginationList.addEventListener('click', function (event) {
      var target = event.target.closest('.pagination__page');
      if (!target) {
        return;
      }

      goToPage(Number(target.getAttribute('data-page')));
    });
  }

  function renderErrorState(message) {
    if (productsCount) {
      productsCount.textContent = message;
    }

    if (productsPageInfo) {
      productsPageInfo.textContent = '';
    }

    if (productsEmpty) {
      productsEmpty.hidden = false;
      productsEmpty.textContent = 'Le catalogue produits est temporairement indisponible.';
      registerReveal(productsEmpty);
    }

    if (productsGrid) {
      productsGrid.innerHTML = '';
    }

    if (productsPagination) {
      productsPagination.hidden = true;
    }

    updateFilterButtons('all');
  }

  setupNavigation();
  registerStaticReveals();

  if (!sourceProducts.length) {
    renderErrorState('Catalogue indisponible');
    return;
  }

  setupSearchAndSort();
  setupPagination();
  setupFilters();
})();
