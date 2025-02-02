import React, { useEffect, useRef } from 'react';
import type {
    WebGLRenderer,
    PerspectiveCamera,
    LoadingManager
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
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const managerRef = useRef<LoadingManager | null>(null);

    useEffect(() => {
        const initThree = async () => {
            try {
                const THREE = await import('three');
                if (!containerRef.current) return;

                // Create LoadingManager
                const manager = new THREE.LoadingManager();
                managerRef.current = manager;

                manager.onProgress = (url, itemsLoaded, itemsTotal) => {
                    const progressPercentage = (itemsLoaded / itemsTotal) * 100;
                    console.log(`Loading progress: ${progressPercentage}%`);
                };

                // Scene setup
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
                const renderer = new THREE.WebGLRenderer();
                renderer.setSize( window.innerWidth, window.innerHeight );
                containerRef.current.appendChild(renderer.domElement);
                renderer.setAnimationLoop( animate );
                document.body.appendChild( renderer.domElement );

                const geometry = new THREE.BoxGeometry( 1, 1, 1 );
                const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
                const cube = new THREE.Mesh( geometry, material );
                scene.add( cube );

                camera.position.z = 5;

                function animate() {

                    cube.rotation.x += 0.01;
                    cube.rotation.y += 0.01;

                    renderer.render( scene, camera );

                }

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
                    renderer.dispose();
                };
            } catch (err) {
                console.error('Error setting up Three.js:', err);
            }
        };

        initThree();
    }, []);

    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
            <div ref={containerRef} className="w-full h-full" />
            <p className="absolute bottom-16 text-xl text-white">
                {currentStage} ({Math.round(progress)}%)
            </p>
        </div>
    );
};

export default LoadingAnimation;