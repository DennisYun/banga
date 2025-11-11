const camera = document.querySelector('#camera');
const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraSelect = document.querySelector('#cameraSelect');
const shotbutton = document.querySelector('#shotbutton');
const problemCollector = document.querySelector('#problemCollector');
const downloadbutton = document.querySelector('#downloadbutton');
const fileTitle = document.querySelector('#fileTitle');
const problemStartNum = document.querySelector('#problemStartNum');
const startButton = document.createElement('button');
const therange = document.querySelector('#therange');
const fileInput = document.getElementById('fileInput');
const fakeFileInput = document.querySelector('#fakeFileInput');

let animationFrameId = null;
let currentStream = null;

cv['onRuntimeInitialized'] = () => {
  console.log('OpenCV.js Ready!');
};

const { jsPDF } = window.jspdf;

let points_flat = [];

let points = [
  [1.2, 0, 1.2],
  [1.2, 0, -1.2],
  [-1.2, 0, 1.2],
  [-1.2, 0, -1.2],
];

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function handleOrientation(e) {
  if (e.alpha == null) return;
  const deg2rad = (d) => (d * Math.PI) / 180;

  function rotationMatrixFromEuler(alpha, beta, gamma) {
    const a = deg2rad(alpha || 0);
    const b = deg2rad(beta || 0);
    const g = deg2rad(gamma || 0);

    const ca = Math.cos(a),
      sa = Math.sin(a);
    const cb = Math.cos(b),
      sb = Math.sin(b);
    const cg = Math.cos(g),
      sg = Math.sin(g);

    const Rz = [
      [ca, -sa, 0],
      [sa, ca, 0],
      [0, 0, 1],
    ];
    const Rx = [
      [1, 0, 0],
      [0, cb, -sb],
      [0, sb, cb],
    ];
    const Ry = [
      [cg, 0, sg],
      [0, 1, 0],
      [-sg, 0, cg],
    ];

    function mul(A, B) {
      let C = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j];
          C[i][j] = s;
        }
      return C;
    }

    return mul(mul(Rz, Rx), Ry);
  }

  const R = rotationMatrixFromEuler(e.alpha, e.beta, e.gamma);
  const worldNormal = [R[0][2], R[1][2], R[2][2]];
  const n = normalize(worldNormal);

  // 카메라 위치
  const cameraPos = [0, n[2] * 2, -n[0] * 2];
  const origin = [0, 0, 0];

  let z_cam = normalize(subtract(origin, cameraPos));
  let x_cam = normalize(cross([0, 1, 0], z_cam));
  let y_cam = cross(z_cam, x_cam);

  const points_cam = points.map((p) => {
    const v = subtract(p, cameraPos);
    return [dot(v, x_cam), dot(v, y_cam), dot(v, z_cam)];
  });

  const f = 2; // focal length
  points_flat = points_cam.map((p) => {
    const x_proj = (p[0] / p[2]) * f;
    const y_proj = (p[1] / p[2]) * f;
    return [x_proj, y_proj, 0];
  });
}

function toCanvasXY(x, y) {
  const scale = 250;
  return [canvas.width / 2 + x * scale, canvas.height / 2 - y * scale];
}

