import { Check, Circle, CircleDot, Lock } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

export type WorkflowStepId = 'import' | 'review-charts' | 'test-logic' | 'review-issues' | 'inspect-rows' | 'settings';

export type WorkflowStepState = 'active' | 'complete' | 'ready' | 'unavailable';

export type WorkflowNavStep = {
  id: WorkflowStepId;
  label: string;
  state: WorkflowStepState;
  disabled: boolean;
  title: string;
};

const stateLabels: Record<WorkflowStepState, string> = {
  active: 'Current',
  complete: 'Done',
  ready: 'Ready',
  unavailable: 'Unavailable',
};

const stateIcons = {
  active: CircleDot,
  complete: Check,
  ready: Circle,
  unavailable: Lock,
};

export function WorkflowNav({ steps, onSelect }: { steps: WorkflowNavStep[]; onSelect: (stepId: WorkflowStepId) => void }) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusStep = (currentIndex: number, direction: 1 | -1) => {
    const enabledIndexes = steps.flatMap((step, index) => (step.disabled ? [] : [index]));
    if (!enabledIndexes.length) return;
    const enabledPosition = enabledIndexes.indexOf(currentIndex);
    const fallbackPosition = direction === 1 ? 0 : enabledIndexes.length - 1;
    const nextPosition = enabledPosition === -1
      ? fallbackPosition
      : (enabledPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    buttonRefs.current[enabledIndexes[nextPosition]]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusStep(index, 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusStep(index, -1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const firstEnabledIndex = steps.findIndex((step) => !step.disabled);
      if (firstEnabledIndex >= 0) buttonRefs.current[firstEnabledIndex]?.focus();
    }
    if (event.key === 'End') {
      event.preventDefault();
      const lastEnabledIndex = steps.findLastIndex((step) => !step.disabled);
      if (lastEnabledIndex >= 0) buttonRefs.current[lastEnabledIndex]?.focus();
    }
  };

  return (
    <nav className="workflow-nav" aria-label="Guided review workflow">
      {steps.map((step, index) => {
        const Icon = stateIcons[step.state];
        const stateLabel = stateLabels[step.state];
        return (
          <button
            key={step.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            className={`workflow-step workflow-step-${step.state}`}
            type="button"
            disabled={step.disabled}
            aria-current={step.state === 'active' ? 'step' : undefined}
            aria-disabled={step.disabled ? 'true' : undefined}
            aria-label={`${step.label}, ${stateLabel}`}
            title={step.title}
            onClick={() => onSelect(step.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="workflow-step-icon" aria-hidden="true">
              <Icon size={16} strokeWidth={2.3} />
            </span>
            <span className="workflow-step-copy">
              <span className="workflow-step-label">{step.label}</span>
              <span className="workflow-step-status">{stateLabel}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
