"use strict";

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */

const API_BASE_URL = "https://studiomusic.onrender.com";
const MAX_PROMPT_LENGTH = 1024;
const MAX_LYRICS_LENGTH = 5000;

let allSongs = [];
let communitySongs = [];
let favoriteSongIds = new Set();

const FAVORITES_API = `${API_BASE_URL}/api/music/favorites`;


/* ============================================================
   ELEMENTOS DO DOM
   ============================================================ */

let promptInput;
let titleInput;
let durationInput;
let instrumentalInput;
let promptCounter;

let sidebar;
let menuOverlay;
let menuButton;
let pageTitle;

let generationStatus;
let statusTitle;
let statusMessage;

let generateBtn;
let referenceAudioInput = null;
let voiceSampleInput = null;
let voiceAuthorizationCheckbox = null;

let audioPlayerContainer;
let playerTitle;
let playerSubtitle;
let audioPlayer;
let downloadBtn;

let songsList;
let favoritesList;
let historyList;
let songSearch;

let toast;
let toastIcon;
let toastMessage;

let apiStatusDot;
let apiStatusText;

let userMenuButton;
let userDropdown;
let userNameElement;
let logoutButton;

let communitySongsList;
let communitySearch;
let refreshCommunityBtn;

let lyricsInput = null;
let lyricsCounter = null;
let clearLyricsBtn = null;

let selectedVoiceFile = null;
let voicePreviewUrl = null;


/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    initializeElements();
    initializeEvents();

    updatePromptCounter();

    showPage("criar");

    checkAPI();
    loadCurrentUser();
});


/* ============================================================
   INICIALIZAR ELEMENTOS
   ============================================================ */

function initializeElements() {
    promptInput = document.getElementById("prompt");
    titleInput = document.getElementById("title");
    durationInput = document.getElementById("duration");
    instrumentalInput = document.getElementById("instrumental");
    promptCounter = document.getElementById("promptCounter");

    sidebar = document.getElementById("sidebar");
    menuOverlay = document.getElementById("menuOverlay");
    menuButton = document.getElementById("menuButton");
    pageTitle = document.getElementById("pageTitle");

    generationStatus = document.getElementById("generationStatus");
    statusTitle = document.getElementById("statusTitle");
    statusMessage = document.getElementById("statusMessage");

    generateBtn = document.getElementById("generateBtn");

    // Provide a reference-audio control even if the original page markup
    // does not include one yet. The selected file is sent to the backend.
    referenceAudioInput = document.getElementById("referenceAudioInput");
    if (!referenceAudioInput && generateBtn && generateBtn.parentElement) {
        const referenceWrap = document.createElement("div");
        referenceWrap.id = "referenceAudioUploadWrapper";
        referenceWrap.style.margin = "12px 0";
        const referenceLabel = document.createElement("label");
        referenceLabel.htmlFor = "referenceAudioInput";
        referenceLabel.textContent = "Áudio de referência (MP3/M4A, menos de 10 MB; a Mureka utiliza um excerto de 30 segundos)";
        referenceLabel.style.display = "block";
        referenceLabel.style.marginBottom = "6px";
        referenceAudioInput = document.createElement("input");
        referenceAudioInput.type = "file";
        referenceAudioInput.id = "referenceAudioInput";
        referenceAudioInput.accept = ".mp3,.m4a,audio/mpeg,audio/mp4";
        referenceAudioInput.style.maxWidth = "100%";
        referenceWrap.append(referenceLabel, referenceAudioInput);
        generateBtn.parentElement.insertBefore(referenceWrap, generateBtn);
    }

    voiceSampleInput = document.getElementById("voiceSampleInput");
    if (!voiceSampleInput && generateBtn && generateBtn.parentElement) {
        const voiceWrap = document.createElement("div");
        voiceWrap.id = "voiceSampleUploadWrapper";
        voiceWrap.style.margin = "12px 0";
        const voiceLabel = document.createElement("label");
        voiceLabel.htmlFor = "voiceSampleInput";
        voiceLabel.textContent = "Amostra vocal opcional (MP3/M4A, 15–30 segundos, menos de 10 MB)";
        voiceLabel.style.display = "block";
        voiceLabel.style.marginBottom = "6px";
        voiceSampleInput = document.createElement("input");
        voiceSampleInput.type = "file";
        voiceSampleInput.id = "voiceSampleInput";
        voiceSampleInput.accept = ".mp3,.m4a,audio/mpeg,audio/mp4";
        voiceSampleInput.style.maxWidth = "100%";
        voiceAuthorizationCheckbox = document.createElement("input");
        voiceAuthorizationCheckbox.type = "checkbox";
        voiceAuthorizationCheckbox.id = "voiceSampleAuthorized";
        const authorizationLabel = document.createElement("label");
        authorizationLabel.htmlFor = "voiceSampleAuthorized";
        authorizationLabel.textContent = "Confirmo que tenho autorização para utilizar esta voz.";
        authorizationLabel.style.marginLeft = "6px";
        const authorizationRow = document.createElement("div");
        authorizationRow.style.marginTop = "6px";
        authorizationRow.append(voiceAuthorizationCheckbox, authorizationLabel);
        voiceWrap.append(voiceLabel, voiceSampleInput, authorizationRow);
        generateBtn.parentElement.insertBefore(voiceWrap, generateBtn);
    }

    audioPlayerContainer = document.getElementById("audioPlayerContainer");
    playerTitle = document.getElementById("playerTitle");
    playerSubtitle = document.getElementById("playerSubtitle");
    audioPlayer = document.getElementById("audioPlayer");
    downloadBtn = document.getElementById("downloadBtn");

    songsList = document.getElementById("songsList");
    favoritesList = document.getElementById("favoritesList");
    historyList = document.getElementById("historyList");
    songSearch = document.getElementById("songSearch");

    toast = document.getElementById("toast");
    toastIcon = document.getElementById("toastIcon");
    toastMessage = document.getElementById("toastMessage");

    apiStatusDot = document.getElementById("apiStatusDot");
    apiStatusText = document.getElementById("apiStatusText");

    userMenuButton = document.getElementById("userMenuButton");
    userDropdown = document.getElementById("userDropdown");
    userNameElement = document.querySelector(".user-name");
    logoutButton = document.querySelector(".logout-item");

    communitySongsList = document.getElementById("communitySongsList");
    communitySearch = document.getElementById("communitySearch");
    refreshCommunityBtn = document.getElementById("refreshCommunityBtn");

    lyricsInput = document.getElementById("lyricsInput");
    lyricsCounter = document.getElementById("lyricsCounter");
    clearLyricsBtn = document.getElementById("clearLyricsBtn");
}


/* ============================================================
   EVENTOS
   ============================================================ */

function initializeEvents() {
    if (promptInput) {
        promptInput.addEventListener("input", updatePromptCounter);
    }

    if (generateBtn) {
        generateBtn.addEventListener("click", generateMusic);
    }

    if (songSearch) {
        songSearch.addEventListener("input", searchSongs);
    }

    if (menuOverlay) {
        menuOverlay.addEventListener("click", closeSidebar);
    }

    if (downloadBtn) {
        downloadBtn.addEventListener("click", handleDownload);
    }

    /*
       CORREÇÃO:
       A pesquisa da comunidade chama a função sem argumentos.
       A função obtém a lista guardada em communitySongs.
    */
    if (communitySearch) {
        communitySearch.addEventListener("input", () => {
            renderCommunitySongs();
        });
    }

    if (refreshCommunityBtn) {
        refreshCommunityBtn.addEventListener("click", loadCommunitySongs);
    }

    if (userMenuButton && userDropdown) {
        userMenuButton.addEventListener("click", event => {
            event.stopPropagation();

            userDropdown.classList.toggle("hidden");

            userMenuButton.setAttribute(
                "aria-expanded",
                String(!userDropdown.classList.contains("hidden"))
            );
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", event => {
            event.preventDefault();
            logout();
        });
    }

    document.addEventListener("click", event => {
        if (
            userDropdown &&
            !userDropdown.classList.contains("hidden") &&
            !userDropdown.contains(event.target) &&
            !userMenuButton?.contains(event.target)
        ) {
            userDropdown.classList.add("hidden");

            if (userMenuButton) {
                userMenuButton.setAttribute("aria-expanded", "false");
            }
        }
    });

    initializeVoiceUpload();
    initializeLyricsField();
}


/* ============================================================
   UTILIZADOR AUTENTICADO
   ============================================================ */

