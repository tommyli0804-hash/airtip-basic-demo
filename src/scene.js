
import * as THREE from 'three';

export function createScene(canvas) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({canvas});
    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.position.z = 5;

    // 添加光
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5,5,5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    // 只添加三个基础体
    const geometrySphere = new THREE.SphereGeometry(0.5, 32, 32);
    const materialSphere = new THREE.MeshStandardMaterial({color: 0x00ff00});
    const sphere = new THREE.Mesh(geometrySphere, materialSphere);
    sphere.position.x = -2;
    scene.add(sphere);

    const geometryBox = new THREE.BoxGeometry(1,1,1);
    const materialBox = new THREE.MeshStandardMaterial({color: 0xff0000});
    const box = new THREE.Mesh(geometryBox, materialBox);
    scene.add(box);

    const geometryCylinder = new THREE.CylinderGeometry(0.5,0.5,1,32);
    const materialCylinder = new THREE.MeshStandardMaterial({color: 0x0000ff});
    const cylinder = new THREE.Mesh(geometryCylinder, materialCylinder);
    cylinder.position.x = 2;
    scene.add(cylinder);

    // 渲染循环
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    return {scene, camera, renderer, objects: [sphere, box, cylinder]};
}
