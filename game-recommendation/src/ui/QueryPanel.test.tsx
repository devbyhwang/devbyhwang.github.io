import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryPanel } from "./QueryPanel";
import type { Query } from "../domain/types";

const value: Query = {
  length: "medium",
  players: 1,
  viewerParticipation: false,
  vibe: "healing",
};

describe("QueryPanel", () => {
  it("6개 분위기 버튼을 한국어 라벨로 보여준다", () => {
    render(<QueryPanel value={value} onChange={() => {}} />);
    for (const label of ["힐링", "예능", "공포", "빡겜", "소통위주", "볼거리"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
  });

  it("방송 길이 3개를 보여준다", () => {
    render(<QueryPanel value={value} onChange={() => {}} />);
    for (const label of ["~1.5시간", "2~3시간", "4시간+"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
  });

  it("그룹 라벨을 보여준다", () => {
    render(<QueryPanel value={value} onChange={() => {}} />);
    for (const label of ["길이", "인원", "시청자 참여", "분위기"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("선택된 항목을 aria-pressed로 표시한다", () => {
    render(<QueryPanel value={value} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "힐링" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "공포" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("분위기를 바꾸면 onChange가 새 Query를 받는다", async () => {
    const onChange = vi.fn();
    render(<QueryPanel value={value} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "공포" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, vibe: "horror" });
  });

  it("인원을 바꾸면 onChange가 숫자를 담아 호출된다", async () => {
    const onChange = vi.fn();
    render(<QueryPanel value={value} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "4명" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, players: 4 });
  });

  it("시청자 참여 옵션은 짧은 문구를 쓰되 접근성 이름은 뜻이 통한다", async () => {
    const onChange = vi.fn();
    render(<QueryPanel value={value} onChange={onChange} />);
    const on = screen.getByRole("button", { name: "시청자 참여 필요" });
    expect(on.textContent).toBe("필요");
    await userEvent.click(on);
    expect(onChange).toHaveBeenCalledWith({ ...value, viewerParticipation: true });
  });

  it("선택지는 버튼이라 키보드로 접근된다", () => {
    render(<QueryPanel value={value} onChange={() => {}} />);
    const b = screen.getByRole("button", { name: "빡겜" });
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
  });
});
