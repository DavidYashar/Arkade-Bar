import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { Quaternion, TorusGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLACKJACK_TABLE_XZ } from '@/games/blackjack/Blackjack3D';
import { makeWoodTextures } from '@/games/brickblitz/wood';
import { BlackjackNeon } from './ArcadeNeon';

const BOARD_Y = 2.55;
const BOARD_WIDTH = 1.72;
const BOARD_HEIGHT = 0.84;
const FRAME = 0.06;
const MOUNT_Y = 3.934 - BOARD_Y;
const CHAIN_EYE = 0.71;

function makeChain() {
  const apex = new Vector3(0, 0.89, 0);
  const ends = [
    [new Vector3(-CHAIN_EYE, BOARD_HEIGHT / 2, 0), apex],
    [new Vector3(CHAIN_EYE, BOARD_HEIGHT / 2, 0), apex],
    [apex, new Vector3(0, MOUNT_Y, 0)],
  ] as const;
  const up = new Vector3(0, 1, 0);
  const link = new TorusGeometry(0.016, 0.0038, 6, 14).scale(0.75, 1.46, 1);
  const links = ends.flatMap(([start, end]) => {
    const direction = end.clone().sub(start);
    const count = Math.round(direction.length() / 0.036);
    const tilt = new Quaternion().setFromUnitVectors(up, direction.normalize());
    return Array.from({ length: count }, (_, i) => {
      const center = start.clone().lerp(end, (i + 0.5) / count);
      return link.clone().rotateY((i % 2 === 0 ? 0.25 : 0.75) * Math.PI)
        .applyQuaternion(tilt).translate(center.x, center.y, center.z);
    });
  });
  const chain = mergeGeometries(links);
  links.forEach((geometry) => geometry.dispose());
  link.dispose();
  return chain;
}

export function BlackjackHangingSign() {
  const chain = useMemo(makeChain, []);
  const wood = useMemo(() => {
    const textures = makeWoodTextures();
    for (const texture of [textures.map, textures.roughnessMap]) {
      texture.center.set(0.5, 0.5);
      texture.repeat.set(1, 1);
      texture.rotation = Math.PI / 2;
      texture.anisotropy = 4;
    }
    return textures;
  }, []);
  useEffect(() => () => {
    chain.dispose();
    wood.map.dispose();
    wood.roughnessMap.dispose();
  }, [chain, wood]);

  return (
    <group name="Blackjack hanging sign" position={[BLACKJACK_TABLE_XZ[0], BOARD_Y, BLACKJACK_TABLE_XZ[1]]}>
      <RoundedBox args={[BOARD_WIDTH, BOARD_HEIGHT, 0.086]} radius={0.014} smoothness={3}>
        <meshStandardMaterial map={wood.map} roughnessMap={wood.roughnessMap} color="#745032" roughness={0.79} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <group key={side}>
          <RoundedBox args={[BOARD_WIDTH + 0.015, FRAME, 0.116]} radius={0.012} smoothness={2}
            position={[0, side * (BOARD_HEIGHT - FRAME) / 2, 0]}>
            <meshStandardMaterial map={wood.map} color="#51301f" roughness={0.67} />
          </RoundedBox>
          <RoundedBox args={[FRAME, BOARD_HEIGHT - 2 * FRAME, 0.116]} radius={0.012} smoothness={2}
            position={[side * (BOARD_WIDTH - FRAME) / 2, 0, 0]}>
            <meshStandardMaterial map={wood.map} color="#51301f" roughness={0.67} />
          </RoundedBox>
          <mesh position={[side * CHAIN_EYE, BOARD_HEIGHT / 2 + 0.013, 0]}>
            <torusGeometry args={[0.021, 0.005, 8, 16]} />
            <meshStandardMaterial color="#665240" metalness={0.72} roughness={0.38} />
          </mesh>
        </group>
      ))}
      <BlackjackNeon width={1.44} offset={0.045} />
      <mesh geometry={chain}>
        <meshStandardMaterial color="#665e52" metalness={0.74} roughness={0.36} />
      </mesh>
      <mesh position={[0, MOUNT_Y, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.025, 20]} />
        <meshStandardMaterial color="#44382d" metalness={0.75} roughness={0.48} />
      </mesh>
    </group>
  );
}
