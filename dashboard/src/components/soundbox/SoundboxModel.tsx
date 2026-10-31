import { ContactShadows, Environment, Float, Lightformer, OrbitControls, PresentationControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'

import { type ButtonIcon, buttonTexture, faceplateTexture } from '@/components/soundbox/surfaces'
import { announcement } from '@/lib/announce'
import type { DeviceStatus, Language } from '@/lib/types'

// A 3D Paytm Soundbox, modelled on the counter device merchants have: a rounded cube with a white
// QR faceplate, a light-blue body, a navy back cap, four buttons and a status light on top, and a
// charging port on the side. Everything is modelled in code. The QR is decorative and the UPI ID is a
// demo one, so nothing here can take a real payment. It reflects the device's state and celebrates
// (hop, sound rings, a speech bubble) when payments come back.

type Ding = { amount: number; at: number }
type Props = {
  status: DeviceStatus
  ding: Ding | null
  label: string
  upiId: string
  language: Language
  /** `card`: compact, drag to turn. `stage`: the demo modal, slow turntable, drag and zoom. */
  variant?: 'card' | 'stage'
}

const LIGHT: Record<DeviceStatus, string> = {
  at_risk: '#ff5a48',
  fix_scheduled: '#ffb02e',
  awaiting_verification: '#ffb02e',
  handed_off: '#9aa3b2',
  recovered: '#35e08a',
  healthy: '#35e08a',
}

const FACEPLATE_WHITE = '#ffffff'
const BODY_BLUE = '#47b1ec'
const BUTTON_BLUE = '#6ec6f4'
const BACK_NAVY = '#1f2d84'

function roundedSquare(size: number, radius: number): Shape {
  const s = new Shape()
  const h = size / 2
  s.moveTo(-h + radius, -h)
  s.lineTo(h - radius, -h)
  s.absarc(h - radius, -h + radius, radius, -Math.PI / 2, 0, false)
  s.lineTo(h, h - radius)
  s.absarc(h - radius, h - radius, radius, 0, Math.PI / 2, false)
  s.lineTo(-h + radius, h)
  s.absarc(-h + radius, h - radius, radius, Math.PI / 2, Math.PI, false)
  s.lineTo(-h, -h + radius)
  s.absarc(-h + radius, -h + radius, radius, Math.PI, Math.PI * 1.5, false)
  return s
}

/** One section of the cube: a rounded square pushed back along z with soft, bevelled edges. */
function useSection(size: number, radius: number, depth: number, bevel: number): ExtrudeGeometry {
  const geometry = useMemo(
    () =>
      new ExtrudeGeometry(roundedSquare(size, radius), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 8,
        curveSegments: 32,
      }),
    [size, radius, depth, bevel],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

/** Canvas text needs the web fonts; redraw the printed surfaces once they've loaded. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [])
  return ready
}

function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduced
}

function TopButton({ icon, x, pill = false }: { icon: ButtonIcon; x: number; pill?: boolean }) {
  const glyph = useMemo(() => buttonTexture(icon), [icon])
  useEffect(() => () => glyph.dispose(), [glyph])
  return (
    <group position={[x, 0.985, 0.13]}>
      {pill ? (
        <mesh rotation={[0, 0, Math.PI / 2]} scale={[0.36, 1, 1]}>
          <capsuleGeometry args={[0.1, 0.22, 8, 16]} />
          <meshStandardMaterial color={BUTTON_BLUE} roughness={0.4} />
        </mesh>
      ) : (
        <mesh>
          <cylinderGeometry args={[0.1, 0.105, 0.07, 32]} />
          <meshStandardMaterial color={BUTTON_BLUE} roughness={0.4} />
        </mesh>
      )}
      <mesh position={[0, pill ? 0.037 : 0.036, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshBasicMaterial map={glyph} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function Device({ status, ding, upiId }: Omit<Props, 'label' | 'variant'>) {
  const root = useRef<Group>(null)
  const light = useRef<MeshStandardMaterial>(null)
  const rings = useRef<(Mesh | null)[]>([])

  const faceplate = useSection(1.84, 0.36, 0.2, 0.08)
  const body = useSection(1.8, 0.34, 0.62, 0.08)
  const back = useSection(1.8, 0.34, 0.5, 0.09)
  const print = useMemo(() => faceplateTexture(upiId), [upiId])
  useEffect(() => () => print.dispose(), [print])
  const color = ding ? LIGHT.recovered : LIGHT[status]

  useFrame(() => {
    const since = ding ? (Date.now() - ding.at) / 1000 : Infinity
    if (root.current) {
      // A happy hop that settles, and a small swell.
      root.current.position.y = since < 1.5 ? Math.exp(-since * 4) * Math.abs(Math.sin(since * 11)) * 0.3 : 0
      root.current.scale.setScalar(since < 0.5 ? 1 + Math.sin((since * Math.PI) / 0.5) * 0.04 : 1)
    }
    if (light.current) light.current.emissiveIntensity = since < 1.8 ? 3 + Math.sin(since * 22) * 1.5 : 2
    rings.current.forEach((ring, i) => {
      if (!ring) return
      const t = since - (i % 3) * 0.22
      ring.visible = t > 0 && t < 1.1
      if (ring.visible) {
        // Each wave stays over its own grille (never meets the other side's) and fades as it grows.
        const k = t / 1.1
        ring.scale.set(1 + k * 0.9, 1 + k * 0.9, 1)
        ring.position.z = 0.9 + k * 0.25
        ;(ring.material as MeshBasicMaterial).opacity = 0.55 * (1 - k) ** 1.5
      }
    })
  })

  return (
    <group ref={root}>
      {/* White faceplate with the print, light-blue body, navy back cap */}
      <mesh geometry={faceplate} position={[0, 0, 0.6]}>
        <meshStandardMaterial color={FACEPLATE_WHITE} emissive={FACEPLATE_WHITE} emissiveIntensity={0.14} roughness={0.32} />
      </mesh>
      {/* The print glows a touch so the plate reads bright white, as on the real device. */}
      <mesh position={[0, 0, 0.881]}>
        <planeGeometry args={[1.84, 1.84]} />
        <meshStandardMaterial map={print} emissive="#ffffff" emissiveMap={print} emissiveIntensity={0.32} transparent roughness={0.4} />
      </mesh>
      <mesh geometry={body} position={[0, 0, -0.16]}>
        <meshStandardMaterial color={BODY_BLUE} roughness={0.38} />
      </mesh>
      <mesh geometry={back} position={[0, 0, -0.8]}>
        <meshStandardMaterial color={BACK_NAVY} roughness={0.42} />
      </mesh>

      {/* Buttons on top: volume down, volume up, power, replay; then the status light */}
      <TopButton icon="minus" x={-0.62} />
      <TopButton icon="plus" x={-0.34} />
      <TopButton icon="power" x={0.02} pill />
      <TopButton icon="replay" x={0.38} />
      <mesh position={[0.66, 0.99, -0.5]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 24]} />
        <meshStandardMaterial ref={light} color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {/* Charging port on the side of the back cap */}
      <mesh position={[0.995, -0.18, -0.55]}>
        <boxGeometry args={[0.03, 0.11, 0.3]} />
        <meshStandardMaterial color="#0d1846" roughness={0.6} />
      </mesh>

      {/* Sound leaving both speaker grilles */}
      {[-0.68, 0.68].flatMap((x, side) =>
        [0, 1, 2].map((i) => (
          <mesh
            key={`${side}-${i}`}
            ref={(mesh) => {
              rings.current[side * 3 + i] = mesh
            }}
            position={[x, -0.03, 0.9]}
            visible={false}
          >
            <torusGeometry args={[0.24, 0.012, 8, 64]} />
            <meshBasicMaterial color="#35e08a" transparent opacity={0} toneMapped={false} />
          </mesh>
        )),
      )}

    </group>
  )
}

