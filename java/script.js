
const footballLeagues = [
  { name: "Premier League", country: "Angli", code: "eng.1", icon: "🏴" },
  { name: "La Liga", country: "Spanjë", code: "esp.1", icon: "🇪🇸" },
  { name: "Serie A", country: "Itali", code: "ita.1", icon: "🇮🇹" },
  { name: "Bundesliga", country: "Gjermani", code: "ger.1", icon: "🇩🇪" },
  { name: "Ligue 1", country: "Francë", code: "fra.1", icon: "🇫🇷" },
  { name: "Eredivisie", country: "Holandë", code: "ned.1", icon: "🇳🇱" },
  { name: "Primeira Liga", country: "Portugali", code: "por.1", icon: "🇵🇹" },
  { name: "MLS", country: "SHBA", code: "usa.1", icon: "🇺🇸" },
  { name: "Saudi Pro League", country: "Arabi Saudite", code: "ksa.1", icon: "🇸🇦" },
  { name: "Champions League", country: "Evropë", code: "uefa.champions", icon: "🏆" },
  { name: "Europa League", country: "Evropë", code: "uefa.europa", icon: "🌍" }
];

const basketballLeagues = [
  { name: "NBA", country: "SHBA", code: "nba", icon: "🏀" },
  { name: "WNBA", country: "SHBA", code: "wnba", icon: "🏀" },
  { name: "NCAA Men", country: "SHBA", code: "mens-college-basketball", icon: "🎓" },
  { name: "NCAA Women", country: "SHBA", code: "womens-college-basketball", icon: "🎓" },
  { name: "EuroLeague", country: "Evropë", code: "euroleague", icon: "🇪🇺" }
];

const allLeagues = [
  ...footballLeagues.map(league => ({ ...league, sport: "football" })),
  ...basketballLeagues.map(league => ({ ...league, sport: "basketball" }))
];

const state = {
  matches: [],
  selectedLeague: "all",
  selectedSport: "all",
  selectedStatus: "all",
  search: "",
  loading: false,
  favorites: readStorage("courtscore-favorites", []),
  posts: readStorage("courtscore-posts", []),
  likedPosts: readStorage("courtscore-liked-posts", [])
};

