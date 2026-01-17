import { memo } from 'react'
import { IconListCheck, IconCircle, IconCircleCheck, IconCircleDashed, IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export interface PlanStep {
    id: string
    title: string
    description?: string
    status: 'pending' | 'in_progress' | 'complete' | 'skipped'
}

export interface AgentPlanProps {
    title?: string
    steps: PlanStep[]
    currentStepIndex?: number
    className?: string
}

function AgentPlanBase({ title = 'Execution Plan', steps, currentStepIndex, className }: AgentPlanProps) {
    const completedCount = steps.filter(s => s.status === 'complete').length
    const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

    return (
        <div className={cn(
            'rounded-xl border bg-amber-500/5 border-amber-500/20 overflow-hidden',
            className
        )}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-500/10">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <IconListCheck size={16} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{title}</span>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                        {completedCount} of {steps.length} steps complete
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-amber-500/10">
                <div 
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Steps */}
            <div className="p-4 space-y-3">
                {steps.map((step, index) => (
                    <PlanStepItem 
                        key={step.id} 
                        step={step} 
                        index={index}
                        isCurrent={currentStepIndex === index}
                    />
                ))}
            </div>
        </div>
    )
}

function PlanStepItem({ step, index, isCurrent }: { step: PlanStep; index: number; isCurrent: boolean }) {
    const getIcon = () => {
        switch (step.status) {
            case 'complete':
                return <IconCircleCheck size={18} className="text-emerald-500" />
            case 'in_progress':
                return <IconLoader2 size={18} className="text-amber-500 animate-spin" />
            case 'skipped':
                return <IconCircleDashed size={18} className="text-muted-foreground" />
            default:
                return <IconCircle size={18} className="text-muted-foreground/50" />
        }
    }

    return (
        <div className={cn(
            'flex items-start gap-3 p-2 rounded-lg transition-colors',
            isCurrent && 'bg-amber-500/10',
            step.status === 'complete' && 'opacity-70'
        )}>
            <div className="shrink-0 mt-0.5">
                {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={cn(
                        'text-sm font-medium',
                        step.status === 'complete' ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}>
                        {step.title}
                    </span>
                </div>
                {step.description && (
                    <p className="text-xs text-muted-foreground mt-1 ml-7">
                        {step.description}
                    </p>
                )}
            </div>
        </div>
    )
}

export const AgentPlan = memo(AgentPlanBase)
