const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });
let ffmpegBusy = false;

async function runFFmpegCommand(command) {
    while (ffmpegBusy) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Warten
    }
    ffmpegBusy = true;
    await ffmpeg.run(...command);
    ffmpegBusy = false;
}

async function extractFrames(file) {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // Extrahiere Frames synchron (fps=5)
    await runFFmpegCommand(['-i', 'input.mp4', '-vf', 'fps=5', 'frame_%03d.png']);

    // Liste der extrahierten Frames
    const frames = ffmpeg.FS('readdir', '.')
        .filter((file) => file.startsWith('frame_') && file.endsWith('.png'));

    // Hole die Binärdaten der Frames
    return frames.map((frame) => {
        const data = ffmpeg.FS('readFile', frame);
        return new Blob([data.buffer], { type: 'image/png' });
    });
}

async function createStroboscope(file) {
    const frames = await extractFrames(file);

    const images = await Promise.all(frames.map((blob) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.onload = () => resolve(img);
        });
    }));

    const keyBackground = images[0];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = keyBackground.width;
    canvas.height = keyBackground.height;

    ctx.drawImage(keyBackground, 0, 0);

    const keyData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    for (let i = 1; i < images.length; i++) {
        const frame = images[i];

        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;

        offscreenCtx.drawImage(frame, 0, 0);
        const frameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        const largestContourMask = findLargestContour(keyData, frameData, canvas.width, canvas.height);

        const mainImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mainPixels = mainImageData.data;

        for (let j = 0; j < mainPixels.length; j += 4) {
            if (largestContourMask[j / 4]) {
                mainPixels[j] = frameData[j];
                mainPixels[j + 1] = frameData[j + 1];
                mainPixels[j + 2] = frameData[j + 2];
                mainPixels[j + 3] = 255;
            }
        }

        ctx.putImageData(mainImageData, 0, 0);
    }

    return canvas.toDataURL(); // Rückgabe des generierten Bilds
}

function floodFill(diffMask, visited, width, height, startX, startY) {
    const stack = [[startX, startY]];
    const mask = new Uint8Array(width * height);
    let size = 0;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;

        // Grenzen überprüfen und sicherstellen, dass der Punkt noch nicht besucht wurde
        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] === 1 || diffMask[idx] === 0) {
            continue;
        }

        visited[idx] = 1; // Als besucht markieren
        mask[idx] = 1;    // Zum Maskenbereich hinzufügen
        size++;           // Größe der Kontur erhöhen

        // Nachbarn zur Verarbeitung hinzufügen
        stack.push([x - 1, y]); // Links
        stack.push([x + 1, y]); // Rechts
        stack.push([x, y - 1]); // Oben
        stack.push([x, y + 1]); // Unten
    }

    return { size, mask }; // Rückgabe der Konturgröße und Maske
}


// Funktion zur Berechnung von Aspektverhältnis und Kreisförmigkeit
function calculateContourProperties(mask, width, height) {
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0, perimeter = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1) {
                area++;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);

                // Perimeter: Zähle Nachbarn, die außerhalb der Kontur sind
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                    mask[(y - 1) * width + x] === 0 ||
                    mask[(y + 1) * width + x] === 0 ||
                    mask[y * width + (x - 1)] === 0 ||
                    mask[y * width + (x + 1)] === 0) {
                    perimeter++;
                }
            }
        }
    }

    // Aspektverhältnis
    const aspectRatio = (maxX - minX + 1) / (maxY - minY + 1);

    // Kreisförmigkeit
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

    return { aspectRatio, circularity };
}

function findLargestContour(bgPixels, framePixels, width, height) {
    const diffMask = new Uint8Array(width * height);

    // 1. Farbunterschiede berechnen (Schwelle erhöht)
    for (let i = 0; i < bgPixels.length; i += 4) {
        const rDiff = Math.abs(framePixels[i] - bgPixels[i]);
        const gDiff = Math.abs(framePixels[i + 1] - bgPixels[i + 1]);
        const bDiff = Math.abs(framePixels[i + 2] - bgPixels[i + 2]);

        // Höhere Schwelle, um kleinere Hintergrundänderungen zu ignorieren
        diffMask[i / 4] = (rDiff > 40 || gDiff > 40 || bDiff > 40) ? 1 : 0;
    }

    // 2. Maskenrauschen reduzieren (Erosion und Dilation)
    const erodedMask = erode(diffMask, width, height);
    const processedMask = dilate(erodedMask, width, height);

    const visited = new Uint8Array(width * height);
    const contours = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (processedMask[idx] === 1 && visited[idx] === 0) {
                const contour = floodFill(processedMask, visited, width, height, x, y);

                // Berechnung der geometrischen Eigenschaften
                const properties = calculateContourProperties(contour.mask, width, height);

                // Bedingungen für rechteckige/runde Objekte
                if (contour.size > 500 && 
                    properties.aspectRatio >= 0.5 && properties.aspectRatio <= 2 &&
                    properties.circularity >= 0.7) {
                    contours.push(contour);
                }
            }
        }
    }

    // Größte Kontur finden
    const largestContour = contours.reduce((largest, current) => {
        return current.size > largest.size ? current : largest;
    }, { size: 0, mask: new Uint8Array(width * height) });

    return largestContour.mask;
}


// Hilfsfunktionen für Erosion und Dilation
function erode(mask, width, height) {
    const eroded = new Uint8Array(mask);
    const kernel = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 0], [0, 1],
        [1, -1], [1, 0], [1, 1],
    ];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1) {
                let erosion = true;
                for (const [dx, dy] of kernel) {
                    const neighborIdx = (y + dy) * width + (x + dx);
                    if (mask[neighborIdx] === 0) {
                        erosion = false;
                        break;
                    }
                }
                eroded[idx] = erosion ? 1 : 0;
            }
        }
    }
    return eroded;
}



function dilate(mask, width, height) {
    const dilated = new Uint8Array(mask);
    const kernel = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 0], [0, 1],
        [1, -1], [1, 0], [1, 1],
    ];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1) {
                for (const [dx, dy] of kernel) {
                    const neighborIdx = (y + dy) * width + (x + dx);
                    dilated[neighborIdx] = 1;
                }
            }
        }
    }
    return dilated;
}

// Event Listener für Datei-Upload
document.getElementById('uploadButton').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        const previewContainer = document.getElementById('preview');
        previewContainer.innerHTML = '<p>Das Stroboskop-Bild wird generiert...</p>';
        try {
            const resultUrl = await createStroboscope(file);
            const img = document.createElement('img');
            img.src = resultUrl;
            previewContainer.innerHTML = '';
            previewContainer.appendChild(img);
        } catch (err) {
            console.error(err);
            previewContainer.innerHTML = '<p>Fehler beim Generieren des Bildes. Bitte erneut versuchen.</p>';
        }
    }
});
