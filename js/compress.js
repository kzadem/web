/**
 * PDFix - PDF Compress (Real compression)
 * Uses pdf.js to render pages + jsPDF to reconstruct compressed PDF
 * 
 * Compression approach:
 * - Render each page to canvas at configurable scale
 * - Export canvas as JPEG at configurable quality
 * - Assemble new PDF from JPEG images via jsPDF
 */

document.addEventListener('DOMContentLoaded', () => {
    const pdfjsLib = window.pdfjsLib;
    const jspdf = window.jspdf;

    if (!pdfjsLib) {
        console.error('pdf.js library not loaded');
        return;
    }
    if (!jspdf) {
        console.error('jsPDF library not loaded');
        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/lib/pdf.worker.min.js';

    /* ── Compression presets ──────────────────────────────────────────── */
    // Higher scale = sharper text, lower JPEG quality = smaller file
    // Text readability requires minimum scale 1.5 and quality 0.50
    const PRESETS = {
        extreme: { scale: 1.5, jpegQuality: 0.50 },
        recommended: { scale: 1.8, jpegQuality: 0.70 },
        low: { scale: 2.0, jpegQuality: 0.92 }
    };

    /* ── State ────────────────────────────────────────────────────────── */
    let selectedFile = null;
    let compressedBlob = null;

    /* ── Drop zone setup ─────────────────────────────────────────────── */
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');

    // Make the whole zone clickable (single click uploads)
    if (uploadZone && fileInput) {
        uploadZone.style.cursor = 'pointer';
        uploadZone.addEventListener('click', (e) => {
            // Don't trigger if clicking remove button or the browse button (already handled)
            if (e.target.closest('.file-item__remove') || e.target.closest('button')) return;
            fileInput.click();
        });
    }

    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        multiple: false,
        onFilesAdded: (files) => {
            selectedFile = files.length > 0 ? files[0] : null;
            updateUI(files);
            if (selectedFile) renderPreview(selectedFile);
        }
    });

    /* ── UI elements ─────────────────────────────────────────────────── */
    const processBtn = document.getElementById('process-btn');
    const fileSection = document.getElementById('file-section');
    const progressSect = document.getElementById('progress-section');
    const resultSection = document.getElementById('result-section');
    const progressBar = document.getElementById('progress-bar');
    const progressStat = document.getElementById('progress-status');
    const beforeSizeEl = document.getElementById('before-size');
    const afterSizeEl = document.getElementById('after-size');
    const downloadBtn = document.getElementById('download-btn');
    const againBtn = document.getElementById('again-btn');

    function updateUI(files) {
        if (!processBtn) return;
        if (files && files.length > 0) {
            processBtn.disabled = false;
            processBtn.style.opacity = '1';
            if (fileSection) fileSection.style.display = 'block';
        } else {
            processBtn.disabled = true;
            processBtn.style.opacity = '0.5';
            if (fileSection) fileSection.style.display = 'none';
        }
    }
    updateUI([]);

    /* ── PDF Thumbnail Preview ────────────────────────────────────────── */
    async function renderPreview(file) {
        const previewEl = document.getElementById('compress-preview');
        if (!previewEl) return;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            previewEl.innerHTML = '';
            previewEl.appendChild(canvas);
            previewEl.style.display = 'block';
        } catch (e) {
            console.warn('Preview render failed:', e);
        }
    }

    /* ── Helper: format file size ─────────────────────────────────────── */
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    /* ── Get selected compression level ──────────────────────────────── */
    function getCompressLevel() {
        const checked = document.querySelector('input[name="compress-level"]:checked');
        return checked ? checked.value : 'recommended';
    }

    /* ── Get image quality from slider ───────────────────────────────── */
    function getQualitySlider() {
        const slider = document.querySelector('.range-slider');
        return slider ? parseInt(slider.value, 10) / 100 : 0.72;
    }

    /* ── Core compression ────────────────────────────────────────────── */
    async function compressPDF(file) {
        const originalSize = file.size;
        const arrayBuffer = await file.arrayBuffer();

        // Load PDF
        progressStat.textContent = 'PDF yükleniyor...';
        progressBar.style.width = '5%';

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        // Get compression settings
        const level = getCompressLevel();
        const preset = PRESETS[level];
        const sliderQuality = getQualitySlider();

        // Use slider to fine-tune quality (0..1 range, default 0.72)
        // Slider adjusts quality proportionally: lower slider = more compression
        const finalQuality = Math.max(0.40, Math.min(preset.jpegQuality * (sliderQuality / 0.72), 0.95));
        const scale = preset.scale;

        progressStat.textContent = `${numPages} sayfa işlenecek...`;
        progressBar.style.width = '10%';

        // Render all pages
        const pageImages = [];

        for (let i = 1; i <= numPages; i++) {
            progressStat.textContent = `Sayfa ${i}/${numPages} işleniyor...`;
            const pct = 10 + Math.round((i / numPages) * 70);
            progressBar.style.width = pct + '%';

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            // White background for JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // Get JPEG data
            const jpegDataUrl = canvas.toDataURL('image/jpeg', finalQuality);

            pageImages.push({
                dataUrl: jpegDataUrl,
                width: viewport.width,
                height: viewport.height
            });

            // Cleanup
            canvas.width = 0;
            canvas.height = 0;
        }

        // Build new PDF with jsPDF
        progressStat.textContent = 'Yeni PDF oluşturuluyor...';
        progressBar.style.width = '85%';

        let outputPdf = null;

        for (let i = 0; i < pageImages.length; i++) {
            const img = pageImages[i];
            // Convert px to mm (assuming 72 DPI base)
            const widthMM = (img.width / scale) * 25.4 / 72;
            const heightMM = (img.height / scale) * 25.4 / 72;

            const orientation = widthMM > heightMM ? 'landscape' : 'portrait';

            if (i === 0) {
                outputPdf = new jspdf.jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: [widthMM, heightMM],
                    compress: true
                });
            } else {
                outputPdf.addPage([widthMM, heightMM], orientation);
            }

            outputPdf.addImage(img.dataUrl, 'JPEG', 0, 0, widthMM, heightMM, undefined, 'FAST');
        }

        progressStat.textContent = 'Dosya hazırlanıyor...';
        progressBar.style.width = '95%';

        const pdfOutput = outputPdf.output('blob');
        const compressedSize = pdfOutput.size;

        progressBar.style.width = '100%';

        return {
            blob: pdfOutput,
            originalSize: originalSize,
            compressedSize: compressedSize
        };
    }

    /* ── Process button ──────────────────────────────────────────────── */
    if (processBtn) {
        processBtn.addEventListener('click', async () => {
            if (!selectedFile) {
                window.Toast && window.Toast.show('Lütfen önce bir PDF seçin.', 'error');
                return;
            }

            // Show progress
            if (fileSection) fileSection.style.display = 'none';
            if (progressSect) progressSect.style.display = 'block';
            if (resultSection) resultSection.style.display = 'none';
            processBtn.disabled = true;
            processBtn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> İşleniyor...';

            try {
                const result = await compressPDF(selectedFile);
                compressedBlob = result.blob;

                // Update result UI
                beforeSizeEl.textContent = formatSize(result.originalSize);
                afterSizeEl.textContent = formatSize(result.compressedSize);

                // Calculate savings
                const savings = Math.round((1 - result.compressedSize / result.originalSize) * 100);
                const savingsEl = document.querySelector('.result-card .text-gradient');
                if (savingsEl) {
                    if (savings > 0) {
                        savingsEl.textContent = `%${savings}`;
                        savingsEl.style.color = '';
                    } else {
                        savingsEl.textContent = `+%${Math.abs(savings)}`;
                        savingsEl.style.color = 'var(--accent-red)';
                    }
                }

                // Show result
                if (progressSect) progressSect.style.display = 'none';
                if (resultSection) resultSection.style.display = 'block';
                window.Toast && window.Toast.show('PDF başarıyla sıkıştırıldı! ✨', 'success');

            } catch (err) {
                console.error('Compression error:', err);
                window.Toast && window.Toast.show('Sıkıştırma sırasında hata oluştu: ' + err.message, 'error');
                if (progressSect) progressSect.style.display = 'none';
                if (fileSection) fileSection.style.display = 'block';
            }

            processBtn.innerHTML = '⚡ PDF\'i Sıkıştır';
            processBtn.disabled = false;
        });
    }

    /* ── Download button ─────────────────────────────────────────────── */
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!compressedBlob) {
                window.Toast && window.Toast.show('İndirilecek dosya bulunamadı.', 'error');
                return;
            }
            const name = selectedFile
                ? selectedFile.name.replace('.pdf', '') + '_compressed.pdf'
                : 'compressed.pdf';
            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
            window.Toast && window.Toast.show('İndirme başladı!', 'success');
        });
    }

    /* ── Again button ────────────────────────────────────────────────── */
    if (againBtn) {
        againBtn.addEventListener('click', () => {
            if (resultSection) resultSection.style.display = 'none';
            if (fileSection) fileSection.style.display = 'none';
            selectedFile = null;
            compressedBlob = null;
            if (dropZone) dropZone.clearFiles();
            updateUI([]);
        });
    }
});
