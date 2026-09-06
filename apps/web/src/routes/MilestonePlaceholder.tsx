import type { ReactNode } from "react";

type MilestonePlaceholderProps = {
  title: string;
  milestone: string;
  children?: ReactNode;
};

/**
 * Shared shell for routes that exist but are not implemented yet. Naming the
 * owning milestone keeps the scaffold honest about what is real.
 */
export function MilestonePlaceholder({ title, milestone, children }: MilestonePlaceholderProps) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p className="milestone-badge">Arrives in {milestone}</p>
      {children}
    </main>
  );
}
