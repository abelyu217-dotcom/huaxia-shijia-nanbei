import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ArenaPage } from "../src/pages/ArenaPage";
import * as api from "../src/api";
import * as auth from "../src/auth/AuthContext";
import { myTeamId, mockFacility, maxedFacility } from "./mocks";

vi.mock("../src/api", () => ({
  fetchFacility: vi.fn(),
  postUpgradeFacility: vi.fn(),
}));

vi.mock("../src/auth/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockFetchFacility = vi.mocked(api.fetchFacility);
const mockPostUpgradeFacility = vi.mocked(api.postUpgradeFacility);
const mockUseAuth = vi.mocked(auth.useAuth);

describe("ArenaPage", () => {
  beforeEach(() => {
    mockFetchFacility.mockResolvedValue(mockFacility);
    mockPostUpgradeFacility.mockResolvedValue({
      ...mockFacility,
      trainingHallLv: 3,
      trainingMultiplier: 1.3,
    });
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

  it("展示球馆设施标题，不含 PvP 内容", async () => {
    render(<ArenaPage teamId={myTeamId} />);
    expect(
      await screen.findByText(/运营中心.*球馆设施/),
    ).toBeInTheDocument();
    // 不应包含 PvP 相关文案
    expect(screen.queryByText("友好对战")).not.toBeInTheDocument();
    expect(screen.queryByText("排位赛")).not.toBeInTheDocument();
  });

  it("展示训练馆与主场馆两张设施卡", async () => {
    render(<ArenaPage teamId={myTeamId} />);
    expect(await screen.findByText("训练馆")).toBeInTheDocument();
    expect(screen.getByText("主场馆")).toBeInTheDocument();
  });

  it("展示当前等级与效果数值", async () => {
    render(<ArenaPage teamId={myTeamId} />);
    await screen.findByText("训练馆");
    expect(screen.getByText("Lv 2")).toBeInTheDocument();
    expect(screen.getByText("Lv 1")).toBeInTheDocument();
    // 倍率数值在当前效果与下一级预览中均可能出现
    expect(screen.getAllByText(/1\.20/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.10/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+1\.5/)).toBeInTheDocument();
  });

  it("点击训练馆升级按钮调用 postUpgradeFacility", async () => {
    render(<ArenaPage teamId={myTeamId} />);
    const btns = await screen.findAllByRole("button", { name: "升级" });
    // 第一个是训练馆
    fireEvent.click(btns[0]);
    await waitFor(() => expect(mockPostUpgradeFacility).toHaveBeenCalledTimes(1));
    expect(mockPostUpgradeFacility).toHaveBeenCalledWith(myTeamId, "trainingHall");
  });

  it("点击主场馆升级按钮调用 postUpgradeFacility(arena)", async () => {
    mockPostUpgradeFacility.mockResolvedValueOnce({
      ...mockFacility,
      arenaLv: 2,
      arenaRevenueMultiplier: 1.2,
    });
    render(<ArenaPage teamId={myTeamId} />);
    const btns = await screen.findAllByRole("button", { name: "升级" });
    // 第二个是主场馆
    fireEvent.click(btns[1]);
    await waitFor(() => expect(mockPostUpgradeFacility).toHaveBeenCalledTimes(1));
    expect(mockPostUpgradeFacility).toHaveBeenCalledWith(myTeamId, "arena");
  });

  it("满级设施显示已满级，无升级按钮", async () => {
    mockFetchFacility.mockResolvedValueOnce(maxedFacility);
    render(<ArenaPage teamId={myTeamId} />);
    await screen.findByText("训练馆");
    expect(screen.getAllByText("已满级").length).toBe(2);
    expect(screen.queryByRole("button", { name: "升级" })).not.toBeInTheDocument();
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
    render(<ArenaPage teamId={undefined} />);
    expect(
      await screen.findByText("未关联球队，无法查看球馆设施"),
    ).toBeInTheDocument();
  });
});
