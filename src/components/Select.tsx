// ── Select — custom dropdown (shared atom) ─────────────────────────
// Replacement for native `<select>`: WebView2 renders the native
// option popup in an OS layer that ignores page CSS (near-white list
// on the dark theme), so the popup must be self-drawn. The trigger is
// a button; the list is a portal popover styled by `.ui-pop` in
// atoms.css.
//
// API mirrors `<select>` closely so call-site conversion stays
// mechanical: `value` + `onChange(value)` + flat options or groups
// (the optgroup analogue). Legacy per-context classes can keep being
// passed via `className` — `button.ui-select` in atoms.css is
// element-qualified, so it outranks their visual rules and only their
// layout rules (width/min-width) still apply.

import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { group: string; options: SelectOption[] };
export type SelectItems = Array<SelectOption | SelectGroup>;

type Props = {
  value: string;
  onChange: (value: string) => void;
  items: SelectItems;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  /** Shown when `value` matches no option and is empty. */
  placeholder?: string;
  /** Smaller trigger for toolbars / table headers. */
  compact?: boolean;
  /** Render the value in the mono font (ids, branches, sizes). */
  mono?: boolean;
  /** Focus the trigger on mount (inline cell editors). */
  autoFocus?: boolean;
  /** Fires when focus leaves the trigger while the popover is closed
   *  (matches a native select's blur-commit timing). */
  onBlur?: () => void;
};

function isGroup(item: SelectOption | SelectGroup): item is SelectGroup {
  return (item as SelectGroup).group !== undefined;
}

function flatten(items: SelectItems): SelectOption[] {
  const out: SelectOption[] = [];
  for (const item of items) {
    if (isGroup(item)) out.push(...item.options);
    else out.push(item);
  }
  return out;
}

const POP_MAX_H = 320;
const POP_MARGIN = 8;

export default function Select({
  value,
  onChange,
  items,
  className,
  style,
  disabled,
  title,
  placeholder,
  compact,
  mono,
  autoFocus,
  onBlur,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const typeBuf = useRef("");
  const typeTimer = useRef<number | null>(null);
  const [popStyle, setPopStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (autoFocus) btnRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flat = useMemo(() => flatten(items), [items]);
  const selected = flat.find((o) => o.value === value);
  // A value with no matching option still renders (free values, stale
  // configs) instead of showing an empty trigger.
  const label = selected?.label ?? (value || "");

  const close = () => {
    setOpen(false);
    setHl(-1);
  };

  const openPop = () => {
    if (disabled) return;
    const idx = flat.findIndex((o) => o.value === value && !o.disabled);
    setHl(idx);
    setOpen(true);
  };

  // Position the popover under (or above) the trigger. Fixed
  // coordinates from the trigger rect — the portal lives on body, so
  // dialog overflow can't clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - POP_MARGIN;
    const above = r.top - POP_MARGIN;
    const flip = below < 160 && above > below;
    const maxH = Math.min(POP_MAX_H, flip ? above : below);
    const width = Math.max(r.width, 120);
    const left = Math.min(r.left, window.innerWidth - width - POP_MARGIN);
    setPopStyle({
      left: Math.max(POP_MARGIN, left),
      minWidth: r.width,
      maxHeight: Math.max(80, maxH),
      ...(flip
        ? { bottom: window.innerHeight - r.top + 2 }
        : { top: r.bottom + 2 }),
    });
  }, [open]);

  // Scroll the highlighted row into view as the keyboard moves it.
  useEffect(() => {
    if (!open || hl < 0) return;
    const el = popRef.current?.querySelector<HTMLElement>(`[data-idx="${hl}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, hl]);

  // Outside click / scroll / resize close the popover. Scroll uses the
  // capture phase so scrolling any ancestor container counts; scrolling
  // the option list itself must not.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onResize = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const move = (dir: 1 | -1) => {
    if (flat.length === 0) return;
    let i = hl;
    for (let step = 0; step < flat.length; step += 1) {
      i = (i + dir + flat.length) % flat.length;
      if (!flat[i].disabled) break;
    }
    setHl(i);
  };

  const commit = (idx: number) => {
    const opt = flat[idx];
    if (!opt || opt.disabled) return;
    close();
    if (opt.value !== value) onChange(opt.value);
    btnRef.current?.focus();
  };

  const typeAhead = (ch: string) => {
    if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
    typeBuf.current += ch.toLowerCase();
    typeTimer.current = window.setTimeout(() => {
      typeBuf.current = "";
    }, 500);
    const start = hl >= 0 ? hl : 0;
    for (let step = 0; step < flat.length; step += 1) {
      const i = (start + step) % flat.length;
      if (!flat[i].disabled && flat[i].label.toLowerCase().startsWith(typeBuf.current)) {
        setHl(i);
        if (!open) commitWhileClosed(i);
        return;
      }
    }
  };

  // Native selects change the value on type-ahead even while closed —
  // mirror that so keyboard-only flows keep working.
  const commitWhileClosed = (idx: number) => {
    const opt = flat[idx];
    if (opt && !opt.disabled && opt.value !== value) onChange(opt.value);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (open && hl >= 0) commit(hl);
        else if (!open) openPop();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) openPop();
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openPop();
        else move(-1);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setHl(flat.findIndex((o) => !o.disabled));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          for (let i = flat.length - 1; i >= 0; i -= 1) {
            if (!flat[i].disabled) {
              setHl(i);
              break;
            }
          }
        }
        break;
      case "Escape":
        if (open) {
          // Only the popover closes — not the dialog hosting us.
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          typeAhead(e.key);
        }
    }
  };

  // Rows are rendered with a running flat index so groups and flat
  // lists share the same highlight/commit math.
  let runningIdx = -1;
  const renderOption = (opt: SelectOption) => {
    runningIdx += 1;
    const idx = runningIdx;
    return (
      <button
        key={`${opt.value}-${idx}`}
        type="button"
        data-idx={idx}
        className={
          "ui-pop__item" +
          (idx === hl ? " is-hl" : "") +
          (opt.value === value ? " is-active" : "") +
          (opt.disabled ? " is-disabled" : "")
        }
        disabled={opt.disabled}
        tabIndex={-1}
        // mousedown (not click) + preventDefault keeps focus on the
        // trigger so the popover doesn't blur-close before commit.
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setHl(idx)}
        onClick={() => commit(idx)}
      >
        <span className="ui-pop__check">
          {opt.value === value && <Check size={11} />}
        </span>
        <span className="ui-pop__label">{opt.label}</span>
      </button>
    );
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={
          "ui-select" +
          (compact ? " is-compact" : "") +
          (mono ? " is-mono" : "") +
          (className ? ` ${className}` : "")
        }
        style={style}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : openPop())}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!open) onBlur?.();
        }}
      >
        <span className={"ui-select__label" + (label ? "" : " is-placeholder")}>
          {label || placeholder || ""}
        </span>
        <ChevronDown size={12} className="ui-select__chev" />
      </button>
      {open &&
        createPortal(
          <div ref={popRef} className="ui-pop" style={popStyle} role="listbox">
            {items.map((item, gi) =>
              isGroup(item) ? (
                <div key={`g-${item.group}-${gi}`}>
                  <div className="ui-pop__group">{item.group}</div>
                  {item.options.map(renderOption)}
                </div>
              ) : (
                renderOption(item)
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