async function loadCurrentUser() {
    const token = localStorage.getItem("access_token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const data = await response.json();
        const user = data.user || data;

        const username =
            user.username ||
            user.name ||
            user.nome ||
            user.email ||
            "Utilizador";

        if (userNameElement) {
            userNameElement.textContent = username;
        }

        localStorage.setItem("user", JSON.stringify(user));

    } catch (error) {
        console.error("Erro ao carregar utilizador:", error);

        if (userNameElement) {
            userNameElement.textContent = "Utilizador";
        }
    }
}


/* ============================================================
   TERMINAR SESSÃO
   ============================================================ */

function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user");

    window.location.href = "login.html";
}


/* ============================================================
   MENU LATERAL
   ============================================================ */

function toggleSidebar() {
    if (!sidebar || !menuOverlay) {
        return;
    }

    const isOpen = sidebar.classList.contains("open");

    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add("open");
        menuOverlay.classList.add("active");

        if (menuButton) {
            menuButton.setAttribute("aria-expanded", "true");
        }
    }
}


function closeSidebar() {
    if (sidebar) {
        sidebar.classList.remove("open");
    }

    if (menuOverlay) {
        menuOverlay.classList.remove("active");
    }

    if (menuButton) {
        menuButton.setAttribute("aria-expanded", "false");
    }
}


/* ============================================================
   NAVEGAÇÃO ENTRE PÁGINAS
   ============================================================ */

function showPage(page) {
    const pages = document.querySelectorAll(".page");
    const navItems = document.querySelectorAll(".nav-item");

    pages.forEach(element => element.classList.remove("active"));
    navItems.forEach(element => element.classList.remove("active"));

    const selectedPage = document.getElementById(`page-${page}`);

    if (!selectedPage) {
        console.warn(`Página não encontrada: page-${page}`);
        return;
    }

    selectedPage.classList.add("active");

    const selectedNav = document.querySelector(
        `.nav-item[data-page="${page}"]`
    );

    if (selectedNav) {
        selectedNav.classList.add("active");
    }

    const titles = {
        criar: "Criar música",
        musicas: "Minhas músicas",
        favoritos: "Favoritos",
        comunidade: "Comunidade",
        historico: "Histórico"
    };

    if (pageTitle) {
        pageTitle.textContent = titles[page] || "StudioMusic.AI";
    }

    closeSidebar();

    switch (page) {
        case "musicas":
            loadSongs();
            break;

        case "favoritos":
            loadFavorites();
            break;

        case "comunidade":
            loadCommunitySongs();
            break;

        case "historico":
            loadHistory();
            break;
    }
}


/* ============================================================
   CONTADOR DO PROMPT
   ============================================================ */

function updatePromptCounter() {
    if (!promptInput || !promptCounter) {
        return;
    }

    const length = promptInput.value.length;

    promptCounter.textContent = `${length} / ${MAX_PROMPT_LENGTH}`;

    promptCounter.classList.toggle(
        "limit",
        length >= MAX_PROMPT_LENGTH
    );
}


/* ============================================================
   NOTIFICAÇÕES TOAST
   ============================================================ */

