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

    // Überlagere die Frames mit Differenzberechnung
    for (let i = 1; i < images.length; i++) {
        const frame = images[i];

        // Zeichne das aktuelle Frame auf ein Offscreen-Canvas
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;

        offscreenCtx.drawImage(frame, 0, 0);

        // Hole die Pixel-Daten beider Bilder
        const bgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const frameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height);

        const bgPixels = bgData.data;
        const framePixels = frameData.data;

        // Berechne die Differenz
        for (let j = 0; j < bgPixels.length; j += 4) {
            const rDiff = Math.abs(framePixels[j] - bgPixels[j]);
            const gDiff = Math.abs(framePixels[j + 1] - bgPixels[j + 1]);
            const bDiff = Math.abs(framePixels[j + 2] - bgPixels[j + 2]);

            // Nur die Pixel hervorheben, die sich geändert haben
            if (rDiff > 20 || gDiff > 20 || bDiff > 20) {
                bgPixels[j] = framePixels[j];       // R
                bgPixels[j + 1] = framePixels[j + 1]; // G
                bgPixels[j + 2] = framePixels[j + 2]; // B
                bgPixels[j + 3] = 255;              // Alpha
            }
        }

        // Zeichne die aktualisierten Pixel zurück auf das Canvas
        ctx.putImageData(bgData, 0, 0);
    }

    // Zeige das Stroboskop-Bild an
    const resultImg = document.createElement('img');
    resultImg.src = canvas.toDataURL();
    document.body.appendChild(resultImg);
}

// Event Listener für den Upload
document.getElementById('uploadButton').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        createStroboscope(file);
    }
});
