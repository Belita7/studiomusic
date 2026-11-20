
"use strict";

/* ============================================================
   StudioMusic.AI
   PAGAMENTOS.JS

   Paddle Sandbox: integração com rota existente.
   BitPay Angola: preparado para rota FastAPI a implementar.

   A chave secreta BitPay nunca deve chegar ao frontend.
============================================================ */

const API_BASE_URL = "https://studiomusic.onrender.com";

const PAYMENT_ENDPOINTS = {
    plans: "/api/plans",
    subscription: "/api/subscriptions/me",
    history: "/api/payments/me",
    paddleCheckout: "/api/paddle/checkout",

    // ROTA NOVA A IMPLEMENTAR NO MAIN.PY
    bitpayCheckout: "/api/bitpay/checkout"
};

let availablePlans = [];
let selectedPlan = null;
let currentSubscription = null;

let paddleInitialized = false;
let paddleTokenUsed = null;

let paymentInProgress = false;


/* ============================================================
   ELEMENTOS
============================================================ */

const elements = {
    plansContainer: document.getElementById("plansContainer"),

    paymentMessage: document.getElementById("paymentMessage"),

    currentPlanName: document.getElementById("currentPlanName"),
    currentPlanDetails: document.getElementById("currentPlanDetails"),
    subscriptionStatus: document.getElementById("subscriptionStatus"),

    payButton: document.getElementById("payButton"),
    payButtonText: document.getElementById("payButtonText"),

    bitpayOptions: document.getElementById("bitpayOptions"),
    paddleOptions: document.getElementById("paddleOptions"),

    bitpayPaymentType: document.getElementById("bitpayPaymentType"),
    bitpayPhone: document.getElementById("bitpayPhone"),
    bitpayPhoneGroup: document.getElementById("bitpayPhoneGroup"),

    bitpayResult: document.getElementById("bitpayResult"),
    bitpayResultText: document.getElementById("bitpayResultText"),
    bitpayReferenceDetails: document.getElementById("bitpayReferenceDetails"),

    bitpayEntity: document.getElementById("bitpayEntity"),
    bitpayReference: document.getElementById("bitpayReference"),
    bitpayExpiry: document.getElementById("bitpayExpiry"),

    paymentsHistory: document.getElementById("paymentsHistory"),

    refreshPayments: document.getElementById("refreshPayments")
};


/* ============================================================
   AUTENTICAÇÃO
============================================================ */

function getToken() {
    return localStorage.getItem("access_token");
}


function getAuthHeaders() {
    const token = getToken();

    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}


function checkAuthentication() {
    if (!getToken()) {
        showMessage(
            "Precisas de iniciar sessão para consultar os planos e efectuar pagamentos.",
            "error"
        );

        elements.payButton.disabled = true;

        return false;
    }

    return true;
}


/* ============================================================
   PEDIDOS À API
============================================================ */

async function apiRequest(endpoint, options = {}) {

    const token = getToken();

    const headers = {
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            ...options,
            headers
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch {
        throw new Error("O servidor devolveu uma resposta inválida.");
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            data.error ||
            `Erro HTTP ${response.status}`
        );
    }

    return data;
}


/* ============================================================
   MENSAGENS
============================================================ */

function showMessage(message, type = "info") {

    elements.paymentMessage.textContent = message;

    elements.paymentMessage.className =
        `payment-message ${type}`;

    elements.paymentMessage.hidden = false;

    elements.paymentMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}


function hideMessage() {
    elements.paymentMessage.hidden = true;
    elements.paymentMessage.textContent = "";
}


/* ============================================================
   UTILITÁRIOS
============================================================ */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}


function formatDate(value) {

    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("pt-PT");
}


function formatMoney(amount, currency = "AOA") {

    const value = Number(amount);

    if (!Number.isFinite(value)) {
        return "—";
    }

    return new Intl.NumberFormat("pt-PT", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: 2
    }).format(value);
}


function getPlanId(plan) {
    return plan.id ?? plan.plan_id ?? null;
}


function getPlanCode(plan) {
    return String(
        plan.code ??
        plan.plan_code ??
        ""
    ).toLowerCase();
}


