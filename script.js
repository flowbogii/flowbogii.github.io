let ffmpegBusy = false;

async function runFFmpegCommand(command) {
    while (ffmpegBusy) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Warten, bis FFmpeg frei ist
    }
    ffmpegBusy = true; // FFmpeg ist jetzt beschäftigt
    await ffmpeg.run(...command);
    ffmpegBusy = false; // FFmpeg ist wieder frei
}
2. Aktualisiere den Code für die Frame-Extraktion
Passe die Funktion an, sodass sie die Warteschlange berücksichtigt:
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
3. Stroboskop-Erstellung berücksichtigen
Stelle sicher, dass auch in der Stroboskop-Erstellungslogik die FFmpeg-Befehle sequentiell ablaufen, falls zusätzliche Befehle benötigt werden.
Vollständige, Fehlerbereinigte Version
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

    const resultImg = document.createElement('img');
    resultImg.src = canvas.toDataURL();
    document.body.appendChild(resultImg);
}

function findLargestContour(bgPixels, framePixels, width, height) {
    const diffMask = new Uint8Array(width * height);

    for (let i = 0; i < bgPixels.length; i += 4) {
        const rDiff = Math.abs(framePixels[i] - bgPixels[i]);
        const gDiff = Math.abs(framePixels[i + 1] - bgPixels[i + 1]);
        const bDiff = Math.abs(framePixels[i + 2] - bgPixels[i + 2]);

        diffMask[i / 4] = rDiff > 20 || gDiff > 20 || bDiff > 20 ? 1 : 0;
    }

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

document.getElementById('uploadButton').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        createStroboscope(file);
    }
});