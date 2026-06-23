import { History, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { InvestorOption } from '../../types';
import { EmptyState } from '../common';

function railName(option: InvestorOption): string {
  return option.investorPortalDisplayName ?? option.investorGroupName ?? option.label;
}

function railMeta(option: InvestorOption): string {
  const company = option.companyName ?? option.companyGroupCode ?? 'No fund';
  return `${company} · ${option.investorType ?? 'Unknown'}`;
}

const MAX_RECENT_VISITS = 8;

/**
 * The 248px sticky left rail: the investor list, persistent across sections.
 * Search, recent visits, single- and multi-select. The list arrives already
 * filtered — this component renders, it never re-filters.
 */
export function QueueRail({
  investors,
  selectedKeys,
  query,
  getRecentInvestors,
  onSelect,
  onQueryChange,
}: {
  investors: InvestorOption[];
  selectedKeys: string[];
  query: string;
  getRecentInvestors?: () => InvestorOption[];
  onSelect: (keys: string[]) => void;
  onQueryChange: (query: string) => void;
}) {
  const activeKey = selectedKeys[selectedKeys.length - 1] ?? null;
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const multiSelect = selectedKeys.length > 1;
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);

  const recentVisits = recentOpen
    ? (getRecentInvestors?.() ?? []).filter((option) => option.key !== activeKey).slice(0, MAX_RECENT_VISITS)
    : [];

  useEffect(() => {
    activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeKey]);

  const toggleKey = (key: string) => {
    if (selectedKeySet.has(key)) {
      if (selectedKeys.length > 1) onSelect(selectedKeys.filter((selectedKey) => selectedKey !== key));
      return;
    }
    onSelect([...selectedKeys, key]);
  };

  const handleRowClick = (event: MouseEvent<HTMLDivElement>, key: string) => {
    if (event.ctrlKey || event.metaKey) { toggleKey(key); return; }
    onSelect([key]);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, key: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) toggleKey(key);
    else onSelect([key]);
  };

  return (
    <aside className="queue-rail" aria-label="Investors" data-multi={multiSelect ? 'true' : undefined}>
      <header className="queue-rail__header">
        <label className="queue-rail__search" title="Search investor names, funds, or investor numbers. Press / to focus.">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search investors — press /"
            aria-label="Search investors"
          />
          {query ? (
            <button type="button" className="queue-rail__search-clear" onClick={() => onQueryChange('')} aria-label="Clear search" title="Clear search.">
              <X size={12} aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="queue-rail__controls">
          <span className="queue-rail__filter-count" title={`${investors.length.toLocaleString()} investors in the current filter`}>
            {investors.length.toLocaleString()} investors
          </span>
          <button
            type="button"
            className="queue-rail__recent-button"
            data-open={recentOpen ? 'true' : undefined}
            aria-expanded={recentOpen}
            aria-haspopup="dialog"
            aria-label="Recently visited investors"
            title="Recently visited investors. Alt+←/→ walks back/forward."
            onClick={() => setRecentOpen((open) => !open)}
          >
            <History size={13} aria-hidden="true" />
          </button>
        </div>
        {recentOpen ? (
          <div className="queue-rail__recent-popover" role="dialog" aria-label="Recently visited investors">
            <span className="queue-rail__recent-title" aria-hidden="true">Recent</span>
            {recentVisits.map((option) => {
              const name = railName(option);
              return (
                <button
                  key={option.key}
                  type="button"
                  className="queue-rail__recent-item"
                  title={`Jump back to ${name}.`}
                  onClick={() => { onSelect([option.key]); setRecentOpen(false); }}
                >
                  <span className="queue-rail__recent-name">{name}</span>
                  <small className="queue-rail__recent-meta">{railMeta(option)}</small>
                </button>
              );
            })}
            {!recentVisits.length ? <span className="queue-rail__recent-empty">No other investors visited yet</span> : null}
            <span className="queue-rail__recent-hint" aria-hidden="true">Alt+← back · Alt+→ forward</span>
          </div>
        ) : null}
      </header>

      <div className="queue-rail__list" role="listbox" aria-label="Investors" aria-multiselectable="true">
        {investors.map((option) => {
          const selected = selectedKeySet.has(option.key);
          const active = option.key === activeKey;
          const name = railName(option);
          return (
            <div
              key={option.key}
              ref={active ? activeRowRef : undefined}
              role="option"
              aria-selected={selected}
              aria-current={active ? 'true' : undefined}
              tabIndex={0}
              className="queue-rail__row"
              data-active={active ? 'true' : undefined}
              onClick={(event) => handleRowClick(event, option.key)}
              onKeyDown={(event) => handleRowKeyDown(event, option.key)}
              title={`Open ${name}. Ctrl+click to add to a grouped selection.`}
            >
              <input
                type="checkbox"
                className="queue-rail__row-check"
                checked={selected}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleKey(option.key)}
                aria-label={selected ? `Remove ${name} from the grouped selection` : `Add ${name} to the grouped selection`}
              />
              <span className="queue-rail__row-main">
                <span className="queue-rail__row-name">{name}</span>
                <small className="queue-rail__row-meta">{railMeta(option)}</small>
              </span>
            </div>
          );
        })}
        {!investors.length ? (
          <EmptyState className="queue-rail__empty" title="No matches" detail="Clear the search or filters to widen the list.">
            {query ? (
              <button type="button" className="queue-rail__empty-action" onClick={() => onQueryChange('')} title="Clear the search query.">
                Clear search
              </button>
            ) : null}
          </EmptyState>
        ) : null}
      </div>

      <footer className="queue-rail__footer">
        <span className="queue-rail__hint" title="Keyboard: j/k step through investors, t switches to the Scenarios directory, g flips LP/GP.">
          j/k step · t scenarios · g side
        </span>
      </footer>
    </aside>
  );
}
