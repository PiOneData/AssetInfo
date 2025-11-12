// agent/itam-agent.js
// Minimal, cross-platform, one-shot agent that posts to /api/agent/enroll

const os = require("os");
const { execFile, exec } = require("child_process");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// ── Config ────────────────────────────────────────────────────────────────────
const ENROLL_URL = 
  process.env.AGENT_ENROLL_URL || 
  (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/api/agent/enroll` : null) ||
  "http://localhost:5050/api/agent/enroll"; // fallback for developmentconst POST_TIMEOUT_MS = 8000;
const CMD_TIMEOUT_MS = 4000;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getUsername() {
  try {
    // cross-platform best-effort
    return (
      process.env.LOGNAME ||
      process.env.USER ||
      process.env.LNAME ||
      process.env.USERNAME ||
      os.userInfo()?.username ||
      null
    );
  } catch {
    return null;
  }
}

function getIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (!ni.internal && (ni.family === "IPv4" || ni.family === 4 || ni.family === "IPv6" || ni.family === 6)) {
        ips.push(ni.address);
      }
    }
  }
  // de-dup
  return Array.from(new Set(ips));
}

function execWithTimeout(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || ""));
    });
    child.on("error", () => resolve(null));
  });
}

function execShell(cmd, timeoutMs) {
  return new Promise((resolve) => {
    const child = exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || ""));
    });
    child.on("error", () => resolve(null));
  });
}

async function getSerial() {
  const platform = os.platform();

  // macOS: ioreg (no root needed)
  if (platform === "darwin") {
    const out = await execShell(
      `/usr/sbin/ioreg -c IOPlatformExpertDevice -d 2 | awk -F'\\"' '/IOPlatformSerialNumber/{print $(NF-1)}'`,
      CMD_TIMEOUT_MS
    );
    if (out) return out.trim() || null;
  }

  // Windows: wmic (legacy) or powershell as fallback
  if (platform === "win32") {
    // wmic is deprecated but often present
    const wmic = await execWithTimeout("wmic", ["bios", "get", "serialnumber"], CMD_TIMEOUT_MS);
    if (wmic) {
      const lines = wmic.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const candidate = lines.find((l) => l && l.toLowerCase() !== "serialnumber");
      if (candidate) return candidate;
    }
    // PowerShell fallback
    const ps = await execWithTimeout(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_BIOS).SerialNumber"
      ],
      CMD_TIMEOUT_MS
    );
    if (ps) return ps.trim() || null;
  }

  // Linux: try /sys and dmidecode (if present)
  if (platform === "linux") {
    const sys = await execShell("cat /sys/class/dmi/id/product_serial 2>/dev/null", CMD_TIMEOUT_MS);
    if (sys) return sys.trim() || null;

    const dmidecode = await execShell("dmidecode -s system-serial-number 2>/dev/null", CMD_TIMEOUT_MS);
    if (dmidecode) return dmidecode.trim() || null;
  }

  return null;
}

async function getManufacturer() {
  const platform = os.platform();

  if (platform === "darwin") {
    return "Apple Inc.";
  }

  if (platform === "win32") {
    const wmic = await execWithTimeout("wmic", ["computersystem", "get", "manufacturer"], CMD_TIMEOUT_MS);
    if (wmic) {
      const lines = wmic.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const value = lines.find((line) => line && line.toLowerCase() !== "manufacturer");
      if (value) return value;
    }
    const ps = await execWithTimeout(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).Manufacturer"],
      CMD_TIMEOUT_MS
    );
    if (ps) return ps.trim() || null;
    return null;
  }

  if (platform === "linux") {
    const sysVendor = await execShell("cat /sys/class/dmi/id/sys_vendor 2>/dev/null", CMD_TIMEOUT_MS);
    if (sysVendor) return sysVendor.trim() || null;
    const dmidecode = await execShell("dmidecode -s system-manufacturer 2>/dev/null", CMD_TIMEOUT_MS);
    if (dmidecode) return dmidecode.trim() || null;
    const hostctl = await execShell(
      "hostnamectl 2>/dev/null | grep -i 'Hardware Vendor' | sed 's/.*://'",
      CMD_TIMEOUT_MS
    );
    if (hostctl) return hostctl.trim() || null;
  }

  return null;
}

async function getModel() {
  const platform = os.platform();

  if (platform === "darwin") {
    const model = await execShell("sysctl -n hw.model", CMD_TIMEOUT_MS);
    return model?.trim() || null;
  }

  if (platform === "win32") {
    const wmic = await execWithTimeout("wmic", ["computersystem", "get", "model"], CMD_TIMEOUT_MS);
    if (wmic) {
      const lines = wmic.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const value = lines.find((line) => line && line.toLowerCase() !== "model");
      if (value) return value;
    }
    const ps = await execWithTimeout(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).Model"],
      CMD_TIMEOUT_MS
    );
    if (ps) return ps.trim() || null;
    return null;
  }

  if (platform === "linux") {
    const productName = await execShell("cat /sys/class/dmi/id/product_name 2>/dev/null", CMD_TIMEOUT_MS);
    if (productName) return productName.trim() || null;
    const dmidecode = await execShell("dmidecode -s system-product-name 2>/dev/null", CMD_TIMEOUT_MS);
    if (dmidecode) return dmidecode.trim() || null;
    const hostctl = await execShell(
      "hostnamectl 2>/dev/null | grep -i 'Hardware Model' | sed 's/.*://'",
      CMD_TIMEOUT_MS
    );
    if (hostctl) return hostctl.trim() || null;
  }

  return null;
}

function httpPostJson(urlStr, payload) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const data = Buffer.from(JSON.stringify(payload), "utf8");
      const isHttps = url.protocol === "https:";
      const req = (isHttps ? https : http).request(
        {
          method: "POST",
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + (url.search || ""),
          headers: {
            "Content-Type": "application/json",
            "Content-Length": data.length,
          },
          timeout: POST_TIMEOUT_MS,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode || 0, body }));
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const hostname = os.hostname();
    const serial = await getSerial();
    const manufacturer = await getManufacturer();
    const model = await getModel();
    const username = getUsername();
    const ips = getIPs();
    const uptimeSeconds = Math.floor(os.uptime());
    const osName = (() => {
      const p = os.platform();
      if (p === "darwin") return "macOS";
      if (p === "win32") return "Windows";
      if (p === "linux") return "Linux";
      return p;
    })();
    // best-effort version
    const osVersion = (os.release() || "").trim();

    const payload = {
      hostname,
      serial,
      manufacturer,
      model,
      os: { name: osName, version: osVersion },
      username,
      ips,
      uptimeSeconds,
    };

    const resp = await httpPostJson(ENROLL_URL, payload);
    // Optional: log to local file later. For dev, print small line:
    if (resp.status >= 200 && resp.status < 300) {
      console.log("Enroll OK:", resp.body);
      process.exit(0);
    } else {
      console.error("Enroll FAILED:", resp.status, resp.body);
      process.exit(1);
    }
  } catch (e) {
    console.error("Agent error:", e?.message || String(e));
    process.exit(1);
  }
})();
