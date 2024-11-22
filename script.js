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

async function createGIF(file) {
    try {
        updateProgress("Lade FFmpeg...", 10);
        await ffmpeg.load();
        updateProgress("Video wird verarbeitet...", 20);

        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

        updateProgress("GIF wird erstellt...", 40);
        await ffmpeg.run('-i', 'input.mp4', '-vf', 'fps=5,scale=320:-1:flags=lanczos', 'output.gif');
        const gifData = ffmpeg.FS('readFile', 'output.gif');

        updateProgress("GIF fertiggestellt.", 50);
        return URL.createObjectURL(new Blob([gifData.buffer], { type: 'image/gif' }));
    } catch (error) {
        updateProgress("Fehler beim Erstellen des GIFs.", 0, true);
        console.error("Fehler in createGIF:", error);
        throw error;
    }
}

async function extractFrames(file, fps) {
    try {
        updateProgress("Frames werden extrahiert...", 60);

        await ffmpeg.load();
        ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

        await ffmpeg.run('-i', 'input.mp4', `-vf`, `fps=${fps}`, 'frame_%03d.png');
        const frames = ffmpeg.FS('readdir', '.').filter((file) => file.startsWith('frame_') && file.endsWith('.png'));

        updateProgress("Frames extrahiert.", 70);
        return frames.map((frame) => {
            const data = ffmpeg.FS('readFile', frame);
            return new Blob([data.buffer], { type: 'image/png' });
        });
    } catch (error) {
        updateProgress("Fehler beim Extrahieren der Frames.", 0, true);
        console.error("Fehler in extractFrames:", error);
        throw error;
    }
}

async function createStroboscope(file, fps, transparency) {
    try {
        updateProgress("Stroboskop-Bild wird erstellt...", 75);

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
            updateProgress(`Verarbeite Frame ${i + 1} von ${images.length}...`, 75 + (i / images.length) * 20);

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

function findLargestContour(bgPixels, framePixels, width, height) {
    const diffMask = new Uint8Array(width * height);

    for (let i = 0; i < bgPixels.length; i += 4) {
        const rDiff = Math.abs(framePixels[i] - bgPixels[i]);
        const gDiff = Math.abs(framePixels[i + 1] - bgPixels[i + 1]);
        const bDiff = Math.abs(framePixels[i + 2] - bgPixels[i + 2]);
        diffMask[i / 4] = rDiff > 20 || gDiff > 20 || bDiff > 20 ? 1 : 0;
    }

    return diffMask;
}

document.getElementById('generateButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('uploadButton');
    const fps = parseInt(document.getElementById('fps').value);
    const transparency = parseFloat(document.getElementById('transparency').value);

    if (!fileInput.files[0]) {
        alert('Bitte lade ein Video hoch!');
        updateProgress("Warten auf Benutzereingabe...", 0);
        return;
    }

    try {
        updateProgress("Prozess gestartet...", 5);

        const videoFile = fileInput.files[0];
        const gifPreview = await createGIF(videoFile);

        document.getElementById('videoPreview').src = gifPreview;
        await createStroboscope(videoFile, fps, transparency);
    } catch (error) {
        updateProgress("Fehler beim Prozess. Siehe Konsole.", 0, true);
    }
});