function showToast(message, type = "info") {
    if (!toast || !toastMessage) {
        console.log(`[${type}] ${message}`);
        return;
    }

    toastMessage.textContent = message;

    if (toastIcon) {
        const icons = {
            success: "check_circle",
            error: "error",
            warning: "warning",
            info: "info"
        };

        toastIcon.textContent = icons[type] || icons.info;
    }

    toast.classList.remove("success", "error", "warning", "info");
    toast.classList.add(type, "show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}


/* ============================================================
   ESTADO DE GERAÇÃO
   ============================================================ */

function showGenerationStatus(title, message, visible = true) {
    if (!generationStatus) {
        return;
    }

    if (statusTitle) {
        statusTitle.textContent = title;
    }

    if (statusMessage) {
        statusMessage.textContent = message;
    }

    generationStatus.classList.toggle("hidden", !visible);
}


function hideGenerationStatus() {
    if (generationStatus) {
        generationStatus.classList.add("hidden");
    }
}


function setGenerateButtonLoading(loading) {
    if (!generateBtn) {
        return;
    }

    generateBtn.disabled = loading;

    generateBtn.innerHTML = loading
        ? `<span class="material-icons">autorenew</span> Gerando música...`
        : `<span class="material-icons">auto_awesome</span> Gerar música`;
}


/* ============================================================
   GERAR MÚSICA
   ============================================================ */

async function generateMusic() {
    const prompt = promptInput?.value.trim() || "";
    const title = titleInput?.value.trim() || "";
    const durationValue = durationInput?.value || "";
    const instrumental = instrumentalInput?.checked || false;
    const lyrics = getLyrics();

    if (!promptInput) {
        showToast("Campo de descrição da música não encontrado.", "error");
        return;
    }
    if (!prompt) {
        showToast("Descreve primeiro a música que desejas criar.", "warning");
        promptInput.focus();
        return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        showToast(`O prompt não pode ultrapassar ${MAX_PROMPT_LENGTH} caracteres (limite da Mureka).`, "warning");
        return;
    }
    if (lyrics.length > MAX_LYRICS_LENGTH) {
        showToast(`A letra não pode ultrapassar ${MAX_LYRICS_LENGTH} caracteres.`, "warning");
        return;
    }

    const duration = durationValue ? Number(durationValue) : null;
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(duration))) {
        showToast("A duração indicada deve ser um número inteiro de segundos válido.", "warning");
        return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
        showToast("A tua sessão expirou. Inicia sessão novamente.", "error");
        window.location.href = "login.html";
        return;
    }

    setGenerateButtonLoading(true);
    hidePlayer();
    showGenerationStatus("A enviar pedido...", "A preparar a geração da tua música.", true);

    try {
        // If the page contains an audio-reference input, upload the actual file
        // to the backend first; the backend forwards it to Mureka and returns
        // the provider reference ID used by the generation request.
        let sourceReferenceId = null;
        const referenceInput = referenceAudioInput || document.querySelector(
            "#sourceAudioInput, #audioReference, input[type='file'][accept*='audio']"
        );
        const referenceFile = referenceInput?.files?.[0];
        if (referenceFile) {
            const uploadForm = new FormData();
            uploadForm.append("file", referenceFile);
            uploadForm.append("purpose", instrumental ? "instrumental" : "reference");
            const uploadResponse = await fetch(`${API_BASE_URL}/api/music/upload-source`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
                body: uploadForm
            });
            const uploadData = await parseResponse(uploadResponse);
            if (!uploadResponse.ok || !uploadData?.reference_id) {
                throw new Error(getErrorMessage(uploadData, "Não foi possível enviar o áudio de referência para a Mureka."));
            }
            sourceReferenceId = uploadData.reference_id;
        }

        let vocalId = null;
        const voiceFile = voiceSampleInput?.files?.[0];
        if (voiceFile && instrumental) {
            throw new Error("A amostra vocal só pode ser usada numa geração com voz, não numa música instrumental.");
        }
        if (voiceFile) {
            if (!voiceAuthorizationCheckbox?.checked) {
                throw new Error("Confirma que tens autorização para utilizar a voz da amostra.");
            }
            const voiceForm = new FormData();
            voiceForm.append("file", voiceFile);
            voiceForm.append("authorized", "true");
            const voiceResponse = await fetch(`${API_BASE_URL}/api/music/clone-voice`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
                body: voiceForm
            });
            const voiceData = await parseResponse(voiceResponse);
            if (!voiceResponse.ok || !voiceData?.vocal_id) {
                throw new Error(getErrorMessage(voiceData, "Não foi possível criar o perfil vocal na Mureka."));
            }
            vocalId = voiceData.vocal_id;
        }

        const response = await fetch(`${API_BASE_URL}/api/music/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ prompt, title: title || null, duration, instrumental, lyrics, source_reference_id: sourceReferenceId, vocal_id: vocalId })
        });
        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(getErrorMessage(data, `Erro HTTP ${response.status}`));
        }
        if (data?.success === false) {
            throw new Error(getErrorMessage(data, "A API não conseguiu aceitar o pedido."));
        }

        const songId = data.song_id || data.id;
        if (!songId) {
            throw new Error(data.message || "O servidor aceitou o pedido, mas não devolveu o ID da música.");
        }

        showGenerationStatus(
            "A música está a ser criada...",
            "O pedido foi aceite. Isto pode demorar alguns minutos; não feches esta página.",
            true
        );

        const completedSong = await waitForMusicGeneration(songId, token);
        const audioUrl = completedSong.audio_url || completedSong.audioUrl || completedSong.url ||
            completedSong.file_url || completedSong.fileUrl || completedSong.clips?.[0]?.audio_url || "";

        if (!audioUrl) {
            throw new Error("A geração terminou, mas o servidor ainda não disponibilizou o áudio.");
        }

        const generatedTitle = completedSong.title || title || "Minha música StudioMusic.AI";
        const finalAudioUrl = resolveAudioUrl(audioUrl);
        showGenerationStatus("Música criada com sucesso!", "A tua música está pronta para reprodução.", true);
        showToast("Música criada com sucesso!", "success");
        showPlayer(generatedTitle, finalAudioUrl, completedSong.duration || duration);
        addToHistory(generatedTitle, finalAudioUrl);
        if (completedSong.id || songId) {
            await saveSongToHistory(completedSong.id || songId);
        }
        await loadSongs(true);
    } catch (error) {
        console.error("Erro ao gerar música:", error);
        const message = error instanceof TypeError && error.message === "Failed to fetch"
            ? "Não foi possível contactar o backend. Verifica o CORS_ALLOWED_ORIGINS no Render e confirma se o serviço está Live."
            : (error.message || "Não foi possível gerar a música.");
        showGenerationStatus("Erro ao gerar música", message, true);
        showToast(message, "error");
    } finally {
        setGenerateButtonLoading(false);
    }
}

async function waitForMusicGeneration(songId, token) {
    const pollIntervalMs = 5000;
    const maxWaitMs = 12 * 60 * 1000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        const response = await fetch(`${API_BASE_URL}/api/music/${encodeURIComponent(songId)}/status`, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        const data = await parseResponse(response);
        if (!response.ok) {
            throw new Error(getErrorMessage(data, `Não foi possível consultar a geração (HTTP ${response.status}).`));
        }

        const state = String(data.generation_status || data.status || "pending").toLowerCase();
        if (["completed", "complete", "succeeded", "success"].includes(state)) {
            return data;
        }
        if (["failed", "error", "cancelled", "canceled"].includes(state)) {
            throw new Error(data.generation_error || data.error || data.message || "A geração da música falhou no serviço de música.");
        }
        showGenerationStatus(
            "A música está a ser criada...",
            "A geração continua em processamento. Aguarda, por favor.",
            true
        );
    }
    throw new Error("A geração está a demorar mais do que o esperado. A música pode continuar a ser processada; consulta Minhas músicas mais tarde.");
}
/* ============================================================
   PLAYER
   ============================================================ */

function showPlayer(title, url, duration = "") {
    if (!audioPlayerContainer || !audioPlayer) {
        return;
    }

    const finalUrl = resolveAudioUrl(url);

    if (!finalUrl) {
        showToast("O endereço do áudio não é válido.", "error");
        return;
    }

    if (playerTitle) {
        playerTitle.textContent = title || "Música StudioMusic.AI";
    }

    if (playerSubtitle) {
        playerSubtitle.textContent = duration
            ? `Duração: ${duration} segundos`
            : "Música gerada pelo StudioMusic.AI";
    }

    audioPlayer.src = finalUrl;
    audioPlayer.load();

    if (downloadBtn) {
        downloadBtn.dataset.url = finalUrl;
        downloadBtn.dataset.filename =
            sanitizeFilename(title) || "StudioMusic.mp3";
    }

    audioPlayerContainer.classList.remove("hidden");

    setTimeout(() => {
        audioPlayerContainer.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }, 100);
}


function hidePlayer() {
    if (audioPlayerContainer) {
        audioPlayerContainer.classList.add("hidden");
    }

    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
    }
}


/* ============================================================
   RESOLVER URL DO ÁUDIO
   ============================================================ */

function resolveAudioUrl(url) {
    if (!url) {
        return "";
    }

    const value = String(url).trim();

    if (!value) {
        return "";
    }

    if (
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("blob:")
    ) {
        return value;
    }

    if (value.startsWith("/")) {
        return `${API_BASE_URL}${value}`;
    }

    return `${API_BASE_URL}/${value}`;
}


/* ============================================================
   RESPOSTAS DA API
   ============================================================ */

async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return await response.json();
    }

    const text = await response.text();

    return {
        message: text
    };
}


function getErrorMessage(data, fallback = "Ocorreu um erro.") {
    const detail = data?.detail ?? data?.message ?? data?.error;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (detail !== undefined && detail !== null) {
        try {
            return JSON.stringify(detail);
        } catch {
            // Usar a mensagem padrão.
        }
    }

    return fallback;
}


/* ============================================================
   DOWNLOAD DO PLAYER
   ============================================================ */

async function handleDownload(event) {
    event?.preventDefault();

    if (!downloadBtn?.dataset.url) {
        showToast("Nenhuma música disponível para download.", "warning");
        return;
    }

    const url = downloadBtn.dataset.url;
    const filename = downloadBtn.dataset.filename || "StudioMusic.mp3";

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = blobUrl;
        link.download = filename.toLowerCase().endsWith(".mp3")
            ? filename
            : `${filename}.mp3`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    } catch (error) {
        console.error("Erro no download:", error);
        window.open(url, "_blank", "noopener,noreferrer");
    }
}


/* ============================================================
   MINHAS MÚSICAS — CARREGAR DO BACKEND
   ============================================================ */

async function loadSongs(silent = false) {
    const container = document.getElementById("songsList");

    if (!container) {
        console.error("Minhas músicas: songsList não encontrado.");
        return;
    }

    const token = localStorage.getItem("access_token");

    if (!token) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">lock</span>
                <h3>Sessão não iniciada</h3>
                <p>Inicia sessão para visualizar as tuas músicas.</p>
            </div>
        `;
        return;
    }

    if (!silent) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">hourglass_empty</span>
                <p>A carregar as tuas músicas...</p>
            </div>
        `;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/music`, {
            method: "GET",
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        });

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(
                getErrorMessage(data, `Erro HTTP ${response.status}`)
            );
        }

        let songs = [];

        if (Array.isArray(data)) {
            songs = data;
        } else if (Array.isArray(data?.songs)) {
            songs = data.songs;
        } else if (Array.isArray(data?.music)) {
            songs = data.music;
        } else if (Array.isArray(data?.data)) {
            songs = data.data;
        }

        allSongs = songs;
        renderSongs(allSongs);

        try {
            await loadFavorites();
            updateFavoriteButtons();
        } catch (error) {
            console.warn("Não foi possível atualizar os favoritos:", error);
        }

    } catch (error) {
        console.error("Erro ao carregar Minhas músicas:", error);

        if (!silent || !container.querySelector(".song-card")) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons">error_outline</span>
                    <h3>Erro ao carregar músicas</h3>
                    <p>${escapeHtml(error.message || "Verifica a ligação ao servidor.")}</p>
                    <button
                        type="button"
                        class="btn-primary"
                        onclick="loadSongs()"
                    >
                        Tentar novamente
                    </button>
                </div>
            `;
        }
    }
}


/* ============================================================
   MINHAS MÚSICAS — APRESENTAR
   ============================================================ */

function renderSongs(songs) {
    const container = document.getElementById("songsList");

    if (!container || !Array.isArray(songs)) {
        return;
    }

    if (songs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">library_music</span>
                <h3>Ainda não tens músicas</h3>
                <p>As músicas que criares aparecerão aqui.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = songs.map(createSongCard).join("");

    updateFavoriteButtons();
}


/* ============================================================
   CARTÃO DE MÚSICA
   ============================================================ */

function createSongCard(song) {
    const songId = Number(song.id ?? song.song_id);
    const validSongId = Number.isSafeInteger(songId) && songId > 0;

    const title = song.title || song.name || "Minha música StudioMusic.AI";

    const audioUrl =
        song.audio_url ||
        song.audioUrl ||
        song.url ||
        song.file_url ||
        song.fileUrl ||
        "";

    const coverUrl = song.cover_url || song.coverUrl || "";
    const duration = song.duration || "";
    const createdAt = song.created_at || song.createdAt || "";

    const isPublic =
        song.is_public === true ||
        song.is_public === 1 ||
        song.is_public === "1";

    const isCompleted =
        String(song.status || "").toLowerCase() === "completed";

    const isFavorite = validSongId && favoriteSongIds.has(songId);

    const coverMarkup = coverUrl
        ? `
            <img
                class="song-cover"
                src="${escapeAttribute(resolveAudioUrl(coverUrl))}"
                alt="Capa de ${escapeAttribute(title)}"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
            >
            <span class="material-icons song-cover-fallback" style="display:none">
                music_note
            </span>
        `
        : `
            <span class="material-icons song-cover-fallback">music_note</span>
        `;

    return `
        <div class="song-card" data-song-id="${validSongId ? songId : ""}">
            <div class="song-card-icon">
                ${coverMarkup}
            </div>

            <div class="song-card-info">
                <h3>${escapeHtml(title)}</h3>

                ${duration ? `<p>${escapeHtml(String(duration))} segundos</p>` : ""}

                ${createdAt ? `<small>${formatDate(createdAt)}</small>` : ""}

                ${
                    isPublic
                        ? `<small class="song-public-status">
                            <span class="material-icons" style="font-size:14px;vertical-align:middle">public</span>
                            Publicada na Comunidade
                           </small>`
                        : ""
                }
            </div>

            <div class="song-card-actions">
                ${
                    audioUrl
                        ? `
                            <button
                                type="button"
                                class="icon-button"
                                title="Reproduzir"
                                aria-label="Reproduzir música"
                                onclick="playSong('${encodeURIComponent(audioUrl)}','${encodeURIComponent(title)}','${encodeURIComponent(coverUrl)}',${validSongId ? songId : "null"})"
                            >
                                <span class="material-icons">play_arrow</span>
                            </button>

                            <a
                                class="icon-button"
                                title="Baixar"
                                aria-label="Baixar música"
                                href="${escapeAttribute(resolveAudioUrl(audioUrl))}"
                                download
                            >
                                <span class="material-icons">download</span>
                            </a>
                        `
                        : ""
                }

                ${
                    validSongId
                        ? `
                            <button
                                type="button"
                                class="icon-button favorite-button"
                                data-favorite-id="${songId}"
                                onclick="toggleFavorite(${songId}, this)"
                                title="${isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}"
                                aria-label="${isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}"
                            >
                                <span class="material-icons">${isFavorite ? "favorite" : "favorite_border"}</span>
                            </button>
                        `
                        : ""
                }

                ${
                    validSongId && isCompleted
                        ? `
                            <button
                                type="button"
                                class="icon-button publish-button"
                                data-publish-song-id="${songId}"
                                onclick="toggleSongPublication(${songId}, this)"
                                title="${isPublic ? "Retirar da Comunidade" : "Publicar na Comunidade"}"
                                aria-label="${isPublic ? "Retirar da Comunidade" : "Publicar na Comunidade"}"
                            >
                                <span class="material-icons">${isPublic ? "public_off" : "public"}</span>
                            </button>
                        `
                        : ""
                }

                ${
                    validSongId
                        ? `
                            <button
                                type="button"
                                class="icon-button delete-button"
                                title="Eliminar música"
                                aria-label="Eliminar música"
                                onclick="deleteSong(${songId})"
                            >
                                <span class="material-icons">delete</span>
                            </button>
                        `
                        : ""
                }
            </div>
        </div>
    `;
}


/* ============================================================
   APAGAR MÚSICA
   ============================================================ */

async function deleteSong(songId) {
    const id = Number(songId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        showToast("ID da música não encontrado.", "error");
        return;
    }

    const song = allSongs.find(
        item => Number(item.id ?? item.song_id) === id
    );

    const songTitle = song?.title || song?.name || "esta música";

    if (!window.confirm(
        `Tens a certeza de que desejas eliminar "${songTitle}"?\n\nEsta ação não pode ser desfeita.`
    )) {
        return;
    }

    try {
        showToast("A eliminar a música...", "info");

        const token = localStorage.getItem("access_token");

        const response = await fetch(`${API_BASE_URL}/api/music/${id}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        const data = await parseResponse(response);

        if (!response.ok || data?.success === false) {
            throw new Error(
                getErrorMessage(data, `Erro HTTP ${response.status}`)
            );
        }

        allSongs = allSongs.filter(
            item => Number(item.id ?? item.song_id) !== id
        );

        favoriteSongIds.delete(id);

        renderSongs(allSongs);

        if (
            song &&
            audioPlayer &&
            playerTitle &&
            playerTitle.textContent === songTitle
        ) {
            hidePlayer();
        }

        await loadFavorites();

        showToast(data.message || "Música eliminada com sucesso.", "success");

    } catch (error) {
        console.error("Erro ao eliminar música:", error);
        showToast(error.message || "Não foi possível eliminar a música.", "error");
    }
}


