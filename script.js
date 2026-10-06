/* ==========================================================================
   MovieVerse — script.js
   يحتوي على كل منطق الموقع: تحميل البيانات من movies.json، بناء الواجهة
   ديناميكيًا (Hero, الصفوف, البطاقات), البحث المباشر, والمفضلة عبر LocalStorage.
   الملف مشترك بين index.html و movie.html و favorites.html — كل دالة تتحقق
   من وجود عناصرها قبل التنفيذ حتى يعمل الملف على أي صفحة بدون أخطاء.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   1. الثوابت والحالة العامة
   -------------------------------------------------------------------------- */
const MOVIES_DATA_URL = 'movies.json';
const FAVORITES_STORAGE_KEY = 'movieverse_favorites';
const HERO_ROTATE_INTERVAL = 7000; // مدة عرض كل فيلم في الـ Hero (ميلي ثانية)

let allMovies = [];        // كل الأفلام بعد تحميلها من JSON (تُحمَّل مرة واحدة)
let heroTimer = null;      // معرّف المؤقت الخاص بتدوير الـ Hero

/* --------------------------------------------------------------------------
   2. أدوات مساعدة عامة (Utilities)
   -------------------------------------------------------------------------- */

/** تحويل النص لمنع حقن HTML عند إدراج بيانات المستخدم/JSON داخل الصفحة */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/** جلب بيانات الأفلام مرة واحدة فقط وتخزينها في الذاكرة */
async function fetchMovies() {
  if (allMovies.length > 0) return allMovies;

  try {
    const response = await fetch(MOVIES_DATA_URL);
    if (!response.ok) throw new Error('تعذّر تحميل بيانات الأفلام');
    allMovies = await response.json();
    return allMovies;
  } catch (error) {
    console.error('خطأ في تحميل movies.json:', error);
    return [];
  }
}

/** البحث عن فيلم واحد عبر المعرّف (id) */
function getMovieById(id) {
  return allMovies.find((movie) => String(movie.id) === String(id));
}

/**
 * محاولة تحميل صورة حقيقية لعنصر ما، وفي حال فشل التحميل (لعدم وجود
 * ملفات بوسترات فعلية في المشروع) يتم عرض بديل أنيق (تدرج لوني + اسم الفيلم)
 * بدلاً من صورة مكسورة — تحسين ضروري لتجربة المستخدم.
 */
function setPosterBackground(element, imageSrc, fallbackTitle) {
  element.classList.add('movie-card__poster--placeholder');
  const placeholderSpan = document.createElement('span');
  placeholderSpan.className = 'movie-card__placeholder-title';
  placeholderSpan.textContent = fallbackTitle;
  element.appendChild(placeholderSpan);

  const testImage = new Image();
  testImage.onload = () => {
    element.style.backgroundImage = `url('${imageSrc}')`;
    element.classList.remove('movie-card__poster--placeholder');
    element.innerHTML = '';
  };
  testImage.onerror = () => {
    /* تبقى الصورة البديلة كما هي — لا حاجة لفعل شيء */
  };
  testImage.src = imageSrc;
}

/** عرض إشعار Toast سريع أعلى/أسفل الشاشة */
function showToast(message, iconClass = 'fa-circle-check') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const icon = toast.querySelector('i');
  const text = document.getElementById('toastMessage');

  icon.className = `fa-solid ${iconClass}`;
  text.textContent = message;
  toast.classList.add('show');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/** الانتقال إلى صفحة تفاصيل فيلم معيّن */
function goToMovieDetails(id) {
  window.location.href = `movie.html?id=${id}`;
}

