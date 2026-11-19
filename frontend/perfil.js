"use strict";

/* ============================================================
StudioMusic.AI
perfil.js

Compatibilidade:

- perfil.html
- perfil.css
- FastAPI
- JWT
- /api/health
- /auth/me

IMPORTANTE:
As rotas de atualização do perfil, assinatura e comunidade
precisam de ser confirmadas no main.py antes da integração.
============================================================ */

/* ============================================================

1. CONFIGURAÇÃO
   ============================================================ */

const PROFILE_API = "http://127.0.0.1:8000";

const PROFILE_ENDPOINTS = {
health: "/api/health",
me: "/auth/me",
stats: "/auth/me/stats",
communityStats: "/api/community/me/stats",
communitySongs: "/api/community/me/songs",
subscription: "/api/subscriptions/me"

/*
 * Não acrescentar aqui rotas de atualização, assinatura
 * ou comunidade sem confirmar que existem no main.py.
 */

};

/* ============================================================
2. ELEMENTOS HTML
============================================================ */

const profileElements = {

// Menu lateral
sidebar: document.getElementById("sidebar"),
sidebarOverlay: document.getElementById("sidebarOverlay"),
sidebarClose: document.getElementById("sidebarClose"),
menuToggle: document.getElementById("menuToggle"),

// Estado da API
apiStatus: document.getElementById("apiStatus"),
apiStatusDot: document.getElementById("apiStatusDot"),
apiStatusText: document.getElementById("apiStatusText"),

// Menu do utilizador
userMenuButton: document.getElementById("userMenuButton"),
userDropdown: document.getElementById("userDropdown"),
topbarUserName: document.getElementById("topbarUserName"),

// Perfil
profileAvatar: document.getElementById("profileAvatar"),
profileDisplayName: document.getElementById("profileDisplayName"),
profileDisplayEmail: document.getElementById("profileDisplayEmail"),
profileRole: document.getElementById("profileRole"),

// Estatísticas
profileTotalSongs: document.getElementById("profileTotalSongs"),
profilePublicSongs: document.getElementById("profilePublicSongs"),
profileFavorites: document.getElementById("profileFavorites"),

// Plano
subscriptionPlanName: document.getElementById("subscriptionPlanName"),
subscriptionDescription: document.getElementById("subscriptionDescription"),
subscriptionStatus: document.getElementById("subscriptionStatus"),
subscriptionDuration: document.getElementById("subscriptionDuration"),
subscriptionSongsUsed: document.getElementById("subscriptionSongsUsed"),
subscriptionStartDate: document.getElementById("subscriptionStartDate"),
subscriptionEndDate: document.getElementById("subscriptionEndDate"),
subscriptionPaymentStatus: document.getElementById("subscriptionPaymentStatus"),
subscriptionRenewalDate: document.getElementById("subscriptionRenewalDate"),
subscriptionUsageText: document.getElementById("subscriptionUsageText"),
subscriptionProgressBar: document.getElementById("subscriptionProgressBar"),
subscriptionNotice: document.getElementById("subscriptionNotice"),
subscriptionDetailsButton: document.getElementById("subscriptionDetailsButton"),

// Comunidade
communityPublishedCount: document.getElementById("communityPublishedCount"),
communityViewsCount: document.getElementById("communityViewsCount"),

communityLikesCount: document.getElementById("communityLikesCount"),
communityFollowersCount: document.getElementById("communityFollowersCount"),
communityFollowingCount: document.getElementById("communityFollowingCount"),

communityEmptyState: document.getElementById("communityEmptyState"),
communityEmptyMessage: document.getElementById("communityEmptyMessage"),
communityPublications: document.getElementById("communityPublications"),

// Formulário
profileForm: document.getElementById("profileForm"),
profileName: document.getElementById("profileName"),
profileEmail: document.getElementById("profileEmail"),
profilePhone: document.getElementById("profilePhone"),
profileBio: document.getElementById("profileBio"),
editProfileButton: document.getElementById("editProfileButton"),
saveProfileButton: document.getElementById("saveProfileButton"),
cancelProfileEdit: document.getElementById("cancelProfileEdit"),
profileFormMessage: document.getElementById("profileFormMessage"),

// Segurança e sessão
changePasswordButton: document.getElementById("changePasswordButton"),
profileLogout: document.getElementById("profileLogout"),
profileLogoutBottom: document.getElementById("profileLogoutBottom"),
changeAvatarButton: document.getElementById("changeAvatarButton")

};

/* ============================================================
3. ESTADO DA APLICAÇÃO
============================================================ */

let currentProfile = null;
let originalProfileForm = null;
let profileEditMode = false;

/* ============================================================
4. FUNÇÕES AUXILIARES
============================================================ */

function setText(element, value, fallback = "—") {

if (!element) {
    return;
}

if (value === null || value === undefined || value === "") {
    element.textContent = fallback;
    return;
}

element.textContent = String(value);

}

function normalizeString(value) {

if (typeof value !== "string") {
    return "";
}

return value.trim();

}

function formatNumber(value) {

const number = Number(value);

if (!Number.isFinite(number)) {
    return "0";
}

return new Intl.NumberFormat("pt-PT").format(number);

}

function formatDate(value) {

if (!value) {
    return "—";
}

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
    return String(value);
}

return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
}).format(date);

}

