// ============================================================
// StudioMusic.AI - LOGIN.JS
// Login único para utilizadores e administradores
// ============================================================

"use strict";

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const API_BASE_URL = "https://studiomusic.onrender.com";

const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;
const PROFILE_ENDPOINT = `${API_BASE_URL}/auth/me`;

const USER_PAGE = "index.html";
const ADMIN_PAGE = "admin.html";


// ============================================================
// ELEMENTOS
// ============================================================

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMe = document.getElementById("rememberMe");
const loginButton = document.getElementById("loginButton");
const togglePasswordButton = document.getElementById("togglePassword");
const googleLoginButton = document.getElementById("googleLoginButton");
const loginMessage = document.getElementById("loginMessage");


// ============================================================
// MENSAGENS
// ============================================================

function showMessage(message, type = "error") {

    if (!loginMessage) return;

    loginMessage.textContent = message;
    loginMessage.className = `message show ${type}`;
}


function hideMessage() {

    if (!loginMessage) return;

    loginMessage.textContent = "";
    loginMessage.className = "message";
}


// ============================================================
// MOSTRAR / OCULTAR PASSWORD
// ============================================================

if (togglePasswordButton && passwordInput) {

    togglePasswordButton.addEventListener("click", () => {

        const isPassword =
            passwordInput.type === "password";

        passwordInput.type =
            isPassword ? "text" : "password";

        const icon =
            togglePasswordButton.querySelector(".material-icons");

        if (icon) {

            icon.textContent =
                isPassword
                    ? "visibility_off"
                    : "visibility";
        }

    });
}


// ============================================================
// BOTÃO LOADING
// ============================================================

function setLoading(isLoading) {

    if (!loginButton) return;

    loginButton.disabled = isLoading;

    const buttonText =
        loginButton.querySelector(".button-text");

    const buttonIcon =
        loginButton.querySelector(".button-icon");

    if (isLoading) {

        if (buttonText) {
            buttonText.textContent = "A iniciar sessão...";
        }

        if (buttonIcon) {
            buttonIcon.textContent = "hourglass_empty";
        }

    } else {

        if (buttonText) {
            buttonText.textContent = "Iniciar sessão";
        }

        if (buttonIcon) {
            buttonIcon.textContent = "arrow_forward";
        }

    }
}


// ============================================================
// VALIDAR FORMULÁRIO
// ============================================================

function validateForm() {

    if (!emailInput || !passwordInput) {
        showMessage("Formulário de login incompleto.");
        return false;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {

        showMessage("Introduz o teu endereço de e-mail.");
        emailInput.focus();

        return false;
    }

    if (!emailInput.validity.valid) {

        showMessage("Introduz um endereço de e-mail válido.");
        emailInput.focus();

        return false;
    }

    if (!password) {

        showMessage("Introduz a tua palavra-passe.");
        passwordInput.focus();

        return false;
    }

    return true;
}


// ============================================================
// LIMPAR SESSÃO ANTIGA
// ============================================================

function clearSession() {

    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
}


// ============================================================
// GUARDAR SESSÃO
// ============================================================

function saveSession(token, user) {

    if (!token) {
        throw new Error("Token de autenticação não recebido.");
    }

    clearSession();

    // Mantemos localStorage para compatibilidade
    // com o app.js e as outras páginas existentes.

    localStorage.setItem("access_token", token);
    localStorage.setItem("token", token);

    if (user) {

        localStorage.setItem(
            "user",
            JSON.stringify(user)
        );
    }
}


// ============================================================
// CONSULTAR UTILIZADOR AUTENTICADO
// ============================================================

async function getAuthenticatedUser(token) {

    const response = await fetch(PROFILE_ENDPOINT, {

        method: "GET",

        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
        },

        cache: "no-store"
    });

    if (!response.ok) {

        throw new Error(
            "Não foi possível confirmar os dados da conta."
        );
    }

    const data = await response.json();

    // Compatibilidade com respostas:
    // { user: {...} }
    // ou diretamente {...}

    const user = data.user || data;

    if (!user || typeof user !== "object" || !user.id) {

        throw new Error(
            "O servidor devolveu dados de utilizador inválidos."
        );
    }

    return user;
}


