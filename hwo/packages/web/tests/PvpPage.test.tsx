import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PvpPage } from "../src/pages/PvpPage";
import * as api from "../src/api";
import * as auth from "../src/auth/AuthContext";
import {
  myTeamId,
  mockTeams,
  mockTactics,
  makeSimOutput,
} from "./mocks";

vi.mock("../src/api", () => ({
  fetchTeams: vi.fn(),
  fetchTactics: vi.fn(),
  postSimMatch: vi.fn(),
}));

vi.mock("../src/auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockFetchTeams = vi.mocked(api.fetchTeams);
const mockFetchTactics = vi.mocked(api.fetchTactics);
const mockPostSimMatch = vi.mocked(api.postSimMatch);
const mockUseAuth = vi.mocked(auth.useAuth);

describe("PvpPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchTeams.mockResolvedValue(mockTeams);
    mockFetchTactics.mockResolvedValue(mockTactics);
    mockPostSimMatch.mockResolvedValue(makeSimOutput(100, 90));
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

  it("加载并展示友好对战与排位赛两个 tab", async () => {
    render(<PvpPage teamId={myTeamId} />);
    expect(screen.getByText("PvP 对战")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "友好对战" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "排位赛" })).toBeInTheDocument();
  });

  it("友好对战列出除自己外的对手，展示 OVR 与战绩", async () => {
    render(<PvpPage teamId={myTeamId} />);
    // 等待对手加载
    expect(await screen.findByText("阿尔法队")).toBeInTheDocument();
    expect(screen.getByText("贝塔队")).toBeInTheDocument();
    // 自己的球队不应出现在对手列表
    expect(screen.queryByText("我的球队")).not.toBeInTheDocument();
    // 战绩文本存在
    expect(screen.getAllByText(/胜.*负/).length).toBeGreaterThan(0);
  });

  it("点击挑战按钮调用 postSimMatch 并展示结果", async () => {
    render(<PvpPage teamId={myTeamId} />);
    const challengeBtn = await screen.findAllByRole("button", { name: "挑战" });
    fireEvent.click(challengeBtn[0]);
    await waitFor(() => expect(mockPostSimMatch).toHaveBeenCalledTimes(1));
    const req = mockPostSimMatch.mock.calls[0][0];
    expect(req.homeTeamId).toBe(myTeamId);
    expect(req.awayTeamId).toBe("team-a");
    // 结果展示
    expect(await screen.findByText("胜利")).toBeInTheDocument();
  });

  it("排位赛 tab 展示当前积分与开始匹配按钮", async () => {
    render(<PvpPage teamId={myTeamId} />);
    fireEvent.click(await screen.findByRole("button", { name: "排位赛" }));
    expect(await screen.findByText("当前积分")).toBeInTheDocument();
    // 默认积分为 1000（出现在当前积分框与排行榜"我"那行）
    expect(
      await screen.findByText("1000", { selector: ".rank-score-value" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始匹配" })).toBeInTheDocument();
  });

  it("排位赛胜利后积分增加并写入 localStorage", async () => {
    render(<PvpPage teamId={myTeamId} />);
    fireEvent.click(await screen.findByRole("button", { name: "排位赛" }));
    fireEvent.click(await screen.findByRole("button", { name: "开始匹配" }));
    await waitFor(() => expect(mockPostSimMatch).toHaveBeenCalledTimes(1));
    // 胜利 +25
    expect(
      await screen.findByText("1025", { selector: ".rank-score-value" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("hwo_arena_rank")).toBe("1025");
  });

  it("排位赛失利后积分减少", async () => {
    mockPostSimMatch.mockResolvedValueOnce(makeSimOutput(80, 100));
    render(<PvpPage teamId={myTeamId} />);
    fireEvent.click(await screen.findByRole("button", { name: "排位赛" }));
    fireEvent.click(await screen.findByRole("button", { name: "开始匹配" }));
    await waitFor(() => expect(mockPostSimMatch).toHaveBeenCalledTimes(1));
    // 失利 -20
    expect(
      await screen.findByText("980", { selector: ".rank-score-value" }),
    ).toBeInTheDocument();
  });

  it("读取 localStorage 中已有的排位积分", async () => {
    localStorage.setItem("hwo_arena_rank", "1500");
    render(<PvpPage teamId={myTeamId} />);
    fireEvent.click(await screen.findByRole("button", { name: "排位赛" }));
    expect(
      await screen.findByText("1500", { selector: ".rank-score-value" }),
    ).toBeInTheDocument();
  });

  it("未关联球队时显示错误提示", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    } as never);
    render(<PvpPage teamId={undefined} />);
    expect(
      await screen.findByText("未关联球队，无法进入竞技场"),
    ).toBeInTheDocument();
  });

  it("对手按 OVR 降序排列", async () => {
    render(<PvpPage teamId={myTeamId} />);
    await screen.findByText("阿尔法队");
    // 阿尔法队 OVR 85 > 贝塔队 75，应排在前面
    const names = screen
      .getAllByText(/队$/)
      .map((el) => el.textContent);
    const alphaIdx = names.indexOf("阿尔法队");
    const betaIdx = names.indexOf("贝塔队");
    expect(alphaIdx).toBeLessThan(betaIdx);
  });
});
