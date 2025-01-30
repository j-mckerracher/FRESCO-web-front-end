// src/components/LoadingAnimation.tsx

import React, { useEffect, useRef } from 'react';
import type {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    Mesh,
    CircleGeometry,
    RingGeometry,
    MeshPhongMaterial
} from 'three';

interface LoadingAnimationProps {
    currentStage?: string;
    progress?: number;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
                                                               currentStage = "Initializing...",
                                                               progress = 0
                                                           }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const ringRef = useRef<Mesh | null>(null);
    const progressIndicatorRef = useRef<Mesh | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
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

                // Store refs
                rendererRef.current = renderer;
                sceneRef.current = scene;
                cameraRef.current = camera;
                ringRef.current = ring;
                progressIndicatorRef.current = progressIndicator;

                // Start animation
                const animate = () => {
                    if (!ringRef.current || !progressIndicatorRef.current || !sceneRef.current || !rendererRef.current || !cameraRef.current) return;

                    animationFrameRef.current = requestAnimationFrame(animate);

                    // Rotate ring
                    ringRef.current.rotation.z -= 0.01;

                    // Update progress indicator geometry
                    if (progressIndicatorRef.current) {
                        const currentProgress = progress / 100;
                        const newGeometry = new THREE.CircleGeometry(4, 32, 0, Math.PI * 2 * currentProgress);
                        progressIndicatorRef.current.geometry.dispose();
                        progressIndicatorRef.current.geometry = newGeometry;
                    }

                    rendererRef.current.render(sceneRef.current, cameraRef.current);
                };

                animate();

                // Handle window resize
                const handleResize = () => {
                    if (!cameraRef.current || !rendererRef.current) return;

                    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
                    cameraRef.current.updateProjectionMatrix();
                    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
                };

                window.addEventListener('resize', handleResize);

                return () => {
                    window.removeEventListener('resize', handleResize);
                    if (animationFrameRef.current) {
                        cancelAnimationFrame(animationFrameRef.current);
                    }
                    if (containerRef.current && rendererRef.current) {
                        containerRef.current.removeChild(rendererRef.current.domElement);
                    }
                    // Clean up geometries and materials
                    ringGeometry.dispose();
                    ringMaterial.dispose();
                    progressGeometry.dispose();
                    progressMaterial.dispose();
                    renderer.dispose();
                };
            } catch (err) {
                console.error('Error setting up Three.js:', err);
            }
        };

        initThree();
    }, []);

    // Update progress indicator when progress changes
    useEffect(() => {
        const updateProgress = async () => {
            if (progressIndicatorRef.current && sceneRef.current) {
                const THREE = await import('three');
                const currentProgress = progress / 100;
                const newGeometry = new THREE.CircleGeometry(4, 32, 0, Math.PI * 2 * currentProgress);
                progressIndicatorRef.current.geometry.dispose();
                progressIndicatorRef.current.geometry = newGeometry;
            }
        };
        updateProgress();
    }, [progress]);

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