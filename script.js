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

    canvas.width = images[0].width;
    canvas.height = images[0].height;

    let previousFrameData = null;

    for (let index = 0; index < images.length; index++) {
        try {
            const image = images[index];
            const offscreenCanvas = document.createElement('canvas');
            const offscreenCtx = offscreenCanvas.getContext('2d');

            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;

            offscreenCtx.drawImage(image, 0, 0);
            const currentFrameData = offscreenCtx.getImageData(0, 0, canvas.width, canvas.height).data;

            if (previousFrameData) {
                const diffImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const diffPixels = diffImageData.data;

                for (let i = 0; i < currentFrameData.length; i += 4) {
                    const rDiff = Math.abs(currentFrameData[i] - previousFrameData[i]);
                    const gDiff = Math.abs(currentFrameData[i + 1] - previousFrameData[i + 1]);
                    const bDiff = Math.abs(currentFrameData[i + 2] - previousFrameData[i + 2]);

                    if (rDiff > 50 || gDiff > 50 || bDiff > 50) {
                        diffPixels[i] = currentFrameData[i];
                        diffPixels[i + 1] = currentFrameData[i + 1];
                        diffPixels[i + 2] = currentFrameData[i + 2];
                        diffPixels[i + 3] = 255;
                    }
                }

                ctx.putImageData(diffImageData, 0, 0);
            }

            previousFrameData = currentFrameData;
        } catch (err) {
            console.error(`Fehler bei Frame ${index}:`, err);
        }
    }

    return canvas.toDataURL();
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


