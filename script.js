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

                // Mindestgröße für akzeptierte Konturen (mind. 500 Pixel)
                if (contour.size > 500) {
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