function drawPoints(points) {
  ctx.fillStyle = '#00ffff';
  points.forEach((p) => {
    const [cx, cy] = toCanvasXY(p[0], p[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPolygon(points) {
  if (points.length < 2) return;

  ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'; // 투명한 파란색
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'; // 선 색
  ctx.lineWidth = 2;

  ctx.beginPath();
  const [x0, y0] = toCanvasXY(points[0][0], points[0][1]);
  ctx.moveTo(x0, y0);

  const [x1, y1] = toCanvasXY(points[1][0], points[1][1]);
  ctx.lineTo(x1, y1);

  const [x3, y3] = toCanvasXY(points[3][0], points[3][1]);
  ctx.lineTo(x3, y3);

  const [x2, y2] = toCanvasXY(points[2][0], points[2][1]);
  ctx.lineTo(x2, y2);

  ctx.closePath(); // 마지막 점과 첫 점 연결
  ctx.fill(); // 내부 채우기
  ctx.stroke(); // 테두리
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videos = devices.filter((d) => d.kind === 'videoinput');
  cameraSelect.innerHTML = '';
  videos.forEach((dev, i) => {
    const op = document.createElement('option');
    op.value = dev.deviceId;
    op.text = dev.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(op);
  });
}

async function startCamera(constraints) {
  if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: constraints.deviceId,
      width: { ideal: 1280 },
      height: { ideal: 960 }, // 4:3
      aspectRatio: 4 / 3,
    },
  });
  currentStream = stream;
  camera.srcObject = stream;
  await camera.play();

  // 정사각형 기준: 영상의 짧은 쪽을 기준으로
  const size = Math.min(camera.videoWidth, camera.videoHeight);
  canvas.width = camera.videoWidth;
  canvas.height = camera.videoHeight;

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  drawFrame();
}
function drawFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  // for (let i = 0; i < data.length; i += 4) {
  //   const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
  //   const val = avg < 150 ? 0 : 255;
  //   data[i] = data[i + 1] = data[i + 2] = val;
  // }
  ctx.putImageData(frame, 0, 0);
  drawPoints(points_flat);
  drawPolygon(points_flat);
  animationFrameId = requestAnimationFrame(drawFrame);
}

cameraSelect.addEventListener('change', async () => {
  await startCamera({ deviceId: { exact: cameraSelect.value } });
});

(async () => {
  await listCameras();

  const devices = await navigator.mediaDevices.enumerateDevices();
  const backCam = devices.find(
    (d) => d.kind === 'videoinput' && d.label.toLowerCase().includes('back')
  );

  let constraints;
  if (backCam) {
    constraints = { deviceId: { ideal: backCam.deviceId } };
    cameraSelect.value = backCam.deviceId;
  } else if (cameraSelect.options.length > 0) {
    constraints = { deviceId: { ideal: cameraSelect.options[0].value } };
    cameraSelect.value = cameraSelect.options[0].value;
  } else {
    console.error('사용 가능한 카메라가 없습니다.');
    return;
  }

  try {
    await startCamera(constraints);
  } catch (e) {
    console.error('카메라 시작 실패:', e);
    // fallback: 아무 카메라나 시도
    try {
      await startCamera({ video: true });
    } catch (err) {
      console.error('모든 카메라 시도 실패:', err);
    }
  }
})();

shotbutton.addEventListener('click', () => {
  // 1. 캔버스에서 이미지 읽기
  let src = cv.imread(canvas);
  let gray = new cv.Mat();

  // 2. 그레이스케일로 변환
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 3. 적응형 임계값 적용
  let bw = new cv.Mat();
  cv.adaptiveThreshold(
    gray, // 입력 이미지
    bw, // 출력 이미지
    255, // 최대값
    cv.ADAPTIVE_THRESH_GAUSSIAN_C, // 적응형 방식
    cv.THRESH_BINARY, // 이진화
    11, // 블록 크기 (홀수)
    2 // 상수값 (블록 평균에서 뺄 값)
  );

  // 노이즈 제거 (작은 점)
  let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
  cv.morphologyEx(bw, bw, cv.MORPH_OPEN, kernel);
  // 4. 호모그래피 & 크롭 처리
  let dst = new cv.Mat();

  // srcPoints = points_flat → canvas 픽셀
  let srcPtsCanvas = [];
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = toCanvasXY(points_flat[i][0], points_flat[i][1]);
    srcPtsCanvas.push(cx, cy);
  }

  // dstPoints = points[i].x, points[i].z → canvas 픽셀
  let dstPtsCanvas = [];
  for (let i = 0; i < 4; i++) {
    const worldX = points[i][0];
    const worldY = points[i][2];
    const [cx, cy] = toCanvasXY(worldX, worldY);
    dstPtsCanvas.push(cx, cy);
  }

  let srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, srcPtsCanvas);
  let dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, dstPtsCanvas);

  let H = cv.findHomography(srcPoints, dstPoints, cv.RANSAC);

  cv.warpPerspective(
    bw, // 적응형 이진화 이미지 사용
    dst,
    H,
    new cv.Size(canvas.width, canvas.height),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  cv.rotate(dst, dst, cv.ROTATE_180);

  // 5. ROI 크롭
  let xs = [],
    ys = [];
  for (let i = 0; i < dstPtsCanvas.length; i += 2) {
    xs.push(dstPtsCanvas[i]);
    ys.push(dstPtsCanvas[i + 1]);
  }

  let xmin = Math.max(0, Math.floor(Math.min(...xs)));
  let xmax = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  let ymin = Math.max(0, Math.floor(Math.min(...ys)));
  let ymax = Math.min(canvas.height, Math.ceil(Math.max(...ys)));

  let rect = new cv.Rect(xmin, ymin, xmax - xmin, ymax - ymin);
  let cropped = dst.roi(rect);

  // 6. 결과 캔버스에 표시
  let cropCanvas = document.createElement('canvas');
  cropCanvas.width = rect.width;
  cropCanvas.height = rect.height;
  cv.imshow(cropCanvas, cropped);

  const screenshotURL = cropCanvas.toDataURL('image/png');
  const divElement = document.createElement('div');
  const imgElement = document.createElement('img');
  imgElement.src = screenshotURL;
  divElement.classList.add('problemBox');
  divElement.appendChild(imgElement);
  problemCollector.appendChild(divElement);
  divElement.addEventListener('click', () => divElement.remove());

  // 7. 메모리 해제
  src.delete();
  gray.delete();
  bw.delete();
  dst.delete();
  cropped.delete();
  H.delete();
  srcPoints.delete();
  dstPoints.delete();
});