function formatDuration(seconds) {

const duration = Number(seconds);

if (!Number.isFinite(duration) || duration <= 0) {
    return "—";
}

if (duration < 60) {
    return `${duration} segundos`;
}

const minutes = Math.floor(duration / 60);
const remainingSeconds = duration % 60;

if (remainingSeconds === 0) {
    return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

return `${minutes} min ${remainingSeconds} s`;

}

function showMessage(message, type = "") {

const element = profileElements.profileFormMessage;

if (!element) {
    return;
}

element.textContent = message;
element.classList.remove("success", "error");

if (type === "success" || type === "error") {
    element.classList.add(type);
}

}

/* ============================================================
5. AUTENTICAÇÃO

O login pode guardar o JWT com nomes diferentes.
Este código procura nomes comuns sem assumir que todos
existem no teu projeto.
============================================================ */

const AUTH_TOKEN_KEYS = [
"access_token",
"accessToken",
"token",
"auth_token",
"authToken",
"jwt",
"jwt_token"
];

function getStoredToken() {

for (const key of AUTH_TOKEN_KEYS) {

    const token = localStorage.getItem(key);

    if (token && token.trim()) {
        return token.trim();
    }
}

return null;

}

function getAuthHeaders() {

const headers = {
    "Accept": "application/json"
};

const token = getStoredToken();

if (token) {
    headers.Authorization = `Bearer ${token}`;
}

return headers;

}

function isAuthenticated() {

return Boolean(getStoredToken());

}

/* ============================================================
6. PEDIDOS À API
============================================================ */

async function apiRequest(path, options = {}) {

const url = `${PROFILE_API}${path}`;

const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
};

const config = {
    ...options,
    headers
};

let response;

try {

    response = await fetch(url, config);

} catch (error) {

    throw new Error(
        "Não foi possível ligar ao servidor. " +
        "Confirma se o backend está em execução."
    );
}

const contentType = response.headers.get("content-type") || "";

let data = null;

if (response.status !== 204) {

    if (contentType.includes("application/json")) {

        try {
            data = await response.json();
        } catch {
            data = null;
        }

    } else {

        try {
            data = await response.text();
        } catch {
            data = null;
        }
    }
}

if (!response.ok) {

    if (response.status === 401) {
        throw new Error(
            "A sessão expirou ou o token de autenticação é inválido."
        );
    }

    let detail = "";

    if (data && typeof data === "object") {
        detail = data.detail || data.message || "";
    } else if (typeof data === "string") {
        detail = data;
    }

    throw new Error(
        detail || `Erro do servidor: HTTP ${response.status}.`
    );
}

return data;

}

/* ============================================================
7. ESTADO DA API
============================================================ */

function setAPIStatus(status, message) {

const dot = profileElements.apiStatusDot;
const text = profileElements.apiStatusText;

if (dot) {

    dot.classList.remove(
        "online",
        "offline",
        "connected",
        "disconnected"
    );

    if (status === "online") {
        dot.classList.add("online");
    } else if (status === "offline") {
        dot.classList.add("offline");
    }
}

setText(text, message);

}

async function checkAPI() {

setAPIStatus("checking", "A verificar ligação...");

try {

    await apiRequest(PROFILE_ENDPOINTS.health, {
        method: "GET"
    });

    setAPIStatus("online", "Servidor ligado");

    return true;

} catch (error) {

    setAPIStatus("offline", "Servidor indisponível");

    console.error("Erro ao verificar a API:", error.message);

    return false;
}

}

/* ============================================================
8. MENU LATERAL
============================================================ */

function toggleSidebar() {

const sidebar = profileElements.sidebar;
const overlay = profileElements.sidebarOverlay;

if (!sidebar) {
    return;
}

sidebar.classList.toggle("open");
sidebar.classList.toggle("active");

if (overlay) {
    overlay.classList.toggle("active");
    overlay.style.display =
        sidebar.classList.contains("open") ||
        sidebar.classList.contains("active")
            ? "block"
            : "";
}

}

function closeSidebar() {

const sidebar = profileElements.sidebar;
const overlay = profileElements.sidebarOverlay;

if (sidebar) {
    sidebar.classList.remove("open", "active");
}

if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "";
}

}

/* ============================================================
9. MENU DO UTILIZADOR
============================================================ */

function toggleUserDropdown() {

const button = profileElements.userMenuButton;
const dropdown = profileElements.userDropdown;

if (!dropdown) {
    return;
}

const isOpen =
    dropdown.classList.contains("show") ||
    dropdown.classList.contains("open") ||
    dropdown.classList.contains("active");

dropdown.classList.remove("show", "open", "active");

if (!isOpen) {
    dropdown.classList.add("show");
}

if (button) {
    button.setAttribute("aria-expanded", String(!isOpen));
}

}

function closeUserDropdown() {

const button = profileElements.userMenuButton;
const dropdown = profileElements.userDropdown;

if (dropdown) {
    dropdown.classList.remove("show", "open", "active");
}

if (button) {
    button.setAttribute("aria-expanded", "false");
}

}

/* ============================================================
10. IDENTIFICAÇÃO DOS DADOS DO UTILIZADOR
============================================================ */

function extractUserObject(response) {

if (!response || typeof response !== "object") {
    return null;
}

/*
 * Compatibilidade com respostas que devolvem o utilizador
 * diretamente ou dentro de uma propriedade "user".
 */

if (response.user && typeof response.user === "object") {
    return response.user;
}

if (response.data && typeof response.data === "object") {

    if (response.data.user && typeof response.data.user === "object") {
        return response.data.user;
    }

    return response.data;
}

return response;

}

function getUserName(user) {

return (
    user.name ||
    user.username ||
    user.full_name ||
    user.display_name ||
    user.nome ||
    user.email ||
    "Utilizador"
);

}

function getUserEmail(user) {

return user.email || user.e_mail || "";

}

function getUserRole(user) {

if (user.is_admin === true || user.is_admin === 1) {
    return "Administrador";
}

return user.role || user.tipo || "Utilizador";

}

/* ============================================================
11. CARREGAR PERFIL
============================================================ */

async function loadProfile() {

if (!isAuthenticated()) {

    setText(
        profileElements.profileDisplayName,
        "Sessão não iniciada"
    );

    setText(
        profileElements.profileDisplayEmail,
        "Inicia sessão para consultar o teu perfil."
    );

    setText(
        profileElements.profileRole,
        "Visitante"
    );

    showMessage(
        "Não foi encontrado um token de autenticação. " +
        "Confirma a chave usada pelo teu login.",
        "error"
    );

    return;
}

try {

    const response = await apiRequest(PROFILE_ENDPOINTS.me, {
        method: "GET"
    });

    const user = extractUserObject(response);

    if (!user || typeof user !== "object") {
        throw new Error("O servidor não devolveu os dados do utilizador.");
    }

    currentProfile = user;

    renderProfile(user);

    /*
     * Só usamos as estatísticas se forem devolvidas
     * pelo endpoint existente. Não inventamos endpoints.
     */

    renderUserStatistics(user);

    await loadProfileStatistics();

    showSubscriptionUnavailable();
    await loadProfileCredits();

    // Carregar as publicações reais do utilizador.
    await loadProfileCommunity();
    
} catch (error) {

    console.error("Erro ao carregar perfil:", error.message);

    setText(
        profileElements.profileDisplayName,
        "Não foi possível carregar"
    );

    setText(
        profileElements.profileDisplayEmail,
        error.message
    );

    showMessage(error.message, "error");

    if (
        error.message.toLowerCase().includes("sessão expirou") ||
        error.message.toLowerCase().includes("token de autenticação")
    ) {
        setAPIStatus("offline", "Verifica a tua sessão");
    }
}

}

