/**
 * Agent Prism Loader - Animated 3D cube showing real-time agent status
 *
 * Shows the current phase of agent execution:
 * - Thinking: Initial processing
 * - Executing: Running a tool (shows tool name)
 * - Processing: Processing results
 * - Writing: Generating response
 * - Syncing: Updating spreadsheet/document
 */

import { useState, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { IconPlus, IconSparkles, IconTool, IconWriting, IconRefresh, IconDatabase } from '@tabler/icons-react'
import { agentPanelStatusAtom, type AgentStatusPhase } from '@/lib/atoms'
import { cn } from '@/lib/utils'

interface AgentPrismLoaderProps {
  size?: number
  speed?: number
  className?: string
  /** Override status for standalone usage */
  overridePhase?: AgentStatusPhase
  overrideTool?: string
}

// Map phase to display text
const PHASE_LABELS: Record<AgentStatusPhase, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  executing: 'Executing',
  processing: 'Processing',
  writing: 'Writing',
  syncing: 'Syncing',
}

export function AgentPrismLoader({
  size = 28,
  speed = 4,
  className,
  overridePhase,
  overrideTool,
}: AgentPrismLoaderProps) {
  const status = useAtomValue(agentPanelStatusAtom)
  const [time, setTime] = useState(0)

  // Use override or atom values
  const phase = overridePhase ?? status.phase
  const currentTool = overrideTool ?? status.currentTool

  // Cube rotation animation
  useEffect(() => {
    const interval = setInterval(() => {
      setTime((prev) => prev + 0.02 * speed)
    }, 16)
    return () => clearInterval(interval)
  }, [speed])

  const half = size / 2
  const iconSize = Math.max(10, size * 0.4)

  // Get current display info
  const label = currentTool
    ? `${currentTool}`
    : PHASE_LABELS[phase]

  // Face transforms for 3D cube
  const faceTransforms = [
    `rotateY(0deg) translateZ(${half}px)`,    // front
    `rotateY(180deg) translateZ(${half}px)`,  // back
    `rotateY(90deg) translateZ(${half}px)`,   // right
    `rotateY(-90deg) translateZ(${half}px)`,  // left
    `rotateX(90deg) translateZ(${half}px)`,   // top
    `rotateX(-90deg) translateZ(${half}px)`,  // bottom
  ]

  // Cycle through icons for each face
  const faceIcons = [
    IconSparkles,
    IconTool,
    IconRefresh,
    IconWriting,
    IconDatabase,
    IconPlus,
  ]

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* 3D Cube */}
      <div
        className="relative shrink-0"
        style={{
          width: size,
          height: size,
          perspective: '200px',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${time * 30}deg) rotateX(${time * 20}deg)`,
          }}
        >
          {faceTransforms.map((transform, i) => {
            const FaceIcon = faceIcons[i]
            return (
              <div
                key={i}
                className="absolute flex items-center justify-center bg-background/80 backdrop-blur-sm"
                style={{
                  width: size,
                  height: size,
                  border: '1px solid hsl(var(--primary) / 0.4)',
                  transform,
                  backfaceVisibility: 'hidden',
                }}
              >
                <FaceIcon
                  size={iconSize}
                  className="text-primary/80"
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Text */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-foreground truncate">
          {label}...
        </span>
        {currentTool && (
          <span className="text-[10px] text-muted-foreground truncate">
            {PHASE_LABELS[phase]}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Compact version of the loader for inline use
 */
export function AgentPrismLoaderCompact({
  size = 18,
  speed = 5,
  className,
}: Omit<AgentPrismLoaderProps, 'overridePhase' | 'overrideTool'>) {
  const [time, setTime] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTime((prev) => prev + 0.02 * speed)
    }, 16)
    return () => clearInterval(interval)
  }, [speed])

  const half = size / 2
  const iconSize = Math.max(8, size * 0.5)

  const faceTransforms = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ]

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{
        width: size,
        height: size,
        perspective: '150px',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${time * 35}deg) rotateX(${time * 25}deg)`,
        }}
      >
        {faceTransforms.map((transform, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center bg-primary/10"
            style={{
              width: size,
              height: size,
              border: '1px solid hsl(var(--primary) / 0.5)',
              transform,
              backfaceVisibility: 'hidden',
            }}
          >
            <IconPlus size={iconSize} className="text-primary" />
          </div>
        ))}
      </div>
    </div>
  )
}
