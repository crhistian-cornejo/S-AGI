import { useAtomValue } from 'jotai'
import { onboardingCompletedAtom } from '@/lib/atoms'
import { OnboardingPage } from './onboarding-page'

interface OnboardingGuardProps {
    children: React.ReactNode
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
    const onboardingCompleted = useAtomValue(onboardingCompletedAtom)

    if (!onboardingCompleted) {
        return <OnboardingPage />
    }

    return <>{children}</>
}