downloadbutton.addEventListener('click', () => {
  const pdf = new jsPDF('p', 'pt', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const problems = document.querySelectorAll('.problemBox img');

  pdf.addFileToVFS('shingraphic.ttf', window.shingraphic);
  pdf.addFileToVFS('shinmiungjo.ttf', window.shinmiungjo);

  pdf.addFont('shingraphic.ttf', 'shingraphic', 'normal');
  pdf.addFont('shinmiungjo.ttf', 'shinmiungjo', 'normal');

  pdf.setTextColor(0, 0, 0);

  problems.forEach((img, index) => {
    const imgWidth = img.naturalWidth; // 이미지 원본 가로 픽셀
    const imgHeight = img.naturalHeight; // 이미지 원본 세로 픽셀
    if (index % 2 === 0 && index !== 0) {
      pdf.addPage();
    }

    const constant = 5;
    const saigonggan = 30;

    if (problemStartNum.value == '') {
      pdf.addImage(
        img,
        'PNG',
        index % 2 === 0
          ? pdfWidth * (1 / 16) + constant
          : pdfWidth / 2 + constant,
        pdfHeight * 0.1 + constant,
        pdfWidth / 2 - pdfWidth * (1 / 16) - 2 * constant,
        ((pdfWidth / 2 - pdfWidth * (1 / 16)) / imgWidth) * imgHeight
      );
    } else {
      pdf.addImage(
        img,
        'PNG',
        index % 2 === 0
          ? pdfWidth * (1 / 16) + constant
          : pdfWidth / 2 + constant,
        pdfHeight * 0.1 + saigonggan,
        pdfWidth / 2 - pdfWidth * (1 / 16) - 2 * constant,
        ((pdfWidth / 2 - pdfWidth * (1 / 16)) / imgWidth) * imgHeight
      );
      pdf.setFontSize(15);
      pdf.setFont('shinmiungjo', 'normal');
      pdf.text(
        `No. ${index + parseInt(problemStartNum.value)}`,
        index % 2 === 0
          ? pdfWidth * (1 / 16) + constant
          : pdfWidth / 2 + constant,
        pdfHeight * 0.1 + constant,
        { baseline: 'top' }
      );
    }

    if (index % 2 === 0) {
      pdf.setLineWidth(1);
      pdf.setDrawColor(0, 0, 0);
      pdf.line(pdfWidth / 2, pdfHeight * 0.1, pdfWidth / 2, pdfHeight * 0.9);
      pdf.line(
        pdfWidth * (1 / 16),
        pdfHeight * 0.1,
        pdfWidth * (15 / 16),
        pdfHeight * 0.1
      );
      pdf.setFontSize(index == 0 ? 35 : 20);
      pdf.setFont('shingraphic', 'normal');
      pdf.text(fileTitle.value, pdfWidth / 2, 55, { align: 'center' });
    }
  });

  pdf.save('download.pdf');
});

document.getElementById('start').onclick = async () => {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const resp = await DeviceOrientationEvent.requestPermission();
    if (resp !== 'granted') {
      alert('센서 권한 거부');
      return;
    }
  }
  window.addEventListener('deviceorientation', handleOrientation, true);
};

therange.addEventListener('input', () => {
  const n = parseFloat(therange.value);
  points = [
    [1.2, 0, n],
    [1.2, 0, -n],
    [-1.2, 0, n],
    [-1.2, 0, -n],
  ];
});

fileInput.addEventListener('change', (event) => {
  const files = event.target.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log('파일 이름:', file.name);
    console.log('파일 타입:', file.type);
    console.log('파일 크기:', file.size, 'bytes');

    // 이미지 파일이면 미리보기
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const divElement = document.createElement('div');
        const imgElement = document.createElement('img');

        imgElement.src = e.target.result;
        divElement.classList.add('problemBox');
        divElement.appendChild(imgElement);
        problemCollector.appendChild(divElement);
        divElement.addEventListener('click', () => {
          divElement.remove();
        });
      };

      // ✅ 여기서 실제로 읽기 시작
      reader.readAsDataURL(file);
    }
  }
});

fakeFileInput.addEventListener('click', () => {
  fileInput.click();
});
