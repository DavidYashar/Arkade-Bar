import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { SRGBColorSpace, TextureLoader, type Texture } from 'three';

/**
 * Textures for the 3D side of the bar.
 *
 * The big maps ship as KTX2 with UASTC, which keeps the picture identical while
 * cutting GPU memory about four times and removing the upload stall when a
 * texture first appears. If a browser cannot transcode them, the original AVIF,
 * WebP or PNG is loaded instead, so nothing breaks.
 */

let transcoder: KTX2Loader | null = null;

export function useKtxTexture(url: string, fallback: string, srgb = true): Texture | null {
  const gl = useThree((state) => state.gl);
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (loaded: Texture) => {
      if (cancelled) return;
      loaded.colorSpace = srgb ? SRGBColorSpace : loaded.colorSpace;
      loaded.anisotropy = 4;
      loaded.needsUpdate = true;
      setTexture(loaded);
    };

    transcoder ??= new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl);
    transcoder.load(
      url,
      (loaded) => apply(loaded),
      undefined,
      (error) => {
        console.warn('ktx: fail', url, String(error));
        // no transcoding support, or a missing file: use the original image
        new TextureLoader().load(fallback, apply);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fallback, gl, srgb, url]);

  return texture;
}
