points_flat = [];

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

  document.getElementById('info').textContent = `normal = (${n
    .map((v) => v.toFixed(3))
    .join(', ')})`;

  // 카메라 위치
  const cameraPos = [-n[1] * 2, n[2] * 2, -n[0] * 2];
  const origin = [0, 0, 0];

  let z_cam = normalize(subtract(origin, cameraPos));
  let x_cam = normalize(cross([0, 1, 0], z_cam));
  let y_cam = cross(z_cam, x_cam);

  // 평면 점
  const points = [
    [1, 0, 1],
    [1, 0, -1],
    [-1, 0, 1],
    [-1, 0, -1],
  ];

  const points_cam = points.map((p) => {
    const v = subtract(p, cameraPos);
    return [dot(v, x_cam), dot(v, y_cam), dot(v, z_cam)];
  });

  const f = 2; // focal length
  window.points_flat = points_cam.map((p) => {
    const x_proj = (p[0] / p[2]) * f;
    const y_proj = (p[1] / p[2]) * f;
    return [x_proj, y_proj, 0];
  });
}

function toCanvasXY(x, y) {
  const scale = 100;
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
