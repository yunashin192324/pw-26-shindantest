// 途中離脱しても復元できるよう、現在の画面と回答を localStorage に保存する。
const KEY = "his-hatsuyume-fair-mock:v1";

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 保存できない環境では何もしない */
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
