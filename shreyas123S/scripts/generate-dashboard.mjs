import { writeFileSync, mkdirSync, existsSync } from "fs";

const USERNAME = process.env.GH_USERNAME || "shreyas123S";
const TOKEN = process.env.STATS_TOKEN;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Terminal Aesthetic Design Tokens
const theme = {
  bg: "#09090b",          // Deep dark charcoal
  cardBg: "#09090b",
  border: "#27272a",      // Subdued border
  textMain: "#f4f4f5",    // Primary white/gray
  textSub: "#a1a1aa",     // Secondary gray
  textDim: "#52525b",     // Muted text
  accentGreen: "#4ade80", // Terminal green
  accentCyan: "#22d3ee",  // Cyber cyan
  accentAmber: "#fbbf24", // Warning amber
  accentPink: "#f472b6",  // Secondary accent
  fontMono: "Consolas, 'Courier New', monospace",
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
};

// Sleep helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GraphQL Fetch
const graphql = async (query, variables = {}) => {
  if (!TOKEN) {
    console.log("No STATS_TOKEN provided. Using mock data for local testing.");
    return getMockData();
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "terminal-dashboard-generator",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.errors) {
        throw new Error(JSON.stringify(json.errors));
      }
      return json.data;
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
};

// Mock data generator for testing without token
const getMockData = () => ({
  user: {
    name: "Shreyas",
    followers: { totalCount: 142 },
    repositories: {
      totalCount: 45,
      nodes: [
        { stargazers: { totalCount: 15 }, primaryLanguage: { name: "Python", color: "#3572A5" } },
        { stargazers: { totalCount: 22 }, primaryLanguage: { name: "Python", color: "#3572A5" } },
        { stargazers: { totalCount: 8 }, primaryLanguage: { name: "Java", color: "#b07219" } },
        { stargazers: { totalCount: 30 }, primaryLanguage: { name: "JavaScript", color: "#f1e05a" } },
        { stargazers: { totalCount: 5 }, primaryLanguage: { name: "C++", color: "#f34b7d" } },
        { stargazers: { totalCount: 2 }, primaryLanguage: { name: "HTML", color: "#e34c26" } },
      ]
    },
    pullRequests: { totalCount: 56 },
    issues: { totalCount: 24 },
    contributionsCollection: {
      totalCommitContributions: 420,
      totalPullRequestContributions: 45,
      totalIssueContributions: 12,
      totalRepositoryContributions: 10,
      contributionCalendar: {
        totalContributions: 650,
        weeks: Array.from({ length: 52 }).map((_, w) => ({
          contributionDays: Array.from({ length: 7 }).map((_, d) => {
            const date = new Date(Date.now() - (52 * 7 - (w * 7 + d)) * 24 * 60 * 60 * 1000);
            return {
              date: date.toISOString().split('T')[0],
              contributionCount: Math.random() > 0.5 ? Math.floor(Math.random() * 15) : 0,
              color: "#39d353"
            };
          })
        }))
      }
    }
  }
});

// The single query
const query = `
{
  user(login: "${USERNAME}") {
    name
    followers { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes {
        stargazers { totalCount }
        primaryLanguage { name color }
      }
    }
    pullRequests(states: [OPEN, CLOSED, MERGED]) { totalCount }
    issues(states: [OPEN, CLOSED]) { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount color }
        }
      }
    }
  }
}`;

