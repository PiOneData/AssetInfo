import { type Asset, type SoftwareLicense, type AssetUtilization, type Ticket, type User } from "@shared/schema";

const LLAMA_ENDPOINT = process.env.LLAMA_ENDPOINT || "http://4.247.160.91:62565/chat";

async function callLlama(prompt: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(LLAMA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const rawText = await response.text();

    if (!response.ok) {
      throw new Error(`LLaMA API error (${response.status}): ${rawText}`);
    }

    try {
      const data = JSON.parse(rawText);
      return (
        data.answer ||
        data.response ||
        data.result ||
        data.text ||
        (typeof data === "string" ? data : rawText)
      ).toString().trim();
    } catch {
      return rawText.trim();
    }
  } catch (error) {
    console.error("LLaMA API error:", error);
    throw error instanceof Error ? error : new Error("Failed to contact LLaMA API");
  }
}

function safeJsonParse<T = any>(payload: string): T | null {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function formatLabel(value?: string | null) {
  if (!value) return "Unspecified";
  return value
    .toString()
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function summarizeAssets(assets: Asset[]) {
  const typeCounts = assets.reduce<Record<string, number>>((acc, asset) => {
    const typeKey = formatLabel(asset.type) || "Unknown";
    acc[typeKey] = (acc[typeKey] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.status || "unknown"] = (acc[asset.status || "unknown"] || 0) + 1;
    return acc;
  }, {});

  const locationCounts = assets.reduce<Record<string, number>>((acc, asset) => {
    const key = asset.country && asset.city ? `${asset.city}, ${asset.country}` :
      asset.country || asset.location || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = assets.reduce<Record<string, number>>((acc, asset) => {
    const categoryKey = formatLabel(asset.category) || formatLabel(asset.type) || "Uncategorized";
    acc[categoryKey] = (acc[categoryKey] || 0) + 1;
    return acc;
  }, {});

  const categoryStatusMap = assets.reduce<Record<string, Record<string, number>>>((acc, asset) => {
    const categoryKey = formatLabel(asset.category) || formatLabel(asset.type) || "Uncategorized";
    const statusKey = (asset.status || "unknown").toLowerCase();
    if (!acc[categoryKey]) {
      acc[categoryKey] = {};
    }
    acc[categoryKey][statusKey] = (acc[categoryKey][statusKey] || 0) + 1;
    return acc;
  }, {});

  const typeStatusMap = assets.reduce<Record<string, Record<string, number>>>((acc, asset) => {
    const typeKey = formatLabel(asset.type) || "Unknown";
    const statusKey = (asset.status || "unknown").toLowerCase();
    if (!acc[typeKey]) {
      acc[typeKey] = {};
    }
    acc[typeKey][statusKey] = (acc[typeKey][statusKey] || 0) + 1;
    return acc;
  }, {});

  const assignedAssets = assets
    .filter(asset => asset.assignedUserName)
    .slice(0, 10)
    .map(asset => `${asset.name} → ${asset.assignedUserName} (${asset.assignedUserEmail || "no email"})`);

  const expiringWarranties = assets
    .filter(asset => asset.warrantyExpiry && new Date(asset.warrantyExpiry) <= new Date(Date.now() + 1000 * 60 * 60 * 24 * 60))
    .sort((a, b) => (a.warrantyExpiry! > b.warrantyExpiry! ? 1 : -1))
    .slice(0, 10)
    .map(asset => `${asset.name} warranty ends ${new Date(asset.warrantyExpiry!).toISOString().split("T")[0]} (${asset.status || "status unknown"})`);

  const vendorSummary = assets.reduce<Record<string, number>>((acc, asset) => {
    if (!asset.vendorName) return acc;
    acc[asset.vendorName] = (acc[asset.vendorName] || 0) + 1;
    return acc;
  }, {});

  const costSummary = assets
    .filter(asset => asset.purchaseCost)
    .slice(0, 5)
    .map(asset => `${asset.name} cost $${Number(asset.purchaseCost).toFixed(2)} (${asset.status || "unknown"})`);

  return {
    typeCounts,
    statusCounts,
    categoryCounts,
    categoryStatusBreakdown: Object.entries(categoryStatusMap)
      .map(([category, statuses]) => ({
        category,
        total: Object.values(statuses).reduce((sum, value) => sum + value, 0),
        statuses,
      })),
    typeStatusBreakdown: Object.entries(typeStatusMap)
      .map(([type, statuses]) => ({
        type,
        total: Object.values(statuses).reduce((sum, value) => sum + value, 0),
        statuses,
      })),
    locationCounts: Object.entries(locationCounts).slice(0, 10),
    assignedAssets,
    expiringWarranties,
    vendorSummary: Object.entries(vendorSummary).slice(0, 10),
    costSummary,
  };
}

function formatStatusBreakdown(record: Record<string, number>) {
  return Object.entries(record)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
}

function summarizeLicenses(licenses: SoftwareLicense[]) {
  const licenseSummary = licenses.slice(0, 10).map(license => {
    const total = license.totalLicenses || 0;
    const used = license.usedLicenses || 0;
    const renewalDate = license.renewalDate ? new Date(license.renewalDate).toISOString().split("T")[0] : "N/A";
    return `${license.name || license.softwareName} (${used}/${total} used, renews ${renewalDate})`;
  });

  const licensesExpiring = licenses
    .filter(license => license.renewalDate && new Date(license.renewalDate) <= new Date(Date.now() + 1000 * 60 * 60 * 24 * 60))
    .map(license => `${license.name || license.softwareName} renews ${new Date(license.renewalDate!).toISOString().split("T")[0]}`);

  return { licenseSummary, licensesExpiring };
}

function buildDatasetSummary(
  assets: Asset[],
  licenses: SoftwareLicense[],
  utilization: AssetUtilization[]
) {
  const assetSummary = summarizeAssets(assets);
  const licenseSummary = summarizeLicenses(licenses);

  const utilizationSummary = utilization.slice(0, 10).map(item => {
    return `Asset ${item.assetId}: CPU ${item.cpuUsage ?? "?"}%, RAM ${item.ramUsage ?? "?"}%, Disk ${item.diskUsage ?? "?"}%`;
  });

  return [
    `Assets: ${assets.length} total`,
    `By Type: ${Object.entries(assetSummary.typeCounts).map(([type, count]) => `${type}=${count}`).join(", ") || "N/A"}`,
    `By Status: ${Object.entries(assetSummary.statusCounts).map(([status, count]) => `${status}=${count}`).join(", ") || "N/A"}`,
    `By Category: ${Object.entries(assetSummary.categoryCounts).map(([category, count]) => `${category}=${count}`).join(", ") || "N/A"}`,
    `Category Status: ${assetSummary.categoryStatusBreakdown.map(({ category, statuses, total }) => `${category} total ${total} (${formatStatusBreakdown(statuses) || "no status data"})`).join("; ") || "N/A"}`,
    `Type Status: ${assetSummary.typeStatusBreakdown.map(({ type, statuses, total }) => `${type} total ${total} (${formatStatusBreakdown(statuses) || "no status data"})`).join("; ") || "N/A"}`,
    `Top Locations: ${assetSummary.locationCounts.map(([loc, count]) => `${loc} (${count})`).join("; ") || "N/A"}`,
    `Upcoming Warranties: ${assetSummary.expiringWarranties.join("; ") || "None in next 60 days"}`,
    `Vendors: ${assetSummary.vendorSummary.map(([vendor, count]) => `${vendor} (${count})`).join("; ") || "N/A"}`,
    `High Cost Assets: ${assetSummary.costSummary.join("; ") || "N/A"}`,
    `Assigned Assets: ${assetSummary.assignedAssets.join("; ") || "No active assignments"}`,
    `Software Licenses: ${licenseSummary.licenseSummary.join("; ") || "None"}`,
    `Licenses Renewing Soon: ${licenseSummary.licensesExpiring.join("; ") || "None in next 60 days"}`,
    `Utilization Snapshot: ${utilizationSummary.join("; ") || "No utilization data"}`,
  ].join("\n");
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CLOSED_TICKET_STATUSES = new Set(["resolved", "closed", "cancelled"]);
const HIGH_PRIORITY_TICKETS = new Set(["high", "urgent"]);

interface RecommendationDatasetProfile {
  summaryText: string;
  stats: {
    statusCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    locationCounts: Record<string, number>;
    assignedCount: number;
    unassignedCount: number;
    idleInventory: Asset[];
    agingHardware: Asset[];
    expiringWarranties: Asset[];
    expiredWarranties: Asset[];
    expiringLicenses: SoftwareLicense[];
    unusedLicenses: Array<{ license: SoftwareLicense; unused: number }>;
    highCostAssets: Array<{ name: string; cost: number; status: string; location: string }>;
    totalPurchaseCost: number;
    averagePurchaseCost: number;
    costSampleCount: number;
    openTickets: Ticket[];
    recentTickets: Ticket[];
    highPriorityTickets: Ticket[];
    recurringTicketCategories: Array<{ name: string; count: number }>;
    recurringTicketAssets: Array<{ name: string; count: number }>;
    technicians: number;
    roleCounts: Record<string, number>;
  };
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) =>
  `$${numberFormatter.format(Math.round(Math.max(0, value)))}`;

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatISODate = (value: Date | null, fallback = "N/A") =>
  value ? value.toISOString().split("T")[0] : fallback;

const prettifyLabel = (label: string) =>
  label
    .split(/\s|_/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const sortEntries = (record: Record<string, number>, limit = 5) =>
  Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

const describeEntries = (entries: Array<[string, number]>, fallback = "None") =>
  entries.length
    ? entries
        .map(([label, count]) => `${prettifyLabel(label)}=${count}`)
        .join(", ")
    : fallback;

const buildLocationLabel = (asset: Asset) =>
  [asset.city, asset.state, asset.country]
    .filter((part) => !!part && `${part}`.trim().length)
    .join(", ") ||
  asset.location ||
  "Unspecified";

const buildRecommendationProfile = (input: RecommendationInput): RecommendationDatasetProfile => {
  const now = new Date();
  const soon45 = new Date(now.getTime() + 45 * DAY_IN_MS);
  const soon60 = new Date(now.getTime() + 60 * DAY_IN_MS);
  const staleThreshold = new Date(now.getTime() - 90 * DAY_IN_MS);
  const agingThreshold = new Date(now.getTime() - 3 * 365 * DAY_IN_MS);
  const recentWindow = new Date(now.getTime() - 90 * DAY_IN_MS);

  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};

  let assignedCount = 0;
  let unassignedCount = 0;
  const idleInventory: Asset[] = [];
  const agingHardware: Asset[] = [];
  const expiringWarranties: Asset[] = [];
  const expiredWarranties: Asset[] = [];
  const highCostAssetsDetailed: Array<{ asset: Asset; cost: number }> = [];
  let totalPurchaseCost = 0;
  let costSampleCount = 0;

  for (const asset of input.assets) {
    const statusKey = (asset.status || "unknown").toLowerCase();
    statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

    const typeKey = (asset.type || "Unknown").toLowerCase();
    typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;

    const locationLabel = buildLocationLabel(asset);
    locationCounts[locationLabel] = (locationCounts[locationLabel] || 0) + 1;

    if (asset.assignedUserName) {
      assignedCount += 1;
    } else {
      unassignedCount += 1;
    }

    const purchaseDate = toDate(asset.purchaseDate) || toDate(asset.createdAt);
    if (purchaseDate && purchaseDate < staleThreshold && statusKey === "in-stock") {
      idleInventory.push(asset);
    }
    if (purchaseDate && purchaseDate < agingThreshold) {
      agingHardware.push(asset);
    }

    const warrantyDate = toDate(asset.warrantyExpiry);
    if (warrantyDate) {
      if (warrantyDate < now) {
        expiredWarranties.push(asset);
      } else if (warrantyDate <= soon45) {
        expiringWarranties.push(asset);
      }
    }

    const cost = Number(asset.purchaseCost ?? 0);
    if (Number.isFinite(cost) && cost > 0) {
      totalPurchaseCost += cost;
      costSampleCount += 1;
      highCostAssetsDetailed.push({ asset, cost });
    }
  }

  const highCostAssets = highCostAssetsDetailed
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map(({ asset, cost }) => ({
      name: asset.name || asset.model || "Unnamed Asset",
      cost,
      status: asset.status || "unknown",
      location: buildLocationLabel(asset),
    }));

  const expiringLicenses = input.licenses.filter((license) => {
    const renewal = toDate(license.renewalDate);
    return !!renewal && renewal >= now && renewal <= soon60;
  });

  const unusedLicenses = input.licenses
    .map((license) => {
      const total = Number(license.totalLicenses || 0);
      const used = Number(license.usedLicenses || 0);
      const unused = Math.max(0, total - used);
      return { license, unused };
    })
    .filter((item) => item.unused > 0)
    .sort((a, b) => b.unused - a.unused);

  const recentTickets = input.tickets.filter((ticket) => {
    const created = toDate(ticket.createdAt as Date | string | undefined);
    return !created || created >= recentWindow;
  });

  const openTickets = recentTickets.filter(
    (ticket) => !CLOSED_TICKET_STATUSES.has((ticket.status || "").toLowerCase())
  );

  const highPriorityTickets = openTickets.filter((ticket) =>
    HIGH_PRIORITY_TICKETS.has((ticket.priority || "").toLowerCase())
  );

  const recurringTicketCategories = (() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const ticket of recentTickets) {
      const raw = (ticket.category || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const entry = map.get(key) || { name: raw, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .filter((entry) => entry.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  })();

  const recurringTicketAssets = (() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const ticket of recentTickets) {
      const raw = (ticket.assetName || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const entry = map.get(key) || { name: raw, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .filter((entry) => entry.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  })();

  for (const user of input.users) {
    const roleKey = (user.role || "unknown").toLowerCase();
    roleCounts[roleKey] = (roleCounts[roleKey] || 0) + 1;
  }

  const technicians = roleCounts["technician"] || 0;
  const totalAssets = input.assets.length;
  const statusSummary = describeEntries(sortEntries(statusCounts, 5), "No status data");
  const typeSummary = describeEntries(sortEntries(typeCounts, 5), "No type data");
  const locationSummary = describeEntries(sortEntries(locationCounts, 5), "No location data");

  const listTopAssets = (assetsList: Asset[], limit = 3) =>
    assetsList
      .slice(0, limit)
      .map((asset) => `${asset.name || asset.model || "Asset"} (${buildLocationLabel(asset)})`)
      .join(", ");

  const listTopLicenses = (licensesList: SoftwareLicense[], limit = 3) =>
    licensesList
      .slice(0, limit)
      .map((license) => `${license.name || license.softwareName || "License"} (${license.vendor || "vendor N/A"})`)
      .join(", ");

  const roleSummary = describeEntries(sortEntries(roleCounts, 5), "No role data");
  const highCostSample = highCostAssets
    .slice(0, 3)
    .map((asset) => `${asset.name} (${formatCurrency(asset.cost)})`)
    .join(", ") || "No cost data";

  const summarySections = [
    `Assets Summary:\n- ${totalAssets} total assets (${typeSummary})\n- Status mix: ${statusSummary}\n- Top locations: ${locationSummary}\n- Assigned vs unassigned: ${assignedCount} / ${unassignedCount}`,
    `Lifecycle & Warranty:\n- ${(statusCounts["in-repair"] || 0)} assets currently in repair and ${idleInventory.length} idle in stock for >90 days\n- ${agingHardware.length} assets purchased before ${agingHardware.length ? formatISODate(toDate(agingHardware[0].purchaseDate) || agingThreshold).slice(0, 4) : "recent years"}\n- ${expiringWarranties.length} warranties expiring within 45 days (${listTopAssets(expiringWarranties) || "none"})\n- ${expiredWarranties.length} warranties already expired`,
    `Licenses:\n- ${input.licenses.length} software titles tracked; ${expiringLicenses.length} renewals due within 60 days (${listTopLicenses(expiringLicenses) || "none"})\n- ${unusedLicenses.reduce((sum, item) => sum + item.unused, 0)} unused seats across ${unusedLicenses.length} products (${unusedLicenses
      .slice(0, 3)
      .map((item) => `${item.license.name || item.license.softwareName || "License"} (${item.unused} idle)`)
      .join(", ") || "none"})`,
    `Tickets (last 90 days):\n- ${recentTickets.length} tickets logged; ${openTickets.length} still open (${highPriorityTickets.length} high/urgent)\n- Frequent categories: ${recurringTicketCategories
      .map((entry) => `${entry.name} (${entry.count})`)
      .join(", ") || "none"}\n- Repeated asset issues: ${recurringTicketAssets
      .map((entry) => `${entry.name} (${entry.count})`)
      .join(", ") || "none"}`,
    `Users & Roles:\n- ${input.users.length} active users (${roleSummary})\n- ${technicians} technicians available for ticket response`,
    `Financial Overview:\n- Total recorded purchase cost ${formatCurrency(totalPurchaseCost)}; average ${
      costSampleCount ? formatCurrency(totalPurchaseCost / costSampleCount) : "N/A"
    }\n- Highest-cost assets: ${highCostSample}`,
  ];

  return {
    summaryText: summarySections.join("\n\n"),
    stats: {
      statusCounts,
      typeCounts,
      locationCounts,
      assignedCount,
      unassignedCount,
      idleInventory,
      agingHardware,
      expiringWarranties,
      expiredWarranties,
      expiringLicenses,
      unusedLicenses,
      highCostAssets,
      totalPurchaseCost,
      averagePurchaseCost: costSampleCount ? totalPurchaseCost / costSampleCount : 0,
      costSampleCount,
      openTickets,
      recentTickets,
      highPriorityTickets,
      recurringTicketCategories,
      recurringTicketAssets,
      technicians,
      roleCounts,
    },
  };
};

export interface RecommendationInput {
  assets: Asset[];
  licenses: SoftwareLicense[];
  utilization: AssetUtilization[];
  tickets: Ticket[];
  users: User[];
}

export interface AIRecommendation {
  type?: string;
  title?: string;
  description?: string;
  potentialSavings?: number;
  priority?: "low" | "medium" | "high";
  severity?: "low" | "medium" | "high";
  assetIds?: string[];
  reasoning?: string;
}

export interface ITAMQueryContext {
  assets: Asset[];
  licenses: SoftwareLicense[];
  utilization: AssetUtilization[];
  totalAssets: number;
  activeLicenses: number;
  userQuery: string;
}

export async function generateAssetRecommendations(
  input: RecommendationInput
): Promise<AIRecommendation[]> {
  if (!input.assets.length && !input.licenses.length) {
    return [];
  }

  const profile = buildRecommendationProfile(input);

  const instructions = `You are the optimization analyst for AssetVault's ITAM platform.
Use only the facts inside the provided dataset summary.
Generate between 3 and 7 actionable optimization recommendations.
Return ONLY valid JSON in this exact shape:
{
  "recommendations": [
    { "title": "Short Action Phrase", "content": "3-5 sentence explanation.", "type": "<optional type>", "severity": "<optional severity>" }
  ]
}
Rules:
- Title must be 4-8 words, action-focused, and contain no numbering or prefixes.
- Content must be a complete paragraph, avoid filler phrases like "Based on the data" or "Next step", never mention datasets/analysis/models/data sources, and never repeat the title verbatim.
- Use neutral, third-person language (no "our" or "we").
- Do not add commentary before or after the JSON block.`;

  const prompt = `${instructions}

Dataset Summary:
${profile.summaryText}

Recommendations:`;

  let structured: LlamaStructuredRecommendation[] = [];

  try {
    const llamaResponse = await callLlama(prompt);
    structured = parseStructuredRecommendations(llamaResponse);
  } catch (error) {
    console.error("Error contacting LLaMA for recommendations:", error);
  }

  let recommendations = structuredRecommendationsToAI(structured);

  if (recommendations.length < 3) {
    const fallback = buildRuleBasedRecommendations(profile, input);
    recommendations = dedupeRecommendations([...recommendations, ...fallback]);
  }

  if (!recommendations.length) {
    recommendations = buildRuleBasedRecommendations(profile, input);
  }

  return recommendations.slice(0, 7);
}

const recommendationTypeMatchers: Array<{ type: string; keywords: string[] }> = [
  { type: "License Optimization", keywords: ["license", "subscription", "seat", "renewal", "compliance"] },
  { type: "Hardware Refresh", keywords: ["hardware", "warranty", "device", "laptop", "desktop", "server", "refresh", "aging"] },
  { type: "Asset Utilization", keywords: ["stock", "inventory", "utilization", "unassigned", "idle", "reallocate", "warehouse"] },
  { type: "Security Risk", keywords: ["security", "threat", "vulnerability", "breach", "patch", "incident"] },
  { type: "Cost Reduction", keywords: ["cost", "spend", "budget", "saving", "optimize", "expense"] },
  { type: "Asset Consolidation", keywords: ["consolidate", "standardize", "duplicate", "sprawl", "footprint"] },
];

const FILLER_GLOBAL_REGEX = /\b(furthermore|additionally|moreover|lastly|overall|therefore|in conclusion|next steps?|to address this|based on the (provided|available|current) (data|dataset|information)|based on this data)\b[,:]?\s*/gi;

const severityKeywords = {
  high: ["urgent", "critical", "immediately", "severe", "high risk", "outage", "expired"],
  low: ["monitor", "consider", "gradual", "long-term"],
};

const FILLER_PREFIXES = [
  /^based on (the )?(provided|available) (dataset|data)[^,]*,?\s*/i,
  /^based on this (information|data)[^,]*,?\s*/i,
  /^in addition(,|\s)/i,
  /^additionally[,:]?\s*/i,
  /^furthermore[,:]?\s*/i,
  /^moreover[,:]?\s*/i,
  /^lastly[,:]?\s*/i,
  /^overall[,:]?\s*/i,
  /^another area for improvement (is|involves)\s*/i,
  /^therefore[,:]?\s*/i,
  /^to address this(,)?\s*/i,
  /^to address these issues(,)?\s*/i,
  /^next steps?[,:]?\s*/i,
  /^in conclusion[,:]?\s*/i,
  /^ultimately[,:]?\s*/i,
];

const PRONOUN_REPLACEMENTS = [
  { regex: /\bour\b/gi, replacement: "the organization's" },
  { regex: /\bours\b/gi, replacement: "the organization's" },
  { regex: /\bwe\b/gi, replacement: "the organization" },
  { regex: /\bus\b/gi, replacement: "the organization" },
  { regex: /\bour\s+it/gi, replacement: "the organization's IT" },
];

const DATASET_PHRASES = [
  /\bthe dataset suggests\b/gi,
  /\bbased on the dataset\b/gi,
  /\bbased on the provided dataset\b/gi,
  /\bbased on the (available|current) dataset\b/gi,
  /\bthe data indicates\b/gi,
  /\baccording to the data\b/gi,
  /\bthe analysis shows\b/gi,
  /\bthe model suggests\b/gi,
  /\bbased on the information provided\b/gi,
  /\boverall dataset summary\b/gi,
  /\bprovided dataset summary\b/gi,
  /\bbased on the information\b/gi,
  /\bbased on the analysis\b/gi,
  /\baccording to the analysis\b/gi,
  /\baccording to the dataset\b/gi,
];

const stripDatasetLanguage = (text: string) => {
  let cleaned = text;
  for (const pattern of DATASET_PHRASES) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(/\b(dataset|analysis|model|data)\b/gi, "");
  return cleaned;
};

const sanitizeParagraph = (text: string) => {
  let cleaned = text
    .replace(/^[-*\d\.\)]\s*/g, "")
    .replace(/[{}\[\]]/g, "")
    .trim();

  for (const pattern of FILLER_PREFIXES) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned.replace(/\bthis (analysis|data set|dataset|information)\b/gi, "the analysis");
  cleaned = cleaned.replace(FILLER_GLOBAL_REGEX, "");

  for (const { regex, replacement } of PRONOUN_REPLACEMENTS) {
    cleaned = cleaned.replace(regex, replacement);
  }

  cleaned = stripDatasetLanguage(cleaned);

  return cleaned.replace(/\s{2,}/g, " ").trim();
};

const inferRecommendationType = (paragraph: string): string => {
  const normalized = paragraph.toLowerCase();
  for (const matcher of recommendationTypeMatchers) {
    if (matcher.keywords.some((keyword) => normalized.includes(keyword))) {
      return matcher.type;
    }
  }
  return "General Optimization";
};

const inferSeverity = (paragraph: string): "low" | "medium" | "high" => {
  const normalized = paragraph.toLowerCase();
  if (severityKeywords.high.some((keyword) => normalized.includes(keyword))) {
    return "high";
  }
  if (severityKeywords.low.some((keyword) => normalized.includes(keyword))) {
    return "low";
  }
  return "medium";
};

const MAX_TITLE_WORDS = 8;

const sanitizeModelTitle = (title?: string, fallback?: string) => {
  if (!title) return fallback || "AI Insight";
  let cleaned = title
    .replace(/```/g, "")
    .replace(/^(recommendation|optimization|insight)\s*\d+[:.\-]?\s*/i, "")
    .replace(/^\d+[:.\-]?\s*/i, "")
    .trim();
  cleaned = stripDatasetLanguage(cleaned);
  const words = cleaned.split(/\s+/).filter(Boolean);
  cleaned = words.slice(0, MAX_TITLE_WORDS).join(" ");
  if (!cleaned) return fallback || "AI Insight";
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

interface LlamaStructuredRecommendation {
  title?: string;
  content?: string;
  severity?: string;
  type?: string;
}

const JSON_BLOCK_REGEX = /```json([\s\S]*?)```/i;

const parseStructuredRecommendations = (payload: string): LlamaStructuredRecommendation[] => {
  if (!payload?.trim()) return [];
  let raw = payload.trim();
  const match = raw.match(JSON_BLOCK_REGEX);
  if (match) {
    raw = match[1].trim();
  }

  const attemptParse = (input: string) => {
    try {
      return JSON.parse(input);
    } catch {
      const start = input.indexOf("{");
      const end = input.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const sliced = input.slice(start, end + 1);
        try {
          return JSON.parse(sliced);
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  let data = attemptParse(raw);
  if (!data && match) {
    data = attemptParse(match[1].trim());
  }

  if (!data) {
    return [];
  }

  const records = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.recommendations)
      ? (data as any).recommendations
      : [];

  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .filter((record) => record && typeof record === "object")
    .map((record: any) => ({
      title: typeof record.title === "string" ? record.title : undefined,
      content: typeof record.content === "string" ? record.content : undefined,
      severity: typeof record.severity === "string" ? record.severity : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
    }))
    .filter((record) => record.title && record.content);
};

const mapModelType = (value?: string) => {
  if (!value) return "";
  const normalized = value.toLowerCase();
  for (const matcher of recommendationTypeMatchers) {
    if (normalized.includes(matcher.type.toLowerCase())) {
      return matcher.type;
    }
  }
  return "";
};

const structuredRecommendationsToAI = (records: LlamaStructuredRecommendation[]): AIRecommendation[] =>
  records.map((record, index) => {
    const cleanTitle = sanitizeModelTitle(record.title, `AI Insight ${index + 1}`);
    const sanitizedContent = sanitizeParagraph(record.content || "");
    const severity = (record.severity || "").toLowerCase() as "low" | "medium" | "high";
    const type = mapModelType(record.type) || inferRecommendationType(sanitizedContent);
    const resolvedSeverity = ["low", "medium", "high"].includes(severity)
      ? severity
      : inferSeverity(sanitizedContent);

    return {
      type,
      title: cleanTitle,
      description: sanitizedContent,
      potentialSavings: 0,
      priority: resolvedSeverity,
      severity: resolvedSeverity,
      assetIds: [],
    };
  });

const dedupeRecommendations = (items: AIRecommendation[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.title}|${item.description}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const buildRuleBasedRecommendations = (
  profile: RecommendationDatasetProfile,
  input: RecommendationInput
): AIRecommendation[] => {
  const results: AIRecommendation[] = [];
  const stats = profile.stats;

  const pushRec = (rec: AIRecommendation) => {
    if (!rec.description?.trim()) return;
    results.push({
      ...rec,
      title: rec.title || `Insight ${results.length + 1}`,
      assetIds: rec.assetIds || [],
      potentialSavings: rec.potentialSavings ?? 0,
      priority: rec.priority || rec.severity || "medium",
      severity: rec.severity || rec.priority || "medium",
    });
  };

  const totalRecords = input.assets.length + input.licenses.length;
  if (totalRecords < 3) {
    pushRec({
      type: "General Optimization",
      title: "Add Foundational Data",
      description: "The ITAM environment has too few hardware or software entries for deeper analytics. Capture additional assets, licenses, and assignments to unlock richer AI insights.",
      severity: "medium",
    });
  }

  if (!input.assets.length) {
    pushRec({
      type: "Asset Utilization",
      title: "Add Hardware Inventory",
      description: "No hardware inventory has been recorded yet. Import laptops, desktops, and infrastructure assets so lifecycle tracking and warranty monitoring can begin.",
      severity: "medium",
    });
  }

  if (!input.licenses.length) {
    pushRec({
      type: "License Optimization",
      title: "Document Software Licenses",
      description: "Software licenses are missing from the system. Register core applications and license counts to enable optimization and renewal reminders.",
      severity: "medium",
    });
  }

  if (stats.expiringWarranties.length) {
    const soonAssets = stats.expiringWarranties
      .slice(0, 3)
      .map((asset) => `${asset.name || asset.model || "Asset"} (${formatISODate(toDate(asset.warrantyExpiry))})`)
      .join(", ");
    const severity = stats.expiringWarranties.length > 3 ? "high" : "medium";
    pushRec({
      type: "Hardware Refresh",
      title: "Plan refresh for approaching warranty expirations",
      description: `${stats.expiringWarranties.length} assets lose warranty coverage within 45 days, including ${soonAssets || "multiple core systems"}. Schedule preventive maintenance or refresh cycles now to avoid reactive break-fix costs and downtime.`,
      severity,
      priority: severity,
      assetIds: stats.expiringWarranties.slice(0, 5).map((asset) => asset.id).filter(Boolean),
    });
  }

  if (stats.unusedLicenses.length) {
    const totalUnused = stats.unusedLicenses.reduce((sum, item) => sum + item.unused, 0);
    const sample = stats.unusedLicenses
      .slice(0, 3)
      .map((item) => `${item.license.name || item.license.softwareName || "License"} (${item.unused} idle)`) 
      .join(", ");
    const severity = totalUnused > 25 ? "high" : "medium";
    pushRec({
      type: "License Optimization",
      title: "Reclaim idle software licenses",
      description: `License telemetry shows ${totalUnused} unused seats across ${stats.unusedLicenses.length} subscriptions such as ${sample || "the tracked vendors"}. Reassign or downgrade them this quarter to trim recurring subscription spend.`,
      severity,
      priority: severity,
    });
  }

  if (stats.idleInventory.length) {
    const idleSample = stats.idleInventory
      .slice(0, 3)
      .map((asset) => `${asset.name || asset.model || "Asset"} in ${buildLocationLabel(asset)}`)
      .join(", ");
    const severity = stats.idleInventory.length > 10 ? "medium" : "low";
    pushRec({
      type: "Asset Utilization",
      title: "Redeploy long-idle inventory",
      description: `${stats.idleInventory.length} assets have remained in stock for more than 90 days, including ${idleSample || "inventory across multiple sites"}. Align upcoming projects or bulk redeployments to keep depreciation in check.`,
      severity,
      priority: severity,
      assetIds: stats.idleInventory.slice(0, 5).map((asset) => asset.id).filter(Boolean),
    });
  }

  if (stats.recurringTicketCategories.length) {
    const category = stats.recurringTicketCategories[0];
    const severity = category.count >= 5 ? "high" : "medium";
    pushRec({
      type: category.name.toLowerCase().includes("security") ? "Security Risk" : "General Optimization",
      title: `Contain recurring ${prettifyLabel(category.name)} incidents`,
      description: `Service desk data shows ${category.count} ${category.name} tickets within the last 90 days. Launch a focused root-cause review, add monitoring, and publish a permanent fix before the issue escalates again.`,
      severity,
      priority: severity,
    });
  } else if (stats.highPriorityTickets.length) {
    const severity = stats.highPriorityTickets.length >= 3 ? "high" : "medium";
    pushRec({
      type: "Security Risk",
      title: "Close out high-priority open tickets",
      description: `${stats.highPriorityTickets.length} high or urgent tickets remain open, indicating unresolved production impact. Rally the on-call technicians and publish a daily update cadence until the queue is cleared.`,
      severity,
      priority: severity,
    });
  } else if (stats.openTickets.length) {
    pushRec({
      type: "General Optimization",
      title: "Tighten ticket turnaround times",
      description: `${stats.openTickets.length} tickets from the last 90 days are still open. Review owner assignments and add interim updates so requestors know when to expect resolution.`,
      severity: "medium",
      priority: "medium",
    });
  }

  if (stats.agingHardware.length) {
    const sample = stats.agingHardware
      .slice(0, 3)
      .map((asset) => `${asset.name || asset.model || "Asset"} (${formatISODate(toDate(asset.purchaseDate) || toDate(asset.createdAt))})`)
      .join(", ");
    pushRec({
      type: "Hardware Refresh",
      title: "Refresh aging hardware portfolio",
      description: `${stats.agingHardware.length} devices were purchased over three years ago, including ${sample || "multiple production systems"}. Budget for phased replacements so users are not left on unsupported hardware.`,
      severity: "medium",
      priority: "medium",
    });
  }

  if (results.length < 3 && input.assets.length) {
    const deployed = stats.statusCounts["deployed"] || 0;
    const instock = stats.statusCounts["in-stock"] || 0;
    const severity = instock > deployed ? "medium" : "low";
    pushRec({
      type: "Asset Utilization",
      title: "Balance deployed vs stored assets",
      description: `Inventory mix shows ${instock} devices waiting in stock against ${deployed} deployed. Accelerate assignment or retire excess SKUs so capital investment keeps delivering value.`,
      severity,
      priority: severity,
    });
  }

  if (results.length < 3 && input.licenses.length) {
    pushRec({
      type: "License Optimization",
      title: "Track upcoming license renewals",
      description: `${stats.expiringLicenses.length || 0} license contracts renew within 60 days. Lock in renewals where needed and flag low-usage titles for downgrade conversations before invoices arrive.`,
      severity: "medium",
      priority: "medium",
    });
  }

  if (results.length < 3 && stats.openTickets.length) {
    pushRec({
      type: "General Optimization",
      title: "Improve ticket knowledge sharing",
      description: `Only ${profile.stats.technicians || 0} technicians are available for ${stats.openTickets.length} open tickets. Share troubleshooting notes centrally so follow-the-sun teams can pick up work without delays.`,
      severity: "medium",
      priority: "medium",
    });
  }

  return results.slice(0, 7);
};

export async function analyzeAssetUtilization(
  asset: Asset,
  utilizationData: AssetUtilization[]
): Promise<{
  averageCpuUsage: number;
  averageRamUsage: number;
  averageDiskUsage: number;
  utilizationTrend: "increasing" | "decreasing" | "stable";
  recommendation: string;
}> {
  try {
    if (utilizationData.length === 0) {
      return {
        averageCpuUsage: 0,
        averageRamUsage: 0,
        averageDiskUsage: 0,
        utilizationTrend: "stable",
        recommendation: "No utilization data available for analysis.",
      };
    }

    const avgCpu = utilizationData.reduce((sum, data) => sum + parseFloat(data.cpuUsage || "0"), 0) / utilizationData.length;
    const avgRam = utilizationData.reduce((sum, data) => sum + parseFloat(data.ramUsage || "0"), 0) / utilizationData.length;
    const avgDisk = utilizationData.reduce((sum, data) => sum + parseFloat(data.diskUsage || "0"), 0) / utilizationData.length;

    const prompt = `You are an IT asset utilization analyst. Analyze usage patterns and provide recommendations.
Respond in JSON format:
{
  "utilizationTrend": "increasing|decreasing|stable",
  "recommendation": "Brief recommendation"
}

Asset: ${asset.name} (${asset.type})
Average CPU Usage: ${avgCpu.toFixed(2)}%
Average RAM Usage: ${avgRam.toFixed(2)}%
Average Disk Usage: ${avgDisk.toFixed(2)}%
Recent utilization data points: ${utilizationData.length}`;

    const responseText = await callLlama(prompt);
    const result = safeJsonParse<{ utilizationTrend?: string; recommendation?: string }>(responseText) || {};

    return {
      averageCpuUsage: avgCpu,
      averageRamUsage: avgRam,
      averageDiskUsage: avgDisk,
      utilizationTrend: result.utilizationTrend || "stable",
      recommendation: result.recommendation || "No specific recommendations at this time.",
    };
  } catch (error) {
    console.error("Error analyzing asset utilization:", error);
    return {
      averageCpuUsage: 0,
      averageRamUsage: 0,
      averageDiskUsage: 0,
      utilizationTrend: "stable",
      recommendation: "Unable to analyze utilization data.",
    };
  }
}

export async function processITAMQuery(context: ITAMQueryContext): Promise<string> {
  try {
    const systemPrompt = `You are the AI Assistant for the AssetVault IT Asset Management platform.
Only answer using the ITAM data provided in the context.
Do NOT guess, fabricate, or hallucinate information.
If something is not found in the data, reply:
"I couldn't find this information in the current ITAM data."

You can answer:
- asset counts and categories
- deployed / in-stock / in-repair / retired assets
- software licenses expiring soon
- location-based asset queries
- user assignments
- warranty timelines
- vendor contract summaries
- report summaries
- current IT optimization recommendations`;

    const assetSummary = summarizeAssets(context.assets);
    const licenseSummary = summarizeLicenses(context.licenses);

    const contextSections = [
      `Total assets: ${context.totalAssets}`,
      `Asset types: ${Object.entries(assetSummary.typeCounts).map(([type, count]) => `${type}=${count}`).join(", ") || "N/A"}`,
      `Asset status: ${Object.entries(assetSummary.statusCounts).map(([status, count]) => `${status}=${count}`).join(", ") || "N/A"}`,
      `Asset categories: ${Object.entries(assetSummary.categoryCounts).map(([category, count]) => `${category}=${count}`).join(", ") || "N/A"}`,
      `Category details: ${assetSummary.categoryStatusBreakdown.map(({ category, total, statuses }) => `${category}: total ${total} (${formatStatusBreakdown(statuses) || "no status data"})`).join("; ") || "N/A"}`,
      `Type & status details: ${assetSummary.typeStatusBreakdown.map(({ type, total, statuses }) => `${type}: total ${total} (${formatStatusBreakdown(statuses) || "no status data"})`).join("; ") || "N/A"}`,
      `Locations: ${assetSummary.locationCounts.map(([loc, count]) => `${loc} (${count})`).join("; ") || "N/A"}`,
      `Upcoming warranties (<=60 days): ${assetSummary.expiringWarranties.join("; ") || "None"}`,
      `Vendors & contracts: ${assetSummary.vendorSummary.map(([vendor, count]) => `${vendor} (${count})`).join("; ") || "N/A"}`,
      `Assigned devices: ${assetSummary.assignedAssets.join("; ") || "No assignments"}`,
      `High-cost assets: ${assetSummary.costSummary.join("; ") || "N/A"}`,
      `Software licenses (${context.activeLicenses} active): ${licenseSummary.licenseSummary.join("; ") || "None"}`,
      `Licenses renewing soon: ${licenseSummary.licensesExpiring.join("; ") || "None in next 60 days"}`,
    ].join("\n");

    const finalPrompt = `${systemPrompt}

Context:
${contextSections}

User Query:
${context.userQuery}`;

    return await callLlama(finalPrompt);
  } catch (error) {
    console.error("Error processing ITAM query:", error);
    return "I'm experiencing technical difficulties. Please try your question again in a moment.";
  }
}