export default function SoundboxModel({ status, ding, label, upiId, language, variant = 'card' }: Props) {
  const fontsReady = useFontsReady()
  const reduced = usePrefersReducedMotion()
  const stage = variant === 'stage'
  const device = (
    <group rotation={[0, -0.55, 0]}>
      {/* Remounts once the web fonts are in, so the printed text is drawn with them. */}
      <Device key={fontsReady ? 'fonts' : 'fallback'} status={status} ding={ding} upiId={upiId} language={language} />
    </group>
  )
  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={stage ? { position: [0, 2.2, 7.2], fov: 28 } : { position: [0, 1.5, 7.2], fov: 25 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.05, 0)}
        gl={{ antialias: true, alpha: true }}
        role="img"
        aria-label={label}
        className="cursor-grab active:cursor-grabbing"
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <directionalLight position={[-5, 2, -3]} intensity={0.5} color="#fff1dc" />
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2} position={[0, 4, 3]} scale={[6, 2, 1]} />
          <Lightformer form="rect" intensity={1} position={[-4, 1, 2]} scale={[3, 3, 1]} />
        </Environment>
        {stage ? (
          <>
            <OrbitControls
              makeDefault
              target={[0, 0.05, 0]}
              enablePan={false}
              minDistance={4}
              maxDistance={9}
              minPolarAngle={0.55}
              maxPolarAngle={1.7}
              autoRotate={!reduced}
              autoRotateSpeed={0.9}
              enableDamping
            />
            <Float enabled={!reduced} speed={1.4} rotationIntensity={0.1} floatIntensity={0.25} floatingRange={[-0.03, 0.05]}>
              {device}
            </Float>
          </>
        ) : (
          // Drag to turn it; it springs back.
          <PresentationControls global snap cursor={false} polar={[-0.2, 0.3]} azimuth={[-1, 1]} speed={1.3}>
            <Float enabled={!reduced} speed={1.6} rotationIntensity={0.12} floatIntensity={0.3} floatingRange={[-0.03, 0.05]}>
              {device}
            </Float>
          </PresentationControls>
        )}
        <ContactShadows position={[0, -1.04, 0]} opacity={0.38} scale={7} blur={2.4} far={3} color="#3a2e1f" />
      </Canvas>
      {/* What it says, as a speech bubble. A plain overlay, not drei's <Html>: that mounts a second React
          root inside the canvas, which broke when the canvas closed mid-announcement. */}
      {ding && (
        <div className="pointer-events-none absolute top-[9%] left-1/2 -translate-x-1/2">
          <div
            key={ding.at}
            className="flex animate-rise items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[14px] font-semibold whitespace-nowrap text-sage shadow-lift"
          >
            <Volume2 className="size-4" />
            {announcement(ding.amount, language)}
          </div>
        </div>
      )}
    </div>
  )
}