/* ============================================================
12. APRESENTAR DADOS DO PERFIL
============================================================ */

function renderProfile(user) {

const name = getUserName(user);
const email = getUserEmail(user);
const role = getUserRole(user);

setText(profileElements.profileDisplayName, name);
setText(profileElements.profileDisplayEmail, email, "E-mail não disponível");
setText(profileElements.profileRole, role);
setText(profileElements.topbarUserName, name);

if (profileElements.profileName) {
    profileElements.profileName.value = user.name || user.username || "";
}

if (profileElements.profileEmail) {
    profileElements.profileEmail.value = email;
}

if (profileElements.profilePhone) {
    profileElements.profilePhone.value = user.telefone || "";
}

if (profileElements.profileBio) {
    profileElements.profileBio.value = user.sobremim || "";
}

/*
 * Evita interpretar um URL fornecido pelo servidor como
 * HTML. A imagem só é inserida como elemento <img>.
 */

const avatar = profileElements.profileAvatar;
const avatarURL = user.foto || user.avatar_url || user.avatar || user.photo_url;

if (avatar && typeof avatarURL === "string" && avatarURL.trim()) {

    try {

        const parsedURL = new URL(avatarURL, PROFILE_API);

        if (
            parsedURL.protocol === "http:" ||
            parsedURL.protocol === "https:"
        ) {

            avatar.replaceChildren();

            const image = document.createElement("img");

            image.src = parsedURL.href;
            image.alt = "Fotografia do perfil";
            image.loading = "lazy";

            image.addEventListener("error", () => {

                avatar.replaceChildren();

                const icon = document.createElement("span");

                icon.className = "material-icons";
                icon.textContent = "account_circle";

                avatar.appendChild(icon);
            });

            avatar.appendChild(image);
        }

    } catch (error) {

        console.warn("O endereço da fotografia não é válido.");
    }
}

originalProfileForm = getProfileFormValues();

setProfileEditMode(false);

}

/* ============================================================
13. ESTATÍSTICAS DISPONÍVEIS NO PERFIL
============================================================ */

function renderUserStatistics(user) {
 
/*
 * Estes campos só são preenchidos quando os respetivos
 * dados já existem na resposta de /auth/me.
 *
 * Se o endpoint não devolver estatísticas, não afirmamos
 * que o utilizador tem zero músicas ou favoritos.
 */

const totalSongs =
    user.total_songs ??
    user.songs_count ??
    user.total_music;

const publicSongs =
    user.public_songs ??
    user.public_songs_count ??
    user.published_songs;

const favorites =
    user.favorites_count ??
    user.total_favorites ??
    user.favorite_count;

setText(
    profileElements.profileTotalSongs,
    totalSongs === undefined ? "—" : formatNumber(totalSongs)
);

setText(
    profileElements.profilePublicSongs,
    publicSongs === undefined ? "—" : formatNumber(publicSongs)
);

setText(
    profileElements.profileFavorites,
    favorites === undefined ? "—" : formatNumber(favorites)
);

}

/* ============================================================
   CARREGAR ESTATÍSTICAS REAIS DO UTILIZADOR
============================================================ */

async function loadProfileStatistics() {

    try {

        const stats = await apiRequest(
            PROFILE_ENDPOINTS.stats,
            {
                method: "GET"
            }
        );

        setText(
            profileElements.profileTotalSongs,
            formatNumber(stats.total_songs ?? 0)
        );

        setText(
            profileElements.profilePublicSongs,
            formatNumber(stats.public_songs ?? 0)
        );

        setText(
            profileElements.profileFavorites,
            formatNumber(stats.favorites_count ?? 0)
        );

    } catch (error) {

        console.error(
            "Erro ao carregar estatísticas:",
            error
        );

        setText(profileElements.profileTotalSongs, "—");
        setText(profileElements.profilePublicSongs, "—");
        setText(profileElements.profileFavorites, "—");

    }
}

/* ============================================================
14. PLANO E ASSINATURA
============================================================ */

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[char]));
}

function renderCreditSummary(summary) {
    const credits = summary && typeof summary === "object" ? summary : {};
    const lots = Array.isArray(credits.lots) ? credits.lots : [];
    const total = Number(credits.total_credits ?? 0);
    const activeLots = Number(credits.active_lots ?? lots.length);

    let panel = document.getElementById("profileCreditSummary");
    if (!panel) {
        panel = document.createElement("section");
        panel.id = "profileCreditSummary";
        panel.className = "profile-credit-summary";
        const anchor = profileElements.subscriptionNotice ||
            profileElements.subscriptionPlanName;
        const parent = anchor && anchor.parentElement;
        if (parent && parent.parentElement) {
            parent.parentElement.insertBefore(panel, parent.nextSibling);
        } else {
            document.body.appendChild(panel);
        }
    }

    const lotRows = lots.length ? lots.map((lot) => {
        const name = lot.plan_name || lot.plan_code || "Plano";
        const remaining = Number(lot.credits_remaining || 0);
        const limit = Number(lot.credits_total || 0);
        const expiry = lot.expires_at ? formatDate(lot.expires_at) : "Sem expiração";
        return `<div class="credit-lot-row"><span>${escapeHtml(String(name))}</span>` +
            `<strong>${formatNumber(remaining)} / ${formatNumber(limit)}</strong>` +
            `<small>Validade: ${escapeHtml(String(expiry))}</small></div>`;
    }).join("") : `<p class="credit-empty">Não existem lotes de créditos activos.</p>`;

    panel.innerHTML = `<h3>Créditos disponíveis</h3>` +
        `<div class="credit-total">${formatNumber(Number.isFinite(total) ? total : 0)}</div>` +
        `<p>${formatNumber(Number.isFinite(activeLots) ? activeLots : 0)} lote(s) activo(s)</p>` +
        `<div class="credit-lots">${lotRows}</div>`;
}

async function loadProfileCredits() {
    try {
        const response = await apiRequest(PROFILE_ENDPOINTS.subscription, { method: "GET" });
        const summary = response && response.credits ? response.credits : {
            total_credits: response && response.total_credits !== undefined ? response.total_credits : 0,
            active_lots: response && response.active_credit_lots !== undefined ? response.active_credit_lots : 0,
            lots: []
        };
        renderCreditSummary(summary);
    } catch (error) {
        console.error("Erro ao carregar créditos:", error.message);
        renderCreditSummary({ total_credits: 0, active_lots: 0, lots: [] });
    }
}

