/**
 * PDFix – Excel → PDF Converter
 * Uses SheetJS (xlsx.js) to parse Excel data and jsPDF + autoTable to generate PDF with tables.
 */
document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    let workbook = null;
    let activeSheetName = null;
    let pdfBlob = null;
    let originalFileName = '';

    // ── Drop Zone Setup ─────────────────────────────────────────────────
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        accept: '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
        multiple: false,
        onFilesAdded: async (files) => {
            const processBtn = document.getElementById('process-btn');
            const fileSection = document.getElementById('file-section');

            if (files.length > 0) {
                processBtn.disabled = false;
                processBtn.style.opacity = '1';
                fileSection.style.display = 'block';
                originalFileName = files[0].name.replace(/\.(xlsx?|csv)$/i, '');

                // Parse the workbook
                try {
                    const data = await files[0].arrayBuffer();
                    workbook = XLSX.read(data, { type: 'array' });

                    // Render sheet tabs
                    renderSheetTabs();

                    // Show first sheet preview
                    if (workbook.SheetNames.length > 0) {
                        activeSheetName = workbook.SheetNames[0];
                        renderPreview(activeSheetName);
                    }
                } catch (err) {
                    window.Toast.show('Excel dosyası okunamadı: ' + err.message, 'error');
                    processBtn.disabled = true;
                }
            } else {
                processBtn.disabled = true;
                processBtn.style.opacity = '0.5';
                fileSection.style.display = 'none';
                workbook = null;
            }
        }
    });

    // ── Render Sheet Tabs ───────────────────────────────────────────────
    function renderSheetTabs() {
        const tabsEl = document.getElementById('sheet-tabs');
        if (!workbook) { tabsEl.innerHTML = ''; return; }

        tabsEl.innerHTML = workbook.SheetNames.map((name, i) => `
            <button class="sheet-tab ${i === 0 ? 'active' : ''}" data-sheet="${name}">
                📊 ${name}
            </button>
        `).join('');

        tabsEl.querySelectorAll('.sheet-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                tabsEl.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeSheetName = tab.dataset.sheet;
                renderPreview(activeSheetName);
            });
        });
    }

    // ── Render Preview Table ────────────────────────────────────────────
    function renderPreview(sheetName) {
        const previewWrap = document.getElementById('preview-wrap');
        const previewTable = document.getElementById('preview-table');

        if (!workbook || !workbook.Sheets[sheetName]) {
            previewWrap.style.display = 'none';
            return;
        }

        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (jsonData.length === 0) {
            previewWrap.style.display = 'none';
            window.Toast.show(`"${sheetName}" sayfası boş.`, 'info');
            return;
        }

        // Max 20 rows preview
        const previewRows = jsonData.slice(0, 20);
        const maxCols = Math.max(...previewRows.map(r => r.length));

        let html = '<thead><tr>';
        if (previewRows.length > 0) {
            for (let c = 0; c < maxCols; c++) {
                html += `<th>${previewRows[0][c] !== undefined ? escapeHtml(String(previewRows[0][c])) : ''}</th>`;
            }
        }
        html += '</tr></thead><tbody>';

        for (let r = 1; r < previewRows.length; r++) {
            html += '<tr>';
            for (let c = 0; c < maxCols; c++) {
                html += `<td>${previewRows[r][c] !== undefined ? escapeHtml(String(previewRows[r][c])) : ''}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody>';

        if (jsonData.length > 20) {
            html += `<tfoot><tr><td colspan="${maxCols}" style="text-align:center;color:var(--text-muted);font-style:italic;">
                ... ve ${jsonData.length - 20} satır daha
            </td></tr></tfoot>`;
        }

        previewTable.innerHTML = html;
        previewWrap.style.display = 'block';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Get sheet data as arrays ────────────────────────────────────────
    function getSheetData(sheetName) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return { headers: [], rows: [] };

        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (jsonData.length === 0) return { headers: [], rows: [] };

        const headers = jsonData[0].map(h => String(h));
        const rows = jsonData.slice(1).map(r => r.map(c => String(c)));
        return { headers, rows };
    }

    // ── Process Button ──────────────────────────────────────────────────
    document.getElementById('process-btn').addEventListener('click', () => {
        if (!workbook) {
            window.Toast.show('Lütfen bir Excel dosyası seçin.', 'error');
            return;
        }

        const orientationSetting = document.getElementById('orientation').value;
        const pageSize = document.getElementById('page-size').value;
        const fontSize = parseInt(document.getElementById('font-size').value);
        const sheetMode = document.getElementById('sheet-select').value;

        // Determine sheets to process
        const sheetsToProcess = sheetMode === 'all'
            ? workbook.SheetNames
            : [activeSheetName || workbook.SheetNames[0]];

        // Show progress
        document.getElementById('file-section').style.display = 'none';
        document.getElementById('progress-section').style.display = 'block';

        const progressBar = document.getElementById('progress-bar');
        const progressStatus = document.getElementById('progress-status');

        progressBar.style.width = '10%';
        progressStatus.textContent = 'Tablo verileri hazırlanıyor...';

        setTimeout(() => {
            try {
                let doc = null;

                sheetsToProcess.forEach((sheetName, sheetIdx) => {
                    const { headers, rows } = getSheetData(sheetName);
                    if (headers.length === 0) return;

                    // Decide orientation
                    let orient;
                    if (orientationSetting === 'auto') {
                        orient = headers.length > 6 ? 'landscape' : 'portrait';
                    } else {
                        orient = orientationSetting;
                    }

                    const pageSizes = { a4: 'a4', letter: 'letter', legal: 'legal' };

                    if (sheetIdx === 0) {
                        doc = new jsPDF({
                            orientation: orient,
                            unit: 'mm',
                            format: pageSizes[pageSize] || 'a4'
                        });
                    } else {
                        doc.addPage(pageSizes[pageSize] || 'a4', orient);
                    }

                    const pct = Math.round(((sheetIdx + 1) / sheetsToProcess.length) * 80) + 10;
                    progressBar.style.width = pct + '%';
                    progressStatus.textContent = `Sheet "${sheetName}" işleniyor...`;

                    // Sheet title
                    if (sheetsToProcess.length > 1) {
                        doc.setFontSize(fontSize + 4);
                        doc.setFont(undefined, 'bold');
                        doc.text(sheetName, 14, 15);
                    }

                    const startY = sheetsToProcess.length > 1 ? 20 : 14;

                    // autoTable
                    doc.autoTable({
                        head: [headers],
                        body: rows,
                        startY: startY,
                        styles: {
                            fontSize: fontSize,
                            cellPadding: 3,
                            lineColor: [200, 200, 200],
                            lineWidth: 0.1,
                            textColor: [30, 30, 30],
                            font: 'helvetica'
                        },
                        headStyles: {
                            fillColor: [255, 107, 53],
                            textColor: [255, 255, 255],
                            fontStyle: 'bold',
                            fontSize: fontSize
                        },
                        alternateRowStyles: {
                            fillColor: [245, 245, 245]
                        },
                        margin: { top: 14, right: 14, bottom: 14, left: 14 },
                        didDrawPage: (data) => {
                            // Footer with page number
                            const pageCount = doc.internal.getNumberOfPages();
                            const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
                            doc.setFontSize(8);
                            doc.setFont(undefined, 'normal');
                            doc.setTextColor(150);
                            doc.text(
                                `Sayfa ${pageNum} / ${pageCount}`,
                                doc.internal.pageSize.getWidth() / 2,
                                doc.internal.pageSize.getHeight() - 8,
                                { align: 'center' }
                            );
                        }
                    });
                });

                if (!doc) {
                    throw new Error('İşlenecek veri bulunamadı.');
                }

                progressBar.style.width = '95%';
                progressStatus.textContent = 'PDF dosyası hazırlanıyor...';

                pdfBlob = doc.output('blob');

                progressBar.style.width = '100%';
                progressStatus.textContent = 'Tamamlandı!';

                setTimeout(() => {
                    document.getElementById('progress-section').style.display = 'none';
                    document.getElementById('result-section').style.display = 'block';
                    const sizeStr = window.formatFileSize(pdfBlob.size);
                    const sheetCount = sheetsToProcess.length;
                    document.getElementById('result-info').textContent =
                        `${originalFileName} → PDF (${sheetCount} sheet, ${sizeStr})`;
                    window.Toast.show('Excel dosyanız PDF\'e dönüştürüldü! ✨', 'success');
                }, 400);

            } catch (err) {
                console.error('Excel → PDF error:', err);
                document.getElementById('progress-section').style.display = 'none';
                document.getElementById('file-section').style.display = 'block';
                window.Toast.show('Dönüşüm sırasında hata oluştu: ' + err.message, 'error');
            }
        }, 100);
    });

    // ── Download ────────────────────────────────────────────────────────
    document.getElementById('download-btn').addEventListener('click', () => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (originalFileName || 'excel-to-pdf') + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
        window.Toast.show('İndirme başladı!', 'success');
    });

    // ── Again ───────────────────────────────────────────────────────────
    document.getElementById('again-btn').addEventListener('click', () => {
        document.getElementById('result-section').style.display = 'none';
        pdfBlob = null;
        workbook = null;
        activeSheetName = null;
        originalFileName = '';
        document.getElementById('sheet-tabs').innerHTML = '';
        document.getElementById('preview-wrap').style.display = 'none';
        if (dropZone) dropZone.clearFiles();
        const processBtn = document.getElementById('process-btn');
        processBtn.disabled = true;
        processBtn.style.opacity = '0.5';
        document.getElementById('file-section').style.display = 'none';
    });
});
