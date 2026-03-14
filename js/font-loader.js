/**
 * PDFix Font Loader
 * Merkezi font yükleme modülü — fonts.json'daki fontları yönetir.
 * Kullanım:
 *   var fontBytes = await FontLoader.load('NotoSans-Regular');
 *   var font = await doc.embedFont(fontBytes, { subset: true });
 */
var FontLoader = (function () {
    'use strict';

    var FONTS_JSON_PATH = 'js/lib/fonts.json';
    var FONT_DIR = 'js/lib/';
    var _fontsConfig = null;

    /** fonts.json'ı yükle ve önbelleğe al */
    async function _loadConfig() {
        if (_fontsConfig) return _fontsConfig;
        try {
            var resp = await fetch(FONTS_JSON_PATH);
            if (resp.ok) {
                _fontsConfig = await resp.json();
                return _fontsConfig;
            }
        } catch (e) { }
        // Varsayılan config (fonts.json yoksa)
        _fontsConfig = {
            fonts: [{
                name: 'NotoSans-Regular',
                file: 'NotoSans-Regular.ttf',
                downloadUrl: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf'
            }]
        };
        return _fontsConfig;
    }

    /**
     * Font yükle (önce yerel, sonra CDN)
     * @param {string} fontName - Font adı (ör: 'NotoSans-Regular')
     * @returns {Promise<ArrayBuffer|null>} Font bytes veya null
     */
    async function load(fontName) {
        var config = await _loadConfig();
        var fontEntry = null;

        for (var i = 0; i < config.fonts.length; i++) {
            if (config.fonts[i].name === fontName) {
                fontEntry = config.fonts[i];
                break;
            }
        }

        if (!fontEntry) {
            console.warn('[FontLoader] Font bulunamadı: ' + fontName);
            return null;
        }

        // 1. Yerel dosyayı dene
        var urls = [
            FONT_DIR + fontEntry.file,
            fontEntry.downloadUrl
        ];

        for (var u = 0; u < urls.length; u++) {
            if (!urls[u]) continue;
            try {
                var resp = await fetch(urls[u]);
                if (resp.ok) {
                    var buf = await resp.arrayBuffer();
                    if (buf.byteLength > 1000) {
                        if (u > 0) {
                            console.info('[FontLoader] CDN\'den yüklendi: ' + fontEntry.name);
                        }
                        return buf;
                    }
                }
            } catch (e) { /* sonrakini dene */ }
        }

        // Hiçbiri çalışmadı
        if (window.Toast) {
            window.Toast.show(
                fontEntry.name + ' fontu yüklenemedi. js/lib/' + fontEntry.file + ' dosyasını indirin.',
                'error'
            );
        }
        console.error('[FontLoader] Font yüklenemedi: ' + fontEntry.name +
            '\nİndirme: ' + fontEntry.downloadUrl +
            '\nKonum: js/lib/' + fontEntry.file);
        return null;
    }

    /**
     * Tüm fontları listele (fonts.json'dan)
     * @returns {Promise<Array>} Font listesi
     */
    async function list() {
        var config = await _loadConfig();
        return config.fonts;
    }

    return { load: load, list: list };
})();