/* ============================================================
   REPRODUZIR MÚSICA
   ============================================================ */

async function playSong(encodedUrl, encodedTitle, encodedCover = "", songId = null) {
    const url = decodeURIComponent(encodedUrl);
    const title = decodeURIComponent(encodedTitle);
    const coverUrl = encodedCover ? decodeURIComponent(encodedCover) : "";

    const finalUrl = resolveAudioUrl(url);

    showPlayer(title, finalUrl);
    addToHistory(title, finalUrl, coverUrl);

    if (songId !== null && songId !== undefined) {
        await saveSongToHistory(songId);
    }

    if (audioPlayer) {
        audioPlayer.play().catch(() => {
            console.log("Autoplay bloqueado pelo navegador.");
        });
    }
}


/* ============================================================
   PESQUISAR MINHAS MÚSICAS
   ============================================================ */

function searchSongs() {
    if (!songSearch) {
        return;
    }

    const query = songSearch.value.trim().toLowerCase();

    if (!query) {
        renderSongs(allSongs);
        return;
    }

    const filtered = allSongs.filter(song => {
        const title = String(song.title || song.name || "").toLowerCase();
        const prompt = String(song.prompt || "").toLowerCase();

        return title.includes(query) || prompt.includes(query);
    });

    renderSongs(filtered);
}


/* ============================================================
   ARMAZENAMENTO LOCAL POR UTILIZADOR
   ============================================================ */

function getUserStorageKey(type) {
    let user = {};

    try {
        user = JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
        user = {};
    }

    const identity =
        user.id ??
        user.user_id ??
        user.email ??
        user.username ??
        user.name;

    if (!identity) {
        return null;
    }

    return `studiomusic_${type}_${String(identity).toLowerCase()}`;
}


/* ============================================================
   FAVORITOS — PEDIDOS À API
   ============================================================ */

function getFavoriteHeaders() {
    const token = localStorage.getItem("access_token");

    if (!token) {
        throw new Error("Inicia sessão para gerir os favoritos.");
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
    };
}


async function favoriteRequest(url, options = {}) {
    const headers = {
        ...getFavoriteHeaders(),
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data = null;

    if (response.status !== 204) {
        data = await parseResponse(response);
    }

    if (!response.ok) {
        throw new Error(
            getErrorMessage(data, `Erro HTTP ${response.status}`)
        );
    }

    return data;
}


function getFavoriteSongId(item) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const id =
        item.song_id ??
        item.music_id ??
        item.song?.id ??
        item.music?.id ??
        item.id;

    const number = Number(id);

    return Number.isSafeInteger(number) && number > 0
        ? number
        : null;
}


function updateFavoriteButtons() {
    document.querySelectorAll(".favorite-button").forEach(button => {
        const songId = Number(button.dataset.favoriteId);
        const icon = button.querySelector(".material-icons");

        if (!icon || !Number.isSafeInteger(songId)) {
            return;
        }

        const isFavorite = favoriteSongIds.has(songId);

        icon.textContent = isFavorite ? "favorite" : "favorite_border";
        button.classList.toggle("is-favorite", isFavorite);

        button.title = isFavorite
            ? "Remover dos favoritos"
            : "Adicionar aos favoritos";

        button.setAttribute("aria-label", button.title);
    });
}


/* ============================================================
   ADICIONAR OU REMOVER FAVORITO
   ============================================================ */