/** تحريك رقم من صفر حتى القيمة النهائية (مثل تقييم الفيلم) بسلاسة */
function animateRatingCounter(element, targetValue, duration = 700) {
  if (!element) return;

  const startTime = performance.now();

  function step(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out تدريجي
    element.textContent = (eased * targetValue).toFixed(1);

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* --------------------------------------------------------------------------
   3. إدارة المفضلة (LocalStorage)
   -------------------------------------------------------------------------- */

function getFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavoriteIds(ids) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
}

function isFavorite(id) {
  return getFavoriteIds().includes(Number(id));
}

/** إضافة/إزالة فيلم من المفضلة، وإرجاع الحالة الجديدة (true = تمت الإضافة) */
function toggleFavorite(id) {
  const numericId = Number(id);
  let favorites = getFavoriteIds();
  const alreadyFavorite = favorites.includes(numericId);

  if (alreadyFavorite) {
    favorites = favorites.filter((favId) => favId !== numericId);
  } else {
    favorites.push(numericId);
  }

  saveFavoriteIds(favorites);
  return !alreadyFavorite;
}

/** تحديث شكل زر القلب في كل مكان يظهر فيه نفس الفيلم على الصفحة الحالية */
function syncFavoriteButtons(id) {
  const active = isFavorite(id);
  document
    .querySelectorAll(`[data-fav-id="${id}"]`)
    .forEach((btn) => btn.classList.toggle('active', active));
}

/** معالج موحّد للضغط على أي زر مفضلة في الموقع */
function handleFavoriteClick(movie, btnElement) {
  const nowFavorite = toggleFavorite(movie.id);
  syncFavoriteButtons(movie.id);
  showToast(
    nowFavorite ? `تمت إضافة "${movie.title}" إلى المفضلة` : `تمت إزالة "${movie.title}" من المفضلة`,
    nowFavorite ? 'fa-heart' : 'fa-circle-minus'
  );

  // في صفحة المفضلة تحديدًا: إزالة البطاقة فورًا من الشبكة عند إلغاء الإعجاب
  const favoritesGrid = document.getElementById('favoritesGrid');
  if (favoritesGrid && !nowFavorite) {
    const card = btnElement.closest('.movie-card');
    card?.remove();
    checkEmptyFavorites();
  }
}

/* --------------------------------------------------------------------------
   4. بناء بطاقة الفيلم (عنصر مُعاد استخدامه في كل الصفحات)
   -------------------------------------------------------------------------- */
function createMovieCard(movie, options = {}) {
  const { animationDelay = 0 } = options;

  const card = document.createElement('article');
  card.className = 'movie-card';
  card.style.animationDelay = `${animationDelay}ms`;
  card.dataset.id = movie.id;

  /* ------- البوستر ومحتوى التمرير (Hover) ------- */
  const poster = document.createElement('div');
  poster.className = 'movie-card__poster';
  setPosterBackground(poster, movie.image, movie.title);

  const favBtn = document.createElement('button');
  favBtn.className = `btn-icon movie-card__fav${isFavorite(movie.id) ? ' active' : ''}`;
  favBtn.dataset.favId = movie.id;
  favBtn.setAttribute('aria-label', 'إضافة إلى المفضلة');
  favBtn.innerHTML = '<i class="fa-solid fa-heart"></i>';
  favBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    handleFavoriteClick(movie, favBtn);
  });

  /* شارة "مسلسل" تظهر فقط على المحتوى من نوع series — الأفلام بدون شارة */
  let typeBadge = null;
  if (movie.type === 'series') {
    typeBadge = document.createElement('span');
    typeBadge.className = 'type-badge';
    typeBadge.innerHTML = '<i class="fa-solid fa-tv"></i> مسلسل';
  }

  const gradient = document.createElement('div');
  gradient.className = 'movie-card__gradient';

  const hoverInfo = document.createElement('div');
  hoverInfo.className = 'movie-card__info';
  hoverInfo.innerHTML = `
    <p class="movie-card__desc">${escapeHtml(movie.summary)}</p>
    <div class="movie-card__actions">
      <button class="btn btn-primary btn-watch" type="button">
        <i class="fa-solid fa-play"></i> مشاهدة
      </button>
      <button class="btn btn-glass btn-details" type="button">
        <i class="fa-solid fa-circle-info"></i> التفاصيل
      </button>
    </div>
  `;

  poster.append(favBtn, gradient, hoverInfo);
  if (typeBadge) poster.appendChild(typeBadge);

  /* ------- المعلومات الثابتة أسفل البوستر (تظهر دائمًا) ------- */
  const staticInfo = document.createElement('div');
  staticInfo.className = 'movie-card__static';
  staticInfo.innerHTML = `
    <div class="movie-card__title">${escapeHtml(movie.title)}</div>
    <div class="movie-card__sub">
      <span class="badge-rating"><i class="fa-solid fa-star"></i> ${movie.rating}</span>
      <span>${movie.type === 'series' ? movie.duration : movie.year}</span>
    </div>
    <div class="movie-card__lang">
      ${(movie.language || [])
        .map(
          (lang) =>
            `<span><i class="fa-solid fa-closed-captioning"></i> ${escapeHtml(lang)}</span>`
        )
        .join('')}
    </div>
  `;

  card.append(poster, staticInfo);

  /* ------- الأحداث ------- */
  card.addEventListener('click', () => goToMovieDetails(movie.id));
  hoverInfo.querySelector('.btn-watch').addEventListener('click', (event) => {
    event.stopPropagation();
    window.open(movie.link, '_blank', 'noopener,noreferrer');
  });
  hoverInfo.querySelector('.btn-details').addEventListener('click', (event) => {
    event.stopPropagation();
    goToMovieDetails(movie.id);
  });

  attachCardTilt(card);

  return card;
}

