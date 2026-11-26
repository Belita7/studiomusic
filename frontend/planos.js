// ============================================================
// StudioMusic.AI - PLANOS.JS
// ============================================================

"use strict";

const API_BASE_URL = "https://studiomusic.onrender.com";
const PLANS_ENDPOINT = `${API_BASE_URL}/api/plans`;
const MY_SUB_ENDPOINT = `${API_BASE_URL}/api/subscriptions/me`;
const PAYMENTS_ENDPOINT = `${API_BASE_URL}/api/payments`;
const PAYMENT_OPTIONS_ENDPOINT = `${API_BASE_URL}/api/payments/p2p/options`;
let configuredPaymentMethods = [];

const plansGrid = document.getElementById("plansGrid");
const subStatusText = document.getElementById("subStatusText");
const plansMessage = document.getElementById("plansMessage");
const logoutButton = document.getElementById("logoutButton");
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navMenu = document.getElementById("navMenu");

// Modal Elements
const paymentModal = document.getElementById("paymentModal");
const closeModal = document.getElementById("closeModal");
const modalPlanName = document.getElementById("modalPlanName");
const paymentMethodSelect = document.getElementById("paymentMethod");
const transactionRefInput = document.getElementById("transactionRef");
const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");

let selectedPlanId = null;

// Taxa de referência USD/AOA publicada diariamente. O cache evita
// chamadas repetidas e é renovado automaticamente após 24 horas.
const USD_AOA_RATE_URL = "https://theratesapi.com/api/latest?base=USD&symbols=AOA";
const USD_AOA_CACHE_KEY = "studiomusic_usd_aoa_rate_v1";
const USD_AOA_CACHE_TTL = 24 * 60 * 60 * 1000;
let usdToAoaRate = null;
let usdToAoaRateDate = null;

