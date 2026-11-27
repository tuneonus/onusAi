import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icons';
import './ActionMenu.css';
interface Action { label: string; onSelect: () => void; danger?: boolean }
export function ActionMenu({ items, disabled = false }: { items: Action[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="ui-action-menu" ref={root}>
    <Button ref={trigger} variant="ghost" size="sm" disabled={disabled} aria-label="Conversation actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><Icon name="more" /></Button>
    {open && <div role="menu" aria-label="Conversation actions" className="ui-action-menu__items" onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>{items.map(item => <button type="button" role="menuitem" key={item.label} className={item.danger ? 'ui-action-menu__danger' : undefined} onClick={() => { setOpen(false); trigger.current?.focus(); item.onSelect(); }}>{item.label}</button>)}</div>}
  </div>;
}