// Card Shell Helper (Terminal Aesthetic)
const terminalShell = (width, height, body) => `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: ${theme.bg}; }
    .border { stroke: ${theme.border}; stroke-width: 1; }
    .text-main { font-family: ${theme.fontMono}; font-size: 13px; fill: ${theme.textMain}; }
    .text-sub { font-family: ${theme.fontMono}; font-size: 12px; fill: ${theme.textSub}; }
    .text-dim { font-family: ${theme.fontMono}; font-size: 11px; fill: ${theme.textDim}; }
    .text-bold { font-weight: 700; }
    .text-sans { font-family: ${theme.fontSans}; font-size: 11px; fill: ${theme.textSub}; text-transform: uppercase; letter-spacing: 1px; }
    .accent-green { fill: ${theme.accentGreen}; }
    .accent-cyan { fill: ${theme.accentCyan}; }
    .accent-amber { fill: ${theme.accentAmber}; }
    .accent-pink { fill: ${theme.accentPink}; }
  </style>
  <!-- Background -->
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="0" class="bg border"/>
  
  <!-- Terminal Header line -->
  <rect x="0" y="0" width="${width}" height="24" fill="${theme.border}" opacity="0.3"/>
  <circle cx="12" cy="12" r="3.5" fill="#ef4444" opacity="0.8"/>
  <circle cx="24" cy="12" r="3.5" fill="#f59e0b" opacity="0.8"/>
  <circle cx="36" cy="12" r="3.5" fill="#10b981" opacity="0.8"/>
  <text x="${width/2}" y="15.5" class="text-sans" text-anchor="middle" fill="${theme.textDim}">~/dashboard</text>

  <!-- Body -->
  <g transform="translate(0, 24)">
    ${body}
  </g>
</svg>`.trim();

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

const generateBlocks = (percentage, totalBlocks = 15) => {
  const filled = Math.round((percentage / 100) * totalBlocks);
  const empty = totalBlocks - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
};

