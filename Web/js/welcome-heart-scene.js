/**
 * Static 3D heart for the welcome hero — one WebGL frame, no animation loop.
 * Loads Three.js on demand; falls back to CSS gradient when WebGL or motion is unavailable.
 */

let threeLoadPromise = null;
/** @type {{ renderer: import('three').WebGLRenderer, onResize: () => void, container: HTMLElement } | null} */
let activeScene = null;

function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function supportsWebGL() {
    try {
        const canvas = document.createElement('canvas');
        return !!(
            window.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        );
    } catch {
        return false;
    }
}

function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!threeLoadPromise) {
        threeLoadPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-clinical-three]');
            if (existing) {
                existing.addEventListener('load', () =>
                    window.THREE ? resolve(window.THREE) : reject(new Error('THREE missing'))
                );
                existing.addEventListener('error', () => reject(new Error('three.js failed')));
                return;
            }
            const script = document.createElement('script');
            script.crossOrigin = 'anonymous';
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.async = true;
            script.dataset.clinicalThree = '1';
            script.onload = () =>
                window.THREE ? resolve(window.THREE) : reject(new Error('THREE missing'));
            script.onerror = () => reject(new Error('three.js failed'));
            document.head.appendChild(script);
        });
    }
    return threeLoadPromise;
}

/** @param {typeof import('three')} THREE */
function buildHeartMesh(THREE) {
    const x = 0;
    const y = 0;
    const shape = new THREE.Shape();
    shape.moveTo(x + 0.5, y + 0.5);
    shape.bezierCurveTo(x + 0.5, y + 0.5, x + 0.4, y, x, y);
    shape.bezierCurveTo(x - 0.6, y, x - 0.6, y - 0.7, x - 0.6, y - 0.7);
    shape.bezierCurveTo(x - 0.6, y - 1.1, x - 0.2, y - 1.54, x + 0.5, y - 1.9);
    shape.bezierCurveTo(x + 1.2, y - 1.54, x + 1.6, y - 1.1, x + 1.6, y - 0.7);
    shape.bezierCurveTo(x + 1.6, y - 0.7, x + 1.6, y, x + 1.0, y);
    shape.bezierCurveTo(x + 0.7, y + 0.5, x + 0.5, y + 0.5, x + 0.5, y + 0.5);

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.38,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.08,
        bevelSegments: 4,
        curveSegments: 24
    });
    geo.center();
    geo.rotateX(Math.PI);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x06364a,
        roughness: 0.38,
        metalness: 0.12
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = Math.PI * 0.14;
    mesh.rotation.z = -0.06;
    return { mesh, geo, mat };
}

/**
 * @param {HTMLElement} host
 */
export async function initWelcomeHeartScene(host) {
    if (!host) return;
    disposeWelcomeHeartScene();

    if (prefersReducedMotion() || !supportsWebGL()) {
        host.classList.add('heart-scene-fallback');
        return;
    }

    host.classList.remove('heart-scene-fallback');

    let THREE;
    try {
        THREE = await loadThree();
    } catch {
        host.classList.add('heart-scene-fallback');
        return;
    }

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'welcome-heart-canvas-wrap';
    host.appendChild(canvasWrap);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    canvasWrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xd6f3ff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(4, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x7dd3fc, 0.55, 40);
    rim.position.set(-5, 2, 6);
    scene.add(rim);

    const { mesh, geo, mat } = buildHeartMesh(THREE);
    scene.add(mesh);

    const renderOnce = () => {
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        if (w < 1 || h < 1) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);

        const isNarrow = w < 720;
        mesh.position.set(isNarrow ? 0.35 : 1.55, isNarrow ? -0.2 : -0.05, 0);
        camera.position.set(isNarrow ? 0.15 : -0.35, 0.1, isNarrow ? 5.4 : 4.8);
        camera.lookAt(isNarrow ? 0.35 : 1.55, 0, 0);

        renderer.render(scene, camera);
    };

    const onResize = () => renderOnce();
    window.addEventListener('resize', onResize);

    requestAnimationFrame(() => {
        requestAnimationFrame(renderOnce);
    });

    activeScene = {
        renderer,
        geo,
        mat,
        mesh,
        onResize,
        container: host,
        canvasWrap
    };
}

export function disposeWelcomeHeartScene() {
    if (!activeScene) {
        const host = document.getElementById('welcome-heart-host');
        if (host) {
            host.classList.remove('heart-scene-fallback');
            host.replaceChildren();
        }
        return;
    }

    window.removeEventListener('resize', activeScene.onResize);
    activeScene.geo?.dispose();
    activeScene.mat?.dispose();
    activeScene.renderer?.dispose();
    activeScene.container?.classList.remove('heart-scene-fallback');
    activeScene.container?.replaceChildren();
    activeScene = null;
}