function showSubscriptionUnavailable() {

setText(
    profileElements.subscriptionPlanName,
    "Plano não verificado"
);

setText(
    profileElements.subscriptionDescription,
    "Aguardando ligação aos dados reais da assinatura."
);

setText(
    profileElements.subscriptionStatus,
    "Não verificado"
);

setText(profileElements.subscriptionDuration, "—");
setText(profileElements.subscriptionSongsUsed, "—");
setText(profileElements.subscriptionStartDate, "—");
setText(profileElements.subscriptionEndDate, "—");
setText(profileElements.subscriptionPaymentStatus, "—");
setText(profileElements.subscriptionRenewalDate, "—");

setText(
    profileElements.subscriptionUsageText,
    "Dados indisponíveis"
);

if (profileElements.subscriptionProgressBar) {
    profileElements.subscriptionProgressBar.style.width = "0%";
}

setText(
    profileElements.subscriptionNotice,
    "A assinatura ainda não está ligada a uma rota confirmada " +
    "do backend. Esta mensagem não significa que o pagamento " +
    "ou a assinatura estejam inativos."
);

}

/*

* Função preparada para apresentar os dados quando tivermos
* confirmado a estrutura da resposta da assinatura.
* 
* Exemplo de utilização interna:
* renderSubscription({
* plan_name: "Premium",
* status: "active",
* max_duration_seconds: 180,
* songs_used: 5,
* songs_limit: 20
* });
  */

function renderSubscription(data) {

if (!data || typeof data !== "object") {
    showSubscriptionUnavailable();
    return;
}

const planName =
    data.plan_name ||
    data.plan ||
    data.name;

const description =
    data.description ||
    data.plan_description;

const status =
    data.status ||
    data.subscription_status;

const maxDuration =
    data.max_duration_seconds ??
    data.max_duration;

const songsUsed =
    data.songs_used ??
    data.used_songs;

const songsLimit =
    data.songs_limit ??
    data.max_songs;

setText(
    profileElements.subscriptionPlanName,
    planName,
    "Plano não identificado"
);

setText(
    profileElements.subscriptionDescription,
    description,
    "Sem descrição disponível."
);

setText(
    profileElements.subscriptionStatus,
    status,
    "Não verificado"
);

setText(
    profileElements.subscriptionDuration,
    maxDuration === undefined
        ? "—"
        : formatDuration(maxDuration)
);

setText(
    profileElements.subscriptionSongsUsed,
    songsUsed === undefined
        ? "—"
        : songsLimit === undefined
            ? formatNumber(songsUsed)
            : `${formatNumber(songsUsed)} / ${formatNumber(songsLimit)}`
);

setText(
    profileElements.subscriptionStartDate,
    formatDate(data.start_date || data.started_at)
);

setText(
    profileElements.subscriptionEndDate,
    formatDate(data.end_date || data.expires_at)
);

setText(
    profileElements.subscriptionPaymentStatus,
    data.payment_status || "—"
);

setText(
    profileElements.subscriptionRenewalDate,
    formatDate(data.renewal_date)
);

setText(
    profileElements.subscriptionNotice,
    data.notice || "Informações da assinatura carregadas."
);

const statusElement = profileElements.subscriptionStatus;

if (statusElement) {

    statusElement.classList.remove(
        "active",
        "ativo",
        "expired",
        "expirado",
        "pending",
        "pendente"
    );

    const normalizedStatus = String(status || "").toLowerCase();

    if (["active", "ativo", "active_subscription"].includes(normalizedStatus)) {
        statusElement.classList.add("active");
    } else if (["expired", "expirado", "inactive", "inativo"].includes(normalizedStatus)) {
        statusElement.classList.add("expired");
    } else if (["pending", "pendente"].includes(normalizedStatus)) {
        statusElement.classList.add("pending");
    }
}

if (profileElements.subscriptionProgressBar) {

    let percentage = 0;

    if (
        Number.isFinite(Number(songsUsed)) &&
        Number.isFinite(Number(songsLimit)) &&
        Number(songsLimit) > 0
    ) {
        percentage = (Number(songsUsed) / Number(songsLimit)) * 100;
    }

    percentage = Math.max(0, Math.min(100, percentage));

    profileElements.subscriptionProgressBar.style.width =
        `${percentage}%`;
}

if (songsUsed !== undefined && songsLimit !== undefined) {

    setText(
        profileElements.subscriptionUsageText,
        `${formatNumber(songsUsed)} de ${formatNumber(songsLimit)} músicas`
    );
} else {

    setText(
        profileElements.subscriptionUsageText,
        "Limite não disponível"
    );
}

}

/* ============================================================
   COMUNIDADE — CARREGAR ESTATÍSTICAS E PUBLICAÇÕES REAIS
   Usa exclusivamente as rotas confirmadas no main.py.
============================================================ */

async function loadCommunityProfile() {
    return loadProfileCommunity();
}

async function loadProfileCommunity() {
    const user = currentProfile;

    if (!user || user.id == null) {
        showCommunityUnavailable();
        return;
    }

    try {
        const [statsResponse, songsResponse] = await Promise.all([
            apiRequest(PROFILE_ENDPOINTS.communityStats, { method: "GET" }),
            apiRequest(PROFILE_ENDPOINTS.communitySongs, { method: "GET" })
        ]);

        const stats = statsResponse && typeof statsResponse === "object"
            ? (statsResponse.stats && typeof statsResponse.stats === "object"
                ? statsResponse.stats
                : statsResponse)
            : {};

        const publications = Array.isArray(songsResponse)
            ? songsResponse
            : Array.isArray(songsResponse?.publications)
                ? songsResponse.publications
                : Array.isArray(songsResponse?.songs)
                    ? songsResponse.songs
                    : Array.isArray(songsResponse?.items)
                        ? songsResponse.items
                        : null;

        if (!publications) {
            throw new Error("A resposta da comunidade não contém a lista de publicações esperada.");
        }

        // A rota /api/community/me/songs já devolve apenas as publicações
        // do utilizador autenticado. Não filtrar por user_id, que pode não vir serializado.
        const normalizedPublications = publications.map(song => ({ ...song }));

        const viewsInPublications = normalizedPublications.every(song =>
            song.views_count !== undefined && song.views_count !== null &&
            Number.isFinite(Number(song.views_count))
        )
            ? normalizedPublications.reduce((sum, song) => sum + Math.max(0, Number(song.views_count) || 0), 0)
            : null;

        renderCommunity({
            publications: normalizedPublications,
            published_count: stats.published_count ?? songsResponse?.published_count ?? normalizedPublications.length,
            views_count: stats.views_count ?? stats.total_views ?? viewsInPublications,
            likes_count: stats.likes_received ?? stats.likes_count ?? null,
            followers_count: stats.followers_count ?? null,
            following_count: stats.following_count ?? null
        });

        console.info("Comunidade do perfil carregada:", {
            publicacoes: normalizedPublications.length,
            estatisticas: stats
        });
    } catch (error) {
        console.error("Erro ao carregar a comunidade do perfil:", error);
        showCommunityUnavailable();
        setText(
            profileElements.communityEmptyMessage,
            "Não foi possível carregar os dados da comunidade. Verifica se o backend está activo e se a sessão continua válida."
        );
    }
}


