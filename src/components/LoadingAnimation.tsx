import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const LoadingAnimation = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const frameIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x000000);

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.z = 5;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        rendererRef.current = renderer;

        // Important: Set size after creation
        const updateSize = () => {
            const width = mountRef.current?.clientWidth || window.innerWidth;
            const height = mountRef.current?.clientHeight || window.innerHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        updateSize();
        mountRef.current.appendChild(renderer.domElement);

        // Create cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xCFB991
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // Animation
        const animate = () => {
            frameIdRef.current = requestAnimationFrame(animate);
            if (!cube || !renderer || !scene || !camera) return;

            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;

            renderer.render(scene, camera);
        };

        // Start animation
        animate();

        // Handle window resize
        window.addEventListener('resize', updateSize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', updateSize);

            if (frameIdRef.current) {
                cancelAnimationFrame(frameIdRef.current);
            }

            if (mountRef.current && rendererRef.current) {
                mountRef.current.removeChild(rendererRef.current.domElement);
            }

            geometry.dispose();
            material.dispose();

            if (rendererRef.current) {
                rendererRef.current.dispose();
            }

            // Clear refs
            sceneRef.current = null;
            rendererRef.current = null;
        };
    }, []);

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">
            <div ref={mountRef} className="w-full h-[60vh]" />
            <p className="mt-4 text-xl text-white">Loading data...</p>
        </div>
    );
};

export default LoadingAnimation;