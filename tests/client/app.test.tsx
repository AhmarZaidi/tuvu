import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, EmptyState, MediaCard, Modal, ProgressBar, StatusChip, Tabs } from "@client/app";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockSignedInUser() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("/api/library/dashboard/") ? {
        entries: [], sections: [{ id: "all", label: "All Shows", entries: [] }], page: { limit: 100, offset: 0, hasMore: false },
      } : {
        user: {
              id: "usr_test",
              email: null,
              username: "test_user",
              displayName: "Test User",
        },
        profile: {
              bio: "",
              visibility: "private",
              preferredLanguage: "en",
              preferredRegion: "US",
              avatarUploadId: null,
              bannerUploadId: null,
              avatarUrl: null,
              bannerUrl: null,
        },
        csrfToken: "csrf",
      };
      return new Response(
        JSON.stringify({ data }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
}

describe("Phase 1 app shell", () => {
  it("renders the logged-out auth screen", () => {
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Tuvu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("renders shell navigation and the shows dashboard for signed-in users", async () => {
    mockSignedInUser();

    render(
      <MemoryRouter initialEntries={["/shows"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Shows" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /All Shows/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Books" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Explore" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open profile" })).toBeInTheDocument();
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