/* ============================================================
15. COMUNIDADE
============================================================ */

function showCommunityUnavailable() {

    setText(profileElements.communityPublishedCount, "—");
    setText(profileElements.communityViewsCount, "—");

    setText(profileElements.communityLikesCount, "—");
    setText(profileElements.communityFollowersCount, "—");
    setText(profileElements.communityFollowingCount, "—");

    setText(
        profileElements.communityEmptyMessage,
        "Não foi possível carregar os dados da comunidade."
    );

    if (profileElements.communityEmptyState) {
        profileElements.communityEmptyState.hidden = false;
    }

}
/* ============================================================
   COMUNIDADE — APRESENTAR PUBLICAÇÕES
   ============================================================ */

function renderCommunity(data) {

    if (!data || typeof data !== "object") {
        showCommunityUnavailable();
        return;
    }

    const publications = Array.isArray(data.publications)
        ? data.publications
        : Array.isArray(data.items)
            ? data.items
            : [];

    const publishedCount =
        data.published_count ?? publications.length;

    const viewsCount =
        data.views_count ?? data.total_views;

    setText(
        profileElements.communityPublishedCount,
        formatNumber(publishedCount)
    );

    setText(
        profileElements.communityViewsCount,
        viewsCount == null
            ? "—"
            : formatNumber(viewsCount)
    );

    setText(
        profileElements.communityLikesCount,
        data.likes_count == null ? "—" : formatNumber(data.likes_count)
    );
    setText(
        profileElements.communityFollowersCount,
        data.followers_count == null ? "—" : formatNumber(data.followers_count)
    );
    setText(
        profileElements.communityFollowingCount,
        data.following_count == null ? "—" : formatNumber(data.following_count)
    );

    const container =
        profileElements.communityPublications;

    const emptyState =
        profileElements.communityEmptyState;

    if (!container) {
        return;
    }

    // Remover apenas os cartões criados pelo JavaScript.
    container
        .querySelectorAll(
            "[data-community-generated='true']"
        )
        .forEach(card => card.remove());

    if (publications.length === 0) {

        if (emptyState) {
            emptyState.hidden = false;
        }

        setText(
            profileElements.communityEmptyMessage,
            "Ainda não publicaste músicas na comunidade."
        );

        return;
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    publications.forEach(publication => {

        const card = createCommunityPublicationCard(
            publication
        );

        container.appendChild(card);

    });
}
/* ============================================================
   COMUNIDADE — CRIAR CARTÃO DA MÚSICA
   ============================================================ */

function createCommunityPublicationCard(song) {

    const card = document.createElement("article");

    card.className = "community-publication-card";
    card.dataset.communityGenerated = "true";

    // ========================================
    // CAPA
    // ========================================

    const cover = document.createElement("div");
    cover.className = "community-publication-cover";

    const coverURL = song.cover_url;

    if (coverURL) {

        const image = document.createElement("img");

        image.src = new URL(
            coverURL,
            PROFILE_API
        ).href;

        image.alt = "Capa da música";

        image.loading = "lazy";

        image.onerror = () => {
            cover.replaceChildren();

            const icon = document.createElement("span");

            icon.className = "material-icons";
            icon.textContent = "music_note";

            cover.appendChild(icon);
        };

        cover.appendChild(image);

    } else {

        const icon = document.createElement("span");

        icon.className = "material-icons";
        icon.textContent = "music_note";

        cover.appendChild(icon);
    }

    // ========================================
    // CONTEÚDO
    // ========================================

    const body = document.createElement("div");

    body.className = "community-publication-body";

    const title = document.createElement("h3");

    title.textContent =
        song.title || "Música sem título";

    const description = document.createElement("p");

    description.className =
        "community-publication-description";

    description.textContent = String(
        song.prompt ||
        song.description ||
        "Sem descrição disponível."
    ).slice(0, 300);

    // ========================================
    // ESTATÍSTICAS
    // ========================================

    const meta = document.createElement("div");

    meta.className = "community-publication-meta";

    const likes = document.createElement("span");

    const likesIcon = document.createElement("span");

    likesIcon.className = "material-icons";
    likesIcon.textContent = "favorite";

    likes.appendChild(likesIcon);

    likes.appendChild(
        document.createTextNode(
            formatNumber(song.likes_count ?? 0)
        )
    );

    const date = document.createElement("span");

    const dateIcon = document.createElement("span");

    dateIcon.className = "material-icons";
    dateIcon.textContent = "calendar_today";

    date.appendChild(dateIcon);

    date.appendChild(
        document.createTextNode(
            formatDate(song.created_at)
        )
    );

    meta.appendChild(likes);
    meta.appendChild(date);

    // ========================================
    // REPRODUTOR
    // ========================================

    const audio = document.createElement("audio");

    audio.className = "community-publication-player";

    audio.controls = true;
    audio.preload = "none";

    const audioURL =
        song.audio_url;

    if (audioURL) {

        audio.src = new URL(
            audioURL,
            PROFILE_API
        ).href;

    } else {

        audio.hidden = true;
    }

    // ========================================
    // BOTÃO RETIRAR PUBLICAÇÃO
    // ========================================

    const actions = document.createElement("div");

    actions.className =
        "community-publication-actions";

    const unpublishButton =
        document.createElement("button");

    unpublishButton.type = "button";

    unpublishButton.className =
        "community-publication-button danger";

    const icon = document.createElement("span");

    icon.className = "material-icons";
    icon.textContent = "public_off";

    const label = document.createElement("span");

    label.textContent = "Retirar da comunidade";

    unpublishButton.appendChild(icon);
    unpublishButton.appendChild(label);

    unpublishButton.addEventListener(
        "click",
        () => unpublishCommunitySong(
            song.id,
            unpublishButton
        )
    );

    actions.appendChild(unpublishButton);

    // ========================================
    // MONTAR CARTÃO
    // ========================================

    body.appendChild(title);
    body.appendChild(description);
    body.appendChild(meta);
    body.appendChild(audio);
    body.appendChild(actions);

    card.appendChild(cover);
    card.appendChild(body);

    return card;
}

/* ============================================================
   COMUNIDADE — RETIRAR MÚSICA PUBLICADA
   ============================================================ */

async function unpublishCommunitySong(songId, button) {

    const id = Number(songId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        alert("Identificador da música inválido.");
        return;
    }

    const confirmed = window.confirm(
        "Tens a certeza de que pretendes retirar " +
        "esta música da comunidade?\n\n" +
        "A música continuará guardada na tua conta."
    );

    if (!confirmed) {
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {

        const response = await apiRequest(
            `/api/community/${id}/publish`,
            {
                method: "DELETE"
            }
        );

        if (response && response.success === false) {
            throw new Error(
                response.message ||
                "Não foi possível retirar a publicação."
            );
        }

        // Actualizar a lista e as estatísticas.
        await loadCommunityProfile();

        // Actualizar também as estatísticas gerais.
        await loadProfileStatistics();

        showMessage(
            "A música foi retirada da comunidade com sucesso.",
            "success"
        );

    } catch (error) {

        console.error(
            "Erro ao retirar música da comunidade:",
            error
        );

        alert(
            error.message ||
            "Não foi possível retirar a música."
        );

    } finally {

        if (button && button.isConnected) {
            button.disabled = false;
        }
    }
}
/* ============================================================
16. EDIÇÃO DOS DADOS PESSOAIS
============================================================ */

function getProfileFormValues() {

return {
    name: profileElements.profileName
        ? profileElements.profileName.value
        : "",

    email: profileElements.profileEmail
        ? profileElements.profileEmail.value
        : "",

    telefone: profileElements.profilePhone
        ? profileElements.profilePhone.value
        : "",

    bio: profileElements.profileBio
        ? profileElements.profileBio.value
        : ""
};

}

function setProfileEditMode(enabled) {

profileEditMode = Boolean(enabled);

const inputs = [
    profileElements.profileName,
    profileElements.profileEmail,
    profileElements.profilePhone,
    profileElements.profileBio
];
//Activar ou bloquear os campos.
inputs.forEach(input => {

    if (input) {
        input.disabled = !profileEditMode;
    }
});
//Botão guardar
if (profileElements.saveProfileButton) {
    profileElements.saveProfileButton.hidden = !profileEditMode;

    profileElements.saveProfileButton.style.display = profileEditMode ? "inline-flex": "none";
}
// Botão Cancelar.

if (profileElements.cancelProfileEdit) {
    profileElements.cancelProfileEdit.hidden = !profileEditMode;
    profileElements.cancelProfileEdit.style.display = profileEditMode ? "inline-flex": "none";
}
//Botão editar
if (profileElements.editProfileButton) {
    profileElements.editProfileButton.hidden = profileEditMode;

    profileElements.editProfileButton.style.display =
    profileEditMode ? "none" : "inline-flex";
    profileElements.cancelProfileEdit.style.display = profileEditMode ? "none":"inline-flex";
}

}

function beginProfileEdit() {

if (!currentProfile) {

    showMessage(
        "Não foi possível carregar os dados do perfil.",
        "error"
    );

    return;
}

originalProfileForm = getProfileFormValues();

setProfileEditMode(true);

showMessage("Podes editar os campos disponíveis.");

}

function cancelProfileEdit() {

if (originalProfileForm) {

    if (profileElements.profileName) {
        profileElements.profileName.value = originalProfileForm.name;
    }

    if (profileElements.profileEmail) {
        profileElements.profileEmail.value = originalProfileForm.email;
    }

    if (profileElements.profilePhone) {
        profileElements.profilePhone.value = originalProfileForm.telefone;
    }

    if (profileElements.profileBio) {
        profileElements.profileBio.value = originalProfileForm.bio;
    }
}

setProfileEditMode(false);
showMessage("");

}

/* ============================================================
   GUARDAR ALTERAÇÕES DO PERFIL
   ============================================================ */

async function saveProfile(event) {

    if (event) {
        event.preventDefault();
    }

    if (!profileEditMode) {
        return;
    }

    const name = normalizeString(
        profileElements.profileName?.value || ""
    );

    const email = normalizeString(
        profileElements.profileEmail?.value || ""
    );

    const telefoneRaw = normalizeString(
        profileElements.profilePhone?.value || ""
    );

    // Aceita 923000000, +244923000000 ou 00244923000000.
    let telefone = telefoneRaw.replace(/[\s().-]/g, "");
    if (telefone.startsWith("+244")) telefone = telefone.slice(4);
    else if (telefone.startsWith("00244")) telefone = telefone.slice(5);
    else if (telefone.startsWith("244") && telefone.length === 12) telefone = telefone.slice(3);

    const sobremim = normalizeString(
        profileElements.profileBio?.value || ""
    );

    // ========================================
    // VALIDAR NOME
    // ========================================

    if (name.length < 2) {

        showMessage(
            "O nome deve ter pelo menos 2 caracteres.",
            "error"
        );

        profileElements.profileName?.focus();

        return;
    }

    // ========================================
    // VALIDAR EMAIL
    // ========================================

    if (!email) {

        showMessage(
            "O endereço de e-mail é obrigatório.",
            "error"
        );

        profileElements.profileEmail?.focus();

        return;
    }

    if (
        profileElements.profileEmail &&
        !profileElements.profileEmail.checkValidity()
    ) {

        showMessage(
            "Introduz um endereço de e-mail válido.",
            "error"
        );

        profileElements.profileEmail.focus();

        return;
    }

    // ========================================
    // VALIDAR TELEFONE ANGOLANO (OPCIONAL)
    // ========================================

    if (telefone && !/^9\d{8}$/.test(telefone)) {
        showMessage(
            "Introduz um número angolano válido com 9 dígitos, por exemplo 923000000.",
            "error"
        );
        profileElements.profilePhone?.focus();
        return;
    }

    // ========================================
    // VALIDAR SOBRE MIM
    // ========================================

    if (sobremim.length > 500) {

        showMessage(
            "O campo Sobre mim não pode ultrapassar 500 caracteres.",
            "error"
        );

        return;
    }

    // ========================================
    // PREPARAR BOTÃO
    // ========================================

    const saveButton = profileElements.saveProfileButton;

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "A guardar...";
    }

    showMessage("A guardar alterações...");

    try {

        // ====================================
        // ENVIAR DADOS AO BACKEND
        // ====================================

        const response = await apiRequest(
            PROFILE_ENDPOINTS.me,
            {
                method: "PATCH",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    name: name,
                    email: email,
                    telefone: telefone,
                    sobremim: sobremim
                })
            }
        );

        // ====================================
        // VERIFICAR RESPOSTA
        // ====================================

        if (
            response &&
            response.success === false
        ) {
            throw new Error(
                response.message ||
                "Não foi possível actualizar o perfil."
            );
        }

        // ====================================
        // ACTUALIZAR PERFIL
        // ====================================

        const updatedUser = extractUserObject(response);

        if (
            updatedUser &&
            typeof updatedUser === "object" &&
            updatedUser.id
        ) {

            currentProfile = updatedUser;

        } else {

            currentProfile = {
                ...(currentProfile || {}),
                name,
                email,
                telefone,
                sobremim
            };
        }

        // Actualizar os dados apresentados.
        renderProfile(currentProfile);

        // Guardar os valores originais.
        originalProfileForm = getProfileFormValues();

        // Desactivar edição.
        setProfileEditMode(false);

        // ====================================
        // MENSAGEM DE SUCESSO
        // ====================================

        showMessage(
            "Os teus dados pessoais foram actualizados com sucesso!",
            "success"
        );

    } catch (error) {

        console.error(
            "Erro ao actualizar perfil:",
            error
        );

        showMessage(
            error.message ||
            "Não foi possível guardar as alterações.",
            "error"
        );

    } finally {

        if (saveButton) {

            saveButton.disabled = false;

            saveButton.innerHTML = `
                <span class="material-icons">save</span>
                Guardar alterações
            `;
        }
    }
}
async function changePassword() {
// Evitar criar várias janelas.
if (document.getElementById("changePasswordModal")) {
return;
}

const modal = document.createElement("div");

modal.id = "changePasswordModal";

modal.style.cssText = "position: fixed; inset: 0; z-index: 99999; background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center; padding: 16px;";

modal.innerHTML = `
<div style="
background: #171717;
color: #fff;
width: 100%;
max-width: 430px;
padding: 24px;
border-radius: 14px;
border: 1px solid #333;
box-sizing: border-box;
">
<h2 style="margin-top: 0; font-size: 22px;">
Alterar palavra-passe
</h2>

  <p style="color: #bbb; font-size: 14px;">
    Introduz a tua palavra-passe actual e escolhe uma nova.
  </p>

  <form id="changePasswordForm">
    <label for="currentPassword"
      style="display:block; margin-top:16px;">
      Palavra-passe actual
    </label>

    <input
      id="currentPassword"
      name="current_password"
      type="password"
      autocomplete="current-password"
      required
      maxlength="200"
      style="
        width:100%;
        box-sizing:border-box;
        margin-top:7px;
        padding:12px;
        border-radius:8px;
        border:1px solid #444;
        background:#222;
        color:#fff;
      "
    >

    <label for="newPassword"
      style="display:block; margin-top:16px;">
      Nova palavra-passe
    </label>

    <input
      id="newPassword"
      name="new_password"
      type="password"
      autocomplete="new-password"
      minlength="6"
      maxlength="200"
      required
      style="
        width:100%;
        box-sizing:border-box;
        margin-top:7px;
        padding:12px;
        border-radius:8px;
        border:1px solid #444;
        background:#222;
        color:#fff;
      "
    >

    <label for="confirmNewPassword"
      style="display:block; margin-top:16px;">
      Confirmar nova palavra-passe
    </label>

    <input
      id="confirmNewPassword"
      name="confirm_new_password"
      type="password"
      autocomplete="new-password"
      minlength="6"
      maxlength="200"
      required
      style="
        width:100%;
        box-sizing:border-box;
        margin-top:7px;
        padding:12px;
        border-radius:8px;
        border:1px solid #444;
        background:#222;
        color:#fff;
      "
    >

    <p
      id="changePasswordMessage"
      role="status"
      aria-live="polite"
      style="font-size:14px; margin-top:14px;"
    ></p>

    <div style="
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:20px;
    ">
      <button
        type="submit"
        id="submitChangePassword"
        style="
          flex:1;
          min-width:130px;
          padding:12px;
          border:0;
          border-radius:8px;
          background:#ff6b00;
          color:white;
          font-weight:bold;
          cursor:pointer;
        "
      >
        Guardar nova palavra-passe
      </button>

      <button
        type="button"
        id="cancelChangePassword"
        style="
          padding:12px;
          border:1px solid #555;
          border-radius:8px;
          background:#292929;
          color:white;
          cursor:pointer;
        "
      >
        Cancelar
      </button>
    </div>
  </form>
</div>

`;

document.body.appendChild(modal);

const form = document.getElementById("changePasswordForm");
const message = document.getElementById("changePasswordMessage");
const submitButton = document.getElementById("submitChangePassword");
const cancelButton = document.getElementById("cancelChangePassword");

cancelButton.addEventListener("click", () => {
modal.remove();
});

modal.addEventListener("click", event => {
if (event.target === modal) {
modal.remove();
}
});

form.addEventListener("submit", async event => {
event.preventDefault();

const currentPassword =
  document.getElementById("currentPassword").value;

const newPassword =
  document.getElementById("newPassword").value;

const confirmNewPassword =
  document.getElementById("confirmNewPassword").value;

message.style.color = "#ff7777";

if (newPassword.length < 6) {
  message.textContent =
    "A nova palavra-passe deve ter pelo menos 6 caracteres.";
  return;
}

if (newPassword !== confirmNewPassword) {
  message.textContent =
    "As novas palavras-passe não coincidem.";
  return;
}

if (currentPassword === newPassword) {
  message.textContent =
    "A nova palavra-passe deve ser diferente da actual.";
  return;
}

submitButton.disabled = true;
submitButton.textContent = "A guardar...";
message.textContent = "";

try {
  const response = await apiRequest(
    "/auth/change-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    }
  );

  message.style.color = "#4ade80";

  message.textContent =
    response.message ||
    "Palavra-passe alterada com sucesso.";

  form.reset();

  setTimeout(() => {
    modal.remove();
  }, 1800);

} catch (error) {
  message.style.color = "#ff7777";

  message.textContent =
    error.message ||
    "Não foi possível alterar a palavra-passe.";

} finally {
  if (document.body.contains(submitButton)) {
    submitButton.disabled = false;
    submitButton.textContent = "Guardar nova palavra-passe";
  }
}

});

document.getElementById("currentPassword").focus();
}


