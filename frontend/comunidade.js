"use strict";

/* StudioMusic.AI — Comunidade pública
   API usada: GET /api/community
   Likes: GET /api/community/me/state, POST/DELETE /api/community/{id}/like
*/
(() => {
  const API = String(window.STUDIOMUSIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const $ = id => document.getElementById(id);
  let songs = [];
  let queue = [];
  let currentIndex = -1;
  let likedIds = new Set();
  let audio = null;
  let toastTimer = null;
  let selectedCategory = "todos";

  const token = () => localStorage.getItem("access_token") || sessionStorage.getItem("access_token") || "";
  const headers = (json = false) => {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (token()) h.Authorization = `Bearer ${token()}`;
    return h;
  };
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const mediaURL = value => {
    if (typeof value !== "string" || !value.trim()) return "";
    try { const u = new URL(value.trim(), API); return ["http:","https:"].includes(u.protocol) ? u.href : ""; }
    catch { return ""; }
  };
  const songId = song => Number(song.id ?? song.song_id);
  const titleOf = song => song.title || song.name || song.song_title || `Música #${song.id ?? ""}`;
  const artistOf = song => song.owner_name || song.username || song.creator_name || song.author_name || "Artista StudioMusic";
  const audioURL = song => mediaURL(song.audio_url || song.url || song.audioUrl || "");
  const coverURL = song => mediaURL(song.cover_url || song.coverUrl || "");

  async function request(path, options = {}) {
    const response = await fetch(API + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.message || `Erro HTTP ${response.status}`);
    return data;
  }

  function notify(message, type = "info") {
    let el = $("communityToast");
    if (!el) {
      el = document.createElement("div"); el.id = "communityToast";
      el.className = "community-toast"; document.body.appendChild(el);
    }
    el.textContent = message; el.dataset.type = type; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function categoryMatches(song) {
    if (selectedCategory === "todos") return true;
    const text = `${song.genre || ""} ${song.category || ""} ${song.prompt || ""} ${song.title || ""}`.toLowerCase();
    const terms = {
      gospel:["gospel","louvor","adoração","adoracao","cristã","crista"],
      kizomba:["kizomba"], semba:["semba"],
      "hip-hop":["hip-hop","hip hop","rap","trap"],
      "r&b":["r&b","rnb","rhythm and blues"], pop:["pop"],
      afrobeat:["afrobeat","afro beat","afropop"]
    };
    if (selectedCategory === "outros") return !Object.values(terms).flat().some(t => text.includes(t));
    return (terms[selectedCategory] || []).some(t => text.includes(t));
  }

  function createCard(song) {
    const id = songId(song), title = titleOf(song), artist = artistOf(song);
    const cover = coverURL(song), playable = !!audioURL(song);
    const liked = likedIds.has(id) || song.liked_by_me === true;
    const count = Number(song.likes_count || 0);
    const card = document.createElement("article"); card.className = "community-card"; card.dataset.songId = String(id);
    card.innerHTML = `
      <div class="community-cover">
        ${cover ? `<img src="${escapeHTML(cover)}" alt="Capa de ${escapeHTML(title)}" loading="lazy">` : '<span class="material-icons community-cover-placeholder">music_note</span>'}
        <button type="button" class="community-play" aria-label="Reproduzir" title="Reproduzir" ${playable ? "" : "disabled"}><span class="material-icons">play_arrow</span></button>
      </div>
      <div class="community-card-body">
        <h3 class="community-song-title">${escapeHTML(title)}</h3>
        <div class="community-creator"><span class="material-icons">account_circle</span><span>${escapeHTML(artist)}</span></div>
        <div class="community-card-footer">
          <span class="community-stat"><span class="material-icons">music_note</span>${escapeHTML(song.genre || song.category || "Música")}</span>
          <div class="community-actions">
            <button type="button" class="community-action-button like-button ${liked ? "liked" : ""}" title="Gostar" aria-label="Gostar desta música" aria-pressed="${liked}"><span class="material-icons">${liked ? "favorite" : "favorite_border"}</span><span class="like-count">${count}</span></button>
            <button type="button" class="community-action-button share-button" title="Partilhar música" aria-label="Partilhar música"><span class="material-icons">share</span><span class="share-label">Partilhar</span></button>
          </div>
        </div>
      </div>`;
    card.querySelector(".community-play").addEventListener("click", () => playSong(song, queue));
    card.querySelector(".like-button").addEventListener("click", e => toggleLike(song, e.currentTarget));
    card.querySelector(".share-button").addEventListener("click", () => shareSong(song));
    const img = card.querySelector("img");
    img?.addEventListener("error", () => { img.remove(); const p = document.createElement("span"); p.className = "material-icons community-cover-placeholder"; p.textContent = "music_note"; card.querySelector(".community-cover").prepend(p); }, {once:true});
    return card;
  }

  function renderSongs() {
    const container = $("communitySongs"), empty = $("communityEmpty");
    if (!container) return;
    const query = ($("communitySearch")?.value || "").trim().toLowerCase();
    const filtered = songs.filter(song => `${titleOf(song)} ${artistOf(song)} ${song.genre || ""} ${song.prompt || ""}`.toLowerCase().includes(query) && categoryMatches(song));
    container.innerHTML = "";
    if (!filtered.length) {
      if (empty) { empty.style.display = "block"; const h = empty.querySelector("h3"), p = empty.querySelector("p"); if (h) h.textContent = songs.length ? "Nenhuma música encontrada" : "Ainda não existem músicas públicas"; if (p) p.textContent = songs.length ? "Experimente outra pesquisa ou categoria." : "Quando forem publicadas músicas concluídas, aparecerão aqui."; }
      return;
    }
    if (empty) empty.style.display = "none";
    const frag = document.createDocumentFragment(); filtered.forEach(s => frag.appendChild(createCard(s))); container.appendChild(frag);
    queue = filtered;
  }

  async function loadLikeState() {
    if (!token()) return;
    try {
      const state = await request("/api/community/me/state");
      likedIds = new Set((state.likes || []).map(Number));
    } catch (e) { console.warn("Não foi possível carregar os gostos do utilizador:", e.message); }
  }

  async function loadSongs() {
    const empty = $("communityEmpty");
    if (empty) { empty.style.display = "block"; empty.querySelector("h3").textContent = "A carregar músicas..."; empty.querySelector("p").textContent = "A contactar o servidor StudioMusic.AI."; }
    try {
      const data = await request("/api/community");
      songs = Array.isArray(data) ? data : (data.songs || data.items || data.music || data.data || []);
      if (!Array.isArray(songs)) throw new Error("Formato de resposta inválido.");
      await loadLikeState(); renderSongs();
      const sharedId = Number(new URLSearchParams(window.location.search).get("musica"));
      if (Number.isSafeInteger(sharedId) && sharedId > 0) {
        const sharedCard = document.querySelector(`.community-card[data-song-id="${sharedId}"]`);
        if (sharedCard) { sharedCard.classList.add("community-shared-highlight"); sharedCard.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }
    } catch (e) {
      console.error(e); songs = []; renderSongs();
      if (empty) { empty.style.display = "block"; empty.querySelector("h3").textContent = "Não foi possível carregar a comunidade"; empty.querySelector("p").textContent = `${e.message}. Confirme se o backend está activo.`; }
    }
  }

  async function toggleLike(song, button) {
    if (!token()) { notify("Inicia sessão para gostar desta música.", "error"); return; }
    const id = songId(song); if (!Number.isSafeInteger(id) || id <= 0) return;
    const wasLiked = likedIds.has(id) || song.liked_by_me === true;
    button.disabled = true;
    try {
      const result = await request(`/api/community/${id}/like`, { method: wasLiked ? "DELETE" : "POST" });
      if (result.liked) likedIds.add(id); else likedIds.delete(id);
      song.liked_by_me = !!result.liked;
      if (typeof result.likes_count === "number") song.likes_count = result.likes_count;
      renderSongs();
      notify(result.liked ? "Adicionaste um gosto a esta música." : "Retiraste o teu gosto.", "success");
    } catch (e) { notify(e.message || "Não foi possível registar o gosto.", "error"); button.disabled = false; }
  }

  function getSongShareData(song) {
    const url = new URL(window.location.href);
    url.searchParams.set("musica", String(songId(song)));
    const title = titleOf(song);
    const artist = artistOf(song);
    const text = `Ouve "${title}" de ${artist} na comunidade StudioMusic.AI:`;
    return { url: url.href, title, text, fullText: `${text} ${url.href}` };
  }

  async function copyShareLink(url) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url; field.setAttribute("readonly", "");
        field.style.position = "fixed"; field.style.opacity = "0";
        document.body.appendChild(field); field.select();
        const copied = document.execCommand("copy"); field.remove();
        if (!copied) throw new Error("Cópia não suportada neste navegador.");
      }
      notify("Link da música copiado. Já podes colá-lo noutra aplicação.", "success");
    } catch (e) {
      window.prompt("Copia o link da música:", url);
    }
  }

  function openShareWindow(url) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) notify("O navegador bloqueou a janela. Permite pop-ups ou copia o link.", "error");
  }

  function showShareOptions(song) {
    const data = getSongShareData(song);
    let modal = $("communityShareModal");
    if (!modal) {
      modal = document.createElement("div"); modal.id = "communityShareModal";
      modal.className = "community-share-overlay";
      modal.innerHTML = `
        <section class="community-share-dialog" role="dialog" aria-modal="true" aria-labelledby="communityShareTitle">
          <button type="button" class="community-share-close" aria-label="Fechar">×</button>
          <span class="material-icons community-share-symbol">share</span>
          <h3 id="communityShareTitle">Partilhar música</h3>
          <p class="community-share-description"></p>
          <div class="community-share-grid">
            <button type="button" data-share="whatsapp"><span class="material-icons">chat</span><span>WhatsApp</span></button>
            <button type="button" data-share="telegram"><span class="material-icons">send</span><span>Telegram</span></button>
            <button type="button" data-share="facebook"><span class="material-icons">public</span><span>Facebook</span></button>
            <button type="button" data-share="x"><span class="material-icons">alternate_email</span><span>X</span></button>
            <button type="button" data-share="native"><span class="material-icons">ios_share</span><span>Mais opções</span></button>
            <button type="button" data-share="copy"><span class="material-icons">content_copy</span><span>Copiar link</span></button>
          </div>
          <div class="community-share-link"><input type="text" readonly aria-label="Link da música"><button type="button" data-share="copy" aria-label="Copiar link"><span class="material-icons">content_copy</span></button></div>
        </section>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", async e => {
        if (e.target === modal || e.target.closest(".community-share-close")) { modal.classList.remove("active"); return; }
        const button = e.target.closest("[data-share]"); if (!button) return;
        const action = button.dataset.share;
        const current = modal._shareData; if (!current) return;
        const encodedText = encodeURIComponent(current.fullText);
        const encodedUrl = encodeURIComponent(current.url);
        if (action === "copy") { await copyShareLink(current.url); modal.classList.remove("active"); }
        else if (action === "whatsapp") openShareWindow(`https://wa.me/?text=${encodedText}`);
        else if (action === "telegram") openShareWindow(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(current.text)}`);
        else if (action === "facebook") openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`);
        else if (action === "x") openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(current.text)}&url=${encodedUrl}`);
        else if (action === "native") {
          if (navigator.share) { try { await navigator.share({title:current.title,text:current.text,url:current.url}); modal.classList.remove("active"); } catch (err) { if (err.name !== "AbortError") notify("Não foi possível abrir a partilha do dispositivo.", "error"); } }
          else notify("Escolhe uma das plataformas ou copia o link.");
        }
      });
    }
    modal._shareData = data;
    modal.querySelector(".community-share-description").textContent = `${data.title} — ${artistOf(song)}`;
    modal.querySelector(".community-share-link input").value = data.url;
    modal.classList.add("active");
  }

  async function shareSong(song) {
    if (!song || !Number.isSafeInteger(songId(song)) || songId(song) <= 0) {
      notify("Não foi possível identificar esta música para partilhar.", "error"); return;
    }
    showShareOptions(song);
  }

  function formatTime(seconds) { if (!Number.isFinite(seconds)) return "0:00"; const s = Math.floor(seconds); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
  function updateProgress() {
    if (!audio) return;
    const range = $("communitySeek"), current = $("communityCurrentTime"), duration = $("communityDuration");
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    if (range) range.value = String(pct);
    if (current) current.textContent = formatTime(audio.currentTime);
    if (duration) duration.textContent = formatTime(audio.duration);
  }
  function syncPlayButtons() {
    const playing = !!audio && !audio.paused;
    document.querySelectorAll(".community-play").forEach(btn => {
      const card = btn.closest(".community-card");
      const title = card?.querySelector(".community-song-title")?.textContent;
      const isCurrent = currentIndex >= 0 && title === titleOf(queue[currentIndex]);
      btn.innerHTML = `<span class="material-icons">${playing && isCurrent ? "pause" : "play_arrow"}</span>`;
      btn.title = playing && isCurrent ? "Pausar" : "Reproduzir";
    });
    const main = $("communityTogglePlay"); if (main) main.innerHTML = `<span class="material-icons">${playing ? "pause" : "play_arrow"}</span>`;
  }
  function playSong(song, list = queue) {
    const id = songId(song); const sourceList = Array.isArray(list) && list.length ? list : songs;
    queue = sourceList; currentIndex = queue.findIndex(s => songId(s) === id);
    if (currentIndex < 0) { queue = songs; currentIndex = queue.findIndex(s => songId(s) === id); }
    const url = audioURL(song); if (!url) { notify("O endereço do áudio não está disponível.", "error"); return; }
    if (!audio) audio = $("communityAudio");
    if (!audio) return;
    $("communityPlayerTitle").textContent = titleOf(song); $("communityPlayerArtist").textContent = artistOf(song);
    const cover = $("communityPlayerCover"); if (cover) { const c = coverURL(song); cover.innerHTML = c ? `<img src="${escapeHTML(c)}" alt="">` : '<span class="material-icons">music_note</span>'; }
    audio.src = url; audio.load(); $("communityPlayer")?.classList.add("active");
    audio.play().then(syncPlayButtons).catch(e => { console.error(e); notify("O navegador não conseguiu reproduzir esta música.", "error"); });
  }
  function togglePlayback() { if (!audio || !audio.src) { if (queue.length) playSong(queue[0], queue); return; } if (audio.paused) audio.play().catch(() => notify("Não foi possível continuar a reprodução.", "error")); else audio.pause(); syncPlayButtons(); }
  function skip(seconds) { if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds)); }
  function playRelative(step) { if (!queue.length || currentIndex < 0) return; const next = currentIndex + step; if (next < 0 || next >= queue.length) return; playSong(queue[next], queue); }
  function closePlayer() { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } $("communityPlayer")?.classList.remove("active"); syncPlayButtons(); }

  function installPlayerControls() {
    const player = $("communityPlayer"), audioEl = $("communityAudio"); if (!player || !audioEl) return;
    audio = audioEl; audio.controls = false;
    let controls = $("communityPlayerControls");
    if (!controls) {
      controls = document.createElement("div"); controls.id = "communityPlayerControls"; controls.className = "community-player-controls";
      controls.innerHTML = `
        <div class="community-player-buttons">
          <button type="button" id="communityPrevious" title="Música anterior"><span class="material-icons">skip_previous</span></button>
          <button type="button" id="communityBack10" title="Recuar 10 segundos"><span class="material-icons">replay_10</span></button>
          <button type="button" id="communityTogglePlay" class="main-play" title="Play/Pause"><span class="material-icons">play_arrow</span></button>
          <button type="button" id="communityForward10" title="Avançar 10 segundos"><span class="material-icons">forward_10</span></button>
          <button type="button" id="communityNext" title="Próxima música"><span class="material-icons">skip_next</span></button>
        </div>
        <div class="community-player-timeline"><span id="communityCurrentTime">0:00</span><input id="communitySeek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Posição da música"><span id="communityDuration">0:00</span></div>`;
      audioEl.insertAdjacentElement("afterend", controls);
    }
    $("communityPrevious")?.addEventListener("click", () => playRelative(-1));
    $("communityNext")?.addEventListener("click", () => playRelative(1));
    $("communityBack10")?.addEventListener("click", () => skip(-10));
    $("communityForward10")?.addEventListener("click", () => skip(10));
    $("communityTogglePlay")?.addEventListener("click", togglePlayback);
    $("communitySeek")?.addEventListener("input", e => { if (audio?.duration) audio.currentTime = audio.duration * Number(e.target.value) / 100; });
    audio.addEventListener("timeupdate", updateProgress); audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("play", syncPlayButtons); audio.addEventListener("pause", syncPlayButtons);
    audio.addEventListener("ended", () => { if (currentIndex < queue.length - 1) playRelative(1); else syncPlayButtons(); });
  }

  function initCategories() {
    document.querySelectorAll(".category-button").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll(".category-button").forEach(b => b.classList.remove("active")); btn.classList.add("active"); selectedCategory = btn.dataset.category || "todos"; renderSongs();
    }));
  }
  function initSidebar() {
    window.toggleSidebar = () => { const open = $("sidebar")?.classList.toggle("open"); $("menuOverlay")?.classList.toggle("active", !!open); $("menuButton")?.setAttribute("aria-expanded", String(!!open)); };
    window.closeSidebar = () => { $("sidebar")?.classList.remove("open"); $("menuOverlay")?.classList.remove("active"); $("menuButton")?.setAttribute("aria-expanded", "false"); };
  }
  function initMenus() {
    const btn = $("userMenuButton"), dropdown = $("userDropdown");
    btn?.addEventListener("click", () => { const hidden = dropdown.classList.toggle("hidden"); btn.setAttribute("aria-expanded", String(!hidden)); });
    document.addEventListener("click", e => { if (!e.target.closest(".user-menu-container")) { dropdown?.classList.add("hidden"); btn?.setAttribute("aria-expanded", "false"); } });
    $("communityLogout")?.addEventListener("click", e => { e.preventDefault(); localStorage.removeItem("access_token"); sessionStorage.removeItem("access_token"); window.location.href = "login.html"; });
  }
  async function checkAPI() {
    try { await request("/api/health"); $("apiStatusDot")?.classList.add("online"); if ($("apiStatusText")) $("apiStatusText").textContent = "Online"; }
    catch { $("apiStatusDot")?.classList.remove("online"); if ($("apiStatusText")) $("apiStatusText").textContent = "Offline"; }
  }
  function initialize() {
    installPlayerControls(); initCategories(); initSidebar(); initMenus();
    $("communitySearch")?.addEventListener("input", renderSongs);
    window.closeCommunityPlayer = closePlayer; window.loadCommunitySongs = loadSongs; window.checkAPI = async () => { await checkAPI(); await loadSongs(); };
    checkAPI(); loadSongs();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, {once:true}); else initialize();
})();