function getPlanName(plan) {
    return plan.name ?? plan.title ?? "Plano";
}


function getPlanDescription(plan) {
    return plan.description ?? plan.descricao ?? "";
}


function getPlanFeatures(plan) {

    const features = plan.features;

    if (Array.isArray(features)) {
        return features;
    }

    if (typeof features === "string") {
        try {
            const parsed = JSON.parse(features);

            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return features
                .split("\n")
                .map(item => item.trim())
                .filter(Boolean);
        }
    }

    return [];
}


/* ============================================================
   CARREGAR PLANOS
============================================================ */

async function loadPlans() {

    elements.plansContainer.innerHTML = `
        <div class="loading-card">
            A carregar planos...
        </div>
    `;

    try {

        const data = await apiRequest(
            PAYMENT_ENDPOINTS.plans
        );

        if (!data.success || !Array.isArray(data.plans)) {
            throw new Error("Não foi possível carregar os planos.");
        }

        availablePlans = data.plans;

        renderPlans();

    } catch (error) {

        console.error("Erro ao carregar planos:", error);

        elements.plansContainer.innerHTML = `
            <div class="loading-card">
                Não foi possível carregar os planos.
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}


/* ============================================================
   MOSTRAR PLANOS
============================================================ */

function renderPlans() {

    if (!availablePlans.length) {

        elements.plansContainer.innerHTML = `
            <div class="loading-card">
                Não existem planos disponíveis.
            </div>
        `;

        return;
    }

    elements.plansContainer.innerHTML = "";

    availablePlans.forEach(plan => {

        const id = getPlanId(plan);
        const code = getPlanCode(plan);
        const name = getPlanName(plan);
        const description = getPlanDescription(plan);

        const price = plan.price ?? plan.amount ?? 0;

        const currency = plan.currency ?? "AOA";

        const features = getPlanFeatures(plan);

        const card = document.createElement("article");

        card.className = "plan-card";

        card.dataset.planId = id;

        const featuresHTML = features.length
            ? features.map(feature => `
                <li>
                    <span class="material-icons">check_circle</span>
                    <span>${escapeHTML(feature)}</span>
                </li>
            `).join("")
            : `
                <li>
                    <span class="material-icons">check_circle</span>
                    <span>Plano disponível na plataforma</span>
                </li>
            `;

        card.innerHTML = `
            <h3>${escapeHTML(name)}</h3>

            <p class="plan-description">
                ${escapeHTML(description)}
            </p>

            <div class="plan-price">
                ${formatMoney(price, currency)}
                <small>/ plano</small>
            </div>

            <ul class="plan-features">
                ${featuresHTML}
            </ul>

            <button type="button" class="select-plan-button">
                Seleccionar plano
            </button>
        `;

        card.querySelector("button").addEventListener(
            "click",
            () => selectPlan(id)
        );

        elements.plansContainer.appendChild(card);
    });

    if (selectedPlan) {
        selectPlan(getPlanId(selectedPlan));
    }
}


/* ============================================================
   SELECCIONAR PLANO
============================================================ */

function selectPlan(planId) {

    selectedPlan = availablePlans.find(
        plan => String(getPlanId(plan)) === String(planId)
    );

    document.querySelectorAll(".plan-card").forEach(card => {

        card.classList.toggle(
            "selected",
            String(card.dataset.planId) === String(planId)
        );
    });

    if (!selectedPlan) {
        elements.payButton.disabled = true;
        return;
    }

    const code = getPlanCode(selectedPlan);

    if (code === "free" || Number(selectedPlan.price ?? 0) === 0) {

        elements.payButton.disabled = true;

        elements.payButtonText.textContent =
            "Plano gratuito";

        showMessage(
            "Este plano não necessita de pagamento. A gestão do plano gratuito é feita pelo backend.",
            "info"
        );

        return;
    }

    hideMessage();

    elements.payButton.disabled = false;

    elements.payButtonText.textContent =
        `Continuar com ${getPlanName(selectedPlan)}`;
}


/* ============================================================
   MÉTODO DE PAGAMENTO
============================================================ */

function getSelectedPaymentMethod() {

    const selected = document.querySelector(
        'input[name="paymentMethod"]:checked'
    );

    return selected ? selected.value : "bitpay";
}


function updatePaymentMethod() {

    const method = getSelectedPaymentMethod();

    elements.bitpayOptions.hidden = method !== "bitpay";

    elements.paddleOptions.hidden = method !== "paddle";

    document.querySelectorAll(".payment-method").forEach(label => {

        const input = label.querySelector("input");

        label.classList.toggle(
            "selected",
            input.checked
        );
    });

    updateBitPayFields();
}


function updateBitPayFields() {

    const type = elements.bitpayPaymentType.value;

    elements.bitpayPhoneGroup.hidden =
        type !== "multicaixa_express";
}


/* ============================================================
   BOTÃO PAGAR
============================================================ */

async function startPayment() {

    if (paymentInProgress) return;

    if (!checkAuthentication()) return;

    if (!selectedPlan) {

        showMessage(
            "Selecciona primeiro um plano.",
            "error"
        );

        return;
    }

    hideMessage();

    const method = getSelectedPaymentMethod();

    paymentInProgress = true;

    elements.payButton.disabled = true;

    elements.payButtonText.textContent =
        "A preparar pagamento...";

    try {

        if (method === "paddle") {

            await startPaddleCheckout();

        } else if (method === "bitpay") {

            await startBitPayCheckout();

        }

    } catch (error) {

        console.error("Erro no pagamento:", error);

        showMessage(
            error.message || "Não foi possível iniciar o pagamento.",
            "error"
        );

    } finally {

        paymentInProgress = false;

        elements.payButton.disabled = !selectedPlan;

        elements.payButtonText.textContent = selectedPlan
            ? `Continuar com ${getPlanName(selectedPlan)}`
            : "Selecciona um plano";
    }
}


/* ============================================================
   PADDLE SANDBOX
============================================================ */

async function startPaddleCheckout() {

    const planId = getPlanId(selectedPlan);

    if (!planId) {
        throw new Error("O identificador do plano é inválido.");
    }

    const data = await apiRequest(
        PAYMENT_ENDPOINTS.paddleCheckout,
        {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                plan_id: planId
            })
        }
    );

    if (!data.success) {
        throw new Error(
            data.message || "Não foi possível iniciar o Paddle."
        );
    }

    if (!data.client_token || !data.price_id) {
        throw new Error(
            "A resposta do Paddle não contém client_token ou price_id."
        );
    }

    if (!window.Paddle) {
        throw new Error(
            "A biblioteca Paddle.js não foi carregada."
        );
    }

    initializePaddle(data);

    window.Paddle.Checkout.open({

        items: [
            {
                priceId: data.price_id,
                quantity: 1
            }
        ],

        customer: data.customer || {},

        customData: data.custom_data || {},

        settings: {
            displayMode: "overlay",
            theme: "dark",
            locale: "pt"
        }
    });

    showMessage(
        "Checkout Paddle aberto. A assinatura só será activada após confirmação do pagamento pelo servidor.",
        "info"
    );
}


/* ============================================================
   INICIALIZAR PADDLE
============================================================ */

function initializePaddle(data) {

    if (paddleInitialized &&
        paddleTokenUsed === data.client_token) {
        return;
    }

    if (paddleInitialized &&
        paddleTokenUsed !== data.client_token) {

        throw new Error(
            "O Paddle já foi inicializado com outro token. Recarrega a página."
        );
    }

    if (data.environment === "sandbox") {

        window.Paddle.Environment.set("sandbox");
    }

    window.Paddle.Initialize({

        token: data.client_token,

        eventCallback: function(event) {

            console.log("Evento Paddle:", event);

            if (event.name === "checkout.completed") {

                showMessage(
                    "O checkout foi concluído. Estamos a aguardar a confirmação segura do servidor.",
                    "success"
                );

                refreshPaymentData();
            }

            if (event.name === "checkout.closed") {

                refreshPaymentData();
            }
        }
    });

    paddleInitialized = true;

    paddleTokenUsed = data.client_token;
}


/* ============================================================
   BITPAY ANGOLA

   IMPORTANTE:
   Esta rota ainda precisa de ser criada no main.py:

   POST /api/bitpay/checkout

   Deve receber:
   {
       "plan_id": 2,
       "payment_method": "multicaixa_express",
       "mobile": "933317418"
   }

   A resposta esperada pelo frontend:
   {
       "success": true,
       "checkout_url": "...",
       "payment_id": 123,
       "bitpay_payment_id": "pay_..."
   }

   Para Referência Multicaixa, pode devolver:
   {
       "reference": {
           "entity": "...",
           "number": "...",
           "expires_at": "..."
       }
   }

   A secret key BitPay permanece no servidor.
============================================================ */

async function startBitPayCheckout() {

    const planId = getPlanId(selectedPlan);

    if (!planId) {
        throw new Error("O identificador do plano é inválido.");
    }

    const paymentType = elements.bitpayPaymentType.value;

    const payload = {
        plan_id: planId,
        payment_method: paymentType
    };

    if (paymentType === "multicaixa_express") {

        const phone = elements.bitpayPhone.value.trim();

        if (!/^(?:\+244)?9[0-9]{8}$/.test(phone)) {

            throw new Error(
                "Introduz um número angolano válido, por exemplo 923000000."
            );
        }

        payload.mobile = phone;
    }

    const data = await apiRequest(
        PAYMENT_ENDPOINTS.bitpayCheckout,
        {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        }
    );

    if (!data.success) {

        throw new Error(
            data.message || "Não foi possível iniciar o pagamento BitPay."
        );
    }

    if (data.checkout_url) {

        showMessage(
            "A abrir o checkout seguro BitPay...",
            "info"
        );

        window.location.href = data.checkout_url;

        return;
    }

    if (data.reference) {

        displayBitPayReference(data.reference);

        return;
    }

    if (data.payment_id || data.bitpay_payment_id) {

        elements.bitpayResult.hidden = false;

        elements.bitpayResultText.textContent =
            "Pagamento criado. Aguarda a confirmação através do BitPay.";

        showMessage(
            "Pagamento iniciado. A tua assinatura será activada apenas depois da confirmação do webhook.",
            "info"
        );

        return;
    }

    throw new Error(
        "A resposta BitPay não contém checkout_url, referência ou identificador de pagamento."
    );
}


/* ============================================================
   MOSTRAR REFERÊNCIA MULTICAIXA
============================================================ */

function displayBitPayReference(reference) {

    elements.bitpayResult.hidden = false;

    elements.bitpayReferenceDetails.hidden = false;

    elements.bitpayResultText.textContent =
        "Utiliza os dados abaixo para efectuar o pagamento. A assinatura será activada após confirmação.";

    elements.bitpayEntity.textContent =
        reference.entity || "—";

    elements.bitpayReference.textContent =
        reference.number || "—";

    elements.bitpayExpiry.textContent =
        reference.expires_at
            ? formatDate(reference.expires_at)
            : "—";

    elements.bitpayResult.scrollIntoView({
        behavior: "smooth"
    });
}


/* ============================================================
   ASSINATURA ACTUAL
============================================================ */

async function loadCurrentSubscription() {

    try {

        const data = await apiRequest(
            PAYMENT_ENDPOINTS.subscription
        );

        if (!data.success) {
            throw new Error("Não foi possível consultar a assinatura.");
        }

        currentSubscription =
            data.subscription ||
            data;

        renderCurrentSubscription();

    } catch (error) {

        console.error(
            "Erro ao consultar assinatura:",
            error
        );

        elements.currentPlanName.textContent =
            "Indisponível";

        elements.currentPlanDetails.textContent =
            error.message;
    }
}


function renderCurrentSubscription() {

    const subscription = currentSubscription || {};

    const plan =
        subscription.plan ||
        subscription;

    elements.currentPlanName.textContent =
        plan.name ||
        subscription.plan_name ||
        "Plano Gratuito";

    const status =
        subscription.status ||
        "active";

    const expires =
        subscription.expires_at ||
        subscription.end_date ||
        subscription.valid_until;

    elements.currentPlanDetails.textContent =
        expires
            ? `Válido até ${formatDate(expires)}`
            : "A tua assinatura actual.";

    elements.subscriptionStatus.textContent =
        status === "active"
            ? "Activo"
            : status;
}


/* ============================================================
   HISTÓRICO DE PAGAMENTOS
============================================================ */

async function loadPaymentHistory() {

    elements.paymentsHistory.innerHTML = `
        <tr>
            <td colspan="5" class="empty-history">
                A carregar histórico...
            </td>
        </tr>
    `;

    try {

        const data = await apiRequest(
            PAYMENT_ENDPOINTS.history
        );

        if (!data.success || !Array.isArray(data.payments)) {

            throw new Error(
                "Não foi possível obter o histórico."
            );
        }

        renderPaymentHistory(data.payments);

    } catch (error) {

        console.error(
            "Erro no histórico:",
            error
        );

        elements.paymentsHistory.innerHTML = `
            <tr>
                <td colspan="5" class="empty-history">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}


function renderPaymentHistory(payments) {

    if (!payments.length) {

        elements.paymentsHistory.innerHTML = `
            <tr>
                <td colspan="5" class="empty-history">
                    Ainda não existem pagamentos.
                </td>
            </tr>
        `;

        return;
    }

    elements.paymentsHistory.innerHTML = "";

    payments.forEach(payment => {

        const date =
            payment.created_at ||
            payment.payment_date ||
            payment.created;

        const plan =
            payment.plan_name ||
            payment.plan ||
            payment.plan_code ||
            "—";

        const method =
            payment.payment_provider ||
            payment.payment_method ||
            "—";

        const amount =
            payment.amount ??
            payment.price ??
            0;

        const currency =
            payment.currency ||
            "AOA";

        const status =
            String(payment.status || "pending").toLowerCase();

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(formatDate(date))}</td>

            <td>${escapeHTML(plan)}</td>

            <td>${escapeHTML(method)}</td>

            <td>${escapeHTML(formatMoney(amount, currency))}</td>

            <td>
                <span class="payment-status ${escapeHTML(status)}">
                    ${escapeHTML(translatePaymentStatus(status))}
                </span>
            </td>
        `;

        elements.paymentsHistory.appendChild(row);
    });
}


function translatePaymentStatus(status) {

    const labels = {
        confirmed: "Confirmado",
        succeeded: "Confirmado",
        completed: "Concluído",
        pending: "Pendente",
        processing: "Em processamento",
        rejected: "Rejeitado",
        failed: "Falhou",
        cancelled: "Cancelado",
        canceled: "Cancelado",
        expired: "Expirado",
        unknown: "Por verificar"
    };

    return labels[status] || status;
}


/* ============================================================
   ACTUALIZAR DADOS
============================================================ */

async function refreshPaymentData() {

    await Promise.all([
        loadCurrentSubscription(),
        loadPaymentHistory()
    ]);
}


/* ============================================================
   EVENTOS
============================================================ */

document.querySelectorAll(
    'input[name="paymentMethod"]'
).forEach(input => {

    input.addEventListener(
        "change",
        updatePaymentMethod
    );
});


elements.bitpayPaymentType.addEventListener(
    "change",
    updateBitPayFields
);


elements.payButton.addEventListener(
    "click",
    startPayment
);


elements.refreshPayments.addEventListener(
    "click",
    refreshPaymentData
);


/* ============================================================
   INICIALIZAÇÃO
============================================================ */

async function initializePaymentsPage() {

    updatePaymentMethod();

    if (!checkAuthentication()) {

        elements.plansContainer.innerHTML = `
            <div class="loading-card">
                Inicia sessão para consultar os planos.
            </div>
        `;

        return;
    }

    await Promise.all([
        loadPlans(),
        loadCurrentSubscription(),
        loadPaymentHistory()
    ]);
}


document.addEventListener(
    "DOMContentLoaded",
    initializePaymentsPage
);


