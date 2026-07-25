import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EventList } from "@/components/common/EventList";
import type { RavixEvent } from "@/types";

function ev(over: Partial<RavixEvent> = {}): RavixEvent {
  return {
    id: "e1",
    severity: "info",
    category: "domain",
    message: "hello world",
    at: "2025-06-02T11:46:00Z",
    ...over,
  } as RavixEvent;
}

describe("EventList", () => {
  it("renders a known event", () => {
    const { getByText } = render(<EventList events={[ev()]} />);
    expect(getByText("hello world")).toBeInTheDocument();
  });

  it("does not crash on unknown severity/category (React #130 regression)", () => {
    // The backend can emit categories/severities not in the frontend maps
    // (auth, tls, rbl, backup …). Rendering must fall back, not throw an
    // 'element type is undefined' error.
    expect(() =>
      render(
        <EventList
          events={[
            ev({ id: "x", severity: "tls" as never, category: "backup" as never, message: "weird" }),
          ]}
        />,
      ),
    ).not.toThrow();
  });

  it("respects the limit prop", () => {
    const events = [ev({ id: "a", message: "first" }), ev({ id: "b", message: "second" })];
    const { queryByText } = render(<EventList events={events} limit={1} />);
    expect(queryByText("first")).toBeInTheDocument();
    expect(queryByText("second")).toBeNull();
  });
});
