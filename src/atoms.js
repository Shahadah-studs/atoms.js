/**
 * Atoms.js v2.0 - Reactive UI + Shaded 3D WebGL Engine
 */

let activeEffect = null;

// ==========================================
// 1. REACTIVE ATOMS & DOM (React-like)
// ==========================================
export function atom(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  return {
    get value() {
      if (activeEffect) subscribers.add(activeEffect);
      return value;
    },
    set value(newValue) {
      if (Object.is(value, newValue)) return;
      value = newValue;
      subscribers.forEach((fn) => fn());
    }
  };
}

export function effect(fn) {
  activeEffect = fn;
  fn();
  activeEffect = null;
}

export function h(tag, props = {}, ...children) {
  if (typeof tag === 'function') return tag({ ...props, children });

  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(props || {})) {
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (typeof val === 'function') {
      effect(() => {
        if (key === 'value') el.value = val();
        else el.setAttribute(key, val());
      });
    } else {
      if (key === 'value') el.value = val;
      else el.setAttribute(key, val);
    }
  }

  children.flat().forEach((child) => {
    if (typeof child === 'function') {
      const textNode = document.createTextNode('');
      effect(() => { textNode.nodeValue = child(); });
      el.appendChild(textNode);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else if (child != null) {
      el.appendChild(document.createTextNode(String(child)));
    }
  });

  return el;
}

export function mount(component, container) {
  container.innerHTML = '';
  container.appendChild(typeof component === 'function' ? component() : component);
}

// ==========================================
// 2. 3D GEOMETRY GENERATORS
// ==========================================
export function SphereGeometry(radius = 0.7, bands = 24) {
  const positions = [], normals = [], indices = [];
  for (let lat = 0; lat <= bands; lat++) {
    const theta = (lat * Math.PI) / bands;
    const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= bands; lon++) {
      const phi = (lon * 2 * Math.PI) / bands;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      normals.push(x, y, z);
      positions.push(radius * x, radius * y, radius * z);
    }
  }
  for (let lat = 0; lat < bands; lat++) {
    for (let lon = 0; lon < bands; lon++) {
      const first = lat * (bands + 1) + lon;
      const second = first + bands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

export function TorusGeometry(radius = 1.4, tube = 0.045, radialSegments = 16, tubularSegments = 64) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const v = (j / radialSegments) * Math.PI * 2;
      const x = (radius + tube * Math.cos(v)) * Math.cos(u);
      const y = (radius + tube * Math.cos(v)) * Math.sin(u);
      const z = tube * Math.sin(v);
      positions.push(x, y, z);
      normals.push(Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v));
    }
  }
  for (let j = 1; j <= radialSegments; j++) {
    for (let i = 1; i <= tubularSegments; i++) {
      const a = (tubularSegments + 1) * j + i - 1;
      const b = (tubularSegments + 1) * (j - 1) + i - 1;
      const c = (tubularSegments + 1) * (j - 1) + i;
      const d = (tubularSegments + 1) * j + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// ==========================================
// 3. 3D SCENE & SHADED RENDERER (Three.js-like)
// ==========================================
export function Scene3D({ width = 600, height = 400, meshes = [], interactive = true }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.cursor = interactive ? 'grab' : 'default';

  const gl = canvas.getContext('webgl');
  if (!gl) return h('p', {}, 'WebGL not supported');

  // Mouse Orbit Drag State
  let camRotX = 0.35, camRotY = 0.5, isDragging = false, lastX = 0, lastY = 0;
  if (interactive) {
    canvas.addEventListener('pointerdown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', () => { isDragging = false; canvas.style.cursor = 'grab'; });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      camRotY += (e.clientX - lastX) * 0.01;
      camRotX += (e.clientY - lastY) * 0.01;
      lastX = e.clientX; lastY = e.clientY;
    });
  }

  // Shaders with Perspective + Directional + Rim Lighting
  const vsSource = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProj;
    varying vec3 vNormal;
    varying vec3 vFragPos;
    void main() {
      vec4 worldPos = uModel * vec4(aPos, 1.0);
      vFragPos = worldPos.xyz;
      vNormal = mat3(uModel) * aNorm;
      gl_Position = uProj * uView * worldPos;
    }
  `;

  const fsSource = `
    precision mediump float;
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vFragPos;
    void main() {
      vec3 norm = normalize(vNormal);
      vec3 lightDir = normalize(vec3(2.5, 4.0, 3.5));
      float diff = max(dot(norm, lightDir), 0.0);
      vec3 viewDir = normalize(vec3(0.0, 0.0, 5.0) - vFragPos);
      vec3 halfDir = normalize(lightDir + viewDir);
      float spec = pow(max(dot(norm, halfDir), 0.0), 32.0);
      vec3 ambient = uColor * 0.25;
      vec3 result = ambient + (uColor * diff * 0.85) + (vec3(1.0) * spec * 0.45);
      gl_FragColor = vec4(result, 1.0);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // Upload geometry buffers once per mesh
  const compiledMeshes = meshes.map((m) => {
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.geometry.positions, gl.STATIC_DRAW);

    const normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, m.geometry.normals, gl.STATIC_DRAW);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.geometry.indices, gl.STATIC_DRAW);

    return { ...m, posBuf, normBuf, idxBuf, count: m.geometry.indices.length };
  });

  const aPos = gl.getAttribLocation(prog, 'aPos');
  const aNorm = gl.getAttribLocation(prog, 'aNorm');
  const uModel = gl.getUniformLocation(prog, 'uModel');
  const uView = gl.getUniformLocation(prog, 'uView');
  const uProj = gl.getUniformLocation(prog, 'uProj');
  const uColor = gl.getUniformLocation(prog, 'uColor');

  // Lightweight 4x4 Matrix Helpers
  const perspective = (fov, aspect, near, far) => {
    const f = 1.0 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };

  const buildTransform = ([rx, ry, rz], [tx, ty, tz] =, scale = 1) => {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    return new Float32Array([
      scale * (cy * cz), scale * (cy * sz), scale * (-sy), 0,
      scale * (sx * sy * cz - cx * sz), scale * (sx * sy * sz + cx * cz), scale * (sx * cy), 0,
      scale * (cx * sy * cz + sx * sz), scale * (cx * sy * sz - sx * cz), scale * (cx * cy), 0,
      tx, ty, tz, 1
    ]);
  };

  gl.enable(gl.DEPTH_TEST);

  function loop() {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.05, 0.07, 0.11, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniformMatrix4fv(uProj, false, perspective(Math.PI / 4, width / height, 0.1, 100));
    gl.uniformMatrix4fv(uView, false, buildTransform([camRotX, camRotY, 0], [0, 0, -4.5]));

    for (const m of compiledMeshes) {
      const rot = typeof m.rotation === 'function' ? m.rotation() : (m.rotation || [0, 0, 0]);
      const pos = typeof m.position === 'function' ? m.position() : (m.position || [0, 0, 0]);
      const col = typeof m.color === 'function' ? m.color() : (m.color || [0.3, 0.7, 1.0]);
      const scale = typeof m.scale === 'function' ? m.scale() : (m.scale ?? 1);

      gl.uniformMatrix4fv(uModel, false, buildTransform(rot, pos, scale));
      gl.uniform3fv(uColor, col);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.posBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, m.normBuf);
      gl.enableVertexAttribArray(aNorm);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idxBuf);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
  return canvas;
}
