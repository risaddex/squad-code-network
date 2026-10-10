'use strict';
/* Squad map (Three.js, embedded). Two views share the same agents and HTML markers:
   - city:   hexagonal 3D city, agents on hex plazas (perspective camera);
   - office: isometric 3D office, agents at workstations inside 5 rooms (orthographic camera).
   Without WebGL the same camera math drives a 2D projection, so markers stay usable. */
const MapNetwork = (() => {
  const viewport = document.getElementById('mapViewport');
  const canvas = document.getElementById('cityCanvas');
  const SQ3 = Math.sqrt(3), GRID = 10, TILE_H = .14, PLAZA_H = .34, FOV = 32;
  const C = { bg: 0x070a0b, tile: 0x182226, rim: 0x2b3d46, build: 0x34444b, cyan: 0x30c5e8, purple: 0xad85dd, plaza: 0x0e2229, green: 0x7fcf9d, amber: 0xe0a84a };
  // Theme of a plugin (docs/plans/plugins-conteudo.md): squadThemeBoot (app.js, same script, hoisted) resolves the saved one before the scene is
  // built and leaves it in window.SQUAD_THEME; colours arrive as numbers. Only known keys are taken; no theme = the look below.
  const THEME = (typeof squadThemeBoot === 'function' ? squadThemeBoot() : window.SQUAD_THEME) || {};
  const themed = (base, over) => { if (over && typeof over === 'object') for (const k of Object.keys(base)) if (typeof over[k] === 'number' && Number.isFinite(over[k])) base[k] = over[k]; return base; };
  themed(C, THEME.office);

  /* ---------- hex math (axial, pointy-top) ---------- */
  const hexToWorld = (q, r) => ({ x: SQ3 * (q + r / 2), z: 1.5 * r });
  const hexDistance = (q1, r1, q2 = 0, r2 = 0) => (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
  const inGrid = h => h && Number.isInteger(h.q) && Number.isInteger(h.r) && hexDistance(h.q, h.r) <= GRID;
  const hexKey = h => h.q + ',' + h.r;
  function worldToHex(x, z) {
    const qf = (SQ3 / 3 * x - z / 3), rf = 2 / 3 * z, sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    return { q: q + 0, r: r + 0 };
  }
  const HEXES = [];
  for (let q = -GRID; q <= GRID; q++) for (let r = -GRID; r <= GRID; r++) if (hexDistance(q, r) <= GRID) HEXES.push({ q, r });
  function rng(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }

  /* ---------- office layout: 8 rooms, 24 desks + 6 meeting seats (single source of truth, also used by the app) ---------- */
  // Back row along the window wall (north), front row across the corridor (z = 0), which ends at the War Room door (east wing,
  // full depth, no seats: a click on it opens the operation room). Commander in CMD, ADR/PRD in REC (app).
  const OFFICE = { x0: -16, x1: 16, z0: -9, z1: 9, corridor: [-1.5, 1.5], wallH: 2.4 };
  const ROOMS = [
    { code: 'CMD', name: 'Sala de Comando', x: -16, z: -9, w: 6, d: 7.5, cols: 2, rows: 1, glass: true },
    { code: 'REC', name: 'Reconhecimento', x: -10, z: -9, w: 6, d: 7.5, cols: 2, rows: 1, glass: true },
    { code: 'R', name: 'Sala de Reunião', x: -4, z: -9, w: 7, d: 7.5, round: 6, glass: true },
    { code: 'B', name: 'Open Space B', x: 3, z: -9, w: 6, d: 7.5, cols: 2, rows: 2, pad: 2 },
    { code: 'A', name: 'Open Space A', x: -16, z: 1.5, w: 11, d: 7.5, cols: 4, rows: 2, pad: 2 },
    { code: 'LAB', name: 'Lab', x: -5, z: 1.5, w: 7, d: 7.5, cols: 2, rows: 2 },
    { code: 'C', name: 'Open Space C', x: 2, z: 1.5, w: 7, d: 7.5, cols: 2, rows: 2, pad: 2 },
    { code: 'WAR', name: 'War Room', x: 9, z: -9, w: 7, d: 18, war: true, door: 'west', glass: true }
  ];
  const SLOTS = [];
  ROOMS.forEach((room, ri) => {
    room.index = ri;
    if (room.war) return;
    if (room.round) {
      const cx = room.x + room.w / 2, cz = room.z + room.d / 2 + .4;
      for (let k = 0; k < room.round; k++) { const a = k / room.round * Math.PI * 2; SLOTS.push({ id: `${room.code}-${k + 1}`, room: room.code, x: cx + Math.cos(a) * 2.1, z: cz + Math.sin(a) * 2.1, rot: -a - Math.PI / 2, seat: true }); }
      room.table = { x: cx, z: cz };
      return;
    }
    // Every workstation faces north (facing -1: monitor on the north edge, chair to the south), so the camera sees the screens.
    const mx = .9, cw = (room.w - mx * 2) / room.cols, z0 = room.z + (room.rows > 1 ? 1.55 : room.d * .42);
    let n = 0;
    for (let r = 0; r < room.rows; r++) for (let c = 0; c < room.cols; c++) {
      n++; const id = room.code + '-' + (room.pad ? String(n).padStart(room.pad, '0') : n);
      SLOTS.push({ id, room: room.code, x: room.x + mx + cw * (c + .5), z: z0 + r * 2.5, rot: Math.PI, facing: -1 });
    }
  });
  const SLOT_BY_ID = new Map(SLOTS.map(s => [s.id, s]));
  const ROOM_BY_CODE = new Map(ROOMS.map(r => [r.code, r]));
  // Where the agent "sits": the chair in front of the desk (marker is projected above it).
  const seatOf = slot => slot.seat ? { x: slot.x, z: slot.z } : { x: slot.x, z: slot.z + (slot.facing > 0 ? -.62 : .62) };

  /* ---------- state ---------- */
  let width = 1600, height = 900, scene = [], links = [], selected = '', motion = true, linkMode = false, paused = false, mode = 'city';
  let occupied = new Map(), occupiedDesks = new Map(), running = { id: '', paused: false };
  let moving = null, moveHint = null, moveTip = null, occupiedNames = new Map(); // move mode (startMove)
  let pickedHex = null; // city: the free slot the person clicked; its buildings go down until another click
  const life = { acts: [], actors: new Map(), nextAt: 0, last: 0, layer: null, els: new Map() }; // office life (lifeTick)
  const ops = { data: null, room: null, seen: -1, queue: [], layer: null, els: new Map(), sticky: new Map(), tags: new Map(), tagLayer: null, tagEls: new Map() }; // run in the office (applyOps)
  let runLinks = []; // city: two-way links of the open calls (applyOps)
  let onPosition = () => {}, onCreateAt = () => {}, onEmptyClick = () => {}, onRoomClick = () => {};
  const cam = { tx: 0, tz: 0, distance: 18, base: 18, theta: .62, phi: .96, offsetX: 0 };
  const ocam = { tx: .5, tz: 0, zoom: 1, base: 1, theta: Math.PI / 4, elev: .6155, offsetX: 0, offsetY: 0, viewH: 26 };
  // Left inset (the app's operation chat docked on the left, setInset): the scene is centred in the free area by a projection
  // shift added to both cameras (setViewOffset, 2D fallback), so docking or resizing never resizes the canvas. The home framing
  // already leaves room for the left HUD; only what the dock takes beyond LEFT_ROOM counts (the agents' cards sit left of them).
  const LEFT_ROOM = 150;
  let insetL = 0;
  const insetShift = () => width < 901 ? 0 : Math.max(0, insetL - LEFT_ROOM) / 2;
  let needsRender = true, lastFrame = 0, gl = null;
  // Ambient pacing (camera still, motion on): 'full' draws on every vsync; when too many drawn frames come late (over 15% above
  // 24 ms), 'half' draws on every other vsync, so the cadence stays regular instead of alternating 16/33 ms.
  const pacing = { mode: 'full', n: 0, sum: 0, late: 0, avg: 0 };
  const resetPacing = () => { pacing.mode = 'full'; pacing.n = pacing.sum = pacing.late = 0; };
  const tweens = [];
  const now = () => performance.now();
  const reducedMotion = () => !motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const invalidate = () => { needsRender = true; };
  function tween(duration, step, done) { const tw = { t0: now(), duration, step, done }; tweens.push(tw); invalidate(); return tw; }
  function cancelTween(tw) { const i = tweens.indexOf(tw); if (i >= 0) tweens.splice(i, 1); }
  // Transmorph camera pose: the camera orbits its target around its own right axis (the world seems to flip like a card).
  const pose = { flip: 0 };
  /* City shape (settings): 'flat' or 'planet'. The planet is the same flat city bent in the vertex shader (bendMaterial):
     b blends flat (0) -> sphere (1) of radius R/b centred at (0,-R/b,0), north pole fixed at the origin (azimuthal equidistant).
     Offsets up to Y0 keep their size (no z-fighting); what stands above them is scaled by H. LOOK drops the camera target toward
     the planet centre so the whole sphere is framed. */
  const PLANET_R = 8, PLANET_H = .65, PLANET_Y0 = PLAZA_H + .05, PLANET_LOOK = .55, PLANET_RHO = 18.6, CURL_MS = 2600;
  const planet = { b: 0, want: 'flat', run: null };
  let curling = false;
  function planetMap(x, y, z, b = planet.b) {
    if (b < 5e-4) return { x, y, z };
    const Rb = PLANET_R / b, rho = Math.max(Math.hypot(x, z), 1e-6), th = rho / Rb, s2 = Math.sin(th / 2);
    const h = Math.min(y, PLANET_Y0) + Math.max(y - PLANET_Y0, 0) * (1 + (PLANET_H - 1) * b), k = Math.sin(th) * (Rb + h) / rho;
    return { x: x * k, y: h * Math.cos(th) - 2 * Rb * s2 * s2, z: z * k };
  }
  // Flat (x, z) under a point on the finished planet (b = 1).
  function planetUnmap(px, py, pz) { const hz = Math.hypot(px, pz); if (hz < 1e-9) return { x: 0, z: 0 }; const rho = Math.atan2(hz, py + PLANET_R) * PLANET_R; return { x: px / hz * rho, z: pz / hz * rho }; }
  const labels = document.createElement('div'); labels.id = 'officeLabels'; labels.hidden = true; viewport.append(labels);
  labels.innerHTML = ROOMS.map((r, i) => `<span class="office-label" data-room="${r.code}" style="--i:${i}">${String(i + 1).padStart(2, '0')} / ${r.name.toUpperCase()}</span>`).join('');
  // What the squad is doing (running.phase): the War Room's look follows it (syncOffice).
  const squadState = () => running.phase === 'planning' ? 'planning' : running.phase === 'awaiting' ? 'awaiting' : running.paused ? 'paused' : running.id || running.phase === 'running' ? 'running' : 'idle';

  /* ---------- WebGL scenes ---------- */
  try {
    if (!window.THREE) throw Error('three missing');
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw Error('webgl unavailable');
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(C.bg, 1); renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
    // Soft shadows of the city's key light (r186: PCF with a Vogel disk of `shadow.radius`). The office casts none.
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    // The island is static most of the time: the shadow map and the ambient occlusion are recomputed only when something
    // changes (geoDirty: buildings, plazas, planet, quality, size; the camera only for the AO and, on the planet, the shadows).
    renderer.shadowMap.autoUpdate = false;
    let geoDirty = true;
    const markDirty = () => { geoDirty = true; };
    // The city is a dark monochrome island (.inspo/city.jpg): charcoal buildings, light-grey street lines, black water. Cyan stays
    // for what belongs to the agents (plazas, rims, selection, links). The office keeps C and its own exposure.
    const CITY = themed({ bg: 0x0a0b0c, build: 0x2d3135, tree: 0x222a25, water: 0x07090a, wall: 0x131619, exposure: 1.06 }, THEME.city);
    const s = new T.Scene(); s.fog = new T.Fog(CITY.bg, 14, 46);
    const camera = new T.PerspectiveCamera(FOV, 16 / 9, .1, 400);
    const hemi = new T.HemisphereLight(0xd9e1e5, 0x0b0c0e, .62); s.add(hemi);
    const SUN_POS = new T.Vector3(-11, 21, 9), RIM_POS = new T.Vector3(10, 7, -8), UP = new T.Vector3(0, 1, 0);
    // Key light: a cold neutral "moon" from above that casts the soft shadows; its frustum covers the whole island.
    const sun = new T.DirectionalLight(0xeef2f5, 3.4); sun.position.copy(SUN_POS); s.add(sun, sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 3; sun.shadow.bias = -.0004; sun.shadow.normalBias = .025;
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 }); sun.shadow.camera.updateProjectionMatrix();
    const rimLight = new T.DirectionalLight(0x9fabb2, .55); rimLight.position.copy(RIM_POS); s.add(rimLight);
    s.add(new T.AmbientLight(0x1c1f22, .42));

    /* Planet mode: every material of the city scene is patched once (bendTree, before each render) so the vertex shader maps the
       flat world onto the sphere (pl_map, mirrored by planetMap) and turns the normals with the surface (pl_bend). The patch is
       the identity at b = 0, so switching shapes never recompiles; objects tagged userData.noBend (planet scenery) are skipped. */
    const PLANET_U = { uPlanetR: { value: PLANET_R }, uPlanetB: { value: 0 }, uPlanetH: { value: PLANET_H }, uPlanetY0: { value: PLANET_Y0 } };
    const PLANET_GLSL = `
uniform float uPlanetR; uniform float uPlanetB; uniform float uPlanetH; uniform float uPlanetY0;
vec3 pl_map(vec3 pl_w) {
  if (uPlanetB < 0.0005) return pl_w;
  float pl_Rb = uPlanetR / uPlanetB, pl_rho = max(length(pl_w.xz), 1e-6), pl_th = pl_rho / pl_Rb, pl_s = sin(pl_th * 0.5);
  float pl_h = min(pl_w.y, uPlanetY0) + max(pl_w.y - uPlanetY0, 0.0) * mix(1.0, uPlanetH, uPlanetB);
  vec2 pl_d = pl_w.xz * (sin(pl_th) * (pl_Rb + pl_h) / pl_rho);
  return vec3(pl_d.x, pl_h * cos(pl_th) - 2.0 * pl_Rb * pl_s * pl_s, pl_d.y);
}
vec3 pl_bend(vec3 pl_v, vec3 pl_w) {
  if (uPlanetB < 0.0005) return pl_v;
  float pl_rho = max(length(pl_w.xz), 1e-6), pl_th = pl_rho * uPlanetB / uPlanetR, pl_c = cos(pl_th);
  vec3 pl_k = vec3(pl_w.z, 0.0, -pl_w.x) / pl_rho;
  return pl_v * pl_c + cross(pl_k, pl_v) * sin(pl_th) + pl_k * dot(pl_k, pl_v) * (1.0 - pl_c);
}
`;
    const PLANET_PROJECT = `
vec4 pl_wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  pl_wp = instanceMatrix * pl_wp;
#endif
pl_wp = modelMatrix * pl_wp;
pl_wp.xyz = pl_map(pl_wp.xyz);
vec4 mvPosition = viewMatrix * pl_wp;
gl_Position = projectionMatrix * mvPosition;
`;
    const PLANET_NORMAL = `#include <defaultnormal_vertex>
{
  vec4 pl_np = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    pl_np = instanceMatrix * pl_np;
  #endif
  pl_np = modelMatrix * pl_np;
  mat3 pl_vr = mat3(viewMatrix);
  transformedNormal = pl_vr * pl_bend(transpose(pl_vr) * transformedNormal, pl_np.xyz);
}
`;
    // Chains a material's own onBeforeCompile (the buildings' facade) and keys the program by it (userData.shaderKey).
    function bendMaterial(m) {
      if (m.userData.planet) return; m.userData.planet = true;
      const own = m.onBeforeCompile, key = m.userData.shaderKey || '';
      m.onBeforeCompile = (shader, r) => {
        own.call(m, shader, r);
        Object.assign(shader.uniforms, PLANET_U);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + PLANET_GLSL).replace('#include <project_vertex>', PLANET_PROJECT).replace('#include <defaultnormal_vertex>', PLANET_NORMAL);
      };
      m.customProgramCacheKey = () => 'planet' + key; m.needsUpdate = true;
    }
    // Shadow casters render their depth through the bent material too, so the shadows follow the planet.
    const depthMat = new T.MeshDepthMaterial(); bendMaterial(depthMat);
    const castShadows = mesh => { mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = depthMat; return mesh; };
    // Bounding volumes stay flat, so bent objects are never frustum-culled.
    function bendTree() {
      s.traverse(o => {
        if (!o.material) return; for (let p = o; p; p = p.parent) if (p.userData.noBend) return;
        o.frustumCulled = false; (Array.isArray(o.material) ? o.material : [o.material]).forEach(bendMaterial);
      });
    }

    // Black water around the island (flat shape only; on the planet the core sphere replaces it): low roughness, so the key
    // light leaves a faint sheen.
    const water = new T.Mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ color: CITY.water, roughness: .42, metalness: .2 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -.04; water.receiveShadow = true; s.add(water);

    // Planet scenery (never bent): a core sphere that replaces the ground and curls into the planet body, a starfield around the
    // camera, a halo billboard for the cyan atmosphere and the decorative core at the south pole (rings, spire, beacon light).
    const planetFx = new T.Group(); planetFx.userData.noBend = planetFx.userData.noAO = true; planetFx.visible = false; s.add(planetFx);
    const coreMat = new T.MeshStandardMaterial({ color: 0x080a0b, roughness: 1, metalness: 0, emissive: 0x1a1f22, emissiveIntensity: 0 });
    const planetCore = new T.Mesh(new T.SphereGeometry(1, 96, 64), coreMat); planetFx.add(planetCore);
    const starLayer = (count, radius, size, colorHex, seed) => {
      const pos = [], sr = rng(seed);
      for (let i = 0; i < count; i++) { const u = sr() * 2 - 1, a = sr() * Math.PI * 2, r = Math.sqrt(1 - u * u); pos.push(Math.cos(a) * r * radius, u * radius, Math.sin(a) * r * radius); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      const pts = new T.Points(g, new T.PointsMaterial({ color: colorHex, size, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); planetFx.add(pts); return pts;
    };
    const stars = [starLayer(1300, 180, 1.4, 0xbfdde6, 4471), starLayer(160, 175, 2.6, 0xe8fbff, 9123)];
    const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 256;
    { const g = haloCanvas.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); [[0, 0], [.52, 0], [.66, .22], [.74, .55], [.775, .75], [.83, .32], [.92, .08], [1, 0]].forEach(([at, a]) => grd.addColorStop(at, `rgba(196,212,220,${a * .8})`)); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); }
    const HALO_PEAK = .775, haloMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(haloCanvas), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    const halo = new T.Mesh(new T.PlaneGeometry(1, 1), haloMat); halo.renderOrder = 10; planetFx.add(halo);
    const beacon = new T.Group(); planetFx.add(beacon);
    const glowMat = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, fog: false });
    // Rings hug the sphere around the south pole (their y follows the surface at their radius).
    const poleRing = (radius, tube, c, o) => { const m = new T.Mesh(new T.TorusGeometry(radius, tube, 8, 128), glowMat(c, o)); m.rotation.x = Math.PI / 2; m.position.y = PLANET_R - Math.sqrt(PLANET_R * PLANET_R - radius * radius) - .14; m.userData.o = o; beacon.add(m); return m; };
    const poleRings = [poleRing(1.5, .05, C.cyan, .95), poleRing(2.6, .03, 0x7fe3f6, .55), poleRing(3.6, .02, C.cyan, .3)];
    const spire = new T.Mesh(new T.CylinderGeometry(.035, .17, 2.8, 8), new T.MeshStandardMaterial({ color: 0x2b3d46, emissive: 0x0e3a47, emissiveIntensity: .9, roughness: .5, metalness: .6 })); spire.position.y = -1.3; beacon.add(spire);
    const orb = new T.Mesh(new T.SphereGeometry(.22, 16, 12), glowMat(0xbff6ff, 1)); orb.position.y = -2.8; orb.userData.o = 1; beacon.add(orb);
    const beaconLight = new T.PointLight(C.cyan, 0, 14, 1.4); beaconLight.position.y = -2.3; beacon.add(beaconLight);
    let beaconK = 0;
    function setPlanet(b) {
      PLANET_U.uPlanetB.value = b; markDirty(); const on = b >= 5e-4, Rb = on ? PLANET_R / b : PLANET_R;
      water.visible = seawall.visible = !on; planetFx.visible = on;
      if (on) {
        planetCore.position.set(0, -Rb, 0); planetCore.scale.setScalar(Rb - .02); coreMat.emissiveIntensity = .5 * b;
        stars[0].material.opacity = .75 * Math.min(1, b * 1.3); stars[1].material.opacity = Math.min(1, b * 1.3);
        haloMat.opacity = Math.max(0, (b - .55) / .45); halo.position.set(0, -Rb, 0); halo.scale.setScalar(2 * (Rb + 2.4) / HALO_PEAK); // glow beyond the tallest buildings, which stand out against it
        beaconK = Math.max(0, (b - .9) / .1); beacon.visible = beaconK > 0; beacon.position.set(0, -2 * Rb, 0);
        for (const m of [...poleRings, orb]) m.material.opacity = m.userData.o * beaconK;
      }
      invalidate();
    }

    /* ----- the city: a dark monochrome island (.inspo/city.jpg) -----
       One ground mesh in the shape of the grid carries the street map (a CanvasTexture drawn once: avenues on the hex borders,
       three blocks per hex split by narrow streets, light kerb lines, parks, the coast). Dense instanced buildings with setbacks
       and roof details stand on the blocks, grouped by hex (byHex), so a hex empties when an agent takes it and the transmorph
       wave rises hex by hex. Every hex border is a street, so the grid of slots stays readable. */
    const random = rng(26172), dummy = new T.Object3D(), color = new T.Color();
    // seg > 1 subdivides each side, so big rings (radar sweep, pulses) follow the planet instead of cutting through it.
    const hexRing = (radius, y, seg = 1) => { const pts = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, a2 = a + Math.PI / 3; for (let j = 0; j < seg; j++) { const u = j / seg; pts.push(new T.Vector3((Math.cos(a) * (1 - u) + Math.cos(a2) * u) * radius, y, (Math.sin(a) * (1 - u) + Math.sin(a2) * u) * radius)); } } return pts; };
    // Corner k of a hex (pointy-top, radius 1) and the neighbour across the edge between corners k and k + 1.
    const CORNERS = [0, 1, 2, 3, 4, 5].map(k => ({ x: Math.cos(Math.PI / 6 + k * Math.PI / 3), z: Math.sin(Math.PI / 6 + k * Math.PI / 3) }));
    const EDGE_N = [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]];
    // Districts: seeded value noise over the map decides where the downtown towers rise.
    const noise = (() => { const nr = rng(5501), N = 32, v = Array.from({ length: N * N }, () => nr()), at = (i, j) => v[(((i % N) + N) % N) * N + (((j % N) + N) % N)], sm = t => t * t * (3 - 2 * t); return (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = sm(x - i), fz = sm(z - j), a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }; })();
    const district = (x, z) => .62 * noise(x * .15 + 3.1, z * .15 + 7.4) + .38 * noise(x * .36 + 11.2, z * .36 + 1.9);
    const parks = new Set(HEXES.filter(h => { const d = hexDistance(h.q, h.r); return d >= 3 && d <= GRID - 1 && random() < .09; }).map(hexKey));

    // Street map, drawn once in 2D over the square [-EXT, EXT]² of the flat world (UV from world xz).
    const EXT = 20, BLOCK = .86;
    function cityMap() {
      const S = renderer.capabilities.maxTextureSize >= 4096 && !matchMedia('(max-width: 900px)').matches ? 4096 : 2048, ppu = S / (2 * EXT);
      const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
      const X = x => (x + EXT) * ppu, Z = z => (z + EXT) * ppu, px = u => Math.max(1, u * ppu);
      const path = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.closePath(); };
      const at = (w, c, k) => ({ x: w.x + c.x * k, z: w.z + c.z * k });
      g.fillStyle = '#0c0e10'; g.fillRect(0, 0, S, S);
      // Fine asphalt grain (a small noise tile repeated over the whole map).
      const nz = document.createElement('canvas'); nz.width = nz.height = 128; const ng = nz.getContext('2d'), img = ng.createImageData(128, 128), nr = rng(771);
      for (let i = 0; i < img.data.length; i += 4) { const v = 110 + nr() * 145 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = nr() * 16 | 0; }
      ng.putImageData(img, 0, 0); g.fillStyle = g.createPattern(nz, 'repeat'); g.fillRect(0, 0, S, S);
      for (const h of HEXES) {
        const w = hexToWorld(h.q, h.r), d = hexDistance(h.q, h.r), park = parks.has(hexKey(h)), block = CORNERS.map(c => at(w, c, BLOCK));
        // Sidewalk of the block, with its kerb as the thin light line of the reference.
        path(block); g.fillStyle = park ? '#111712' : d <= 1 ? '#1a1d20' : '#15181a'; g.fill();
        g.strokeStyle = 'rgba(196,205,209,.86)'; g.lineWidth = px(.017); g.stroke();
        if (park) {
          // Lawn with curved paths and a small pond.
          g.strokeStyle = 'rgba(170,184,176,.42)'; g.lineWidth = px(.011);
          g.beginPath(); g.arc(X(w.x), Z(w.z), .46 * ppu, 0, Math.PI * 2); g.stroke();
          const p0 = at(w, CORNERS[3], .8), p1 = at(w, CORNERS[0], .8), c0 = at(w, CORNERS[1], .55), c1 = at(w, CORNERS[4], .55);
          g.beginPath(); g.moveTo(X(p0.x), Z(p0.z)); g.bezierCurveTo(X(c0.x), Z(c0.z), X(c1.x), Z(c1.z), X(p1.x), Z(p1.z)); g.stroke();
          const po = at(w, CORNERS[5], .38); g.beginPath(); g.ellipse(X(po.x), Z(po.z), .16 * ppu, .1 * ppu, .6, 0, Math.PI * 2); g.fillStyle = '#080a0b'; g.fill(); g.stroke();
          continue;
        }
        if (d <= 1) continue;
        // Three rhombus blocks per hex (centre + corners k, k+1, k+2), split by narrow streets, each outlined.
        g.strokeStyle = '#0c0e10'; g.lineWidth = px(.075); g.beginPath();
        for (const k of [0, 2, 4]) { const c = at(w, CORNERS[k], BLOCK); g.moveTo(X(w.x), Z(w.z)); g.lineTo(X(c.x), Z(c.z)); } g.stroke();
        for (const k of [0, 2, 4]) {
          const pts = [{ x: w.x, z: w.z }, at(w, CORNERS[k], BLOCK), at(w, CORNERS[(k + 1) % 6], BLOCK), at(w, CORNERS[(k + 2) % 6], BLOCK)];
          const cx = (pts[0].x + pts[2].x) / 2, cz = (pts[0].z + pts[2].z) / 2;
          path(pts.map(p => ({ x: cx + (p.x - cx) * .86, z: cz + (p.z - cz) * .86 }))); g.fillStyle = '#17191c'; g.fill();
          g.strokeStyle = 'rgba(176,186,191,.5)'; g.lineWidth = px(.011); g.stroke();
        }
      }
      // Lane marks in the middle of the avenues (each border once) and the coastline where the grid ends.
      g.setLineDash([px(.06), px(.09)]); g.strokeStyle = 'rgba(140,148,153,.42)'; g.lineWidth = px(.009);
      for (const h of HEXES) {
        const w = hexToWorld(h.q, h.r);
        for (let k = 0; k < 6; k++) {
          const n = { q: h.q + EDGE_N[k][0], r: h.r + EDGE_N[k][1] }; if (!inGrid(n) || hexKey(n) < hexKey(h)) continue;
          const a = at(w, CORNERS[k], 1), b = at(w, CORNERS[(k + 1) % 6], 1); g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke();
        }
      }
      g.setLineDash([]);
      for (const h of HEXES) {
        const w = hexToWorld(h.q, h.r);
        for (let k = 0; k < 6; k++) {
          if (inGrid({ q: h.q + EDGE_N[k][0], r: h.r + EDGE_N[k][1] })) continue;
          const a = at(w, CORNERS[k], 1), b = at(w, CORNERS[(k + 1) % 6], 1), a2 = at(w, CORNERS[k], .95), b2 = at(w, CORNERS[(k + 1) % 6], .95);
          g.strokeStyle = 'rgba(214,221,224,.9)'; g.lineWidth = px(.02); g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(b.x), Z(b.z)); g.stroke();
          g.strokeStyle = 'rgba(160,170,175,.35)'; g.lineWidth = px(.008); g.beginPath(); g.moveTo(X(a2.x), Z(a2.z)); g.lineTo(X(b2.x), Z(b2.z)); g.stroke();
        }
      }
      // Anisotropy 4: the map is seen at grazing angles, and 16x is costly on integrated GPUs for little visible gain.
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); return tex;
    }
    // Ground: every hex as 6 triangles, each split in 4 (short edges, so the planet bend follows the surface).
    const groundPos = [], groundUV = [], groundN = [];
    const uv = p => [(p.x + EXT) / (2 * EXT), 1 - (p.z + EXT) / (2 * EXT)], mid = (p, q) => ({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    for (const h of HEXES) {
      const w = hexToWorld(h.q, h.r);
      for (let k = 0; k < 6; k++) {
        const P = [{ x: w.x, z: w.z }, { x: w.x + CORNERS[k].x, z: w.z + CORNERS[k].z }, { x: w.x + CORNERS[(k + 1) % 6].x, z: w.z + CORNERS[(k + 1) % 6].z }];
        const m01 = mid(P[0], P[1]), m12 = mid(P[1], P[2]), m20 = mid(P[2], P[0]);
        for (const [a, b, c] of [[P[0], m01, m20], [m01, P[1], m12], [m20, m12, P[2]], [m01, m12, m20]]) for (const v of [a, c, b]) { groundPos.push(v.x, TILE_H, v.z); groundUV.push(...uv(v)); groundN.push(0, 1, 0); }
      }
    }
    const groundGeo = new T.BufferGeometry(); groundGeo.setAttribute('position', new T.Float32BufferAttribute(groundPos, 3)); groundGeo.setAttribute('uv', new T.Float32BufferAttribute(groundUV, 2)); groundGeo.setAttribute('normal', new T.Float32BufferAttribute(groundN, 3));
    const cityGround = new T.Mesh(groundGeo, new T.MeshStandardMaterial({ map: cityMap(), roughness: .9, metalness: 0 })); cityGround.receiveShadow = true; s.add(cityGround);
    // Seawall: the island's edge drops into the water (flat shape only, like the water).
    const wallPos = [];
    for (const h of HEXES) {
      const w = hexToWorld(h.q, h.r);
      for (let k = 0; k < 6; k++) {
        if (inGrid({ q: h.q + EDGE_N[k][0], r: h.r + EDGE_N[k][1] })) continue;
        const a = { x: w.x + CORNERS[k].x, z: w.z + CORNERS[k].z }, b = { x: w.x + CORNERS[(k + 1) % 6].x, z: w.z + CORNERS[(k + 1) % 6].z };
        wallPos.push(a.x, TILE_H, a.z, b.x, TILE_H, b.z, b.x, -.08, b.z, a.x, TILE_H, a.z, b.x, -.08, b.z, a.x, -.08, a.z);
      }
    }
    const wallGeo = new T.BufferGeometry(); wallGeo.setAttribute('position', new T.Float32BufferAttribute(wallPos, 3)); wallGeo.computeVertexNormals();
    const seawall = new T.Mesh(wallGeo, new T.MeshStandardMaterial({ color: CITY.wall, roughness: .85, side: T.DoubleSide })); s.add(seawall);

    // Buildings: charcoal, matte, with a procedural facade (floor lines, mullions, darker at the foot, lighter roofs) computed
    // from the world position in the shader, so it never stretches with the instance scale and needs no texture.
    const buildMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .84, metalness: .06 });
    buildMat.userData.shaderKey = 'facade';
    buildMat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFcPos; varying vec3 vFcN; varying float vFcT;').replace('#include <begin_vertex>', `#include <begin_vertex>
