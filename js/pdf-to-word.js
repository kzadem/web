/**
 * PDFix - PDF to Word Conversion (v3 - Complete Rewrite)
 * Real client-side PDF → DOCX conversion using pdf.js + docx library
 * 
 * Features:
 * - High-quality text extraction with style preservation
 * - Table detection (drawing-based + text-based)
 * - Image extraction (individual objects, NOT full-page render)
 * - OCR support via Tesseract.js for scanned PDFs
 * - Batch conversion (multiple PDFs)
 * - Page layout preservation (size, margins, orientation)
 * - Unicode / Turkish character support
 */

document.addEventListener('DOMContentLoaded', () => {
    const toolConfig = window.TOOL_CONFIG || {};

    /* ── Library references ─────────────────────────────────────────── */
    const pdfjsLib = window.pdfjsLib;
    const docx = window.docx;

    if (!pdfjsLib || !docx) {
        console.error('Required libraries not loaded (pdfjsLib, docx)');
        return;
    }

    /* ── References (createDropZone in main.js handles click-to-select) ── */

    /* ── Drop zone setup ────────────────────────────────────────────── */
    const isMultiple = toolConfig.multiple !== false;
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        multiple: isMultiple,
        onFilesAdded: (files) => updateUI(files)
    });

    /* ── DOM elements ───────────────────────────────────────────────── */
    const processBtn = document.getElementById('process-btn');
    const resultSection = document.getElementById('result-section');
    const progressSection = document.getElementById('progress-section');
    const fileSection = document.getElementById('file-section');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const downloadBtn = document.getElementById('download-btn');
    const againBtn = document.getElementById('again-btn');

    /* ── Options ────────────────────────────────────────────────────── */
    const keepImagesToggle = document.getElementById('keep-images');
    const keepTablesToggle = document.getElementById('keep-tables');
    const keepLayoutToggle = document.getElementById('keep-layout');
    const ocrToggle = document.getElementById('ocr-toggle');
    const ocrLangSelect = document.getElementById('ocr-lang');

    let generatedBlobs = []; // array for batch
    let originalFileNames = [];

    /* ── UI state ───────────────────────────────────────────────────── */
    function updateUI(files) {
        if (!processBtn) return;
        if (files.length > 0) {
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

    function setProgress(pct, text) {
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressStatus) progressStatus.textContent = text;
    }

    /* ================================================================
     *  MAIN PROCESS
     * ================================================================ */

    if (processBtn) {
        processBtn.addEventListener('click', async () => {
            const files = dropZone ? dropZone.getFiles() : [];
            if (!files.length) {
                window.Toast.show('Lütfen önce bir PDF dosyası seçin.', 'error');
                return;
            }

            generatedBlobs = [];
            originalFileNames = files.map(f => f.name.replace(/\.pdf$/i, ''));

            if (progressSection) progressSection.style.display = 'block';
            if (fileSection) fileSection.style.display = 'none';
            processBtn.disabled = true;
            processBtn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Dönüştürülüyor...';

            try {
                const keepImages = keepImagesToggle ? keepImagesToggle.checked : true;
                const keepTables = keepTablesToggle ? keepTablesToggle.checked : true;
                const keepLayout = keepLayoutToggle ? keepLayoutToggle.checked : true;
                const useOCR = ocrToggle ? ocrToggle.checked : false;
                const ocrLang = ocrLangSelect ? ocrLangSelect.value : 'tur+eng';

                // Load Tesseract if OCR is enabled
                let tesseractWorker = null;
                if (useOCR && window.Tesseract) {
                    setProgress(2, 'OCR motoru yükleniyor...');
                    try {
                        tesseractWorker = await window.Tesseract.createWorker(ocrLang);
                    } catch (e) {
                        console.warn('Tesseract init failed:', e);
                        window.Toast.show('OCR yüklenemedi, normal modda devam ediliyor.', 'info');
                    }
                }

                for (let fi = 0; fi < files.length; fi++) {
                    const filePrefix = files.length > 1 ? `[${fi + 1}/${files.length}] ` : '';
                    setProgress(5, filePrefix + 'PDF okunuyor...');

                    const arrayBuffer = await files[fi].arrayBuffer();
                    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    const totalPages = pdfDoc.numPages;

                    setProgress(10, filePrefix + `PDF yüklendi — ${totalPages} sayfa bulundu`);

                    /* ── Extract all pages ─────────────────────────────── */
                    const pagesData = [];
                    for (let i = 1; i <= totalPages; i++) {
                        const pct = 10 + Math.round((i / totalPages) * 55);
                        setProgress(pct, filePrefix + `Sayfa ${i}/${totalPages} analiz ediliyor...`);
                        const pageData = await extractPageData(pdfDoc, i, keepImages, keepTables, tesseractWorker);
                        pagesData.push(pageData);
                    }

                    setProgress(70, filePrefix + 'Word belgesi oluşturuluyor...');

                    /* ── Build DOCX ────────────────────────────────────── */
                    const blob = await buildDocx(pagesData, keepTables, keepLayout, originalFileNames[fi]);
                    generatedBlobs.push(blob);
                }

                // Cleanup Tesseract worker
                if (tesseractWorker) {
                    try { await tesseractWorker.terminate(); } catch (e) { /* ignore */ }
                }

                setProgress(100, 'Tamamlandı!');

                setTimeout(() => {
                    if (progressSection) progressSection.style.display = 'none';
                    if (resultSection) resultSection.style.display = 'block';

                    // Update result text for batch
                    const resultTitle = document.querySelector('.result-card__title');
                    const resultSub = document.querySelector('.result-card__sub');
                    if (files.length > 1) {
                        if (resultTitle) resultTitle.textContent = `${files.length} Word Dosyası Hazır!`;
                        if (resultSub) resultSub.textContent = `${files.length} PDF başarıyla .docx olarak dönüştürüldü.`;
                    } else {
                        if (resultTitle) resultTitle.textContent = 'Word Dosyası Hazır!';
                        if (resultSub) resultSub.textContent = 'PDF başarıyla .docx olarak dönüştürüldü. Metin, tablo ve görseller korundu.';
                    }

                    window.Toast.show('PDF başarıyla Word\'e dönüştürüldü! ✨', 'success');
                    processBtn.innerHTML = toolConfig.btnLabel || "📝 Word'e Dönüştür";
                    processBtn.disabled = false;
                }, 400);

            } catch (err) {
                console.error('PDF→Word conversion error:', err);
                window.Toast.show('Dönüştürme sırasında hata oluştu: ' + err.message, 'error');
                if (progressSection) progressSection.style.display = 'none';
                if (fileSection) fileSection.style.display = 'block';
                processBtn.innerHTML = toolConfig.btnLabel || "📝 Word'e Dönüştür";
                processBtn.disabled = false;
            }
        });
    }

    /* ── Download ────────────────────────────────────────────────────── */
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!generatedBlobs.length) {
                window.Toast.show('İndirilecek dosya bulunamadı.', 'error');
                return;
            }

            for (let i = 0; i < generatedBlobs.length; i++) {
                const url = URL.createObjectURL(generatedBlobs[i]);
                const a = document.createElement('a');
                a.href = url;
                a.download = (originalFileNames[i] || 'document') + '.docx';
                a.click();
                URL.revokeObjectURL(url);
            }
            window.Toast.show('İndirme başladı!', 'success');
        });
    }

    /* ── Again ──────────────────────────────────────────────────────── */
    if (againBtn) {
        againBtn.addEventListener('click', () => {
            if (resultSection) resultSection.style.display = 'none';
            if (dropZone) dropZone.clearFiles();
            generatedBlobs = [];
            originalFileNames = [];
            updateUI([]);
        });
    }

    /* ================================================================
     *  PAGE DATA EXTRACTION
     * ================================================================ */

    async function extractPageData(pdfDoc, pageNum, keepImages, keepTables, tesseractWorker) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        /* ── Text ────────────────────────────────────────────────── */
        const textContent = await page.getTextContent();
        const styles = textContent.styles || {};

        const textItems = textContent.items
            .filter(item => item.str && item.str.trim().length > 0)
            .map(item => {
                const tx = item.transform;
                const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
                const x = tx[4];
                const y = pageHeight - tx[5];

                const style = styles[item.fontName] || {};
                const fontFamily = style.fontFamily || 'Helvetica';
                const isBold = /bold|black|heavy/i.test(item.fontName) || /bold/i.test(fontFamily);
                const isItalic = /italic|oblique/i.test(item.fontName) || /italic/i.test(fontFamily);

                // Try to extract color from style
                let color = '000000';
                if (style.color) {
                    color = rgbToHex(style.color);
                }

                return {
                    text: item.str,
                    x, y,
                    width: item.width || 0,
                    height: item.height || fontSize,
                    fontSize,
                    fontFamily,
                    fontName: item.fontName || '',
                    isBold, isItalic,
                    color,
                    hasEOL: item.hasEOL || false
                };
            });

        /* ── Lines from PDF drawing ops (for table border detection) ── */
        let drawingLines = [];
        let drawingRects = [];
        if (keepTables) {
            const result = await extractDrawingOps(page, pageHeight);
            drawingLines = result.lines;
            drawingRects = result.rects;
        }

        /* ── Images: extract individual image objects ─────────────── */
        let images = [];
        if (keepImages) {
            try {
                images = await extractImageObjects(page, viewport);
            } catch (e) {
                console.warn('Image extraction warning (page ' + pageNum + '):', e);
            }
        }

        /* ── OCR for scanned PDFs ─────────────────────────────────── */
        let ocrText = null;
        if (tesseractWorker && textItems.length < 5) {
            // This page has very little text — likely a scanned image
            try {
                const ocrResult = await performOCR(page, viewport, tesseractWorker);
                if (ocrResult && ocrResult.length > 0) {
                    ocrText = ocrResult;
                }
            } catch (e) {
                console.warn('OCR failed for page ' + pageNum + ':', e);
            }
        }

        return {
            pageNum,
            width: pageWidth,
            height: pageHeight,
            textItems: ocrText && ocrText.length > textItems.length ? ocrText : textItems,
            images,
            drawingLines,
            drawingRects,
            isOCR: ocrText && ocrText.length > textItems.length
        };
    }

    /* ================================================================
     *  OCR (Tesseract.js)
     * ================================================================ */

    async function performOCR(page, viewport, worker) {
        const scale = 2.0;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        const { data } = await worker.recognize(canvas);

        if (!data || !data.words || data.words.length === 0) return [];

        // Convert Tesseract words to our textItem format
        const pageHeight = viewport.height;
        const items = [];

        for (const word of data.words) {
            const bbox = word.bbox;
            items.push({
                text: word.text,
                x: bbox.x0 / scale,
                y: bbox.y0 / scale,
                width: (bbox.x1 - bbox.x0) / scale,
                height: (bbox.y1 - bbox.y0) / scale,
                fontSize: Math.max(10, (bbox.y1 - bbox.y0) / scale * 0.8),
                fontFamily: 'Helvetica',
                fontName: '',
                isBold: false,
                isItalic: false,
                color: '000000',
                hasEOL: false
            });
        }

        return items;
    }

    /* ================================================================
     *  DRAWING OPS EXTRACTION (lines, rects for table detection)
     * ================================================================ */

    async function extractDrawingOps(page, pageHeight) {
        const ops = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;
        const lines = [];
        const rects = [];

        let ctm = [1, 0, 0, 1, 0, 0];
        const ctmStack = [];

        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            switch (fn) {
                case OPS.save:
                    ctmStack.push([...ctm]);
                    break;
                case OPS.restore:
                    if (ctmStack.length) ctm = ctmStack.pop();
                    break;
                case OPS.transform:
                    ctm = multiplyMatrices(ctm, args);
                    break;
                case OPS.constructPath: {
                    const pathOps = args[0];
                    const coords = args[1];
                    let ci = 0;
                    let curX = 0, curY = 0;
                    let startX = 0, startY = 0;

                    for (let p = 0; p < pathOps.length; p++) {
                        const pop = pathOps[p];
                        if (pop === OPS.moveTo) {
                            curX = coords[ci++]; curY = coords[ci++];
                            startX = curX; startY = curY;
                        } else if (pop === OPS.lineTo) {
                            const lx = coords[ci++], ly = coords[ci++];
                            const p1 = transformPoint(curX, curY, ctm, pageHeight);
                            const p2 = transformPoint(lx, ly, ctm, pageHeight);
                            lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
                            curX = lx; curY = ly;
                        } else if (pop === OPS.curveTo || pop === OPS.curveTo2 || pop === OPS.curveTo3) {
                            ci += (pop === OPS.curveTo) ? 6 : 4;
                        } else if (pop === OPS.closePath) {
                            if (curX !== startX || curY !== startY) {
                                const p1 = transformPoint(curX, curY, ctm, pageHeight);
                                const p2 = transformPoint(startX, startY, ctm, pageHeight);
                                lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
                            }
                            curX = startX; curY = startY;
                        }
                    }
                    break;
                }
                case OPS.rectangle: {
                    const [rx, ry, rw, rh] = args;
                    const p = transformPoint(rx, ry, ctm, pageHeight);
                    const absW = Math.abs(rw * ctm[0]);
                    const absH = Math.abs(rh * ctm[3]);
                    if (absW > 2 && absH > 2) {
                        rects.push({
                            x: p.x,
                            y: p.y - absH,
                            width: absW,
                            height: absH
                        });
                    }
                    const corners = [
                        transformPoint(rx, ry, ctm, pageHeight),
                        transformPoint(rx + rw, ry, ctm, pageHeight),
                        transformPoint(rx + rw, ry + rh, ctm, pageHeight),
                        transformPoint(rx, ry + rh, ctm, pageHeight),
                    ];
                    for (let c = 0; c < 4; c++) {
                        const nc = (c + 1) % 4;
                        lines.push({ x1: corners[c].x, y1: corners[c].y, x2: corners[nc].x, y2: corners[nc].y });
                    }
                    break;
                }
            }
        }

        return { lines, rects };
    }

    function multiplyMatrices(a, b) {
        return [
            a[0] * b[0] + a[2] * b[1],
            a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4],
            a[1] * b[4] + a[3] * b[5] + a[5]
        ];
    }

    function transformPoint(x, y, ctm, pageHeight) {
        const tx = ctm[0] * x + ctm[2] * y + ctm[4];
        const ty = ctm[1] * x + ctm[3] * y + ctm[5];
        return { x: tx, y: pageHeight - ty };
    }

    /* ================================================================
     *  IMAGE EXTRACTION — Individual objects only (NOT full-page render)
     * ================================================================ */

    async function extractImageObjects(page, viewport) {
        const images = [];
        const ops = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;

        let ctm = [1, 0, 0, 1, 0, 0];
        const ctmStack = [];

        const imageOps = [
            OPS.paintImageXObject,
            OPS.paintJpegXObject,
            OPS.paintImageMaskXObject,
            OPS.paintInlineImageXObject,
            OPS.paintInlineImageXObjectGroup
        ];

        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            if (fn === OPS.save) { ctmStack.push([...ctm]); continue; }
            if (fn === OPS.restore) { if (ctmStack.length) ctm = ctmStack.pop(); continue; }
            if (fn === OPS.transform) { ctm = multiplyMatrices(ctm, args); continue; }

            if (!imageOps.includes(fn)) continue;

            try {
                let imgData = null;
                if (fn === OPS.paintInlineImageXObject || fn === OPS.paintInlineImageXObjectGroup) {
                    imgData = args[0];
                } else {
                    const imgName = args[0];
                    imgData = await new Promise((resolve) => {
                        page.objs.get(imgName, (data) => resolve(data));
                    });
                }

                if (!imgData) continue;

                const imgResult = await imageDataToBase64(imgData, ctm, viewport);
                if (imgResult) {
                    images.push(imgResult);
                }
            } catch (e) {
                console.warn('Could not extract image at op', i, e);
            }
        }

        return images;
    }

    /**
     * Convert various image data formats to PNG base64
     */
    async function imageDataToBase64(imgData, ctm, viewport) {
        const canvas = document.createElement('canvas');
        let w, h;

        if (imgData.bitmap) {
            w = imgData.bitmap.width || imgData.width;
            h = imgData.bitmap.height || imgData.height;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgData.bitmap, 0, 0);
        } else if (imgData.data && imgData.width && imgData.height) {
            w = imgData.width;
            h = imgData.height;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(w, h);
            const src = imgData.data;

            if (imgData.kind === 2) {
                // RGBA
                imageData.data.set(src);
            } else if (imgData.kind === 1) {
                // RGB → RGBA
                for (let j = 0, k = 0; j < src.length; j += 3, k += 4) {
                    imageData.data[k] = src[j];
                    imageData.data[k + 1] = src[j + 1];
                    imageData.data[k + 2] = src[j + 2];
                    imageData.data[k + 3] = 255;
                }
            } else {
                // Grayscale → RGBA
                for (let j = 0, k = 0; j < src.length; j++, k += 4) {
                    imageData.data[k] = src[j];
                    imageData.data[k + 1] = src[j];
                    imageData.data[k + 2] = src[j];
                    imageData.data[k + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0);
        } else {
            return null;
        }

        // Skip tiny images (likely artifacts like 1px lines)
        if (w < 8 || h < 8) return null;

        const base64 = canvas.toDataURL('image/png').split(',')[1];

        // Calculate display size from transform matrix
        const scaleX = Math.abs(ctm[0]);
        const scaleY = Math.abs(ctm[3]);
        let displayW = scaleX > 0 ? scaleX : w;
        let displayH = scaleY > 0 ? scaleY : h;

        // Clamp to page width
        const maxW = viewport.width * 0.95;
        if (displayW > maxW) {
            const ratio = maxW / displayW;
            displayW = maxW;
            displayH *= ratio;
        }

        return {
            data: base64,
            width: w,
            height: h,
            displayWidth: Math.round(displayW),
            displayHeight: Math.round(displayH),
            type: 'png'
        };
    }

    /* ================================================================
     *  TABLE DETECTION v2 — drawing lines + text grid
     * ================================================================ */

    function detectTablesV2(lines, textItems, drawingLines, drawingRects, pageWidth) {
        let tables = detectTablesFromDrawings(drawingLines, drawingRects, lines, pageWidth);
        if (tables.length === 0) {
            tables = detectTablesFromText(lines, pageWidth);
        }
        return tables;
    }

    function detectTablesFromDrawings(drawingLines, drawingRects, textLines, pageWidth) {
        const tables = [];
        if (!drawingLines.length && !drawingRects.length) return tables;

        const hLines = [];
        const vLines = [];
        const ANGLE_TOLERANCE = 3;

        for (const line of drawingLines) {
            const dx = Math.abs(line.x2 - line.x1);
            const dy = Math.abs(line.y2 - line.y1);
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 10) continue;

            if (dy < ANGLE_TOLERANCE && dx > 15) {
                hLines.push({ y: (line.y1 + line.y2) / 2, x1: Math.min(line.x1, line.x2), x2: Math.max(line.x1, line.x2) });
            } else if (dx < ANGLE_TOLERANCE && dy > 15) {
                vLines.push({ x: (line.x1 + line.x2) / 2, y1: Math.min(line.y1, line.y2), y2: Math.max(line.y1, line.y2) });
            }
        }

        if (hLines.length < 2 || vLines.length < 2) return tables;

        const hClusters = clusterValues(hLines.map(l => l.y), 5);
        const vClusters = clusterValues(vLines.map(l => l.x), 5);

        if (hClusters.length < 2 || vClusters.length < 2) return tables;

        hClusters.sort((a, b) => a - b);
        vClusters.sort((a, b) => a - b);

        const numRows = hClusters.length - 1;
        const numCols = vClusters.length - 1;

        if (numRows < 1 || numCols < 1) return tables;

        const grid = [];
        for (let r = 0; r < numRows; r++) {
            const row = [];
            const yTop = hClusters[r];
            const yBot = hClusters[r + 1];
            for (let c = 0; c < numCols; c++) {
                const xLeft = vClusters[c];
                const xRight = vClusters[c + 1];

                const cellItems = [];
                const allItems = textLines.flatMap ? textLines.flatMap(l => l.items) : flattenLines(textLines);
                for (const item of allItems) {
                    if (item.x >= xLeft - 5 && item.x <= xRight + 5 &&
                        item.y >= yTop - 5 && item.y <= yBot + 5) {
                        cellItems.push(item);
                    }
                }

                row.push({
                    text: cellItems.map(it => it.text).join(' '),
                    items: cellItems,
                    xLeft, xRight, yTop, yBot
                });
            }
            grid.push(row);
        }

        const totalCells = numRows * numCols;
        const filledCells = grid.flat().filter(c => c.text.trim().length > 0).length;
        if (filledCells < totalCells * 0.1) return tables;

        const tableYTop = hClusters[0];
        const tableYBot = hClusters[hClusters.length - 1];
        let startLine = -1, endLine = -1;

        for (let li = 0; li < textLines.length; li++) {
            const lineY = textLines[li].y;
            if (lineY >= tableYTop - 10 && lineY <= tableYBot + 10) {
                if (startLine === -1) startLine = li;
                endLine = li;
            }
        }

        tables.push({
            type: 'drawing',
            grid,
            numRows,
            numCols,
            startLine: startLine >= 0 ? startLine : 0,
            endLine: endLine >= 0 ? endLine : 0,
            colPositions: vClusters,
            rowPositions: hClusters
        });

        return tables;
    }

    function detectTablesFromText(lines, pageWidth) {
        const tables = [];
        const MIN_COLS = 2;
        const MIN_ROWS = 2;

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.items.length < MIN_COLS) { i++; continue; }

            const colPositions = getColumnPositions(line.items);
            if (colPositions.length < MIN_COLS) { i++; continue; }

            let endLine = i;
            const allColPositions = [...colPositions];

            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                if (nextLine.items.length < MIN_COLS) break;

                const nextCols = getColumnPositions(nextLine.items);
                if (nextCols.length < MIN_COLS) break;

                const matchCount = nextCols.filter(nc =>
                    allColPositions.some(ac => Math.abs(nc - ac) < 25)
                ).length;

                if (matchCount >= Math.min(colPositions.length, nextCols.length) * 0.4) {
                    endLine = j;
                    nextCols.forEach(nc => {
                        if (!allColPositions.some(ac => Math.abs(nc - ac) < 25)) {
                            allColPositions.push(nc);
                        }
                    });
                } else {
                    break;
                }
            }

            const rowCount = endLine - i + 1;
            if (rowCount >= MIN_ROWS) {
                allColPositions.sort((a, b) => a - b);

                const mergedCols = [allColPositions[0]];
                for (let c = 1; c < allColPositions.length; c++) {
                    if (allColPositions[c] - mergedCols[mergedCols.length - 1] > 25) {
                        mergedCols.push(allColPositions[c]);
                    }
                }

                if (mergedCols.length >= MIN_COLS) {
                    const grid = [];
                    for (let r = i; r <= endLine; r++) {
                        const row = [];
                        for (let c = 0; c < mergedCols.length; c++) {
                            const colX = mergedCols[c];
                            const nextColX = c < mergedCols.length - 1 ? mergedCols[c + 1] : pageWidth;
                            const cellItems = lines[r].items.filter(it =>
                                it.x >= colX - 15 && it.x < nextColX - 10
                            );
                            row.push({
                                text: cellItems.map(it => it.text).join(' '),
                                items: cellItems
                            });
                        }
                        grid.push(row);
                    }

                    tables.push({
                        type: 'text',
                        grid,
                        numRows: rowCount,
                        numCols: mergedCols.length,
                        startLine: i,
                        endLine,
                        colPositions: mergedCols
                    });
                }

                i = endLine + 1;
                continue;
            }

            i++;
        }

        return tables;
    }

    function getColumnPositions(items) {
        if (!items.length) return [];
        const sorted = [...items].sort((a, b) => a.x - b.x);
        const cols = [sorted[0].x];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].x - cols[cols.length - 1] > 20) {
                cols.push(sorted[i].x);
            }
        }
        return cols;
    }

    function clusterValues(values, tolerance) {
        if (!values.length) return [];
        const sorted = [...values].sort((a, b) => a - b);
        const clusters = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - clusters[clusters.length - 1] > tolerance) {
                clusters.push(sorted[i]);
            } else {
                clusters[clusters.length - 1] = (clusters[clusters.length - 1] + sorted[i]) / 2;
            }
        }
        return clusters;
    }

    function flattenLines(textLines) {
        const result = [];
        for (const line of textLines) {
            result.push(...line.items);
        }
        return result;
    }

    /* ================================================================
     *  DOCX BUILDING
     * ================================================================ */

    async function buildDocx(pagesData, keepTables, keepLayout, fileName) {
        const {
            Document, Packer, Paragraph, TextRun, ImageRun,
            Table, TableRow, TableCell,
            HeadingLevel, AlignmentType,
            WidthType, SectionType, PageOrientation, BorderStyle,
            convertMillimetersToTwip
        } = docx;

        const sections = [];

        for (let pi = 0; pi < pagesData.length; pi++) {
            const pd = pagesData[pi];
            const children = [];

            // ── Group text into lines ───────────────────────────────
            const lines = groupIntoLines(pd.textItems);

            // ── Detect tables ───────────────────────────────────────
            let tableRegions = [];
            if (keepTables && lines.length > 0) {
                tableRegions = detectTablesV2(
                    lines, pd.textItems,
                    pd.drawingLines || [], pd.drawingRects || [],
                    pd.width
                );
            }

            // Track which lines are consumed by tables
            const tableLinesSet = new Set();
            tableRegions.forEach(tr => {
                for (let li = tr.startLine; li <= tr.endLine; li++) {
                    tableLinesSet.add(li);
                }
            });

            // ── Interleave images with text by Y position ───────────
            // Sort images by estimated Y position for better placement
            const sortedImages = (pd.images || []).map((img, idx) => ({
                ...img,
                insertAfterY: img.displayHeight ? img.displayHeight * 0.5 : 0,
                index: idx
            }));

            // ── Build text content ──────────────────────────────────
            let tableIdx = 0;
            for (let li = 0; li < lines.length; li++) {
                // Insert table at its start line
                if (tableIdx < tableRegions.length && li === tableRegions[tableIdx].startLine) {
                    const tr = tableRegions[tableIdx];
                    const table = buildTableFromGrid(tr, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle);
                    if (table) children.push(table);
                    li = tr.endLine;
                    tableIdx++;
                    continue;
                }
                if (tableLinesSet.has(li)) continue;

                // Regular paragraph
                children.push(buildParagraph(lines[li], Paragraph, TextRun, HeadingLevel, AlignmentType));
            }

            // ── Add images at the end of page content ────────────────
            if (pd.images && pd.images.length > 0) {
                for (const img of pd.images) {
                    try {
                        const imgBuf = base64ToArrayBuffer(img.data);
                        const maxW = 570;
                        let w = img.displayWidth || img.width;
                        let h = img.displayHeight || img.height;
                        if (w > maxW) {
                            const ratio = maxW / w;
                            w = maxW;
                            h = Math.round(h * ratio);
                        }
                        w = Math.max(w, 10);
                        h = Math.max(h, 10);

                        children.push(new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imgBuf,
                                    transformation: { width: Math.round(w), height: Math.round(h) },
                                    type: 'png'
                                })
                            ],
                            spacing: { before: 120, after: 120 }
                        }));
                    } catch (e) {
                        console.warn('Could not add image to DOCX:', e);
                    }
                }
            }

            // If nothing extracted at all, add placeholder
            if (children.length === 0) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: ' ', size: 22 })]
                }));
            }

            // ── Section ─────────────────────────────────────────────
            const sectionProps = { children };
            if (keepLayout) {
                const pageW = Math.round(pd.width * 20);
                const pageH = Math.round(pd.height * 20);
                sectionProps.properties = {
                    page: {
                        size: {
                            width: pageW,
                            height: pageH,
                            orientation: pd.width > pd.height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
                        },
                        margin: {
                            top: convertMillimetersToTwip(15),
                            bottom: convertMillimetersToTwip(15),
                            left: convertMillimetersToTwip(15),
                            right: convertMillimetersToTwip(15)
                        }
                    }
                };
                if (pi > 0) sectionProps.properties.type = SectionType.NEXT_PAGE;
            }

            sections.push(sectionProps);
        }

        const doc = new Document({
            creator: 'PDFix',
            title: fileName || 'Converted Document',
            description: 'PDF to Word conversion by PDFix',
            sections
        });

        return await Packer.toBlob(doc);
    }

    /* ================================================================
     *  LINE GROUPING
     * ================================================================ */

    function groupIntoLines(textItems) {
        if (!textItems.length) return [];

        const sorted = [...textItems].sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 3) return a.x - b.x;
            return yDiff;
        });

        const lines = [];
        let currentLine = { items: [sorted[0]], y: sorted[0].y };

        for (let i = 1; i < sorted.length; i++) {
            const item = sorted[i];
            const threshold = Math.max(item.fontSize, currentLine.items[0].fontSize) * 0.6;
            if (Math.abs(item.y - currentLine.y) < threshold) {
                currentLine.items.push(item);
            } else {
                currentLine.items.sort((a, b) => a.x - b.x);
                lines.push(currentLine);
                currentLine = { items: [item], y: item.y };
            }
        }
        currentLine.items.sort((a, b) => a.x - b.x);
        lines.push(currentLine);

        return lines;
    }

    /* ================================================================
     *  DOCX PARAGRAPH BUILDER
     * ================================================================ */

    function buildParagraph(line, Paragraph, TextRun, HeadingLevel, AlignmentType) {
        const items = line.items;
        const runs = [];

        const avgFontSize = items.reduce((s, it) => s + it.fontSize, 0) / items.length;
        const totalText = items.map(it => it.text).join(' ');
        const allBold = items.every(it => it.isBold);

        // Heading detection based on font size
        const isHeading = avgFontSize >= 20 && totalText.length < 200;
        const isSubheading = avgFontSize >= 16 && avgFontSize < 20 && totalText.length < 200;
        const isSubSubheading = avgFontSize >= 13 && avgFontSize < 16 && allBold && totalText.length < 200;

        // Bullet point detection
        const firstText = items[0].text.trim();
        const isBullet = /^[•●○▪▸►➤\-–—]/.test(firstText) || /^\d+[\.\)]/.test(firstText);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let text = item.text;

            // Add space between items with gap
            if (i > 0) {
                const prev = items[i - 1];
                const gap = item.x - (prev.x + prev.width);
                if (gap > item.fontSize * 0.3) text = ' ' + text;
            }

            runs.push(new TextRun({
                text,
                font: mapFont(item.fontFamily, item.fontName),
                size: Math.round(item.fontSize * 2),
                bold: item.isBold || isHeading,
                italics: item.isItalic,
                color: item.color || '000000',
            }));
        }

        const paraOptions = { children: runs };

        // Heading levels
        if (isHeading) paraOptions.heading = HeadingLevel.HEADING_1;
        else if (isSubheading) paraOptions.heading = HeadingLevel.HEADING_2;
        else if (isSubSubheading) paraOptions.heading = HeadingLevel.HEADING_3;

        // Bullet detection
        if (isBullet && !isHeading && !isSubheading) {
            paraOptions.bullet = { level: 0 };
        }

        // Spacing
        paraOptions.spacing = {
            before: Math.round(avgFontSize * 4),
            after: Math.round(avgFontSize * 2),
            line: Math.round(avgFontSize * 2 * 20 * 1.2)
        };

        return new Paragraph(paraOptions);
    }

    /* ================================================================
     *  TABLE BUILDER
     * ================================================================ */

    function buildTableFromGrid(tableRegion, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle) {
        const { grid, numRows, numCols } = tableRegion;

        if (!grid || !grid.length) return null;

        const rows = [];

        for (let r = 0; r < grid.length; r++) {
            const rowData = grid[r];
            const cells = [];

            for (let c = 0; c < rowData.length; c++) {
                const cell = rowData[c];
                const cellText = cell.text || '';
                const items = cell.items || [];
                const fontSize = items.length > 0
                    ? Math.round(items[0].fontSize * 2)
                    : 22;
                const isBold = items.some(it => it.isBold);
                const fontName = items.length > 0
                    ? mapFont(items[0].fontFamily, items[0].fontName)
                    : 'Calibri';

                cells.push(new TableCell({
                    children: [
                        new Paragraph({
                            children: cellText ? [
                                new TextRun({
                                    text: cellText,
                                    size: fontSize,
                                    font: fontName,
                                    bold: isBold,
                                    color: '000000'
                                })
                            ] : []
                        })
                    ],
                    width: {
                        size: Math.round(100 / rowData.length),
                        type: WidthType.PERCENTAGE
                    }
                }));
            }

            while (cells.length < numCols) {
                cells.push(new TableCell({
                    children: [new Paragraph({ children: [] })],
                    width: { size: Math.round(100 / numCols), type: WidthType.PERCENTAGE }
                }));
            }

            rows.push(new TableRow({ children: cells }));
        }

        if (!rows.length) return null;

        return new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
        });
    }

    /* ================================================================
     *  UTILITIES
     * ================================================================ */

    function mapFont(fontFamily, fontName) {
        const name = (fontName || fontFamily || '').toLowerCase();
        if (/arial/i.test(name)) return 'Arial';
        if (/helvetica/i.test(name)) return 'Arial';
        if (/times/i.test(name)) return 'Times New Roman';
        if (/courier/i.test(name)) return 'Courier New';
        if (/consola/i.test(name)) return 'Consolas';
        if (/georgia/i.test(name)) return 'Georgia';
        if (/verdana/i.test(name)) return 'Verdana';
        if (/calibri/i.test(name)) return 'Calibri';
        if (/cambria/i.test(name)) return 'Cambria';
        if (/trebuchet/i.test(name)) return 'Trebuchet MS';
        if (/comic/i.test(name)) return 'Comic Sans MS';
        if (/impact/i.test(name)) return 'Impact';
        if (/tahoma/i.test(name)) return 'Tahoma';
        if (/palatino/i.test(name)) return 'Palatino Linotype';
        if (/garamond/i.test(name)) return 'Garamond';
        if (/mono/i.test(name)) return 'Courier New';
        if (/segoe/i.test(name)) return 'Segoe UI';
        if (/roboto/i.test(name)) return 'Roboto';
        if (/inter/i.test(name)) return 'Inter';
        if (/lato/i.test(name)) return 'Lato';
        if (/open.?sans/i.test(name)) return 'Open Sans';
        if (/noto/i.test(name)) return 'Noto Sans';
        return 'Calibri';
    }

    function rgbToHex(color) {
        if (typeof color === 'string') return color.replace('#', '');
        if (Array.isArray(color)) {
            const r = Math.round(color[0] * 255);
            const g = Math.round(color[1] * 255);
            const b = Math.round(color[2] * 255);
            return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
        }
        return '000000';
    }

    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
});
