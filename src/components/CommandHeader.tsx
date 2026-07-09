'use client';

import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  filters?: ReactNode;
};

export function CommandHeader({ title, subtitle, filters }: Props) {
  return (
    <header className="scc-header">
      <div className="scc-header-titles">
        <p className="scc-header-kicker">Sales Command Center</p>
        <h1 className="scc-header-title">{title}</h1>
        <p className="scc-header-sub">{subtitle}</p>
      </div>
      {filters && <div className="scc-header-filters">{filters}</div>}
    </header>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="scc-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
