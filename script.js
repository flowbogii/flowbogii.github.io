const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({ log: true });

async function extractFrames(file) {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

    // Extrahiere Frames mit 5 Frames pro Sekunde
    await ffmpeg.run('-i', 'input.mp4', '-vf', 'fps=5', 'frame_%03d.png');

    // Liste aller erzeugten Frames
    const frames = ffmpeg.FS('readdir', '.')
        .filter((file) => file.startsWith('frame_') && file.endsWith('.png'));

    // Hole die Binärdaten der Frames
    const frameData = frames.map((frame) => {
        const data = ffmpeg.FS('readFile', frame);
        return new Blob([data.buffer], { type: 'image/png' });
    });

    return frameData;
}

async function createStroboscope(file) {
    // Extrahiere Frames
    const frames = await extractFrames(file);

    // Lade die Bilder als HTMLImageElemente
    const images = await Promise.all(frames.map((blob) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.onload = () => resolve(img);
        });
    }));

    // Erstelle ein Canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Setze die Canvas-Größe auf die Größe des Videos
    canvas.width = images[0].width;
    canvas.height = images[0].height;

    // Überlagere die Bilder mit Transparenz
    images.forEach((img) => {
        ctx.globalAlpha = 0.5; // Transparenz für die Überlagerung
        ctx.drawImage(img, 0, 0);
    });

    // Füge das Stroboskop-Bild in die Webseite ein
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
