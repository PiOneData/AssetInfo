// server/utils/openAuditClient.ts
import axios, { AxiosRequestConfig } from "axios";

/** ---- ENV (loaded by server bootstrap via dotenv) ---- */
export const OA_BASE_URL = process.env.OA_BASE_URL || "";
const OA_USERNAME = process.env.OA_USERNAME || "";
const OA_PASSWORD = process.env.OA_PASSWORD || "";

if (!OA_BASE_URL || !OA_USERNAME || !OA_PASSWORD) {
  console.warn("Warning: Missing OA_* env vars (OA_BASE_URL, OA_USERNAME, OA_PASSWORD). OpenAudit integration will not work.");
}

/** ---- Axios defaults ---- */
const AXIOS_OPTS: AxiosRequestConfig = {
  timeout: 15_000,
  maxRedirects: 5,
  headers: {
    "User-Agent": "ITAM-Bridge/1.0 (+Open-AudIT integration)",
    Accept: "application/json",
  },
  // Default: treat 2xx-3xx as OK; individual calls override when we want to capture all
  validateStatus: (s) => s >= 200 && s < 400,
};

/**
 * Build minimal Open-AudIT XML for device submission
 */
export function buildMinimalOAXml(opts: {
  hostname: string;
  ip: string | null;
  serial: string | null;
  osName: string | null;
  osVersion: string | null;
  manufacturer: string | null;
  model: string | null;
}): string {
  const escape = (str: string | null) => {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<system>
  <sys>
    <hostname>${escape(opts.hostname)}</hostname>
    <ip>${escape(opts.ip)}</ip>
    <serial>${escape(opts.serial)}</serial>
    <manufacturer>${escape(opts.manufacturer)}</manufacturer>
    <model>${escape(opts.model)}</model>
    <os_name>${escape(opts.osName)}</os_name>
    <os_version>${escape(opts.osVersion)}</os_version>
  </sys>
</system>`;
}

/** ---- Session login: returns a consolidated Cookie header ---- */
export async function oaLogin(baseUrl?: string, username?: string, password?: string): Promise<string> {
  // Always use defaults - all tenants share the same OpenAudit instance
  const url = `${baseUrl || OA_BASE_URL}/index.php/logon`;
  const user = username || OA_USERNAME;
  const pass = password || OA_PASSWORD;
  
  const form = new URLSearchParams({ username: user, password: pass });

  // Capture ALL statuses to log helpful info
  const res = await axios.post(url, form.toString(), {
    ...AXIOS_OPTS,
    headers: {
      ...AXIOS_OPTS.headers,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
    },
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300) {
    const snippet =
      typeof res.data === "string"
        ? res.data.slice(0, 300)
        : JSON.stringify(res.data ?? {}).slice(0, 300);
    console.error(`oaLogin HTTP ${res.status}: ${snippet}`);
    throw new Error(`oaLogin HTTP ${res.status}`);
  }

  const setCookies = res.headers["set-cookie"];
  if (!setCookies || setCookies.length === 0) {
    console.error("oaLogin failed: no Set-Cookie header returned");
    throw new Error("Open-AudIT login failed: no Set-Cookie returned.");
  }

  // Join all cookies into a single header value (a=1; b=2)
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookieHeader) {
    console.error("oaLogin failed: empty cookie string after parsing Set-Cookie");
    throw new Error("Open-AudIT login failed: empty cookie.");
  }
  return cookieHeader;
}

/** ---- Devices list (raw OA payload) ---- */
export async function oaFetchDevices(
  cookie: string, 
  limit = 50, 
  offset = 0, 
  baseUrl?: string,
  orgId?: string | number
) {
  // NOTE: OpenAudit 5.6.5 returns HTTP 500 when using org_id URL parameter
  // We fetch ALL devices and filter client-side instead
  const url = `${baseUrl || OA_BASE_URL}/index.php/devices?format=json&limit=${limit}&offset=${offset}`;
  
  const res = await axios.get(url, {
    ...AXIOS_OPTS,
    headers: { ...AXIOS_OPTS.headers, Cookie: cookie },
    // Capture 4xx/5xx for logging
    validateStatus: (s) => s >= 200 && s < 500,
  });
  if (res.status < 200 || res.status >= 300) {
    const snippet =
      typeof res.data === "string"
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data ?? {}).slice(0, 200);
    console.error(`Open-AudIT devices HTTP ${res.status}: ${snippet}`);
    throw new Error(`Open-AudIT devices HTTP ${res.status}`);
  }
  
  // Client-side filtering by org_id if specified
  if (orgId && res.data?.data) {
    const orgIdStr = String(orgId);
    const filteredDevices = res.data.data.filter((device: any) => {
      return String(device?.attributes?.org_id) === orgIdStr;
    });
    
    // Update response to reflect filtered results
    return {
      ...res.data,
      data: filteredDevices,
      meta: {
        ...res.data.meta,
        filtered_total: filteredDevices.length,
        original_total: res.data.meta?.total || res.data.data.length,
        org_id_filter: orgIdStr
      }
    };
  }
  
  return res.data;
}

/** Convenience: login + fetch first page */
export async function oaFetchDevicesFirstPage(
  limit = 50, 
  baseUrl?: string, 
  username?: string, 
  password?: string,
  orgId?: string | number
) {
  const cookie = await oaLogin(baseUrl, username, password);
  return oaFetchDevices(cookie, limit, 0, baseUrl, orgId);
}

/** ---- Normalize OA software rows to a simple shape for the UI ---- */
function normalizeSoftwareRows(payload: any) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    // Log a small snippet for diagnostics
    const snippet =
      typeof payload === "string"
        ? payload.slice(0, 200)
        : JSON.stringify(payload ?? {}).slice(0, 200);
    throw new Error(
      `Unexpected Open-AudIT response shape for software list. Got: ${snippet}`
    );
  }

  return (payload.data as any[]).map((row) => {
    // OA often returns JSON:API-ish objects: { id, type, attributes: { ... } }
    const a = row?.attributes ?? row;

    // Some builds call it vendor, some publisher
    const publisher =
      a?.publisher != null && String(a.publisher).trim() !== ""
        ? String(a.publisher).trim()
        : a?.vendor != null && String(a.vendor).trim() !== ""
        ? String(a.vendor).trim()
        : null;

    return {
      name: String(a?.name ?? "").trim(),
      version:
        a?.version != null && String(a.version).trim() !== ""
          ? String(a.version).trim()
          : null,
      publisher,
      installed_on:
        a?.installed_on != null && String(a.installed_on).trim() !== ""
          ? String(a.installed_on).trim()
          : null,
    };
  });
}

/**
 * ---- Fetch Software for a specific OA device id ----
 *
 * We try multiple endpoints because different OA builds expose software in
 * different routes. Order (you verified #1 works with 200):
 *  1) GET /components?format=json&components.type=software&components.device_id={id}
 *     (with X-Requested-With: XMLHttpRequest)
 *  2) /devices/{id}/software?format=json
 *  3) /devices/{id}/components/software?format=json
 *  4) /software?filter=[{"name":"software.system_id","operator":"=","value":"{id}"}]
 */
export async function oaFetchDeviceSoftware(
  oaDeviceId: string | number,
  limit = 1000
) {
  // Always use shared OpenAudit credentials
  const cookie = await oaLogin();
  const id = encodeURIComponent(String(oaDeviceId));

  // 1) Primary: confirmed working in your curl test
  const urlComponents =
    `${OA_BASE_URL}/index.php/components` +
    `?format=json&limit=${encodeURIComponent(String(limit))}` +
    `&components.type=software&components.device_id=${id}`;

  // 2) Other candidates (kept as fallbacks)
  const candidates = [
    `${OA_BASE_URL}/index.php/devices/${id}/software?format=json&limit=${limit}`,
    `${OA_BASE_URL}/index.php/devices/${id}/components/software?format=json&limit=${limit}`,
    `${OA_BASE_URL}/index.php/software?format=json&limit=${limit}&filter=${encodeURIComponent(
      JSON.stringify([{ name: "software.system_id", operator: "=", value: String(oaDeviceId) }])
    )}`,
  ];

  // Helper: GET + normalize with optional extra headers
  const tryGet = async (url: string, extraHeaders?: Record<string, string>) => {
    const res = await axios.get(url, {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        Cookie: cookie,
        ...(extraHeaders ?? {}),
      },
      validateStatus: (s) => s >= 200 && s < 500,
    });

    if (res.status >= 200 && res.status < 300) {
      return normalizeSoftwareRows(res.data);
    }

    const snippet =
      typeof res.data === "string"
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data ?? {}).slice(0, 200);
    console.error(
      `OA software fetch failed ${res.status} ${res.statusText} :: ${url} :: ${snippet}`
    );
    throw new Error(`HTTP ${res.status}`);
  };

  // Try the confirmed-working components route first (needs XRW header)
  try {
    return await tryGet(urlComponents, { "X-Requested-With": "XMLHttpRequest" });
  } catch {
    // fall through
  }

  // Then the other routes
  for (const url of candidates) {
    try {
      return await tryGet(url);
    } catch {
      // continue to next candidate
    }
  }

  throw new Error("OA did not return software for any known endpoint (likely 404s).");
}

/* =======================================================================
 * Helpers for the enrollment flow
 * =======================================================================
 */

// Submit an audit XML payload to OA (/index.php/input/devices)
export async function oaSubmitDeviceXML(xml: string): Promise<void> {
  const cookie = await oaLogin();

  // OA expects form field "data" to hold the XML (same as official scripts)
  const form = new URLSearchParams();
  form.set("data", xml);

  const url = `${OA_BASE_URL}/index.php/input/devices`;
  const res = await axios.post(url, form.toString(), {
    ...AXIOS_OPTS,
    headers: {
      ...AXIOS_OPTS.headers,
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*", // OA may return HTML/text; don't force JSON here
    },
    validateStatus: () => true, // capture all statuses for better logging
  });

  if (res.status < 200 || res.status >= 300) {
    const snippet =
      typeof res.data === "string"
        ? res.data.slice(0, 300)
        : JSON.stringify(res.data ?? {}).slice(0, 300);
    console.error(`OA input/devices ${res.status}: ${snippet}`);
    throw new Error(`OA input/devices HTTP ${res.status}`);
  }
}

/** Internal helper to query OA devices with a given filter array */
async function queryDevicesWithFilter(cookie: string, filter: any[]) {
  const url =
    `${OA_BASE_URL}/index.php/devices?format=json&limit=1&filter=` +
    encodeURIComponent(JSON.stringify(filter));

  const res = await axios.get(url, {
    ...AXIOS_OPTS,
    headers: { ...AXIOS_OPTS.headers, Cookie: cookie },
    validateStatus: () => true, // capture all for logging
  });

  const ok = res.status >= 200 && res.status < 300;
  if (!ok) {
    const snippet =
      typeof res.data === "string"
        ? res.data.slice(0, 200)
        : JSON.stringify(res.data ?? {}).slice(0, 200);
    console.warn(`oaFindDeviceId query HTTP ${res.status} :: ${url} :: ${snippet}`);
    return null;
  }

  const row = Array.isArray(res.data?.data) ? res.data.data[0] : null;
  if (!row) return null;

  // OA JSON:API style: id at top-level or under attributes
  const id = row?.id ?? row?.attributes?.id ?? null;
  return id ? String(id) : null;
}

// Find OA device id by serial (best) or hostname (fallbacks), with
// a robust fallback to unfiltered listing when filtered queries 500.
export async function oaFindDeviceId(opts: {
  serial?: string | null;
  hostname?: string | null;
}): Promise<string | null> {
  const cookie = await oaLogin();
  const serial = (opts.serial ?? "").trim();
  const hostname = (opts.hostname ?? "").trim();

  // ---------- 1) Try filtered lookups (may 500 in your OA) ----------
  const attempts: Array<{ why: string; filter: any[] }> = [];

  if (serial) {
    attempts.push({
      why: `serial = ${serial}`,
      filter: [{ name: "system.serial", operator: "=", value: serial }],
    });
  }

  if (hostname) {
    attempts.push({
      why: `hostname (exact) = ${hostname}`,
      filter: [{ name: "system.hostname", operator: "=", value: hostname }],
    });
    attempts.push({
      why: `name (exact) = ${hostname}`,
      filter: [{ name: "system.name", operator: "=", value: hostname }],
    });
    attempts.push({
      why: `hostname LIKE %${hostname}%`,
      filter: [{ name: "system.hostname", operator: "LIKE", value: `%${hostname}%` }],
    });
    attempts.push({
      why: `name LIKE %${hostname}%`,
      filter: [{ name: "system.name", operator: "LIKE", value: `%${hostname}%` }],
    });
  }

  for (const a of attempts) {
    const id = await queryDevicesWithFilter(cookie, a.filter);
    if (id) return id;
    console.warn(`oaFindDeviceId: no match for ${a.why}`);
  }

  // ---------- 2) Fallback: list-first (no filters) & match locally ----------
  // Pull up to 200 (cheap in your tenant), then match by serial or hostname/FQDN
  try {
    const limit = 200;
    const url = `${OA_BASE_URL}/index.php/devices?format=json&limit=${limit}&offset=0`;
    const res = await axios.get(url, {
      ...AXIOS_OPTS,
      headers: { ...AXIOS_OPTS.headers, Cookie: cookie },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
      console.warn(`oaFindDeviceId list fallback HTTP ${res.status}`);
      return null;
    }

    const rows: any[] = res.data.data ?? [];
    const norm = (x: any) => String(x ?? "").trim().toLowerCase();

    // Try by serial first
    if (serial) {
      const hit = rows.find((r) => {
        const a = r?.attributes ?? {};
        return norm(a.serial) === norm(serial);
      });
      if (hit?.id) return String(hit.id);
    }

    // Then by hostname exact, then contains (handles FQDNs)
    if (hostname) {
      const exact = rows.find((r) => {
        const a = r?.attributes ?? {};
        return norm(a.hostname) === norm(hostname) || norm(a.name) === norm(hostname);
      });
      if (exact?.id) return String(exact.id);

      const contains = rows.find((r) => {
        const a = r?.attributes ?? {};
        return (
          norm(a.hostname).includes(norm(hostname)) ||
          norm(a.name).includes(norm(hostname))
        );
      });
      if (contains?.id) return String(contains.id);
    }

    return null;
  } catch (e: any) {
    console.warn(`oaFindDeviceId list fallback error: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Update a device's organization in OpenAudit
 * 
 * IMPORTANT: OpenAudit XML submissions IGNORE <org_id> tag - devices always go to default org.
 * This function updates the device's org_id AFTER creation using the correct approach.
 * 
 * Per OpenAudit 5.6.5 requirements:
 * - Must use PUT (not PATCH) for organization assignment
 * - Must include hostname and serial in payload (ORM validation requirement)
 * - CSRF token comes from /devices/{id} endpoint's meta.access_token
 * - User must have "Org Assign = All Organizations" permission
 */
export async function oaUpdateDeviceOrg(
  deviceId: string | number,
  orgId: string | number,
  hostname: string,
  serial: string,
  baseUrl?: string,
  username?: string,
  password?: string
): Promise<void> {
  const url = baseUrl || OA_BASE_URL;
  const cookie = await oaLogin(baseUrl, username, password);
  
  try {
    console.log(`🔄 Getting CSRF token and device details for device ${deviceId}...`);
    
    // Step 1: Get CSRF access_token and current device details
    const tokenRes = await axios.get(`${url}/index.php/devices/${deviceId}?format=json`, {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        Cookie: cookie,
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
    
    if (tokenRes.status !== 200) {
      console.error(`❌ Failed to get device details: HTTP ${tokenRes.status}`);
      throw new Error(`Failed to get device details: HTTP ${tokenRes.status}`);
    }
    
    const accessToken = tokenRes.data?.meta?.access_token;
    if (!accessToken) {
      console.error(`❌ No access_token in device response meta`);
      throw new Error("No access_token in device response meta");
    }
    
    console.log(`✅ Got CSRF token, updating device ${deviceId} to org ${orgId} using PUT with full attributes...`);
    
    // Step 2: Update device using PUT (not PATCH) with full attributes
    // CRITICAL: OpenAudit requires hostname, serial, and org_id for ORM validation
    const dataPayload = JSON.stringify({
      access_token: accessToken,
      type: "devices",
      id: String(deviceId),
      attributes: {
        org_id: String(orgId),
        hostname: hostname,
        serial: serial || hostname, // Fallback to hostname if no serial
        description: "Auto-assigned to organization via API"
      }
    });
    
    const formData = new URLSearchParams();
    formData.append('data', dataPayload);
    
    // Use PUT instead of PATCH for organization assignment
    const updateRes = await axios.put(
      `${url}/index.php/devices/${deviceId}`,
      formData.toString(),
      {
        ...AXIOS_OPTS,
        headers: {
          ...AXIOS_OPTS.headers,
          Cookie: cookie,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        validateStatus: () => true,
      }
    );

    if (updateRes.status < 200 || updateRes.status >= 300) {
      const snippet =
        typeof updateRes.data === "string"
          ? updateRes.data.slice(0, 300)
          : JSON.stringify(updateRes.data ?? {}).slice(0, 300);
      console.error(`❌ OA update device org HTTP ${updateRes.status}: ${snippet}`);
      throw new Error(`OA update device org HTTP ${updateRes.status}: ${snippet}`);
    }
    
    console.log(`✅ Successfully updated device ${deviceId} (${hostname}) to org ${orgId} in OpenAudit`);
  } catch (error: any) {
    console.error(`❌ Failed to update device ${deviceId} org to ${orgId}:`, error?.message || error);
    throw error;
  }
}

/**
 * Create a new organization in OpenAudit
 * Returns the newly created organization ID
 */
/**
 * Create a new organization in OpenAudit via REST API
 * Returns the newly created organization ID
 * 
 * Process:
 * 1. Login to get session cookie
 * 2. Make a JSON GET request to get fresh access_token from meta.access_token
 * 3. POST to /orgs with data as form field containing JSON with access_token at top level
 */
export async function oaCreateOrganization(
  orgName: string,
  baseUrl?: string,
  username?: string,
  password?: string
): Promise<string> {
  const url = baseUrl || OA_BASE_URL;
  const cookie = await oaLogin(baseUrl, username, password);
  
  try {
    // Step 1: Get a fresh CSRF access_token by making any JSON GET request
    console.log(`📝 Getting fresh access_token for org creation...`);
    const tokenRes = await axios.get(`${url}/index.php/devices?limit=1&format=json`, {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        Cookie: cookie,
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
    
    if (tokenRes.status !== 200) {
      throw new Error(`Failed to get access token: HTTP ${tokenRes.status}`);
    }
    
    const accessToken = tokenRes.data?.meta?.access_token;
    if (!accessToken) {
      throw new Error("No access_token in response meta");
    }
    
    console.log(`� Got access_token: ${accessToken.substring(0, 20)}...`);
    
    // Step 2: Create the organization using form data with JSON string
    // OpenAudit expects: -F "data={JSON}"
    // The JSON must have access_token at top level, not inside attributes
    const dataPayload = JSON.stringify({
      access_token: accessToken,
      type: "orgs",
      attributes: {
        name: orgName,
        description: `Auto-created for ${orgName}`,
        parent_id: 1, // Default Organisation as parent
      }
    });
    
    const formData = new URLSearchParams();
    formData.append('data', dataPayload);

    console.log(`🔨 Creating organization '${orgName}'...`);
    const createRes = await axios.post(`${url}/index.php/orgs`, formData.toString(), {
      ...AXIOS_OPTS,
      headers: {
        ...AXIOS_OPTS.headers,
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });

    // Check response
    if (createRes.status >= 200 && createRes.status < 300) {
      // Try multiple places where the ID might be
      const orgId = 
        createRes.data?.data?.id || 
        createRes.data?.data?.attributes?.id ||
        createRes.data?.meta?.id;
        
      if (orgId) {
        const orgIdStr = String(orgId);
        console.log(`✅ Created OpenAudit org '${orgName}' with ID: ${orgIdStr}`);
        return orgIdStr;
      } else {
        // Log the full response to debug
        console.log("Response data:", JSON.stringify(createRes.data, null, 2));
        throw new Error("Organization created but could not extract ID from response");
      }
    }
    
    // Check for errors in response
    if (createRes.data?.errors) {
      throw new Error(`OpenAudit API error: ${createRes.data.errors}`);
    }
    
    // If we get here, the creation failed
    const snippet =
      typeof createRes.data === "string"
        ? createRes.data.slice(0, 200)
        : JSON.stringify(createRes.data ?? {}).slice(0, 200);
    console.error(`OA create org returned ${createRes.status}: ${snippet}`);
    throw new Error(`Failed to create org in OpenAudit: HTTP ${createRes.status}`);
    
  } catch (error) {
    console.error(`❌ Failed to create OpenAudit organization '${orgName}':`, error);
    throw error;
  }
}
