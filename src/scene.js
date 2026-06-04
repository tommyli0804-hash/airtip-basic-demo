
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene(canvas) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5,5,5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    // OrbitControls 保留
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    camera.position.set(0,2,5);
    orbit.update();

    // 只保留三个基础体
    const objects = [];

    const geometrySphere = new THREE.SphereGeometry(0.5, 32, 32);
    const materialSphere = new THREE.MeshStandardMaterial({color: 0x00ff00});
    const sphere = new THREE.Mesh(geometrySphere, materialSphere);
    sphere.position.x = -2;
    scene.add(sphere);
    objects.push(sphere);

    const geometryBox = new THREE.BoxGeometry(1,1,1);
    const materialBox = new THREE.MeshStandardMaterial({color: 0xff0000});
    const box = new THREE.Mesh(geometryBox, materialBox);
    scene.add(box);
    objects.push(box);

    const geometryCylinder = new THREE.CylinderGeometry(0.5,0.5,1,32);
    const materialCylinder = new THREE.MeshStandardMaterial({color: 0x0000ff});
    const cylinder = new THREE.Mesh(geometryCylinder, materialCylinder);
    cylinder.position.x = 2;
    scene.add(cylinder);
    objects.push(cylinder);

    // 渲染循环
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
        orbit.update();
    }
    animate();

    return {scene, camera, renderer, objects, orbit};
}
