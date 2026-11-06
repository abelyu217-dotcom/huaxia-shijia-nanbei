import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// 默认外观商品
const DEFAULT_COSMETICS = [
  { type: "jersey", name: "经典主场球衣", description: "红白配色经典球衣", price: 50, rarity: "common", data: { primary: "#c0392b", secondary: "#ffffff" } },
  { type: "jersey", name: "暗夜星辰球衣", description: "深蓝金色配色", price: 120, rarity: "rare", data: { primary: "#1a1a2e", secondary: "#ffd700" } },
  { type: "jersey", name: "火焰风暴球衣", description: "橙红渐变特效", price: 200, rarity: "epic", data: { primary: "#ff4757", secondary: "#ffa502" } },
  { type: "jersey", name: "传奇紫金球衣", description: "紫金王朝配色", price: 300, rarity: "legendary", data: { primary: "#5b2c6f", secondary: "#ffd700" } },
  { type: "arena_skin", name: "标准球馆", description: "基础球馆皮肤", price: 80, rarity: "common", data: { theme: "default" } },
  { type: "arena_skin", name: "霓虹球馆", description: "赛博朋克风霓虹灯", price: 180, rarity: "rare", data: { theme: "neon" } },
  { type: "arena_skin", name: "皇家球馆", description: "金色大理石风格", price: 250, rarity: "epic", data: { theme: "royal" } },
  { type: "avatar_frame", name: "青铜头像框", description: "简约青铜边框", price: 30, rarity: "common", data: { color: "#cd7f32" } },
  { type: "avatar_frame", name: "白银头像框", description: "闪耀银色边框", price: 60, rarity: "rare", data: { color: "#c0c0c0" } },
  { type: "avatar_frame", name: "钻石头像框", description: "璀璨钻石边框", price: 150, rarity: "epic", data: { color: "#b9f2ff" } },
  { type: "avatar_frame", name: "传奇金框", description: "金色粒子特效", price: 280, rarity: "legendary", data: { color: "#ffd700", effect: "particles" } },
];

@Injectable()
export class CosmeticService {
  constructor(private prisma: PrismaService) {}

  async listCosmetics(type?: string) {
    return this.prisma.cosmeticItem.findMany({
      where: type ? { type } : undefined,
      orderBy: { price: "asc" },
    });
  }

  async listOwned(userId: string) {
    return this.prisma.userCosmetic.findMany({
      where: { userId },
      include: { item: true },
    });
  }

  async buy(userId: string, itemId: string) {
    const item = await this.prisma.cosmeticItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("外观不存在");

    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (owned) throw new BadRequestException("已拥有该外观");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.credits < item.price) throw new BadRequestException("Credits 不足");

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: item.price } },
      }),
      this.prisma.userCosmetic.create({
        data: { userId, itemId },
      }),
    ]);

    return { success: true, itemId, price: item.price };
  }

  async equip(userId: string, itemId: string) {
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!owned) throw new BadRequestException("未拥有该外观");

    const item = await this.prisma.cosmeticItem.findUniqueOrThrow({ where: { id: itemId } });

    // 取消同类型已装备的
    const sameTypeOwned = await this.prisma.userCosmetic.findMany({
      where: { userId, equipped: true, item: { type: item.type } },
      include: { item: true },
    });
    for (const uc of sameTypeOwned) {
      await this.prisma.userCosmetic.update({
        where: { id: uc.id },
        data: { equipped: false },
      });
    }

    // 装备新的
    return this.prisma.userCosmetic.update({
      where: { userId_itemId: { userId, itemId } },
      data: { equipped: true },
    });
  }

  /** 初始化默认外观（seed 时调用） */
  async seedDefaults() {
    const existing = await this.prisma.cosmeticItem.count();
    if (existing > 0) return;
    await this.prisma.cosmeticItem.createMany({ data: DEFAULT_COSMETICS });
    return DEFAULT_COSMETICS.length;
  }
}