vFcT = position.y + 0.5;
{
  vec4 fc_p = vec4(transformed, 1.0); vec3 fc_n = objectNormal;
  #ifdef USE_INSTANCING
    fc_p = instanceMatrix * fc_p; fc_n = mat3(instanceMatrix) * fc_n;
  #endif
  vFcPos = (modelMatrix * fc_p).xyz; vFcN = normalize(mat3(modelMatrix) * fc_n);
}`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFcPos; varying vec3 vFcN; varying float vFcT;').replace('#include <color_fragment>', `#include <color_fragment>
{
  float fc_far = 1.0 - smoothstep(28.0, 70.0, length(vViewPosition));
  if (vFcN.y > 0.55) diffuseColor.rgb *= 1.5;
  else if (vFcN.y > -0.55) {
    vec2 fc_c = vec2((abs(vFcN.x) > abs(vFcN.z) ? vFcPos.z : vFcPos.x) / 0.105, (vFcPos.y - ${TILE_H.toFixed(3)}) / 0.125);
    vec2 fc_f = fract(fc_c), fc_w = fwidth(fc_c) * 1.5;
    float fc_floor = smoothstep(0.0, fc_w.y + 0.1, fc_f.y) * smoothstep(1.0, 0.8 - fc_w.y, fc_f.y);
    float fc_mul = smoothstep(0.0, fc_w.x + 0.05, fc_f.x) * smoothstep(1.0, 0.94 - fc_w.x, fc_f.x);
    diffuseColor.rgb *= mix(1.0, mix(0.58, 1.0, fc_floor) * mix(0.8, 1.0, fc_mul), fc_far * 0.92);
    // Darker at the foot of each volume, a little lighter high up, and a lit cornice at its top edge.
    diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.35, vFcT)) * (1.0 + 0.2 * smoothstep(1.2, 5.5, vFcPos.y)) * (1.0 + 0.55 * smoothstep(0.955, 0.995, vFcT));
  }
}`);
    };
    const treeMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .95, metalness: 0 });
    const GEO = { box: new T.BoxGeometry(1, 1, 1), prism: new T.CylinderGeometry(.5, .5, 1, 6), round: new T.CylinderGeometry(.5, .5, 1, 16), spire: new T.CylinderGeometry(.22, .5, 1, 6), tree: new T.SphereGeometry(.5, 8, 6), pine: new T.CylinderGeometry(0, .5, 1, 7) };
    // Parts: { key, kind, x, z, rot, w, d, h0 (base above the ground), h, tone }. A tall building stacks base + setbacks + spire.
    const specs = [];
    const part = (key, kind, x, z, rot, w, d, h0, h, tone) => specs.push({ key, kind, x, z, rot, w, d, h0, h, tone });
    HEXES.forEach(h => {
      const d = hexDistance(h.q, h.r), key = hexKey(h), w = hexToWorld(h.q, h.r); if (d <= 1) return;
      if (parks.has(key)) {
        for (let i = 0, n = 6 + Math.floor(random() * 5); i < n; i++) {
          const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .78, s2 = .1 + random() * .1, pine = random() < .3;
          part(key, pine ? 'pine' : 'tree', w.x + Math.cos(a) * r, w.z + Math.sin(a) * r, 0, s2, s2, pine ? 0 : .02, pine ? s2 * 2.2 : s2 * 1.1, .8 + random() * .4);
        }
        return;
      }
      // Low near the squad (first rings) and along the coast; downtown towers where the district noise peaks. Kept light: about
      // four blocks in ten are open lots, most blocks hold a single building, and only the tallest get setbacks.
      const ring = Math.min(1, Math.max(0, (d - 2) / 4)), coast = 1 - Math.max(0, d - (GRID - 1.5)) * .3;
      for (const k of [0, 2, 4]) {
        if (d >= 3 && random() < .4) continue;
        const A = { x: CORNERS[k].x * BLOCK, z: CORNERS[k].z * BLOCK }, B = { x: CORNERS[(k + 2) % 6].x * BLOCK, z: CORNERS[(k + 2) % 6].z * BLOCK };
        const rot = -Math.atan2(A.z, A.x), merged = random() < .72 || d < 3, n = merged ? 1 : 2, m = 1;
        for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
          const sc = (i + .5) / n, tc = (j + .5) / m, x = w.x + A.x * sc + B.x * tc, z = w.z + A.z * sc + B.z * tc, dn = district(x, z);
          let H = (.2 + 4.1 * Math.pow(dn, 1.9)) * (.45 + random() * .85) * (.2 + .8 * ring) * coast;
          // Whatever the camera angle, nothing tall stands between it and the squad: towers only on the outer rings (skyline).
          if (d >= 6 && dn > .48 && random() < .28) H *= 1.5 + random() * .9;
          H = Math.min(d <= 3 ? .7 : d <= 4 ? 1.4 : d <= 5 ? 2.3 : 7.4, Math.max(.12, H));
          const bw = BLOCK / n * (.56 + random() * .16), bd = BLOCK * .866 / m * (.58 + random() * .16), tone = .74 + random() * .42, r0 = random();
          const kind = r0 < .09 ? 'prism' : r0 < .17 && bw < .4 ? 'round' : 'box';
          if (kind === 'box' && H > 2.6 && random() < .6) {
            // Setbacks: base + tower (+ a crown on the tallest) and sometimes a spire.
            const a1 = .55 + random() * .12, a2 = H > 3.8 ? .86 : 1;
            part(key, 'box', x, z, rot, bw, bd, 0, H * a1, tone);
            part(key, 'box', x, z, rot, bw * .68, bd * .68, H * a1, H * (a2 - a1), tone * 1.04);
            if (a2 < 1) part(key, 'box', x, z, rot, bw * .44, bd * .44, H * a2, H * (1 - a2), tone * 1.08);
            if (H > 4 && random() < .35) part(key, 'spire', x, z, 0, .045, .045, H, .3 + random() * .7, 1.2);
          } else {
            part(key, kind, x, z, rot, bw, bd, 0, H, tone);
            // Roof machinery on some low and mid-rise roofs.
            if (kind === 'box' && random() < .12) {
              const ox = (random() - .5) * bw * .5, oz = (random() - .5) * bd * .5, c = Math.cos(rot), s1 = Math.sin(rot);
              part(key, 'box', x + ox * c + oz * s1, z - ox * s1 + oz * c, rot, bw * (.2 + random() * .18), bd * (.2 + random() * .18), H, .035 + random() * .07, tone * 1.1);
            }
          }
        }
      }
    });
    const byHex = new Map(), meshes = {};
    for (const kind of Object.keys(GEO)) {
      const list = specs.filter(b => b.kind === kind); if (!list.length) continue;
      const mesh = castShadows(new T.InstancedMesh(GEO[kind], kind === 'tree' || kind === 'pine' ? treeMat : buildMat, list.length)); meshes[kind] = mesh;
      list.forEach((b, i) => { b.mesh = mesh; b.index = i; b.base = kind === 'tree' || kind === 'pine' ? CITY.tree : CITY.build; mesh.setColorAt(i, color.setHex(b.base).multiplyScalar(b.tone)); });
    }
    const meshList = Object.values(meshes);
    specs.forEach(b => {
      // `rise` is the transmorph wave (0..1), independent from `k` (hex free or occupied); `wave` orders it from the centre out.
      if (!byHex.has(b.key)) { const [q, r] = b.key.split(',').map(Number); byHex.set(b.key, { k: 1, rise: 1, wave: hexDistance(q, r) / GRID * .88 + random() * .12, items: [] }); }
      b.group = byHex.get(b.key); b.group.items.push(b);
    });
    const flushBuildings = (colors = false) => { for (const m of meshList) { m.instanceMatrix.needsUpdate = true; if (colors) m.instanceColor.needsUpdate = true; } markDirty(); };
    function writeBuilding(b, k) {
      const kk = k * b.group.rise, hh = Math.max(.0001, b.h * kk); dummy.position.set(b.x, TILE_H + b.h0 * kk + hh / 2, b.z); dummy.rotation.set(0, b.rot, 0); dummy.scale.set(b.w, hh, b.d); dummy.updateMatrix(); b.mesh.setMatrixAt(b.index, dummy.matrix);
    }
    specs.forEach(b => writeBuilding(b, 1)); meshList.forEach(m => s.add(m));
    function setHexBuildings(key, target, animate) {
      const group = byHex.get(key); if (!group || group.target === target) return; group.target = target;
      const from = group.k, apply = k => { group.k = k; group.items.forEach(b => writeBuilding(b, k)); flushBuildings(); };
      if (!animate) { apply(target); return; }
      tween(650, p => apply(from + (target - from) * (1 - Math.pow(1 - p, 3))));
    }
    // Buildings resurging after the transmorph back to the city: a wave from the centre to the edge, each building with a small
    // overshoot and a ring running ahead of the wave.
    let riseRun = null;
    const writeAllBuildings = () => { for (const g of byHex.values()) g.items.forEach(b => writeBuilding(b, g.k)); flushBuildings(); };
    function finishRise() { if (!riseRun) return; const r = riseRun; cancelTween(r); r.step(1); r.done(); }
    function sinkCity() { finishRise(); for (const g of byHex.values()) g.rise = 0; writeAllBuildings(); invalidate(); }
    // While it grows, each building is a cold white hologram that settles into its own charcoal tone once it is standing.
    const holo = new T.Color(0xd5e4ea).multiplyScalar(1.25);
    function tintBuildings(local) {
      for (const g of byHex.values()) { const lp = local ? local(g) : 1, mix = 1 - Math.min(1, Math.max(0, (lp - .15) / .85)); for (const b of g.items) b.mesh.setColorAt(b.index, color.setHex(b.base).multiplyScalar(b.tone).lerp(holo, mix * mix)); }
      for (const m of meshList) m.instanceColor.needsUpdate = true;
    }
    // Fold wave (setShape): a band of hologram light at p (0 = the squad, 1 = the coast) runs over the buildings; null settles them.
    function foldWave(p) { if (riseRun) return; tintBuildings(p == null ? undefined : g => Math.min(1, Math.abs(g.wave - p) / .2)); invalidate(); }
    function riseCity(duration) {
      finishRise(); const spread = .55, grow = k => k >= 1 ? 1 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      const local = p => g => Math.max(0, Math.min(1, (p - g.wave * spread) / (1 - spread)));
      riseRun = tween(duration, p => {
        const at = local(p); for (const g of byHex.values()) g.rise = grow(at(g));
        writeAllBuildings(); tintBuildings(at);
      }, () => { riseRun = null; for (const g of byHex.values()) g.rise = 1; writeAllBuildings(); tintBuildings(); });
      pulseAt({ q: 0, r: 0 }, { duration: duration * .75, grow: GRID * 2.1, opacity: .85 });
    }

    // Agent plazas, selection ring, hover outline, radar sweep, links.
    const hexLine = (radius, y, mat, seg = 1) => { const g = new T.BufferGeometry().setFromPoints(hexRing(radius, y, seg)); return new T.LineLoop(g, mat); };
    const plazaGeo = new T.CylinderGeometry(.9, .93, .2, 6);
    const plazas = new Map();
    /* Agents' slots, vivid against the charcoal city: an electric blue body that lights itself, a rim above the bloom threshold
       (HDR colour, so it glows like neon), an outer line and a soft pool of light on the ground. Handoffs keep the purple rims. */
    const AGENT_BLUE = themed({ blue: 0x29c8ff }, THEME.agent).blue, hdr = (hex, k) => new T.Color(hex).multiplyScalar(k);
    const rimColor = () => hdr(linkMode ? C.purple : AGENT_BLUE, 2.6);
    const rimMat = () => new T.LineBasicMaterial({ color: rimColor(), transparent: true, opacity: 1 });
    const poolTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), grd = g.createRadialGradient(64, 64, 18, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,.75)'); grd.addColorStop(.55, 'rgba(255,255,255,.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(cv); })();
    const poolGeo = new T.PlaneGeometry(3, 3, 6, 6).rotateX(-Math.PI / 2);
    function addPlaza(a) {
      const group = new T.Group(), w = hexToWorld(a.hex.q, a.hex.r);
      const body = castShadows(new T.Mesh(plazaGeo, new T.MeshStandardMaterial({ color: 0x063a58, roughness: .42, metalness: .25, emissive: 0x0a86e0, emissiveIntensity: .85 })));
      body.position.y = TILE_H + .1; group.add(body);
      const rim = hexLine(.9, PLAZA_H + .004, rimMat()); group.add(rim);
      const glow = hexLine(1.02, TILE_H + .01, new T.LineBasicMaterial({ color: hdr(AGENT_BLUE, 1.6), transparent: true, opacity: .6 })); group.add(glow);
      const pool = new T.Mesh(poolGeo, new T.MeshBasicMaterial({ map: poolTex, color: hdr(AGENT_BLUE, 1.15), transparent: true, opacity: .45, blending: T.AdditiveBlending, depthWrite: false }));
      pool.position.y = TILE_H + .006; group.add(pool);
      group.position.set(w.x, 0, w.z); s.add(group);
      const p = { group, body, rim, glow, hex: { ...a.hex } }; plazas.set(a.id, p); return p;
    }
    function removePlaza(id) { const p = plazas.get(id); if (!p) return; s.remove(p.group); p.group.traverse(o => { o.geometry && o.geometry !== plazaGeo && o.geometry !== poolGeo && o.geometry.dispose(); o.material && o.material.dispose(); }); plazas.delete(id); }
    const selRing = new T.Mesh(new T.RingGeometry(1.02, 1.1, 6, 1, Math.PI / 6), new T.MeshBasicMaterial({ color: hdr(AGENT_BLUE, 2), transparent: true, opacity: .8, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    const selBlue = hdr(AGENT_BLUE, 2), selPurple = hdr(C.purple, 2);
    selRing.rotation.x = -Math.PI / 2; selRing.visible = false; s.add(selRing);
    const hoverGroup = new T.Group(); hoverGroup.visible = false; s.add(hoverGroup);
    const hoverLineMat = new T.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: .95 });
    hoverGroup.add(hexLine(.92, TILE_H + .02, hoverLineMat));
    const hoverFill = new T.Mesh(new T.CylinderGeometry(.9, .9, .02, 6), new T.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .14, blending: T.AdditiveBlending, depthWrite: false }));
    hoverFill.position.y = TILE_H + .012; hoverGroup.add(hoverFill);
    const sweep = hexLine(1, .2, new T.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0 }), 16); s.add(sweep);
    // Outline of the clicked free slot (pickedHex), whose buildings went down.
    const pickGroup = new T.Group(); pickGroup.visible = false; s.add(pickGroup);
    pickGroup.add(hexLine(.9, TILE_H + .022, new T.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: .8 })));
    pickGroup.add(hexLine(.97, TILE_H + .02, new T.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: .28 })));
    const linksGroup = new T.Group(); s.add(linksGroup);
    const packets = [];

    /** Arc tubes + travelling packets between two world points (shared by both views). */
    // Transmission signal: a bright head with a fading tail on a transparent strip, repeated along each link and scrolled from
    // the sender to the receiver (uv.x of the tube runs along the curve). Each link scrolls its own clone (same image).
    const signalTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 4; const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 256, 0);
      [[0, 0], [.4, 0], [.62, .14], [.8, .5], [.9, 1], [.915, .25], [.94, 0], [1, 0]].forEach(([at, a]) => grd.addColorStop(at, `rgba(255,255,255,${a})`));
      g.fillStyle = grd; g.fillRect(0, 0, 256, 4); const t = new T.CanvasTexture(cv); t.wrapS = T.RepeatWrapping; return t;
    })();
    function buildArcs(group, packetList, list, pointOf, lift) {
      group.children.slice().forEach(o => { group.remove(o); o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }); packetList.length = 0;
      const map = new Map(scene.map(a => [a.id, a]));
      for (const l of list) {
        const a = map.get(l.from), b = map.get(l.to); if (!a || !b || a.id === b.id) continue;
        const A = pointOf(a), B = pointOf(b); if (!A || !B) continue;
        const len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(.5); mid.y += lift(len);
        const curve = new T.QuadraticBezierCurve3(A, mid, B), relevant = l.from === selected || l.to === selected;
        const col = l.tone ? RUN_TONE[l.tone] : l.active ? (linkMode ? 0xbd93e9 : 0x5fd4ed) : linkMode ? (relevant ? 0xa77ad6 : 0x67518a) : (relevant ? 0x76c4d6 : 0x3b7487);
        const radius = l.active ? .045 : relevant ? .034 : .024;
        group.add(new T.Mesh(new T.TubeGeometry(curve, 48, radius, 6, false), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: l.active ? 1 : relevant ? .92 : .6, depthWrite: false })));
        // The signals: brighter and faster on the active link, subtle on the others (HDR colour, so the city's bloom catches them).
        const sig = signalTex.clone(); sig.repeat.x = Math.max(1, Math.round(len / 2.4)); sig.needsUpdate = true;
        group.add(new T.Mesh(new T.TubeGeometry(curve, 64, radius * 1.8, 6, false), new T.MeshBasicMaterial({ map: sig, color: new T.Color(col).multiplyScalar(l.active ? 3.2 : relevant ? 2.4 : 1.6), transparent: true, opacity: l.active ? 1 : relevant ? .9 : .6, blending: T.AdditiveBlending, depthWrite: false })));
        packetList.push({ signal: sig, rate: (l.active ? 3 : relevant ? 1.6 : 1) * sig.repeat.x / Math.max(.5, len), phase: (packetList.length * .37) % 1 });
        const count = l.active ? 3 : relevant ? 1 : 0;
        for (let k = 0; k < count; k++) {
          const dot = new T.Mesh(new T.SphereGeometry(l.active ? .09 : .06, 10, 8), new T.MeshBasicMaterial({ color: 0xf1fcff, transparent: true, opacity: l.active ? 1 : .8, blending: T.AdditiveBlending, depthWrite: false }));
          group.add(dot); packetList.push({ dot, curve, offset: k / count, speed: l.active ? .45 : .22 });
        }
      }
      invalidate();
    }
    let linksKey = '';
    function rebuildLinks() {
      const key = JSON.stringify([links, runLinks, scene.map(a => [a.id, dragHexOf(a)]), selected, linkMode]);
      if (key === linksKey) return; linksKey = key;
      buildArcs(linksGroup, packets, [...links, ...runLinks], plazaPoint, len => .22 + len * .07);
    }

    function syncCity() {
      const list = scene.filter(a => inGrid(a.hex)), ids = new Set(list.map(a => a.id));
      for (const id of [...plazas.keys()]) if (!ids.has(id)) removePlaza(id);
      for (const a of list) {
        const h = dragHexOf(a); let p = plazas.get(a.id);
        if (!p) { p = addPlaza(a); if (!syncCity.first) riseIn(p); }
        if (p.hex.q !== h.q || p.hex.r !== h.r) { const w = hexToWorld(h.q, h.r); p.group.position.set(w.x, 0, w.z); p.hex = { ...h }; }
        p.rim.material.color.copy(rimColor());
      }
      // Buildings stay only on hexes nobody occupies (the squad's agents, plus any extra spots the app passes as occupied).
      const busy = new Set(occupied.keys()); list.forEach(a => busy.add(hexKey(dragHexOf(a))));
      // The slot the person clicked is cleared too, and outlined; it stops counting once an agent takes it.
      if (pickedHex && busy.has(hexKey(pickedHex))) pickedHex = null;
      if (pickedHex) { busy.add(hexKey(pickedHex)); const w = hexToWorld(pickedHex.q, pickedHex.r); pickGroup.position.set(w.x, 0, w.z); }
      pickGroup.visible = !!pickedHex;
      for (const key of byHex.keys()) setHexBuildings(key, busy.has(key) ? 0 : 1, !syncCity.first);
      syncCity.first = false; rebuildLinks(); markDirty(); invalidate();
    }
    syncCity.first = true;
    function riseIn(p) { p.group.position.y = -.35; tween(700, k => { p.group.position.y = -.35 * Math.pow(1 - k, 3); markDirty(); }); pulseAt(p.hex); }
    function pulseAt(h, { duration = 1300, grow = 2.6, opacity = 1, color = C.cyan } = {}) {
      const w = hexToWorld(h.q, h.r), ring = hexLine(1, PLAZA_H + .02, new T.LineBasicMaterial({ color, transparent: true, opacity }), Math.max(1, Math.ceil((1 + grow) / 1.4)));
      ring.position.set(w.x, 0, w.z); s.add(ring);
      tween(duration, k => { ring.scale.setScalar(1 + k * grow); ring.material.opacity = opacity * (1 - k); }, () => { s.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
    }

    /* ----- the run in the city (ops data from the app): every agent at work glows in the tone of what it does (breathing plaza,
       two rings going out, a light column); a call is a two-way link between caller and callee (runLinks, in rebuildLinks); every
       errand (briefing, baton, delivery for review) sends a comet along the arc from the sender to the receiver, which pulses. ----- */
    const RUN_TONE = themed({ work: 0x30c5e8, plan: 0xff5a66, wait: 0xe0a84a, call: 0x8fc6ff, baton: 0xad85dd, done: 0x7fcf9d }, THEME.run);
    const beamTex = (() => { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128; const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 128, 0, 0); grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(.25, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 4, 128); return new T.CanvasTexture(cv); })();
    const beamGeo = new T.CylinderGeometry(.42, .62, 3.4, 6, 10, true).translate(0, 1.7, 0);
    const runFx = new Map(), runGroup = new T.Group(); s.add(runGroup);
    const plazaPoint = a => { const h = dragHexOf(a); if (!inGrid(h)) return null; const w = hexToWorld(h.q, h.r); return new T.Vector3(w.x, PLAZA_H + .05, w.z); };
    function runFxDrop(id) {
      const fx = runFx.get(id); if (!fx) return; runGroup.remove(fx.group); fx.group.traverse(o => { if (o.geometry && o.geometry !== beamGeo) o.geometry.dispose(); o.material?.dispose(); }); runFx.delete(id);
      const p = plazas.get(id); if (p) p.body.material.emissiveIntensity = .85;
    }
    // crew: [{id, tone}] of the agents at work (an empty list ends every glow).
    function runSet(crew) {
      const want = new Map(crew.filter(c => plazas.has(c.id)).map(c => [c.id, c.tone || 'work']));
      for (const id of [...runFx.keys()]) if (!want.has(id)) runFxDrop(id);
      for (const [id, tone] of want) {
        let fx = runFx.get(id);
        if (!fx) {
          const group = new T.Group(), rings = [0, 1].map(() => { const r = hexLine(1, PLAZA_H + .03, new T.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 3); group.add(r); return r; });
          const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
          beam.position.y = PLAZA_H; group.add(beam); runGroup.add(group); fx = { group, rings, beam, tone: '' }; runFx.set(id, fx);
        }
        if (fx.tone !== tone) { fx.tone = tone; const c = RUN_TONE[tone] || RUN_TONE.work; fx.rings.forEach(r => r.material.color.copy(hdr(c, 2.4))); fx.beam.material.color.copy(hdr(c, 1.6)); }
      }
      invalidate();
    }
    function runAnimate(t, moving) {
      for (const [id, fx] of runFx) {
        const p = plazas.get(id); if (!p) { fx.group.visible = false; continue; }
        fx.group.visible = true; fx.group.position.copy(p.group.position);
        const slow = fx.tone === 'wait', k = moving ? .5 + .5 * Math.sin(t / (slow ? 900 : 380)) : .6;
        p.body.material.emissiveIntensity = .85 + k * (slow ? .35 : .95);
        fx.beam.material.opacity = .28 + k * .3;
        fx.rings.forEach((r, i) => { const ph = moving ? ((t / (slow ? 2600 : 1500)) + i * .5) % 1 : .35 + i * .3; r.scale.setScalar(1 + ph * 1.5); r.material.opacity = .95 * (1 - ph); });
      }
    }
    // A comet from one agent's plaza to another's along the same arc as their link; the receiver pulses when it lands.
    function runBurst(fromId, toId, tone) {
      const a = scene.find(x => x.id === fromId), b = scene.find(x => x.id === toId), A = a && plazaPoint(a), B = b && plazaPoint(b); if (!A || !B || a.id === b.id) return;
      const len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(.5); mid.y += .22 + len * .07;
      const curve = new T.QuadraticBezierCurve3(A, mid, B), col = RUN_TONE[tone] || RUN_TONE.work, tex = signalTex.clone(); tex.needsUpdate = true;
      const tube = new T.Mesh(new T.TubeGeometry(curve, 64, .1, 6, false), new T.MeshBasicMaterial({ map: tex, color: hdr(col, 1.8), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      const head = new T.Mesh(new T.SphereGeometry(.15, 12, 10), new T.MeshBasicMaterial({ color: hdr(col, 1.15), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      runGroup.add(tube, head); pulseAt(a.hex, { duration: 700, grow: 1.4, opacity: .8, color: hdr(col, 2) });
      // u of the texture head = .9 - offset, so offset .9 -> -.1 carries one head (and its tail) from A to B.
      tween(1300 + len * 45, k => { const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; tex.offset.x = .9 - e; curve.getPoint(e, head.position); head.scale.setScalar(1 + Math.sin(k * Math.PI) * .5); }, () => {
        runGroup.remove(tube, head); tube.geometry.dispose(); tube.material.dispose(); tex.dispose(); head.geometry.dispose(); head.material.dispose();
        if (inGrid(b.hex)) pulseAt(dragHexOf(b), { duration: 1100, grow: 2.2, color: hdr(col, 2) });
      });
    }

    /* ----- office scene (built lazily on first use) -----
       Five rooms on a graphite plate, tall outer walls in cutaway (applyCamera shows only the two whose inner face looks at the
       camera, so a 45° turn never hides the room), a night skyline in the north and south windows, and detailed workstations:
       desk with drawers, L privacy screen, monitor on a stand, keyboard, mouse, mug, lamp and a swivel chair. Furniture parts are
       batched by geometry + material into InstancedMeshes (unit boxes scaled per instance). The key light casts soft shadows that
       are rendered only when office.shadowDirty (build, walls shown, quality); the lamp of the running desk lights up. */
    let office = null;
    // Canvas textures, drawn once: night skyline (windows), code on the screens, a soft radial glow (lamp).
    function skylineTexture() {
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 160; const g = cv.getContext('2d'), r = rng(3307);
      const sky = g.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, '#0a0e11'); sky.addColorStop(.65, '#16212a'); sky.addColorStop(1, '#2a3a44');
      g.fillStyle = sky; g.fillRect(0, 0, 2048, 160);
      for (let i = 0; i < 170; i++) { g.fillStyle = `rgba(222,232,238,${(.25 + r() * .6).toFixed(2)})`; g.fillRect(r() * 2048, r() * 80, 1.3, 1.3); }
      const mx = 1480, my = 36, halo = g.createRadialGradient(mx, my, 8, mx, my, 54);
      halo.addColorStop(0, 'rgba(214,228,234,.28)'); halo.addColorStop(1, 'rgba(214,228,234,0)'); g.fillStyle = halo; g.fillRect(mx - 60, my - 60, 120, 120);
      g.save(); g.beginPath(); g.arc(mx, my, 12, 0, Math.PI * 2); g.clip(); g.fillStyle = '#e4ecee'; g.fillRect(mx - 14, my - 14, 28, 28);
      g.fillStyle = '#0c1115'; g.beginPath(); g.arc(mx + 6, my - 4, 11, 0, Math.PI * 2); g.fill(); g.restore();
      // Two rows of buildings (far: lighter and lower; near: darker and taller) with a few lit windows.
      for (const [hMin, hMax, tone, lit] of [[34, 86, '#1d2830', .08], [44, 124, '#0f161b', .14]]) {
        for (let x = -12; x < 2048;) {
          const w = 22 + r() * 58, h = hMin + r() * (hMax - hMin), top = 160 - h;
          g.fillStyle = tone; g.fillRect(x, top, w, h); if (r() < .22) g.fillRect(x + w * .45, top - 12 - r() * 12, 2, 24);
          for (let wy = top + 6; wy < 154; wy += 7) for (let wx = x + 4; wx < x + w - 5; wx += 6) if (r() < lit) { g.fillStyle = r() < .86 ? 'rgba(206,232,240,.95)' : 'rgba(240,220,176,.9)'; g.fillRect(wx, wy, 2.2, 2.6); }
          x += w + (r() < .3 ? 4 + r() * 12 : 0);
        }
      }
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = T.RepeatWrapping; return tex;
    }
    function screenTexture() {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; const g = cv.getContext('2d'), r = rng(5150);
      g.fillStyle = '#0a1013'; g.fillRect(0, 0, 256, 144); g.fillStyle = '#162228'; g.fillRect(0, 0, 256, 11); g.fillRect(0, 11, 50, 133);
      for (let y = 19; y < 136; y += 9) { g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(8, y, 14 + r() * 22, 3); }
      for (let y = 20, ind = 0; y < 136; y += 9) {
        if (r() < .12) { ind = Math.max(0, ind - 1); continue; }
        ind = Math.max(0, Math.min(4, ind + (r() < .3 ? 1 : r() < .3 ? -1 : 0)));
        for (let x = 60 + ind * 10, p = 1 + Math.floor(r() * 3); p > 0 && x < 236; p--) { const w = Math.min(10 + r() * 44, 244 - x); g.fillStyle = ['rgba(255,255,255,.6)', 'rgba(255,255,255,.32)', 'rgba(150,235,255,.9)'][Math.floor(r() * 3)]; g.fillRect(x, y, w, 4); x += w + 5; }
      }
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; return tex;
    }
    function glowTexture() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.22, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; return tex;
    }
    // War Room (red): wall screens (radar, bars, countdown, line chart, text rows) and the tactical map of the crisis table.
    function warScreenTexture(seed) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d'), r = rng(seed);
      g.fillStyle = '#14070a'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#2c0d12'; g.fillRect(0, 0, 512, 18);
      for (let x = 8; x < 200; x += 34 + r() * 26) { g.fillStyle = 'rgba(255,120,130,.7)'; g.fillRect(x, 6, 14 + r() * 18, 5); }
      g.strokeStyle = 'rgba(255,70,85,.12)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= 512; x += 24) { g.moveTo(x, 18); g.lineTo(x, 256); }
      for (let y = 18; y <= 256; y += 24) { g.moveTo(0, y); g.lineTo(512, y); }
      g.stroke();
      const cx = 112, cy = 140, R = 92, a0 = r() * Math.PI * 2; g.strokeStyle = 'rgba(255,80,95,.55)'; g.lineWidth = 1.5;
      for (const k of [1, .66, .33]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
      g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      g.fillStyle = 'rgba(255,60,75,.3)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a0 + .75); g.closePath(); g.fill();
      for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = r() * R * .9; g.fillStyle = i < 2 ? '#ffd2d6' : 'rgba(255,90,105,.9)'; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, i < 2 ? 4 : 2.5, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 9; i++) { const h = 20 + r() * 78; g.fillStyle = i === 4 ? 'rgba(255,205,210,.92)' : 'rgba(255,70,85,.75)'; g.fillRect(232 + i * 14, 132 - h, 9, h); }
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,${110 + i * 14},${120 + i * 12},${(.35 + r() * .4).toFixed(2)})`; g.fillRect(232, 156 + i * 15, 40 + r() * 80, 6); }
      g.fillStyle = 'rgba(255,140,150,.8)'; g.font = '600 12px monospace'; g.fillText('OPERAÇÃO', 380, 44);
      g.fillStyle = 'rgba(255,205,210,.96)'; g.font = '700 40px monospace'; g.fillText(`T-${String(1 + Math.floor(r() * 9)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, 376, 92);
      g.strokeStyle = 'rgba(255,150,160,.9)'; g.lineWidth = 2; g.beginPath();
      for (let x = 376, y = 200; x <= 500; x += 8) { y = Math.max(150, Math.min(240, y + (r() - .5) * 28)); if (x === 376) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; return tex;
    }
    function warMapTexture() {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024; const g = cv.getContext('2d'), r = rng(9091);
      g.fillStyle = '#16070a'; g.fillRect(0, 0, 256, 1024);
      g.strokeStyle = 'rgba(255,70,85,.16)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= 256; x += 32) { g.moveTo(x, 0); g.lineTo(x, 1024); }
      for (let y = 0; y <= 1024; y += 32) { g.moveTo(0, y); g.lineTo(256, y); }
      g.stroke();
      g.strokeStyle = 'rgba(255,90,105,.32)';
      for (let i = 0; i < 10; i++) { const x = r() * 256, y = r() * 1024, rx = 26 + r() * 60, ry = 40 + r() * 110, rot = r() * Math.PI; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, y, rx * (1 - k * .28), ry * (1 - k * .28), rot, 0, Math.PI * 2); g.stroke(); } }
      // A dashed route that starts and ends at the centre, so the scrolling map wraps without a jump.
      g.setLineDash([10, 8]); g.strokeStyle = 'rgba(255,170,178,.85)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(128, 0);
      for (let y = 64, x = 128; y <= 1024; y += 64) { x = y === 1024 ? 128 : Math.max(30, Math.min(226, x + (r() - .5) * 90)); g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        const x = 24 + r() * 208, y = 30 + r() * 964; g.strokeStyle = 'rgba(255,110,120,.95)'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.moveTo(x - 15, y); g.lineTo(x + 15, y); g.moveTo(x, y - 15); g.lineTo(x, y + 15); g.stroke();
        g.fillStyle = '#ffd2d6'; g.fillRect(x - 2, y - 2, 4, 4);
      }
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.wrapT = T.RepeatWrapping; return tex;
    }
    // War Room look per operation state: screens and map tint, LED strip opacity, red light intensity (animate pulses 'live').
    const WAR_LOOK = { idle: { screen: 0x5a1a20, map: 0x4a161b, strip: .25, light: 1 }, live: { screen: 0xffffff, map: 0xffd0d4, strip: .8, light: 7 }, paused: { screen: 0xb06068, map: 0x9a4048, strip: .45, light: 3 } };
    // Workstation details in the desk's own frame: the person faces -z (monitor side), +x is their right.
    const SCREEN_TILT = -.08, LAMP_HEAD = [-.5, 1.06, .07], LAMP_POOL = [-.3, .766, .1];
    function buildOffice() {
      const o = { scene: new T.Scene(), slotMarks: new Map(), links: new T.Group(), packets: [], key: '', walls: [], shadowDirty: true, lampAt: new Map() };
      const os = o.scene, wr = rng(8812);
      o.camera = new T.OrthographicCamera(-10, 10, 10, -10, -200, 400);
      os.add(new T.HemisphereLight(0xc4e0ec, 0x0e171b, 1.8));
      // Key light from the back right: soft shadows fall toward the front left, like the reference.
      const key = new T.DirectionalLight(0xe8f3f8, 3); key.position.set(7, 18, -11); os.add(key);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 3; key.shadow.bias = -.0005; key.shadow.normalBias = .02;
      Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); key.shadow.camera.updateProjectionMatrix();
      const fill = new T.DirectionalLight(0x3a8fb0, .75); fill.position.set(-8, 7, 10); os.add(fill);
      os.add(new T.AmbientLight(0x22343c, 1.05));
      const mat = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness: .85, metalness: .1, ...extra });
      // Batches: put() records a part (geometry + material, local transform under `frame`); one InstancedMesh per batch at the end.
      const UB = new T.BoxGeometry(1, 1, 1), UC = new T.CylinderGeometry(1, 1, 1, 20), US = new T.SphereGeometry(1, 12, 9), CONE = new T.CylinderGeometry(.25, 1, 1, 20), frame = new T.Matrix4(), batches = new Map();
      const at = (x, z, yaw = 0) => frame.makeRotationY(yaw).setPosition(x, 0, z);
      function put(geo, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, tint = 0xffffff) {
        dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        const k = geo.uuid + m.uuid; let b = batches.get(k); if (!b) batches.set(k, b = { geo, m, list: [] });
        b.list.push([new T.Matrix4().multiplyMatrices(frame, dummy.matrix), tint]);
      }
      const box = (m, ...a) => put(UB, m, ...a), local = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(frame);
      const topMat = mat(0x56676f, { roughness: .6 }), bodyMat = mat(0x3a4a52), baseMat = mat(0x1f2b31), frontMat = mat(0x2b3a41), metalMat = mat(0x6d7f87, { metalness: .6, roughness: .4 });
      const darkMat = mat(0x141c20, { roughness: .6 }), keysMat = mat(0x243036), fabricMat = mat(0x263339, { roughness: 1 }), trimMat = mat(0x3d4f57), chairMat = mat(0x2e3c43, { roughness: .9 });
      const mugMat = mat(0xffffff, { roughness: .5 }), paperMat = mat(0x8d9aa0, { roughness: .95 }), potMat = mat(0x2e3a3f), plantMat = mat(0x2b423b), tableMat = mat(0x46575f, { roughness: .55 });
      const rugMat = mat(0x111a1f, { roughness: 1 }), plateMat = mat(0x141f25), glassPlateMat = mat(0x17252c), partMat = mat(0x2a3940), warPlateMat = mat(0x1d1114), warPartMat = mat(0x2c1c20);
      const glassMat = new T.MeshStandardMaterial({ color: 0x9fd2e2, transparent: true, opacity: .12, roughness: .1, metalness: .4, depthWrite: false });
      const warGlassMat = new T.MeshStandardMaterial({ color: 0xff6670, transparent: true, opacity: .12, roughness: .1, metalness: .4, depthWrite: false });
      const war = ROOM_BY_CODE.get('WAR'), warScreens = [];
      // Floor slab + fine grid.
      const W = OFFICE.x1 - OFFICE.x0, D = OFFICE.z1 - OFFICE.z0, cx = (OFFICE.x0 + OFFICE.x1) / 2, cz = (OFFICE.z0 + OFFICE.z1) / 2, H = OFFICE.wallH;
      const slab = new T.Mesh(new T.BoxGeometry(W + 1.2, .3, D + 1.2), mat(0x10181c)); slab.position.set(cx, -.15, cz); slab.receiveShadow = true; os.add(slab);
      const grid = [];
      for (let x = Math.ceil(OFFICE.x0); x <= OFFICE.x1; x++) grid.push(x, .047, OFFICE.z0, x, .047, OFFICE.z1);
      for (let z = OFFICE.z0; z <= OFFICE.z1; z++) grid.push(OFFICE.x0, .047, z, OFFICE.x1, .047, z);
      const gridGeo = new T.BufferGeometry(); gridGeo.setAttribute('position', new T.Float32BufferAttribute(grid, 3));
      os.add(new T.LineSegments(gridGeo, new T.LineBasicMaterial({ color: 0x1b272d, transparent: true, opacity: .5 })));
      const slabEdge = new T.LineLoop(new T.BufferGeometry().setFromPoints([[OFFICE.x0 - .6, OFFICE.z0 - .6], [OFFICE.x1 + .6, OFFICE.z0 - .6], [OFFICE.x1 + .6, OFFICE.z1 + .6], [OFFICE.x0 - .6, OFFICE.z1 + .6]].map(([x, z]) => new T.Vector3(x, .006, z))), new T.LineBasicMaterial({ color: 0x2b3d46 }));
      os.add(slabEdge);
      // Outer walls: a low kerb on every side; the tall wall (with its cap, and the skyline window on north/south) is a group
      // that applyCamera shows only when its inner face looks at the camera.
      const wallMat = mat(0x1a2429), capMat = mat(0x34454d), kerbMat = mat(0x223038), frameMat = mat(0x2a3840, { metalness: .4, roughness: .5 }), sky = skylineTexture();
      for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const horizontal = !!nz, len = (horizontal ? W : D) + .4, px = nx ? (nx > 0 ? OFFICE.x0 - .1 : OFFICE.x1 + .1) : cx, pz = nz ? (nz > 0 ? OFFICE.z0 - .1 : OFFICE.z1 + .1) : cz;
        const slabAt = (l, h, t, y, m, off = 0) => { const s = new T.Mesh(new T.BoxGeometry(horizontal ? l : t, h, horizontal ? t : l), m); s.position.set(px + nx * off, y, pz + nz * off); s.castShadow = s.receiveShadow = true; return s; };
        os.add(slabAt(len, .14, .2, .07, kerbMat));
        const g = new T.Group(); g.add(slabAt(len, H, .2, H / 2, wallMat), slabAt(len, .05, .26, H + .025, capMat), slabAt(len, .09, .03, .045 + .14, trimMat, .115));
        if (horizontal) {
          // Window band with the skyline (up to the War Room), mullions every ~1.6 and a sill.
          const wx0 = OFFICE.x0 + .4, wx1 = war ? war.x - .3 : OFFICE.x1 - .4, wl = wx1 - wx0, wcx = (wx0 + wx1) / 2, y0 = .9, wh = 1.24, tex = nz > 0 ? sky : sky.clone(); if (nz < 0) { tex.offset.x = .43; tex.needsUpdate = true; }
          const pane = new T.Mesh(new T.PlaneGeometry(wl, wh), new T.MeshBasicMaterial({ map: tex, toneMapped: false })); pane.position.set(wcx, y0 + wh / 2, pz + nz * .104); pane.rotation.y = nz > 0 ? 0 : Math.PI; g.add(pane);
          const n = Math.round(wl / 1.6), bars = new T.InstancedMesh(UB, frameMat, n + 3); let i = 0;
          const bar = (x, y, sx, sy) => { dummy.position.set(x, y, pz + nz * .125); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, .05); dummy.updateMatrix(); bars.setMatrixAt(i++, dummy.matrix); };
          for (let k = 0; k <= n; k++) bar(wx0 + wl * k / n, y0 + wh / 2, .05, wh);
          bar(wcx, y0, wl + .05, .06); bar(wcx, y0 + wh, wl + .05, .05); bars.castShadow = true; g.add(bars);
          // The War Room's stretch of the north wall carries its screens (one wide, two narrow) instead of the window.
          if (nz > 0 && war) for (const [dx, y, w, h, seed] of [[0, 1.5, 3.2, 1.55, 71], [-2.45, 1.45, 1.3, 1, 72], [2.45, 1.45, 1.3, 1, 73]]) {
            const x = war.x + war.w / 2 + dx, bez = new T.Mesh(new T.BoxGeometry(w + .1, h + .1, .05), darkMat); bez.position.set(x, y, OFFICE.z0 + .025); g.add(bez);
            const scr = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: warScreenTexture(seed), color: 0x5a1a20, toneMapped: false })); scr.position.set(x, y, OFFICE.z0 + .052); g.add(scr); warScreens.push(scr.material);
          }
        }
        os.add(g); o.walls.push({ g, nx, nz });
      }
      // Rooms: floor plate, outline, low partitions with a door gap on the corridor side (the War Room's is on its west side, at the
      // end of the corridor; none on the outer walls), glass on some. The War Room is tinted red.
      const seen = new Set();
      for (const room of ROOMS) {
        const plate = new T.Mesh(new T.BoxGeometry(room.w - .12, .04, room.d - .12), room.war ? warPlateMat : room.glass ? glassPlateMat : plateMat); plate.position.set(room.x + room.w / 2, .02, room.z + room.d / 2); plate.receiveShadow = true; os.add(plate);
        const pts = [[room.x + .06, room.z + .06], [room.x + room.w - .06, room.z + .06], [room.x + room.w - .06, room.z + room.d - .06], [room.x + .06, room.z + room.d - .06]].map(([x, z]) => new T.Vector3(x, .045, z));
        os.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: room.war ? 0x8a2a32 : 0x24505e, transparent: true, opacity: .75 })));
        const corridorSide = room.z < 0 ? room.z + room.d : room.z, door = room.x + room.w / 2;
        const walls = [[room.x, room.z, room.x + room.w, room.z], [room.x, room.z + room.d, room.x + room.w, room.z + room.d], [room.x, room.z, room.x, room.z + room.d], [room.x + room.w, room.z, room.x + room.w, room.z + room.d]];
        for (const [x1, z1, x2, z2] of walls) {
          const horizontal = z1 === z2, k = [x1, z1, x2, z2].join();
          // The War Room's west wall runs the full depth, so the east walls of the rooms beside it are not drawn twice.
          if (seen.has(k) || (horizontal ? z1 === OFFICE.z0 || z1 === OFFICE.z1 : x1 === OFFICE.x0 || x1 === OFFICE.x1 || (war && room !== war && x1 === war.x))) continue; seen.add(k);
          const segs = horizontal && z1 === corridorSide && !room.door ? [[x1, door - .8], [door + .8, x2]] : !horizontal && room.door === 'west' && x1 === room.x ? [[z1, -.8], [.8, z2]] : [[horizontal ? x1 : z1, horizontal ? x2 : z2]];
          for (const [a0, a1] of segs) {
            const len = a1 - a0; if (len <= .1) continue;
            const wall = new T.Mesh(new T.BoxGeometry(horizontal ? len : .08, .42, horizontal ? .08 : len), room.war ? warPartMat : partMat); wall.castShadow = wall.receiveShadow = true;
            wall.position.set(horizontal ? (a0 + a1) / 2 : x1, .21, horizontal ? z1 : (a0 + a1) / 2); os.add(wall);
            if (room.glass) { const g = new T.Mesh(new T.BoxGeometry(horizontal ? len : .03, 1.3, horizontal ? .03 : len), room.war ? warGlassMat : glassMat); g.position.set(wall.position.x, 1.07, wall.position.z); os.add(g); }
          }
        }
        if (room.table) {
          at(room.table.x, room.table.z);
          put(UC, rugMat, 0, .047, 0, 2.85, .01, 2.85); put(UC, darkMat, 0, .065, 0, .55, .03, .55); put(UC, baseMat, 0, .4, 0, .16, .7, .16);
          put(UC, tableMat, 0, .755, 0, 1.38, .05, 1.38); put(UC, topMat, 0, .782, 0, 1.33, .006, 1.33);
        }
        // One plant per room, in a free corner (back rooms: north-east, front rooms: south-west); none in the War Room.
        if (room.war) continue;
        const back = room.z < 0, px = back ? room.x + room.w - .5 : room.x + .5, pz = back ? room.z + .55 : room.z + room.d - .55, s = .9 + wr() * .2;
        at(px, pz); put(UC, potMat, 0, .19, 0, .19, .38, .19);
        put(US, plantMat, 0, .68 * s, 0, .3 * s, .3 * s, .3 * s); put(US, plantMat, .13, .55 * s, .09, .21, .21, .21); put(US, plantMat, -.11, .6 * s, -.1, .23, .23, .23);
      }
      // Workstations (desk, drawers, privacy screens, monitor, keyboard, mouse, mug, lamp) and their chairs.
      const desks = SLOTS.filter(sl => !sl.seat), MUG = [0x9aa7ab, 0x5c6b72, 0xc9d1d3, 0x3f5761];
      const screens = new T.InstancedMesh(new T.PlaneGeometry(.64, .36), new T.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }), desks.length);
      const chair = (x, z, yaw) => {
        at(x, z, yaw);
        box(chairMat, 0, .47, 0, .46, .07, .44); box(chairMat, 0, .8, .235, .44, .44, .05, .12); box(darkMat, 0, .58, .245, .06, .18, .03, .12);
        for (const s of [-1, 1]) { box(darkMat, s * .25, .6, .03, .03, .18, .03); box(chairMat, s * .25, .695, .03, .05, .025, .24); }
        put(UC, darkMat, 0, .27, 0, .028, .34, .028);
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + .3; box(darkMat, Math.cos(a) * .13, .06, Math.sin(a) * .13, .27, .03, .04, 0, -a); }
      };
      desks.forEach((sl, i) => {
        const yaw = sl.facing > 0 ? Math.PI : 0; at(sl.x, sl.z, yaw);
        box(bodyMat, 0, .735, 0, 1.4, .04, .72); box(topMat, 0, .758, 0, 1.38, .006, .7);
        box(baseMat, .46, .355, 0, .42, .71, .64); box(baseMat, -.67, .355, 0, .04, .71, .64); box(baseMat, 0, .5, -.3, 1.24, .32, .025);
        for (let k = 0; k < 3; k++) { const y = .13 + k * .205; box(frontMat, .46, y, .325, .38, .185, .014); box(metalMat, .46, y + .055, .337, .12, .014, .014); }
        box(fabricMat, 0, .975, -.38, 1.48, .43, .04); box(trimMat, 0, 1.2, -.38, 1.5, .022, .056);
        box(fabricMat, -.72, .93, -.02, .04, .33, .72); box(trimMat, -.72, 1.105, -.02, .056, .022, .72);
        box(darkMat, 0, .766, -.2, .24, .014, .15); box(darkMat, 0, .87, -.235, .045, .2, .04); box(darkMat, 0, 1.09, -.21, .68, .4, .03, SCREEN_TILT);
        dummy.position.set(0, 1.09 - Math.sin(SCREEN_TILT) * .017, -.21 + Math.cos(SCREEN_TILT) * .017); dummy.rotation.set(SCREEN_TILT, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        screens.setMatrixAt(i, new T.Matrix4().multiplyMatrices(frame, dummy.matrix)); screens.setColorAt(i, color.setHex(0x16242a)); sl.screenIndex = i;
        box(darkMat, -.04, .768, .13, .44, .014, .14); box(keysMat, -.04, .776, .13, .41, .004, .115); box(darkMat, .3, .77, .15, .055, .02, .09);
        put(UC, mugMat, .5, .807, -.08 + wr() * .1, .038, .09, .038, 0, 0, 0, MUG[i % MUG.length]);
        if (wr() < .55) box(paperMat, .17, .765, -.03, .2, .01, .27, 0, (wr() - .5) * .6);
        // Lamp: base, lower arm leaning toward the person, upper arm, shade pointing down (the bulb lights up on the running desk).
        put(UC, darkMat, -.5, .771, -.2, .065, .02, .065); box(metalMat, -.5, .945, -.15, .022, .37, .022, .33); box(metalMat, -.5, 1.105, -.02, .022, .17, .022, 1.81);
        put(CONE, darkMat, -.5, 1.085, .07, .07, .08, .07, .25);
        o.lampAt.set(sl.id, { head: local(...LAMP_HEAD), pool: local(...LAMP_POOL) });
        const st = seatOf(sl); chair(st.x, st.z, yaw);
      });
      if (screens.instanceColor) screens.instanceColor.needsUpdate = true;
      os.add(screens); o.screens = screens;
      // Meeting chairs face the table.
      for (const sl of SLOTS) if (sl.seat) { const t = ROOM_BY_CODE.get(sl.room).table; chair(sl.x, sl.z, Math.atan2(-(t.x - sl.x), -(t.z - sl.z))); }
      // War Room: a long crisis table with the tactical map, chairs around it, red LED strips (table edge, floor perimeter with a
      // gap at the door) and two red point lights that always stay in the scene; syncOffice/animate drive them (WAR_LOOK).
      if (war) {
        const wx = war.x + war.w / 2, wz = war.z + war.d / 2, TW = 2, TL = 7.5, look = WAR_LOOK.idle;
        const stripMat = new T.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: look.strip, depthWrite: false, toneMapped: false });
        const mapTex = warMapTexture(), mapMat = new T.MeshBasicMaterial({ map: mapTex, color: look.map, toneMapped: false });
        at(wx, wz); box(baseMat, 0, .36, -TL / 2 + 1.4, .55, .7, 1.2); box(baseMat, 0, .36, TL / 2 - 1.4, .55, .7, 1.2); box(bodyMat, 0, .735, 0, TW, .05, TL);
        const map = new T.Mesh(new T.PlaneGeometry(TW - .16, TL - .16), mapMat); map.rotation.x = -Math.PI / 2; map.position.set(wx, .762, wz); os.add(map);
        const strip = (x, z, sx, sz, y = .07) => { const m = new T.Mesh(new T.BoxGeometry(sx, .04, sz), stripMat); m.position.set(x, y, z); os.add(m); };
        strip(wx - TW / 2, wz, .03, TL, .742); strip(wx + TW / 2, wz, .03, TL, .742); strip(wx, wz - TL / 2, TW + .03, .03, .742); strip(wx, wz + TL / 2, TW + .03, .03, .742);
        const xa = war.x + .22, xb = war.x + war.w - .22, za = war.z + .22, zb = war.z + war.d - .22;
        strip(xb, wz, .05, zb - za); strip(wx, za, xb - xa, .05); strip(wx, zb, xb - xa, .05); strip(xa, (za - .9) / 2, .05, -.9 - za); strip(xa, (zb + .9) / 2, .05, zb - .9);
        const face = (x, z) => chair(x, z, Math.atan2(-(wx - x), -(wz - z)));
        for (const dz of [-2.7, -.9, .9, 2.7]) { face(wx - TW / 2 - .5, wz + dz); face(wx + TW / 2 + .5, wz + dz); }
        face(wx, wz - TL / 2 - .55); face(wx, wz + TL / 2 + .55);
        const lights = [-4.5, 4.5].map(dz => { const l = new T.PointLight(0xff2a3a, look.light, 9, 1.4); l.position.set(wx, 2.1, wz + dz); os.add(l); return l; });
        o.war = { state: 'idle', screens: warScreens, map: mapMat, mapTex, strip: stripMat, lights };
      }
      for (const { geo, m, list } of batches.values()) {
        const mesh = new T.InstancedMesh(geo, m, list.length); mesh.castShadow = m !== rugMat; mesh.receiveShadow = true;
        list.forEach(([mx, tint], i) => { mesh.setMatrixAt(i, mx); if (m === mugMat) mesh.setColorAt(i, color.setHex(tint)); });
        os.add(mesh);
      }
      // Per-slot markers: floor ring (occupied desks, move mode) and a status LED (monitor bezel, or the table edge for a seat).
      const ledBox = new T.BoxGeometry(.035, .014, .012), ledDot = new T.SphereGeometry(.035, 10, 8);
      for (const sl of SLOTS) {
        const seat = seatOf(sl);
        const ring = new T.Mesh(new T.RingGeometry(.36, .42, 28), new T.MeshBasicMaterial({ color: 0x3b5561, transparent: true, opacity: .8, side: T.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(seat.x, .05, seat.z); ring.visible = false; os.add(ring);
        const led = new T.Mesh(sl.seat ? ledDot : ledBox, new T.MeshBasicMaterial({ color: C.green, toneMapped: false })); led.visible = false;
        if (sl.seat) { const t = ROOM_BY_CODE.get(sl.room).table, k = 1.2 / 2.1; led.position.set(t.x + (sl.x - t.x) * k, .8, t.z + (sl.z - t.z) * k); }
        else { at(sl.x, sl.z, sl.facing > 0 ? Math.PI : 0); led.position.copy(local(.28, .905, -.19)); led.rotation.y = sl.facing > 0 ? Math.PI : 0; }
        os.add(led); o.slotMarks.set(sl.id, { ring, led, slot: sl });
      }
      // The running desk's lamp: bulb, a camera-facing glow, a warm pool on the desk and one point light (always in the scene, so
      // switching it on never recompiles the materials).
      const glow = glowTexture();
      o.lamp = {
        bulb: new T.Mesh(new T.SphereGeometry(.03, 12, 8), new T.MeshBasicMaterial({ color: 0xfff3dc, toneMapped: false })),
        glow: new T.Mesh(new T.PlaneGeometry(1.25, 1.25), new T.MeshBasicMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })),
        pool: new T.Mesh(new T.CircleGeometry(.62, 32), new T.MeshBasicMaterial({ map: glow, color: 0xffc98a, transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })),
        light: new T.PointLight(0xffd29a, 0, 3.4, 2)
      };
      o.lamp.pool.rotation.x = -Math.PI / 2;
      for (const k of ['bulb', 'glow', 'pool']) { o.lamp[k].visible = false; os.add(o.lamp[k]); }
      os.add(o.lamp.light);
      // Hover and selection rings, plus the activity arcs.
      o.hover = new T.Mesh(new T.CircleGeometry(.5, 32), new T.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false }));
      o.hover.rotation.x = -Math.PI / 2; o.hover.visible = false; os.add(o.hover);
      o.sel = new T.Mesh(new T.RingGeometry(.5, .58, 36), new T.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .9, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
      o.sel.rotation.x = -Math.PI / 2; o.sel.visible = false; os.add(o.sel);
      os.add(o.links);
      o.life = new T.Group(); o.lifePackets = []; os.add(o.life); // office life arcs (meetings, visits)
      return o;
    }
    function syncOffice() {
      if (!office) return;
      const byDesk = new Map(scene.filter(a => SLOT_BY_ID.has(deskOf(a))).map(a => [deskOf(a), a]));
      for (const [id, m] of office.slotMarks) {
        const a = byDesk.get(id), other = occupiedDesks.get(id);
        const status = a ? (running.id === a.id ? (running.paused ? 'paused' : 'running') : 'ready') : null;
        // Rings only where someone sits (and on the free desks in move mode): empty desks stay quiet.
        m.ring.visible = !!(a || other || moving);
        m.ring.material.color.setHex(a ? (linkMode ? C.purple : C.cyan) : other ? 0x3b4b52 : C.cyan); m.ring.material.opacity = a ? .9 : other ? .6 : .5;
        m.led.visible = !!a; if (a) m.led.material.color.setHex(status === 'running' ? C.cyan : status === 'paused' ? C.amber : C.green);
        m.status = status;
        if (m.slot.screenIndex !== undefined) office.screens.setColorAt(m.slot.screenIndex, color.setHex(status === 'running' ? 0xe6fcff : status === 'paused' ? 0xa89a70 : a ? 0x6fb8c9 : 0x16242a));
      }
      if (office.screens.instanceColor) office.screens.instanceColor.needsUpdate = true;
      // The running agent's lamp (warm; dim amber while paused).
      const active = running.id && scene.find(a => a.id === running.id), spot = active && office.lampAt.get(deskOf(active)), L = office.lamp;
      for (const k of ['bulb', 'glow', 'pool']) L[k].visible = !!spot;
      if (spot) {
        const warm = running.paused ? C.amber : 0xffc98a;
        L.bulb.position.copy(spot.head); L.glow.position.copy(spot.head); L.pool.position.copy(spot.pool); L.light.position.copy(spot.head);
        L.glow.material.color.setHex(warm); L.pool.material.color.setHex(warm); L.glow.material.opacity = running.paused ? .3 : .55; L.pool.material.opacity = running.paused ? .22 : .4;
        L.light.color.setHex(running.paused ? C.amber : 0xffd29a); L.light.intensity = running.paused ? .5 : 1.4;
      } else L.light.intensity = 0;
      // War Room: dim red without an operation, lit while one is planned or runs (animate pulses it), steady while paused.
      const W = office.war, st = squadState(), warState = st === 'idle' ? 'idle' : st === 'paused' ? 'paused' : 'live';
      if (W && W.state !== warState) {
        const look = WAR_LOOK[W.state = warState];
        for (const m of W.screens) m.color.setHex(look.screen);
        W.map.color.setHex(look.map); W.strip.opacity = look.strip; for (const l of W.lights) l.intensity = look.light;
        labels.querySelector('[data-room="WAR"]')?.classList.toggle('live', warState === 'live');
      }
      // Office shows activity only: active operation hops, or recent handoffs in Handoffs mode.
      const list = links.filter(l => l.active || linkMode);
      const key = JSON.stringify([list, scene.map(a => [a.id, deskOf(a)]), selected, linkMode]);
      if (key !== office.key) { office.key = key; buildArcs(office.links, office.packets, list, a => { const sl = SLOT_BY_ID.get(deskOf(a)); if (!sl) return null; const seat = seatOf(sl); return new T.Vector3(seat.x, 1.3, seat.z); }, len => .8 + len * .12); }
      invalidate();
    }

    const v3 = new T.Vector3(), raycaster = new T.Raycaster(), groundPlane = new T.Plane(new T.Vector3(0, 1, 0), -TILE_H), floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3(), ndc = new T.Vector2();
    const flipAxis = new T.Vector3(), flipQ = new T.Quaternion(), flipPivot = new T.Vector3(), carryAxis = new T.Vector3(), carryQ = new T.Quaternion();
    const planetSphere = { center: new T.Vector3(0, -PLANET_R, 0), radius: PLANET_R + TILE_H }; // plain object: Ray.intersectSphere reads centre/radius
    // Orbiting the camera (instead of turning the scene) keeps the lights, the projection and the picking consistent.
    function orbit(c, c0, y = 0) {
      if (!pose.flip) return;
      flipAxis.set(Math.cos(c0.theta), 0, -Math.sin(c0.theta)); flipQ.setFromAxisAngle(flipAxis, -pose.flip); flipPivot.set(c0.tx, y, c0.tz);
      c.position.sub(flipPivot).applyQuaternion(flipQ).add(flipPivot); c.quaternion.premultiply(flipQ);
    }
    function applyCamera() {
      if (mode === 'office') {
        if (!office) office = buildOffice();
        const c = office.camera, aspect = width / height, h = ocam.viewH / 2;
        c.left = -h * aspect; c.right = h * aspect; c.top = h; c.bottom = -h; c.zoom = ocam.zoom;
        const dist = 80, ce = Math.cos(ocam.elev);
        c.position.set(ocam.tx + dist * ce * Math.sin(ocam.theta), dist * Math.sin(ocam.elev), ocam.tz + dist * ce * Math.cos(ocam.theta));
        c.lookAt(ocam.tx, 0, ocam.tz); orbit(c, ocam); c.setViewOffset(width, height, -(ocam.offsetX + insetShift()), -ocam.offsetY, width, height); c.updateProjectionMatrix(); c.updateMatrixWorld();
        // Cutaway: only the outer walls whose inner face looks at the camera stand; the shadows follow when that set changes.
        const sx = Math.sin(ocam.theta), sz = Math.cos(ocam.theta);
        for (const w of office.walls) { const show = w.nx * sx + w.nz * sz > .2; if (w.g.visible !== show) { w.g.visible = show; office.shadowDirty = true; } }
        office.lamp.glow.quaternion.copy(c.quaternion);
        return;
      }
      // Flat pose around the target (tx, -L, tz); on the planet the target drops toward the centre (L) and the whole pose is then
      // carried by the surface at the focus: rigid, so at b = 0 it is exactly the flat camera and the transmorph pivot rides along.
      const b = planet.b, L = PLANET_LOOK * PLANET_R * b, sp = Math.sin(cam.phi);
      camera.position.set(cam.tx + cam.distance * sp * Math.sin(cam.theta), cam.distance * Math.cos(cam.phi) - L, cam.tz + cam.distance * sp * Math.cos(cam.theta));
      camera.lookAt(cam.tx, -L, cam.tz); orbit(camera, cam, -L);
      carryQ.identity();
      if (b >= 5e-4) {
        const rho = Math.hypot(cam.tx, cam.tz), F = planetMap(cam.tx, 0, cam.tz, b);
        if (rho > 1e-6) carryQ.setFromAxisAngle(carryAxis.set(cam.tz / rho, 0, -cam.tx / rho), rho * b / PLANET_R);
        camera.position.x -= cam.tx; camera.position.z -= cam.tz; camera.position.applyQuaternion(carryQ); camera.position.x += F.x; camera.position.y += F.y; camera.position.z += F.z;
        camera.quaternion.premultiply(carryQ);
      }
      // The lights turn with the carried view, so the side facing the camera is lit like the flat city.
      // The shadow frustum stays on the island; on the planet it follows the surface under the focus.
      if (b >= 5e-4) { const F = planetMap(cam.tx, 0, cam.tz, b); sun.target.position.set(F.x, F.y, F.z); } else sun.target.position.set(0, 0, 0);
      sun.position.copy(SUN_POS).applyQuaternion(carryQ).add(sun.target.position); rimLight.position.copy(RIM_POS).applyQuaternion(carryQ); hemi.position.copy(UP).applyQuaternion(carryQ);
      sun.target.updateMatrixWorld();
      camera.near = .1 + (Math.max(.1, cam.distance * .04) - .1) * b;
      camera.aspect = width / height; camera.setViewOffset(width, height, -(cam.offsetX + insetShift()), 0, width, height); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      s.fog.near = cam.distance * 1.05; s.fog.far = cam.distance * 3.1;
      if (b >= 5e-4) { for (const st of stars) st.position.copy(camera.position); halo.quaternion.copy(camera.quaternion); }
    }
    const activeCamera = () => mode === 'office' && office ? office.camera : camera;
    /* City post-processing (the office renders directly): an MSAA target, GTAO ambient occlusion at half resolution (the depth of a
       dense city), a subtle bloom on the bright accents and the output pass (tone mapping + sRGB). On the planet the AO normals go
       through the bent material too; points, lines, transparent meshes and the planet scenery stay out of the AO buffer.
       Quality ladder (settings.mapQuality, then automatic on slow frames): 3 AO + bloom + shadows, 2 bloom + shadows,
       1 shadows only, 0 plain render. */
    let composer = null, gtao = null, bloom = null, quality = 'high', qLevel = 3, aoDirty = true, aoReady = false, lastPipe = '';
    // Last camera (matrixWorld + projection) and key light (position + target); sameAs copies and reports a change (1) or not (0).
    const camPrev = new Float64Array(32), sunPrev = new Float64Array(6);
    function sameAs(prev, src, at) {
      let moved = 0;
      if (src.isVector3) { if (prev[at] !== src.x || prev[at + 1] !== src.y || prev[at + 2] !== src.z) { prev[at] = src.x; prev[at + 1] = src.y; prev[at + 2] = src.z; moved = 1; } return moved; }
      for (let i = 0; i < src.length; i++) if (prev[at + i] !== src[i]) { prev[at + i] = src[i]; moved = 1; }
      return moved;
    }
    const slow = { n: 0, sum: 0 };
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
    function buildComposer() {
      // MSAA 2x (none on dense screens, where the pixel ratio already smooths the edges).
      const pr = pixelRatio(), rt = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: pr > 1.25 ? 0 : 2 });
      composer = new T.EffectComposer(renderer, rt);
      composer.addPass(new T.RenderPass(s, camera));
      gtao = new T.GTAOPass(s, camera, 2, 2);
      const fullSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => fullSize(Math.max(1, w * .5 | 0), Math.max(1, h * .5 | 0));
      gtao.updateGtaoMaterial({ radius: .7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
      gtao.blendIntensity = 1; bendMaterial(gtao.normalMaterial);
      const hide = gtao._overrideVisibility.bind(gtao);
      gtao._overrideVisibility = () => { hide(); const cache = gtao._visibilityCache; s.traverse(o => { const m = o.material; if (o.visible && (o.userData.noAO || (m && !Array.isArray(m) && m.transparent))) { o.visible = false; cache.push(o); } }); };
      // The AO (G-buffer, AO and denoise passes) is computed only when the scene or the camera moved; every frame then multiplies it
      // straight onto the frame (the pass's multiply blend, one full-screen pass, no copy and no buffer swap).
      const aoFull = gtao.render.bind(gtao);
      gtao.needsSwap = false;
      gtao.render = (r, writeBuffer, readBuffer, dt, mask) => {
        if (aoDirty || !aoReady) { aoDirty = false; aoReady = true; const out = gtao.output; gtao.output = T.GTAOPass.OUTPUT.Off; aoFull(r, writeBuffer, readBuffer, dt, mask); gtao.output = out; }
        gtao.blendMaterial.uniforms.intensity.value = gtao.blendIntensity; gtao.blendMaterial.uniforms.tDiffuse.value = gtao.pdRenderTarget.texture; gtao._renderPass(r, gtao.blendMaterial, readBuffer);
      };
      composer.addPass(gtao);
      // Bloom at half resolution: the glow stays soft and its blur chain costs about a quarter.
      bloom = new T.UnrealBloomPass(new T.Vector2(2, 2), .3, .45, .86); composer.addPass(bloom);
      const bloomSize = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bloomSize(Math.max(1, w * .5 | 0), Math.max(1, h * .5 | 0));
      composer.addPass(new T.OutputPass());
      composer.setPixelRatio(pr); composer.setSize(width, height);
    }
    function applyQuality() {
      const lv = quality === 'low' ? 0 : qLevel, shadows = lv >= 1;
      if (sun.castShadow !== shadows) {
        sun.castShadow = shadows; renderer.shadowMap.enabled = shadows;
        for (const sc of [s, office?.scene]) sc?.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
        if (office) office.shadowDirty = true;
      }
      if (lv >= 2 && !composer) buildComposer();
      if (gtao) gtao.enabled = lv >= 3; if (bloom) bloom.enabled = lv >= 2;
      slow.n = slow.sum = 0; aoReady = false; resetPacing(); markDirty(); invalidate();
    }
    gl = {
      renderer, applyCamera, pulseAt, sinkCity, riseCity, finishRise, foldWave,
      sync() { syncCity(); syncOffice(); },
      // Flat world point -> screen. On the planet it goes through planetMap, and points on the far side count as behind.
      project(x, y, z) {
        const b = mode === 'office' ? 0 : planet.b, p = b ? planetMap(x, y, z, b) : { x, y, z };
        v3.set(p.x, p.y, p.z).project(activeCamera()); let behind = v3.z > 1;
        if (b > .5) { const cy = -PLANET_R / b, nx = p.x, ny = p.y - cy, nz = p.z, c = camera.position, dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z; if ((nx * dx + ny * dy + nz * dz) / (Math.hypot(nx, ny, nz) * Math.hypot(dx, dy, dz)) < -.06) behind = true; }
        return { x: (v3.x + 1) / 2 * width, y: (1 - v3.y) / 2 * height, behind };
      },
      // Screen -> flat ground. On the finished planet: ray/sphere hit, then back to flat coordinates; no picking mid-curl.
      ground(sx, sy) {
        ndc.set(sx / width * 2 - 1, -(sy / height) * 2 + 1); raycaster.setFromCamera(ndc, activeCamera());
        if (mode !== 'office' && planet.b > 0) { if (planet.b < .999) return null; return raycaster.ray.intersectSphere(planetSphere, hit) ? planetUnmap(hit.x, hit.y, hit.z) : null; }
        return raycaster.ray.intersectPlane(mode === 'office' ? floorPlane : groundPlane, hit) ? { x: hit.x, z: hit.z } : null;
      },
      setPlanet,
      hover(target, empty) {
        if (mode === 'office') {
          if (!office) return; const sl = target && SLOT_BY_ID.get(target);
          if (!sl) { office.hover.visible = false; return; } const seat = seatOf(sl);
          office.hover.position.set(seat.x, .06, seat.z); office.hover.visible = true; office.hover.material.opacity = empty ? .28 : .08; return;
        }
        if (!target) { hoverGroup.visible = false; return; }
        const w = hexToWorld(target.q, target.r); hoverGroup.position.set(w.x, 0, w.z); hoverGroup.visible = true;
        hoverLineMat.color.setHex(empty ? C.cyan : 0x6f858f); hoverLineMat.opacity = empty ? .95 : .5; hoverFill.visible = empty;
      },
      deskStatus(id) { return office?.slotMarks.get(id)?.status || null; },
      animate(t) {
        const moving = !reducedMotion();
        const sel = scene.find(a => a.id === selected);
        if (mode === 'office') {
          if (!office) return;
          const sl = sel && SLOT_BY_ID.get(deskOf(sel));
          if (sl) { const seat = lifePos(sel) || seatOf(sl), k = moving ? (t % 2200) / 2200 : .3; office.sel.visible = true; office.sel.position.set(seat.x, .07, seat.z); office.sel.scale.setScalar(1 + k * .45); office.sel.material.opacity = .9 * (1 - k); office.sel.material.color.setHex(linkMode ? C.purple : C.cyan); }
          else office.sel.visible = false;
          for (const [, m] of office.slotMarks) if (m.status === 'running') m.led.scale.setScalar(moving ? 1 + Math.sin(t / 160) * .35 : 1.2);
          for (const pk of office.packets) { if (pk.signal) { pk.signal.offset.x = -((moving ? (t / 1000) * pk.rate : 0) + pk.phase) % 1; continue; } const k = moving ? ((t / 1000) * pk.speed + pk.offset) % 1 : pk.offset + .5; pk.curve.getPoint(k % 1, pk.dot.position); }
          for (const pk of office.lifePackets) { const k = ((t / 1000) * pk.speed + pk.offset) % 1; pk.curve.getPoint(pk.back ? 1 - k : k, pk.dot.position); }
          const W = office.war;
          if (W?.state === 'live' && moving) { const k = .5 + .5 * Math.sin(t / 380); for (const l of W.lights) l.intensity = WAR_LOOK.live.light * (.6 + .4 * k); W.strip.opacity = .5 + .4 * k; W.mapTex.offset.y = (t / 40000) % 1; }
          return;
        }
        if (sel && inGrid(sel.hex)) { const h = dragHexOf(sel), w = hexToWorld(h.q, h.r); selRing.visible = true; selRing.position.set(w.x, PLAZA_H + .01, w.z); const k = moving ? (t % 2200) / 2200 : .3; selRing.scale.setScalar(1 + k * .35); selRing.material.opacity = .85 * (1 - k); selRing.material.color.copy(linkMode ? selPurple : selBlue); }
        else selRing.visible = false;
        runAnimate(t, moving);
        for (const pk of packets) { if (pk.signal) { pk.signal.offset.x = -((moving ? (t / 1000) * pk.rate : 0) + pk.phase) % 1; continue; } const k = moving ? ((t / 1000) * pk.speed + pk.offset) % 1 : pk.offset + .5; pk.curve.getPoint(k % 1, pk.dot.position); }
        if (moving) {
          const k = (t % 7000) / 7000; sweep.scale.setScalar(.5 + k * GRID * 1.9); sweep.material.opacity = (linkMode ? .32 : .18) * (1 - k); sweep.material.color.setHex(linkMode ? C.purple : 0xcfd8dc);
          if (beacon.visible) { poleRings.forEach((m, i) => { m.rotation.z = t / (2600 + i * 900) * (i % 2 ? -1 : 1); }); orb.scale.setScalar(1 + Math.sin(t / 420) * .18); beaconLight.intensity = (2.6 + Math.sin(t / 420) * 1.1) * beaconK; }
        } else { sweep.material.opacity = 0; if (beacon.visible) beaconLight.intensity = 2.6 * beaconK; }
      },
      ensureOffice() { if (!office) { office = buildOffice(); syncOffice(); } },
      runSet, runBurst, relink: rebuildLinks, runState: () => ({ glow: [...runFx.keys()], comets: (runGroup.children.length - runFx.size) / 2 }),
      // Builds the office and compiles its shaders ahead of time, so the first transmorph to it does not stall.
      prepareOffice() { if (office?.ready) return; this.ensureOffice(); office.ready = true; const r = renderer.compileAsync?.(office.scene, office.camera); if (!r) renderer.compile(office.scene, office.camera); },
      render() {
        // Back from the office, the first city frame computes everything again (lastPipe reset).
        // The office's shadow map is static: rendered again only when office.shadowDirty (the city recomputes its own on return).
        if (mode === 'office' && office) { renderer.setClearColor(C.bg, 1); renderer.toneMappingExposure = 1.45; if (office.shadowDirty) { office.shadowDirty = false; renderer.shadowMap.needsUpdate = true; } renderer.render(office.scene, office.camera); lastPipe = ''; return; }
        bendTree(); renderer.setClearColor(CITY.bg, 1); renderer.toneMappingExposure = CITY.exposure;
        const lv = quality === 'low' ? 0 : qLevel, pipe = lv >= 2 && composer ? 'post' : 'plain';
        // Shadows: only when the scene changed or the key light moved (it follows the focus on the planet). AO: also when the camera moved.
        // Compared number by number against the last frame (no strings or arrays allocated per frame).
        const camMoved = sameAs(camPrev, camera.matrixWorld.elements, 0) | sameAs(camPrev, camera.projectionMatrix.elements, 16);
        const sunMoved = sameAs(sunPrev, sun.position, 0) | sameAs(sunPrev, sun.target.position, 3);
        if (pipe !== lastPipe) { lastPipe = pipe; geoDirty = true; }
        if (geoDirty || sunMoved) renderer.shadowMap.needsUpdate = true;
        if (geoDirty || camMoved) aoDirty = true;
        geoDirty = false;
        if (pipe === 'post') composer.render(); else renderer.render(s, camera);
      },
      resize(w, h) { const pr = pixelRatio(); renderer.setPixelRatio(pr); renderer.setSize(w, h, false); if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); } aoReady = false; resetPacing(); markDirty(); },
      setQuality(next) { next = next === 'low' ? 'low' : 'high'; if (next === quality) return; quality = next; if (next === 'high') qLevel = 3; applyQuality(); },
      // Frame time while rendering continuously: a slow average over 60 frames drops one quality level (AO, then bloom, then shadows).
      measure(dt) {
        if (mode === 'office' || quality === 'low' || qLevel === 0 || dt > 250) return;
        slow.n++; slow.sum += dt; if (slow.n < 60) return;
        const avg = slow.sum / slow.n; slow.n = slow.sum = 0; if (avg > 45) { qLevel--; applyQuality(); }
      },
      quality: () => ({ setting: quality, level: quality === 'low' ? 0 : qLevel, ao: !!gtao?.enabled && quality !== 'low' && qLevel >= 3, bloom: !!bloom?.enabled && quality !== 'low' && qLevel >= 2, shadows: sun.castShadow, buildings: specs.length }),
      // Office life: arcs between who is talking, with packets going both ways; an empty list clears them.
      lifeArcs(pairs) {
        if (!office) return; const g = office.life;
        g.children.slice().forEach(o => { g.remove(o); o.geometry.dispose(); o.material.dispose(); }); office.lifePackets.length = 0;
        for (const [a, b] of pairs) {
          const A = new T.Vector3(a.x, 1.25, a.z), B = new T.Vector3(b.x, 1.25, b.z), mid = A.clone().add(B).multiplyScalar(.5); mid.y += .55 + A.distanceTo(B) * .14;
          const curve = new T.QuadraticBezierCurve3(A, mid, B);
          g.add(new T.Mesh(new T.TubeGeometry(curve, 32, .026, 6, false), new T.MeshBasicMaterial({ color: 0x6fe3c1, transparent: true, opacity: .7, depthWrite: false })));
          for (let k = 0; k < 2; k++) { const dot = new T.Mesh(new T.SphereGeometry(.075, 10, 8), new T.MeshBasicMaterial({ color: 0xeafff8, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); g.add(dot); office.lifePackets.push({ dot, curve, offset: k * .5, speed: .42, back: k === 1 }); }
        }
        invalidate();
      }
    };
    applyQuality();
  } catch (error) {
    gl = null; viewport.classList.add('no-webgl');
    const note = document.createElement('div'); note.className = 'map-fallback'; note.textContent = 'VISUALIZAÇÃO 3D INDISPONÍVEL NESTE NAVEGADOR (WEBGL)'; viewport.append(note);
  }

  /* ---------- projection helpers (WebGL or 2D fallback with the same camera) ---------- */
  function fallbackScale() { return mode === 'office' ? height / (ocam.viewH / ocam.zoom) : height / (2 * Math.tan(FOV * Math.PI / 360) * cam.distance); }
  function projectWorld(x, y, z) {
    if (gl) return gl.project(x, y, z);
    const c0 = mode === 'office' ? ocam : cam, dx = x - c0.tx, dz = z - c0.tz, c = Math.cos(c0.theta), sn = Math.sin(c0.theta);
    const rx = dx * c - dz * sn, rz = dx * sn + dz * c, k = fallbackScale(), tilt = mode === 'office' ? Math.PI / 2 - ocam.elev : cam.phi;
    return { x: width / 2 + c0.offsetX + insetShift() + rx * k, y: height / 2 + (c0.offsetY || 0) + (rz * Math.cos(tilt) - y * Math.sin(tilt)) * k, behind: false };
  }
  function groundAt(sx, sy) {
    if (gl) return gl.ground(sx, sy);
    const c0 = mode === 'office' ? ocam : cam, tilt = mode === 'office' ? Math.PI / 2 - ocam.elev : cam.phi;
    const k = fallbackScale(), rx = (sx - width / 2 - c0.offsetX - insetShift()) / k, rz = (sy - height / 2 - (c0.offsetY || 0)) / k / Math.cos(tilt);
    const c = Math.cos(c0.theta), sn = Math.sin(c0.theta);
    return { x: c0.tx + rx * c + rz * sn, z: c0.tz - rx * sn + rz * c };
  }
  const local = event => { const b = viewport.getBoundingClientRect(); return { x: event.clientX - b.left, y: event.clientY - b.top }; };
  function hexAtScreen(sx, sy) { const g = groundAt(sx, sy); if (!g) return null; const h = worldToHex(g.x, g.z); return inGrid(h) ? h : null; }
  function deskAtScreen(sx, sy) {
    const g = groundAt(sx, sy); if (!g) return null; let best = null, bd = .75;
    for (const sl of SLOTS) { const seat = seatOf(sl), d = Math.hypot(seat.x - g.x, seat.z - g.z), dd = sl.seat ? d : Math.min(d, Math.hypot(sl.x - g.x, sl.z - g.z)); if (dd < bd) { bd = dd; best = sl.id; } }
    return best;
  }
  const targetAt = (sx, sy) => curling ? null : mode === 'office' ? deskAtScreen(sx, sy) : hexAtScreen(sx, sy); // nothing to pick while the city curls
  // Where an agent is shown: the drop target while it is dragged or moved (move mode preview), otherwise its own place.
  const dragHexOf = a => (dragging && dragging.nodeId === a.id && dragging.hex && mode === 'city') ? dragging.hex : (moving && moving.id === a.id && moving.target && mode === 'city') ? moving.target : a.hex;
  const deskOf = a => (dragging && dragging.nodeId === a.id && dragging.desk && mode === 'office') ? dragging.desk : (moving && moving.id === a.id && moving.target && mode === 'office') ? moving.target : a.desk;
  function isFreeHex(h, exceptId) { if (!inGrid(h)) return false; const who = occupied.get(hexKey(h)); if (who && who !== exceptId) return false; return !scene.some(a => a.id !== exceptId && inGrid(a.hex) && hexKey(dragHexOf(a)) === hexKey(h)); }
  function isFreeDesk(id, exceptId) { if (!SLOT_BY_ID.has(id)) return false; const who = occupiedDesks.get(id); if (who && who !== exceptId) return false; return !scene.some(a => a.id !== exceptId && deskOf(a) === id); }
  const isFree = (target, exceptId) => mode === 'office' ? isFreeDesk(target, exceptId) : isFreeHex(target, exceptId);

  function agentPoint(a) {
    if (mode === 'office') { const lp = lifePos(a); if (lp) return projectWorld(lp.x, 1.55, lp.z); const sl = SLOT_BY_ID.get(deskOf(a)); if (!sl) return null; const seat = seatOf(sl); return projectWorld(seat.x, 1.55, seat.z); }
    const h = dragHexOf(a); if (!inGrid(h)) return null; const w = hexToWorld(h.q, h.r); return projectWorld(w.x, PLAZA_H + .42, w.z);
  }
  function updatePositions() {
    for (const a of scene) {
      const p = agentPoint(a);
      for (const el of document.querySelectorAll(`[data-node="${a.id}"],[data-anchor="${a.id}"],[data-pin="${a.id}"]`)) {
        if (!p) { el.style.visibility = 'hidden'; continue; }
        el.style.left = `${p.x.toFixed(1)}px`; el.style.top = `${p.y.toFixed(1)}px`; el.style.visibility = p.behind ? 'hidden' : '';
        if (el.dataset.anchor) { const h = el.offsetHeight, w = el.offsetWidth, above = p.y - h - 50 >= 4, left = !above && p.x - w - 48 >= (width < 901 ? 8 : 296); el.classList.toggle('side', left); el.classList.toggle('below', !above && !left); }
        if (el.dataset.node) el.classList.toggle('walking', mode === 'office' && !!lifePos(a) && !!life.actors.get(a.id)?.path);
      }
    }
    placeOps(); placeCityTags();
    if (mode === 'office') {
      layoutCards();
    }
    placeLifeBadges();
    labels.hidden = mode !== 'office';
    if (mode === 'office') for (const el of labels.children) { const r = ROOM_BY_CODE.get(el.dataset.room), p = projectWorld(r.x + .4, .05, r.z + .45); el.style.left = `${p.x.toFixed(1)}px`; el.style.top = `${p.y.toFixed(1)}px`; }
    const z = document.getElementById('zoomValue'); if (z) z.textContent = Math.round(mode === 'office' ? ocam.zoom / ocam.base * 100 : cam.base / cam.distance * 100) + '%';
  }
  /* Office agent cards: one per agent, placed greedily around its marker so that no card covers
     another card or another agent's marker. Sizes match .agent-card in styles.css. */
  const CARD_W = 156, CARD_H = 46, CARD_GAP = 6, MARK_R = 19, CARD_LIFT = 26, ACT_R = 22, POP_W = 224, POP_H = 126;
  // Quick-action bubbles around the selected marker (upper arc: chat, move, edit), same offsets as .node-bubble in styles.css.
  const ACT_SPOTS = [[-60, -34], [0, -72], [60, -34]];
  function offsetsFor(w, h) {
    const list = [], sx = w / 2 + CARD_GAP, row = h + CARD_GAP;
    for (let k = 0; k < 4; k++) for (const dx of [0, -sx, sx, -2 * sx, 2 * sx]) list.push({ dx, top: -CARD_LIFT - h - k * row });
    for (let k = 0; k < 2; k++) for (const dx of [0, -sx, sx]) list.push({ dx, top: CARD_LIFT + k * row });
    for (const dx of [-(w / 2 + MARK_R + CARD_GAP), w / 2 + MARK_R + CARD_GAP]) list.push({ dx, top: -h / 2 });
    return list.sort((a, b) => Math.hypot(a.dx, a.top + h / 2) - Math.hypot(b.dx, b.top + h / 2));
  }
  // Agent cards, and the run popups (POP_W x POP_H, .ops-pop in styles.css) that take the card's place while the agent is at work.
  const cardOffsets = offsetsFor(CARD_W, CARD_H), popOffsets = offsetsFor(POP_W, POP_H);
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  function layoutCards() {
    const items = [];
    for (const el of viewport.querySelectorAll('.agent-card[data-card]')) {
      const id = el.dataset.card, a = scene.find(x => x.id === id), p = a && agentPoint(a), leader = viewport.querySelector(`[data-leader="${id}"]`);
      const walking = !!(a && lifePos(a) && life.actors.get(id)?.path), pop = ops.els.get(id);
      // An agent at work shows its run popup instead of the card; the popup follows it while it walks.
      if (pop) {
        el.style.visibility = 'hidden'; el.classList.remove('walking'); leader?.classList.remove('walking');
        if (!p || p.behind) { pop.style.visibility = 'hidden'; if (leader) leader.style.visibility = 'hidden'; continue; }
        items.push({ id, el: pop, leader, p, w: POP_W, h: POP_H, pop: true, walking }); continue;
      }
      // A walking agent's card fades out where it was and comes back once the agent sits down.
      el.classList.toggle('walking', walking); leader?.classList.toggle('walking', walking); if (walking) continue;
      if (!p || p.behind) { el.style.visibility = 'hidden'; if (leader) leader.style.visibility = 'hidden'; continue; }
      items.push({ id, el, leader, p, w: CARD_W, h: CARD_H });
    }
    for (const [id, pop] of ops.els) if (!items.some(it => it.id === id)) pop.style.visibility = 'hidden';
    const marks = items.map(({ id, p }) => ({ id, x: p.x - MARK_R, y: p.y - MARK_R, w: MARK_R * 2, h: MARK_R * 2 }));
    // The quick-action bubbles beside the selected marker (see .node-bubble in styles.css) are obstacles as well.
    const pin = viewport.querySelector('.node-actions[data-pin]')?.dataset.pin, pinned = pin && items.find(i => i.id === pin);
    for (const ac of life.actors.values()) if (ac.badge) { const it = items.find(i => i.id === ac.id); if (it) marks.push({ id: '', x: it.p.x - 62, y: it.p.y - 54, w: 124, h: 32 }); }
    if (pinned) for (const [dx, dy] of ACT_SPOTS) marks.push({ id: '', x: pinned.p.x + dx - ACT_R, y: pinned.p.y + dy - ACT_R, w: 2 * ACT_R, h: 2 * ACT_R });
    // Visible HUD panels over the map are obstacles too, so cards are not hidden behind them.
    const vb = viewport.getBoundingClientRect();
    const placed = [...document.querySelectorAll('.left-hud,.right-hud,.map-side-controls')].filter(el => !el.inert && !el.classList.contains('dismissed') && el.offsetParent)
      .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height).map(r => ({ x: r.left - vb.left - CARD_GAP, y: r.top - vb.top - CARD_GAP, w: r.width + CARD_GAP * 2, h: r.height + CARD_GAP * 2 }));
    // Run popups first (they are what the person follows), then the cards from top to bottom.
    items.sort((a, b) => (b.pop ? 1 : 0) - (a.pop ? 1 : 0) || a.p.y - b.p.y || a.p.x - b.p.x);
    // The transmorph back to the city collapses the last laid-out cards (render() has removed them by then).
    const cards = items.filter(it => !it.pop); if (cards.length) lastCards = cards.map(it => it.el);
    const clampX = x => Math.max(4, Math.min(width - POP_W - 4, x)), clampY = y => Math.max(4, Math.min(height - POP_H - 4, y));
    for (const [i, it] of items.entries()) {
      it.el.style.setProperty('--i', i); it.leader?.style.setProperty('--i', i); // stagger of the cards' entrance (morph-land)
      const { w, h } = it;
      // A walking popup rides right above its agent and is no obstacle for the others (they would jump around as it moves).
      if (it.pop && it.walking) {
        const r = { x: clampX(it.p.x - w / 2), y: clampY(it.p.y - CARD_LIFT - h), w, h };
        it.el.style.visibility = ''; it.el.style.left = `${r.x.toFixed(1)}px`; it.el.style.top = `${r.y.toFixed(1)}px`; it.el.classList.add('walking');
        if (it.leader) it.leader.style.visibility = 'hidden'; continue;
      }
      if (it.pop) it.el.classList.remove('walking');
      const offsets = it.pop ? popOffsets : cardOffsets, keep = it.pop ? ops.sticky.get(it.id) : null;
      let best = null, bestCost = Infinity;
      // A popup keeps its last spot while that spot stays clear, so it does not hop around as the others move.
      for (const o of keep ? [keep, ...offsets] : offsets) {
        const r = { x: it.p.x + o.dx - w / 2, y: it.p.y + o.top, w, h };
        let cost = 0;
        for (const q of placed) cost += overlap(r, q);
        for (const m of marks) cost += overlap(r, m) * (m.id === it.id ? 4 : 1);
        // Leaving the viewport counts as overlap, so cards stay on screen when there is room.
        cost += (Math.max(0, 4 - r.x) + Math.max(0, r.x + r.w - width + 4)) * h + (Math.max(0, 4 - r.y) + Math.max(0, r.y + r.h - height + 4)) * w;
        if (cost < bestCost) { best = r; bestCost = cost; if (it.pop) ops.sticky.set(it.id, o); if (!cost) break; }
      }
      placed.push(best);
      it.el.style.visibility = ''; it.el.style.left = `${best.x.toFixed(1)}px`; it.el.style.top = `${best.y.toFixed(1)}px`;
      if (it.leader) {
        // Leader line from the closest point of the card edge to the marker.
        const x1 = Math.max(best.x, Math.min(it.p.x, best.x + best.w)), y1 = Math.max(best.y, Math.min(it.p.y, best.y + best.h));
        const dx = it.p.x - x1, dy = it.p.y - y1, len = Math.max(0, Math.hypot(dx, dy) - MARK_R * .7);
        it.leader.style.visibility = len > 2 ? '' : 'hidden';
        it.leader.style.left = `${x1.toFixed(1)}px`; it.leader.style.top = `${y1.toFixed(1)}px`; it.leader.style.width = `${len.toFixed(1)}px`;
        it.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  }
  function commitCamera() { if (gl) gl.applyCamera(); updatePositions(); invalidate(); }

  /* ---------- camera controls ---------- */
  function home() { homePose(); commitCamera(); }
  // Home framing of the current view, written to cam/ocam only (the transmorph also uses it to measure the other view).
  function homePose() {
    width = viewport.clientWidth || 1600; height = viewport.clientHeight || 900;
    const mobile = width < 561, tablet = width < 901, visibleW = mobile ? width : tablet ? width - 240 : Math.max(420, width - 640 - 2 * insetShift());
    if (mode === 'office') {
      // Fit the whole floor plan (its isometric footprint, plus the back walls) between the side panels.
      const span = (OFFICE.x1 - OFFICE.x0 + OFFICE.z1 - OFFICE.z0) * .72, depth = (OFFICE.x1 - OFFICE.x0 + OFFICE.z1 - OFFICE.z0) * .36 + (OFFICE.wallH + 1.6) * Math.cos(ocam.elev);
      const zx = visibleW / (span / ocam.viewH * height), zy = height * .78 / (depth / ocam.viewH * height);
      ocam.base = Math.min(zx, zy) * (mobile ? .95 : 1.02); ocam.zoom = ocam.base; ocam.theta = Math.PI / 4;
      ocam.tx = (OFFICE.x0 + OFFICE.x1) / 2; ocam.tz = (OFFICE.z0 + OFFICE.z1) / 2;
      // Shift the plan down in screen space, leaving room above the desks for the desk card.
      ocam.offsetY = mobile ? height * .06 : height * .09;
      ocam.offsetX = mobile ? 0 : tablet ? width * .1 : -width * .045;
      return;
    }
    if (planetShape()) {
      // The whole planet (plus its tallest buildings) between the side panels, north pole (the squad) facing the camera.
      const fitR = PLANET_R + 2.6, sn = Math.sin(FOV * Math.PI / 360);
      cam.base = fitR / sn * Math.max(1, height / visibleW) * (mobile ? 1.2 : 1.06);
      cam.distance = cam.base; cam.tx = 0; cam.tz = 0; cam.theta = .62; cam.phi = .7;
      cam.offsetX = mobile ? width * .05 : tablet ? width * .1 : 0;
      return;
    }
    const fit = 4.6, t = Math.tan(FOV * Math.PI / 360);
    cam.base = Math.max(fit / t, fit / (t * (visibleW / height))) * (mobile ? 1.55 : tablet ? 1.2 : 1.12);
    cam.distance = cam.base; cam.tx = 0; cam.tz = mobile ? -3.2 : tablet ? -1 : .4; cam.theta = .62; cam.phi = .96;
    cam.offsetX = mobile ? width * .05 : tablet ? width * .1 : 0;
  }
  function resize() {
    finishMorph(); finishCurl();
    width = viewport.clientWidth || 1600; height = viewport.clientHeight || 900;
    if (gl) gl.resize(width, height);
    home();
  }
  function clampTarget(c0) {
    // On the planet the focus stays within a radius (short of the south pole, where the surface frame would spin).
    if (mode !== 'office' && planet.b > 0) { const r = Math.hypot(c0.tx, c0.tz); if (r > PLANET_RHO) { c0.tx *= PLANET_RHO / r; c0.tz *= PLANET_RHO / r; } return; }
    const lim = mode === 'office' ? 22 : GRID * 1.6; c0.tx = Math.max(-lim, Math.min(lim, c0.tx)); c0.tz = Math.max(-lim, Math.min(lim, c0.tz));
  }
  function zoom(factor, sx = width / 2, sy = height / 2) {
    if (morphing || curling) return; // the transmorph / curl drives the camera (side controls and keys bypass the pointer block)
    const before = groundAt(sx, sy);
    if (mode === 'office') ocam.zoom = Math.min(ocam.base * 3, Math.max(ocam.base * .55, ocam.zoom * factor));
    else cam.distance = Math.min(cam.base * 2.2, Math.max(cam.base * .38, cam.distance / factor));
    if (gl) gl.applyCamera();
    const after = groundAt(sx, sy), c0 = mode === 'office' ? ocam : cam;
    if (before && after) { c0.tx += before.x - after.x; c0.tz += before.z - after.z; }
    clampTarget(c0); commitCamera();
  }
  function focus(agentId) {
    const a = scene.find(x => x.id === agentId); if (!a || morphing || curling) return;
    const sp = agentPoint(a); if (!sp) return;
    // Only move the camera when the agent is outside the area between the side panels.
    const left = width < 901 ? 40 : 320, right = width < 901 ? width - 40 : width - 360;
    if (!sp.behind && sp.x > left && sp.x < right && sp.y > 60 && sp.y < height - 170) return;
    let tx, tz; const c0 = mode === 'office' ? ocam : cam;
    if (mode === 'office') { const seat = seatOf(SLOT_BY_ID.get(a.desk)); tx = seat.x * .7; tz = seat.z * .7; } else { const w = hexToWorld(a.hex.q, a.hex.r), f = planet.b > .999 ? 1 : .6; tx = w.x * f; tz = w.z * f; } // the planet brings the agent to the front
    const fx = c0.tx, fz = c0.tz;
    if (reducedMotion()) { c0.tx = tx; c0.tz = tz; commitCamera(); return; }
    tween(650, k => { const e = 1 - Math.pow(1 - k, 3); c0.tx = fx + (tx - fx) * e; c0.tz = fz + (tz - fz) * e; if (gl) gl.applyCamera(); updatePositions(); });
  }
  // Rotate the camera around its target in 45° steps (buttons, [ and ] keys); right-drag still rotates freely.
  let rotateTween = null;
  function rotate(step) {
    if (morphing || curling) return;
    const c0 = mode === 'office' ? ocam : cam, q = Math.PI / 4, from = c0.theta, to = Math.round(from / q) * q + step * q;
    if (rotateTween) { const i = tweens.indexOf(rotateTween); if (i >= 0) tweens.splice(i, 1); rotateTween = null; }
    if (reducedMotion()) { c0.theta = to; commitCamera(); return; }
    tween(420, k => { c0.theta = from + (to - from) * (1 - Math.pow(1 - k, 3)); if (gl) gl.applyCamera(); updatePositions(); }, () => { rotateTween = null; });
    rotateTween = tweens[tweens.length - 1];
  }
  function planetShape() { return !!gl && planet.want === 'planet'; }
  function finishCurl() { if (!planet.run) return; const r = planet.run; cancelTween(r); r.step(1); r.done(); }
  /* Folds the flat city into the planet (or unfolds it) while the camera travels from one home framing to the other. Folding:
     a pulse leaves the squad, the camera backs off and rises first, then the coast lifts and wraps underneath (the bend lags the
     camera, so the whole sheet stays in view), the world swings a little on the way and a band of light runs over the buildings
     from the squad to the coast. Unfolding mirrors it: the planet opens first and the camera lands at the end. A toggle mid-way
     reverses from where it is, in proportion to the distance left. */
  function setShape(next, animate) {
    next = next === 'planet' && gl ? 'planet' : 'flat';
    const reverse = !!planet.run && animate && mode === 'city';
    if (reverse) { cancelTween(planet.run); planet.run = null; } else finishCurl();
    if (next === planet.want && !reverse) return;
    planet.want = next; const to = next === 'planet' ? 1 : 0;
    if (!animate || mode !== 'city') { planet.b = to; gl?.setPlanet(to); gl?.foldWave(null); if (mode === 'city') home(); else invalidate(); return; }
    const from = planet.b, a0 = { ...cam }; homePose(); const a1 = { ...cam }; Object.assign(cam, a0);
    if (moving) cancelMove(); lifeReset(); dragging = null; gl.hover(null); viewport.classList.remove('dragging', 'hex-hover-empty'); curling = true;
    const fold = to > from, span = Math.abs(to - from), smooth = k => k * k * k * (k * (k * 6 - 15) + 10), part = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
    const swing = (fold ? .5 : -.5) * span, breathe = .16 * span;
    gl.finishRise(); gl.pulseAt({ q: 0, r: 0 }, { duration: CURL_MS * .8 * Math.max(.5, span), grow: GRID * 2.1, opacity: .9 });
    planet.run = tween(CURL_MS * Math.max(.45, span), k => {
      const kb = smooth(fold ? part(k, .14, .94) : part(k, 0, .84)), kc = smooth(fold ? part(k, 0, .88) : part(k, .1, 1));
      planet.b = from + (to - from) * kb; gl.setPlanet(planet.b);
      for (const key of ['distance', 'base', 'tx', 'tz', 'theta', 'phi', 'offsetX']) cam[key] = a0[key] + (a1[key] - a0[key]) * kc;
      const arc = Math.sin(Math.PI * kc); cam.theta += swing * arc; cam.distance *= 1 + breathe * arc;
      const front = fold ? kb : 1 - kb; gl.foldWave(k < 1 ? front * 1.4 - .2 : null);
      gl.applyCamera(); updatePositions();
    }, () => { planet.run = null; curling = false; planet.b = to; gl.setPlanet(to); gl.foldWave(null); home(); });
  }
  let pendingMode = null, booted = false, morphing = false, queuedMode = null, morphRun = null, morphFx = null, cinema = null, ghostLayer = null, landTimer = 0, lastCards = [];
  function setMode(next) {
    next = next === 'office' ? 'office' : 'city';
    if (next === (pendingMode || mode)) { if (morphing) queuedMode = null; return; } // toggled back to where it is going: drop the queue
    finishCurl();
    if (moving) cancelMove();
    if (morphing) { queuedMode = next; return; }
    gl?.finishRise();
    const swap = () => { pendingMode = null; mode = next; if (gl && mode === 'office') gl.ensureOffice(); gl?.hover(null); viewport.classList.remove('hex-hover-empty', 'war-hover', 'map-fading'); viewport.dataset.view = mode; home(); if (gl) gl.sync(); updatePositions(); invalidate(); };
    // Animate only when the map is visible; on boot, behind the Painel or with reduced motion the swap is immediate.
    if (!booted || paused || reducedMotion()) { swap(); return; }
    pendingMode = next;
    if (!gl) { viewport.classList.add('map-fading'); setTimeout(swap, 170); return; }
    morph(next, swap);
  }
  /* Cinematic transmorph ("entering the upside down"), one 1.2 s timeline:
     - out: the camera orbits down to ground level while it swings 60° around its target, so the current world tips over and
       spins until it is seen edge-on (letterbox bars, vignette, drifting spores);
     - cut: a light beam and a flicker; the other world arrives from the far side, passes face-on and settles home with a small
       overshoot; back in the city the buildings resurge in a wave that keeps going after the map is usable again;
     - the agents' icons travel between the views like a PowerPoint morph (ghost clones), ride the arriving world at the end and
       hand over to the real markers on landing; office cards collapse into their icons on the way out and pop in on arrival.
     A toggle pressed meanwhile is queued and runs right after. */
  const MORPH_MS = 1200, MORPH_SPLIT = 1 / 3, MORPH_SPIN = Math.PI / 3, MORPH_PULL = .35, MORPH_SAFE = 26, RISE_AT = .55, RISE_MS = 1100;
  const camOf = m => m === 'office' ? ocam : cam, sizeOf = (m, c = camOf(m)) => m === 'office' ? c.zoom : c.distance;
  const setSize = (m, v) => { if (m === 'office') ocam.zoom = v; else cam.distance = v; };
  // Pulled back at the cut; the perspective camera also stays out of the city while it is at ground level.
  // A sphere is never edge-on: at the cut the planet is pulled far back so it is small when the office arrives.
  const pulledSize = (m, size) => m === 'office' ? size / (1 + MORPH_PULL) : planet.b > .5 ? size * 3 : Math.max(MORPH_SAFE, size * (1 + MORPH_PULL));
  const elevOf = m => m === 'office' ? ocam.elev : Math.PI / 2 - cam.phi; // live: right-drag changes the city tilt
  const clamp01 = v => Math.max(0, Math.min(1, v)), smooth = v => v * v * (3 - 2 * v), shown = p => p && !p.behind ? p : null;
  // Home framing of view m and where every agent would be seen there (same camera math, measured synchronously, no render).
  function measureHome(m) {
    const c = camOf(m), saved = { ...c }, prev = mode; mode = m; homePose(); const home = { ...c };
    gl.applyCamera(); const pts = new Map(scene.map(a => [a.id, shown(agentPoint(a))]));
    Object.assign(c, saved); mode = prev; gl.applyCamera();
    return { home, pts };
  }
  function ghostClone(el) {
    const g = el.cloneNode(true);
    for (const n of [g, ...g.querySelectorAll('*')]) for (const at of ['data-action', 'data-id', 'data-node', 'data-card', 'title', 'aria-label']) n.removeAttribute(at);
    g.classList.remove('walking'); g.tabIndex = -1; return g;
  }
  function sporeField() {
    const layers = [[28, 1, '#bfeaf5'], [18, 1.6, '#30c5e8'], [9, 2.6, '#e6fbff']];
    cinema.querySelectorAll('i').forEach((el, k) => { const [count, size, color] = layers[k]; el.style.boxShadow = Array.from({ length: count }, () => `${Math.round(Math.random() * width)}px ${Math.round(Math.random() * (height + 260))}px 0 ${size}px ${color}${['44', '77', 'aa'][Math.floor(Math.random() * 3)]}`).join(','); });
  }
  // Beam, cinema frame (letterbox, vignette, spores) and ghost layer; also created at idle after boot so the first toggle is smooth.
  function ensureMorphLayers() {
    if (ghostLayer) return;
    morphFx = document.createElement('div'); morphFx.className = 'map-morph-fx';
    cinema = document.createElement('div'); cinema.className = 'map-cinema'; cinema.innerHTML = '<i></i><i></i><i></i>';
    ghostLayer = document.createElement('div'); ghostLayer.className = 'map-morph-ghosts';
    for (const el of [morphFx, cinema, ghostLayer]) { el.setAttribute('aria-hidden', 'true'); viewport.appendChild(el); }
    sporeField();
  }
  function finishMorph() { if (!morphRun) return; const r = morphRun; cancelTween(r); r.step(1); r.done(); }
  function morph(next, swap) {
    const prev = mode, c0 = camOf(prev);
    const cardsOut = prev === 'office' ? lastCards.filter(el => el.style.left) : []; // before lifeReset() lays out zero cards
    lifeReset(); dragging = null; viewport.classList.remove('dragging', 'hex-hover-empty'); gl.hover(null);
    gl.ensureOffice(); gl.prepareOffice(); // needed to measure the office; the async shader compile overlaps the out phase
    morphing = true;
    const src = new Map(scene.map(a => [a.id, shown(agentPoint(a))])), out = measureHome(prev), dst = measureHome(next).pts;
    ensureMorphLayers(); sporeField(); ghostLayer.replaceChildren();
    const nodes = [...document.querySelectorAll('#mapNodes .map-node[data-node]')], last = Math.max(1, nodes.length - 1), scaleOf = (m, sel) => m === 'office' ? (sel ? .82 : .72) : 1;
    const ghosts = nodes.map((el, i) => {
      const id = el.dataset.node, from = src.get(id), to = dst.get(id); if (!from && !to) return null;
      const sel = el.classList.contains('selected'), g = ghostClone(el); ghostLayer.appendChild(g);
      const lift = from && to ? Math.min(150, 40 + Math.hypot(to.x - from.x, to.y - from.y) * .25) : 0;
      return { id, el: g, from, to, lift, delay: i / last * .1, s0: scaleOf(prev, sel), s1: scaleOf(next, sel) };
    }).filter(Boolean);
    const cards = cardsOut.map(el => { const g = ghostClone(el), p = src.get(el.dataset.card); if (p) g.style.transformOrigin = `${(p.x - parseFloat(el.style.left)).toFixed(1)}px ${(p.y - parseFloat(el.style.top)).toFixed(1)}px`; ghostLayer.appendChild(g); return g; });
    clearTimeout(landTimer); viewport.classList.remove('morph-in', 'morph-swap', 'morph-land'); viewport.classList.add('map-morphing', 'morph-out');
    const a0 = { theta: c0.theta, tx: c0.tx, tz: c0.tz, size: sizeOf(prev) }, h0 = out.home, outSize = pulledSize(prev, sizeOf(prev, h0)), eOut = elevOf(prev);
    const flipBack = v => 1 + 2.1 * Math.pow(v - 1, 3) + 1.1 * Math.pow(v - 1, 2); // ease-out with a ~5% overshoot
    let swapped = false, rose = false, c1 = null, b = null, inSize = 0, eIn = 0;
    function moveGhosts(k) {
      const cap = next === 'office' ? 1 - clamp01(k / .26) : clamp01((k - .62) / .3); // city captions fade out before / in after the cut
      for (const g of ghosts) {
        const t = clamp01((k - g.delay) / (.9 - g.delay)), e = (1 - Math.cos(Math.PI * t)) / 2;
        let x, y, o = 1;
        if (g.from && g.to) { const u = 1 - e, mx = (g.from.x + g.to.x) / 2, my = (g.from.y + g.to.y) / 2 - g.lift; x = u * u * g.from.x + 2 * u * e * mx + e * e * g.to.x; y = u * u * g.from.y + 2 * u * e * my + e * e * g.to.y; }
        else if (g.to) { x = g.to.x; y = g.to.y; o = clamp01((k - .5) / .35); }
        else { x = g.from.x; y = g.from.y; o = 1 - clamp01(k / .3); }
        // Near the end the icon rides the arriving world (live projection, camera pose included) and lands on the real marker.
        if (swapped && g.to) { const a = scene.find(s => s.id === g.id), live = a && shown(agentPoint(a)); if (live) { const w = smooth(clamp01((k - .66) / .28)); x += (live.x - x) * w; y += (live.y - y) * w; } }
        g.el.style.left = `${x.toFixed(1)}px`; g.el.style.top = `${y.toFixed(1)}px`; g.el.style.opacity = o;
        g.el.style.transform = `translate(-50%,-50%) scale(${(g.s0 + (g.s1 - g.s0) * e).toFixed(3)})`; g.el.style.setProperty('--cap', cap.toFixed(3));
      }
      const c = clamp01(k / .3);
      for (const el of cards) { el.style.opacity = 1 - c; el.style.transform = `scale(${1 - .85 * c * c})`; }
    }
    function step(k) {
      if (k < MORPH_SPLIT) {
        const u = k / MORPH_SPLIT, e = u * u, m = smooth(u); // quadratic: the tilt and the spin start right away
        c0.theta = a0.theta + MORPH_SPIN * e; c0.tx = a0.tx + (h0.tx - a0.tx) * m; c0.tz = a0.tz + (h0.tz - a0.tz) * m;
        setSize(prev, a0.size + (outSize - a0.size) * m); pose.flip = -eOut * e;
      } else {
        if (!swapped) {
          swapped = true; pose.flip = 0; swap(); c1 = camOf(mode); b = { theta: c1.theta, size: sizeOf(mode) }; inSize = pulledSize(mode, b.size); eIn = elevOf(mode);
          if (mode === 'city') gl.sinkCity();
          viewport.classList.replace('morph-out', 'morph-in'); void morphFx.offsetWidth; viewport.classList.add('morph-swap');
        }
        const v = (k - MORPH_SPLIT) / (1 - MORPH_SPLIT), e = 1 - Math.pow(1 - v, 3);
        c1.theta = b.theta - MORPH_SPIN * (1 - e); setSize(mode, inSize + (b.size - inSize) * e); pose.flip = (Math.PI - eIn) * (1 - flipBack(v));
        if (!rose && k >= RISE_AT && mode === 'city') { rose = true; gl.riseCity(RISE_MS); }
      }
      gl.applyCamera(); moveGhosts(k);
    }
    morphRun = tween(MORPH_MS, step, () => {
      morphRun = null; pose.flip = 0; commitCamera(); morphing = false; ghostLayer.replaceChildren();
      viewport.classList.remove('map-morphing', 'morph-out', 'morph-in', 'morph-swap'); viewport.classList.add('morph-land');
      landTimer = setTimeout(() => viewport.classList.remove('morph-land'), 900);
      if (mode === 'city') { if (!rose) gl.riseCity(RISE_MS); for (const a of scene) if (inGrid(a.hex)) gl.pulseAt(a.hex, { duration: 650, grow: 1.8 }); }
      const q = queuedMode; queuedMode = null; if (q && q !== mode) setMode(q);
    });
  }

  /* ---------- office life: purely visual. Now and then agents walk to other rooms for a meeting, a visit, a call or a
     break, with a transmission badge over their heads and arcs between who is talking. Their real desks never change. ---------- */
  const LIFE_SPEED = 4.5, LIFE_KINDS = [['meeting', .4], ['visit', .3], ['call', .15], ['pause', .15]];
  const LIFE_DUR = { meeting: [8000, 14000], visit: [5000, 8000], call: [6000, 10000], pause: [5000, 9000] };
  const LIFE_LABEL = { meeting: 'REUNIÃO', visit: 'CONVERSA', call: 'EM CALL', pause: 'PAUSA' };
  const LIFE_ICON = {
    meeting: '<path d="M5.5 11a6.5 6.5 0 0 1 13 0M8.5 11a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="11" r="1.2"/><path d="M12 12.2V20M9 20h6"/>',
    visit: '<path d="M4 5h10v7H9l-3 3v-3H4Z"/><path d="M14 9h6v7h-2v3l-3-3h-3v-2"/>',
    call: '<path d="M4 14a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/>',
    pause: '<path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5"/>'
  };
  const lifeRand = (a, b) => a + Math.random() * (b - a), lifeShuffle = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  function lifeOn() { return mode === 'office' && !!gl && booted && !paused && !linkMode && !morphing && !reducedMotion(); }
  // The visual position of an agent that is away from its desk (not while it is dragged or moved by the person).
  function lifePos(a) { const ac = life.actors.get(a.id); if (!ac || (dragging && dragging.nodeId === a.id) || (moving && moving.id === a.id)) return null; return ac.pos; }
  // A room's door: a point just inside it and one on the corridor (z = 0). The War Room opens west, at the end of the corridor.
  function doorOf(code) {
    const r = ROOM_BY_CODE.get(code); if (r.door === 'west') return { in: { x: r.x + .8, z: 0 }, out: { x: r.x - .6, z: 0 } };
    const side = r.z < 0 ? r.z + r.d : r.z, x = r.x + r.w / 2; return { in: { x, z: side + (r.z < 0 ? -.8 : .8) }, out: { x, z: 0 } };
  }
  const roomAt = (x, z) => ROOMS.find(r => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d)?.code || null;
  // Office: is this screen point on the War Room floor? (hover cursor and click to open the operation room)
  function warAt(sx, sy) { if (mode !== 'office' || moving || curling || morphing) return false; const g = groundAt(sx, sy); return !!g && roomAt(g.x, g.z) === 'WAR'; }
  // Walk through the doors: out of the room, along the corridor (z = 0), into the other room.
  function officePath(from, to) {
    const ra = roomAt(from.x, from.z), rb = roomAt(to.x, to.z), pts = [{ ...from }];
    if (ra !== rb) { if (ra) { const d = doorOf(ra); pts.push({ ...d.in }, { ...d.out }); } if (rb) { const d = doorOf(rb); pts.push({ ...d.out }, { ...d.in }); } }
    pts.push({ ...to }); return pts;
  }
  function lifeHome(a) { const sl = SLOT_BY_ID.get(a.desk); return sl ? seatOf(sl) : null; }
  function lifeActor(a) { let ac = life.actors.get(a.id); if (!ac) { const home = lifeHome(a); if (!home) return null; ac = { id: a.id, pos: { ...home }, home, path: null, seg: 0, act: null, badge: null, spot: null }; life.actors.set(a.id, ac); } return ac; }
  function walkTo(ac, to) { ac.path = officePath(ac.pos, to); ac.seg = 0; }
  function stepActor(ac, dist) {
    while (dist > 0 && ac.path) {
      const target = ac.path[ac.seg + 1]; if (!target) { ac.path = null; break; }
      const dx = target.x - ac.pos.x, dz = target.z - ac.pos.z, d = Math.hypot(dx, dz);
      if (d <= dist) { ac.pos = { ...target }; dist -= d; ac.seg++; if (ac.seg >= ac.path.length - 1) ac.path = null; }
      else { ac.pos = { x: ac.pos.x + dx / d * dist, z: ac.pos.z + dz / d * dist }; dist = 0; }
    }
  }
  // Who can wander: not the agent running the operation (nor the ones in its active arcs), not dragged, moved or already busy.
  function lifeEligible() {
    const busy = new Set([running.id, moving?.id, dragging?.nodeId, ...links.filter(l => l.active).flatMap(l => [l.from, l.to])]);
    return lifeShuffle(scene.filter(a => SLOT_BY_ID.has(a.desk) && !busy.has(a.id) && !life.actors.get(a.id)?.act));
  }
  function lifeFreeSlots(room) {
    const taken = new Set([...occupiedDesks.keys(), ...scene.map(a => a.desk), ...[...life.actors.values()].map(ac => ac.spot).filter(Boolean)]);
    return lifeShuffle(SLOTS.filter(s => s.room === room && !taken.has(s.id)));
  }
  function lifeStart(kind) {
    const pool = lifeEligible(), act = { kind, members: [], state: 'gather', until: 0 };
    if (kind === 'meeting') {
      if (pool.length < 2) return false;
      let seats = lifeFreeSlots('R');
      if (seats.length < 2) { const alt = ROOMS.filter(r => r.code !== 'R').map(r => lifeFreeSlots(r.code)).sort((x, y) => y.length - x.length)[0]; if (!alt || alt.length < 2) return false; seats = alt; }
      const members = pool.slice(0, Math.min(pool.length, seats.length, 2 + Math.floor(Math.random() * 3)));
      members.forEach((a, i) => { const ac = lifeActor(a); ac.act = act; ac.spot = seats[i].id; walkTo(ac, seatOf(seats[i])); act.members.push(a.id); });
    } else if (kind === 'visit') {
      if (pool.length < 2) return false;
      const guest = pool[0], room = SLOT_BY_ID.get(guest.desk).room, host = pool.slice(1).find(h => SLOT_BY_ID.get(h.desk).room !== room) || pool[1];
      const hs = lifeHome(host), g = lifeActor(guest), h = lifeActor(host);
      g.act = h.act = act; walkTo(g, { x: hs.x + (Math.random() < .5 ? -.95 : .95), z: hs.z }); act.members.push(guest.id, host.id);
    } else if (kind === 'call') {
      if (!pool.length) return false; lifeActor(pool[0]).act = act; act.members.push(pool[0].id);
    } else if (kind === 'pause') {
      const a = pool[0]; if (!a) return false; const own = SLOT_BY_ID.get(a.desk).room, spots = ['LAB', 'REC'].filter(r => r !== own).flatMap(lifeFreeSlots);
      if (!spots.length) return false; const s = spots[0], ac = lifeActor(a); ac.act = act; ac.spot = s.id; walkTo(ac, seatOf(s)); act.members.push(a.id);
    } else return false;
    life.acts.push(act); return true;
  }
  function lifeOrder() { const out = [], pool = LIFE_KINDS.map(k => [...k]); while (pool.length) { let r = Math.random() * pool.reduce((s, k) => s + k[1], 0), i = 0; while (i < pool.length - 1 && (r -= pool[i][1]) > 0) i++; out.push(pool.splice(i, 1)[0][0]); } return out; }
  // Arcs with packets going both ways between who is talking (meetings in a ring, visits between guest and host).
  function lifeArcs() {
    const pairs = [];
    for (const act of life.acts) if (act.state === 'active' && (act.kind === 'meeting' || act.kind === 'visit')) {
      const pts = act.members.map(id => life.actors.get(id)?.pos).filter(Boolean);
      if (pts.length === 2) pairs.push([pts[0], pts[1]]); else if (pts.length > 2) pts.forEach((p, i) => pairs.push([p, pts[(i + 1) % pts.length]]));
    }
    // A run errand or call: between who came over and the colleague at the desk.
    for (const act of life.acts) if (act.state === 'active' && act.ops && act.peer) { const a = life.actors.get(act.members[0])?.pos, b = opsPosOf(act.peer); if (a && b) pairs.push([a, b]); }
    gl?.lifeArcs(pairs);
  }
  function lifeEnd(act) {
    act.state = 'return'; act.members.forEach(id => { const ac = life.actors.get(id), a = scene.find(x => x.id === id); if (!ac) return; ac.badge = null; ac.spot = null; const home = a && lifeHome(a); if (home) ac.home = home; walkTo(ac, ac.home); });
    lifeArcs();
  }
  function lifeReset() {
    ops.queue = [];
    if (!life.acts.length && !life.actors.size) return;
    life.acts = []; life.actors.clear(); gl?.lifeArcs([]);
    for (const el of viewport.querySelectorAll('.walking')) el.classList.remove('walking');
    updatePositions(); invalidate();
  }
  // The agent dragged by the person goes back to its desk at once; the rest of its activity ends (the others walk back).
  function lifeRelease(id) { const ac = life.actors.get(id); if (!ac) return; if (ac.act && ac.act.state !== 'return') lifeEnd(ac.act); if (ac.act) ac.act.members = ac.act.members.filter(x => x !== id); life.actors.delete(id); updatePositions(); }
  function lifeTick(t) {
    if (!lifeOn()) { life.nextAt = 0; life.last = 0; if (life.acts.length || life.actors.size) { lifeReset(); return true; } return false; }
    if ([...life.actors.keys()].some(id => !scene.some(a => a.id === id))) { lifeReset(); return true; }
    const dt = life.last ? Math.min(100, t - life.last) : 16; life.last = t;
    let changed = opsTick();
    if (!life.nextAt) life.nextAt = t + lifeRand(3000, 5000);
    // While a run goes on (or its last errands play) only the run moves: the random acts end and none starts.
    if (opsBusy()) { life.nextAt = Math.max(life.nextAt, t + 3000); for (const act of life.acts) if (!act.ops && act.state !== 'return') { lifeEnd(act); changed = true; } }
    else if (t >= life.nextAt) { life.nextAt = t + lifeRand(6000, 12000); if (life.acts.length < (scene.length < 5 ? 1 : 2)) for (const k of lifeOrder()) if (lifeStart(k)) break; }
    for (const ac of life.actors.values()) if (ac.path) { stepActor(ac, (ac.act?.ops ? OPS_SPEED : LIFE_SPEED) * dt / 1000); changed = true; }
    for (const act of [...life.acts]) {
      const acs = act.members.map(id => life.actors.get(id)).filter(Boolean);
      if (!acs.length) { life.acts.splice(life.acts.indexOf(act), 1); continue; }
      if (act.state === 'gather' && acs.every(ac => !ac.path)) { act.state = 'active'; act.until = act.ops ? (act.ops === 'errand' ? t + OPS_STAY : Infinity) : t + lifeRand(...LIFE_DUR[act.kind]); if (!act.ops) acs.forEach(ac => { ac.badge = act.kind; }); lifeArcs(); changed = true; }
      else if (act.state === 'active' && t >= act.until) { lifeEnd(act); changed = true; }
      else if (act.state === 'return' && acs.every(ac => !ac.path)) { life.acts.splice(life.acts.indexOf(act), 1); acs.forEach(ac => life.actors.delete(ac.id)); changed = true; }
    }
    return changed;
  }
  /* ---------- the run in the office (MapNetwork.ops, data from the app's officeOps): what moves is the real run. Holds keep an agent
     somewhere while a state lasts (the commander in the War Room while planning, a called colleague beside the caller's desk);
     errands walk to a colleague's desk, stay a moment and walk back (briefing, baton, delivery for review). A popup over each agent
     at work says who it is and what it is doing. ---------- */
  const OPS_SPEED = 6, OPS_STAY = 2200;
  function opsBusy() { return !!ops.data?.run || ops.queue.length > 0 || life.acts.some(act => act.ops && act.state !== 'return'); }
  function opsPosOf(id) { const ac = life.actors.get(id); if (ac) return ac.pos; const a = scene.find(x => x.id === id); return a ? lifeHome(a) : null; }
  // Where the commander plans: the west chair of the War Room table (the room opens west, so the walk ends right past the door).
  function opsWarSpot() { const r = ROOM_BY_CODE.get('WAR'); return { x: r.x + r.w / 2 - 1.5, z: r.z + r.d / 2 - .9 }; }
  // Beside a colleague's chair, on the side farthest from anybody else.
  function opsBeside(peerId, moverId) {
    const peer = scene.find(x => x.id === peerId), home = peer && lifeHome(peer); if (!home) return null;
    const others = [...scene.filter(x => x.id !== peerId && x.id !== moverId).map(lifeHome), ...[...life.actors.values()].filter(ac => ac.id !== moverId && ac.act).map(ac => ac.path ? ac.path.at(-1) : ac.pos)].filter(Boolean);
    const room = ROOM_BY_CODE.get(roomAt(home.x, home.z)), score = s => (room && (s.x < room.x + .3 || s.x > room.x + room.w - .3) ? -9 : 0) + Math.min(9, ...others.map(q => Math.hypot(q.x - s.x, q.z - s.z)));
    return [-.95, .95].map(dx => ({ x: home.x + dx, z: home.z })).sort((a, b) => score(b) - score(a))[0];
  }
  // Takes the agent out of whatever it was walking back from and sends it on a run act.
  function opsWalk(a, props, to) {
    const ac = lifeActor(a); if (!ac || !to) return;
    if (ac.act) { ac.act.members = ac.act.members.filter(x => x !== a.id); if (ac.act.state !== 'return') lifeArcs(); }
    const act = { kind: 'ops', members: [a.id], state: 'gather', until: 0, ...props };
    ac.act = act; ac.badge = null; ac.spot = null; walkTo(ac, to); life.acts.push(act);
  }
  function applyOps(d) {
    if (!d) return;
    ops.data = d; opsCity();
    // First data, or another operation: what already happened is not replayed.
    if (ops.room !== d.room) { ops.room = d.room; ops.seen = d.seq ?? -1; ops.queue = []; return; }
    for (const e of d.events || []) {
      if (e.seq <= ops.seen) continue; ops.seen = e.seq;
      if (e.stop) { ops.queue = []; for (const act of life.acts) if (act.ops === 'errand' && act.state !== 'return') lifeEnd(act); continue; }
      if (lifeOn()) { ops.queue.push(e); if (ops.queue.length > 4) ops.queue.shift(); }
      else if (cityFxOn() && e.pop) { gl.runBurst(e.mover, e.peer, e.pop.tone); ops.tags.set(e.mover, { chip: e.pop.chip, tone: e.pop.tone, until: now() + 2800 }); setTimeout(updatePositions, 2900); }
    }
    ops.seen = Math.max(ops.seen, d.seq ?? -1);
  }
  // City: the agents at work glow (gl.runSet) and every open call is a two-way link (runLinks); errands become comets (applyOps).
  function cityFxOn() { return mode === 'city' && !!gl && booted && !paused && !linkMode && !morphing && !reducedMotion(); }
  function opsCity() {
    if (!gl) return;
    const crew = ops.data?.crew || [], calls = crew.filter(c => c.hold === 'call' && c.peer).flatMap(c => [{ from: c.peer, to: c.id, active: true, tone: 'call' }, { from: c.id, to: c.peer, active: true, tone: 'call' }]);
    if (JSON.stringify(calls) !== JSON.stringify(runLinks)) { runLinks = calls; gl.relink(); }
    gl.runSet(linkMode ? [] : crew.map(c => ({ id: c.id, tone: c.tone })));
  }
  // City: a tag over each agent at work with its state (an errand's label for a moment, e.g. PASSANDO O BASTÃO → FORGE), and the
  // marker pulsing in the same tone.
  function placeCityTags() {
    const on = mode === 'city' && !paused && !linkMode, t = now(), want = new Map();
    if (on) {
      for (const c of ops.data?.crew || []) want.set(c.id, { chip: c.chip, tone: c.tone });
      for (const [id, x] of ops.tags) if (x.until > t) want.set(id, x); else ops.tags.delete(id);
      const pin = viewport.querySelector('.node-actions[data-pin]')?.dataset.pin; if (pin) want.delete(pin);
    }
    for (const el of viewport.querySelectorAll('.map-node[data-node]')) { const w = on && (want.get(el.dataset.node) || (ops.data?.crew || []).find(c => c.id === el.dataset.node)); el.classList.toggle('ops-on', !!w); if (w) el.style.setProperty('--ops-tone', `var(--tone-${w.tone || 'work'})`); }
    if (!ops.tagLayer) { if (!want.size) return; ops.tagLayer = document.createElement('div'); ops.tagLayer.className = 'ops-tags'; ops.tagLayer.setAttribute('aria-hidden', 'true'); viewport.appendChild(ops.tagLayer); }
    for (const [id, el] of ops.tagEls) if (!want.has(id)) { el.remove(); ops.tagEls.delete(id); }
    for (const [id, x] of want) {
      let el = ops.tagEls.get(id); if (!el) { el = document.createElement('div'); el.className = 'ops-tag'; el.innerHTML = '<i></i><span></span>'; ops.tagLayer.appendChild(el); ops.tagEls.set(id, el); }
      el.dataset.tone = x.tone || 'work'; const sp = el.lastChild; if (sp.textContent !== x.chip) sp.textContent = x.chip || '';
      const a = scene.find(y => y.id === id), p = a && agentPoint(a);
      if (!p || p.behind) { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = ''; el.style.left = `${p.x.toFixed(1)}px`; el.style.top = `${p.y.toFixed(1)}px`;
    }
  }
  function opsTick() {
    const d = ops.data, want = new Map((d?.crew || []).filter(c => c.hold).map(c => [c.id, c]));
    let changed = false;
    // Holds: end the ones no longer wanted, start the wanted ones once the agent is free (an errand goes first).
    for (const act of [...life.acts]) if (act.ops && act.ops !== 'errand' && act.state !== 'return') { const w = want.get(act.members[0]); if (!w || w.hold !== act.ops || (w.peer || null) !== act.peer) { lifeEnd(act); changed = true; } }
    for (const [id, w] of want) {
      const a = scene.find(x => x.id === id), ac = life.actors.get(id); if (!a || !SLOT_BY_ID.has(a.desk) || (ac?.act && ac.act.state !== 'return')) continue;
      if (w.peer && !scene.some(x => x.id === w.peer)) continue;
      opsWalk(a, { ops: w.hold, peer: w.peer || null }, w.hold === 'war' ? opsWarSpot() : opsBeside(w.peer, id)); changed = true;
    }
    // Errands, in order: one waits while its agent is busy with another run act.
    for (let i = 0; i < ops.queue.length; i++) {
      const e = ops.queue[i], a = scene.find(x => x.id === e.mover), peer = scene.find(x => x.id === e.peer);
      if (!a || !peer || a.id === peer.id || !SLOT_BY_ID.has(a.desk) || !SLOT_BY_ID.has(peer.desk)) { ops.queue.splice(i--, 1); continue; }
      const ac = life.actors.get(a.id); if (ac?.act?.ops && ac.act.state !== 'return') continue;
      ops.queue.splice(i--, 1); opsWalk(a, { ops: 'errand', peer: peer.id, pop: e.pop }, opsBeside(peer.id, a.id)); changed = true;
    }
    return changed;
  }
  // Nobody is still on the way to an errand or a hold (the demo waits for it before its next beat).
  function opsSettled() { return !lifeOn() || document.hidden || (!ops.queue.length && !life.acts.some(act => act.ops && act.state === 'gather')); }
  // Who has a popup: the agents at work (app), or the label of the errand an agent is carrying out.
  function opsPops() {
    const out = new Map();
    if (mode !== 'office' || paused || linkMode) return out;
    for (const c of ops.data?.crew || []) out.set(c.id, c);
    for (const act of life.acts) if (act.ops === 'errand' && act.state !== 'return' && act.pop) out.set(act.members[0], act.pop);
    for (const id of [...out.keys()]) if (!scene.some(a => a.id === id)) out.delete(id);
    return out;
  }
  function placeOps() {
    const want = opsPops();
    if (!ops.layer) { if (!want.size) return; ops.layer = document.createElement('div'); ops.layer.className = 'ops-layer'; viewport.appendChild(ops.layer); }
    for (const [id, el] of ops.els) if (!want.has(id)) { el.remove(); ops.els.delete(id); ops.sticky.delete(id); }
    const put = (el, v) => { v = String(v ?? ''); if (el.textContent !== v) el.textContent = v; };
    for (const [id, c] of want) {
      let el = ops.els.get(id);
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'ops-pop'; el.dataset.action = 'select-agent'; el.dataset.id = id; el.dataset.pop = id;
        el.innerHTML = '<img alt=""><span class="ops-who"><strong></strong><small></small><span class="ops-foot"></span></span><em class="ops-chip"></em><span class="ops-doing"><i></i><span></span></span><span class="ops-say"></span>';
        el.style.visibility = 'hidden'; ops.layer.appendChild(el); ops.els.set(id, el);
      }
      el.dataset.tone = c.tone || 'work';
      const img = el.firstChild; if (img.dataset.src !== c.img) { img.dataset.src = c.img || ''; img.src = c.img || ''; }
      put(el.querySelector('.ops-who strong'), c.name); put(el.querySelector('.ops-who small'), c.role); put(el.querySelector('.ops-chip'), c.chip);
      put(el.querySelector('.ops-doing span'), c.doing); put(el.querySelector('.ops-foot'), c.foot);
      // What the agent last said in the run (speech balloon), next to what it is doing.
      put(el.querySelector('.ops-say'), c.say);
      const ic = el.querySelector('.ops-doing i'); if (ic.dataset.ico !== c.ico) { ic.dataset.ico = c.ico || ''; ic.innerHTML = c.ico || ''; }
      const label = `${c.name}, ${c.role}: ${c.chip}. ${c.doing}${c.say ? `. "${c.say}"` : ''}`; if (el.getAttribute('aria-label') !== label) { el.setAttribute('aria-label', label); el.title = label; }
    }
  }

  // Badges over the heads: a small pill (icon + label) with transmission waves, pinned to the agent's visual position.
  function placeLifeBadges() {
    if (!life.layer) { if (!life.actors.size) return; life.layer = document.createElement('div'); life.layer.className = 'life-layer'; life.layer.setAttribute('aria-hidden', 'true'); viewport.appendChild(life.layer); }
    const want = new Map([...life.actors.values()].filter(ac => ac.badge).map(ac => [ac.id, ac.badge]));
    for (const [id, el] of life.els) if (want.get(id) !== el.dataset.kind) { el.remove(); life.els.delete(id); }
    for (const [id, kind] of want) {
      let el = life.els.get(id);
      if (!el) { el = document.createElement('div'); el.className = `life-badge ${kind}`; el.dataset.kind = kind; el.innerHTML = `<i></i><svg viewBox="0 0 24 24">${LIFE_ICON[kind]}</svg><b>DEMO</b><span>${LIFE_LABEL[kind]}</span>`; life.layer.appendChild(el); life.els.set(id, el); }
      const a = scene.find(x => x.id === id), p = a && agentPoint(a);
      if (!p || p.behind || mode !== 'office') { el.style.visibility = 'hidden'; continue; }
      el.style.visibility = ''; el.style.left = `${p.x.toFixed(1)}px`; el.style.top = `${p.y.toFixed(1)}px`;
    }
  }

  /* ---------- move mode (bubble "Deslocar"): the next click on a free hex or desk moves the agent there ---------- */
  const MOVE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>';
  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sameTarget = (a, b) => a === b || (!!a && !!b && (typeof a === 'string' || typeof b === 'string' ? a === b : hexKey(a) === hexKey(b)));
  function whoAt(target) {
    const a = scene.find(x => mode === 'office' ? x.desk === target : inGrid(x.hex) && hexKey(x.hex) === hexKey(target)); if (a) return a.name;
    const id = mode === 'office' ? occupiedDesks.get(target) : occupied.get(hexKey(target)); return (id && occupiedNames.get(id)) || '';
  }
  function startMove(id) {
    lifeReset(); // everyone back at their desks, so the free spots are the real ones
    const a = scene.find(x => x.id === id); if (!a || paused || linkMode) return;
    if (moving) cancelMove();
    moving = { id, target: null };
    if (!moveHint) {
      moveHint = document.createElement('div'); moveHint.className = 'map-move-hint'; viewport.appendChild(moveHint);
      moveHint.addEventListener('click', e => { if (e.target.closest('[data-move-cancel]')) cancelMove(); });
      moveTip = document.createElement('div'); moveTip.className = 'map-move-tip'; moveTip.hidden = true; viewport.appendChild(moveTip);
    }
    moveHint.innerHTML = `${MOVE_SVG}<strong>DESLOCANDO ${escHtml(a.name)}</strong><span>Clique em ${mode === 'office' ? 'uma mesa livre' : 'um hexágono livre'}</span><button type="button" data-move-cancel>Cancelar</button>`;
    moveHint.hidden = false; viewport.classList.add('map-moving'); gl?.sync(); updatePositions(); invalidate();
  }
  function cancelMove() {
    if (!moving) return; moving = null; viewport.classList.remove('map-moving', 'hex-hover-empty');
    if (moveHint) { moveHint.hidden = true; moveTip.hidden = true; }
    gl?.hover(null); gl?.sync(); updatePositions(); invalidate();
  }
  function moveTipText(target, valid) {
    const self = scene.find(x => x.id === moving.id), mine = !!self && (mode === 'office' ? self.desk === target : inGrid(self.hex) && hexKey(self.hex) === hexKey(target)), who = !valid && whoAt(target);
    if (mode === 'office') { const sl = SLOT_BY_ID.get(target), room = ROOM_BY_CODE.get(sl.room)?.name || sl.room; return `Mesa ${target} · ${room} · ${mine ? 'posição atual' : valid ? 'livre' : 'ocupada' + (who ? ' por ' + who : '')}`; }
    return mine ? 'Posição atual' : valid ? 'Slot livre' : 'Ocupado' + (who ? ' por ' + who : '');
  }
  // Hover in move mode: the agent previews the free target under the cursor, and a tip names the spot.
  function moveHover(p, target) {
    const valid = !!target && isFree(target, moving.id), prev = moving.target;
    moving.target = valid ? target : null;
    gl?.hover(target, valid); viewport.classList.toggle('hex-hover-empty', valid);
    if (!target) moveTip.hidden = true;
    else { moveTip.hidden = false; moveTip.classList.toggle('bad', !valid); moveTip.textContent = moveTipText(target, valid); moveTip.style.left = `${Math.min(p.x + 16, width - moveTip.offsetWidth - 8)}px`; moveTip.style.top = `${p.y + 18}px`; }
    if (!sameTarget(prev, moving.target)) { gl?.sync(); updatePositions(); }
    invalidate();
  }
  function commitMove(target) {
    const id = moving.id, a = scene.find(x => x.id === id); cancelMove(); if (!a) return;
    if (mode === 'office') { if (a.desk === target) return; a.desk = target; onPosition(id, { desk: target }); }
    else { if (inGrid(a.hex) && hexKey(a.hex) === hexKey(target)) return; a.hex = { ...target }; onPosition(id, { hex: { ...target } }); gl?.pulseAt(target); }
    gl?.sync(); updatePositions(); invalidate();
  }

  /* ---------- pointer interaction ---------- */
  let dragging = null, pointers = new Map(), pinchDistance = 0, lastTap = { t: 0, x: 0, y: 0 }, lastPanMoved = false;
  viewport.addEventListener('contextmenu', e => e.preventDefault());
  viewport.addEventListener('wheel', event => { if (document.getElementById('modalRoot').children.length) return; event.preventDefault(); const p = local(event); zoom(Math.exp(-event.deltaY * .0012), p.x, p.y); }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    // The quick-action bubbles of the selected agent and the run popups are plain buttons: no pan, no capture, no empty click.
    if (event.target.closest('.node-actions,.map-move-hint,.ops-pop')) return;
    if (event.pointerType === 'touch') { pointers.set(event.pointerId, local(event)); if (pointers.size === 2) { dragging = null; const p = [...pointers.values()]; pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); return; } }
    const node = event.target.closest('.map-node,.agent-card');
    // Click-and-hold drags an agent between desks (office) or hexes (city).
    if (node && event.button !== 0) return;
    if (event.button !== 0 && event.button !== 2) return;
    const p = local(event), c0 = mode === 'office' ? ocam : cam;
    dragging = { mode: node ? 'node' : event.button === 2 ? 'rotate' : 'pan', x: p.x, y: p.y, start: groundAt(p.x, p.y), theta: c0.theta, phi: cam.phi, nodeId: node ? node.dataset.node || node.dataset.card : null, hex: null, desk: null, moved: false, type: event.pointerType, button: event.button, pointerId: event.pointerId, captured: false };
    // A plain click on a node must still reach the button (select / double click), so capture only once it moves.
    if (!node) { viewport.setPointerCapture(event.pointerId); viewport.classList.add('dragging'); dragging.captured = true; }
    if (node) event.preventDefault();
  });
  viewport.addEventListener('pointermove', event => {
    const p = local(event);
    if (pointers.has(event.pointerId)) { pointers.set(event.pointerId, p); if (pointers.size === 2) { const q = [...pointers.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y); if (pinchDistance > 0) zoom(d / pinchDistance, (q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2); pinchDistance = d; return; } }
    if (!dragging) {
      if (moving) { moveHover(p, event.target.closest('.map-node,.agent-card,.node-actions,.map-move-hint,.ops-pop') ? null : targetAt(p.x, p.y)); return; }
      if (event.target.closest('.map-node,.agent-card,.node-actions,.ops-pop')) { gl?.hover(null); viewport.classList.remove('hex-hover-empty', 'war-hover'); invalidate(); return; }
      const target = targetAt(p.x, p.y), empty = !!target && isFree(target);
      gl?.hover(target, empty); viewport.classList.toggle('hex-hover-empty', empty); viewport.classList.toggle('war-hover', !target && warAt(p.x, p.y)); invalidate(); return;
    }
    const dx = p.x - dragging.x, dy = p.y - dragging.y; if (!dragging.moved && Math.abs(dx) + Math.abs(dy) > 5) { dragging.moved = true; if (dragging.mode === 'node') lifeRelease(dragging.nodeId); }
    if (dragging.mode === 'node' && !dragging.moved) return;
    if (!dragging.captured) { dragging.captured = true; viewport.setPointerCapture(dragging.pointerId); viewport.classList.add('dragging'); }
    if (dragging.mode === 'node') {
      const target = targetAt(p.x, p.y);
      // The marker previews only a valid drop target; over an occupied spot it stays at its own place.
      const valid = target && isFree(target, dragging.nodeId) ? target : null;
      if (mode === 'office') dragging.desk = valid; else dragging.hex = valid;
      gl?.hover(target, !!target && isFree(target, dragging.nodeId)); gl?.sync(); updatePositions();
    } else if (dragging.mode === 'rotate') {
      if (mode === 'office') ocam.theta = dragging.theta - dx * .006;
      else { cam.theta = dragging.theta - dx * .006; cam.phi = Math.max(.5, Math.min(1.22, dragging.phi + dy * .004)); }
      commitCamera();
    } else if (!dragging.start && mode === 'city' && planet.b > .999) {
      // Grabbed off the planet: spin it by the screen delta (right = world moves right, down = the surface rolls toward you).
      const k = cam.distance / height * 1.1, ddx = p.x - (dragging.lx ?? dragging.x), ddy = p.y - (dragging.ly ?? dragging.y), c = Math.cos(cam.theta), sn = Math.sin(cam.theta);
      dragging.lx = p.x; dragging.ly = p.y; cam.tx += (-ddx * c - ddy * sn) * k; cam.tz += (ddx * sn - ddy * c) * k; clampTarget(cam); commitCamera();
    } else if (dragging.start) {
      if (gl) gl.applyCamera(); const at = groundAt(p.x, p.y), c0 = mode === 'office' ? ocam : cam;
      if (at) { c0.tx += dragging.start.x - at.x; c0.tz += dragging.start.z - at.z; clampTarget(c0); }
      commitCamera();
    }
  });
  const pointerEnd = event => {
    pointers.delete(event.pointerId); if (pointers.size < 2) pinchDistance = 0;
    if (!dragging) return;
    const d = dragging; dragging = null; viewport.classList.remove('dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (d.mode === 'node') {
      const a = scene.find(x => x.id === d.nodeId);
      if (a && d.moved && mode === 'office' && d.desk && isFreeDesk(d.desk, a.id) && d.desk !== a.desk) { a.desk = d.desk; onPosition(a.id, { desk: d.desk }); }
      else if (a && d.moved && mode === 'city' && d.hex && isFreeHex(d.hex, a.id) && hexKey(d.hex) !== hexKey(a.hex)) { a.hex = { ...d.hex }; onPosition(a.id, { hex: { ...d.hex } }); gl?.pulseAt(d.hex); }
      gl?.sync(); updatePositions(); invalidate(); return;
    }
    // Double tap on touch screens creates an agent, like a double click with the mouse.
    if (d.type === 'touch' && !d.moved && event.type === 'pointerup' && !moving) {
      const p = local(event), t = now();
      if (t - lastTap.t < 350 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24) { lastTap.t = 0; createAt(p.x, p.y); } else lastTap = { t, x: p.x, y: p.y };
    }
    // A plain click on an empty spot (a desk/hex without a squad agent, or bare floor) clears the selection.
    if (d.mode === 'pan' && !d.moved && d.button === 0 && event.type === 'pointerup') {
      const p = local(event), target = targetAt(p.x, p.y);
      // Move mode: a click on a free target moves the agent; anywhere else it only shakes the tip.
      if (moving) { if (target && isFree(target, moving.id)) commitMove(target); else { moveHover(p, target); moveTip.classList.remove('flash'); void moveTip.offsetWidth; moveTip.classList.add('flash'); } lastPanMoved = d.moved; return; }
      const busy = target && (mode === 'office' ? scene.some(a => a.desk === target) : scene.some(a => inGrid(a.hex) && hexKey(a.hex) === hexKey(target)));
      // City: a click on a free slot clears its buildings (only the ground stays); the same slot again, an agent's slot or
      // anywhere outside the grid brings them back.
      if (mode === 'city') { const next = target && !busy && isFreeHex(target) && !(pickedHex && hexKey(pickedHex) === hexKey(target)) ? { ...target } : null; if (JSON.stringify(next) !== JSON.stringify(pickedHex)) { pickedHex = next; gl?.sync(); } }
      // Office: a click on the War Room floor opens the operation room (it has no seats, so nothing else competes for it).
      if (!target && warAt(p.x, p.y)) { onRoomClick('WAR'); lastPanMoved = d.moved; return; }
      if (!busy) onEmptyClick();
    }
    lastPanMoved = d.moved;
  };
  viewport.addEventListener('pointerup', pointerEnd); viewport.addEventListener('pointercancel', pointerEnd);
  viewport.addEventListener('pointerleave', () => { if (!dragging) { gl?.hover(null); viewport.classList.remove('hex-hover-empty', 'war-hover'); invalidate(); } });
  function createAt(sx, sy) { const target = targetAt(sx, sy); if (!target || !isFree(target)) return; onCreateAt(mode === 'office' ? { desk: target } : { hex: { ...target } }); }
  viewport.addEventListener('dblclick', event => { if (event.target.closest('.map-node,.agent-card,.node-actions,.map-move-hint,.ops-pop') || lastPanMoved || moving) return; const p = local(event); createAt(p.x, p.y); });

  /* ---------- render loop ---------- */
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || paused) return;
    // A long frame (e.g. a first render compiling shaders) pauses the tweens instead of letting them skip to the end.
    for (const tw of tweens) { if (tw.last && t - tw.last > 100) tw.t0 += t - tw.last - 17; tw.last = t; }
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i], k = Math.min(1, (t - tw.t0) / tw.duration); tw.step(k); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
    const continuous = gl && !reducedMotion();
    if (!needsRender && !tweens.length && !continuous) return;
    // Interaction and tweens draw on every frame; the ambient animations follow the pacing mode.
    const ambient = continuous && !needsRender && !tweens.length;
    // Half rate: every other vsync at 60 Hz, yet every tick when the browser itself already runs at 30 Hz (26 ms sits between them).
    if (ambient && pacing.mode === 'half' && t - lastFrame < 26) return;
    if (ambient && lastFrame && t - lastFrame < 250) {
      const dt = t - lastFrame; gl.measure(dt); pacing.n++; pacing.sum += dt; if (dt > 24) pacing.late++;
      if (pacing.n >= 90) { pacing.avg = pacing.sum / pacing.n; if (pacing.mode === 'full' && pacing.late / pacing.n > .15) pacing.mode = 'half'; pacing.n = pacing.sum = pacing.late = 0; }
    }
    lastFrame = t; needsRender = false;
    const lifeMoved = lifeTick(t);
    if (gl) { gl.animate(t); gl.render(); }
    if (tweens.length || lifeMoved) updatePositions();
  }
  viewport.dataset.view = mode;
  resize(); requestAnimationFrame(frame); window.addEventListener('resize', resize);

  return {
    set(data) {
      scene = data.agents; links = data.links || []; selected = data.selected; linkMode = !!data.handoffMode; motion = !!data.motion;
      running = { id: data.running?.id || '', paused: !!data.running?.paused, phase: data.running?.phase || '' };
      const wasPaused = paused; paused = !!data.paused;
      // The frame loop stops behind the Painel: a transmorph in progress (and the buildings' wave) ends at once instead of freezing.
      if (paused || reducedMotion()) { finishMorph(); finishCurl(); gl?.finishRise(); }
      // City shape: instant on boot, behind the Painel or with reduced motion; otherwise the city rolls into the planet (or back).
      gl?.setQuality(data.mapQuality);
      const shape = data.cityShape === 'planet' && gl ? 'planet' : 'flat';
      if (shape !== planet.want) setShape(shape, booted && !paused && !reducedMotion() && !morphing);
      occupied = new Map((data.occupied || []).filter(o => inGrid(o.hex)).map(o => [hexKey(o.hex), o.id]));
      occupiedDesks = new Map((data.occupied || []).filter(o => SLOT_BY_ID.has(o.desk)).map(o => [o.desk, o.id]));
      occupiedNames = new Map((data.occupied || []).map(o => [o.id, o.name || '']));
      if (moving && (paused || linkMode || !scene.some(a => a.id === moving.id))) cancelMove();
      if (paused || linkMode || !motion) lifeReset();
      if (data.ops) applyOps(data.ops);
      if (gl) gl.sync(); updatePositions(); invalidate();
      if (!booted && gl) setTimeout(() => (window.requestIdleCallback || setTimeout)(() => { gl?.prepareOffice(); ensureMorphLayers(); }), 1200);
      booted = true;
      if (wasPaused && !paused) commitCamera();
    },
    setMode, getMode: () => mode,
    // Width covered on the left by a docked panel (px, 0 = none); morphs and curls pick it up when they commit their camera.
    // The zoom follows the home framing (homePose, measured before and after on the current view), so widening the dock never hides
    // the scene behind it and a framing limited by the height is left alone.
    setInset(px) {
      const v = Math.max(0, Math.round(+px || 0)); if (v === insetL) return;
      if (!booted || morphing || curling) { insetL = v; return; }
      const c = mode === 'office' ? ocam : cam, saved = { ...c };
      homePose(); const b0 = c.base; insetL = v; homePose(); const k = c.base / b0; Object.assign(c, saved);
      if (Number.isFinite(k) && k > 0 && k !== 1) { if (c === ocam) ocam.zoom *= k; else cam.distance *= k; c.base *= k; }
      commitCamera();
    },
    // City graphics quality (setting + automatic level), for the settings and the tests.
    get quality() { return gl ? gl.quality() : null; },
    // Ambient frame pacing ('full' every vsync, 'half' every other) and the last measured average interval (tests).
    get pacing() { return { mode: pacing.mode, avg: +pacing.avg.toFixed(1) }; },
    // The free slot cleared by a click (tests).
    get picked() { return pickedHex ? { ...pickedHex } : null; },
    startMove, cancelMove, isMoving: () => moving?.id || null,
    // Office life inspection / trigger (tests and debugging).
    officeLife: { state: () => ({ on: lifeOn(), acts: life.acts.map(a => ({ kind: a.kind, ops: a.ops || null, peer: a.peer || null, state: a.state, members: [...a.members] })), actors: [...life.actors.values()].map(ac => ({ id: ac.id, walking: !!ac.path, x: +ac.pos.x.toFixed(2), z: +ac.pos.z.toFixed(2), badge: ac.badge })), ops: { run: ops.data?.run || null, queue: ops.queue.length, pops: [...ops.els.keys()], tags: [...ops.tagEls.keys()], callLinks: runLinks.length, city: gl?.runState() || null } }), kick: kind => lifeOn() && lifeStart(kind) },
    // The run on the map (app: officeOps/officeFeed): popups, holds and errands (office), glow, call links and comets (city).
    // live: 'office' | 'city' while one is watched with motion (the demo spaces its beats); settled: nobody is still on the way.
    ops(d) { applyOps(d); updatePositions(); invalidate(); },
    officeOps: { live: () => document.hidden ? '' : lifeOn() ? 'office' : cityFxOn() ? 'city' : '', settled: opsSettled },
    home() { if (!morphing && !curling) home(); }, zoom, rotate, updatePositions, focus,
    // Planet mode inspection / manual blend (tests and debugging).
    planet: { state: () => ({ b: planet.b, want: planet.want, curling }), blend(b) { if (!gl) return; finishCurl(); planet.b = Math.max(0, Math.min(1, b)); gl.setPlanet(planet.b); commitCamera(); } },
    hexCenter(q, r) { const w = hexToWorld(q, r); const p = projectWorld(w.x, TILE_H, w.z); return { x: p.x, y: p.y }; },
    hexAt(sx, sy) { return hexAtScreen(sx, sy); },
    deskCenter(id) { const sl = SLOT_BY_ID.get(id); if (!sl) return null; const seat = seatOf(sl), p = projectWorld(seat.x, .05, seat.z); return { x: p.x, y: p.y }; },
    deskAt(sx, sy) { return deskAtScreen(sx, sy); },
    deskStatus(id) { return gl?.deskStatus(id) || null; },
    officeSlots() { return SLOTS.map(sl => ({ id: sl.id, room: sl.room })); },
    officeRooms() { return ROOMS.map(r => ({ code: r.code, name: r.name })); },
    pulse(agentId) { const a = scene.find(x => x.id === agentId); if (a && gl && mode === 'city' && inGrid(a.hex)) gl.pulseAt(a.hex); },
    onPosition(fn) { onPosition = fn; },
    onCreateAt(fn) { onCreateAt = fn; },
    onEmptyClick(fn) { onEmptyClick = fn; },
    onRoomClick(fn) { onRoomClick = fn; },
    // Projected centre of a room's floor in the office (tests).
    roomCenter(code) { const r = ROOM_BY_CODE.get(code); if (!r) return null; const p = projectWorld(r.x + r.w / 2, .05, r.z + r.d / 2); return { x: p.x, y: p.y }; },
    getCamera() { return mode === 'office' ? { ...ocam, scale: ocam.zoom / ocam.base, webgl: !!gl, mode } : { ...cam, scale: cam.base / cam.distance, webgl: !!gl, mode }; },
    GRID, inGrid, hexDistance, hexKey, hexToWorld
  };
})();