// ============================================================
// IDENTIFICAR ADMINISTRADOR
// ============================================================

function isAdministrator(user) {

    return (
        user.is_admin === true ||
        user.is_admin === 1
    );
}


// ============================================================
// LOGIN
// ============================================================

async function loginUser(event) {

    event.preventDefault();

    hideMessage();

    if (!validateForm()) {
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    setLoading(true);

    try {

        // ====================================================
        // ENVIAR CREDENCIAIS
        // ====================================================

        const response = await fetch(LOGIN_ENDPOINT, {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },

            body: JSON.stringify({
                email,
                password
            })
        });

        const responseText = await response.text();

        let data = {};

        try {

            data = responseText
                ? JSON.parse(responseText)
                : {};

        } catch {

            throw new Error(
                "O servidor devolveu uma resposta inválida."
            );
        }

        // ====================================================
        // TRATAR ERROS
        // ====================================================

        if (!response.ok) {

            let errorMessage =
                data.detail ||
                data.message ||
                data.error ||
                "Não foi possível iniciar sessão.";

            if (Array.isArray(errorMessage)) {

                errorMessage = errorMessage
                    .map(item => item.msg || JSON.stringify(item))
                    .join(" ");
            }

            if (response.status === 401) {

                errorMessage =
                    "E-mail ou palavra-passe incorretos.";

            } else if (response.status === 403) {

                errorMessage =
                    "Esta conta não tem autorização para entrar.";

            } else if (response.status === 404) {

                errorMessage =
                    "A rota de login não foi encontrada.";

            } else if (response.status === 422) {

                errorMessage =
                    "Os dados enviados são inválidos.";

            } else if (response.status >= 500) {

                errorMessage =
                    "Erro interno do servidor.";
            }

            throw new Error(errorMessage);
        }

        // ====================================================
        // OBTER TOKEN
        // ====================================================

        const token =
            data.access_token ||
            data.token ||
            data.accessToken;

        if (!token) {

            throw new Error(
                "O servidor não devolveu o token de autenticação."
            );
        }

        // ====================================================
        // CONFIRMAR IDENTIDADE NO BACKEND
        // ====================================================

        const user = await getAuthenticatedUser(token);

        // ====================================================
        // GUARDAR SESSÃO
        // ====================================================

        saveSession(token, user);

        // ====================================================
        // DEFINIR DESTINO
        // ====================================================

        const destination = isAdministrator(user)
            ? ADMIN_PAGE
            : USER_PAGE;

        // ====================================================
        // MENSAGEM DE SUCESSO
        // ====================================================

        if (isAdministrator(user)) {

            showMessage(
                "Administrador autenticado! A abrir o painel...",
                "success"
            );

        } else {

            showMessage(
                "Sessão iniciada com sucesso! A entrar...",
                "success"
            );
        }

        // ====================================================
        // REDIRECIONAR
        // ====================================================

        setTimeout(() => {

            window.location.replace(destination);

        }, 700);

    } catch (error) {

        console.error("Erro no login:", error);

        showMessage(
            error.message ||
            "Ocorreu um erro ao iniciar sessão."
        );

    } finally {

        setLoading(false);
    }
}


// ============================================================
// FORMULÁRIO
// ============================================================

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        loginUser
    );
}


// ============================================================
// LIMPAR ERROS
// ============================================================

if (emailInput) {

    emailInput.addEventListener(
        "input",
        hideMessage
    );
}

if (passwordInput) {

    passwordInput.addEventListener(
        "input",
        hideMessage
    );
}


// ============================================================
// GOOGLE
// ============================================================

if (googleLoginButton) {

    googleLoginButton.addEventListener("click", () => {

        showMessage(
            "O login com Google ainda não está configurado.",
            "info"
        );
    });
}
