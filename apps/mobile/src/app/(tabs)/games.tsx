import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function GamesScreen() {
  return (
    <DashboardView
      kind="games"
      title="Games"
      eyebrow="Games"
      emptyMessage="Move between your backlog, current games, completed titles, and upcoming releases."
    />
  );
}
