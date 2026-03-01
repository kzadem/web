/**
 * PDFix - Shared Navbar with Mega Menu
 * Include this script in every page to auto-generate the navbar.
 * Usage: <script src="js/navbar.js"></script>
 */
(function () {
    'use strict';

    var navEl = document.getElementById('navbar');
    if (!navEl) return;

    navEl.innerHTML = '<div class="container navbar__inner">' +
        '<a href="index.html" class="navbar__logo"><div class="logo-icon">⚡</div><span>PDFix</span></a>' +
        '<div class="navbar__nav">' +
        // Mega Menu
        '<div class="nav-dropdown" id="nav-tools-dropdown">' +
        '<button class="nav-dropdown__trigger" type="button">Araçlar <span class="nav-dropdown__arrow">▾</span></button>' +
        '<div class="mega-menu" id="mega-menu">' +
        '<div class="mega-menu__inner">' +

        // Col 1: PDF Düzenle
        '<div class="mega-menu__col">' +
        '<div class="mega-menu__col-title">✏️ PDF Düzenle</div>' +
        '<a href="merge.html" class="mega-menu__item">🔗 PDF Birleştir</a>' +
        '<a href="split.html" class="mega-menu__item">✂️ PDF Böl</a>' +
        '<a href="compress.html" class="mega-menu__item">⚡ PDF Sıkıştır</a>' +
        '<a href="rotate.html" class="mega-menu__item">🔄 PDF Döndür</a>' +
        '<a href="watermark.html" class="mega-menu__item">🔖 Filigran Ekle</a>' +
        '<a href="pagenumber.html" class="mega-menu__item">🔢 Sayfa Numarası</a>' +
        '</div>' +

        // Col 2: PDF'den Dönüştür
        '<div class="mega-menu__col">' +
        '<div class="mega-menu__col-title">📤 PDF\'den Dönüştür</div>' +
        '<a href="pdf-to-word.html" class="mega-menu__item">📝 PDF → Word</a>' +
        '<a href="pdf-to-excel.html" class="mega-menu__item">📊 PDF → Excel</a>' +
        '<a href="pdf-to-pptx.html" class="mega-menu__item">📊 PDF → PPT</a>' +
        '<a href="pdf-to-jpg.html" class="mega-menu__item">🖼️ PDF → JPG</a>' +
        '</div>' +

        // Col 3: PDF'e Dönüştür
        '<div class="mega-menu__col">' +
        '<div class="mega-menu__col-title">📥 PDF\'e Dönüştür</div>' +
        '<a href="word-to-pdf.html" class="mega-menu__item">📄 Word → PDF</a>' +
        '<a href="excel-to-pdf.html" class="mega-menu__item">📈 Excel → PDF</a>' +
        '<a href="jpg-to-pdf.html" class="mega-menu__item">🗂️ JPG → PDF</a>' +
        '<a href="html-to-pdf.html" class="mega-menu__item">🌐 HTML → PDF</a>' +
        '</div>' +

        // Col 4: Güvenlik & Diğer
        '<div class="mega-menu__col">' +
        '<div class="mega-menu__col-title">🛡️ Güvenlik & Diğer</div>' +
        '<a href="protect.html" class="mega-menu__item">🔐 PDF Koru</a>' +
        '<a href="unlock.html" class="mega-menu__item">🔓 Kilit Aç</a>' +
        '<a href="sign.html" class="mega-menu__item">✍️ PDF İmzala</a>' +
        '<a href="redact.html" class="mega-menu__item">🚫 Sansürle</a>' +
        '<a href="repair.html" class="mega-menu__item">🔧 PDF Onar</a>' +
        '<a href="ocr.html" class="mega-menu__item">🔍 OCR Metin Tanı</a>' +
        '</div>' +

        '</div>' +
        '<div class="mega-menu__footer"><a href="index.html#tools" class="mega-menu__all-link">📋 Tüm Araçları Gör →</a></div>' +
        '</div>' +
        '</div>' +
        // Other nav links
        '<a href="index.html#features">Özellikler</a>' +
        '<a href="compress.html">Sıkıştır</a>' +
        '<a href="merge.html">Birleştir</a>' +
        '</div>' +
        '<div class="navbar__actions">' +
        '<a href="index.html#tools" class="btn btn-outline btn-sm">Tüm Araçlar</a>' +
        '<a href="merge.html" class="btn btn-primary btn-sm ripple-btn btn-glow">Başla →</a>' +
        '</div>' +
        '</div>';

    // ── Toggle Logic ──
    var dropdown = document.getElementById('nav-tools-dropdown');
    var trigger = dropdown.querySelector('.nav-dropdown__trigger');

    trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
        if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') dropdown.classList.remove('open');
    });

    dropdown.querySelectorAll('.mega-menu__item, .mega-menu__all-link').forEach(function (link) {
        link.addEventListener('click', function () { dropdown.classList.remove('open'); });
    });
})();
