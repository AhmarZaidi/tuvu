import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App, EmptyState, MediaCard, Modal, ProgressBar, StatusChip, Tabs } from "@client/app";

describe("Phase 1 app shell", () => {
  it("renders the logged-out auth screen", () => {
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Tuvu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with passkey/i })).toBeInTheDocument();
  });

  it("renders shell navigation and the shows dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/shows"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Watch next" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Shows" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});

describe("Phase 1 design system components", () => {
  it("renders media card, status chip, and progress", () => {
    render(
      <MemoryRouter>
        <MediaCard
          item={{
            id: "test",
            title: "Test Show",
            meta: "S1 E1 next",
            type: "show",
            progress: 50,
            status: "Watching",
            tone: "watching",
            accent: "linear-gradient(#111, #333)",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Open Test Show" })).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
    expect(screen.getByLabelText("50% complete")).toBeInTheDocument();
  });

  it("renders core empty, modal, tabs, and chip states", () => {
    render(
      <>
        <EmptyState icon={<span>!</span>} title="Empty library" message="Nothing here yet." />
        <Modal title="Confirm action">Modal body</Modal>
        <Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} />
        <StatusChip tone="complete">Complete</StatusChip>
        <ProgressBar value={120} label="Capped progress" />
      </>,
    );

    expect(screen.getByRole("heading", { name: "Empty library" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Confirm action" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "A", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByLabelText("Capped progress").firstElementChild).toHaveStyle({ width: "100%" });
  });
});
