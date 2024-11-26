const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });
let ffmpegBusy = false;

async function runFFmpegCommand(command) {
    while (ffmpegBusy) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    ffmpegBusy = true;
    await ffmpeg.run(...command);
    ffmpegBusy = false;
}

async function extractFrames(file, frameInterval) {
    await ffmpeg.load();
    console.log("FFmpeg geladen");

    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
    console.log("Datei geschrieben");

    await runFFmpegCommand(['-i', 'input.mp4', '-vf', `select=not(mod(n\\,${frameInterval}))`, '-vsync', 'vfr', 'frame_%03d.png']);
    console.log("Frames extrahiert");

    const frames = ffmpeg.FS('readdir', '.').filter((file) => file.startsWith('frame_') && file.endsWith('.png'));
    console.log("Extrahierte Frames:", frames);

    return frames.map((frame) => {
        const data = ffmpeg.FS('readFile', frame);
        return new Blob([data.buffer], { type: 'image/png' });
    });
}

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

    // Setze die Canvas-Größe basierend auf dem ersten Frame
    canvas.width = images[0].width;
    canvas.height = images[0].height;

    // Zeichne das erste Frame als Hintergrund
    const backgroundCanvas = document.createElement('canvas');
    const backgroundCtx = backgroundCanvas.getContext('2d');
    backgroundCanvas.width = canvas.width;
    backgroundCanvas.height = canvas.height;

    backgroundCtx.drawImage(images[0], 0, 0);
    const backgroundImageData = backgroundCtx.getImageData(0, 0, canvas.width, canvas.height);

    let previousFrameData = null;

    // Initialisiere den Haupt-Canvas mit dem Hintergrund
    ctx.putImageData(backgroundImageData, 0, 0);

    for (let index = 1; index < images.length; index++) {
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;

        // Zeichne das aktuelle Bild auf ein Offscreen-Canvas
        offscreenCtx.drawImage(images[index], 0, 0);
        const currentFrameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        if (previousFrameData) {
            const diffImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const diffPixels = diffImageData.data;

            // Vergleiche Pixel des aktuellen Frames mit dem vorherigen Frame
            for (let i = 0; i < currentFrameData.length; i += 4) {
                const rDiff = Math.abs(currentFrameData[i] - previousFrameData[i]);
                const gDiff = Math.abs(currentFrameData[i + 1] - previousFrameData[i + 1]);
                const bDiff = Math.abs(currentFrameData[i + 2] - previousFrameData[i + 2]);

                // Bewegungslogik: Berücksichtige nur Pixel mit signifikanter Änderung
                if (rDiff > 30 || gDiff > 30 || bDiff > 30) {
                    // Wenn Bewegung erkannt wird, nimm die Pixel aus dem aktuellen Frame
                    diffPixels[i] = currentFrameData[i];     // Rot
                    diffPixels[i + 1] = currentFrameData[i + 1]; // Grün
                    diffPixels[i + 2] = currentFrameData[i + 2]; // Blau
                    diffPixels[i + 3] = 255;                  // Alpha (sichtbar)
                } else {
                    // Wenn keine Bewegung, behalte den Hintergrund
                    diffPixels[i] = backgroundImageData.data[i];
                    diffPixels[i + 1] = backgroundImageData.data[i + 1];
                    diffPixels[i + 2] = backgroundImageData.data[i + 2];
                    diffPixels[i + 3] = 255; // Voll deckend
                }
            }

            // Schreibe die Änderungen in den Canvas
            ctx.putImageData(diffImageData, 0, 0);
        }

        // Speichere das aktuelle Frame als vorheriges Frame für die nächste Iteration
        previousFrameData = currentFrameData;
    }

    return canvas.toDataURL(); // Rückgabe des fertigen Bildes
}



// Event Listener für Datei-Upload
document.getElementById('uploadButton').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    const frameInterval = document.getElementById('frameInterval').value;
    if (file) {
        const previewContainer = document.getElementById('preview');
        previewContainer.innerHTML = '<p>Das Stroboskop-Bild wird generiert...</p>';
        try {
            const resultUrl = await createStroboscope(file, frameInterval);
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


