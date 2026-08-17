// Webview viewer: renders parsed SMD triangles with Three.js.
// Bundled into media/viewer.js as an IIFE by esbuild (three + shared parser
// included), so the webview is fully self-contained under strict CSP.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseSmd, SmdModel } from '../smdParser';

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };
const vscodeApi = acquireVsCodeApi();

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let grid: THREE.GridHelper;
let mesh: THREE.Mesh | undefined;

function init(): void {
  const container = document.getElementById('container')!;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1e1e);

  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  grid = new THREE.GridHelper(10, 10, 0x666666, 0x333333);
  scene.add(grid);

  window.addEventListener('resize', resize);
  resize();
  animate();
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function showOverlay(message: string): void {
  const el = document.getElementById('overlay')!;
  el.textContent = message;
  el.classList.toggle('hidden', message === '');
}

function clearMesh(): void {
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material;
    mat.dispose();
    mesh = undefined;
  }
}

// ponytail: static mesh only (positions/normals/uvs from triangle verts).
// Skinned rendering (bones + weights) skipped — add when a rigged model needs it.
function buildGeometry(model: SmdModel): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const tri of model.triangles) {
    for (const v of tri.verts) {
      // Source is Z-up right-handed, Three.js Y-up: remap (x,y,z) -> (x,z,-y).
      positions.push(v.pos[0], v.pos[2], -v.pos[1]);
      normals.push(v.norm[0], v.norm[2], -v.norm[1]);
      // Source V origin is top (DirectX); flip for Three.js.
      uvs.push(v.uv[0], 1 - v.uv[1]);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

function frameCamera(geom: THREE.BufferGeometry): void {
  geom.computeBoundingSphere();
  const sphere = geom.boundingSphere!;
  const radius = Math.max(sphere.radius, 0.1);
  const center = sphere.center;
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(radius * 1.5, radius * 1.2, radius * 1.5));
  controls.update();
}

function load(text: string): void {
  clearMesh();
  try {
    const model = parseSmd(text);
    if (model.triangles.length === 0) {
      showOverlay('No triangles found in SMD.');
      return;
    }
    const geom = buildGeometry(model);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8aa7ff,
      roughness: 0.65,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(geom, material);
    scene.add(mesh);
    frameCamera(geom);
    showOverlay('');
  } catch (e) {
    showOverlay('Parse error: ' + (e as Error).message);
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'loadSmd') {
    if (msg.isDmx) {
      clearMesh();
      showOverlay('DMX not yet supported.');
      return;
    }
    load(msg.text);
  } else if (msg.type === 'error') {
    showOverlay(String(msg.message ?? 'Error loading model.'));
  }
});

init();
// Tell the host the viewer is ready so it posts the current document text.
vscodeApi.postMessage({ type: 'ready' });
