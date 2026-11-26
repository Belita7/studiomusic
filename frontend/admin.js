"use strict";

/* =========================================================
   STUDIOMUSIC.AI — PAINEL ADMINISTRATIVO
   Compatível com o admin.html adaptado
   ========================================================= */

const ADMIN_API = "https://studiomusic.onrender.com";

const $ = id => document.getElementById(id);

const state = {
    users: [],
    songs: [],
    payments: [],
    me: null,
    supportTickets: [],
    selectedSupport: null,
    current: "overview",
    busy: false
};

const token = () => localStorage.getItem("access_token");

const yes = value =>
    value === true || value === 1 || value === "1";

const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

function fmtDate(value) {
    if (!value) return "—";

    const date = new Date(
        /Z$|[+-]\d{2}:\d{2}$/.test(String(value))
            ? value
            : `${value}Z`
    );

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function money(value) {
    return `${Number(value || 0).toLocaleString("pt-PT", {
        maximumFractionDigits: 2
    })} Kz`;
}

function set(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value ?? "";
    }
}

function icon(name) {
    return `
        <span class="material-icons-round" aria-hidden="true">
            ${esc(name)}
        </span>
    `;
}

function badge(label, type = "") {
    return `
        <span class="badge status-${esc(type)}">
            ${esc(label)}
        </span>
    `;
}

function action(name, id, glyph, title) {
    return `
        <button
            type="button"
            class="icon-btn admin-action"
            data-action="${esc(name)}"
            data-id="${Number(id)}"
            title="${esc(title)}"
            aria-label="${esc(title)}">

            ${icon(glyph)}

        </button>
    `;
}

function statusLabel(status) {
    const labels = {
        completed: "Concluída",
        pending: "Pendente",
        processing: "Em processamento",
        generating: "Em processamento",
        failed: "Falhou",
        confirmed: "Confirmado",
        rejected: "Rejeitado",
        cancelled: "Cancelado",
        open: "Aberto",
        in_progress: "Em análise",
        waiting_user: "A aguardar utilizador",
        resolved: "Resolvido",
        closed: "Fechado"
    };

    return labels[status] || status || "—";
}


/* =========================================================
   PEDIDOS AO BACKEND
   ========================================================= */

