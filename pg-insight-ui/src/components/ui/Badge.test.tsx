import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children text", () => {
    render(<Badge>active</Badge>);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("applies success variant styling", () => {
    render(<Badge variant="success">ok</Badge>);
    expect(screen.getByText("ok").className).toMatch(/green/);
  });

  it("applies error variant styling", () => {
    render(<Badge variant="error">failed</Badge>);
    expect(screen.getByText("failed").className).toMatch(/red/);
  });

  it("renders a pulsing dot when dot=true", () => {
    const { container } = render(
      <Badge variant="success" dot>
        live
      </Badge>,
    );
    expect(container.querySelector(".animate-pulse-dot")).not.toBeNull();
  });

  it("does not render a dot by default", () => {
    const { container } = render(<Badge>plain</Badge>);
    expect(container.querySelector(".animate-pulse-dot")).toBeNull();
  });
});
