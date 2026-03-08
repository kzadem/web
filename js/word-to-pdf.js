/**
 * PDFix – Word → PDF Converter
 * Uses mammoth.js to parse DOCX → HTML, then jsPDF to render HTML content to PDF.
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
            progressBar.style.width = '30%';

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

            // Step 3: Create PDF
            progressStatus.textContent = 'PDF oluşturuluyor...';
            progressBar.style.width = '50%';

            const pageSizes = {
                a4: [210, 297],
                letter: [215.9, 279.4],
                legal: [215.9, 355.6]
            };
            const [pageW, pageH] = pageSizes[pageSize] || pageSizes.a4;

            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: [pageW, pageH]
            });

            const effectiveW = (orientation === 'landscape' ? pageH : pageW) - margin * 2;
            const effectiveH = (orientation === 'landscape' ? pageW : pageH) - margin * 2;

            // Render HTML into a hidden container for measuring
            progressStatus.textContent = 'İçerik render ediliyor...';
            progressBar.style.width = '60%';

            const container = document.createElement('div');
            container.style.cssText = `
                position: absolute; left: -9999px; top: 0;
                width: ${effectiveW * 3.78}px;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 11pt; line-height: 1.5; color: #222;
            `;
            container.innerHTML = `
                <style>
                    h1 { font-size: 22pt; font-weight: 800; margin: 0 0 8px; color: #111; }
                    h2 { font-size: 17pt; font-weight: 700; margin: 16px 0 6px; color: #222; }
                    h3 { font-size: 14pt; font-weight: 700; margin: 12px 0 4px; color: #333; }
                    h4 { font-size: 12pt; font-weight: 600; margin: 10px 0 4px; color: #444; }
                    p { margin: 0 0 6px; }
                    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
                    th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 10pt; }
                    th { background: #f0f0f0; font-weight: 700; }
                    ul, ol { margin: 4px 0 8px 20px; }
                    li { margin-bottom: 2px; }
                    img { max-width: 100%; height: auto; margin: 6px 0; }
                    strong, b { font-weight: 700; }
                    em, i { font-style: italic; }
                    u { text-decoration: underline; }
                </style>
                ${html}
            `;
            document.body.appendChild(container);

            // Use jsPDF html method
            progressStatus.textContent = 'PDF sayfaları oluşturuluyor...';
            progressBar.style.width = '75%';

            await doc.html(container, {
                callback: function () { },
                x: margin,
                y: margin,
                width: effectiveW,
                windowWidth: effectiveW * 3.78,
                margin: [margin, margin, margin, margin],
                autoPaging: 'text',
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false
                }
            });

            document.body.removeChild(container);

            // Step 4: Generate blob
            progressStatus.textContent = 'PDF dosyası hazırlanıyor...';
            progressBar.style.width = '95%';

            pdfBlob = doc.output('blob');

            // Complete
            progressBar.style.width = '100%';
            progressStatus.textContent = 'Tamamlandı!';

            setTimeout(() => {
                document.getElementById('progress-section').style.display = 'none';
                document.getElementById('result-section').style.display = 'block';
                const sizeStr = window.formatFileSize(pdfBlob.size);
                document.getElementById('result-info').textContent =
                    `${originalFileName}.docx → ${originalFileName}.pdf (${sizeStr})`;
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
