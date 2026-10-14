import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "../api/prisma/schema.prisma",
  // output 指向 worker 自身的 node_modules
  output: "./node_modules/.prisma/client",
  adapter: (config) => {
    const url = config.env("DATABASE_URL");
    return new PrismaPg({ connectionString: url });
  },
});
