import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export function BlurredBarFloor({ footprintScale = 1 }: { footprintScale?: number }) {
  const { scene } = useGLTF("/models/bar/arkade-walnut-floor.glb");
  const { floor, finishes } = useMemo(() => {
    const floor = scene.clone(true);
    const finishes = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
    floor.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)) return;
      const source = node.material;
      let finish = finishes.get(source);
      if (!finish) {
        finish = source.clone();
        const map = source.map;
        if (map) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1024;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const image = map.image as CanvasImageSource;
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            ctx.filter = "blur(5px)";
            ctx.drawImage(image, -12, -12, canvas.width + 24, canvas.height + 24);
            const blurred = map.clone();
            blurred.source = new THREE.Source(canvas);
            blurred.needsUpdate = true;
            finish.map = blurred;
          }
        }
        finish.roughness = .88;
        finish.color.set("#977e68");
        finishes.set(source, finish);
      }
      node.receiveShadow = true;
      node.material = finish;
    });
    return { floor, finishes };
  }, [scene]);

  useEffect(() => () => {
    for (const [source, finish] of finishes) {
      if (finish.map !== source.map) finish.map?.dispose();
      finish.dispose();
    }
  }, [finishes]);

  return <primitive object={floor} position={[0, -.003, 0]} scale={[footprintScale, 1, footprintScale]} />;
}
