const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

function updateProgress(message, percentage, isError = false) {
    const progressText = document.getElementById("progressText");
    const progressBar = document.getElementById("progressBar");

    progressText.innerText = message;
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor = isError ? 'red' : '#4CAF50';

    console.log(`Progress: ${message} (${percentage}%)`);
}

function validateVideoFormat(file) {
    const allowedFormats = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/avi'];
    if (!allowedFormats.includes(file.type)) {
        updateProgress("Nicht unterstütztes Videoformat. Bitte lade ein MP4, MOV, MKV oder AVI hoch.", 0, true);
        alert("Dieses Videoformat wird nicht unterstützt. Erlaubte Formate: MP4, MOV, MKV, AVI.");
        return false;
    }
    return true;
}

async function createStroboscope(file, fps, transparency) {
    try {
        updateProgress("Stroboskop-Bild wird erstellt...", 50);

        await ffmpeg.load();
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

        const frames = await extractFrames(file, fps);
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
            updateProgress(`Verarbeite Frame ${i + 1} von ${images.length}...`, 50 + (i / images.length) * 30);

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
                    mainPixels[j] = frameData[j] * transparency;
                    mainPixels[j + 1] = frameData[j + 1] * transparency;
                    mainPixels[j + 2] = frameData[j + 2] * transparency;
                    mainPixels[j + 3] = 255;
                }
            }

            ctx.putImageData(mainImageData, 0, 0);
        }

        const resultImg = document.getElementById('outputImage');
        resultImg.src = canvas.toDataURL();

        updateProgress("Stroboskop-Bild fertiggestellt!", 100);
    } catch (error) {
        updateProgress("Fehler beim Erstellen des Stroboskop-Bilds.", 0, true);
        console.error("Fehler in createStroboscope:", error);
    }
}

async function extractFrames(file, fps) {
    updateProgress("Frames werden extrahiert...", 60);

    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
    await ffmpeg.run('-i', 'input.mp4', `-vf`, `fps=${fps}`, 'frame_%03d.png');

    const frames = ffmpeg.FS('readdir', '.').filter((file) => file.startsWith('frame_') && file.endsWith('.png'));

    updateProgress("Frames extrahiert.", 70);
    return frames.map((frame) => {
        const data = ffmpeg.FS('readFile', frame);
        return new Blob([data.buffer], { type: 'image/png' });
    });
}

document.getElementById('uploadButton').addEventListener('change', (event) => {
    const file = event.target.files[0];
    const videoPreview = document.getElementById('videoPreview');

    if (!file) {
        updateProgress("Warte auf Benutzereingabe...", 0);
        return;
    }

    if (!validateVideoFormat(file)) {
        videoPreview.src = "";
        return;
    }

    updateProgress("Video erfolgreich hochgeladen.", 20);
    videoPreview.src = URL.createObjectURL(file);
});

document.getElementById('generateButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('uploadButton');
    const fps = parseInt(document.getElementById('fps').value);
    const transparency = parseFloat(document.getElementById('transparency').value);

    if (!fileInput.files[0]) {
        alert("Bitte lade ein Video hoch!");
        updateProgress("Warte auf Video-Upload...", 0);
        return;
    }

    try {
        const videoFile = fileInput.files[0];
        updateProgress("Videoverarbeitung gestartet...", 30);
        await createStroboscope(videoFile, fps, transparency);
    } catch (error) {
        updateProgress("Fehler beim Prozess. Siehe Konsole.", 0, true);
    }
});