async function request(path, options = {}) {
    const headers = {
        Authorization: `Bearer ${token() || ""}`,
        ...(options.body !== undefined &&
           options.body !== null
            ? { "Content-Type": "application/json" }
            : {}),
        ...options.headers
    };

    const response = await fetch(`${ADMIN_API}${path}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        let message = `Erro HTTP ${response.status}`;

        try {
            const data = await response.json();

            if (data.detail) {
                message = Array.isArray(data.detail)
                    ? data.detail.map(item => item.msg).join("; ")
                    : String(data.detail);
            } else if (data.message) {
                message = data.message;
            }
        } catch {
            // Mantém a mensagem HTTP original.
        }

        throw new Error(message);
    }

    if (options.responseType === "blob") {
        return response.blob();
    }

    if (response.status === 204) {
        return null;
    }

    const text = await response.text();

    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}


/* =========================================================
   NOTIFICAÇÕES
   ========================================================= */

function toast(message, error = false) {
    const region = $("toastRegion");

    if (!region) {
        console[error ? "error" : "log"](message);
        return;
    }

    const item = document.createElement("div");

    item.className = `toast ${error ? "error" : "success"}`;
    item.textContent = message;

    region.appendChild(item);

    setTimeout(() => item.remove(), 4500);
}


/* =========================================================
   MENU HAMBÚRGUER
   ========================================================= */

function initHamburgerMenu() {
    const appShell = $("appShell") ||
        document.querySelector(".app-shell");

    const sidebar = $("sidebar");
    const button = $("menuToggle");
    const menuIcon = $("menuIcon");
    const overlay = $("menuOverlay");

    if (!appShell || !sidebar || !button) {
        console.error(
            "Menu: verifica appShell, sidebar e menuToggle no HTML."
        );
        return;
    }

    const isMobile = () =>
        window.matchMedia("(max-width: 768px)").matches;

    function updateButton(open) {
        button.setAttribute("aria-expanded", String(open));

        button.setAttribute(
            "aria-label",
            open ? "Fechar menu" : "Abrir menu"
        );

        button.title = open ? "Fechar menu" : "Abrir menu";

        if (menuIcon) {
            menuIcon.textContent = open ? "close" : "menu";
        }
    }

    function openMenu() {
        if (isMobile()) {
            sidebar.classList.add("open");
            appShell.classList.add("menu-open");
        } else {
            sidebar.classList.remove("open");
            appShell.classList.remove("menu-collapsed");
        }

        updateButton(true);
    }

    function closeMenu() {
        sidebar.classList.remove("open");
        appShell.classList.remove("menu-open");

        if (!isMobile()) {
            appShell.classList.add("menu-collapsed");
        }

        updateButton(false);
    }

    function toggleMenu() {
        const opened = isMobile()
            ? sidebar.classList.contains("open")
            : !appShell.classList.contains("menu-collapsed");

        opened ? closeMenu() : openMenu();
    }

    button.addEventListener("click", toggleMenu);

    overlay?.addEventListener("click", closeMenu);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => {
        sidebar.classList.remove("open");
        appShell.classList.remove("menu-open");
        appShell.classList.remove("menu-collapsed");

        updateButton(!isMobile());
    });

    if (isMobile()) {
        closeMenu();
    } else {
        openMenu();
    }
}


/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

function showView(view) {
    const target = $(`view-${view}`);

    if (!target) return;

    state.current = view;

    document.querySelectorAll(".view").forEach(section => {
        section.classList.toggle(
            "active",
            section.id === `view-${view}`
        );
    });

    document.querySelectorAll(".side-nav [data-view]").forEach(item => {
        item.classList.toggle(
            "active",
            item.dataset.view === view
        );
    });

    const titles = {
        overview: "Painel geral",
        users: "Utilizadores",
        music: "Painel de músicas",
        payments: "Pagamentos",
        community: "Comunidade",
        statistics: "Estatísticas",
        support: "Suporte"
    };

    set("pageTitle", titles[view] || "Administração");

    if (window.matchMedia("(max-width: 768px)").matches) {
        $("sidebar")?.classList.remove("open");
        $("appShell")?.classList.remove("menu-open");

        $("menuToggle")?.setAttribute("aria-expanded", "false");

        if ($("menuIcon")) {
            $("menuIcon").textContent = "menu";
        }
    }

    window.scrollTo({
        top: 0,
        behavior: "auto"
    });
}


/* =========================================================
   MODAL DE CONFIRMAÇÃO
   ========================================================= */

function modal({
    title,
    message,
    confirmText = "Confirmar",
    note = false,
    requireNote = false,
    danger = false
}) {
    return new Promise(resolve => {
        const backdrop = $("modalBackdrop");

        if (!backdrop) {
            resolve(
                window.confirm(`${title}\n\n${message}`)
                    ? { note: null }
                    : null
            );
            return;
        }

        set("modalTitle", title);
        set("modalMessage", message);
        set("modalConfirm", confirmText);

        $("modalConfirm")?.classList.toggle(
            "btn-danger",
            danger
        );

        $("noteLabel")?.classList.toggle("hidden", !note);
        $("adminNote")?.classList.toggle("hidden", !note);
        if ($("noteLabel")) {
            $("noteLabel").textContent = requireNote
                ? "Nota de auditoria obrigatória (confirmação no extracto/conta)"
                : "Nota administrativa (opcional)";
        }

        if ($("adminNote")) {
            $("adminNote").value = "";
        }

        backdrop.classList.remove("hidden");

        const confirmButton = $("modalConfirm");
        const cancelButton = $("modalCancel");
        const closeButton = $("modalClose");

        const finish = accepted => {
            backdrop.classList.add("hidden");

            confirmButton?.removeEventListener("click", onYes);
            cancelButton?.removeEventListener("click", onNo);
            closeButton?.removeEventListener("click", onNo);

            backdrop.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKey);

            resolve(accepted
                ? {
                    note: $("adminNote")?.value.trim() || null
                }
                : null
            );
        };

        const onYes = () => {
            const noteText = $("adminNote")?.value.trim() || "";
            if (requireNote && noteText.length < 8) {
                toast("Escreve uma nota de auditoria com pelo menos 8 caracteres.", true);
                $("adminNote")?.focus();
                return;
            }
            finish(true);
        };
        const onNo = () => finish(false);

        const onBackdrop = event => {
            if (event.target === backdrop) {
                onNo();
            }
        };

        const onKey = event => {
            if (
                event.key === "Escape" &&
                !backdrop.classList.contains("hidden")
            ) {
                onNo();
            }
        };

        confirmButton?.addEventListener("click", onYes);
        cancelButton?.addEventListener("click", onNo);
        closeButton?.addEventListener("click", onNo);

        backdrop.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKey);
    });
}


/* =========================================================
   AUXILIARES DE DADOS
   ========================================================= */

function owner(song) {
    return song.owner_name ||
        song.user_name ||
        state.users.find(
            user => Number(user.id) === Number(song.user_id)
        )?.name ||
        `Utilizador #${song.user_id ?? "?"}`;
}

function completedSongs() {
    return state.songs.filter(song => song.status === "completed");
}

function publicSongs() {
    return state.songs.filter(
        song => yes(song.is_public) && song.status === "completed"
    );
}

function normaliseList(data, key) {
    if (Array.isArray(data)) return data;

    if (data && Array.isArray(data[key])) {
        return data[key];
    }

    if (data && Array.isArray(data.data)) {
        return data.data;
    }

    throw new Error(
        `O backend não devolveu uma lista válida (${key}).`
    );
}


/* =========================================================
   PAINEL GERAL E ESTATÍSTICAS
   ========================================================= */

function renderOverview() {
    const completed = completedSongs().length;
    const published = publicSongs().length;

    const pending = state.payments.filter(
        payment => payment.status === "pending"
    ).length;

    const revenue = state.payments
        .filter(payment => payment.status === "confirmed")
        .reduce(
            (sum, payment) => sum + Number(payment.amount || 0),
            0
        );

    set("statUsers", state.users.length);
    set("statSongs", state.songs.length);
    set("statCompleted", completed);
    set("statPublished", published);
    set("statPending", pending);
    set("statRevenue", money(revenue));

    set("usersNavCount", state.users.length);

    set("statsUsers", state.users.length);
    set("statsSongs", state.songs.length);

    set(
        "statsCompletion",
        state.songs.length
            ? `${Math.round(completed / state.songs.length * 100)}%`
            : "0%"
    );

    set("statsRevenue", money(revenue));

    set("pendingCount", pending);

    set(
        "confirmedCount",
        state.payments.filter(
            payment => payment.status === "confirmed"
        ).length
    );

    set(
        "rejectedCount",
        state.payments.filter(
            payment => payment.status === "rejected"
        ).length
    );

    set("communityPublished", published);
    set("communityHidden", completed - published);
    set("communityAll", state.songs.length);

    set("communityTotalLabel", `${published} publicações`);
    set("usersTotalLabel", `${state.users.length} utilizadores`);
    set("songsTotalLabel", `${state.songs.length} músicas`);
    set("paymentsTotalLabel", `${state.payments.length} pagamentos`);

    renderActivity();
    renderCharts();
}


/* =========================================================
   ACTIVIDADE RECENTE
   ========================================================= */

function renderActivity() {
    const items = [
        ...state.users.map(user => ({
            kind: "Utilizador registado",
            who: user.name,
            at: user.created_at,
            status: yes(user.is_active) ? "Activo" : "Inactivo"
        })),

        ...state.songs.map(song => ({
            kind: "Música criada",
            who: owner(song),
            at: song.created_at,
            status: statusLabel(song.status)
        })),

        ...state.payments.map(payment => ({
            kind: "Pagamento",
            who: payment.user_name ||
                `Utilizador #${payment.user_id}`,
            at: payment.created_at,
            status: statusLabel(payment.status)
        }))
    ]
        .filter(item => item.at)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, 12);

    const html = items.length
        ? items.map(item => `
            <tr>
                <td>${esc(item.kind)}</td>
                <td>${esc(item.who || "—")}</td>
                <td>${esc(fmtDate(item.at))}</td>
                <td>${esc(item.status)}</td>
            </tr>
        `).join("")
        : `
            <tr>
                <td colspan="4">Sem actividade registada.</td>
            </tr>
        `;

    ["activityTable", "statsActivityTable"].forEach(id => {
        if ($(id)) {
            $(id).innerHTML = html;
        }
    });
}


