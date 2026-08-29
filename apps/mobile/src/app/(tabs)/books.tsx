import React from 'react';
import { DashboardView } from '../../components/DashboardView';

export default function BooksScreen() {
  return (
    <DashboardView
      kind="books"
      title="Books & Manga"
      eyebrow="Books"
      emptyMessage="Keep reading, plan the next book, and revisit finished favorites."
    />
  );
}
