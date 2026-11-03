// Thư viện nhân vật: lưới thẻ + trình xem Gaussian splat (three.js + Spark).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

const LIB = "library/";
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* chế độ riêng tư */ } },
};

let characters = [];

// ---------------------------------------------------------------- danh sách
async function loadIndex() {
  try {
    const res = await fetch(LIB + "index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    characters = (await res.json()).characters || [];
  } catch (e) {
    console.warn("Không đọc được library/index.json", e);
    characters = [];
  }
  fillFilter("role", "Mọi vai trò");
  fillFilter("faction", "Mọi phe");
  render();
  openFromHash();
}

function fillFilter(key, label) {
  const values = [...new Set(characters.map((c) => c[key]).filter(Boolean))].sort();
  const sel = $(key);
  sel.innerHTML = `<option value="">${label}</option>` +
    values.map((v) => `<option>${esc(v)}</option>`).join("");
  sel.hidden = values.length === 0;
}

function matches(c) {
  const q = $("q").value.trim().toLowerCase();
  if ($("role").value && c.role !== $("role").value) return false;
  if ($("faction").value && c.faction !== $("faction").value) return false;
  if (!q) return true;
  return [c.name, c.id, c.role, c.faction, c.description, ...(c.tags || [])]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
}

function render() {
  const list = characters.filter(matches);
  $("count").textContent = characters.length
    ? `${list.length} / ${characters.length} nhân vật`
    : "Chưa có nhân vật";
  $("empty").hidden = characters.length > 0;
  $("grid").innerHTML = list.map((c) => `
    <button class="card" data-id="${esc(c.id)}">
      <div class="thumb">
        <img src="${esc(LIB + (c.thumbnail || c.source))}" alt="" loading="lazy">
        ${c.turntable ? `<video muted loop playsinline preload="none" data-src="${esc(LIB + c.turntable)}"></video>` : ""}
        ${c.demo ? `<span class="badge">demo</span>` : ""}
      </div>
      <div class="meta">
        <h3>${esc(c.name || c.id)}</h3>
        <p class="muted">${esc([c.role, c.faction].filter(Boolean).join(" · ") || " ")}</p>
      </div>
    </button>`).join("");
}

$("grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) location.hash = encodeURIComponent(card.dataset.id);
});
// Video xoay 360° chỉ tải khi rê chuột vào thẻ.
$("grid").addEventListener("pointerover", (e) => {
  const v = e.target.closest(".card")?.querySelector("video");
  if (!v) return;
  if (!v.src) {
    v.src = v.dataset.src;
    v.addEventListener("canplay", () => v.classList.add("ready"), { once: true });
  }
  v.play().catch(() => {});
});
$("grid").addEventListener("pointerout", (e) => {
  const v = e.target.closest(".card")?.querySelector("video");
  if (v && !e.relatedTarget?.closest?.(".card")?.contains(v)) v.pause();
});
for (const id of ["q", "role", "faction"]) $(id).addEventListener("input", render);

// ---------------------------------------------------------------- trình xem 3D
const BGS = ["#d9d5ce", "#16181b", "#ffffff", "#2b6cb0", "#00b140"];
let viewer = null;

