#!/usr/bin/env node
/**
 * TaskOps_AutoFill_Guard 自检脚本
 *
 * 校验技能包是否会被 Agent Skills 兼容的 harness 正确加载，
 * 并防止两份 SKILL.md 内容漂移。
 *
 * 用法：node scripts/validate.mjs
 * 退出码：0 = 全部通过，1 = 存在失败项
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 技能名硬性语法：小写 kebab-case（与 harness 的 SKILL_NAME 校验一致） */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 已废弃的 frontmatter 键：出现即导致技能被丢弃 */
const LEGACY_KEYS = ["modelInvocable", "userInvocable", "disableModelInvocation"];

/** 合法的 invocation 键 */
const INVOCATION_KEYS = ["disable-model-invocation", "user-invocable"];

const SKILL_DIR = join(repoRoot, "skills", "taskops-guard-skill");
const INSTALLABLE = join(SKILL_DIR, "SKILL.md");
const ROOT_COPY = join(repoRoot, "SKILL.md");

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

/** 从 Markdown 文本中解析 YAML frontmatter（仅支持本技能用到的扁平键值对）。 */
function parseFrontmatter(raw) {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return undefined;

  const start = firstLineEnd + 1;
  let cursor = start;
  while (cursor <= raw.length) {
    const nextNewline = raw.indexOf("\n", cursor);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    const line = raw.slice(cursor, lineEnd).replace(/\r$/, "");
    if (line === "---") {
      const bodyStart = nextNewline < 0 ? raw.length : nextNewline + 1;
      const data = {};
      for (const entry of raw.slice(start, cursor).split("\n")) {
        const text = entry.replace(/\r$/, "");
        if (text.trim().length === 0 || text.trimStart().startsWith("#")) continue;
        const separator = text.indexOf(":");
        if (separator < 0) continue;
        const key = text.slice(0, separator).trim();
        let value = text.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
          (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
        ) {
          value = value.slice(1, -1);
        }
        if (key.length > 0) data[key] = value;
      }
      return { data, body: raw.slice(bodyStart) };
    }
    if (nextNewline < 0) return undefined;
    cursor = nextNewline + 1;
  }
  return undefined;
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` — ${detail}`}`);
    fail(label);
  }
}

console.log("TaskOps_AutoFill_Guard 自检\n");

// --- 1. 文件存在性 ---------------------------------------------------------
console.log("[1/5] 文件布局");
check("skills/taskops-guard-skill/SKILL.md 存在", existsSync(INSTALLABLE));
check("SKILL.md 位于技能根目录的一级子目录内", dirname(INSTALLABLE) === SKILL_DIR);

if (!existsSync(INSTALLABLE)) {
  console.log("\n可安装的 SKILL.md 缺失，后续检查跳过。");
  process.exit(1);
}

const installableRaw = readFileSync(INSTALLABLE, "utf8");
const parsed = parseFrontmatter(installableRaw);

// --- 2. frontmatter 合法性 ------------------------------------------------
console.log("\n[2/5] YAML frontmatter");
check("存在 YAML frontmatter（首行必须是 ---）", parsed !== undefined);

if (parsed === undefined) {
  console.log("\nfrontmatter 缺失或未闭合，后续检查跳过。");
  process.exit(1);
}

const { data, body } = parsed;
check("字段 name 非空", typeof data.name === "string" && data.name.length > 0);
check("字段 description 非空", typeof data.description === "string" && data.description.length > 0);
check(
  `name "${data.name ?? ""}" 符合小写 kebab-case 语法`,
  typeof data.name === "string" && SKILL_NAME.test(data.name),
  "含大写/下划线/空格会导致技能被静默忽略",
);

// --- 3. 废弃键 ------------------------------------------------------------
console.log("\n[3/5] frontmatter 键名");
for (const key of LEGACY_KEYS) {
  check(`未使用废弃键 "${key}"`, !Object.hasOwn(data, key), "会出现即被丢弃/报错");
}

const unknown = Object.keys(data).filter(
  (key) => !["name", "description", "whenToUse", "metadata", ...INVOCATION_KEYS].includes(key),
);
if (unknown.length > 0) warn(`存在未知 frontmatter 键：${unknown.join(", ")}（harness 通常忽略，确认拼写）`);

// --- 4. 目录名与技能名一致 -------------------------------------------------
console.log("\n[4/5] 目录名一致性");
const dirName = SKILL_DIR.split(/[\\/]/).pop();
check(
  `目录名 "${dirName}" 与技能 name "${data.name}" 一致`,
  dirName === data.name,
  "不一致通常仍可加载，但会让使用者困惑",
);

// --- 5. 两份 SKILL.md 无漂移 ----------------------------------------------
console.log("\n[5/5] 防漂移");
if (!existsSync(ROOT_COPY)) {
  warn("根目录 SKILL.md 不存在（README 的阅读用副本），跳过漂移检查");
} else {
  const rootParsed = parseFrontmatter(readFileSync(ROOT_COPY, "utf8"));
  check("根目录 SKILL.md 也含合法 frontmatter", rootParsed !== undefined);
  if (rootParsed !== undefined) {
    check(
      "两份 SKILL.md 正文一致",
      rootParsed.body.trim() === body.trim(),
      "已漂移：请把 skills/taskops-guard-skill/SKILL.md 的内容同步到根目录 SKILL.md",
    );
  }
}

// --- 汇总 -----------------------------------------------------------------
console.log("\n" + "-".repeat(52));
if (warnings.length > 0) {
  console.log(`警告 ${warnings.length} 项：`);
  for (const message of warnings) console.log(`  · ${message}`);
}
if (failures.length === 0) {
  console.log("全部通过：技能包可被 Agent Skills 兼容 harness 加载。");
  process.exit(0);
}
console.log(`失败 ${failures.length} 项：`);
for (const message of failures) console.log(`  · ${message}`);
process.exit(1);
