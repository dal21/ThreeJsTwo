// Initialize scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Position the camera
camera.position.z = 5;

// Create 3D texture
const size = 128;
const data = new Uint8Array(size * size * size);

let i = 0;
const scale = 0.15;
const perlin = new ImprovedNoise();
const vector = new THREE.Vector3();

for (let z = 0; z < size; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = 1.0 - vector.set(x, y, z).subScalar(size / 2).divideScalar(size).length();
      data[i] = (128 + 128 * perlin.noise(x * scale, y * scale, z * scale)) * d * d * 2;
      i++;
    }
  }
}

const texture = new THREE.Data3DTexture(data, size, size, size);
texture.format = THREE.RedFormat;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.unpackAlignment = 1;
texture.needsUpdate = true;

// Vertex shader
const vertexShader = `
  uniform vec3 cameraPos;
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader
const fragmentShader = `
  precision highp float;
  precision highp sampler3D;

  varying vec3 vOrigin;
  varying vec3 vDirection;

  uniform vec3 base;
  uniform sampler3D map;
  uniform float threshold;
  uniform float range;
  uniform float opacity;
  uniform float steps;
  uniform float frame;

  uint wang_hash(uint seed) {
    seed = (seed ^ 61u) ^ (seed >> 16u);
    seed *= 9u;
    seed = seed ^ (seed >> 4u);
    seed *= 0x27d4eb2du;
    seed = seed ^ (seed >> 15u);
    return seed;
  }

  float randomFloat(inout uint seed) {
    return float(wang_hash(seed)) / 4294967296.;
  }

  vec2 hitBox(vec3 orig, vec3 dir) {
    const vec3 box_min = vec3(-1.0, -1.0, -1.0);
    const vec3 box_max = vec3(1.0, 1.0, 1.0);
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = (box_min - orig) * inv_dir;
    vec3 tmax_tmp = (box_max - orig) * inv_dir;
    vec3 tmin = min(tmin_tmp, tmax_tmp);
    vec3 tmax = max(tmin_tmp, tmax_tmp);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
  }

  float sample1(vec3 p) {
    return texture(map, p).r;
  }

  float shading(vec3 coord) {
    float step = 0.01;
    return sample1(coord + vec3(-step)) - sample1(fract(coord * 3.0 - frame * 0.02)) * 0.3 - sample1(coord + vec3(step));
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec3 scale_factor = vec3(2.0, 2.0, 2.0);
    vec2 bounds = hitBox(vOrigin, rayDir);
    if (bounds.x > bounds.y) discard;
    bounds.x = max(bounds.x, 0.0);
    vec3 p = vOrigin + bounds.x * rayDir;
    vec3 inc = 1.0 / abs(rayDir);
    float delta = min(inc.x, min(inc.y, inc.z));
    delta /= steps;

    p /= scale_factor;

    uint seed = uint(gl_FragCoord.x) * uint(1973) + uint(gl_FragCoord.y) * uint(9277) + uint(frame) * uint(26699);
    vec3 size = vec3(textureSize(map, 0));
    float randNum = randomFloat(seed) * 2.0 - 1.0;
    p += rayDir * randNum * (1.0 / size);

    vec4 ac = vec4(base, 0.0);

    for (float t = bounds.x; t < bounds.y; t += delta) {
      float d = sample1(p + 0.5);
      d = smoothstep(threshold - range, threshold + range, d) * opacity;
      float col = shading(p + 0.5) * 2.0 + ((p.x + p.y) * 0.25 * sin(frame)) + 0.5;
      ac.rgb += (1.0 - ac.a) * d * col;
      ac.a += (1.0 - ac.a) * d;
      if (ac.a >= 0.99) break;
      p += rayDir * delta;
    }

    gl_FragColor = ac;
    if (gl_FragColor.a < 0.001) discard;
  }
`;

// Create shader material
const material = new THREE.ShaderMaterial({
  uniforms: {
    base: { value: new THREE.Color("#e0f4ff") },
    map: { value: texture },
    cameraPos: { value: camera.position },
    threshold: { value: 0.4 },
    range: { value: 0.2 },
    opacity: { value: 0.65 },
    steps: { value: 64 },
    frame: { value: 0 }
  },
  vertexShader,
  fragmentShader,
  side: THREE.BackSide,
  transparent: true,
  depthTest: false,
  depthWrite: false
});

// Create box mesh
const geometry = new THREE.BoxGeometry(2, 2, 2);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  material.uniforms.frame.value += 0.01;
  material.uniforms.cameraPos.value.copy(camera.position);
  renderer.render(scene, camera);
}

animate();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});