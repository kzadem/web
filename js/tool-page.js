/**
 * PDFix - Tool Page Shared JS
 * Handles file upload UI, processing simulation, and download
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── Get page config from data attributes ──────────────────────────
    const toolConfig = window.TOOL_CONFIG || {};

    // ── Setup Drop Zone ────────────────────────────────────────────────
    const dropZone = window.createDropZone({
        zoneSelector: '#upload-zone',
        inputId: 'file-input',
        fileListSelector: '#file-list',
        multiple: toolConfig.multiple || false,
        onFilesAdded: (files) => {
            updateUI(files);
        }
    });

    // ── Update UI State ────────────────────────────────────────────────
    const processBtn = document.getElementById('process-btn');
    const resultSection = document.getElementById('result-section');
    const progressSection = document.getElementById('progress-section');
    const emptyState = document.getElementById('empty-state');
    const fileSection = document.getElementById('file-section');

    function updateUI(files) {
        if (!processBtn) return;
        if (files.length > 0) {
            processBtn.disabled = false;
            processBtn.style.opacity = '1';
            if (emptyState) emptyState.style.display = 'none';
            if (fileSection) fileSection.style.display = 'block';
        } else {
            processBtn.disabled = true;
            processBtn.style.opacity = '0.5';
            if (emptyState) emptyState.style.display = 'block';
            if (fileSection) fileSection.style.display = 'none';
        }
    }

    updateUI([]);

    // ── Process Button ─────────────────────────────────────────────────
    if (processBtn) {
        processBtn.addEventListener('click', () => {
            const files = dropZone ? dropZone.getFiles() : [];
            if (!files.length) {
                window.Toast.show('Lütfen önce bir dosya seçin.', 'error');
                return;
            }

            // Show progress
            if (progressSection) progressSection.style.display = 'block';
            if (fileSection) fileSection.style.display = 'none';
            processBtn.disabled = true;
            processBtn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> İşleniyor...';

            window.simulateProgress({
                progressBarSelector: '#progress-bar',
                progressWrapSelector: '#progress-wrap',
                statusSelector: '#progress-status',
                duration: 2200,
                onComplete: () => {
                    if (progressSection) progressSection.style.display = 'none';
                    if (resultSection) resultSection.style.display = 'block';
                    window.Toast.show('Dosyanız başarıyla işlendi! ✨', 'success');
                    processBtn.innerHTML = toolConfig.btnLabel || '⚡ İşle';
                    processBtn.disabled = false;
                }
            });
        });
    }

    // ── Download Button ────────────────────────────────────────────────
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            // Simulate download - create a small demo PDF placeholder
            const files = dropZone ? dropZone.getFiles() : [];
            const filename = files.length > 0
                ? files[0].name.replace('.pdf', '') + '_pdfixed.pdf'
                : 'pdfixed_output.pdf';

            // Create a simple blob as placeholder (in a real app, this would be the processed file)
            const blob = new Blob(['%PDF-1.4 demo output'], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            window.Toast.show('İndirme başladı!', 'success');
        });
    }

    // ── Process Again Button ───────────────────────────────────────────
    const againBtn = document.getElementById('again-btn');
    if (againBtn) {
        againBtn.addEventListener('click', () => {
            if (resultSection) resultSection.style.display = 'none';
            if (dropZone) dropZone.clearFiles();
            updateUI([]);
        });
    }
});