const page = document.body.dataset.page || "home";
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
  return true;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("sq-XK", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("sq-XK", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function setToday() {
  const element = $("#todayDate");
  if (element) {
    element.textContent = "📅 " + new Intl.DateTimeFormat("sq-XK", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(new Date());
  }
}

function getLeague(sport, code) {
  return allLeagues.find(item => item.sport === sport && item.code === code);
}

function getStatus(event) {
  const type = event.statusType || "";
  if (type === "in") return "live";
  if (type === "post") return "finished";
  return "scheduled";
}

function getStatusLabel(match) {
  if (match.status === "live") return match.clock || "LIVE";
  if (match.status === "finished") return "Përfunduar";
  return match.date ? formatTime(new Date(match.date)) : "Së shpejti";
}

function getScore(event) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find(team => team.homeAway === "home") || competitors[0];
  const away = competitors.find(team => team.homeAway === "away") || competitors[1];

  if (!home || !away) return null;

  const date = event.date ? new Date(event.date) : null;
  const sport = event.sport || "football";
  const league = event.league || "Ligë sportive";
  const statusType = event.status?.type?.state || "pre";

  return {
    id: `${sport}-${event.id}`,
    sport,
    league,
    leagueCode: event.leagueCode || "",
    home: home.team?.displayName || home.team?.name || "Ekipi vendas",
    away: away.team?.displayName || away.team?.name || "Ekipi mysafir",
    homeLogo: home.team?.logo || "",
    awayLogo: away.team?.logo || "",
    homeScore: home.score ?? "",
    awayScore: away.score ?? "",
    date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "",
    statusType,
    status: statusType === "in" ? "live" : statusType === "post" ? "finished" : "scheduled",
    clock: event.status?.type?.shortDetail || event.status?.displayClock || "",
    period: event.status?.period || 0
  };
}

function getEndpoint(league) {
  if (league.sport === "football") {
    return `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.code}/scoreboard`;
  }
  return `https://site.api.espn.com/apis/site/v2/sports/basketball/${league.code}/scoreboard`;
}

async function fetchLeague(league) {
  const response = await fetch(getEndpoint(league));
  if (!response.ok) throw new Error("Nuk u morën të dhënat");
  const data = await response.json();

  return (data.events || []).map(event => ({
    ...event,
    sport: league.sport,
    league: league.name,
    leagueCode: league.code
  })).map(getScore).filter(Boolean);
}

async function loadMatches() {
  if (state.loading) return;
  state.loading = true;
  updateRefreshButtons(true);

  const leagues = page === "football"
    ? footballLeagues.map(item => ({ ...item, sport: "football" }))
    : page === "basketball"
      ? basketballLeagues.map(item => ({ ...item, sport: "basketball" }))
      : allLeagues;

  const results = await Promise.allSettled(leagues.map(fetchLeague));
  const matches = results
    .filter(result => result.status === "fulfilled")
    .flatMap(result => result.value);

  const unique = new Map();
  matches.forEach(match => unique.set(match.id, match));

  state.matches = [...unique.values()].sort((a, b) => {
    const priority = { live: 0, scheduled: 1, finished: 2 };
    const statusDifference = priority[a.status] - priority[b.status];
    if (statusDifference !== 0) return statusDifference;

    if (a.status === "finished") {
      return new Date(b.date) - new Date(a.date);
    }

    return new Date(a.date) - new Date(b.date);
  });

  state.loading = false;
  updateRefreshButtons(false);
  renderMatches();

  const failed = results.filter(result => result.status === "rejected").length;
  const container = $("#pageMatches");

  if (container && state.matches.length === 0) {
    container.innerHTML = `
      <div class="error-state">
        <strong>Nuk u morën rezultatet.</strong>
        <p>Kontrollo internetin ose provo përsëri. Disa liga mund të mos ofrohen nga burimi i të dhënave.</p>
        <button class="primary-btn" data-retry="true">Provo përsëri</button>
      </div>`;
  } else if (container && failed > 0) {
    const notice = document.createElement("p");
    notice.className = "form-message";
    notice.textContent = `Disa liga nuk mundën të ngarkoheshin (${failed}). Rezultatet e disponueshme shfaqen më poshtë.`;
    container.prepend(notice);
  }
}

function updateRefreshButtons(loading) {
  ["#refreshButton", "#refreshButtonSecondary"].forEach(selector => {
    const button = $(selector);
    if (button) {
      button.disabled = loading;
      button.style.opacity = loading ? ".55" : "1";
      button.textContent = loading ? "…" : "↻" + (selector === "#refreshButtonSecondary" ? " Rifresko" : "");
    }
  });
}

function getFilteredMatches() {
  let matches = [...state.matches];

  if (page === "football") {
    matches = matches.filter(match => match.sport === "football");
  } else if (page === "basketball") {
    matches = matches.filter(match => match.sport === "basketball");
  }

  if (state.selectedSport !== "all") {
    matches = matches.filter(match => match.sport === state.selectedSport);
  }

  if (state.selectedLeague !== "all") {
    matches = matches.filter(match => match.leagueCode === state.selectedLeague);
  }

  if (state.selectedStatus === "favorites") {
    matches = matches.filter(match => state.favorites.includes(match.id));
  } else if (state.selectedStatus !== "all") {
    matches = matches.filter(match => match.status === state.selectedStatus);
  }

  if (state.search.trim()) {
    const query = state.search.trim().toLocaleLowerCase();
    matches = matches.filter(match =>
      `${match.home} ${match.away} ${match.league}`.toLocaleLowerCase().includes(query)
    );
  }

  return matches;
}

function logoHTML(url, fallback) {
  if (!url) return `<span class="team-logo">${fallback}</span>`;
  return `<img class="team-logo" src="${escapeHTML(url)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;team-logo&quot;>🏅</span>'">`;
}

function matchHTML(match) {
  const favorite = state.favorites.includes(match.id);
  const status = match.status;
  const homeScore = match.homeScore;
  const awayScore = match.awayScore;
  const upcoming = status === "scheduled" && homeScore === "" && awayScore === "";
  const score = upcoming
    ? `<div class="score upcoming">${match.date ? formatTime(new Date(match.date)) : "VS"}</div>`
    : `<div class="score"><span>${escapeHTML(homeScore)}</span><span>:</span><span>${escapeHTML(awayScore)}</span></div>`;

  return `
    <article class="match-card" data-match-id="${escapeHTML(match.id)}">
      <div class="match-meta">
        <span class="match-league">${match.sport === "football" ? "⚽" : "🏀"} ${escapeHTML(match.league)}${match.date ? ` · ${formatDate(new Date(match.date))}` : ""}</span>
        <span class="match-status ${status}">${escapeHTML(getStatusLabel(match))}</span>
      </div>
      <div class="match-body">
        <div class="team">
          ${logoHTML(match.homeLogo, match.sport === "football" ? "⚽" : "🏀")}
          <span class="team-name">${escapeHTML(match.home)}</span>
        </div>
        ${score}
        <div class="team away">
          <span class="team-name">${escapeHTML(match.away)}</span>
          ${logoHTML(match.awayLogo, match.sport === "football" ? "⚽" : "🏀")}
        </div>
        <button class="favorite-btn ${favorite ? "is-favorite" : ""}" data-favorite="${escapeHTML(match.id)}" aria-label="${favorite ? "Hiq nga favoritet" : "Shto te favoritet"}">${favorite ? "★" : "☆"}</button>
      </div>
    </article>`;
}

function renderMatches() {
  const matches = getFilteredMatches();
  const pageContainer = $("#pageMatches");
  const homeContainer = $("#homeMatches");

  if (pageContainer) {
    pageContainer.innerHTML = matches.length
      ? matches.map(matchHTML).join("")
      : `<div class="empty-state">Nuk u gjet asnjë ndeshje për filtrat e zgjedhur.</div>`;
  }

  if (homeContainer) {
    const homeMatches = [...state.matches]
      .sort((a, b) => {
        const priority = { live: 0, scheduled: 1, finished: 2 };
        return priority[a.status] - priority[b.status];
      })
      .slice(0, 8);

    homeContainer.innerHTML = homeMatches.length
      ? homeMatches.map(matchHTML).join("")
      : `<div class="empty-state">Nuk ka ndeshje të disponueshme tani. Provo të rifreskosh rezultatet.</div>`;
  }

  const count = $("#matchCount");
  if (count) count.textContent = `${state.matches.length} ndeshje`;

  const title = $("#resultsTitle");
  if (title) {
    title.textContent = `${matches.length} ndeshje`;
  }
}

function renderLeagueFilters() {
  const container = $("#leagueFilters");
  if (!container) return;

  const leagues = page === "football"
    ? footballLeagues.map(item => ({ ...item, sport: "football" }))
    : page === "basketball"
      ? basketballLeagues.map(item => ({ ...item, sport: "basketball" }))
      : allLeagues;

  container.innerHTML = `
    <button class="league-chip ${state.selectedLeague === "all" ? "active" : ""}" data-league="all">Të gjitha ligat</button>
    ${leagues.map(league => `
      <button class="league-chip ${state.selectedLeague === league.code ? "active" : ""}" data-league="${escapeHTML(league.code)}">
        ${league.icon} ${escapeHTML(league.name)}
      </button>`).join("")}`;
}

function updateActiveNavigation() {
  $$(".nav-item").forEach(item => {
    const href = item.getAttribute("href");
    const active = href === `${page === "home" ? "index" : page}.html`;
    item.classList.toggle("active", active);
  });
}

function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(item => item !== id);
  } else {
    state.favorites.push(id);
  }

  saveStorage("courtscore-favorites", state.favorites);
  renderMatches();
}