function initViewer() {
  const canvas = $("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.5;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas.parentElement);

  renderer.setAnimationLoop(() => {
    if (!$("detail").open) return;
    controls.update();
    renderer.render(scene, camera);
  });
  return { renderer, scene, camera, controls, mesh: null, home: null, key: null, token: 0 };
}

function setBackground(i) {
  const color = BGS[i % BGS.length];
  viewer.scene.background = new THREE.Color(color);
  store.set("charlib.bg", String(i % BGS.length));
}

function fitCamera() {
  const { mesh, camera, controls } = viewer;
  mesh.updateMatrixWorld(true);
  const box = mesh.getBoundingBox(true).applyMatrix4(mesh.matrixWorld);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2;
  controls.target.copy(center);
  camera.position.set(center.x, center.y + radius * 0.15, center.z + dist);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.update();
  viewer.home = { pos: camera.position.clone(), target: center.clone() };
}

function applyFlip() {
  const flipped = store.get(`charlib.flip.${viewer.key}`);
  const on = flipped === null ? !!viewer.defaultFlip : flipped === "1";
  viewer.mesh.rotation.set(on ? Math.PI : 0, 0, 0);
  $("flip").setAttribute("aria-pressed", String(on));
}

async function showSplat({ url, fileBytes, fileName, key, flip }) {
  viewer ??= initViewer();
  if (viewer.scene.background === null) setBackground(Number(store.get("charlib.bg") || 0));
  const token = ++viewer.token;
  if (viewer.mesh) {
    viewer.scene.remove(viewer.mesh);
    viewer.mesh.dispose();
    viewer.mesh = null;
  }
  $("loading").hidden = false;
  $("loading").textContent = "Đang tải splat…";
  const mesh = new SplatMesh(url ? { url } : { fileBytes, fileName });
  try {
    await mesh.initialized;
  } catch (e) {
    if (token === viewer.token) $("loading").textContent = "Không tải được splat: " + e.message;
    return;
  }
  if (token !== viewer.token) { mesh.dispose(); return; }
  viewer.mesh = mesh;
  viewer.key = key;
  viewer.defaultFlip = flip;
  viewer.scene.add(mesh);
  applyFlip();
  fitCamera();
  $("loading").hidden = true;
}

$("spin").onclick = () => {
  viewer.controls.autoRotate = !viewer.controls.autoRotate;
  $("spin").setAttribute("aria-pressed", String(viewer.controls.autoRotate));
};
$("flip").onclick = () => {
  if (!viewer?.mesh) return;
  const now = $("flip").getAttribute("aria-pressed") !== "true";
  store.set(`charlib.flip.${viewer.key}`, now ? "1" : "0");
  applyFlip();
  fitCamera();
};
$("reset").onclick = () => {
  if (!viewer?.home) return;
  viewer.camera.position.copy(viewer.home.pos);
  viewer.controls.target.copy(viewer.home.target);
};
$("bg").onclick = () => setBackground(Number(store.get("charlib.bg") || 0) + 1);

// ---------------------------------------------------------------- hộp chi tiết
function openCharacter(c, src = { url: LIB + c.splat, key: c.id, flip: c.viewer?.flip }) {
  $("d-name").textContent = c.name || c.id;
  $("d-sub").textContent = [c.role, c.faction].filter(Boolean).join(" · ");
  $("d-desc").textContent = c.description || "";
  $("d-tags").innerHTML = (c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const img = $("d-src");
  img.hidden = !c.source;
  if (c.source) img.src = LIB + c.source;
  const dl = [
    ["splat", "Splat " + ext(c.splat), "primary"], ["glb", "Mesh .glb"], ["turntable", "Video"],
    ["source", "Ảnh gốc"],
  ].filter(([k]) => c[k]).map(([k, label, cls]) =>
    `<a class="btn ${cls || ""}" href="${esc(LIB + c[k])}" download>${label}</a>`).join("");
  $("d-dl").innerHTML = dl;
  const g = c.generation || {};
  $("d-gen").innerHTML = [
    ["Model", g.model], ["Seed", g.seed], ["Gaussian", g.num_gaussians?.toLocaleString("vi-VN")],
    ["Thời gian", g.seconds != null ? `${g.seconds} s` : null], ["Cập nhật", c.updatedAt?.slice(0, 10)],
  ].filter(([, v]) => v != null && v !== "").map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  if (!$("detail").open) $("detail").showModal();
  showSplat(src);
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const c = characters.find((x) => x.id === id);
  if (c) openCharacter(c);
  else if ($("detail").open && !id) $("detail").close();
}
addEventListener("hashchange", openFromHash);
$("close").onclick = () => $("detail").close();
$("detail").addEventListener("close", () => {
  if (location.hash) history.pushState("", document.title, location.pathname + location.search);
});

$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  openCharacter({ id: "file:" + f.name, name: f.name, description: "File trên máy của bạn — không tải lên đâu cả." },
    { fileBytes: bytes, fileName: f.name, key: "file:" + f.name });
  e.target.value = "";
});

function ext(p) { return p ? "." + p.split(".").pop() : ""; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

loadIndex();
