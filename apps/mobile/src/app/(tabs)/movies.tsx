import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function MoviesScreen() {
  return (
    <DashboardView
      kind="movies"
      title="Movies"
      mediaType="movie"
      emptyMessage="Your watchlist, watched movies, favorites, and upcoming releases."
    />
  );
}
