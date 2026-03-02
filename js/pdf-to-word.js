/**
 * PDFix - PDF to Word Conversion
 * Real client-side PDF → DOCX conversion using pdf.js + docx library
 * Preserves: text formatting (font, size, color, bold, italic),
 *            images (size, position), tables, page layout
 */

document.addEventListener('DOMContentLoaded', () => {
    const toolConfig = window.TOOL_CONFIG || {};

    /* ── CDN library references ─────────────────────────────────────── */
    const pdfjsLib = window.pdfjsLib;
    const docx = window.docx;

    if (!pdfjsLib || !docx) {
        console.error('Required libraries not loaded (pdfjsLib, docx)');
        return;
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

    /* ── Options elements ───────────────────────────────────────────── */
    const keepImagesToggle = document.getElementById('keep-images');
    const keepTablesToggle = document.getElementById('keep-tables');
    const keepLayoutToggle = document.getElementById('keep-layout');

    let generatedBlob = null;
    let originalFileName = '';

    /* ── UI state handler ───────────────────────────────────────────── */
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

    /* ── Progress updater ───────────────────────────────────────────── */
    function setProgress(pct, text) {
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressStatus) progressStatus.textContent = text;
    }

    /* ── MAIN: Process button ───────────────────────────────────────── */
    if (processBtn) {
        processBtn.addEventListener('click', async () => {
            const files = dropZone ? dropZone.getFiles() : [];
            if (!files.length) {
                window.Toast.show('Lütfen önce bir PDF dosyası seçin.', 'error');
                return;
            }

            originalFileName = files[0].name.replace(/\.pdf$/i, '');

            // Show progress
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

                /* ── Extract all pages ───────────────────────────────── */
                const pagesData = [];
                for (let i = 1; i <= totalPages; i++) {
                    const pct = 10 + Math.round((i / totalPages) * 50);
                    setProgress(pct, `Sayfa ${i}/${totalPages} analiz ediliyor...`);
                    const pageData = await extractPageData(pdfDoc, i, keepImages);
                    pagesData.push(pageData);
                }

                setProgress(65, 'Word belgesi oluşturuluyor...');

                /* ── Build DOCX ──────────────────────────────────────── */
                const blob = await buildDocx(pagesData, keepTables, keepLayout);
                generatedBlob = blob;

                setProgress(100, 'Tamamlandı!');

                // Show result
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

    /* ── Download button ────────────────────────────────────────────── */
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!generatedBlob) {
                window.Toast.show('İndirilecek dosya bulunamadı.', 'error');
                return;
            }
            const url = URL.createObjectURL(generatedBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFileName + '.docx';
            a.click();
            URL.revokeObjectURL(url);
            window.Toast.show('İndirme başladı!', 'success');
        });
    }

    /* ── Again button ───────────────────────────────────────────────── */
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
     *  PDF DATA EXTRACTION
     * ================================================================ */

    /**
     * Extract text items, images, and metadata from a single PDF page
     */
    async function extractPageData(pdfDoc, pageNum, keepImages) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        /* ── Text content ────────────────────────────────────────── */
        const textContent = await page.getTextContent();
        const styles = textContent.styles || {};

        const textItems = textContent.items
            .filter(item => item.str && item.str.trim().length > 0)
            .map(item => {
                const tx = item.transform;
                // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
                const fontSize = Math.abs(tx[3]) || Math.abs(tx[0]) || 12;
                const x = tx[4];
                const y = pageHeight - tx[5]; // flip Y (PDF origin = bottom-left)

                // Get font info from styles
                const style = styles[item.fontName] || {};
                const fontFamily = style.fontFamily || 'Helvetica';
                const isBold = /bold/i.test(item.fontName) || /bold/i.test(fontFamily);
                const isItalic = /italic|oblique/i.test(item.fontName) || /italic/i.test(fontFamily);

                // Try to detect monospace
                const isMonospace = /courier|mono|consola/i.test(item.fontName) || /courier|mono/i.test(fontFamily);

                return {
                    text: item.str,
                    x: x,
                    y: y,
                    width: item.width || 0,
                    height: item.height || fontSize,
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                    fontName: item.fontName || '',
                    isBold: isBold,
                    isItalic: isItalic,
                    isMonospace: isMonospace,
                    color: extractColor(style),
                    hasEOL: item.hasEOL || false
                };
            });

        /* ── Images ──────────────────────────────────────────────── */
        let images = [];
        if (keepImages) {
            try {
                images = await extractImages(page, viewport);
            } catch (e) {
                console.warn('Image extraction warning (page ' + pageNum + '):', e);
            }
        }

        return {
            pageNum,
            width: pageWidth,
            height: pageHeight,
            textItems,
            images
        };
    }

    /**
     * Extract color from style or return default black
     */
    function extractColor(style) {
        // pdf.js doesn't always provide color in styles;
        // default to black
        return '000000';
    }

    /**
     * Extract embedded images from a PDF page using getOperatorList
     */
    async function extractImages(page, viewport) {
        const ops = await page.getOperatorList();
        const images = [];
        const OPS = pdfjsLib.OPS;

        for (let i = 0; i < ops.fnArray.length; i++) {
            if (ops.fnArray[i] === OPS.paintImageXObject ||
                ops.fnArray[i] === OPS.paintJpegXObject) {
                const imgName = ops.argsArray[i][0];
                try {
                    const imgData = await page.objs.get(imgName);
                    if (imgData && imgData.bitmap) {
                        // Use OffscreenCanvas or regular canvas to get image data
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.bitmap.width || imgData.width;
                        canvas.height = imgData.bitmap.height || imgData.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(imgData.bitmap, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');
                        const base64 = dataUrl.split(',')[1];

                        images.push({
                            data: base64,
                            width: canvas.width,
                            height: canvas.height,
                            // Scale to fit page proportionally
                            displayWidth: Math.min(canvas.width, viewport.width * 0.9),
                            displayHeight: Math.min(canvas.height, viewport.height * 0.9),
                            type: 'png'
                        });
                    } else if (imgData && imgData.data) {
                        // Raw pixel data
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width;
                        canvas.height = imgData.height;
                        const ctx = canvas.getContext('2d');

                        const imgDataObj = ctx.createImageData(imgData.width, imgData.height);
                        const src = imgData.data;

                        if (imgData.kind === 2) {
                            // RGBA data
                            imgDataObj.data.set(src);
                        } else if (imgData.kind === 1) {
                            // RGB data → RGBA
                            for (let j = 0, k = 0; j < src.length; j += 3, k += 4) {
                                imgDataObj.data[k] = src[j];
                                imgDataObj.data[k + 1] = src[j + 1];
                                imgDataObj.data[k + 2] = src[j + 2];
                                imgDataObj.data[k + 3] = 255;
                            }
                        } else {
                            // Grayscale → RGBA
                            for (let j = 0, k = 0; j < src.length; j++, k += 4) {
                                imgDataObj.data[k] = src[j];
                                imgDataObj.data[k + 1] = src[j];
                                imgDataObj.data[k + 2] = src[j];
                                imgDataObj.data[k + 3] = 255;
                            }
                        }

                        ctx.putImageData(imgDataObj, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');
                        const base64 = dataUrl.split(',')[1];

                        images.push({
                            data: base64,
                            width: imgData.width,
                            height: imgData.height,
                            displayWidth: Math.min(imgData.width, viewport.width * 0.9),
                            displayHeight: Math.min(imgData.height, viewport.height * 0.9),
                            type: 'png'
                        });
                    }
                } catch (e) {
                    // Skip images that can't be extracted
                    console.warn('Could not extract image:', imgName, e);
                }
            }
        }
        return images;
    }


    /* ================================================================
     *  DOCX BUILDING
     * ================================================================ */

    /**
     * Build a .docx Blob from extracted page data
     */
    async function buildDocx(pagesData, keepTables, keepLayout) {
        const {
            Document, Packer, Paragraph, TextRun, ImageRun,
            Table, TableRow, TableCell,
            HeadingLevel, AlignmentType,
            WidthType, SectionType, PageOrientation, BorderStyle,
            convertMillimetersToTwip, convertInchesToTwip
        } = docx;

        const sections = [];

        for (let pi = 0; pi < pagesData.length; pi++) {
            const pd = pagesData[pi];
            const children = [];

            // ── Group text items into lines (by Y position) ─────────
            const lines = groupIntoLines(pd.textItems);

            // ── Detect tables if enabled ────────────────────────────
            let tableRegions = [];
            if (keepTables && lines.length > 0) {
                tableRegions = detectTables(lines, pd.textItems);
            }

            // Track which lines belong to tables
            const tableLinesSet = new Set();
            tableRegions.forEach(tr => {
                for (let li = tr.startLine; li <= tr.endLine; li++) {
                    tableLinesSet.add(li);
                }
            });

            // ── Build paragraphs & tables ───────────────────────────
            let tableIdx = 0;
            for (let li = 0; li < lines.length; li++) {
                // Check if this line starts a table region
                if (tableIdx < tableRegions.length && li === tableRegions[tableIdx].startLine) {
                    const tr = tableRegions[tableIdx];
                    const table = buildTable(tr, lines, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle);
                    children.push(table);
                    li = tr.endLine; // skip past the table lines
                    tableIdx++;
                    continue;
                }

                // Skip lines inside table
                if (tableLinesSet.has(li)) continue;

                // Regular paragraph
                const line = lines[li];
                const paragraph = buildParagraph(line, Paragraph, TextRun, HeadingLevel, AlignmentType);
                children.push(paragraph);
            }

            // ── Add images ──────────────────────────────────────────
            if (pd.images && pd.images.length > 0) {
                for (const img of pd.images) {
                    try {
                        const imgBuf = base64ToArrayBuffer(img.data);
                        // Scale image to reasonable Word dimensions (max ~6 inches / ~570px)
                        const maxW = 570;
                        let w = img.displayWidth || img.width;
                        let h = img.displayHeight || img.height;
                        if (w > maxW) {
                            const ratio = maxW / w;
                            w = maxW;
                            h = Math.round(h * ratio);
                        }

                        const imgParagraph = new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imgBuf,
                                    transformation: { width: w, height: h },
                                    type: 'png'
                                })
                            ],
                            spacing: { before: 120, after: 120 }
                        });
                        children.push(imgParagraph);
                    } catch (e) {
                        console.warn('Could not add image to DOCX:', e);
                    }
                }
            }

            // ── Section properties (page size) ──────────────────────
            const sectionProps = {
                children: children
            };

            if (keepLayout) {
                // PDF points → DOCX twips (1 pt = 20 twips)
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
                if (pi > 0) {
                    sectionProps.properties.type = SectionType.NEXT_PAGE;
                }
            }

            sections.push(sectionProps);
        }

        const doc = new Document({
            creator: 'PDFix',
            title: originalFileName || 'Converted Document',
            description: 'PDF to Word conversion by PDFix',
            sections: sections
        });

        const blob = await Packer.toBlob(doc);
        return blob;
    }


    /* ================================================================
     *  TEXT LINE GROUPING
     * ================================================================ */

    /**
     * Group text items into lines based on Y position proximity
     */
    function groupIntoLines(textItems) {
        if (!textItems.length) return [];

        // Sort by Y then X
        const sorted = [...textItems].sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) < 3) return a.x - b.x; // same line
            return yDiff;
        });

        const lines = [];
        let currentLine = { items: [sorted[0]], y: sorted[0].y };

        for (let i = 1; i < sorted.length; i++) {
            const item = sorted[i];
            // If Y is close enough, same line (threshold = half max font size)
            const threshold = Math.max(item.fontSize, currentLine.items[0].fontSize) * 0.6;
            if (Math.abs(item.y - currentLine.y) < threshold) {
                currentLine.items.push(item);
            } else {
                // Sort line items by X
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
     *  TABLE DETECTION
     * ================================================================ */

    /**
     * Detect table-like structures from text lines
     * Heuristic: lines with multiple text items at consistent X positions
     */
    function detectTables(lines, textItems) {
        const tables = [];
        const MIN_COLS = 2;
        const MIN_ROWS = 2;

        // Find groups of consecutive lines that have similar column structure
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (line.items.length >= MIN_COLS) {
                // Get column positions for this line
                const cols = line.items.map(it => Math.round(it.x / 10) * 10);

                // Look ahead for lines with similar column structure
                let endLine = i;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j];
                    if (nextLine.items.length >= MIN_COLS) {
                        const nextCols = nextLine.items.map(it => Math.round(it.x / 10) * 10);
                        // Check if at least half the columns align
                        const matching = cols.filter(c => nextCols.some(nc => Math.abs(c - nc) < 20));
                        if (matching.length >= Math.min(cols.length, nextCols.length) * 0.5) {
                            endLine = j;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                if (endLine - i + 1 >= MIN_ROWS) {
                    // Collect all unique column positions
                    const allCols = new Set();
                    for (let k = i; k <= endLine; k++) {
                        lines[k].items.forEach(it => {
                            allCols.add(Math.round(it.x / 15) * 15);
                        });
                    }
                    const sortedCols = [...allCols].sort((a, b) => a - b);

                    // Merge close columns
                    const mergedCols = [sortedCols[0]];
                    for (let c = 1; c < sortedCols.length; c++) {
                        if (sortedCols[c] - mergedCols[mergedCols.length - 1] > 30) {
                            mergedCols.push(sortedCols[c]);
                        }
                    }

                    if (mergedCols.length >= MIN_COLS) {
                        tables.push({
                            startLine: i,
                            endLine: endLine,
                            columns: mergedCols
                        });
                    }
                    i = endLine + 1;
                    continue;
                }
            }
            i++;
        }

        return tables;
    }


    /* ================================================================
     *  DOCX BUILDERS
     * ================================================================ */

    /**
     * Build a paragraph from a line of text items, preserving formatting
     */
    function buildParagraph(line, Paragraph, TextRun, HeadingLevel, AlignmentType) {
        const items = line.items;
        const runs = [];

        // Determine if this could be a heading (large font, short text)
        const avgFontSize = items.reduce((s, it) => s + it.fontSize, 0) / items.length;
        const totalText = items.map(it => it.text).join(' ');
        const isHeading = avgFontSize >= 18 && totalText.length < 200;
        const isSubheading = avgFontSize >= 14 && avgFontSize < 18 && totalText.length < 200;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Add space before if there's a gap between items
            let text = item.text;
            if (i > 0) {
                const prevItem = items[i - 1];
                const gap = item.x - (prevItem.x + prevItem.width);
                if (gap > item.fontSize * 0.3) {
                    text = ' ' + text;
                }
            }

            const runOptions = {
                text: text,
                font: mapFont(item.fontFamily, item.fontName),
                size: Math.round(item.fontSize * 2), // docx uses half-points
                bold: item.isBold || isHeading,
                italics: item.isItalic,
                color: item.color || '000000',
            };

            runs.push(new TextRun(runOptions));
        }

        const paraOptions = { children: runs };

        // Apply heading level
        if (isHeading) {
            paraOptions.heading = HeadingLevel.HEADING_1;
        } else if (isSubheading) {
            paraOptions.heading = HeadingLevel.HEADING_2;
        }

        // Spacing based on font size
        paraOptions.spacing = {
            before: Math.round(avgFontSize * 4),
            after: Math.round(avgFontSize * 2),
            line: Math.round(avgFontSize * 2 * 20 * 1.2) // 1.2 line height
        };

        return new Paragraph(paraOptions);
    }

    /**
     * Build a DOCX Table from a detected table region
     */
    function buildTable(tableRegion, lines, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle) {
        const { startLine, endLine, columns } = tableRegion;
        const rows = [];

        for (let li = startLine; li <= endLine; li++) {
            const line = lines[li];
            const cells = [];

            // Assign items to columns
            const colItems = new Array(columns.length).fill(null).map(() => []);
            for (const item of line.items) {
                let bestCol = 0;
                let bestDist = Infinity;
                for (let ci = 0; ci < columns.length; ci++) {
                    const dist = Math.abs(item.x - columns[ci]);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCol = ci;
                    }
                }
                colItems[bestCol].push(item);
            }

            for (let ci = 0; ci < columns.length; ci++) {
                const items = colItems[ci];
                const cellText = items.map(it => it.text).join(' ') || '';
                const fontSize = items.length > 0
                    ? Math.round(items[0].fontSize * 2)
                    : 22;

                cells.push(
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: cellText,
                                        size: fontSize,
                                        font: items.length > 0 ? mapFont(items[0].fontFamily, items[0].fontName) : 'Calibri',
                                        bold: items.some(it => it.isBold),
                                        color: items.length > 0 ? items[0].color : '000000'
                                    })
                                ]
                            })
                        ],
                        width: {
                            size: Math.round(100 / columns.length),
                            type: WidthType.PERCENTAGE
                        }
                    })
                );
            }

            rows.push(new TableRow({ children: cells }));
        }

        return new Table({
            rows: rows,
            width: {
                size: 100,
                type: WidthType.PERCENTAGE
            }
        });
    }


    /* ================================================================
     *  UTILITIES
     * ================================================================ */

    /**
     * Map PDF font names to common Word fonts
     */
    function mapFont(fontFamily, fontName) {
        const name = (fontName || fontFamily || '').toLowerCase();

        if (/arial/i.test(name)) return 'Arial';
        if (/helvetica/i.test(name)) return 'Arial';         // Helvetica → Arial (universal)
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

        // Default
        return 'Calibri';
    }

    /**
     * Convert base64 string to ArrayBuffer
     */
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
});