async function toggleFavorite(songId, button = null) {
    const id = Number(songId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        showToast("Não foi possível identificar esta música.", "error");
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {
        const data = await favoriteRequest(FAVORITES_API, {
            method: "GET"
        });

        const list = Array.isArray(data)
            ? data
            : data?.favorites || data?.songs || data?.data || [];

        favoriteSongIds = new Set(
            list.map(getFavoriteSongId).filter(value => value !== null)
        );

        const alreadyFavorite = favoriteSongIds.has(id);

        if (alreadyFavorite) {
            await favoriteRequest(
                `${API_BASE_URL}/api/music/${id}/favorite`,
                { method: "DELETE" }
            );

            favoriteSongIds.delete(id);
            showToast("Música removida dos favoritos.", "success");
        } else {
            await favoriteRequest(
                `${API_BASE_URL}/api/music/${id}/favorite`,
                { method: "POST" }
            );

            favoriteSongIds.add(id);
            showToast("Música adicionada aos favoritos.", "success");
        }

        updateFavoriteButtons();
        await loadFavorites();

    } catch (error) {
        console.error("Erro ao alterar favorito:", error);

        showToast(
            error.message || "Não foi possível atualizar os favoritos.",
            "error"
        );

    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* ============================================================
   CARREGAR FAVORITOS
   ============================================================ */

async function loadFavorites() {
    if (!favoritesList) {
        /*
           Mesmo quando a secção Favoritos não está visível,
           atualizar os IDs permite pintar os ícones nas músicas.
        */
        try {
            const data = await favoriteRequest(FAVORITES_API, {
                method: "GET"
            });

            const list = Array.isArray(data)
                ? data
                : data?.favorites || data?.songs || data?.data || [];

            favoriteSongIds = new Set(
                list.map(getFavoriteSongId).filter(id => id !== null)
            );

            updateFavoriteButtons();
        } catch (error) {
            console.warn("Não foi possível atualizar os IDs favoritos:", error);
        }

        return;
    }

    try {
        const data = await favoriteRequest(FAVORITES_API, {
            method: "GET"
        });

        let favorites = [];

        if (Array.isArray(data)) {
            favorites = data;
        } else if (Array.isArray(data?.favorites)) {
            favorites = data.favorites;
        } else if (Array.isArray(data?.songs)) {
            favorites = data.songs;
        } else if (Array.isArray(data?.data)) {
            favorites = data.data;
        }

        favoriteSongIds = new Set(
            favorites.map(getFavoriteSongId).filter(id => id !== null)
        );

        updateFavoriteButtons();

        if (favorites.length === 0) {
            favoritesList.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons">favorite_border</span>
                    <h3>Nenhuma música favorita</h3>
                    <p>As músicas que adicionares aos favoritos aparecerão aqui.</p>
                </div>
            `;
            return;
        }

        favoritesList.innerHTML = favorites.map(item => {
            const song = item.song || item.music || item;

            const id = getFavoriteSongId(item) ??
                getFavoriteSongId(song);

            const title =
                song.title ||
                song.name ||
                item.title ||
                "Música sem título";

            const audioUrl =
                song.audio_url ||
                song.audioUrl ||
                song.url ||
                item.audio_url ||
                item.url ||
                "";

            const coverUrl =
                song.cover_url ||
                song.coverUrl ||
                item.cover_url ||
                "";

            return `
                <div class="song-card">
                    <div class="song-card-icon">
                        <span class="material-icons">favorite</span>
                    </div>

                    <div class="song-card-info">
                        <h3>${escapeHtml(title)}</h3>
                    </div>

                    <div class="song-card-actions">
                        ${
                            audioUrl
                                ? `
                                    <button
                                        type="button"
                                        class="icon-button"
                                        title="Reproduzir"
                                        onclick="playSong('${encodeURIComponent(audioUrl)}','${encodeURIComponent(title)}','${encodeURIComponent(coverUrl)}',${id ?? "null"})"
                                    >
                                        <span class="material-icons">play_arrow</span>
                                    </button>
                                `
                                : ""
                        }

                        ${
                            id
                                ? `
                                    <button
                                        type="button"
                                        class="icon-button favorite-button"
                                        data-favorite-id="${id}"
                                        onclick="toggleFavorite(${id}, this)"
                                        title="Remover dos favoritos"
                                    >
                                        <span class="material-icons">favorite</span>
                                    </button>
                                `
                                : ""
                        }
                    </div>
                </div>
            `;
        }).join("");

        updateFavoriteButtons();

    } catch (error) {
        console.error("Erro ao carregar favoritos:", error);

        favoritesList.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">error_outline</span>
                <h3>Não foi possível carregar os favoritos</h3>
                <p>${escapeHtml(error.message || "Verifica a ligação ao servidor.")}</p>
            </div>
        `;
    }
}


/* ============================================================
   PUBLICAR OU RETIRAR MÚSICA DA COMUNIDADE
   ============================================================ */

async function toggleSongPublication(songId, button = null) {
    const id = Number(songId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        showToast("ID da música inválido.", "error");
        return;
    }

    const song = allSongs.find(
        item => Number(item.id ?? item.song_id) === id
    );

    if (!song) {
        showToast("Música não encontrada na tua biblioteca.", "error");
        return;
    }

    const isPublic =
        song.is_public === true ||
        song.is_public === 1 ||
        song.is_public === "1";

    const title = song.title || song.name || "esta música";

    const confirmed = window.confirm(
        isPublic
            ? `Desejas retirar "${title}" da Comunidade?`
            : `Desejas publicar "${title}" na Comunidade?`
    );

    if (!confirmed) {
        return;
    }

    const token = localStorage.getItem("access_token");

    if (!token) {
        showToast("A tua sessão expirou. Inicia sessão novamente.", "error");
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/community/${id}/publish`,
            {
                method: isPublic ? "DELETE" : "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            }
        );

        const data = await parseResponse(response);

        if (!response.ok || data?.success === false) {
            throw new Error(
                getErrorMessage(data, `Erro HTTP ${response.status}`)
            );
        }

        song.is_public = !isPublic;

        const query = songSearch?.value.trim().toLowerCase() || "";

        const visibleSongs = query
            ? allSongs.filter(item => {
                const itemTitle = String(item.title || item.name || "").toLowerCase();
                const prompt = String(item.prompt || "").toLowerCase();

                return itemTitle.includes(query) || prompt.includes(query);
            })
            : allSongs;

        renderSongs(visibleSongs);

        const communityPage = document.getElementById("page-comunidade");

        if (communityPage?.classList.contains("active")) {
            await loadCommunitySongs();
        }

        showToast(
            isPublic
                ? "Música retirada da Comunidade."
                : "Música publicada na Comunidade.",
            "success"
        );

    } catch (error) {
        console.error("Erro ao alterar publicação:", error);

        showToast(
            error.message || "Não foi possível atualizar a publicação.",
            "error"
        );

    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* ============================================================
   COMUNIDADE — CARREGAR MÚSICAS PUBLICADAS
   ============================================================ */

async function loadCommunitySongs() {
    const container = document.getElementById("communitySongsList");

    if (!container) {
        console.error("Comunidade: elemento communitySongsList não encontrado.");
        return;
    }

    container.innerHTML = `
        <div class="empty-state">
            <span class="material-icons">hourglass_empty</span>
            <p>A carregar músicas da comunidade...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/community`, {
            method: "GET",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(
                getErrorMessage(data, `Erro HTTP ${response.status}`)
            );
        }

        if (Array.isArray(data)) {
            communitySongs = data;
        } else if (Array.isArray(data?.songs)) {
            communitySongs = data.songs;
        } else if (Array.isArray(data?.music)) {
            communitySongs = data.music;
        } else if (Array.isArray(data?.data)) {
            communitySongs = data.data;
        } else if (Array.isArray(data?.items)) {
            communitySongs = data.items;
        } else {
            communitySongs = [];
        }

        renderCommunitySongs();

    } catch (error) {
        console.error("Erro ao carregar comunidade:", error);

        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">error_outline</span>
                <h3>Erro ao carregar comunidade</h3>
                <p>${escapeHtml(error.message || "Não foi possível obter as músicas publicadas.")}</p>
                <button
                    type="button"
                    onclick="loadCommunitySongs()"
                    class="btn-primary"
                >
                    Tentar novamente
                </button>
            </div>
        `;
    }
}


/* ============================================================
   COMUNIDADE — PESQUISAR E APRESENTAR
   ============================================================ */

function renderCommunitySongs() {
    const container = document.getElementById("communitySongsList");

    if (!container) {
        console.error("Comunidade: communitySongsList não encontrado.");
        return;
    }

    const query = communitySearch?.value.trim().toLowerCase() || "";

    const filteredSongs = communitySongs.filter(song => {
        const title = String(song.title || song.name || "").toLowerCase();

        const artist = String(
            song.owner_name ||
            song.artist_name ||
            song.user_name ||
            song.username ||
            ""
        ).toLowerCase();

        const prompt = String(song.prompt || "").toLowerCase();

        return (
            title.includes(query) ||
            artist.includes(query) ||
            prompt.includes(query)
        );
    });

    if (filteredSongs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">library_music</span>
                <h3>${query ? "Nenhum resultado encontrado" : "Nenhuma música publicada"}</h3>
                <p>
                    ${
                        query
                            ? "Tenta pesquisar por outro título ou artista."
                            : "As músicas públicas aparecerão aqui."
                    }
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    filteredSongs.forEach(song => {
        const songId = Number(song.id ?? song.song_id);

        const title = String(song.title || song.name || "Música sem título");

        const artist = String(
            song.owner_name ||
            song.artist_name ||
            song.user_name ||
            song.username ||
            "Artista"
        );

        const audioUrl = resolveAudioUrl(
            song.audio_url ||
            song.audioUrl ||
            song.url ||
            song.file_url ||
            song.fileUrl ||
            ""
        );

        const coverUrl = resolveAudioUrl(
            song.cover_url ||
            song.coverUrl ||
            ""
        );

        const card = document.createElement("div");

        card.className = "song-card community-song-card";

        const coverHTML = coverUrl
            ? `
                <img
                    src="${escapeAttribute(coverUrl)}"
                    alt="Capa da música"
                    loading="lazy"
                    onerror="this.style.display='none'"
                >
            `
            : `<span class="material-icons">music_note</span>`;

        card.innerHTML = `
            <div class="song-cover">
                ${coverHTML}
            </div>

            <div class="song-info">
                <h3 class="song-title">${escapeHtml(title)}</h3>

                <p class="song-artist">
                    <span class="material-icons">person</span>
                    ${escapeHtml(artist)}
                </p>

                <div class="song-actions">
                    <button
                        type="button"
                        class="icon-button community-play-btn"
                        title="Reproduzir música"
                        aria-label="Reproduzir música"
                        ${!audioUrl ? "disabled" : ""}
                    >
                        <span class="material-icons">play_arrow</span>
                    </button>

                    <button
                        type="button"
                        class="icon-button community-download-btn"
                        title="Descarregar música"
                        aria-label="Descarregar música"
                        ${!audioUrl ? "disabled" : ""}
                    >
                        <span class="material-icons">download</span>
                    </button>
                </div>
            </div>
        `;

        const playButton = card.querySelector(".community-play-btn");

        if (playButton && audioUrl) {
            playButton.addEventListener("click", () => {
                playSong(
                    encodeURIComponent(audioUrl),
                    encodeURIComponent(title),
                    encodeURIComponent(coverUrl),
                    Number.isSafeInteger(songId) && songId > 0
                        ? songId
                        : null
                );
            });
        }

        const downloadButton = card.querySelector(".community-download-btn");

        if (downloadButton && audioUrl) {
            downloadButton.addEventListener("click", () => {
                downloadAudio(audioUrl, title);
            });
        }

        container.appendChild(card);
    });

    console.log(
        `Comunidade: ${filteredSongs.length} músicas apresentadas.`
    );
}


/* ============================================================
   DOWNLOAD DE ÁUDIO
   ============================================================ */

async function downloadAudio(url, title = "StudioMusic") {
    const finalUrl = resolveAudioUrl(url);

    if (!finalUrl) {
        showToast("O endereço do áudio não é válido.", "error");
        return;
    }

    try {
        const response = await fetch(finalUrl);

        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        const filename = sanitizeFilename(title) || "StudioMusic";

        link.href = blobUrl;
        link.download = filename.toLowerCase().endsWith(".mp3")
            ? filename
            : `${filename}.mp3`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    } catch (error) {
        console.error("Download direto falhou:", error);

        window.open(finalUrl, "_blank", "noopener,noreferrer");
    }
}


/* ============================================================
   MINHA VOZ — SELECIONAR E PRÉ-VISUALIZAR ÁUDIO
   ============================================================ */

function initializeVoiceUpload() {
    const input = document.getElementById("voiceAudioInput");
    const selectButton = document.getElementById("selectVoiceBtn");
    const removeButton = document.getElementById("removeVoiceBtn");
    const info = document.getElementById("voiceAudioInfo");
    const filename = document.getElementById("voiceFileName");
    const preview = document.getElementById("voiceAudioPreview");

    if (!input || !selectButton || input.dataset.initialized === "true") {
        return;
    }

    input.dataset.initialized = "true";

    selectButton.addEventListener("click", () => input.click());

    input.addEventListener("change", () => {
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        if (!/\.(mp3|wav|m4a|webm)$/i.test(file.name)) {
            showToast(
                "Formato inválido. Seleciona MP3, WAV, M4A ou WebM.",
                "warning"
            );
            input.value = "";
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            showToast("O áudio não pode ultrapassar 20 MB.", "warning");
            input.value = "";
            return;
        }

        if (voicePreviewUrl) {
            URL.revokeObjectURL(voicePreviewUrl);
            voicePreviewUrl = null;
        }

        selectedVoiceFile = file;
        voicePreviewUrl = URL.createObjectURL(file);

        if (filename) {
            filename.textContent = file.name;
        }

        if (preview) {
            preview.src = voicePreviewUrl;
            preview.load();
        }

        if (info) {
            info.classList.remove("hidden");
        }

        showToast("Áudio carregado para pré-visualização.", "success");
    });

    if (removeButton) {
        removeButton.addEventListener("click", () => {
            selectedVoiceFile = null;
            input.value = "";

            if (preview) {
                preview.pause();
                preview.removeAttribute("src");
                preview.load();
            }

            if (voicePreviewUrl) {
                URL.revokeObjectURL(voicePreviewUrl);
                voicePreviewUrl = null;
            }

            if (info) {
                info.classList.add("hidden");
            }

            if (filename) {
                filename.textContent = "";
            }

            showToast("Áudio removido.", "info");
        });
    }
}


/* ============================================================
   HISTÓRICO — GUARDAR NO BACKEND
   ============================================================ */

async function saveSongToHistory(songId) {
    const id = Number(songId);
    const token = localStorage.getItem("access_token");

    if (!Number.isSafeInteger(id) || id <= 0 || !token) {
        console.warn("Histórico: ID da música ou token inválido.", {
            songId,
            hasToken: Boolean(token)
        });
        return false;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/music/${id}/history`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
            console.error(
                "Erro ao guardar histórico no backend:",
                response.status,
                data
            );
            return false;
        }

        console.log("Histórico guardado no banco de dados:", id, data);
        return true;

    } catch (error) {
        console.error("Erro de ligação ao guardar histórico:", error);
        return false;
    }
}


/* ============================================================
   HISTÓRICO LOCAL
   ============================================================ */

function getHistory() {
    const key = getUserStorageKey("history");

    if (!key) {
        return [];
    }

    try {
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (error) {
        console.error("Erro no histórico:", error);
        return [];
    }
}


function saveHistory(history) {
    const key = getUserStorageKey("history");

    if (!key) {
        showToast("Não foi possível identificar o utilizador.", "error");
        return;
    }

    localStorage.setItem(key, JSON.stringify(history));
}


function addToHistory(title, url, coverUrl = "") {
    if (!title || !url) {
        return;
    }

    let history = getHistory();

    if (
        history.length > 0 &&
        history[0].title === title &&
        history[0].url === url
    ) {
        if (coverUrl && !history[0].cover_url) {
            history[0].cover_url = coverUrl;
            saveHistory(history);
        }
        return;
    }

    history.unshift({
        title,
        url,
        cover_url: coverUrl,
        playedAt: new Date().toISOString()
    });

    history = history.slice(0, 50);

    saveHistory(history);
}


function loadHistory() {
    if (!historyList) {
        return;
    }

    const history = getHistory();

    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">history</span>
                <h3>Histórico vazio</h3>
                <p>As músicas reproduzidas aparecerão aqui.</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = history.map(item => {
        const title = escapeHtml(item.title);
        const url = item.url || "";
        const coverUrl = item.cover_url || "";

        return `
            <div class="song-card">
                <div class="song-card-icon">
                    <span class="material-icons">history</span>
                </div>

                <div class="song-card-info">
                    <h3>${title}</h3>
                    <small>${formatDate(item.playedAt)}</small>
                </div>

                <div class="song-card-actions">
                    ${
                        url
                            ? `
                                <button
                                    type="button"
                                    class="icon-button"
                                    title="Reproduzir"
                                    onclick="playSong('${encodeURIComponent(url)}','${encodeURIComponent(item.title)}','${encodeURIComponent(coverUrl)}')"
                                >
                                    <span class="material-icons">play_arrow</span>
                                </button>
                            `
                            : ""
                    }
                </div>
            </div>
        `;
    }).join("");
}


/* ============================================================
   HEALTH CHECK DA API
   ============================================================ */

async function checkAPI() {
    setAPIStatus("checking", "Verificando...");

    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        console.log("API Health:", data);

        if (data.stability_configured === false) {
            setAPIStatus("warning", "API online — IA não configurada");
        } else {
            setAPIStatus("online", "API online");
        }

    } catch (error) {
        console.error("API indisponível:", error);
        setAPIStatus("offline", "API offline");
    }
}


function setAPIStatus(status, text) {
    if (apiStatusText) {
        apiStatusText.textContent = text;
    }

    if (!apiStatusDot) {
        return;
    }

    apiStatusDot.classList.remove(
        "online",
        "offline",
        "warning",
        "checking"
    );

    apiStatusDot.classList.add(status);
}


/* ============================================================
   LETRA DA MÚSICA
   ============================================================ */

function initializeLyricsField() {
    if (!lyricsInput) {
        console.warn("Campo da letra não encontrado no HTML.");
        return;
    }

    /*
       Preservar a letra guardada anteriormente.
       O armazenamento continua local, como na versão original.
    */
    const savedLyrics = localStorage.getItem("studiomusic_lyrics");

    if (savedLyrics !== null) {
        lyricsInput.value = savedLyrics.slice(0, MAX_LYRICS_LENGTH);
    }

    lyricsInput.addEventListener("input", () => {
        if (lyricsInput.value.length > MAX_LYRICS_LENGTH) {
            lyricsInput.value = lyricsInput.value.slice(0, MAX_LYRICS_LENGTH);
        }

        updateLyricsCounter();

        localStorage.setItem(
            "studiomusic_lyrics",
            lyricsInput.value
        );
    });

    if (clearLyricsBtn) {
        clearLyricsBtn.addEventListener("click", () => {
            if (!lyricsInput.value.trim()) {
                return;
            }

            if (!window.confirm("Tens a certeza de que pretendes apagar a letra?")) {
                return;
            }

            lyricsInput.value = "";
            localStorage.removeItem("studiomusic_lyrics");

            updateLyricsCounter();
            lyricsInput.focus();
        });
    }

    updateLyricsCounter();
}


function updateLyricsCounter() {
    if (!lyricsInput || !lyricsCounter) {
        return;
    }

    const total = lyricsInput.value.length;

    lyricsCounter.textContent =
        `${total.toLocaleString("pt-PT")} / ` +
        `${MAX_LYRICS_LENGTH.toLocaleString("pt-PT")} caracteres`;
}


function getLyrics() {
    return lyricsInput ? lyricsInput.value.trim() : "";
}


function resetLyrics() {
    if (lyricsInput) {
        lyricsInput.value = "";
    }

    localStorage.removeItem("studiomusic_lyrics");

    updateLyricsCounter();
}


/* ============================================================
   PROMPT RÁPIDO
   ============================================================ */

function usePrompt(text) {
    const input = document.getElementById("prompt");

    if (!input) {
        return;
    }

    input.value = text;

    updatePromptCounter();
    input.focus();
}


/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
    return escapeHtml(value);
}


function sanitizeFilename(filename) {
    return String(filename || "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 120);
}


function formatDate(dateValue) {
    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}
/* ============================================================
   STUDIO MUSIC.AI
   HISTÓRICO SQLITE + GOSTOS + SEGUIR AUTORES
   ============================================================ */

let communityInteractionState = {
    likes: new Set(),
    following: new Set(),
    userId: null
};


/* ============================================================
   PEDIDOS AUTENTICADOS
   ============================================================ */

async function communityFetchAuthenticated(path, method = "GET") {
    const token = localStorage.getItem("access_token");

    if (!token) {
        throw new Error("Inicia sessão para utilizar esta funcionalidade.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
        }
    });

    const data = response.status === 204
        ? {}
        : await parseResponse(response);

    if (!response.ok || data?.success === false) {
        throw new Error(
            getErrorMessage(data, `Erro HTTP ${response.status}`)
        );
    }

    return data;
}


/* ============================================================
   ESTADO DOS GOSTOS E SEGUIDORES
   ============================================================ */

async function refreshCommunityInteractionState() {
    try {
        const state = await communityFetchAuthenticated(
            "/api/community/me/state"
        );

        communityInteractionState = {
            likes: new Set(
                (state.likes || []).map(Number)
            ),
            following: new Set(
                (state.following || []).map(Number)
            ),
            userId: Number(state.user_id)
        };

    } catch (error) {
        console.warn(
            "Não foi possível carregar gostos e seguidores:",
            error
        );

        communityInteractionState = {
            likes: new Set(),
            following: new Set(),
            userId: null
        };
    }
}


/* ============================================================
   CARREGAR COMUNIDADE COM ESTADO DO UTILIZADOR
   ============================================================ */

const originalLoadCommunitySongs = loadCommunitySongs;

loadCommunitySongs = async function () {
    await refreshCommunityInteractionState();

    return originalLoadCommunitySongs();
};

window.loadCommunitySongs = loadCommunitySongs;


/* ============================================================
   COMUNIDADE — APRESENTAR MÚSICAS
   ============================================================ */

renderCommunitySongs = function () {
    const container = document.getElementById(
        "communitySongsList"
    );

    if (!container) {
        return;
    }

    const query = communitySearch?.value.trim().toLowerCase() || "";

    const filteredSongs = communitySongs.filter(song => {
        const searchable = [
            song.title,
            song.name,
            song.owner_name,
            song.artist_name,
            song.user_name,
            song.username,
            song.prompt
        ].join(" ").toLowerCase();

        return searchable.includes(query);
    });

    if (filteredSongs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">library_music</span>

                <h3>
                    ${
                        query
                            ? "Nenhum resultado encontrado"
                            : "Nenhuma música publicada"
                    }
                </h3>

                <p>
                    ${
                        query
                            ? "Tenta pesquisar por outro título ou artista."
                            : "As músicas públicas aparecerão aqui."
                    }
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    filteredSongs.forEach(song => {
        const songId = Number(
            song.id ?? song.song_id
        );

        const authorId = Number(
            song.user_id ??
            song.owner_id ??
            song.author_id
        );

        const validSongId =
            Number.isSafeInteger(songId) &&
            songId > 0;

        const validAuthorId =
            Number.isSafeInteger(authorId) &&
            authorId > 0;

        const isOwnSong =
            validAuthorId &&
            authorId === communityInteractionState.userId;

        const liked = communityInteractionState.likes.has(
            songId
        );

        const following = communityInteractionState.following.has(
            authorId
        );

        const title = String(
            song.title ||
            song.name ||
            "Música sem título"
        );

        const artist = String(
            song.owner_name ||
            song.artist_name ||
            song.user_name ||
            song.username ||
            "Artista"
        );

        const audioUrl = resolveAudioUrl(
            song.audio_url ||
            song.audioUrl ||
            song.url ||
            song.file_url ||
            song.fileUrl ||
            ""
        );

        const coverUrl = resolveAudioUrl(
            song.cover_url ||
            song.coverUrl ||
            ""
        );

        const card = document.createElement("div");

        card.className = "song-card community-song-card";

        card.innerHTML = `
            <div class="song-cover">
                ${
                    coverUrl
                        ? `
                            <img
                                src="${escapeAttribute(coverUrl)}"
                                alt="Capa de ${escapeAttribute(title)}"
                                loading="lazy"
                                onerror="this.style.display='none'"
                            >
                        `
                        : `
                            <span class="material-icons">
                                music_note
                            </span>
                        `
                }
            </div>

            <div class="song-info">
                <h3 class="song-title">
                    ${escapeHtml(title)}
                </h3>

                <p class="song-artist">
                    <span class="material-icons">person</span>
                    ${escapeHtml(artist)}
                </p>

                <div class="song-actions">

                    <button
                        type="button"
                        class="icon-button community-play-btn"
                        title="Reproduzir música"
                        ${!audioUrl ? "disabled" : ""}
                    >
                        <span class="material-icons">
                            play_arrow
                        </span>
                    </button>

                    <button
                        type="button"
                        class="icon-button community-download-btn"
                        title="Descarregar música"
                        ${!audioUrl ? "disabled" : ""}
                    >
                        <span class="material-icons">
                            download
                        </span>
                    </button>

                    ${
                        validSongId
                            ? `
                                <button
                                    type="button"
                                    class="icon-button community-like-btn ${liked ? "is-liked" : ""}"
                                    title="${liked ? "Retirar gosto" : "Gostar"}"
                                    aria-pressed="${liked}"
                                >
                                    <span class="material-icons">
                                        ${
                                            liked
                                                ? "favorite"
                                                : "favorite_border"
                                        }
                                    </span>

                                    <span class="like-count">
                                        ${Number(song.likes_count) || 0}
                                    </span>
                                </button>
                            `
                            : ""
                    }

                    ${
                        validAuthorId && !isOwnSong
                            ? `
                                <button
                                    type="button"
                                    class="community-follow-btn"
                                    aria-pressed="${following}"
                                >
                                    <span class="material-icons">
                                        ${
                                            following
                                                ? "person_remove"
                                                : "person_add"
                                        }
                                    </span>

                                    <span class="follow-label">
                                        ${
                                            following
                                                ? "Deixar de seguir"
                                                : "Seguir"
                                        }
                                    </span>
                                </button>
                            `
                            : ""
                    }

                </div>
            </div>
        `;

        /* REPRODUZIR */

        const playButton = card.querySelector(
            ".community-play-btn"
        );

        if (playButton && audioUrl) {
            playButton.addEventListener("click", () => {
                playSong(
                    encodeURIComponent(audioUrl),
                    encodeURIComponent(title),
                    encodeURIComponent(coverUrl),
                    validSongId ? songId : null
                );
            });
        }

        /* DESCARREGAR */

        const downloadButton = card.querySelector(
            ".community-download-btn"
        );

        if (downloadButton && audioUrl) {
            downloadButton.addEventListener("click", () => {
                downloadAudio(audioUrl, title);
            });
        }

        /* GOSTAR / RETIRAR GOSTO */

        const likeButton = card.querySelector(
            ".community-like-btn"
        );

        if (likeButton) {
            likeButton.addEventListener("click", async () => {
                likeButton.disabled = true;

                try {
                    const alreadyLiked =
                        communityInteractionState.likes.has(songId);

                    const result = await communityFetchAuthenticated(
                        `/api/community/${songId}/like`,
                        alreadyLiked ? "DELETE" : "POST"
                    );

                    if (result.liked) {
                        communityInteractionState.likes.add(songId);
                    } else {
                        communityInteractionState.likes.delete(songId);
                    }

                    song.likes_count = result.likes_count;

                    renderCommunitySongs();

                } catch (error) {
                    console.error("Erro ao gostar:", error);

                    showToast(
                        error.message || "Não foi possível actualizar o gosto.",
                        "error"
                    );

                } finally {
                    likeButton.disabled = false;
                }
            });
        }

        /* SEGUIR / DEIXAR DE SEGUIR */

        const followButton = card.querySelector(
            ".community-follow-btn"
        );

        if (followButton) {
            followButton.addEventListener("click", async () => {
                followButton.disabled = true;

                try {
                    const alreadyFollowing =
                        communityInteractionState.following.has(authorId);

                    const result = await communityFetchAuthenticated(
                        `/api/community/users/${authorId}/follow`,
                        alreadyFollowing ? "DELETE" : "POST"
                    );

                    if (result.following) {
                        communityInteractionState.following.add(authorId);
                    } else {
                        communityInteractionState.following.delete(authorId);
                    }

                    renderCommunitySongs();

                } catch (error) {
                    console.error("Erro ao seguir autor:", error);

                    showToast(
                        error.message || "Não foi possível actualizar a relação.",
                        "error"
                    );

                } finally {
                    followButton.disabled = false;
                }
            });
        }

        container.appendChild(card);
    });
};

window.renderCommunitySongs = renderCommunitySongs;


/* ============================================================
   HISTÓRICO PERMANENTE — SQLITE
   ============================================================ */

loadHistory = async function () {
    if (!historyList) {
        return;
    }

    historyList.innerHTML = `
        <div class="empty-state">
            <span class="material-icons">hourglass_empty</span>
            <p>A carregar histórico...</p>
        </div>
    `;

    try {
        const data = await communityFetchAuthenticated(
            "/api/music/history/list"
        );

        const history = Array.isArray(data)
            ? data
            : (
                data.history ||
                data.songs ||
                data.data ||
                []
            );

        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons">history</span>
                    <h3>Histórico vazio</h3>
                    <p>
                        As músicas reproduzidas aparecerão aqui.
                    </p>
                </div>
            `;

            return;
        }

        historyList.innerHTML = history.map(item => {
            const id = Number(
                item.id ?? item.song_id
            );

            const validId =
                Number.isSafeInteger(id) &&
                id > 0;

            const title = String(
                item.title ||
                item.name ||
                "Música sem título"
            );

            const url = resolveAudioUrl(
                item.audio_url ||
                item.audioUrl ||
                item.url ||
                ""
            );

            const cover = resolveAudioUrl(
                item.cover_url ||
                item.coverUrl ||
                ""
            );

            const playedAt =
                item.played_at ||
                item.playedAt ||
                item.created_at;

            return `
                <div class="song-card">

                    <div class="song-card-icon">
                        <span class="material-icons">
                            history
                        </span>
                    </div>

                    <div class="song-card-info">
                        <h3>${escapeHtml(title)}</h3>

                        <small>
                            ${formatDate(playedAt)}
                        </small>
                    </div>

                    <div class="song-card-actions">
                        ${
                            url
                                ? `
                                    <button
                                        type="button"
                                        class="icon-button"
                                        title="Reproduzir"
                                        onclick="playSong(
                                            '${encodeURIComponent(url)}',
                                            '${encodeURIComponent(title)}',
                                            '${encodeURIComponent(cover)}',
                                            ${validId ? id : "null"}
                                        )"
                                    >
                                        <span class="material-icons">
                                            play_arrow
                                        </span>
                                    </button>
                                `
                                : ""
                        }
                    </div>

                </div>
            `;
        }).join("");

    } catch (error) {
        console.error(
            "Erro ao carregar histórico SQLite:",
            error
        );

        historyList.innerHTML = `
            <div class="empty-state">
                <span class="material-icons">
                    error_outline
                </span>

                <h3>Erro ao carregar histórico</h3>

                <p>
                    ${escapeHtml(error.message)}
                </p>
            </div>
        `;
    }
};

/* ============================================================
   PESQUISA DA COMUNIDADE
   StudioMusic.AI
   ============================================================ */

async  function iniciarPesquisaComunidade() {
        const campoPesquisa = document.getElementById("communitySearch");

        if (!campoPesquisa) {
            console.warn(
                "Pesquisa da comunidade: campo #communitySearch não encontrado."
            );
            return;
        }

        // Evitar registar o mesmo evento várias vezes.
        if (campoPesquisa.dataset.searchInitialized === "true") {
            return;
        }

        campoPesquisa.dataset.searchInitialized = "true";

        // Pesquisar enquanto o utilizador escreve.
        campoPesquisa.addEventListener("input", function () {
            if (typeof window.renderCommunitySongs === "function") {
                window.renderCommunitySongs();
            } else {
                console.error(
                    "A função renderCommunitySongs() não está disponível."
                );
            }
        });

        // Limpar a pesquisa com a tecla Escape.
        campoPesquisa.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                campoPesquisa.value = "";

                if (typeof window.renderCommunitySongs === "function") {
                    window.renderCommunitySongs();
                }
            }
        });

        console.log("Pesquisa da comunidade activada.");
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            iniciarPesquisaComunidade
        );
    } else {
        iniciarPesquisaComunidade();
    };
/* ============================================================
   EXPORTAR FUNÇÕES PARA O HTML
   ============================================================ */

window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.showPage = showPage;
window.generateMusic = generateMusic;
window.playSong = playSong;
window.deleteSong = deleteSong;
window.toggleFavorite = toggleFavorite;
window.loadFavorites = loadFavorites;
window.loadHistory = loadHistory;
window.loadSongs = loadSongs;
window.usePrompt = usePrompt;
window.showToast = showToast;
window.checkAPI = checkAPI;
window.logout = logout;

window.toggleSongPublication = toggleSongPublication;
window.loadCommunitySongs = loadCommunitySongs;
window.renderCommunitySongs = renderCommunitySongs;

window.initializeVoiceUpload = initializeVoiceUpload;
window.getLyrics = getLyrics;
window.resetLyrics = resetLyrics;
window.downloadAudio = downloadAudio;

