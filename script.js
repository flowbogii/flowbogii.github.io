async function createStroboscope(file, frameInterval) {
    const frames = await extractFrames(file, frameInterval);

    const images = await Promise.all(frames.map((blob) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.onload = () => resolve(img);
        });
    }));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = images[0].width;
    canvas.height = images[0].height;

    let previousFrameData = null;

    images.forEach((image, index) => {
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;

        // Zeichne das aktuelle Bild auf ein Offscreen-Canvas
        offscreenCtx.drawImage(image, 0, 0);
        const currentFrameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        if (previousFrameData) {
            const diffImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const diffPixels = diffImageData.data;

            // Vergleiche Pixel des aktuellen Frames mit dem vorherigen Frame
            for (let i = 0; i < currentFrameData.length; i += 4) {
                const rDiff = Math.abs(currentFrameData[i] - previousFrameData[i]);
                const gDiff = Math.abs(currentFrameData[i + 1] - previousFrameData[i + 1]);
                const bDiff = Math.abs(currentFrameData[i + 2] - previousFrameData[i + 2]);

                // Adaptive Schwelle: Berücksichtige nur signifikante Bewegungen
                if (rDiff > 50 || gDiff > 50 || bDiff > 50) {
                    diffPixels[i] = currentFrameData[i];     // Rot
                    diffPixels[i + 1] = currentFrameData[i + 1]; // Grün
                    diffPixels[i + 2] = currentFrameData[i + 2]; // Blau
                    diffPixels[i + 3] = 255;                  // Alpha (sichtbar)
                } else {
                    diffPixels[i] = 255;    // Weißer Hintergrund
                    diffPixels[i + 1] = 255;
                    diffPixels[i + 2] = 255;
                    diffPixels[i + 3] = 255;
                }
            }

            // Glättung anwenden, um Rauschen zu reduzieren
            const smoothedImageData = applyMedianFilter(diffImageData, canvas.width, canvas.height);

            // Schreibe das Ergebnis auf den Haupt-Canvas
            ctx.putImageData(smoothedImageData, 0, 0);
        }

        // Speichere das aktuelle Frame für den nächsten Vergleich
        previousFrameData = currentFrameData;
    });

    return canvas.toDataURL(); // Rückgabe des fertigen Bildes
}

// Median-Filter zur Glättung der Bewegungserkennung
function applyMedianFilter(imageData, width, height) {
    const filteredData = new Uint8ClampedArray(imageData.data);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = (y * width + x) * 4;

            // Nachbarschaftswerte sammeln
            const neighbors = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ni = ((y + dy) * width + (x + dx)) * 4;
                    neighbors.push([
                        imageData.data[ni],     // Rot
                        imageData.data[ni + 1], // Grün
                        imageData.data[ni + 2]  // Blau
                    ]);
                }
            }

            // Median für jeden Farbkanal berechnen
            const medianR = median(neighbors.map(n => n[0]));
            const medianG = median(neighbors.map(n => n[1]));
            const medianB = median(neighbors.map(n => n[2]));

            // Setze die geglätteten Pixelwerte
            filteredData[i] = medianR;
            filteredData[i + 1] = medianG;
            filteredData[i + 2] = medianB;
        }
    }

    imageData.data.set(filteredData);
    return imageData;
}

// Hilfsfunktion: Median einer Liste berechnen
function median(values) {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}
