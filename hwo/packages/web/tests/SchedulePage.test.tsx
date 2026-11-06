import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchedulePage } from "../src/pages/SchedulePage";
import * as api from "../src/api";
import * as auth from "../src/auth/AuthContext";
import { mockSeason, mockSchedule, mockTactics, myTeamId } from "./mocks";

vi.mock("../src/api", () => ({
  fetchCurrentSeason: vi.fn(),
  fetchSchedule: vi.fn(),
  fetchTactics: vi.fn(),
  fetchTeam: vi.fn(),
  postSimMatch: vi.fn(),
  fetchStandings: vi.fn(),
}));

vi.mock("../src/auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(auth.useAuth);

const mockFetchCurrentSeason = vi.mocked(api.fetchCurrentSeason);
const mockFetchSchedule = vi.mocked(api.fetchSchedule);
const mockFetchTactics = vi.mocked(api.fetchTactics);
const mockFetchStandings = vi.mocked(api.fetchStandings);

describe("SchedulePage", () => {
  beforeEach(() => {
    mockFetchCurrentSeason.mockResolvedValue(mockSeason);
    mockFetchSchedule.mockResolvedValue(mockSchedule);
    mockFetchTactics.mockResolvedValue(mockTactics);
    mockFetchStandings.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({
      user: { id: "u1", teamId: myTeamId, nickname: "me" },
      loading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("顶部展示常规赛与季后赛两个 tab", async () => {
    render(<SchedulePage />);
    expect(
      await screen.findByRole("button", { name: "常规赛" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "季后赛" }),
    ).toBeInTheDocument();
  });

  it("默认进入常规赛 tab，加载赛程日历", async () => {
    render(<SchedulePage />);
    expect(await screen.findByText("赛程日历")).toBeInTheDocument();
    expect(screen.getByText("第 1 日")).toBeInTheDocument();
  });

  it("切换到季后赛 tab 后加载季后赛页面内容", async () => {
    render(<SchedulePage />);
    fireEvent.click(await screen.findByRole("button", { name: "季后赛" }));
    // PlayoffPage 会调用 fetchStandings
    await waitFor(() => expect(mockFetchStandings).toHaveBeenCalled());
    // 季后赛页面加载（常规赛阶段显示预览 banner）
    expect(
      await screen.findByText(/季后赛尚未开始/),
    ).toBeInTheDocument();
  });

  it("季后赛 tab 下不显示常规赛赛程日历", async () => {
    render(<SchedulePage />);
    // 先等常规赛加载
    await screen.findByText("赛程日历");
    fireEvent.click(screen.getByRole("button", { name: "季后赛" }));
    await waitFor(() =>
      expect(screen.queryByText("赛程日历")).not.toBeInTheDocument(),
    );
  });

  it("从季后赛切回常规赛恢复赛程内容", async () => {
    render(<SchedulePage />);
    fireEvent.click(await screen.findByRole("button", { name: "季后赛" }));
    await screen.findByText("季后赛");
    fireEvent.click(screen.getByRole("button", { name: "常规赛" }));
    expect(await screen.findByText("赛程日历")).toBeInTheDocument();
  });
});
