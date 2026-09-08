import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function ShowsScreen() {
  return (
    <DashboardView
      kind="shows"
      title="Shows"
      mediaType="show"
      emptyMessage="Pick up the next episode, catch up, or reorganize what you want to watch."
    />
  );
}
