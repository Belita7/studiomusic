
"use strict";

/* ============================================================
   StudioMusic.AI
   Pedido de recuperação de palavra-passe
   ============================================================ */

const API_BASE_URL = "https://studiomusic.onrender.com";

const FORGOT_PASSWORD_ENDPOINT =
    `${API_BASE_URL}/auth/forgot-password`;


/* ============================================================
   ELEMENTOS
   ============================================================ */

const form = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const submitButton = document.getElementById("submitButton");
const buttonText = document.getElementById("buttonText");
const messageBox = document.getElementById("message");


/* ============================================================
   MENSAGENS
   ============================================================ */

function showMessage(message, type = "info") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message ${type}`;
    messageBox.hidden = false;
}

function hideMessage() {
    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.className = "message";
    messageBox.hidden = true;
}


/* ============================================================
   LOADING
   ============================================================ */

function setLoading(loading) {
    if (!submitButton) return;

    submitButton.disabled = loading;

    if (buttonText) {
        buttonText.textContent = loading
            ? "A enviar..."
            : "Enviar instruções";
    }
}


/* ============================================================
   ENVIAR PEDIDO
   ============================================================ */

async function requestPasswordReset(event) {
    event.preventDefault();
    hideMessage();

    const email = emailInput?.value.trim().toLowerCase();

    if (!email) {
        showMessage(
            "Introduz o endereço de e-mail da tua conta.",
            "error"
        );
        emailInput?.focus();
        return;
    }

    if (!emailInput.checkValidity()) {
        showMessage(
            "Introduz um endereço de e-mail válido.",
            "error"
        );
        emailInput.focus();
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(
            FORGOT_PASSWORD_ENDPOINT,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ email })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            const detail =
                data.detail ||
                data.message ||
                "Não foi possível processar o pedido. Tenta novamente.";

            throw new Error(
                Array.isArray(detail)
                    ? "Verifica os dados introduzidos."
                    : detail
            );
        }

        /*
         * O backend deve devolver uma mensagem neutra,
         * sem revelar se o e-mail existe na base de dados.
         */
        showMessage(
            data.message ||
            "Se existir uma conta associada a este e-mail, " +
            "receberás instruções para recuperar a palavra-passe.",
            "success"
        );

        form.reset();

    } catch (error) {
        console.error("Erro ao solicitar recuperação:", error);

        showMessage(
            error.message ||
            "Não foi possível enviar o pedido. Verifica a tua ligação e tenta novamente.",
            "error"
        );

    } finally {
        setLoading(false);
    }
}


/* ============================================================
   EVENTOS
   ============================================================ */

if (form) {
    form.addEventListener("submit", requestPasswordReset);
}