async function loadUsdAoaRate() {
    let cached = null;
    try {
        cached = JSON.parse(localStorage.getItem(USD_AOA_CACHE_KEY) || "null");
        if (cached && Number.isFinite(Number(cached.rate)) && Date.now() - Number(cached.savedAt) < USD_AOA_CACHE_TTL) {
            usdToAoaRate = Number(cached.rate);
            usdToAoaRateDate = cached.date || null;
            return;
        }
    } catch (_) {
        cached = null;
    }

    try {
        const response = await fetch(USD_AOA_RATE_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao obter taxa cambial.");
        const data = await response.json();
        const rate = Number(data?.rates?.AOA);
        if (!Number.isFinite(rate) || rate <= 0 || data?.base !== "USD") {
            throw new Error("Taxa USD/AOA inválida.");
        }
        usdToAoaRate = rate;
        usdToAoaRateDate = data.date || null;
        try {
            localStorage.setItem(USD_AOA_CACHE_KEY, JSON.stringify({
                rate,
                date: usdToAoaRateDate,
                savedAt: Date.now()
            }));
        } catch (_) {
            // A taxa continua disponível nesta sessão mesmo se o browser
            // não permitir guardar o cache local.
        }
    } catch (error) {
        console.warn("Taxa cambial USD/AOA indisponível:", error);
        // Se a rede falhar, utilizar a última taxa guardada, identificando
        // a data da cotação para não apresentar um valor inventado.
        if (cached && Number.isFinite(Number(cached.rate))) {
            usdToAoaRate = Number(cached.rate);
            usdToAoaRateDate = cached.date || null;
        } else {
            usdToAoaRate = null;
            usdToAoaRateDate = null;
        }
    }
}

function getPlanUsdEquivalent(plan) {
    const amount = Number(plan.price || 0);
    const currency = String(plan.currency || "AOA").toUpperCase();
    if (!amount || !Number.isFinite(amount) || !usdToAoaRate) return "";
    let usd = null;
    if (currency === "AOA") usd = amount / usdToAoaRate;
    else if (currency === "USD") usd = amount;
    else return "";
    const formattedUsd = usd.toLocaleString("pt-PT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `<div class="plan-price-usd">≈ ${formattedUsd} USD</div>`;
}

function renderExchangeRateInfo() {
    let info = document.getElementById("usdAoaRateInfo");
    if (!info) {
        info = document.createElement("p");
        info.id = "usdAoaRateInfo";
        info.className = "exchange-rate-info";
        plansGrid?.insertAdjacentElement("beforebegin", info);
    }
    if (!info) return;
    info.textContent = usdToAoaRate
        ? `Câmbio de referência do dia: 1 USD ≈ ${usdToAoaRate.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} AOA${usdToAoaRateDate ? ` · cotação: ${usdToAoaRateDate}` : ""}. Valores em USD são estimativas; o preço cobrado continua na moeda do plano.`
        : "Taxa USD/AOA temporariamente indisponível. Os preços dos planos continuam apresentados na moeda original.";
}

// Obter token
function getToken() {
    return localStorage.getItem("access_token") || localStorage.getItem("token") || sessionStorage.getItem("access_token") || sessionStorage.getItem("token");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function renderPaymentMethodHelp() {
    let help = document.getElementById("paymentMethodHelp");
    if (!help && paymentMethodSelect) {
        help = document.createElement("p");
        help.id = "paymentMethodHelp";
        help.className = "field-help";
        paymentMethodSelect.insertAdjacentElement("afterend", help);
    }
    const method = configuredPaymentMethods.find(item => item.id === paymentMethodSelect?.value);
    if (help) help.textContent = method ? [method.details, method.currency ? `Moeda: ${method.currency}` : "", method.aoa_per_usdc ? `Taxa: ${method.aoa_per_usdc} AOA/USDC` : "", method.aoa_per_usd ? `Taxa: ${method.aoa_per_usd} AOA/USD` : "", method.network ? `Rede: ${method.network}` : "", method.wallet_address ? `Carteira: ${method.wallet_address}` : ""].filter(Boolean).join(" | ") : "";
}

// Mensagens
function showMessage(text, type = "error") {
    if (!plansMessage) return;
    plansMessage.textContent = text;
    plansMessage.className = `message show ${type}`;
}

// Menu Hambúrguer
if (hamburgerBtn && navMenu) {
    hamburgerBtn.addEventListener("click", () => navMenu.classList.toggle("show"));
}

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        ["access_token", "accessToken", "token", "auth_token", "authToken", "jwt", "jwt_token", "user"].forEach(key => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
        window.location.href = "login.html";
    });
}

if (paymentMethodSelect) paymentMethodSelect.addEventListener("change", renderPaymentMethodHelp);

// Fechar modal
if (closeModal) {
    closeModal.addEventListener("click", () => paymentModal.style.display = "none");
}

// ============================================================
// CARREGAR DADOS E PLANOS
// ============================================================
async function initPage() {
    await loadUsdAoaRate();
    renderExchangeRateInfo();
    const token = getToken();
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Carregar métodos P2P configurados no servidor.
        try {
            const methodsRes = await fetch(PAYMENT_OPTIONS_ENDPOINT, { headers: { "Authorization": `Bearer ${token}` } });
            if (methodsRes.ok) {
                const methodsData = await methodsRes.json();
                configuredPaymentMethods = Array.isArray(methodsData.methods) ? methodsData.methods : [];
                if (paymentMethodSelect) {
                    paymentMethodSelect.innerHTML = configuredPaymentMethods.length
                        ? '<option value="">Seleccione um método de pagamento</option>' + configuredPaymentMethods.map(method =>
                            `<option value="${escapeHTML(method.id)}">${escapeHTML(method.label)}</option>`
                        ).join("")
                        : '<option value="">Nenhum método P2P configurado</option>';
                    if (confirmPaymentBtn) confirmPaymentBtn.disabled = configuredPaymentMethods.length === 0;
                    renderPaymentMethodHelp();
                }
            }
        } catch (methodsError) {
            console.warn("Não foi possível obter métodos P2P; mantém-se o fluxo legado.", methodsError);
        }

        // 1. Carregar subscrição atual
        const subRes = await fetch(MY_SUB_ENDPOINT, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!subRes.ok) throw new Error(`Falha ao consultar assinatura (HTTP ${subRes.status}).`);
        const subData = await subRes.json();

        if (subData.has_subscription && subData.subscription) {
            const sub = subData.subscription;
            subStatusText.textContent = `Plano ativo: ${sub.plan_name || sub.plan?.name || "Plano"}${sub.expires_at ? ` (Expira a: ${new Date(sub.expires_at).toLocaleDateString("pt-PT")})` : ""}`;
        } else {
            const defaultPlan = subData.default_plan ? subData.default_plan.name : "Gratuito";
            subStatusText.textContent = `Estás atualmente no plano ${defaultPlan}.`;
        }

        // 2. Carregar lista de planos
        const plansRes = await fetch(PLANS_ENDPOINT);
        if (!plansRes.ok) throw new Error(`Falha ao carregar planos (HTTP ${plansRes.status}).`);
        const plansData = await plansRes.json();

        if (plansData.success && plansData.plans) {
            renderPlans(plansData.plans);
        }

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showMessage("Não foi possível carregar os planos.");
    }
}