/* ============================================================
    FOTOGRAFIA DO PERFIL
============================================================ */

// ============================================================
// ALTERAR FOTOGRAFIA DE PERFIL
// ============================================================

function changeAvatar() {

    if (!currentProfile) {
        alert("Inicia sessão para alterar a fotografia.");
        return;
    }

    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";

    input.addEventListener("change", async () => {

        const file = input.files?.[0];

        if (!file) {
            return;
        }

        const maxSize = 5 * 1024 * 1024;

        if (file.size > maxSize) {
            alert("A fotografia não pode ultrapassar 5 MB.");
            return;
        }

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            alert("Selecciona uma imagem JPG, PNG ou WEBP.");
            return;
        }

        const formData = new FormData();

        formData.append("file", file);

        const button = profileElements.changeAvatarButton;

        if (button) {
            button.disabled = true;
        }

        try {

            const response = await apiRequest(
                "/auth/me/photo",
                {
                    method: "POST",
                    body: formData
                }
            );

            if (!response || !response.success || !response.foto) {
                throw new Error(
                    "O servidor não devolveu a fotografia actualizada."
                );
            }

            currentProfile = {
                ...currentProfile,
                foto: response.foto
            };

            renderProfile(currentProfile);

            showMessage(
                "Fotografia de perfil actualizada com sucesso.",
                "success"
            );

        } catch (error) {

            console.error("Erro ao carregar fotografia:", error);

            showMessage(
                error.message || "Não foi possível carregar a fotografia.",
                "error"
            );

            alert(error.message || "Erro ao carregar a fotografia.");

        } finally {

            if (button) {
                button.disabled = false;
            }
        }

    });

    input.click();
}
/* ============================================================
19. DETALHES DA ASSINATURA
============================================================ */

