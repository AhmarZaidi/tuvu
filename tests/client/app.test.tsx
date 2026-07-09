import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function PhaseZeroSmoke() {
  return <p>Tuvu baseline is testable.</p>;
}

describe("Phase 0 client baseline", () => {
  it("renders under the React test harness", () => {
    render(<PhaseZeroSmoke />);

    expect(screen.getByText("Tuvu baseline is testable.")).toBeInTheDocument();
  });
});
