// Weathering: every plain material in a scene gets world-space triplanar grime, dirt that
// collects near the floor, worn edges in the roughness, and a faint bump. One shared texture.
import * as THREE from 'three';
import { Tex } from './textures.js';

let grunge = null;
export function weather(scene, { strength = 1 } = {}) {
  grunge = grunge || Tex.grunge();
  grunge.wrapS = grunge.wrapT = THREE.RepeatWrapping;
  const done = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || done.has(m) || !m.isMeshStandardMaterial || m.onBeforeCompile.toString().includes('tDetail') || m.transparent || m.userData.noWeather) continue;
      if (m.emissiveIntensity > 0.5 && m.emissive && m.emissive.getHex() !== 0) continue; // bulbs, screens
      done.add(m);
      const k = strength * (m.userData.weather ?? 1);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.tGrunge = { value: grunge };
        sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWNor;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNor = normalize(mat3(modelMatrix) * objectNormal);`);
        sh.fragmentShader = 'uniform sampler2D tGrunge;\nvarying vec3 vWPos;\nvarying vec3 vWNor;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 wb = pow(abs(vWNor), vec3(4.0)); wb /= (wb.x + wb.y + wb.z + 1e-5);
          vec3 wp = vWPos * 0.55;
          float gr = texture2D(tGrunge, wp.zy).r * wb.x + texture2D(tGrunge, wp.xz).r * wb.y + texture2D(tGrunge, wp.xy).r * wb.z;
          float gr2 = texture2D(tGrunge, wp.zy * 3.1 + 0.3).r * wb.x + texture2D(tGrunge, wp.xz * 3.1 + 0.3).r * wb.y + texture2D(tGrunge, wp.xy * 3.1 + 0.3).r * wb.z;
          float floorDirt = smoothstep(0.45, 0.0, vWPos.y) * 0.25;
          float wear = mix(1.0, gr * 0.75 + gr2 * 0.4, ${(0.75 * k).toFixed(3)});
          diffuseColor.rgb *= clamp(wear, 0.35, 1.15) * (1.0 - floorDirt * ${k.toFixed(3)});`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (0.55 - gr2) * ${(0.5 * k).toFixed(3)}, 0.04, 1.0);`);
      };
      m.customProgramCacheKey = () => 'weather' + k.toFixed(2);
      m.needsUpdate = true;
    }
  });
}
