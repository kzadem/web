/**
 * PDFix – JPG → PDF Converter
 * Uses jsPDF to combine multiple images into a single PDF with configurable settings.
 */
document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    let images = []; // { file, dataUrl, width, height }
    let pdfBlob = null;

    // ── Image Grid Rendering ────────────────────────────────────────────
    const imageGrid = document.getElementById('image-grid');
    const imageCount = document.getElementById('image-count');
    const fileSection = document.getElementById('file-section');
    const processBtn = document.getElementById('process-btn');

    function renderImageGrid() {
        imageGrid.innerHTML = '';
        imageCount.textContent = `${images.length} görsel seçildi`;

        images.forEach((img, idx) => {
            const thumb = document.createElement('div');
            thumb.className = 'image-thumb';
            thumb.draggable = true;
            thumb.dataset.index = idx;
            thumb.innerHTML = `
                <img src="${img.dataUrl}" alt="${img.file.name}" />
                <button class="image-thumb__remove" data-idx="${idx}">✕</button>
                <span class="image-thumb__number">${idx + 1}</span>
                <span class="image-thumb__name">${img.file.name}</span>
            `;
            imageGrid.appendChild(thumb);
        });

        // Drag & drop reordering
        setupDragReorder();

        // Remove buttons
        imageGrid.querySelectorAll('.image-thumb__remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                images.splice(idx, 1);
                renderImageGrid();
                if (images.length === 0) {
                    fileSection.style.display = 'none';
                    // Show upload zone content again
                    const zoneContent = document.querySelector('.upload-zone__content');
                    if (zoneContent) zoneContent.style.display = '';
                }
            });
        });
    }

    // ── Drag & Drop Reorder ─────────────────────────────────────────────
    let dragSrcIdx = null;

    function setupDragReorder() {
        const thumbs = imageGrid.querySelectorAll('.image-thumb');
        thumbs.forEach(thumb => {
            thumb.addEventListener('dragstart', (e) => {
                dragSrcIdx = parseInt(thumb.dataset.index);
                thumb.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            thumb.addEventListener('dragend', () => {
                thumb.classList.remove('dragging');
                thumbs.forEach(t => t.classList.remove('drag-over'));
            });

            thumb.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                thumb.classList.add('drag-over');
            });

            thumb.addEventListener('dragleave', () => {
                thumb.classList.remove('drag-over');
            });

            thumb.addEventListener('drop', (e) => {
                e.preventDefault();
                thumb.classList.remove('drag-over');
                const dropIdx = parseInt(thumb.dataset.index);
                if (dragSrcIdx !== null && dragSrcIdx !== dropIdx) {
                    const [moved] = images.splice(dragSrcIdx, 1);
                    images.splice(dropIdx, 0, moved);
                    renderImageGrid();
                }
                dragSrcIdx = null;
            });
        });
    }

    // ── Load image and get dimensions ───────────────────────────────────
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        file,
                        dataUrl: e.target.result,
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    });
                };
                img.onerror = () => reject(new Error('Görsel yüklenemedi: ' + file.name));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Dosya okunamadı: ' + file.name));
            reader.readAsDataURL(file);
        });
    }

    // ── File Input Handler ──────────────────────────────────────────────
    const fileInput = document.getElementById('file-input');
    const uploadZone = document.getElementById('upload-zone');

    fileInput.addEventListener('change', async (e) => {
        const newFiles = Array.from(e.target.files);
        e.target.value = '';
        if (!newFiles.length) return;

        for (const file of newFiles) {
            // Skip duplicates
            if (images.some(img => img.file.name === file.name && img.file.size === file.size)) continue;
            try {
                const imgData = await loadImage(file);
                images.push(imgData);
            } catch (err) {
                window.Toast.show(err.message, 'error');
            }
        }

        if (images.length > 0) {
            fileSection.style.display = 'block';
            const zoneContent = uploadZone.querySelector('.upload-zone__content');
            if (zoneContent) zoneContent.style.display = 'none';
            renderImageGrid();
        }
    });

    // Drop zone drag events
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', (e) => {
        if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));

        for (const file of newFiles) {
            if (images.some(img => img.file.name === file.name && img.file.size === file.size)) continue;
            try {
                const imgData = await loadImage(file);
                images.push(imgData);
            } catch (err) {
                window.Toast.show(err.message, 'error');
            }
        }

        if (images.length > 0) {
            fileSection.style.display = 'block';
            const zoneContent = uploadZone.querySelector('.upload-zone__content');
            if (zoneContent) zoneContent.style.display = 'none';
            renderImageGrid();
        }
    });

    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());

    // ── Margin Map ──────────────────────────────────────────────────────
    const marginMap = { none: 0, small: 5, normal: 10 };
    const qualityMap = { high: 0.95, medium: 0.75, low: 0.5 };

    // ── Process (Create PDF) ────────────────────────────────────────────
    processBtn.addEventListener('click', async () => {
        if (!images.length) {
            window.Toast.show('Lütfen en az bir görsel seçin.', 'error');
            return;
        }

        const pageSize = document.getElementById('page-size').value;
        const orientationSetting = document.getElementById('orientation').value;
        const marginKey = document.getElementById('margin').value;
        const qualityKey = document.getElementById('quality').value;
        const margin = marginMap[marginKey];
        const quality = qualityMap[qualityKey];

        // Show progress
        fileSection.style.display = 'none';
        document.getElementById('progress-section').style.display = 'block';

        const progressBar = document.getElementById('progress-bar');
        const progressStatus = document.getElementById('progress-status');

        try {
            let doc = null;

            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const pct = Math.round(((i + 1) / images.length) * 100);
                progressBar.style.width = pct + '%';
                progressStatus.textContent = `Görsel ${i + 1}/${images.length} işleniyor...`;

                // Determine orientation for this image
                let orient;
                if (orientationSetting === 'auto') {
                    orient = img.width > img.height ? 'landscape' : 'portrait';
                } else {
                    orient = orientationSetting;
                }

                // Determine page dimensions
                let pageW, pageH;
                if (pageSize === 'fit') {
                    // Page fits the image (convert pixels to mm at 96 DPI)
                    const pxToMm = 25.4 / 96;
                    pageW = img.width * pxToMm + margin * 2;
                    pageH = img.height * pxToMm + margin * 2;
                } else {
                    const sizes = { a4: [210, 297], letter: [215.9, 279.4] };
                    const [w, h] = sizes[pageSize] || sizes.a4;
                    pageW = orient === 'landscape' ? h : w;
                    pageH = orient === 'landscape' ? w : h;
                }

                if (i === 0) {
                    doc = new jsPDF({
                        orientation: orient,
                        unit: 'mm',
                        format: [pageW, pageH]
                    });
                } else {
                    doc.addPage([pageW, pageH], orient);
                }

                // Calculate image placement
                const contentW = pageW - margin * 2;
                const contentH = pageH - margin * 2;

                let imgW, imgH, imgX, imgY;

                if (pageSize === 'fit') {
                    imgW = contentW;
                    imgH = contentH;
                    imgX = margin;
                    imgY = margin;
                } else {
                    // Scale to fit while preserving aspect ratio
                    const imgRatio = img.width / img.height;
                    const pageRatio = contentW / contentH;

                    if (imgRatio > pageRatio) {
                        imgW = contentW;
                        imgH = contentW / imgRatio;
                    } else {
                        imgH = contentH;
                        imgW = contentH * imgRatio;
                    }

                    // Center on page
                    imgX = margin + (contentW - imgW) / 2;
                    imgY = margin + (contentH - imgH) / 2;
                }

                // Determine format
                const isJpeg = img.file.type === 'image/jpeg' || img.file.name.toLowerCase().endsWith('.jpg') || img.file.name.toLowerCase().endsWith('.jpeg');
                const format = isJpeg ? 'JPEG' : 'PNG';

                // For quality reduction, re-encode through canvas
                let dataUrl = img.dataUrl;
                if (quality < 0.95 && isJpeg) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    const tmpImg = new Image();
                    await new Promise((resolve) => {
                        tmpImg.onload = resolve;
                        tmpImg.src = img.dataUrl;
                    });
                    ctx.drawImage(tmpImg, 0, 0);
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }

                doc.addImage(dataUrl, format, imgX, imgY, imgW, imgH, undefined, 'FAST');

                // Small delay for UI responsiveness
                await new Promise(r => setTimeout(r, 50));
            }

            // Generate blob
            progressStatus.textContent = 'PDF dosyası hazırlanıyor...';
            progressBar.style.width = '100%';
            pdfBlob = doc.output('blob');

            setTimeout(() => {
                document.getElementById('progress-section').style.display = 'none';
                document.getElementById('result-section').style.display = 'block';
                const sizeStr = window.formatFileSize(pdfBlob.size);
                document.getElementById('result-info').textContent =
                    `${images.length} görsel → PDF (${sizeStr})`;
                window.Toast.show('Görselleriniz PDF\'e dönüştürüldü! ✨', 'success');
            }, 400);

        } catch (err) {
            console.error('JPG → PDF error:', err);
            document.getElementById('progress-section').style.display = 'none';
            fileSection.style.display = 'block';
            window.Toast.show('Dönüşüm sırasında hata oluştu: ' + err.message, 'error');
        }
    });

    // ── Download ────────────────────────────────────────────────────────
    document.getElementById('download-btn').addEventListener('click', () => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'images-to-pdf.pdf';
        a.click();
        URL.revokeObjectURL(url);
        window.Toast.show('İndirme başladı!', 'success');
    });

    // ── Again ───────────────────────────────────────────────────────────
    document.getElementById('again-btn').addEventListener('click', () => {
        document.getElementById('result-section').style.display = 'none';
        pdfBlob = null;
        images = [];
        fileSection.style.display = 'none';
        const zoneContent = uploadZone.querySelector('.upload-zone__content');
        if (zoneContent) zoneContent.style.display = '';
        imageGrid.innerHTML = '';
    });
});