/**
 * إضافة إمالة ثلاثية الأبعاد خفيفة تتبع حركة الماوس فوق البطاقة — تمنح
 * البطاقات إحساسًا أكثر حيوية وتفاعلية (محاكاة تأثير "Tilt Card" الشائع
 * في المنصات الحديثة). تُفعَّل فقط على الأجهزة التي تدعم hover الحقيقي
 * (الحاسوب) لتجنّب أي سلوك غريب على شاشات اللمس.
 */
function attachCardTilt(card) {
  if (!window.matchMedia('(hover: hover)').matches) return;

  const MAX_TILT_DEGREES = 7;

  card.addEventListener('mousemove', (event) => {
    const rect = card.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const rotateY = (offsetX / (rect.width / 2)) * MAX_TILT_DEGREES;
    const rotateX = -(offsetY / (rect.height / 2)) * MAX_TILT_DEGREES;

    card.style.transform = `scale(1.08) translateY(-6px) perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = ''; // يعيد السيطرة لتأثير الـ hover العادي في CSS
  });
}

/** تفريغ حاوية معينة وملؤها ببطاقات أفلام مع تأثير ظهور متدرج */
function renderMovieRow(container, movies) {
  if (!container) return;
  container.innerHTML = '';

  if (movies.length === 0) {
    container.innerHTML = '<p class="search-empty">لا توجد أفلام لعرضها حاليًا.</p>';
    return;
  }

  movies.forEach((movie, index) => {
    container.appendChild(createMovieCard(movie, { animationDelay: index * 60 }));
  });
}

/* --------------------------------------------------------------------------
   5. Hero Banner المتحرك
   -------------------------------------------------------------------------- */
function initHero(movies) {
  const heroSection = document.getElementById('hero');
  const heroContent = document.getElementById('heroContent');
  const heroDots = document.getElementById('heroDots');
  const heroBg = document.getElementById('heroBg');
  if (!heroSection || !heroContent) return;

  const featuredMovies = movies.filter((movie) => movie.featured);
  if (featuredMovies.length === 0) return;

  let currentIndex = 0;

  function renderHeroSlide(index) {
    const movie = featuredMovies[index];

    /* خلفية الـ Hero: نحاول تحميل صورة حقيقية، وإلا نبقي التدرج اللوني */
    heroBg.className = 'hero__bg';
    heroBg.style.backgroundImage = '';
    const testImage = new Image();
    testImage.onload = () => {
      heroBg.style.backgroundImage = `url('${movie.image}')`;
    };
    testImage.onerror = () => {
      heroBg.classList.add('hero__bg--placeholder');
    };
    testImage.src = movie.image;

    heroContent.innerHTML = `
      <span class="hero__badge"><i class="fa-solid fa-fire"></i> فيلم مميز</span>
      <h1 class="hero__title">${escapeHtml(movie.title)}</h1>
      <div class="hero__meta">
        <span class="badge-rating"><i class="fa-solid fa-star"></i> <span id="heroRatingValue">0</span></span>
        <span class="dot"></span>
        <span>${movie.year}</span>
        <span class="dot"></span>
        <span>${escapeHtml(movie.duration)}</span>
        <span class="dot"></span>
        <span>${movie.genre.map(escapeHtml).join(' • ')}</span>
      </div>
      <p class="hero__desc">${escapeHtml(movie.summary)}</p>
      <div class="hero__actions">
        <button class="btn btn-primary" id="heroWatchBtn">
          <i class="fa-solid fa-play"></i> مشاهدة الآن
        </button>
        <button class="btn btn-glass" id="heroDetailsBtn">
          <i class="fa-solid fa-circle-info"></i> مزيد من التفاصيل
        </button>
        <button class="btn-icon${isFavorite(movie.id) ? ' active' : ''}" id="heroFavBtn" data-fav-id="${movie.id}" aria-label="إضافة إلى المفضلة">
          <i class="fa-solid fa-heart"></i>
        </button>
      </div>
    `;

    document.getElementById('heroWatchBtn').addEventListener('click', () => {
      window.open(movie.link, '_blank', 'noopener,noreferrer');
    });
    document.getElementById('heroDetailsBtn').addEventListener('click', () => goToMovieDetails(movie.id));
    document.getElementById('heroFavBtn').addEventListener('click', (event) => {
      handleFavoriteClick(movie, event.currentTarget);
    });

    /* عداد تصاعدي بسيط لرقم التقييم عند كل تبديل — لمسة حيوية خفيفة */
    animateRatingCounter(document.getElementById('heroRatingValue'), movie.rating);

    /* تحديث النقاط */
    if (heroDots) {
      heroDots.querySelectorAll('button').forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
      });
    }
  }

  /* بناء النقاط مرة واحدة */
  if (heroDots) {
    heroDots.innerHTML = '';
    featuredMovies.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.setAttribute('aria-label', `عرض الفيلم رقم ${index + 1}`);
      dot.addEventListener('click', () => {
        currentIndex = index;
        renderHeroSlide(currentIndex);
        resetHeroTimer();
      });
      heroDots.appendChild(dot);
    });
  }

  function nextSlide() {
    currentIndex = (currentIndex + 1) % featuredMovies.length;
    renderHeroSlide(currentIndex);
  }

  function resetHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(nextSlide, HERO_ROTATE_INTERVAL);
  }

  renderHeroSlide(currentIndex);
  resetHeroTimer();

  /* إيقاف التدوير مؤقتًا عند تمرير الماوس فوق الـ Hero لراحة المستخدم */
  heroSection.addEventListener('mouseenter', () => clearInterval(heroTimer));
  heroSection.addEventListener('mouseleave', resetHeroTimer);
}

/* --------------------------------------------------------------------------
   6. أقسام التصنيفات الديناميكية
   -------------------------------------------------------------------------- */
function initGenreSections(movies) {
  const genreContainer = document.getElementById('genreSections');
  if (!genreContainer) return;

  /* استخراج كل التصنيفات الفريدة تلقائيًا من البيانات */
  const uniqueGenres = [...new Set(movies.flatMap((movie) => movie.genre))];

  genreContainer.innerHTML = '';

  uniqueGenres.forEach((genre, genreIndex) => {
    const moviesInGenre = movies.filter((movie) => movie.genre.includes(genre));
    if (moviesInGenre.length === 0) return;

    const rowId = `genreRow-${genreIndex}`;

    const section = document.createElement('section');
    section.className = 'movies-section';
    section.innerHTML = `
      <div class="container">
        <h2 class="section-title">${escapeHtml(genre)}</h2>
      </div>
      <div class="row-wrapper">
        <button class="row-arrow row-arrow--left" data-target="${rowId}" aria-label="السابق">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
        <div class="movie-row" id="${rowId}"></div>
        <button class="row-arrow row-arrow--right" data-target="${rowId}" aria-label="التالي">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
      </div>
    `;

    genreContainer.appendChild(section);
    renderMovieRow(document.getElementById(rowId), moviesInGenre);
  });

  attachRowArrowEvents();
}

/* --------------------------------------------------------------------------
   7. أسهم تمرير الصفوف
   -------------------------------------------------------------------------- */
function attachRowArrowEvents() {
  document.querySelectorAll('.row-arrow').forEach((arrow) => {
    /* تجنّب تكرار ربط نفس الحدث أكثر من مرة */
    if (arrow.dataset.bound) return;
    arrow.dataset.bound = 'true';

    arrow.addEventListener('click', () => {
      const targetRow = document.getElementById(arrow.dataset.target);
      if (!targetRow) return;

      const scrollAmount = targetRow.clientWidth * 0.85;
      const isNext = arrow.classList.contains('row-arrow--right');
      targetRow.scrollBy({
        left: isNext ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    });
  });
}

/* --------------------------------------------------------------------------
   8. البحث المباشر (أثناء الكتابة)
   -------------------------------------------------------------------------- */
function initSearch(movies) {
  const searchBox = document.getElementById('searchBox');
  const searchToggle = document.getElementById('searchToggle');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchResultsGrid = document.getElementById('searchResultsGrid');
  if (!searchBox || !searchInput) return;

  searchToggle.addEventListener('click', () => {
    searchBox.classList.toggle('open');
    if (searchBox.classList.contains('open')) searchInput.focus();
  });

  function performSearch(query) {
    const normalized = query.trim().toLowerCase();

    if (normalized === '') {
      searchResults.classList.remove('show');
      searchResultsGrid.innerHTML = '';
      return;
    }

    const results = movies.filter((movie) => {
      const titleMatch = movie.title.toLowerCase().includes(normalized);
      const yearMatch = String(movie.year).includes(normalized);
      const genreMatch = movie.genre.some((g) => g.toLowerCase().includes(normalized));
      return titleMatch || yearMatch || genreMatch;
    });

    searchResultsGrid.innerHTML = '';
    if (results.length === 0) {
      searchResultsGrid.innerHTML = `<p class="search-empty">لا توجد نتائج مطابقة لـ "${escapeHtml(query)}"</p>`;
    } else {
      results.forEach((movie, index) => {
        searchResultsGrid.appendChild(createMovieCard(movie, { animationDelay: index * 40 }));
      });
    }

    searchResults.classList.add('show');
  }

  searchInput.addEventListener('input', (event) => performSearch(event.target.value));

  /* إغلاق نتائج البحث عند الضغط خارجها أو زر Escape */
  document.addEventListener('click', (event) => {
    const clickedInsideSearch = searchBox.contains(event.target) || searchResults.contains(event.target);
    if (!clickedInsideSearch) {
      searchResults.classList.remove('show');
      searchBox.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      searchResults.classList.remove('show');
      searchBox.classList.remove('open');
    }
  });
}

/* --------------------------------------------------------------------------
   9. Navbar: تأثير الزجاج عند التمرير + قائمة الموبايل
   -------------------------------------------------------------------------- */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const icon = navToggle.querySelector('i');
      icon.className = navLinks.classList.contains('open') ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    });

    /* إغلاق القائمة تلقائيًا عند اختيار رابط (تجربة أفضل على الموبايل) */
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.querySelector('i').className = 'fa-solid fa-bars';
      });
    });
  }
}

/* --------------------------------------------------------------------------
   10. صفحة المفضلة (favorites.html)
   -------------------------------------------------------------------------- */
function checkEmptyFavorites() {
  const favoritesGrid = document.getElementById('favoritesGrid');
  if (!favoritesGrid) return;

  if (favoritesGrid.children.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-heart-crack"></i>
        <h3>لا توجد أفلام في المفضلة بعد</h3>
        <p>ابدأ بإضافة الأفلام التي تعجبك بالضغط على أيقونة القلب.</p>
        <a href="index.html" class="btn btn-primary" style="margin-top: 1.2rem;">
          <i class="fa-solid fa-compass"></i> تصفّح الأفلام
        </a>
      </div>
    `;
  }

  updateFavoritesCountLabel();
}

/** تحديث نص عدد الأفلام أعلى صفحة المفضلة (مفرد/مثنى/جمع بسيط) */
function updateFavoritesCountLabel() {
  const countLabel = document.getElementById('favoritesCount');
  if (!countLabel) return;

  const total = getFavoriteIds().length;
  if (total === 0) {
    countLabel.textContent = 'لم تُضِف أي أفلام بعد';
  } else if (total === 1) {
    countLabel.textContent = 'فيلم واحد في قائمتك';
  } else if (total === 2) {
    countLabel.textContent = 'فيلمان في قائمتك';
  } else {
    countLabel.textContent = `${total} أفلام في قائمتك`;
  }
}

async function initFavoritesPage(movies) {
  const favoritesGrid = document.getElementById('favoritesGrid');
  if (!favoritesGrid) return;

  const favoriteIds = getFavoriteIds();
  const favoriteMovies = movies.filter((movie) => favoriteIds.includes(movie.id));

  favoritesGrid.innerHTML = '';
  favoriteMovies.forEach((movie, index) => {
    favoritesGrid.appendChild(createMovieCard(movie, { animationDelay: index * 60 }));
  });

  checkEmptyFavorites();
  updateFavoritesCountLabel();
}

/* --------------------------------------------------------------------------
   11. صفحة تفاصيل الفيلم (movie.html)
   -------------------------------------------------------------------------- */

/** قراءة معرّف الفيلم (id) من رابط الصفحة، مثل movie.html?id=3 */
function getMovieIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

/** عرض رسالة واضحة عند عدم وجود الفيلم المطلوب (رابط خاطئ أو معرّف غير موجود) */
function renderMovieNotFound(container) {
  container.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <i class="fa-solid fa-film"></i>
      <h3>لم يتم العثور على هذا الفيلم</h3>
      <p>الرابط الذي وصلت منه قد يكون غير صحيح.</p>
      <a href="index.html" class="btn btn-primary" style="margin-top: 1rem;">
        <i class="fa-solid fa-house"></i> العودة إلى الرئيسية
      </a>
    </div>
  `;
}

/** بناء قائمة مشاركة الفيلم (نسخ الرابط + مشاركة عبر منصات شائعة) */
function buildShareDropdown(movie) {
  const pageUrl = window.location.href;
  const shareText = encodeURIComponent(`شاهد "${movie.title}" على MovieVerse`);

  return `
    <div class="share-menu">
      <button class="btn btn-glass" id="shareToggleBtn" type="button">
        <i class="fa-solid fa-share-nodes"></i> <span>مشاركة</span>
      </button>
      <div class="share-dropdown" id="shareDropdown">
        <button id="copyLinkBtn" type="button">
          <i class="fa-solid fa-link"></i> نسخ الرابط
        </button>
        <a href="https://wa.me/?text=${shareText}%20${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-whatsapp"></i> واتساب
        </a>
        <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-x-twitter"></i> تويتر / X
        </a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-facebook-f"></i> فيسبوك
        </a>
      </div>
    </div>
  `;
}

function attachShareMenuEvents(movie) {
  const toggleBtn = document.getElementById('shareToggleBtn');
  const dropdown = document.getElementById('shareDropdown');
  const copyBtn = document.getElementById('copyLinkBtn');
  if (!toggleBtn || !dropdown) return;

  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target) && event.target !== toggleBtn) {
      dropdown.classList.remove('show');
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('تم نسخ رابط الفيلم', 'fa-link');
    } catch {
      showToast('تعذّر نسخ الرابط', 'fa-triangle-exclamation');
    }
    dropdown.classList.remove('show');
  });
}

/** بناء محتوى صفحة التفاصيل بالكامل لفيلم محدد */
function renderMovieDetails(movie) {
  const detailContent = document.getElementById('detailContent');
  const detailHeroBg = document.getElementById('detailHeroBg');

  document.title = `${movie.title} | MovieVerse`;

  /* خلفية الصفحة الضبابية: صورة حقيقية إن وُجدت، وإلا التدرج الافتراضي */
  const testImage = new Image();
  testImage.onload = () => {
    detailHeroBg.style.backgroundImage = `url('${movie.image}')`;
    detailHeroBg.classList.remove('detail-hero__bg--placeholder');
  };
  testImage.src = movie.image;

  detailContent.innerHTML = `
    <div class="detail-poster" id="detailPoster"></div>
    <div class="detail-info">
      <h1 class="detail-title">${escapeHtml(movie.title)}</h1>
      <div class="detail-meta">
        ${movie.type === 'series' ? '<span class="hero__badge" style="margin:0;"><i class="fa-solid fa-tv"></i> مسلسل</span>' : ''}
        <span class="badge-rating"><i class="fa-solid fa-star"></i> ${movie.rating} / 10</span>
        <span>${movie.year}</span>
        <span>
          <i class="${movie.type === 'series' ? 'fa-solid fa-layer-group' : 'fa-regular fa-clock'}"></i>
          ${escapeHtml(movie.duration)}
        </span>
      </div>
      <div class="detail-genres">
        ${movie.genre.map((g) => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
        ${(movie.language || [])
          .map((lang) => `<span class="genre-tag"><i class="fa-solid fa-closed-captioning"></i> ${escapeHtml(lang)}</span>`)
          .join('')}
      </div>
      <p class="detail-summary">${escapeHtml(movie.summary)}</p>
      <div class="detail-actions">
        <button class="btn btn-primary" id="detailWatchBtn">
          <i class="fa-solid fa-play"></i> <span>مشاهدة الآن</span>
        </button>
        <button class="btn-icon${isFavorite(movie.id) ? ' active' : ''}" id="detailFavBtn" data-fav-id="${movie.id}" aria-label="إضافة إلى المفضلة">
          <i class="fa-solid fa-heart"></i>
        </button>
        ${buildShareDropdown(movie)}
      </div>
    </div>
  `;

  /* بوستر كبير بنفس آلية الصورة البديلة المستخدمة في البطاقات */
  setPosterBackground(document.getElementById('detailPoster'), movie.image, movie.title);

  document.getElementById('detailWatchBtn').addEventListener('click', () => {
    window.open(movie.link, '_blank', 'noopener,noreferrer');
  });
  document.getElementById('detailFavBtn').addEventListener('click', (event) => {
    handleFavoriteClick(movie, event.currentTarget);
  });
  attachShareMenuEvents(movie);
}

/** بناء صف "أفلام مشابهة" بناءً على اشتراك التصنيف مع الفيلم الحالي */
function renderSimilarMovies(movie, allMoviesList) {
  const similarRow = document.getElementById('rowSimilar');
  if (!similarRow) return;

  const similarMovies = allMoviesList.filter(
    (candidate) => candidate.id !== movie.id && candidate.genre.some((g) => movie.genre.includes(g))
  );

  const similarSection = document.getElementById('similarSection');
  if (similarMovies.length === 0) {
    similarSection?.remove();
    return;
  }

  renderMovieRow(similarRow, similarMovies);
}

async function initMovieDetailsPage(movies) {
  const detailContent = document.getElementById('detailContent');
  if (!detailContent) return; // لسنا في صفحة التفاصيل

  const movieId = getMovieIdFromUrl();
  const movie = movies.find((item) => String(item.id) === String(movieId));

  if (!movie) {
    renderMovieNotFound(detailContent);
    document.getElementById('similarSection')?.remove();
    return;
  }

  renderMovieDetails(movie);
  renderSimilarMovies(movie, movies);
  attachRowArrowEvents();
}

/* --------------------------------------------------------------------------
   12. Scroll Reveal — ظهور تدريجي للأقسام عند الوصول إليها بالتمرير
   -------------------------------------------------------------------------- */
function initScrollReveal() {
  const revealTargets = document.querySelectorAll(
    '.movies-section, .page-header, .detail-content'
  );
  if (revealTargets.length === 0) return;

  revealTargets.forEach((el) => el.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target); // يظهر مرة واحدة ثم لا داعي لمراقبته بعدها
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  );

  revealTargets.forEach((el) => observer.observe(el));
}

/* --------------------------------------------------------------------------
   13. نقطة الدخول الرئيسية
   -------------------------------------------------------------------------- */
async function initApp() {
  initNavbar();

  const movies = await fetchMovies();
  if (movies.length === 0) return;

  /* كل دالة تتحقق داخليًا من وجود عناصرها، لذا يمكن استدعاء الجميع بأمان
     بغض النظر عن الصفحة الحالية (index / movie / favorites) */
  initHero(movies);
  const onlyMovies = movies.filter((movie) => movie.type !== 'series');
  const onlySeries = movies.filter((movie) => movie.type === 'series');

  renderMovieRow(document.getElementById('rowLatest'), [...onlyMovies].sort((a, b) => b.year - a.year));
  renderMovieRow(document.getElementById('rowTrending'), movies.filter((movie) => movie.trending));
  renderMovieRow(document.getElementById('rowSeries'), [...onlySeries].sort((a, b) => b.year - a.year));
  initGenreSections(movies);
  initSearch(movies);
  await initFavoritesPage(movies);
  await initMovieDetailsPage(movies);
  attachRowArrowEvents();

  /* تُستدعى أخيرًا بعد بناء كل الأقسام ديناميكيًا حتى تشملها المراقبة */
  initScrollReveal();
}

document.addEventListener('DOMContentLoaded', initApp);