function showSubscriptionDetails() {

const section = document.getElementById("assinatura");

if (section) {
    section.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

alert(
    "Os detalhes apresentados dependem da integração com o sistema " +
    "de planos e pagamentos. Ainda não foi confirmado um endpoint " +
    "para carregar esses dados."
);

}

/* ============================================================
20. TERMINAR SESSÃO
============================================================ */

function logout() {

const confirmed = window.confirm(
    "Tens a certeza de que pretendes terminar a sessão?"
);

if (!confirmed) {
    return;
}

/*
 * Remove apenas chaves comuns de autenticação.
 * Não apaga músicas, favoritos nem outros dados da aplicação.
 *
 * Quando confirmarmos o login.js, podemos deixar esta lista
 * exatamente igual às chaves utilizadas pelo teu projeto.
 */

const keysToRemove = [
    ...AUTH_TOKEN_KEYS,
    "user",
    "currentUser",
    "loggedUser",
    "loggedUserName",
    "user_data"
];

keysToRemove.forEach(key => {
    localStorage.removeItem(key);
});

closeUserDropdown();

window.location.href = "login.html";

}

/* ============================================================
21. EVENTOS
============================================================ */

function registerProfileEvents() {

// Abrir menu lateral
if (profileElements.menuToggle) {

    profileElements.menuToggle.addEventListener(
        "click",
        toggleSidebar
    );
}

// Fechar menu lateral
if (profileElements.sidebarClose) {

    profileElements.sidebarClose.addEventListener(
        "click",
        closeSidebar
    );
}

// Fechar menu lateral ao tocar na sobreposição
if (profileElements.sidebarOverlay) {

    profileElements.sidebarOverlay.addEventListener(
        "click",
        closeSidebar
    );
}

// Menu do utilizador
if (profileElements.userMenuButton) {

    profileElements.userMenuButton.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            toggleUserDropdown();
        }
    );
}