function renderPosts() {
  const container = $("#communityPosts");
  if (!container) return;

  const posts = [...state.posts].sort((a, b) => b.createdAt - a.createdAt);

  if (!posts.length) {
    container.innerHTML = `<div class="empty-state">Ende nuk ka postime. Bëhu i pari që nis një diskutim!</div>`;
    return;
  }

  container.innerHTML = posts.map(post => {
    const liked = state.likedPosts.includes(post.id);
    const date = new Date(post.createdAt);

    return `
      <article class="post-card">
        <div class="post-header">
          <div class="avatar">${escapeHTML((post.name || "?").trim().charAt(0).toUpperCase())}</div>
          <div class="post-author">
            <strong>${escapeHTML(post.name)}</strong>
            <small>${post.sport === "Basketboll" ? "🏀" : post.sport === "Futboll" ? "⚽" : "🏆"} ${escapeHTML(post.sport)}</small>
          </div>
          <span class="post-time">${escapeHTML(formatDate(date))} ${escapeHTML(formatTime(date))}</span>
        </div>
        <p class="post-text">${escapeHTML(post.message)}</p>
        <div class="post-actions">
          <button class="like-btn ${liked ? "liked" : ""}" data-like="${escapeHTML(post.id)}">${liked ? "♥" : "♡"} Pëlqe · ${post.likes || 0}</button>
          <button class="delete-post" data-delete="${escapeHTML(post.id)}">Fshi postimin</button>
        </div>
      </article>`;
  }).join("");
}