// Main Execution
async function run() {
  console.log(`Fetching stats for @${USERNAME}...`);
  const data = await graphql(query);
  const user = data.user;

  // Derived Stats
  const totalStars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazers.totalCount, 0);
  const totalRepos = user.repositories.totalCount;
  const followers = user.followers.totalCount;
  const totalCommits = user.contributionsCollection.totalCommitContributions;
  const totalPRs = user.contributionsCollection.totalPullRequestContributions;
  const totalIssues = user.contributionsCollection.totalIssueContributions;
  const totalContribs = user.contributionsCollection.contributionCalendar.totalContributions;

  // Streaks
  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let longestStreak = 0, runningStreak = 0, currentStreak = 0;
  for (const d of days) {
    if (d.contributionCount > 0) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }
  
  // Calculate current streak (counting from the end)
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      currentStreak += 1;
    } else if (i < days.length - 1) { // Allow today to be 0 without breaking yesterday's streak yet
      break;
    }
  }

  // Languages
  const langCounts = {};
  for (const r of user.repositories.nodes) {
    if (!r.primaryLanguage) continue;
    const { name, color } = r.primaryLanguage;
    langCounts[name] = langCounts[name] || { count: 0, color: color || "#8b949e" };
    langCounts[name].count += 1;
  }
  const topLangs = Object.entries(langCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const langTotal = topLangs.reduce((s, [, v]) => s + v.count, 0) || 1;
  const primaryLang = topLangs.length > 0 ? topLangs[0][0] : "None";
  const activeProjects = user.repositories.nodes.filter(r => r.stargazers.totalCount > 0).length; // rough proxy
  const topRepo = user.repositories.nodes.length > 0 ? user.repositories.nodes[0] : null;

  /* ------------------------------------------------------------------ */
  /*  1. Overview SVG                                                    */
  /* ------------------------------------------------------------------ */
  const overviewBody = `
    <text x="24" y="32" class="text-main text-bold" font-size="20" letter-spacing="2">${USERNAME.toUpperCase()}</text>
    <text x="24" y="44" class="text-dim">────────────────────────────────────────────────</text>
    
    <text x="24" y="70" class="text-main">Status      <tspan class="accent-green">● ACTIVE DEVELOPER</tspan></text>
    <text x="24" y="90" class="text-main">Repos       <tspan class="text-sub">${fmt(totalRepos)}</tspan></text>
    <text x="24" y="110" class="text-main">Contribs    <tspan class="text-sub">${fmt(totalContribs)}</tspan></text>
    <text x="24" y="130" class="text-main">Cur Streak  <tspan class="accent-cyan">${currentStreak} days</tspan></text>
    
    <text x="24" y="160" class="text-sub">_></text><rect x="42" y="150" width="8" height="12" class="accent-green">
      <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
    </rect>
  `;
  const overviewSvg = terminalShell(400, 200, overviewBody);

  /* ------------------------------------------------------------------ */
  /*  2. Streak SVG                                                      */
  /* ------------------------------------------------------------------ */
  const streakBody = `
    <text x="20" y="30" class="text-sans">CURRENT STREAK</text>
    <text x="20" y="80" class="accent-cyan text-bold" font-size="54">${currentStreak}</text>
    <text x="90" y="80" class="text-sub" font-size="24">DAYS</text>
    
    <text x="20" y="110" class="text-dim">━━━━━━━━━━━━━━━━━━━━━━</text>
    
    <text x="20" y="140" class="text-sub">Longest Streak</text>
    <text x="160" y="140" class="accent-amber text-bold">${longestStreak} days</text>
    
    <text x="20" y="165" class="text-sub">Total Contribs</text>
    <text x="160" y="165" class="accent-green text-bold">${fmt(totalContribs)}</text>
  `;
  const streakSvg = terminalShell(260, 210, streakBody);

  /* ------------------------------------------------------------------ */
  /*  3. Languages SVG                                                   */
  /* ------------------------------------------------------------------ */
  const langRows = topLangs.map(([name, v], i) => {
    const pct = ((v.count / langTotal) * 100);
    const blocks = generateBlocks(pct, 15);
    const y = 45 + (i * 28);
    // Pad name to 10 chars for alignment
    const paddedName = name.padEnd(10, ' ').substring(0, 10);
    const pctStr = pct.toFixed(1).padStart(5, ' ');
    return `
      <text x="24" y="${y}" class="text-main">${paddedName}</text>
      <text x="100" y="${y}" fill="${v.color}" font-family="${theme.fontMono}" font-size="13">${blocks}</text>
      <text x="235" y="${y}" class="text-sub">${pctStr}%</text>
    `;
  }).join("\n");

  const langsBody = `
    <text x="24" y="30" class="text-sans">LANGUAGE DISTRIBUTION</text>
    <g transform="translate(0, 10)">
      ${langRows}
    </g>
  `;
  const langsSvg = terminalShell(310, 210, langsBody);

  /* ------------------------------------------------------------------ */
  /*  4. Activity SVG                                                    */
  /* ------------------------------------------------------------------ */
  // Create a simplified heatmap using terminal ASCII blocks for the last 6 months
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let activityBlocks = "";
  
  // Get last 24 weeks
  const recentWeeks = user.contributionsCollection.contributionCalendar.weeks.slice(-26);
  
  // Group by month
  let currentMonth = -1;
  let monthTextX = 40;
  let monthLabels = "";

  for(let w=0; w<recentWeeks.length; w++) {
    const week = recentWeeks[w];
    const x = 40 + (w * 14);
    
    if (week.contributionDays.length > 0) {
      const month = new Date(week.contributionDays[0].date).getMonth();
      if (month !== currentMonth) {
        monthLabels += `<text x="${x}" y="35" class="text-dim" font-size="10">${months[month]}</text>`;
        currentMonth = month;
      }
    }

    for(let d=0; d<week.contributionDays.length; d++) {
      const day = week.contributionDays[d];
      const y = 50 + (d * 14);
      const count = day.contributionCount;
      let fill = theme.bg;
      let symbol = "░";
      if (count > 0 && count <= 3) { fill = "#064e3b"; symbol = "▒"; }
      else if (count > 3 && count <= 6) { fill = "#047857"; symbol = "▓"; }
      else if (count > 6) { fill = "#10b981"; symbol = "█"; }
      
      activityBlocks += `<text x="${x}" y="${y}" fill="${fill}" font-family="${theme.fontMono}" font-size="12">${symbol}</text>`;
    }
  }

  const activityBody = `
    <text x="24" y="20" class="text-sans">CODING ACTIVITY TIMELINE</text>
    ${monthLabels}
    ${activityBlocks}
    
    <text x="40" y="165" class="text-sub">Intensity:</text>
    <text x="110" y="165" fill="${theme.bg}" font-family="${theme.fontMono}" font-size="12">░</text>
    <text x="125" y="165" fill="#064e3b" font-family="${theme.fontMono}" font-size="12">▒</text>
    <text x="140" y="165" fill="#047857" font-family="${theme.fontMono}" font-size="12">▓</text>
    <text x="155" y="165" fill="#10b981" font-family="${theme.fontMono}" font-size="12">█</text>
  `;
  const activitySvg = terminalShell(430, 200, activityBody);

  /* ------------------------------------------------------------------ */
  /*  5. Metrics SVG                                                     */
  /* ------------------------------------------------------------------ */
  const metricsBody = `
    <text x="24" y="30" class="text-sans">DEVELOPER METRICS</text>
    
    <text x="24" y="65" class="text-main">><tspan x="40" class="text-sub">REPOSITORIES</tspan></text>
    <text x="200" y="65" class="accent-cyan text-bold">${totalRepos}</text>
    
    <text x="24" y="90" class="text-main">><tspan x="40" class="text-sub">PULL REQUESTS</tspan></text>
    <text x="200" y="90" class="accent-green text-bold">${totalPRs}</text>
    
    <text x="24" y="115" class="text-main">><tspan x="40" class="text-sub">ISSUES</tspan></text>
    <text x="200" y="115" class="accent-pink text-bold">${totalIssues}</text>
    
    <text x="24" y="140" class="text-main">><tspan x="40" class="text-sub">STARS EARNED</tspan></text>
    <text x="200" y="140" class="accent-amber text-bold">${totalStars}</text>
    
    <text x="24" y="165" class="text-main">><tspan x="40" class="text-sub">FOLLOWERS</tspan></text>
    <text x="200" y="165" class="text-main text-bold">${followers}</text>
  `;
  const metricsSvg = terminalShell(260, 200, metricsBody);

  /* ------------------------------------------------------------------ */
  /*  6. Profile SVG                                                     */
  /* ------------------------------------------------------------------ */
  const profileBody = `
    <text x="24" y="30" class="text-sans">CODING PROFILE</text>
    
    <text x="24" y="65" class="text-dim">[PRIMARY LANGUAGES]</text>
    <text x="24" y="85" class="accent-green">${topLangs.map(l => l[0]).join(' • ') || 'N/A'}</text>
    
    <text x="24" y="120" class="text-dim">[ACTIVE PROJECTS]</text>
    <text x="24" y="140" class="text-main">${activeProjects}</text>
    
    <text x="24" y="175" class="text-dim">[TOP REPOSITORY]</text>
    <text x="24" y="195" class="accent-cyan">${topRepo ? topRepo.stargazers.totalCount + '★ ' + 'repo' : 'N/A'}</text>
  `;
  const profileSvg = terminalShell(320, 240, profileBody);


  // Write Files
  if (!existsSync("assets/svg")) {
    mkdirSync("assets/svg", { recursive: true });
  }

  writeFileSync("assets/svg/overview.svg", overviewSvg);
  console.log("  ✓ overview.svg");
  
  writeFileSync("assets/svg/streak.svg", streakSvg);
  console.log("  ✓ streak.svg");
  
  writeFileSync("assets/svg/languages.svg", langsSvg);
  console.log("  ✓ languages.svg");
  
  writeFileSync("assets/svg/activity.svg", activitySvg);
  console.log("  ✓ activity.svg");
  
  writeFileSync("assets/svg/metrics.svg", metricsSvg);
  console.log("  ✓ metrics.svg");
  
  writeFileSync("assets/svg/profile.svg", profileSvg);
  console.log("  ✓ profile.svg");

  console.log("\nAll Terminal Dashboard SVGs written successfully.");
}

run().catch(console.error);
