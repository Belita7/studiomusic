// ============================================================
// StudioMusic.AI - PLANOS.JS
// ============================================================

"use strict";

const API_BASE_URL = "https://studiomusic.onrender.com";
const PLANS_ENDPOINT = `${API_BASE_URL}/api/plans`;
const MY_SUB_ENDPOINT = `${API_BASE_URL}/api/subscriptions/me`;
const PAYMENTS_ENDPOINT = `${API_BASE_URL}/api/payments`;

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

// Obter token
function getToken() {
    return localStorage.getItem("access_token") || localStorage.getItem("token");
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
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "login.html";
    });
}

// Fechar modal
if (closeModal) {
    closeModal.addEventListener("click", () => paymentModal.style.display = "none");
}

// ============================================================
// CARREGAR DADOS E PLANOS
// ============================================================
async function initPage() {
    const token = getToken();
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // 1. Carregar subscrição atual
        const subRes = await fetch(MY_SUB_ENDPOINT, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const subData = await subRes.json();

        if (subData.has_subscription && subData.subscription) {
            const sub = subData.subscription;
            subStatusText.innerHTML = `Plano ativo: <strong>${sub.plan_name}</strong> (Expira a: ${new Date(sub.expires_at).toLocaleDateString()})`;
        } else {
            const defaultPlan = subData.default_plan ? subData.default_plan.name : "Gratuito";
            subStatusText.innerHTML = `Estás atualmente no plano <strong>${defaultPlan}</strong>.`;
        }

        // 2. Carregar lista de planos
        const plansRes = await fetch(PLANS_ENDPOINT);
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
        const isFree = plan.price === 0;
        const card = document.createElement("div");
        card.className = `plan-card ${plan.code === 'basic' ? 'featured' : ''}`;

        card.innerHTML = `
            <div>
                <h3 class="plan-title">${plan.name}</h3>
                <div class="plan-price">${plan.price.toLocaleString()} <span>${plan.currency} / ${plan.duration_days} dias</span></div>
                <p class="plan-desc">${plan.description || 'Sem descrição'}</p>
                <ul class="plan-features">
                    <li><span class="material-icons">check_circle</span> Duração máx. de música: ${plan.max_song_duration}s</li>
                    <li><span class="material-icons">check_circle</span> Limite mensal: ${plan.monthly_song_limit} músicas</li>
                </ul>
            </div>
            <button class="btn-submit select-plan-btn" data-id="${plan.id}" data-name="${plan.name}" data-price="${plan.price}">
                ${isFree ? 'Plano Atual / Gratuito' : 'Submeter Subscrição'}
            </button>
        `;

        plansGrid.appendChild(card);
    });

    // Eventos de clique nos botões de subscrição
    document.querySelectorAll(".select-plan-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const price = parseFloat(e.target.dataset.price);
            if (price === 0) {
                showMessage("O plano gratuito já está disponível por defeito.", "success");
                return;
            }

            selectedPlanId = e.target.dataset.id;
            modalPlanName.textContent = `Plano: ${e.target.dataset.name} (${price.toLocaleString()} AOA)`;
            paymentModal.style.display = "flex";
        });
    });
}

// Submeter Pagamento
if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener("click", async () => {
        const token = getToken();
        const paymentMethod = paymentMethodSelect.value;
        const transactionReference = transactionRefInput.value.trim();

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

            if (!response.ok) {
                throw new Error(data.detail || "Erro ao criar pedido de pagamento.");
            }

            paymentModal.style.display = "none";
            showMessage("Pedido de pagamento criado com sucesso! Aguarde a confirmação do administrador.", "success");
            
            // Recarregar dados
            setTimeout(initPage, 2000);

        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            confirmPaymentBtn.disabled = false;
            confirmPaymentBtn.textContent = "Submeter Pedido de Pagamento";
        }
    });
}

document.addEventListener("DOMContentLoaded", initPage);


