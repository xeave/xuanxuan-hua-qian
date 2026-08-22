const NAMED: Record<string, string> = {
  餐饮: "#c45c26",
  买菜: "#5a8f3d",
  零食: "#b4532a",
  交通: "#2f6f8f",
  汽车: "#4a5d78",
  日用: "#3d7a5a",
  通信: "#2a7f8f",
  住房: "#6b4c9a",
  房租水电: "#6b4c9a",
  关系: "#8a4a6a",
  假期回家: "#7a5c3a",
  服饰: "#8f5a78",
  美容: "#9a5a6a",
  旅游: "#3d6f8a",
  娱乐: "#a33b32",
  医疗: "#2a8f84",
  其他: "#6b7280",
};

const FALLBACK = [
  "#c45c26",
  "#2f6f8f",
  "#3d7a5a",
  "#6b4c9a",
  "#a33b32",
  "#2a8f84",
  "#8a6d3b",
  "#4a6fa5",
];

export function categoryColor(name: string): string {
  if (NAMED[name]) return NAMED[name];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return FALLBACK[hash % FALLBACK.length];
}
