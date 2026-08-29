import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function AnimeScreen() {
  return (
    <DashboardView
      kind="anime"
      title="Anime"
      eyebrow="Anime"
      emptyMessage="Manage, track, and discover your anime collections."
    />
  );
}
