const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

async function createGIF(file) {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // Erstelle ein GIF aus dem Video
    await ffmpeg.run('-i', 'input.mp4', '-vf', 'fps=5,scale=320:-1:flags=lanczos', 'output.gif');
    const gifData = ffmpeg.FS('readFile', 'output.gif');
    return URL.createObjectURL(new Blob([gifData.buffer], { type: 'image/gif' }));
}

async function extractFrames(file, fps) {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // Extrahiere Frames mit der gewählten FPS
    await ffmpeg.run('-i', 'input.mp4', `-vf`, `fps=${fps}`, 'frame_%03d.png');

    const frames = ffmpeg.FS('readdir', '.').filter((file) => file.startsWith('frame_') && file.endsWith('.png'));
    return frames.map((frame) => {
        const data = ffmpeg.FS('readFile', frame);
        return new Blob([data.buffer], { type: 'image/png' });
    });
}

async function createStroboscope(file, fps, transparency) {
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
        return;
    }

    const videoFile = fileInput.files[0];
    const gifPreview = await createGIF(videoFile);

    document.getElementById('videoPreview').src = gifPreview;
    await createStroboscope(videoFile, fps, transparency);
});
