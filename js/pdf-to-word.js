/**
 * PDFix - PDF to Word Conversion (v2)
 * Real client-side PDF → DOCX conversion using pdf.js + docx library
 * 
 * Improvements v2:
 * - Better table detection using PDF line/rect drawing ops + text grid analysis
 * - Full image extraction (all image types, shapes, barcodes via page render)
 * - Single-click file selection
 * - Proper row/column counting for tables
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

    /* ── Fix: single-click file selection on the entire upload zone ── */
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    if (uploadZone && fileInput) {
        uploadZone.style.cursor = 'pointer';
        uploadZone.addEventListener('click', (e) => {
            // Don't re-trigger if clicking the remove button inside file list
            if (e.target.closest('.file-item__remove')) return;
            fileInput.click();
        });
    }

    /* ── Drop zone setup ────────────────────────────────────────────── */
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        multiple: false,
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

    let generatedBlob = null;
    let originalFileName = '';

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

            originalFileName = files[0].name.replace(/\.pdf$/i, '');

            if (progressSection) progressSection.style.display = 'block';
            if (fileSection) fileSection.style.display = 'none';
            processBtn.disabled = true;
            processBtn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Dönüştürülüyor...';

            try {
                setProgress(5, 'PDF okunuyor...');

                const arrayBuffer = await files[0].arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const totalPages = pdfDoc.numPages;

                setProgress(10, `PDF yüklendi — ${totalPages} sayfa bulundu`);

                const keepImages = keepImagesToggle ? keepImagesToggle.checked : true;
                const keepTables = keepTablesToggle ? keepTablesToggle.checked : true;
                const keepLayout = keepLayoutToggle ? keepLayoutToggle.checked : true;

                /* ── Extract all pages ─────────────────────────────── */
                const pagesData = [];
                for (let i = 1; i <= totalPages; i++) {
                    const pct = 10 + Math.round((i / totalPages) * 55);
                    setProgress(pct, `Sayfa ${i}/${totalPages} analiz ediliyor...`);
                    const pageData = await extractPageData(pdfDoc, i, keepImages, keepTables);
                    pagesData.push(pageData);
                }

                setProgress(70, 'Word belgesi oluşturuluyor...');

                /* ── Build DOCX ────────────────────────────────────── */
                const blob = await buildDocx(pagesData, keepTables, keepLayout);
                generatedBlob = blob;

                setProgress(100, 'Tamamlandı!');

                setTimeout(() => {
                    if (progressSection) progressSection.style.display = 'none';
                    if (resultSection) resultSection.style.display = 'block';
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
            if (!generatedBlob) { window.Toast.show('İndirilecek dosya bulunamadı.', 'error'); return; }
            const url = URL.createObjectURL(generatedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFileName + '.docx';
            a.click();
            URL.revokeObjectURL(url);
            window.Toast.show('İndirme başladı!', 'success');
        });
    }

    /* ── Again ──────────────────────────────────────────────────────── */
    if (againBtn) {
        againBtn.addEventListener('click', () => {
            if (resultSection) resultSection.style.display = 'none';
            if (dropZone) dropZone.clearFiles();
            generatedBlob = null;
            originalFileName = '';
            updateUI([]);
        });
    }

    /* ================================================================
     *  PAGE DATA EXTRACTION
     * ================================================================ */

    async function extractPageData(pdfDoc, pageNum, keepImages, keepTables) {
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

                return {
                    text: item.str,
                    x, y,
                    width: item.width || 0,
                    height: item.height || fontSize,
                    fontSize,
                    fontFamily,
                    fontName: item.fontName || '',
                    isBold, isItalic,
                    color: '000000',
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

        /* ── Images: render entire page as image to capture everything ── */
        let images = [];
        if (keepImages) {
            try {
                images = await extractAllVisuals(page, viewport, textItems);
            } catch (e) {
                console.warn('Image extraction warning (page ' + pageNum + '):', e);
            }
        }

        return {
            pageNum,
            width: pageWidth,
            height: pageHeight,
            textItems,
            images,
            drawingLines,
            drawingRects
        };
    }

    /* ================================================================
     *  DRAWING OPS EXTRACTION (lines, rects for table detection)
     * ================================================================ */

    async function extractDrawingOps(page, pageHeight) {
        const ops = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;
        const lines = [];
        const rects = [];

        // Track current transform matrix
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
                    // args[0] = ops array, args[1] = coords array
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
                            // Transform coordinates
                            const p1 = transformPoint(curX, curY, ctm, pageHeight);
                            const p2 = transformPoint(lx, ly, ctm, pageHeight);
                            lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
                            curX = lx; curY = ly;
                        } else if (pop === OPS.curveTo || pop === OPS.curveTo2 || pop === OPS.curveTo3) {
                            // Skip curves, advance coordinate index
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
                    if (absW > 2 && absH > 2) { // filter out tiny rects (hairlines)
                        rects.push({
                            x: p.x,
                            y: p.y - absH, // adjust because PDF y is bottom-up
                            width: absW,
                            height: absH
                        });
                    }
                    // Also add the rect edges as lines for table detection
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
     *  IMAGE EXTRACTION (comprehensive)
     * ================================================================ */

    /**
     * Extract all visual elements from a page:
     * 1. Try individual image objects from operator list
     * 2. Fall back to full-page render for shapes, barcodes, vector graphics
     */
    async function extractAllVisuals(page, viewport, textItems) {
        const images = [];
        const ops = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;

        // Track transform for positioning
        let ctm = [1, 0, 0, 1, 0, 0];
        const ctmStack = [];
        let hasNonImageVisuals = false;

        // Collect all image-related operations
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

            // Check for vector drawing operations (shapes, paths that might be barcodes etc.)
            if (fn === OPS.constructPath || fn === OPS.fill || fn === OPS.stroke ||
                fn === OPS.eoFill || fn === OPS.fillStroke) {
                hasNonImageVisuals = true;
            }

            if (!imageOps.includes(fn)) continue;

            // Extract the image
            try {
                let imgData = null;
                if (fn === OPS.paintInlineImageXObject || fn === OPS.paintInlineImageXObjectGroup) {
                    imgData = args[0]; // inline image data is directly in args
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

        // If there are vector drawings (shapes/barcodes) but no extracted images,
        // or if we want to capture everything, render the full page
        if (hasNonImageVisuals && images.length === 0) {
            try {
                const fullPageImg = await renderPageAsImage(page, viewport);
                if (fullPageImg) {
                    images.push(fullPageImg);
                }
            } catch (e) {
                console.warn('Full page render failed:', e);
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

        // Skip tiny images (likely artifacts)
        if (w < 5 || h < 5) return null;

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

    /**
     * Render entire PDF page as a PNG image (captures everything: shapes, barcodes, vector art)
     */
    async function renderPageAsImage(page, viewport) {
        const scale = 2.0; // 2x for quality
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        const base64 = canvas.toDataURL('image/png').split(',')[1];

        return {
            data: base64,
            width: scaledViewport.width,
            height: scaledViewport.height,
            displayWidth: Math.round(viewport.width * 0.95),
            displayHeight: Math.round(viewport.height * 0.95),
            type: 'png',
            isFullPage: true
        };
    }

    /* ================================================================
     *  TABLE DETECTION v2 — using drawing lines + text grid
     * ================================================================ */

    /**
     * Improved table detection:
     * 1. First try to detect tables from drawn lines/rectangles (most reliable)
     * 2. Fall back to text-based column alignment detection
     */
    function detectTablesV2(lines, textItems, drawingLines, drawingRects, pageWidth) {
        // Strategy 1: Detect tables from drawing operations (borders)
        let tables = detectTablesFromDrawings(drawingLines, drawingRects, lines, pageWidth);

        // Strategy 2: If no tables found from drawings, try text-based detection
        if (tables.length === 0) {
            tables = detectTablesFromText(lines, pageWidth);
        }

        return tables;
    }

    /**
     * Detect tables from horizontal/vertical lines drawn in the PDF
     */
    function detectTablesFromDrawings(drawingLines, drawingRects, textLines, pageWidth) {
        const tables = [];
        if (!drawingLines.length && !drawingRects.length) return tables;

        // Separate horizontal and vertical lines
        const hLines = []; // horizontal
        const vLines = []; // vertical
        const ANGLE_TOLERANCE = 3; // pixels

        for (const line of drawingLines) {
            const dx = Math.abs(line.x2 - line.x1);
            const dy = Math.abs(line.y2 - line.y1);
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 10) continue; // skip very short lines

            if (dy < ANGLE_TOLERANCE && dx > 15) {
                hLines.push({ y: (line.y1 + line.y2) / 2, x1: Math.min(line.x1, line.x2), x2: Math.max(line.x1, line.x2) });
            } else if (dx < ANGLE_TOLERANCE && dy > 15) {
                vLines.push({ x: (line.x1 + line.x2) / 2, y1: Math.min(line.y1, line.y2), y2: Math.max(line.y1, line.y2) });
            }
        }

        if (hLines.length < 2 || vLines.length < 2) return tables;

        // Cluster horizontal lines by Y position
        const hClusters = clusterValues(hLines.map(l => l.y), 5);
        // Cluster vertical lines by X position
        const vClusters = clusterValues(vLines.map(l => l.x), 5);

        if (hClusters.length < 2 || vClusters.length < 2) return tables;

        // Sort clusters
        hClusters.sort((a, b) => a - b);
        vClusters.sort((a, b) => a - b);

        // Build a table grid from the intersections
        const numRows = hClusters.length - 1;
        const numCols = vClusters.length - 1;

        if (numRows < 1 || numCols < 1) return tables;

        // Map text items to cells
        const grid = [];
        for (let r = 0; r < numRows; r++) {
            const row = [];
            const yTop = hClusters[r];
            const yBot = hClusters[r + 1];
            for (let c = 0; c < numCols; c++) {
                const xLeft = vClusters[c];
                const xRight = vClusters[c + 1];

                // Find text items that fall within this cell
                const cellItems = [];
                for (const item of (textLines.flatMap ? textLines.flatMap(l => l.items) : flattenLines(textLines))) {
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

        // Only register as table if it has meaningful content
        const totalCells = numRows * numCols;
        const filledCells = grid.flat().filter(c => c.text.trim().length > 0).length;
        if (filledCells < totalCells * 0.1) return tables; // too sparse

        // Find which text lines belong to this table grid
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

    /**
     * Detect tables from text alignment (fallback when no drawing ops)
     */
    function detectTablesFromText(lines, pageWidth) {
        const tables = [];
        const MIN_COLS = 2;
        const MIN_ROWS = 2;

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.items.length < MIN_COLS) { i++; continue; }

            // Get well-separated column positions for this line
            const colPositions = getColumnPositions(line.items);
            if (colPositions.length < MIN_COLS) { i++; continue; }

            // Look ahead for lines with matching column structure
            let endLine = i;
            const allColPositions = [...colPositions];

            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                if (nextLine.items.length < MIN_COLS) break; // break on single-item line

                const nextCols = getColumnPositions(nextLine.items);
                if (nextCols.length < MIN_COLS) break;

                // Check column alignment: each next col should be near an existing col
                const matchCount = nextCols.filter(nc =>
                    allColPositions.some(ac => Math.abs(nc - ac) < 25)
                ).length;

                if (matchCount >= Math.min(colPositions.length, nextCols.length) * 0.4) {
                    endLine = j;
                    // Add new column positions we haven't seen
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

                // Merge close columns
                const mergedCols = [allColPositions[0]];
                for (let c = 1; c < allColPositions.length; c++) {
                    if (allColPositions[c] - mergedCols[mergedCols.length - 1] > 25) {
                        mergedCols.push(allColPositions[c]);
                    }
                }

                if (mergedCols.length >= MIN_COLS) {
                    // Build grid
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

    /**
     * Get distinct column X positions from items, with minimum gap between columns
     */
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

    /**
     * Cluster array of numeric values with given tolerance
     */
    function clusterValues(values, tolerance) {
        if (!values.length) return [];
        const sorted = [...values].sort((a, b) => a - b);
        const clusters = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] - clusters[clusters.length - 1] > tolerance) {
                clusters.push(sorted[i]);
            } else {
                // Average the cluster
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

    async function buildDocx(pagesData, keepTables, keepLayout) {
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

            // ── Build content ───────────────────────────────────────
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

            // ── Images ──────────────────────────────────────────────
            if (pd.images && pd.images.length > 0) {
                for (const img of pd.images) {
                    try {
                        // Skip full-page renders if we have text content
                        if (img.isFullPage && lines.length > 3) continue;

                        const imgBuf = base64ToArrayBuffer(img.data);
                        const maxW = 570;
                        let w = img.displayWidth || img.width;
                        let h = img.displayHeight || img.height;
                        if (w > maxW) {
                            const ratio = maxW / w;
                            w = maxW;
                            h = Math.round(h * ratio);
                        }
                        // ensure minimum dimensions
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
            title: originalFileName || 'Converted Document',
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
     *  DOCX BUILDERS
     * ================================================================ */

    function buildParagraph(line, Paragraph, TextRun, HeadingLevel, AlignmentType) {
        const items = line.items;
        const runs = [];

        const avgFontSize = items.reduce((s, it) => s + it.fontSize, 0) / items.length;
        const totalText = items.map(it => it.text).join(' ');
        const isHeading = avgFontSize >= 18 && totalText.length < 200;
        const isSubheading = avgFontSize >= 14 && avgFontSize < 18 && totalText.length < 200;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let text = item.text;
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

        if (isHeading) paraOptions.heading = HeadingLevel.HEADING_1;
        else if (isSubheading) paraOptions.heading = HeadingLevel.HEADING_2;

        paraOptions.spacing = {
            before: Math.round(avgFontSize * 4),
            after: Math.round(avgFontSize * 2),
            line: Math.round(avgFontSize * 2 * 20 * 1.2)
        };

        return new Paragraph(paraOptions);
    }

    /**
     * Build table from grid (works with both drawing-based and text-based detection)
     */
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

            // Ensure all rows have the same number of cells
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
        return 'Calibri';
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
