import React, { useEffect, useRef, useState } from 'react';

type LoadingStage = {
    name: string;
    progress: number;
};

interface LoadingAnimationProps {
    currentStage?: string;
    progress?: number;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
                                                               currentStage = "Initializing...",
                                                               progress = 0
                                                           }) => {
    const containerRef = useRef(null);
    const requestIdRef = useRef(null);
    const [error, setError] = useState(null);
    const [isThreeLoaded, setIsThreeLoaded] = useState(false);

    useEffect(() => {
        console.log('LoadingAnimation mounted with progress:', progress);
        let cleanup = () => {};

        const initThree = async () => {
            try {
                const THREE = await import('three');

                if (!containerRef.current) return;

                // Scene setup
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
                const renderer = new THREE.WebGLRenderer({
                    antialias: true,
                    alpha: true
                });

                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setClearColor(0x000000, 0);
                containerRef.current.appendChild(renderer.domElement);

                // Create progress ring
                const ringGeometry = new THREE.RingGeometry(4, 5, 64);
                const ringMaterial = new THREE.MeshPhongMaterial({
                    color: 0xCFB991,
                    side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                scene.add(ring);

                // Create progress indicator
                const progressGeometry = new THREE.CircleGeometry(4, 32, 0, Math.PI * 2 * (progress / 100));
                const progressMaterial = new THREE.MeshPhongMaterial({
                    color: 0xCFB991,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.3
                });
                const progressIndicator = new THREE.Mesh(progressGeometry, progressMaterial);
                scene.add(progressIndicator);

                // Add lights
                const pointLight = new THREE.PointLight(0xffffff, 1);
                pointLight.position.set(10, 10, 10);
                scene.add(pointLight);

                const ambientLight = new THREE.AmbientLight(0x404040);
                scene.add(ambientLight);

                // Position camera
                camera.position.z = 15;

                // Animation
                const animate = () => {
                    requestIdRef.current = requestAnimationFrame(animate);

                    // Rotate ring
                    ring.rotation.z -= 0.01;

                    // Update progress indicator
                    scene.remove(progressIndicator);
                    const newProgressGeometry = new THREE.CircleGeometry(4, 32, 0, Math.PI * 2 * (progress / 100));
                    progressIndicator.geometry.dispose();
                    progressIndicator.geometry = newProgressGeometry;
                    scene.add(progressIndicator);

                    renderer.render(scene, camera);
                };

                animate();

                // Handle window resize
                const handleResize = () => {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(window.innerWidth, window.innerHeight);
                };

                window.addEventListener('resize', handleResize);

                // Set up cleanup
                cleanup = () => {
                    if (requestIdRef.current) {
                        cancelAnimationFrame(requestIdRef.current);
                    }
                    window.removeEventListener('resize', handleResize);
                    if (containerRef.current) {
                        containerRef.current.removeChild(renderer.domElement);
                    }
                    ringGeometry.dispose();
                    ringMaterial.dispose();
                    progressGeometry.dispose();
                    progressMaterial.dispose();
                    renderer.dispose();
                };

                setIsThreeLoaded(true);

            } catch (err) {
                console.error('Error setting up Three.js:', err);
                setError(err.message);
            }
        };

        initThree();

        return () => cleanup();
    }, [progress]);

    if (error) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
                <div className="w-12 h-12 rounded-full bg-red-500" />
                <p className="mt-4 text-xl text-white">Error loading animation: {error}</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
            <div ref={containerRef} className="w-full h-full" />
            <p className="absolute bottom-16 text-xl text-white">
                {currentStage} ({progress}%)
            </p>
        </div>
    );
};

export default LoadingAnimation;