/* =========================================================
   UTILIZADORES
   ========================================================= */

function renderUsers() {
    const users = Array.isArray(state.users)
        ? state.users
        : [];

    const search = ($("userSearch")?.value || "")
        .trim()
        .toLowerCase();

    const statusFilter =
        $("userStatusFilter")?.value || "all";

    const roleFilter =
        $("userRoleFilter")?.value || "all";

    // Total geral, sem aplicar filtros.
    set("usersTotalLabel", `${users.length} utilizadores`);
    set("usersNavCount", users.length);
    set("statUsers", users.length);
    set("statsUsers", users.length);

    const filtered = users.filter(user => {
        const name = String(user.name || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const id = String(user.id || "");

        const active = yes(user.is_active);
        const admin = yes(user.is_admin);

        const matchesSearch =
            `${name} ${email} ${id}`.includes(search);

        let matchesStatus = true;

        if (statusFilter === "ATIVO") {
            matchesStatus = active;
        } else if (statusFilter === "INATIVO") {
            matchesStatus = !active;
        } else if (statusFilter === "BLOQUEADO") {
            matchesStatus = !active;
        }

        const matchesRole =
            roleFilter === "all" ||
            (roleFilter === "Admin" && admin) ||
            (roleFilter === "Utilizador" && !admin);

        return matchesSearch && matchesStatus && matchesRole;
    });

    const table = $("usersTable");

    if (!table) {
        console.error("Elemento #usersTable não encontrado.");
        return;
    }

    if (!filtered.length) {
        table.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:24px;">
                    ${
                        users.length === 0
                            ? "Não existem utilizadores carregados."
                            : "Nenhum utilizador corresponde aos filtros."
                    }
                </td>
            </tr>
        `;
    } else {
        table.innerHTML = filtered.map(user => {
            const active = yes(user.is_active);
            const admin = yes(user.is_admin);

            const ownAccount =
                Number(user.id) === Number(state.me?.id);

            return `
                <tr>
                    <td>#${Number(user.id)}</td>

                    <td>${esc(user.name || "Sem nome")}</td>

                    <td>${esc(user.email || "Sem email")}</td>

                    <td>
                        ${badge(
                            active ? "Activo" : "Bloqueado",
                            active ? "active" : "blocked"
                        )}
                    </td>

                    <td>
                        ${esc(admin ? "Administrador" : "Utilizador")}
                    </td>

                    <td>${esc(fmtDate(user.created_at))}</td>

                    <td class="align-right">
                        <div class="table-actions">
                            ${
                                ownAccount
                                    ? "—"
                                    : action(
                                        "toggle-user",
                                        user.id,
                                        active ? "lock" : "lock_open",
                                        active
                                            ? "Bloquear utilizador"
                                            : "Desbloquear utilizador"
                                    )
                            }
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    $("usersEmpty")?.classList.toggle(
        "hidden",
        filtered.length > 0
    );
}


/* =========================================================
   PAINEL DE MÚSICAS
   ========================================================= */

function renderMusic() {
    const search = ($("songSearch")?.value || "")
        .trim()
        .toLowerCase();

    const statusFilter =
        $("songStatusFilter")?.value || "all";

    const visibility =
        $("songPublicFilter")?.value || "all";

    const filtered = state.songs.filter(song => {
        const text =
            `${song.title || ""} ${owner(song)} ${song.id}`
                .toLowerCase();

        let matchesStatus = true;

        if (statusFilter === "Concluída") {
            matchesStatus = song.status === "completed";
        } else if (statusFilter === "Falhou") {
            matchesStatus = song.status === "failed";
        } else if (statusFilter === "Em processamento") {
            matchesStatus = [
                "pending",
                "processing",
                "generating"
            ].includes(song.status);
        }

        const matchesVisibility =
            visibility === "all" ||
            (visibility === "public" && yes(song.is_public)) ||
            (visibility === "private" && !yes(song.is_public));

        return text.includes(search) &&
            matchesStatus &&
            matchesVisibility;
    });

    const table = $("songsTable");

    if (!table) return;

    if (!filtered.length) {
        table.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:24px;">
                    Nenhuma música corresponde aos filtros.
                </td>
            </tr>
        `;
    } else {
        table.innerHTML = filtered.map(song => `
            <tr>
                <td>#${Number(song.id)}</td>

                <td>${esc(song.title || "Sem título")}</td>

                <td>${esc(owner(song))}</td>

                <td>
                    ${badge(
                        statusLabel(song.status),
                        song.status
                    )}
                </td>

                <td>
                    ${badge(
                        yes(song.is_public) ? "Pública" : "Privada",
                        yes(song.is_public) ? "public" : "private"
                    )}
                </td>

                <td>${esc(fmtDate(song.created_at))}</td>

                <td class="align-right">
                    <div class="table-actions">

                        ${
                            song.audio_url
                                ? action(
                                    "play",
                                    song.id,
                                    "play_arrow",
                                    "Reproduzir"
                                )
                                : ""
                        }

                        ${
                            song.status === "completed"
                                ? action(
                                    "toggle-public",
                                    song.id,
                                    yes(song.is_public)
                                        ? "visibility_off"
                                        : "public",
                                    yes(song.is_public)
                                        ? "Retirar da comunidade"
                                        : "Publicar na comunidade"
                                )
                                : ""
                        }

                        ${action(
                            "delete-song",
                            song.id,
                            "delete",
                            "Eliminar música"
                        )}

                    </div>
                </td>
            </tr>
        `).join("");
    }

    $("songsEmpty")?.classList.toggle(
        "hidden",
        filtered.length > 0
    );
}


/* =========================================================
   PAGAMENTOS
   ========================================================= */

function renderPayments() {
    const search = ($("paymentSearch")?.value || "")
        .trim()
        .toLowerCase();

    const filter = $("paymentStatusFilter")?.value || "all";

    const statusMap = {
        Pendente: "pending",
        Confirmado: "confirmed",
        Rejeitado: "rejected"
    };

    const filtered = state.payments.filter(payment => {
        const text = [
            payment.user_name,
            payment.user_email,
            payment.plan_name,
            payment.transaction_reference,
            payment.id
        ].join(" ").toLowerCase();

        return text.includes(search) &&
            (filter === "all" ||
             payment.status === statusMap[filter]);
    });

    const table = $("paymentsTable");

    if (!table) return;

    if (!filtered.length) {
        table.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:24px;">
                    Nenhum pagamento corresponde aos filtros.
                </td>
            </tr>
        `;
    } else {
        table.innerHTML = filtered.map(payment => `
            <tr>
                <td>#${Number(payment.id)}</td>

                <td>
                    ${esc(
                        payment.user_name ||
                        `Utilizador #${payment.user_id}`
                    )}
                </td>

                <td>${esc(payment.plan_name || payment.plan_id || "—")}</td>

                <td>${esc(money(payment.amount))}</td>

                <td>
                    ${esc(({
                        bank_transfer: "Transferência bancária",
                        unifi_transfer: "Transferência internacional UniFi",
                        multicaixa_express: "Multicaixa Express",
                        multicaixa_reference: "Referência Multicaixa",
                        usdc: "USDC",
                        card: "Cartão",
                        paddle: "Paddle / Cartão",
                        bitpay: "BitPay Angola"
                    })[payment.payment_method] || payment.payment_method || "—")}
                </td>

                <td>
                    ${
                        payment.proof_file
                            ? action(
                                "proof",
                                payment.id,
                                "description",
                                "Ver comprovativo"
                            )
                            : "—"
                    }
                    ${payment.payment_proof_hash ? `<small class="payment-audit-meta">Hash: ${esc(String(payment.payment_proof_hash).slice(0, 14))}…</small>` : ""}
                    ${payment.transaction_reference ? `<small class="payment-audit-meta">Ref.: ${esc(payment.transaction_reference)}</small>` : ""}
                    ${payment.verification_source ? `<small class="payment-audit-meta">Verificação: ${esc(payment.verification_source === "provider_webhook" ? "Webhook do fornecedor" : "Manual")}</small>` : ""}
                </td>

                <td>
                    ${badge(
                        statusLabel(payment.status),
                        payment.status
                    )}
                </td>

                <td class="align-right">
                    <div class="table-actions">
                        ${
                            payment.status === "pending"
                                ? action(
                                    "confirm-payment",
                                    payment.id,
                                    "check_circle",
                                    "Confirmar pagamento"
                                ) +
                                action(
                                    "reject-payment",
                                    payment.id,
                                    "cancel",
                                    "Rejeitar pagamento"
                                )
                                : "—"
                        }
                    </div>
                </td>
            </tr>
        `).join("");
    }

    $("paymentsEmpty")?.classList.toggle(
        "hidden",
        filtered.length > 0
    );
}


/* =========================================================
   COMUNIDADE
   ========================================================= */

function renderCommunity() {
    const search = ($("communitySearch")?.value || "")
        .trim()
        .toLowerCase();

    const filter = $("communityFilter")?.value || "all";

    const filtered = completedSongs().filter(song => {
        const text =
            `${song.title || ""} ${owner(song)}`.toLowerCase();

        const matchesVisibility =
            filter === "all" ||
            (filter === "public" && yes(song.is_public)) ||
            (filter === "hidden" && !yes(song.is_public));

        return text.includes(search) && matchesVisibility;
    });

    const list = $("communityList");

    if (!list) return;

    if (!filtered.length) {
        list.innerHTML = "";
    } else {
        list.innerHTML = filtered.map(song => {
            const cover = song.cover_url
                ? new URL(song.cover_url, ADMIN_API).href
                : "";

            return `
                <article class="community-card">

                    ${
                        cover
                            ? `
                                <img
                                    class="community-cover"
                                    src="${esc(cover)}"
                                    alt="Capa da música"
                                    loading="lazy">
                            `
                            : `
                                <div class="community-cover community-placeholder">
                                    ${icon("music_note")}
                                </div>
                            `
                    }

                    <div class="community-card-body">

                        <h3>${esc(song.title || "Sem título")}</h3>

                        <p>${esc(owner(song))}</p>

                        <p>
                            ${badge(
                                yes(song.is_public)
                                    ? "Publicada"
                                    : "Privada",
                                yes(song.is_public)
                                    ? "public"
                                    : "private"
                            )}
                        </p>

                        <div class="table-actions">

                            ${
                                song.audio_url
                                    ? action(
                                        "play",
                                        song.id,
                                        "play_arrow",
                                        "Reproduzir"
                                    )
                                    : ""
                            }

                            ${action(
                                "toggle-public",
                                song.id,
                                yes(song.is_public)
                                    ? "visibility_off"
                                    : "public",
                                yes(song.is_public)
                                    ? "Retirar da comunidade"
                                    : "Publicar na comunidade"
                            )}

                        </div>

                    </div>

                </article>
            `;
        }).join("");
    }

    $("communityEmpty")?.classList.toggle(
        "hidden",
        filtered.length > 0
    );
}


/* =========================================================
   GRÁFICOS
   ========================================================= */

function renderCharts() {
    const groups = [
        [
            "Concluídas",
            state.songs.filter(
                song => song.status === "completed"
            ).length
        ],
        [
            "Pendentes",
            state.songs.filter(
                song => [
                    "pending",
                    "processing",
                    "generating"
                ].includes(song.status)
            ).length
        ],
        [
            "Falhadas",
            state.songs.filter(
                song => song.status === "failed"
            ).length
        ]
    ];

    const chart = $("songStatusChart");

    if (chart) {
        chart.innerHTML = groups.map(([label, count]) => {
            const percent = state.songs.length
                ? Math.round(count / state.songs.length * 100)
                : 0;

            return `
                <div class="chart-row">

                    <div>
                        <span>${esc(label)}</span>
                        <strong>${count}</strong>
                    </div>

                    <div class="progress-track">
                        <div
                            class="progress-fill"
                            style="width:${percent}%">
                        </div>
                    </div>

                </div>
            `;
        }).join("");
    }

    const summary = $("communitySummary");

    if (summary) {
        summary.innerHTML = `
            <p>
                Publicadas:
                <strong>${publicSongs().length}</strong>
            </p>

            <p>
                Concluídas privadas:
                <strong>
                    ${completedSongs().length - publicSongs().length}
                </strong>
            </p>

            <p>
                Total de músicas:
                <strong>${state.songs.length}</strong>
            </p>
        `;
    }
}


/* =========================================================
   ACTUALIZAR A INTERFACE
   ========================================================= */

function renderAll() {
    renderOverview();
    renderUsers();
    renderMusic();
    renderPayments();
    renderCommunity();
}


/* =========================================================
   CARREGAR DADOS DO BACKEND
   ========================================================= */

async function loadAll(silent = false) {
    if (state.busy) return;

    state.busy = true;

    $("refreshBtn")?.setAttribute("disabled", "disabled");

    try {
        const results = await Promise.allSettled([
            request("/api/admin/users"),
            request("/api/admin/music"),
            request("/api/admin/payments")
        ]);

        const definitions = [
            ["utilizadores", "users"],
            ["músicas", "songs"],
            ["pagamentos", "payments"]
        ];

        let errors = 0;

        results.forEach((result, index) => {
            const [label, key] = definitions[index];

            if (result.status === "rejected") {
                errors++;

                console.error(
                    `Erro ao carregar ${label}:`,
                    result.reason
                );

                toast(
                    `Erro ao carregar ${label}: ${result.reason.message}`,
                    true
                );

                return;
            }

            try {
                state[key] = normaliseList(result.value, key);
            } catch (error) {
                errors++;

                console.error(error);
                toast(error.message, true);
            }
        });

        renderAll();

        if (!errors && !silent) {
            toast("Dados actualizados com sucesso.");
        }

        if (errors === 0) {
            set("connectionText", "Ligado ao servidor");
        }
    } finally {
        state.busy = false;

        $("refreshBtn")?.removeAttribute("disabled");
    }
}


/* =========================================================
   REPRODUZIR MÚSICA
   ========================================================= */

async function playSong(song) {
    if (!song?.audio_url) {
        toast("Áudio indisponível.", true);
        return;
    }

    const player = $("audioPlayer");

    if (!player) {
        toast("Leitor de áudio não encontrado.", true);
        return;
    }

    try {
        player.src = new URL(song.audio_url, ADMIN_API).href;
        await player.play();

        toast(`A reproduzir: ${song.title || "Música"}`);
    } catch (error) {
        console.error("Erro ao reproduzir áudio:", error);

        toast(
            "Não foi possível reproduzir o áudio. Verifica o acesso ao ficheiro.",
            true
        );
    }
}


/* =========================================================
   COMPROVATIVOS DE PAGAMENTO
   ========================================================= */

async function openPaymentProof(payment) {
    if (!payment?.proof_file) {
        toast("Este pagamento não tem comprovativo.", true);
        return;
    }

    const tab = window.open("about:blank", "_blank");

    try {
        // Administrators must use the admin-only proof route; the user route
        // intentionally permits only the payment owner.
        const blob = await request(
            `/api/admin/payments/${Number(payment.id)}/proof`,
            { responseType: "blob" }
        );

        const url = URL.createObjectURL(blob);

        if (tab) {
            tab.location.href = url;
        } else {
            const link = document.createElement("a");

            link.href = url;
            link.target = "_blank";
            link.rel = "noopener";

            document.body.appendChild(link);
            link.click();
            link.remove();
        }

        setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
        tab?.close();

        console.error(error);
        toast(error.message, true);
    }
}


/* =========================================================
   ACÇÕES ADMINISTRATIVAS
   ========================================================= */

async function handleAction(name, id) {
    const user = state.users.find(
        item => Number(item.id) === id
    );

    const song = state.songs.find(
        item => Number(item.id) === id
    );

    const payment = state.payments.find(
        item => Number(item.id) === id
    );

    if (name === "play") {
        return playSong(song);
    }

    if (name === "proof") {
        return openPaymentProof(payment);
    }

    let path = "";
    let options = {};
    let config = {};

    if (name === "toggle-user" && user) {
        if (Number(user.id) === Number(state.me?.id)) {
            toast("Não podes bloquear a tua própria conta.", true);
            return;
        }

        const activate = !yes(user.is_active);

        config = {
            title: activate
                ? "Desbloquear utilizador"
                : "Bloquear utilizador",

            message: `Desejas ${
                activate ? "desbloquear" : "bloquear"
            } ${user.name || user.email}?`,

            confirmText: activate ? "Desbloquear" : "Bloquear",
            danger: !activate
        };

        path = `/api/admin/users/${id}/active`;

        options = {
            method: "PATCH",
            body: JSON.stringify({
                is_active: activate
            })
        };
    }

    else if (name === "toggle-public" && song) {
        const publish = !yes(song.is_public);

        config = {
            title: publish
                ? "Publicar música"
                : "Retirar da comunidade",

            message: `Desejas ${
                publish ? "publicar" : "retirar"
            } a música «${song.title || "Sem título"}» ${
                publish ? "na" : "da"
            } comunidade.`,

            confirmText: publish ? "Publicar" : "Retirar",
            danger: !publish
        };

        path = `/api/admin/music/${id}/public`;

        options = {
            method: "PATCH",
            body: JSON.stringify({
                is_public: publish
            })
        };
    }

    else if (name === "delete-song" && song) {
        config = {
            title: "Eliminar música",

            message:
                `Desejas eliminar definitivamente «${
                    song.title || "Sem título"
                }»? Esta operação não pode ser desfeita.`,

            confirmText: "Eliminar",
            danger: true
        };

        path = `/api/admin/music/${id}`;

        options = {
            method: "DELETE"
        };
    }

    else if (
        (name === "confirm-payment" ||
         name === "reject-payment") &&
        payment
    ) {
        const confirm = name === "confirm-payment";

        config = {
            title: confirm
                ? "Confirmar pagamento"
                : "Rejeitar pagamento",

            message: confirm
                ? `Confirma que recebeste efectivamente ${
                    money(payment.amount)
                  } do pagamento #${id}? Verifica o recebimento antes de aprovar.`
                : `Desejas rejeitar o pagamento #${id}?`,

            confirmText: confirm ? "Confirmar" : "Rejeitar",
            danger: !confirm,
            note: true,
            requireNote: confirm
        };

        path = `/api/admin/payments/${id}/review`;
    }

    else {
        return;
    }

    const accepted = await modal(config);

    if (!accepted) return;

    if (
        name === "confirm-payment" ||
        name === "reject-payment"
    ) {
        options.method = "PATCH";

        options.body = JSON.stringify({
            status: name === "confirm-payment"
                ? "confirmed"
                : "rejected",

            admin_note: accepted.note
        });
    }

    try {
        await request(path, options);

        toast("Operação realizada com sucesso.");

        await loadAll(true);
    } catch (error) {
        console.error("Erro na operação administrativa:", error);

        toast(error.message, true);
    }
}


