import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const container = document.getElementById("solar-stage");

if (container) {
  const overlay = document.createElement("div");
  overlay.className = "solar-stage-overlay";
  overlay.innerHTML = "Mission Control online. Planet clicks route into the existing Express pages.";
  container.appendChild(overlay);

  try {
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );
    camera.position.set(0, 18, 34);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.prepend(renderer.domElement);

    const label = document.createElement("div");
    label.className = "solar-stage-label";
    container.appendChild(label);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 14;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI / 1.9;

    scene.add(new THREE.AmbientLight(0x6f8cff, 0.42));

    const sunLight = new THREE.PointLight(0xffd16e, 2.2, 180, 1.2);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = THREE.MathUtils.randFloatSpread(180);
      starPositions[i + 1] = THREE.MathUtils.randFloatSpread(110);
      starPositions[i + 2] = THREE.MathUtils.randFloatSpread(180);
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85 })
    );
    scene.add(stars);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.25, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc14a })
    );
    scene.add(sun);

    const planetConfigs = [
      { name: "Mercury", color: 0xb8a580, size: 0.33, orbit: 4.2, speed: 0.023 },
      { name: "Venus", color: 0xe4cf99, size: 0.55, orbit: 6.1, speed: 0.018 },
      { name: "Earth", color: 0x58a7ff, size: 0.58, orbit: 8.2, speed: 0.014 },
      { name: "Mars", color: 0xcf6e44, size: 0.46, orbit: 10.4, speed: 0.011 },
      { name: "Jupiter", color: 0xd3b18f, size: 1.28, orbit: 14.2, speed: 0.0068 },
      { name: "Saturn", color: 0xe1cd97, size: 1.1, orbit: 18.2, speed: 0.0052, ring: true },
      { name: "Uranus", color: 0x9fe8ef, size: 0.86, orbit: 22.4, speed: 0.0038 },
      { name: "Neptune", color: 0x446dff, size: 0.82, orbit: 26.5, speed: 0.0029 },
    ];

    const orbitMaterial = new THREE.LineBasicMaterial({
      color: 0x24457e,
      transparent: true,
      opacity: 0.65,
    });

    const planets = [];
    const planetBaseUrl = container.dataset.planetBaseUrl || "/planet?planetName=";

    planetConfigs.forEach((config, index) => {
      const orbitCurve = new THREE.EllipseCurve(0, 0, config.orbit, config.orbit);
      const orbitPoints = orbitCurve.getPoints(200).map((point) => new THREE.Vector3(point.x, 0, point.y));
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
      scene.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(config.size, 32, 32),
        new THREE.MeshStandardMaterial({
          color: config.color,
          metalness: 0.05,
          roughness: 0.92,
        })
      );

      mesh.userData = {
        name: config.name,
        url: `${planetBaseUrl}${encodeURIComponent(config.name)}`,
      };

      if (config.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(config.size * 1.45, config.size * 2.15, 60),
          new THREE.MeshBasicMaterial({
            color: 0xc9b27b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
          })
        );
        ring.rotation.x = Math.PI / 2.6;
        mesh.add(ring);
      }

      scene.add(mesh);
      planets.push({
        ...config,
        mesh,
        angle: index * 0.8,
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredPlanet = null;

    function setPointer(event) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function updateHoverState(event) {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(planets.map((planet) => planet.mesh), false);
      hoveredPlanet = intersections[0]?.object || null;

      if (hoveredPlanet) {
        label.innerHTML = `<strong>${hoveredPlanet.userData.name}</strong><span>Click to open the planet page</span>`;
        label.classList.add("is-visible");
        renderer.domElement.style.cursor = "pointer";
      } else {
        label.classList.remove("is-visible");
        renderer.domElement.style.cursor = "";
      }
    }

    renderer.domElement.addEventListener("pointermove", updateHoverState);
    renderer.domElement.addEventListener("pointerleave", () => {
      hoveredPlanet = null;
      label.classList.remove("is-visible");
      renderer.domElement.style.cursor = "";
    });
    renderer.domElement.addEventListener("click", (event) => {
      updateHoverState(event);
      if (hoveredPlanet) {
        window.location.href = hoveredPlanet.userData.url;
      }
    });

    function onResize() {
      const { clientWidth, clientHeight } = container;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }

    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();

    function animate() {
      const elapsed = clock.getElapsedTime();
      controls.update();
      sun.rotation.y += 0.003;

      planets.forEach((planet) => {
        const angle = planet.angle + elapsed * planet.speed * 3.1;
        planet.mesh.position.set(
          Math.cos(angle) * planet.orbit,
          Math.sin(elapsed * planet.speed * 1.2) * 0.25,
          Math.sin(angle) * planet.orbit
        );
        planet.mesh.rotation.y += 0.01;
      });

      stars.rotation.y = elapsed * 0.01;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    animate();
  } catch (error) {
    overlay.textContent = "3D view unavailable on this browser. The rest of the lab content is still ready below.";
  }
}
