/**
 * Atoms.js - Reactive UI + Declarative 3D Engine
 */

let activeEffect = null;

// 1. Reactive State (Atoms)
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
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

export function effect(fn) {
  activeEffect = fn;
  fn();
  activeEffect = null;
}

// 2. Virtual-free Reactive DOM Hyperscript (React-like)
export function h(tag, props = {}, ...children) {
  if (typeof tag === 'function') {
    return tag({ ...props, children });
  }

  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(props || {})) {
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (typeof val === 'function') {
      effect(() => el.setAttribute(key, val()));
    } else {
      el.setAttribute(key, val);
    }
  }

  children.flat().forEach((child) => {
    if (typeof child === 'function') {
      const textNode = document.createTextNode('');
      effect(() => {
        textNode.nodeValue = child();
      });
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

// 3. Declarative 3D Canvas Component (Three.js-like WebGL Wrapper)
export function Scene3D({ width = 400, height = 300, rotationY, color = [0.2, 0.6, 1.0] }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl');

  if (!gl) return h('p', {}, 'WebGL not supported');

  // Minimal Vertex & Fragment Shaders
  const vsSource = `
    attribute vec3 aPos;
    uniform float uAngle;
    void main() {
      float c = cos(uAngle);
      float s = sin(uAngle);
      mat3 rotY = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
      gl_Position = vec4(rotY * aPos * 0.6, 1.0);
    }
  `;
  const fsSource = `
    precision mediump float;
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
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

  // Triangle Pyramid Vertices
  const vertices = new Float32Array([
     0.0,  0.8,  0.0,  -0.8, -0.8,  0.8,   0.8, -0.8,  0.8,
     0.0,  0.8,  0.0,   0.8, -0.8,  0.8,   0.0, -0.8, -0.8,
     0.0,  0.8,  0.0,   0.0, -0.8, -0.8,  -0.8, -0.8,  0.8
  ]);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  const uAngle = gl.getUniformLocation(prog, 'uAngle');
  const uColor = gl.getUniformLocation(prog, 'uColor');

  gl.enable(gl.DEPTH_TEST);

  // Render loop bound directly to Atoms reactive state
  function render() {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.07, 0.09, 0.13, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const angle = typeof rotationY === 'function' ? rotationY() : (rotationY || 0);
    gl.uniform1f(uAngle, angle);
    gl.uniform3fv(uColor, color);

    gl.drawArrays(gl.TRIANGLES, 0, 9);
  }

  effect(render);
  return canvas;
}
