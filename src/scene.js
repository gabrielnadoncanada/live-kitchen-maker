// Scène, rendu physique, lumières, caméra et navigation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createScene(canvasEl) {
  // Mode allégé (mobile) : pixel ratio plafonné à 1,5 (≈ moitié des pixels d'un
  // DPR 2), ombres PCF simples en 1024 — les deux plus gros postes GPU
  const LITE = window.matchMedia('(max-width: 860px)').matches;
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LITE ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#191510');
  scene.fog = new THREE.Fog('#191510', 16, 34);

  // Éclairage d'image (IBL) : pièce neutre → reflets réalistes sur laque/quartz/inox
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(4.2, 2.6, 5.6);

  const controls = new OrbitControls(camera, canvasEl);
  controls.target.set(0, 0.95, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minDistance = 1.4;
  controls.maxDistance = 12;
  controls.enablePan = true;
  controls.panSpeed = 0.6;

  // ——— Lumières ———
  // Soleil par la fenêtre (clé, ombres douces)
  const sun = new THREE.DirectionalLight('#fff2dc', 3.2);
  sun.position.set(-2.5, 4.6, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 20;
  sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Remplissage froid côté opposé
  const fill = new THREE.DirectionalLight('#cfd8e8', 0.55);
  fill.position.set(4, 3.2, 2.5);
  scene.add(fill);

  // Douce lumière d'ambiance venant du plafond — un peu plus présente en mode
  // allégé pour compenser l'absence des PointLights (pendants, spots)
  const hemi = new THREE.HemisphereLight('#fff6e8', '#423a32', LITE ? 0.46 : 0.32);
  scene.add(hemi);

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);

  // ——— Animation de caméra fluide vers des points de vue prédéfinis ———
  let camAnim = null;
  function flyTo(pos, target, dur = 1.4) {
    camAnim = {
      t: 0, dur,
      fromPos: camera.position.clone(), toPos: new THREE.Vector3(...pos),
      fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(...target),
    };
  }

  const clock = new THREE.Clock();
  let onTick = null;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (camAnim) {
      camAnim.t += dt / camAnim.dur;
      const e = easeInOut(Math.min(camAnim.t, 1));
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
      controls.target.lerpVectors(camAnim.fromTgt, camAnim.toTgt, e);
      if (camAnim.t >= 1) camAnim = null;
    }
    controls.update();
    if (onTick) onTick(dt);
    renderer.render(scene, camera);
  }
  loop();

  // REQ-915/916 : rendu hors-écran à la résolution demandée → image (photo HD,
  // vignette du PDF). L'état du rendu est restauré immédiatement.
  function captureImage(w = 2560, h = 1440, type = 'image/png', quality = 0.92) {
    const prevRatio = renderer.getPixelRatio();
    const size = new THREE.Vector2();
    renderer.getSize(size);
    const prevAspect = camera.aspect;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL(type, quality);
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(size.x, size.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return url;
  }

  // termine instantanément le vol en cours (tests, onglet en arrière-plan)
  function snapFly() {
    if (!camAnim) return;
    camera.position.copy(camAnim.toPos);
    controls.target.copy(camAnim.toTgt);
    camAnim = null;
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }

  return {
    renderer, scene, camera, controls, sun,
    flyTo,
    snapFly,
    captureImage,
    cancelFly: () => { camAnim = null; },
    setTick: (fn) => { onTick = fn; },
  };
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
