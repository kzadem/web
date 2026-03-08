/**
 * PDFix – Word → PDF Converter
 * Uses mammoth.js to parse DOCX → HTML, then html2canvas + jsPDF to render to PDF.
 */
document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    let pdfBlob = null;
    let originalFileName = '';

    // ── Drop Zone Setup ─────────────────────────────────────────────────
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        multiple: false,
        onFilesAdded: (files) => {
            const processBtn = document.getElementById('process-btn');
            const fileSection = document.getElementById('file-section');
            if (files.length > 0) {
                processBtn.disabled = false;
                processBtn.style.opacity = '1';
                fileSection.style.display = 'block';
                originalFileName = files[0].name.replace(/\.(docx?|DOCX?)$/, '');
            } else {
                processBtn.disabled = true;
                processBtn.style.opacity = '0.5';
                fileSection.style.display = 'none';
            }
        }
    });

    // ── Margin Map ──────────────────────────────────────────────────────
    const marginMap = { none: 0, narrow: 10, normal: 20, wide: 30 };

    // ── Process Button ──────────────────────────────────────────────────
    const processBtn = document.getElementById('process-btn');
    processBtn.addEventListener('click', async () => {
        const files = dropZone.getFiles();
        if (!files.length) {
            window.Toast.show('Lütfen bir Word dosyası seçin.', 'error');
            return;
        }

        const file = files[0];
        const pageSize = document.getElementById('page-size').value;
        const orientation = document.getElementById('orientation').value;
        const marginKey = document.getElementById('margin').value;
        const margin = marginMap[marginKey];

        // Show progress
        document.getElementById('file-section').style.display = 'none';
        document.getElementById('progress-section').style.display = 'block';
        processBtn.disabled = true;

        const progressBar = document.getElementById('progress-bar');
        const progressStatus = document.getElementById('progress-status');

        try {
            // Step 1: Read file
            progressStatus.textContent = 'Dosya okunuyor...';
            progressBar.style.width = '10%';
            const arrayBuffer = await file.arrayBuffer();

            // Step 2: Convert to HTML via mammoth
            progressStatus.textContent = 'Word içeriği çözümleniyor...';
            progressBar.style.width = '25%';

            const result = await mammoth.convertToHtml(
                { arrayBuffer },
                {
                    styleMap: [
                        "p[style-name='Heading 1'] => h1:fresh",
                        "p[style-name='Heading 2'] => h2:fresh",
                        "p[style-name='Heading 3'] => h3:fresh",
                        "p[style-name='Heading 4'] => h4:fresh"
                    ],
                    convertImage: mammoth.images.imgElement(function (image) {
                        return image.read("base64").then(function (imageBuffer) {
                            return {
                                src: "data:" + image.contentType + ";base64," + imageBuffer
                            };
                        });
                    })
                }
            );

            const html = result.value;
            if (result.messages.length > 0) {
                console.log('Mammoth warnings:', result.messages);
            }

            // Step 3: Page dimensions
            progressStatus.textContent = 'PDF oluşturuluyor...';
            progressBar.style.width = '40%';

            const pageSizes = {
                a4: [210, 297],
                letter: [215.9, 279.4],
                legal: [215.9, 355.6]
            };
            const [rawW, rawH] = pageSizes[pageSize] || pageSizes.a4;
            const pageW = orientation === 'landscape' ? rawH : rawW;
            const pageH = orientation === 'landscape' ? rawW : rawH;
            const contentW = pageW - margin * 2;
            const contentH = pageH - margin * 2;

            // Render HTML into a visible (but offscreen) container
            const containerWidthPx = contentW * 3.78; // mm to px approx

            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                left: 0; top: 0;
                width: ${containerWidthPx}px;
                background: #ffffff;
                z-index: -9999;
                opacity: 0;
                pointer-events: none;
                font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                font-size: 11pt;
                line-height: 1.6;
                color: #222;
                padding: 20px;
                box-sizing: border-box;
            `;
            container.innerHTML = `
                <style>
                    * { box-sizing: border-box; }
                    h1 { font-size: 22pt; font-weight: 800; margin: 0 0 10px; color: #111; }
                    h2 { font-size: 17pt; font-weight: 700; margin: 18px 0 8px; color: #222; }
                    h3 { font-size: 14pt; font-weight: 700; margin: 14px 0 6px; color: #333; }
                    h4 { font-size: 12pt; font-weight: 600; margin: 12px 0 5px; color: #444; }
                    p { margin: 0 0 8px; }
                    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
                    th, td { border: 1px solid #bbb; padding: 5px 10px; font-size: 10pt; }
                    th { background: #f0f0f0; font-weight: 700; }
                    ul, ol { margin: 6px 0 10px 24px; }
                    li { margin-bottom: 3px; }
                    img { max-width: 100%; height: auto; margin: 8px 0; }
                    strong, b { font-weight: 700; }
                    em, i { font-style: italic; }
                    u { text-decoration: underline; }
                    a { color: #0066cc; text-decoration: underline; }
                    blockquote { border-left: 4px solid #ddd; margin: 8px 0; padding: 8px 16px; color: #555; }
                    pre, code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 10pt; }
                    pre { padding: 12px; overflow-x: auto; }
                </style>
                ${html}
            `;
            document.body.appendChild(container);

            // Wait for images to load
            progressStatus.textContent = 'Görseller yükleniyor...';
            progressBar.style.width = '50%';

            const imgs = container.querySelectorAll('img');
            if (imgs.length > 0) {
                await Promise.allSettled(
                    Array.from(imgs).map(img => new Promise((resolve) => {
                        if (img.complete) return resolve();
                        img.onload = resolve;
                        img.onerror = resolve;
                        setTimeout(resolve, 5000);
                    }))
                );
            }

            // Small delay to ensure rendering is complete
            await new Promise(r => setTimeout(r, 300));

            // Step 4: Capture with html2canvas
            progressStatus.textContent = 'Sayfa render ediliyor...';
            progressBar.style.width = '60%';

            // Make container visible for html2canvas
            container.style.opacity = '1';
            container.style.zIndex = '99999';

            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: containerWidthPx,
                windowWidth: containerWidthPx
            });

            // Hide and remove container
            document.body.removeChild(container);

            // Step 5: Create PDF from canvas with multi-page splitting
            progressStatus.textContent = 'PDF sayfaları oluşturuluyor...';
            progressBar.style.width = '75%';

            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: [pageW, pageH]
            });

            // Scale canvas to fit page content width
            const imgWidth = contentW;
            const imgHeight = (canvas.height * contentW) / canvas.width;

            // Split into pages
            const totalPages = Math.ceil(imgHeight / contentH);

            for (let page = 0; page < totalPages; page++) {
                if (page > 0) doc.addPage();

                // Calculate source region from the canvas for this page
                const srcY = Math.round(page * (canvas.width * contentH / contentW));
                const srcH = Math.min(
                    Math.round(canvas.width * contentH / contentW),
                    canvas.height - srcY
                );

                if (srcH <= 0) break;

                // Create a sub-canvas for this page
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = srcH;
                const ctx = pageCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

                const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
                const pageImgH = (srcH * contentW) / canvas.width;

                doc.addImage(pageDataUrl, 'JPEG', margin, margin, contentW, pageImgH);

                const pct = Math.round(75 + ((page + 1) / totalPages) * 20);
                progressBar.style.width = pct + '%';
                progressStatus.textContent = `Sayfa ${page + 1}/${totalPages} oluşturuluyor...`;
            }

            // Step 6: Generate blob
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
                    `${originalFileName}.docx → ${originalFileName}.pdf (${totalPages} sayfa, ${sizeStr})`;
                window.Toast.show('Word dosyanız PDF\'e dönüştürüldü! ✨', 'success');
            }, 400);

        } catch (err) {
            console.error('Word → PDF error:', err);
            document.getElementById('progress-section').style.display = 'none';
            document.getElementById('file-section').style.display = 'block';
            processBtn.disabled = false;
            processBtn.style.opacity = '1';
            window.Toast.show('Dönüşüm sırasında hata oluştu: ' + err.message, 'error');
        }
    });

    // ── Download ────────────────────────────────────────────────────────
    document.getElementById('download-btn').addEventListener('click', () => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (originalFileName || 'word-to-pdf') + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
        window.Toast.show('İndirme başladı!', 'success');
    });

    // ── Again ───────────────────────────────────────────────────────────
    document.getElementById('again-btn').addEventListener('click', () => {
        document.getElementById('result-section').style.display = 'none';
        pdfBlob = null;
        originalFileName = '';
        if (dropZone) dropZone.clearFiles();
        const processBtn2 = document.getElementById('process-btn');
        processBtn2.disabled = true;
        processBtn2.style.opacity = '0.5';
        processBtn2.innerHTML = '📄 PDF\'e Dönüştür';
        document.getElementById('file-section').style.display = 'none';
    });
});
