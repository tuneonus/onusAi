import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

const ACTION_EVENT = 'onusai:guarded-action';

// Workspace changes and sign-out do not necessarily navigate through the router.
export function requestGuardedAction(proceed: () => void) {
  const event = new CustomEvent(ACTION_EVENT, { cancelable: true, detail: { proceed } });
  if (window.dispatchEvent(event)) proceed();
}

export function useUnsavedChanges(dirty: boolean, clearDirty: () => void) {
  const blocker = useBlocker(dirty);
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardedAction = (event: Event) => {
      event.preventDefault();
      setPending(() => (event as CustomEvent<{ proceed: () => void }>).detail.proceed);
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener(ACTION_EVENT, guardedAction);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener(ACTION_EVENT, guardedAction);
    };
  }, [dirty]);
  return {
    open: blocker.state === 'blocked' || pending !== null,
    request: (action: () => void) => { if (dirty) setPending(() => action); else action(); },
    stay: () => { setPending(null); if (blocker.state === 'blocked') blocker.reset(); },
    discard: () => {
      clearDirty();
      const action = pending; setPending(null);
      if (blocker.state === 'blocked') blocker.proceed();
      else action?.();
    },
  };
}
