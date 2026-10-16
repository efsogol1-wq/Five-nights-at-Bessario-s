import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { buildAnimatronic, setEnvironment } from './chars/animatronic.js';
export function lineup(q) {
  const r = new Renderer(document.getElementById('c'));
  r.setQuality('high');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050505);
  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 50);
  setEnvironment(r.gl);
  const only = q.get('only');
  const a = buildAnimatronic(only); a.setPose(q.get('pose') || 'stand', true); a.root.rotation.y = +(q.get('ry') || 0); scene.add(a.root);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.add(new THREE.HemisphereLight(0x8090a0, 0x202020, 0.4));
  const key = new THREE.SpotLight(0xffe0c0, 260, 30, 0.6, 0.5); key.position.set(1.5, 4.5, 3.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); scene.add(key);
  const rim = new THREE.PointLight(0x6080a0, 8, 10); rim.position.set(-2, 2.2, -1.5); scene.add(rim);
  cam.position.set(0, +(q.get('cy') || 1.6), +(q.get('cz') || 2.6)); cam.lookAt(0, +(q.get('ly') || 1.4), 0);
  r.onResize = () => { cam.aspect = r.aspect; cam.updateProjectionMatrix(); }; r.resize(true);
  Object.assign(r.post, { vignette: 0.9, grain: 0.05, saturation: 0.85 });
  a.setMode(q.get('mode') || 'stare', cam.position); for (let i = 0; i < 90; i++) a.update(0.033);
  const loop = () => { requestAnimationFrame(loop); a.update(0.016); r.render(scene, cam, 0.016, { still: !q.get('live'), key: 'x' }); }; loop();
  window.NS = { ready: true };
  document.getElementById('boot').remove();
}