// Fechar dropdown ao clicar fora
document.addEventListener("click", function (event) {

    const button = profileElements.userMenuButton;
    const dropdown = profileElements.userDropdown;

    if (
        button &&
        dropdown &&
        !button.contains(event.target) &&
        !dropdown.contains(event.target)
    ) {
        closeUserDropdown();
    }
});

// Tecla Escape
document.addEventListener("keydown", function (event) {

    if (event.key === "Escape") {
        closeUserDropdown();
        closeSidebar();
    }
});

// Editar perfil
if (profileElements.editProfileButton) {

    profileElements.editProfileButton.addEventListener(
        "click",
        beginProfileEdit
    );
}

// Cancelar edição
if (profileElements.cancelProfileEdit) {

    profileElements.cancelProfileEdit.addEventListener(
        "click",
        cancelProfileEdit
    );
}

// Guardar perfil
if (profileElements.profileForm) {

    profileElements.profileForm.addEventListener(
        "submit",
        saveProfile
    );
}

// Alterar palavra-passe
if (profileElements.changePasswordButton) {

    profileElements.changePasswordButton.addEventListener(
        "click",
        changePassword
    );
}

// Alterar fotografia
if (profileElements.changeAvatarButton) {

    profileElements.changeAvatarButton.addEventListener(
        "click",
        changeAvatar
    );
}

// Ver detalhes do plano
if (profileElements.subscriptionDetailsButton) {

    profileElements.subscriptionDetailsButton.addEventListener(
        "click",
        showSubscriptionDetails
    );
}

// Terminar sessão
if (profileElements.profileLogout) {

    profileElements.profileLogout.addEventListener(
        "click",
        logout
    );
}

if (profileElements.profileLogoutBottom) {

    profileElements.profileLogoutBottom.addEventListener(
        "click",
        logout
    );
}

}

/* ============================================================
22. INICIALIZAÇÃO
============================================================ */

async function initializeProfile() {

registerProfileEvents();

/*
 * A verificação da API e o carregamento do perfil são
 * independentes. Se o servidor estiver desligado, o erro
 * será apresentado sem interromper os restantes eventos.
 */

await checkAPI();

await loadProfile();

}

/* ============================================================
23. INICIAR QUANDO O HTML ESTIVER PRONTO
============================================================ */

if (document.readyState === "loading") {

document.addEventListener(
    "DOMContentLoaded",
    initializeProfile
);

} else {

initializeProfile();

}