function renderPlans(plans) {
    plansGrid.innerHTML = "";

    plans.forEach(plan => {
        const isFree = Number(plan.price) === 0;
        const card = document.createElement("div");
        card.className = `plan-card ${plan.code === 'basic' ? 'featured' : ''}`;

        card.innerHTML = `
            <div>
                <h3 class="plan-title">${escapeHTML(plan.name)}</h3>
                <div class="plan-price-main">
                    <strong>${Number(plan.price || 0).toLocaleString("pt-PT")} ${escapeHTML(plan.currency || "AOA")}</strong>
                </div>
                ${getPlanUsdEquivalent(plan)}
                <div class="plan-duration">${Number(plan.duration_days || 0)} dias</div>
                <p class="plan-desc">${escapeHTML(plan.description || "Sem descrição")}</p>
                <ul class="plan-features">
                    <li><span class="material-icons">check_circle</span> Duração máx. de música: ${plan.max_song_duration}s</li>
                    <li><span class="material-icons">check_circle</span> Limite mensal: ${plan.monthly_song_limit} músicas</li>
                </ul>
            </div>
            <button class="btn-submit select-plan-btn" data-id="${Number(plan.id)}" data-name="${escapeHTML(plan.name)}" data-price="${Number(plan.price)}">
                ${isFree ? 'Plano Atual / Gratuito' : 'Submeter Subscrição'}
            </button>
        `;

        plansGrid.appendChild(card);
    });

    // Eventos de clique nos botões de subscrição
    document.querySelectorAll(".select-plan-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const button = e.currentTarget;
            const price = parseFloat(button.dataset.price);
            if (price === 0) {
                showMessage("O plano gratuito já está disponível por defeito.", "success");
                return;
            }

            selectedPlanId = button.dataset.id;
            modalPlanName.textContent = `Plano: ${button.dataset.name} (${price.toLocaleString()} AOA)`;
            paymentModal.style.display = "flex";
        });
    });
}

// Submeter Pagamento
if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener("click", async () => {
        const token = getToken();
        const paymentMethod = paymentMethodSelect?.value;
        const transactionReference = transactionRefInput?.value.trim() || "";
        if (!token || !selectedPlanId || !paymentMethod || !configuredPaymentMethods.some(method => method.id === paymentMethod)) {
            showMessage("Selecciona um plano e um método de pagamento configurado.", "error");
            return;
        }

        confirmPaymentBtn.disabled = true;
        confirmPaymentBtn.textContent = "A processar...";

        try {
            const response = await fetch(PAYMENTS_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    plan_id: parseInt(selectedPlanId),
                    payment_method: paymentMethod,
                    transaction_reference: transactionReference || null
                })
            });

            const data = await response.json();

            if (!response.ok || data.success === false) {
                throw new Error(data.detail || data.message || "Erro ao criar pedido de pagamento.");
            }

            paymentModal.style.display = "none";
            let paymentInfo = `Pedido #${data.payment_id || "—"} criado. Estado: pendente. Valor de referência: ${data.amount ?? "—"} ${data.currency || "AOA"}.`;
            if (data.crypto_amount) {
                paymentInfo += ` Envia ${data.crypto_amount} USDC na rede ${data.network} para a carteira ${data.wallet_address}.`;
            }
            if (data.transfer_amount_usd) {
                paymentInfo += ` Envia ${data.transfer_amount_usd} USD através da UniFi. Taxa usada: ${data.aoa_per_usd} AOA/USD.`;
            }
            paymentInfo += " A subscrição só será activada depois da confirmação do recebimento.";
            showMessage(paymentInfo, "success");

            // Recarregar o estado da subscrição após a resposta do servidor.
            await initPage();

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            confirmPaymentBtn.disabled = false;
            confirmPaymentBtn.textContent = "Submeter Pedido de Pagamento";
        }
    });
}

document.addEventListener("DOMContentLoaded", initPage);


