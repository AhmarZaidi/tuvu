import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function ShowsScreen() {
  return (
    <DashboardView
      kind="shows"
      title="Shows"
      eyebrow="Shows"
      emptyMessage="Pick up the next episode, catch up, or add shows from Explore."
    />
  );
}
