/**
 * PDFix – HTML → PDF Converter
 * Uses html2canvas to capture HTML content and jsPDF to create multi-page PDF.
 */
document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    let pdfBlob = null;
    let htmlContent = '';
    let inputMode = 'file'; // 'file' or 'code'
    let loadedFileName = '';

    // ── Tab Switching ───────────────────────────────────────────────────
    const tabs = document.querySelectorAll('.html-input-tab');
    const panels = {
        file: document.getElementById('panel-file'),
        code: document.getElementById('panel-code')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            inputMode = tab.dataset.tab;

            Object.values(panels).forEach(p => p.classList.remove('active'));
            panels[inputMode].classList.add('active');

            // Hide preview when switching
            document.getElementById('preview-section').style.display = 'none';
        });
    });

    // ── File Upload ─────────────────────────────────────────────────────
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        accept: '.html,.htm,text/html',
        multiple: false,
        onFilesAdded: async (files) => {
            if (files.length > 0) {
                loadedFileName = files[0].name.replace(/\.(html?|HTML?)$/, '');
                try {
                    htmlContent = await files[0].text();
                    showPreview(htmlContent);
                    window.Toast.show('HTML dosyası yüklendi!', 'success');
                } catch (err) {
                    window.Toast.show('Dosya okunamadı: ' + err.message, 'error');
                }
            }
        }
    });

    // ── Code Preview Button ─────────────────────────────────────────────
    document.getElementById('preview-code-btn').addEventListener('click', () => {
        const code = document.getElementById('html-code').value.trim();
        if (!code) {
            window.Toast.show('Lütfen HTML kodu girin.', 'error');
            return;
        }
        htmlContent = code;
        loadedFileName = 'html-content';
        showPreview(htmlContent);
    });

    // ── Show Preview ────────────────────────────────────────────────────
    function showPreview(html) {
        const previewSection = document.getElementById('preview-section');
        const previewFrame = document.getElementById('preview-frame');
        previewSection.style.display = 'block';

        // Write to iframe
        const frameDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        margin: 16px;
                        font-family: 'Segoe UI', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                        color: #333;
                    }
                    img { max-width: 100%; height: auto; }
                    table { border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 6px 10px; }
                </style>
            </head>
            <body>${html}</body>
            </html>
        `);
        frameDoc.close();

        // Auto-resize iframe
        setTimeout(() => {
            try {
                const contentHeight = frameDoc.body.scrollHeight;
                previewFrame.style.height = Math.min(Math.max(contentHeight + 40, 200), 500) + 'px';
            } catch (e) {
                previewFrame.style.height = '300px';
            }
        }, 200);
    }

    // ── Margin Map ──────────────────────────────────────────────────────
    const marginMap = { none: 0, narrow: 8, normal: 15, wide: 25 };

    // ── Process Button ──────────────────────────────────────────────────
    document.getElementById('process-btn').addEventListener('click', async () => {
        // Get HTML content based on mode
        if (inputMode === 'code') {
            const code = document.getElementById('html-code').value.trim();
            if (!code) {
                window.Toast.show('Lütfen HTML kodu girin.', 'error');
                return;
            }
            htmlContent = code;
            loadedFileName = 'html-content';
        }

        if (!htmlContent) {
            window.Toast.show('Lütfen bir HTML dosyası yükleyin veya HTML kodu girin.', 'error');
            return;
        }

        const pageSize = document.getElementById('page-size').value;
        const orientation = document.getElementById('orientation').value;
        const marginKey = document.getElementById('margin').value;
        const scale = parseFloat(document.getElementById('scale').value);
        const margin = marginMap[marginKey];

        // Show progress
        document.getElementById('options-section').style.display = 'none';
        document.getElementById('preview-section').style.display = 'none';
        document.querySelectorAll('.html-input-panel').forEach(p => p.style.display = 'none');
        document.querySelector('.html-input-tabs').style.display = 'none';
        document.getElementById('progress-section').style.display = 'block';

        const progressBar = document.getElementById('progress-bar');
        const progressStatus = document.getElementById('progress-status');

        try {
            progressStatus.textContent = 'HTML içeriği hazırlanıyor...';
            progressBar.style.width = '15%';

            // Create render container
            const pageSizes = {
                a4: [210, 297],
                letter: [215.9, 279.4],
                legal: [215.9, 355.6]
            };
            const [pageW, pageH] = pageSizes[pageSize] || pageSizes.a4;
            const effW = (orientation === 'landscape' ? pageH : pageW) - margin * 2;
            const containerWidthPx = effW * 3.78 * scale;

            const container = document.createElement('div');
            container.style.cssText = `
                position: absolute; left: -9999px; top: 0;
                width: ${containerWidthPx}px;
                background: #fff;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #333;
                padding: 16px;
            `;

            // Wrap HTML with basic styling
            container.innerHTML = `
                <style>
                    * { box-sizing: border-box; }
                    body { margin: 0; }
                    h1 { font-size: 24pt; font-weight: 800; margin: 0 0 12px; color: #111; }
                    h2 { font-size: 18pt; font-weight: 700; margin: 16px 0 8px; color: #222; }
                    h3 { font-size: 14pt; font-weight: 700; margin: 12px 0 6px; color: #333; }
                    p { margin: 0 0 8px; }
                    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
                    th, td { border: 1px solid #ccc; padding: 6px 10px; }
                    th { background: #f5f5f5; font-weight: 700; }
                    ul, ol { margin: 6px 0 10px 20px; }
                    img { max-width: 100%; height: auto; }
                    a { color: #0066cc; }
                    pre, code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
                    pre { padding: 12px; overflow-x: auto; }
                    blockquote { border-left: 4px solid #ddd; margin: 8px 0; padding: 8px 16px; color: #666; }
                </style>
                ${htmlContent}
            `;
            document.body.appendChild(container);

            // Wait for images to load
            progressStatus.textContent = 'Görseller yükleniyor...';
            progressBar.style.width = '30%';

            const imgs = container.querySelectorAll('img');
            if (imgs.length > 0) {
                await Promise.allSettled(
                    Array.from(imgs).map(img => new Promise((resolve) => {
                        if (img.complete) return resolve();
                        img.onload = resolve;
                        img.onerror = resolve;
                        setTimeout(resolve, 5000); // 5s timeout per image
                    }))
                );
            }

            // Capture with html2canvas
            progressStatus.textContent = 'Sayfa render ediliyor...';
            progressBar.style.width = '50%';

            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: containerWidthPx
            });

            document.body.removeChild(container);

            // Create PDF from canvas
            progressStatus.textContent = 'PDF sayfaları oluşturuluyor...';
            progressBar.style.width = '75%';

            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: pageSize
            });

            const docW = (orientation === 'landscape' ? pageH : pageW);
            const docH = (orientation === 'landscape' ? pageW : pageH);
            const contentW = docW - margin * 2;
            const contentH = docH - margin * 2;

            // Scale canvas to fit page width
            const imgWidth = contentW;
            const imgHeight = (canvas.height * contentW) / canvas.width;

            // Multi-page splitting
            const totalPages = Math.ceil(imgHeight / contentH);
            const canvasDataUrl = canvas.toDataURL('image/jpeg', 0.95);

            for (let page = 0; page < totalPages; page++) {
                if (page > 0) doc.addPage();

                const srcY = page * (canvas.width * contentH / contentW);
                const srcH = Math.min(canvas.width * contentH / contentW, canvas.height - srcY);

                if (srcH <= 0) break;

                // Create a sub-canvas for this page
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = srcH;
                const ctx = pageCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

                const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
                const pageImgH = (srcH * contentW) / canvas.width;

                doc.addImage(pageDataUrl, 'JPEG', margin, margin, contentW, pageImgH);

                const pct = Math.round(75 + (page / totalPages) * 20);
                progressBar.style.width = pct + '%';
                progressStatus.textContent = `Sayfa ${page + 1}/${totalPages} oluşturuluyor...`;
            }

            // Generate blob
            progressStatus.textContent = 'PDF dosyası hazırlanıyor...';
            progressBar.style.width = '98%';

            pdfBlob = doc.output('blob');

            progressBar.style.width = '100%';
            progressStatus.textContent = 'Tamamlandı!';

            setTimeout(() => {
                document.getElementById('progress-section').style.display = 'none';
                document.getElementById('result-section').style.display = 'block';
                const sizeStr = window.formatFileSize(pdfBlob.size);
                document.getElementById('result-info').textContent =
                    `HTML → PDF (${totalPages} sayfa, ${sizeStr})`;
                window.Toast.show('HTML içeriğiniz PDF\'e dönüştürüldü! ✨', 'success');
            }, 400);

        } catch (err) {
            console.error('HTML → PDF error:', err);
            document.getElementById('progress-section').style.display = 'none';
            resetInputUI();
            window.Toast.show('Dönüşüm sırasında hata oluştu: ' + err.message, 'error');
        }
    });

    // ── Reset Input UI ──────────────────────────────────────────────────
    function resetInputUI() {
        document.getElementById('options-section').style.display = '';
        document.querySelector('.html-input-tabs').style.display = '';
        tabs.forEach(tab => {
            if (tab.dataset.tab === inputMode) {
                tab.classList.add('active');
            }
        });
        panels[inputMode].style.display = 'block';
        panels[inputMode].classList.add('active');
    }

    // ── Download ────────────────────────────────────────────────────────
    document.getElementById('download-btn').addEventListener('click', () => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (loadedFileName || 'html-to-pdf') + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
        window.Toast.show('İndirme başladı!', 'success');
    });

    // ── Again ───────────────────────────────────────────────────────────
    document.getElementById('again-btn').addEventListener('click', () => {
        document.getElementById('result-section').style.display = 'none';
        pdfBlob = null;
        htmlContent = '';
        loadedFileName = '';
        document.getElementById('html-code').value = '';
        document.getElementById('preview-section').style.display = 'none';

        // Reset to file tab
        resetInputUI();

        if (dropZone) dropZone.clearFiles();
    });
});
