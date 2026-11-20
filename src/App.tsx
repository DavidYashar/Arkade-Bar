import { Canvas } from '@react-three/fiber';

export function App() {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <Canvas camera={{ position: [0, 1.4, 3.2], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#05110c']} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#0b3a26" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.45, 0]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.7, 0.9, 0.7]} />
          <meshStandardMaterial color="#c9973f" metalness={0.5} roughness={0.35} />
        </mesh>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#8fb39d]">
          Working name
        </p>
        <h1 className="mt-2 text-2xl tracking-[0.08em]">Arkade Bar</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#9fb5a7]">
          The room and the first game arrive next. This screen is the renderer, proving the
          canvas, the lights and the frame budget before anything is modelled.
        </p>
      </div>
    </main>
  );
}