/* =========================================================
   SUPORTE — GESTÃO DE TICKETS
   ========================================================= */
async function loadSupportTickets() {
    const data = await request("/api/support/tickets");
    state.supportTickets = Array.isArray(data.tickets) ? data.tickets : [];
    const host = $("adminSupportTickets");
    if (!host) return;
    if (!state.supportTickets.length) {
        host.innerHTML = '<p class="support-admin-empty">Ainda não existem pedidos de suporte.</p>';
        return;
    }
    host.innerHTML = state.supportTickets.map(t => `
        <button type="button" class="support-admin-ticket ${Number(t.id) === Number(state.selectedSupport) ? "active" : ""}" data-support-ticket="${Number(t.id)}">
            <strong>${esc(t.ticket_number)} · ${esc(t.subject)}</strong>
            <small>${esc(t.user_name || t.user_email || "Utilizador")} · ${esc(statusLabel(t.status))} · ${esc(t.priority || "normal")}</small>
            ${Number(t.unread_count || 0) > 0 ? `<small>${Number(t.unread_count)} mensagem(ns) por ler</small>` : ""}
            <small>${esc(fmtDate(t.updated_at))}</small>
        </button>
    `).join("");
}
async function openAdminSupportTicket(id) {
    state.selectedSupport = Number(id);
    await loadSupportTickets();
    const data = await request(`/api/support/tickets/${state.selectedSupport}`);
    const t = data.ticket;
    $("adminSupportEmpty")?.classList.add("hidden");
    $("adminSupportDetail")?.classList.remove("hidden");
    set("adminSupportNumber", t.ticket_number);
    set("adminSupportSubject", t.subject);
    set("adminSupportOwner", `${t.user_name || "Utilizador"} · ${t.user_email || ""}`);
    if ($("adminSupportStatus")) $("adminSupportStatus").value = t.status;
    if ($("adminSupportPriority")) $("adminSupportPriority").value = t.priority || "normal";
    const messages = $("adminSupportMessages");
    if (messages) {
        messages.innerHTML = (data.messages || []).map(m => `
            <article class="support-admin-message ${yes(m.sender_is_admin) ? "staff" : ""}">
                <small>${esc(m.sender_name || "Utilizador")}${yes(m.sender_is_admin) ? " · Equipa de suporte" : ""} · ${esc(fmtDate(m.created_at))}</small>
                <p>${esc(m.message)}</p>
            </article>
        `).join("");
        messages.scrollTop = messages.scrollHeight;
    }
    const closed = t.status === "closed";
    if ($("adminSupportMessage")) $("adminSupportMessage").disabled = closed;
    $("adminSupportReply")?.querySelector("button")?.toggleAttribute("disabled", closed);
}
async function saveAdminSupportStatus() {
    if (!state.selectedSupport) return;
    try {
        await request(`/api/admin/support/tickets/${state.selectedSupport}`, {
            method: "PATCH",
            body: JSON.stringify({
                status: $("adminSupportStatus").value,
                priority: $("adminSupportPriority").value
            })
        });
        toast("Estado do ticket actualizado.");
        await openAdminSupportTicket(state.selectedSupport);
    } catch (error) { toast(error.message, true); }
}
async function sendAdminSupportReply(event) {
    event.preventDefault();
    if (!state.selectedSupport) return;
    const field = $("adminSupportMessage");
    const message = field.value.trim();
    if (!message) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
        await request(`/api/support/tickets/${state.selectedSupport}/messages`, {
            method: "POST",
            body: JSON.stringify({ message })
        });
        field.value = "";
        await openAdminSupportTicket(state.selectedSupport);
        toast("Resposta enviada.");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function init() {
    initHamburgerMenu();

    // Navegação principal e acções.
    document.addEventListener("click", event => {
        const nav = event.target.closest("[data-view], [data-go]");

        if (nav) {
            const view = nav.dataset.view || nav.dataset.go;

            if (view) {
                showView(view);
            }

            return;
        }

        const button = event.target.closest(
            "[data-action][data-id]"
        );

        if (button) {
            handleAction(
                button.dataset.action,
                Number(button.dataset.id)
            );
        }
    });

    $("adminSupportTickets")?.addEventListener("click", event => {
        const item = event.target.closest("[data-support-ticket]");
        if (item) openAdminSupportTicket(item.dataset.supportTicket).catch(error => toast(error.message, true));
    });
    $("supportRefresh")?.addEventListener("click", () => loadSupportTickets().catch(error => toast(error.message, true)));
    $("adminSupportSave")?.addEventListener("click", saveAdminSupportStatus);
    $("adminSupportReply")?.addEventListener("submit", sendAdminSupportReply);
    document.addEventListener("click", event => {
        const nav = event.target.closest("[data-view]");
        if (nav?.dataset.view === "support") loadSupportTickets().catch(error => toast(error.message, true));
    });
    setInterval(() => {
        if (state.current === "support" && token()) {
            loadSupportTickets().then(() => {
                if (state.selectedSupport) openAdminSupportTicket(state.selectedSupport);
            }).catch(() => {});
        }
    }, 15000);

    // Filtros dos utilizadores.
    ["userSearch", "userStatusFilter", "userRoleFilter"]
        .forEach(id => {
            $(id)?.addEventListener("input", renderUsers);
            $(id)?.addEventListener("change", renderUsers);
        });

    // Filtros das músicas.
    ["songSearch", "songStatusFilter", "songPublicFilter"]
        .forEach(id => {
            $(id)?.addEventListener("input", renderMusic);
            $(id)?.addEventListener("change", renderMusic);
        });

    // Filtros dos pagamentos.
    ["paymentSearch", "paymentStatusFilter"]
        .forEach(id => {
            $(id)?.addEventListener("input", renderPayments);
            $(id)?.addEventListener("change", renderPayments);
        });

    // Filtros da comunidade.
    ["communitySearch", "communityFilter"]
        .forEach(id => {
            $(id)?.addEventListener("input", renderCommunity);
            $(id)?.addEventListener("change", renderCommunity);
        });

    $("refreshBtn")?.addEventListener("click", () => {
        loadAll();
    });

    $("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem("access_token");
        window.location.href = "login.html";
    });

    set(
        "todayLabel",
        new Date().toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "long",
            year: "numeric"
        })
    );

    showView("overview");

    if (!token()) {
        set("connectionText", "Sessão não iniciada");

        toast(
            "Inicia sessão como administrador para consultar os dados.",
            true
        );

        return;
    }

    try {
        const response = await request("/auth/me");

        state.me = response?.user || response;

        if (!yes(state.me?.is_admin)) {
            set("connectionText", "Acesso não autorizado");

            toast(
                "Esta conta não tem permissões de administrador.",
                true
            );

            return;
        }

        const name = state.me.name || "Administrador";

        set("sidebarName", name);
        set("topName", name);

        const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase() || "")
            .join("");

        set("sidebarAvatar", initials || "AD");
        set("topAvatar", initials || "AD");

        set("connectionText", "Ligado ao servidor");

        await loadAll(true);
    } catch (error) {
        console.error("Erro ao inicializar o painel:", error);

        set("connectionText", "Sem ligação / sessão inválida");

        toast(error.message, true);
    }
}

document.addEventListener("DOMContentLoaded", init);
