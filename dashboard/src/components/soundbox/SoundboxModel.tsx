import { ContactShadows, Environment, Float, Lightformer, PresentationControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'

import { displayTexture, grilleTexture, panelTexture, standeeTexture } from '@/components/soundbox/surfaces'
import type { DeviceStatus } from '@/lib/types'

// A 3D Paytm Soundbox as merchants have it on the counter: a blue base with a black glass top
// (tap-to-pay mark, a small display, an LED strip) and a QR stand behind it. Everything is
// modelled in code. It reflects the device's state and celebrates when payments come back.

type Ding = { amount: number; at: number }
type Props = { status: DeviceStatus; days: number; ding: Ding | null; label: string }

const LED: Record<DeviceStatus, string> = {
  at_risk: '#ff5a48',
  fix_scheduled: '#ffb02e',
  awaiting_verification: '#ffb02e',
  handed_off: '#9aa3b2',
  recovered: '#35e08a',
  healthy: '#35e08a',
}

function displayText(status: DeviceStatus, days: number, ding: Ding | null): string {
  if (ding) return ding.amount ? `₹${ding.amount}` : 'PAID'
  switch (status) {
    case 'at_risk':
      return `SILENT ${days}D`
    case 'fix_scheduled':
      return 'FIX TMRW'
    case 'awaiting_verification':
      return 'WAITING'
    case 'handed_off':
      return 'CALLBACK'
    case 'recovered':
      return 'ONLINE'
    default:
      return 'READY'
  }
}

/** Canvas text needs the web fonts; redraw the surfaces once they've loaded. */
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

function Device({ status, days, ding }: Omit<Props, 'label'>) {
  const root = useRef<Group>(null)
  const led = useRef<MeshStandardMaterial>(null)
  const rings = useRef<(Mesh | null)[]>([])

  const standee = useMemo(() => standeeTexture(), [])
  const panel = useMemo(() => panelTexture(), [])
  const grille = useMemo(() => grilleTexture(), [])
  const text = displayText(status, days, ding)
  const color = ding ? LED.recovered : LED[status]
  const display = useMemo(() => displayTexture(text, color), [text, color])
  useEffect(() => () => display.dispose(), [display])
  useEffect(() => () => standee.dispose(), [standee])
  useEffect(() => () => panel.dispose(), [panel])

  useFrame(() => {
    const since = ding ? (Date.now() - ding.at) / 1000 : Infinity
    if (root.current) {
      // A happy hop that settles, and a small swell.
      root.current.position.y = since < 1.5 ? Math.exp(-since * 4) * Math.abs(Math.sin(since * 11)) * 0.38 : 0
      root.current.scale.setScalar(since < 0.5 ? 1 + Math.sin((since * Math.PI) / 0.5) * 0.04 : 1)
    }
    if (led.current) led.current.emissiveIntensity = since < 1.8 ? 2.6 + Math.sin(since * 22) * 1.4 : 1.7
    rings.current.forEach((ring, i) => {
      if (!ring) return
      const t = since - i * 0.24
      ring.visible = t > 0 && t < 1.3
      if (ring.visible) {
        const k = t / 1.3
        ring.scale.setScalar(1 + k * 3.4)
        ;(ring.material as MeshBasicMaterial).opacity = 0.65 * (1 - k)
      }
    })
  })

  return (
    <group ref={root}>
      {/* Base */}
      <RoundedBox args={[2.4, 0.8, 1.7]} radius={0.22} smoothness={6} position={[0, 0.4, 0]}>
        <meshStandardMaterial color="#1c66cf" roughness={0.42} metalness={0.05} />
      </RoundedBox>
      <mesh position={[0, 0.34, 0.851]}>
        <planeGeometry args={[1.9, 0.37]} />
        <meshStandardMaterial map={grille} transparent roughness={0.6} />
      </mesh>

      {/* Black glass top, tilted toward the customer */}
      <group position={[0, 0.84, 0.1]} rotation={[0.14, 0, 0]}>
        <RoundedBox args={[2.2, 0.1, 1.42]} radius={0.05} smoothness={4}>
          <meshPhysicalMaterial color="#0b0d12" roughness={0.16} metalness={0.15} clearcoat={1} clearcoatRoughness={0.08} />
        </RoundedBox>
        <mesh position={[0, 0.0505, -0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.05, 1.2]} />
          <meshBasicMaterial map={panel} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.052, 0.36]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.05, 0.33]} />
          <meshBasicMaterial map={display} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.715]}>
          <boxGeometry args={[1.9, 0.04, 0.03]} />
          <meshStandardMaterial ref={led} color={color} emissive={color} emissiveIntensity={1.7} toneMapped={false} />
        </mesh>
      </group>

      {/* QR stand */}
      <group position={[0, 0.78, -0.7]} rotation={[-0.08, 0, 0]}>
        <RoundedBox args={[1.95, 2.55, 0.08]} radius={0.07} smoothness={4} position={[0, 1.28, 0]}>
          <meshStandardMaterial color="#e8f3fb" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 1.28, 0.042]}>
          <planeGeometry args={[1.86, 2.46]} />
          <meshStandardMaterial map={standee} roughness={0.55} />
        </mesh>
      </group>

      {/* Sound leaving the speaker */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            rings.current[i] = mesh
          }}
          position={[0, 0.34, 0.9]}
          visible={false}
        >
          <torusGeometry args={[0.32, 0.018, 8, 64]} />
          <meshBasicMaterial color="#35e08a" transparent opacity={0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function SoundboxModel({ status, days, ding, label }: Props) {
  const fontsReady = useFontsReady()
  const reduced = usePrefersReducedMotion()
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [2.6, 2.0, 7.8], fov: 28 }}
      onCreated={({ camera }) => camera.lookAt(0, -0.12, 0)}
      gl={{ antialias: true, alpha: true }}
      role="img"
      aria-label={label}
      className="cursor-grab active:cursor-grabbing"
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={1.5} />
      <directionalLight position={[-5, 2, -3]} intensity={0.45} color="#fff1dc" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[-4, 1, 2]} scale={[3, 3, 1]} />
      </Environment>
      {/* Drag to turn it; it springs back. */}
      <PresentationControls global snap cursor={false} polar={[-0.15, 0.25]} azimuth={[-0.9, 0.9]} speed={1.3}>
        <Float enabled={!reduced} speed={1.6} rotationIntensity={0.15} floatIntensity={0.3} floatingRange={[-0.04, 0.06]}>
          <group position={[0, -1.6, 0]} rotation={[0, -0.38, 0]}>
            {/* Remounts once the web fonts are in, so the printed text is drawn with them. */}
            <Device key={fontsReady ? 'fonts' : 'fallback'} status={status} days={days} ding={ding} />
          </group>
        </Float>
      </PresentationControls>
      <ContactShadows position={[0, -1.62, 0]} opacity={0.35} scale={9} blur={2.6} far={3.5} color="#3a2e1f" />
    </Canvas>
  )
}