function addPost(event) {
  event.preventDefault();

  const name = $("#postName")?.value.trim();
  const sport = $("#postSport")?.value;
  const message = $("#postText")?.value.trim();
  const feedback = $("#formMessage");

  if (!name || !message) {
    if (feedback) feedback.textContent = "Plotëso emrin dhe mesazhin.";
    return;
  }

  state.posts.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 35),
    sport: sport || "Tjetër",
    message: message.slice(0, 600),
    likes: 0,
    createdAt: Date.now()
  });

  saveStorage("courtscore-posts", state.posts);
  $("#postForm").reset();

  if (feedback) feedback.textContent = "Postimi u ruajt në këtë shfletues.";
  renderPosts();
}

function toggleLike(id) {
  const post = state.posts.find(item => item.id === id);
  if (!post) return;

  if (state.likedPosts.includes(id)) {
    state.likedPosts = state.likedPosts.filter(item => item !== id);
    post.likes = Math.max(0, (post.likes || 0) - 1);
  } else {
    state.likedPosts.push(id);
    post.likes = (post.likes || 0) + 1;
  }

  saveStorage("courtscore-posts", state.posts);
  saveStorage("courtscore-liked-posts", state.likedPosts);
  renderPosts();
}

function deletePost(id) {
  const post = state.posts.find(item => item.id === id);
  if (!post) return;

  if (!confirm("A dëshiron ta fshish këtë postim nga ky shfletues?")) return;

  state.posts = state.posts.filter(item => item.id !== id);
  state.likedPosts = state.likedPosts.filter(item => item !== id);
  saveStorage("courtscore-posts", state.posts);
  saveStorage("courtscore-liked-posts", state.likedPosts);
  renderPosts();
}

function initializeTheme() {
  let theme = "dark";

  try {
    theme = localStorage.getItem("courtscore-theme") || "dark";
  } catch {}

  document.body.classList.toggle("light-theme", theme === "light");

  const button = $("#themeButton");
  if (button) {
    button.textContent = theme === "light" ? "☾" : "☼";
    button.addEventListener("click", () => {
      const light = document.body.classList.toggle("light-theme");
      try {
        localStorage.setItem("courtscore-theme", light ? "light" : "dark");
      } catch {}
      button.textContent = light ? "☾" : "☼";
    });
  }
}

function initializeSearch() {
  const input = $("#searchInput");
  if (!input) return;

  input.addEventListener("input", event => {
    state.search = event.target.value;
    renderMatches();
  });
}

function initializeFilters() {
  document.addEventListener("click", event => {
    const leagueButton = event.target.closest("[data-league]");
    const statusButton = event.target.closest("[data-status]");
    const sportButton = event.target.closest("[data-sport]");
    const favoriteButton = event.target.closest("[data-favorite]");
    const retryButton = event.target.closest("[data-retry]");
    const likeButton = event.target.closest("[data-like]");
    const deleteButton = event.target.closest("[data-delete]");

    if (leagueButton) {
      state.selectedLeague = leagueButton.dataset.league;
      renderLeagueFilters();
      renderMatches();
    }

    if (statusButton) {
      state.selectedStatus = statusButton.dataset.status;
      $$("[data-status]").forEach(button => {
        button.classList.toggle("active", button === statusButton);
      });
      renderMatches();
    }

    if (sportButton) {
      state.selectedSport = sportButton.dataset.sport;
      $$("[data-sport]").forEach(button => {
        button.classList.toggle("active", button === sportButton);
      });
      renderMatches();
    }

    if (favoriteButton) toggleFavorite(favoriteButton.dataset.favorite);
    if (retryButton) loadMatches();
    if (likeButton) toggleLike(likeButton.dataset.like);
    if (deleteButton) deletePost(deleteButton.dataset.delete);
  });
}

function initializeCommunity() {
  const form = $("#postForm");
  if (form) form.addEventListener("submit", addPost);
  renderPosts();
}

function initializeRefresh() {
  ["#refreshButton", "#refreshButtonSecondary"].forEach(selector => {
    const button = $(selector);
    if (button) button.addEventListener("click", loadMatches);
  });
}

function initializePage() {
  setToday();
  updateActiveNavigation();
  initializeTheme();
  initializeSearch();
  initializeFilters();
  initializeRefresh();
  renderLeagueFilters();
  initializeCommunity();

  if (["home", "football", "basketball", "matches"].includes(page)) {
    loadMatches();
  }
}

document.addEventListener("DOMContentLoaded", initializePage);
