/** Lightweight filename / mode helpers shared by SFTP surfaces.
 *
 * Keep this file free of CodeMirror imports. Directory browsing and
 * chmod previews need these helpers without pulling the full editor
 * runtime into their chunks.
 */

/** Upper bound shipped to the backend and enforced on the UI side
 *  too. Backend caps at 5 MB regardless. */
export const MAX_EDITOR_BYTES = 5 * 1024 * 1024;

/** Extensions the editor opens without a size-gate prompt. Anything
 *  else still opens if under the byte limit, but large unknown files
 *  trip the confirmation. */
const TEXT_EXTENSIONS = new Set([
  "sh", "bash", "zsh", "fish",
  "conf", "cfg", "ini", "properties", "env",
  "json", "yaml", "yml", "toml",
  "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "py", "rb", "go", "rs", "java", "kt", "swift", "php", "pl", "lua",
  "md", "markdown", "rst", "txt", "log",
  "xml", "html", "htm", "svg", "css", "scss", "less",
  "sql", "service", "socket", "timer", "mount",
  "c", "h", "cc", "cpp", "hpp",
  "dockerfile", "tf", "hcl",
]);

/** Filenames treated as editable regardless of extension. */
const TEXT_FILENAMES = new Set([
  "Dockerfile", "Makefile", "Rakefile", "Gemfile", "Vagrantfile",
  ".bashrc", ".zshrc", ".profile", ".bash_profile", ".gitconfig",
  ".vimrc", ".tmux.conf", ".env", ".npmrc",
]);

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function isEditableFilename(name: string): boolean {
  if (!name) return false;
  if (TEXT_FILENAMES.has(name)) return true;
  const ext = extensionOf(name);
  if (!ext) {
    // no-extension files are often editable (scripts, configs); the
    // backend size gate is the real safety net.
    return true;
  }
  return TEXT_EXTENSIONS.has(ext);
}

/** Short human label of the detected language, shown in the status bar. */
export function languageLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) return "Dockerfile";
  const ext = extensionOf(name);
  switch (ext) {
    case "json": return "JSON";
    case "yaml":
    case "yml": return "YAML";
    case "py": return "Python";
    case "js":
    case "mjs":
    case "cjs": return "JavaScript";
    case "ts": return "TypeScript";
    case "jsx": return "JSX";
    case "tsx": return "TSX";
    case "sh":
    case "bash":
    case "zsh":
    case "fish": return "Shell";
    case "env": return "dotenv";
    case "toml": return "TOML";
    case "properties":
    case "ini":
    case "cfg":
    case "conf": return "Config";
    case "nginx": return "Nginx";
    case "xml":
    case "html":
    case "htm":
    case "svg": return "XML";
    case "css": return "CSS";
    case "scss": return "SCSS";
    case "less": return "LESS";
    case "md":
    case "markdown": return "Markdown";
    case "sql": return "SQL";
    default: return ext ? ext.toUpperCase() : "Plain Text";
  }
}

/** Format octal mode as `rwxrwxrwx`. Used by both the chmod dialog
 *  and the SFTP properties view. */
export function modeToSymbolic(mode: number): string {
  const bits = mode & 0o777;
  const flag = (b: number, ch: string) => (b ? ch : "-");
  const trio = (m: number) =>
    flag(m & 0o4, "r") + flag(m & 0o2, "w") + flag(m & 0o1, "x");
  return trio((bits >> 6) & 0o7) + trio((bits >> 3) & 0o7) + trio(bits & 0o7);
}
