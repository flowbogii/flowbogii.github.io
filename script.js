const videoInput = document.getElementById('videoInput');
const processButton = document.getElementById('processButton');
const loading = document.getElementById('loading');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Load FFmpeg library
const loadFFmpeg = async () => {
    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();
    return { ffmpeg, fetchFile };
};

processButton.addEventListener('click', async () => {
    if (!videoInput.files.length) {
        alert('Bitte lade zuerst ein Video hoch!');
        return;
    }

    loading.style.display = 'block';

    const { ffmpeg, fetchFile } = await loadFFmpeg();

    // Read video file
    const videoFile = videoInput.files[0];
    const videoName = 'input.mp4';
    const outputName = 'output.png';

    // Load video into FFmpeg
    await ffmpeg.FS('writeFile', videoName, await fetchFile(videoFile));

    // Extract frames and generate stroboscope-like image
    await ffmpeg.run('-i', videoName, '-vf', 'fps=10,tile=10x1', outputName);

    // Get the output image
    const data = ffmpeg.FS('readFile', outputName);

    // Display the result on the canvas
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([data.buffer], { type: 'image/png' }));
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        loading.style.display = 'none';
    };
});
