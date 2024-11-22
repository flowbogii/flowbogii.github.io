const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

async function extractFrames(file) {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // Extrahiere Frames alle 5 Frames (fps=5)
    await ffmpeg.run('-i', 'input.mp4', '-vf', 'fps=5', 'frame_%03d.png');

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

    // Lade die Frames als HTMLImageElemente
    const images = await Promise.all(frames.map((blob) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.onload = () => resolve(img);
        });
    }));

    // Verwende das erste Frame als Key Background
    const keyBackground = images[0];

    // Canvas erstellen
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Setze die Canvas-Größe auf die des Videos
    canvas.width = keyBackground.width;
    canvas.height = keyBackground.height;

    // Zeichne das Key Background
    ctx.drawImage(keyBackground, 0, 0);

    const keyData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    // Überlagere Frames basierend auf der größten Kontur
    for (let i = 1; i < images.length; i++) {
        const frame = images[i];

        // Zeichne das aktuelle Frame auf ein Offscreen-Canvas
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;

        offscreenCtx.drawImage(frame, 0, 0);
        const frameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Finde die größte Kontur
        const largestContourMask = findLargestContour(keyData, frameData, canvas.width, canvas.height);

        // Zeichne die Pixel der größten Kontur auf das Hauptcanvas
        const mainImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mainPixels = mainImageData.data;

        for (let j = 0; j < mainPixels.length; j += 4) {
            if (largestContourMask[j / 4]) {
                mainPixels[j] = frameData[j];       // R
                mainPixels[j + 1] = frameData[j + 1]; // G
                mainPixels[j + 2] = frameData[j + 2]; // B
                mainPixels[j + 3] = 255;              // Alpha
            }
        }

        ctx.putImageData(mainImageData, 0, 0);
    }

    // Zeige das Stroboskop-Bild an
    const resultImg = document.createElement('img');
    resultImg.src = canvas.toDataURL();
    document.body.appendChild(resultImg);
}

function findLargestContour(bgPixels, framePixels, width, height) {
    const diffMask = new Uint8Array(width * height);

    // Berechne die Differenz-Maske
    for (let i = 0; i < bgPixels.length; i += 4) {
        const rDiff = Math.abs(framePixels[i] - bgPixels[i]);
        const gDiff = Math.abs(framePixels[i + 1] - bgPixels[i + 1]);
        const bDiff = Math.abs(framePixels[i + 2] - bgPixels[i + 2]);

        diffMask[i / 4] = rDiff > 20 || gDiff > 20 || bDiff > 20 ? 1 : 0;
    }

    // Finde zusammenhängende Regionen (Konturen)
    const visited = new Uint8Array(width * height);
    const contours = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (diffMask[idx] === 1 && visited[idx] === 0) {
                const contour = floodFill(diffMask, visited, width, height, x, y);
                contours.push(contour);
            }
        }
    }

    // Wähle die größte Kontur
    const largestContour = contours.reduce((largest, current) => {
        return current.size > largest.size ? current : largest;
    }, { size: 0, mask: new Uint8Array(width * height) });

    return largestContour.mask;
}

function floodFill(diffMask, visited, width, height, startX, startY) {
    const stack = [[startX, startY]];
    const mask = new Uint8Array(width * height);
    let size = 0;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = y * width + x;

        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx] === 1 || diffMask[idx] === 0) {
            continue;
        }

        visited[idx] = 1;
        mask[idx] = 1;
        size++;

        stack.push([x - 1, y]);
        stack.push([x + 1, y]);
        stack.push([x, y - 1]);
        stack.push([x, y + 1]);
    }

    return { size, mask };
}

// Event Listener für den Upload
document.getElementById('uploadButton').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        createStroboscope(file);
    }
});
