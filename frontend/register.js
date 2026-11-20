// ============================================================
// StudioMusic.AI
// register.js
// Tela de registro
// ============================================================

"use strict";


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const API_BASE_URL = "https://studiomusic.onrender.com";


// ============================================================
// ELEMENTOS
// ============================================================

const registerForm = document.getElementById("registerForm");

const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput =
    document.getElementById("confirmPassword");

const termsInput = document.getElementById("terms");

const registerButton =
    document.getElementById("registerButton");

const registerButtonText =
    document.getElementById("registerButtonText");

const registerButtonIcon =
    document.getElementById("registerButtonIcon");

const registerMessage =
    document.getElementById("registerMessage");

const togglePassword =
    document.getElementById("togglePassword");

const toggleConfirmPassword =
    document.getElementById("toggleConfirmPassword");

const strengthProgress =
    document.getElementById("strengthProgress");

const strengthText =
    document.getElementById("strengthText");

const googleRegister =
    document.getElementById("googleRegister");

const termsLink =
    document.getElementById("termsLink");

const privacyLink =
    document.getElementById("privacyLink");


// ============================================================
// MOSTRAR / ESCONDER SENHA
// ============================================================

function togglePasswordVisibility(
    input,
    button
) {

    if (!input || !button) {
        return;
    }

    const icon =
        button.querySelector(".material-icons");

    if (input.type === "password") {

        input.type = "text";

        if (icon) {
            icon.textContent = "visibility_off";
        }

        button.setAttribute(
            "aria-label",
            "Ocultar senha"
        );

    } else {

        input.type = "password";

        if (icon) {
            icon.textContent = "visibility";
        }

        button.setAttribute(
            "aria-label",
            "Mostrar senha"
        );
    }
}


if (togglePassword) {

    togglePassword.addEventListener(
        "click",
        function () {

            togglePasswordVisibility(
                passwordInput,
                togglePassword
            );

        }
    );
}


if (toggleConfirmPassword) {

    toggleConfirmPassword.addEventListener(
        "click",
        function () {

            togglePasswordVisibility(
                confirmPasswordInput,
                toggleConfirmPassword
            );

        }
    );
}


// ============================================================
// FORÇA DA SENHA
// ============================================================

function calculatePasswordStrength(
    password
) {

    let score = 0;

    if (!password) {
        return 0;
    }

    if (password.length >= 8) {
        score++;
    }

    if (password.length >= 12) {
        score++;
    }

    if (/[a-z]/.test(password)) {
        score++;
    }

    if (/[A-Z]/.test(password)) {
        score++;
    }

    if (/[0-9]/.test(password)) {
        score++;
    }

    if (/[^A-Za-z0-9]/.test(password)) {
        score++;
    }

    return Math.min(score, 6);
}


function updatePasswordStrength() {

    if (!passwordInput) {
        return;
    }

    const password =
        passwordInput.value;

    const score =
        calculatePasswordStrength(password);

    if (!strengthProgress || !strengthText) {
        return;
    }


    if (!password) {

        strengthProgress.style.width = "0%";

        strengthText.textContent =
            "Senha deve ter pelo menos 8 caracteres";

        return;
    }


    const percentage =
        Math.round((score / 6) * 100);

    strengthProgress.style.width =
        `${percentage}%`;


    if (score <= 2) {

        strengthProgress.style.background =
            "#ff4d5a";

        strengthText.textContent =
            "Senha fraca";

    } else if (score <= 4) {

        strengthProgress.style.background =
            "#ffb020";

        strengthText.textContent =
            "Senha média";

    } else {

        strengthProgress.style.background =
            "#27c77a";

        strengthText.textContent =
            "Senha forte";
    }
}


if (passwordInput) {

    passwordInput.addEventListener(
        "input",
        updatePasswordStrength
    );
}


// ============================================================
// MENSAGENS
// ============================================================

function showMessage(
    message,
    type = "error"
) {

    if (!registerMessage) {
        return;
    }

    registerMessage.textContent =
        message;

    registerMessage.className =
        `message ${type}`;

    registerMessage.hidden = false;
}


function hideMessage() {

    if (!registerMessage) {
        return;
    }

    registerMessage.hidden = true;

    registerMessage.textContent = "";

    registerMessage.className =
        "message";
}


// ============================================================
// NORMALIZAR EMAIL
// ============================================================

function normalizeEmail(
    email
) {

    return email
        .trim()
        .toLowerCase();
}


// ============================================================
// VALIDAR EMAIL
// ============================================================

function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}


// ============================================================
// VALIDAR SENHA
// ============================================================

function validatePassword(
    password
) {

    if (password.length < 8) {

        return {
            valid: false,
            message:
                "A senha deve ter pelo menos 8 caracteres."
        };
    }


    if (password.length > 128) {

        return {
            valid: false,
            message:
                "A senha não pode ter mais de 128 caracteres."
        };
    }


    return {
        valid: true,
        message: ""
    };
}


// ============================================================
// VALIDAR FORMULÁRIO
// ============================================================

function validateForm() {

    const name =
        nameInput.value.trim();

    const email =
        normalizeEmail(
            emailInput.value
        );

    const password =
        passwordInput.value;

    const confirmPassword =
        confirmPasswordInput.value;


    if (name.length < 2) {

        return {
            valid: false,
            message:
                "Digite o seu nome."
        };
    }


    if (name.length > 100) {

        return {
            valid: false,
            message:
                "O nome não pode ter mais de 100 caracteres."
        };
    }


    if (!isValidEmail(email)) {

        return {
            valid: false,
            message:
                "Digite um endereço de email válido."
        };
    }


    const passwordValidation =
        validatePassword(password);


    if (!passwordValidation.valid) {

        return passwordValidation;
    }


    if (password !== confirmPassword) {

        return {
            valid: false,
            message:
                "As senhas não coincidem."
        };
    }


    if (!termsInput.checked) {

        return {
            valid: false,
            message:
                "É necessário aceitar os termos de utilização."
        };
    }


    return {
        valid: true,
        message: ""
    };
}


// ============================================================
// ESTADO DO BOTÃO
// ============================================================

function setLoading(
    loading
) {

    if (
        !registerButton ||
        !registerButtonText ||
        !registerButtonIcon
    ) {
        return;
    }


    registerButton.disabled =
        loading;


    if (loading) {

        registerButtonText.textContent =
            "Criando conta...";

        registerButtonIcon.textContent =
            "hourglass_top";

    } else {

        registerButtonText.textContent =
            "Criar conta";

        registerButtonIcon.textContent =
            "person_add";
    }
}


// ============================================================
// REGISTRO NO BACKEND
// ============================================================

async function registerUser() {

    const name =
        nameInput.value.trim();

    const email =
        normalizeEmail(
            emailInput.value
        );

    const password =
        passwordInput.value;


    const response =
        await fetch(
            `${API_BASE_URL}/auth/register`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })
            }
        );


    let data = null;


    try {

        data =
            await response.json();

    } catch (error) {

        data = null;
    }


    if (!response.ok) {

        let message =
            "Não foi possível criar a conta.";


        if (data) {

            if (typeof data.detail === "string") {

                message =
                    data.detail;

            } else if (
                Array.isArray(data.detail)
            ) {

                message =
                    data.detail
                        .map(
                            item =>
                                item.msg || ""
                        )
                        .filter(Boolean)
                        .join(" ");

            } else if (
                typeof data.message === "string"
            ) {

                message =
                    data.message;
            }
        }


        throw new Error(message);
    }


    return data;
}


// ============================================================
// SUBMIT
// ============================================================

if (registerForm) {

    registerForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            hideMessage();


            // ------------------------------------------------
            // VALIDAR
            // ------------------------------------------------

            const validation =
                validateForm();


            if (!validation.valid) {

                showMessage(
                    validation.message,
                    "error"
                );

                return;
            }


            // ------------------------------------------------
            // LOADING
            // ------------------------------------------------

            setLoading(true);


            try {

                // --------------------------------------------
                // ENVIAR AO BACKEND
                // --------------------------------------------

                const data =
                    await registerUser();


                // --------------------------------------------
                // SUCESSO
                // --------------------------------------------

                showMessage(
                    data?.message ||
                    "Conta criada com sucesso!",
                    "success"
                );


                // --------------------------------------------
                // REDIRECIONAR PARA LOGIN
                // --------------------------------------------

                setTimeout(
                    function () {

                        window.location.href =
                            "login.html";

                    },
                    1200
                );


            } catch (error) {

                console.error(
                    "Erro no registro:",
                    error
                );


                showMessage(
                    error.message ||
                    "Não foi possível criar a conta.",
                    "error"
                );


                setLoading(false);
            }

        }
    );
}


// ============================================================
// GOOGLE
// ============================================================

if (googleRegister) {

    googleRegister.addEventListener(
        "click",
        function () {

            showMessage(
                "O registro com Google será ativado numa próxima etapa.",
                "info"
            );

        }
    );
}


// ============================================================
// TERMOS
// ============================================================

if (termsLink) {

    termsLink.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            showMessage(
                "Os Termos de utilização serão disponibilizados nesta etapa do projeto.",
                "info"
            );

        }
    );
}


// ============================================================
// PRIVACIDADE
// ============================================================

if (privacyLink) {

    privacyLink.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            showMessage(
                "A Política de privacidade será disponibilizada nesta etapa do projeto.",
                "info"
            );

        }
    );
}


// ============================================================
// CONFIRMAÇÃO VISUAL DA SENHA
// ============================================================

if (confirmPasswordInput) {

    confirmPasswordInput.addEventListener(
        "input",
        function () {

            if (
                !confirmPasswordInput.value
            ) {
                return;
            }


            if (
                passwordInput.value ===
                confirmPasswordInput.value
            ) {

                confirmPasswordInput.style.borderColor =
                    "#27c77a";

            } else {

                confirmPasswordInput.style.borderColor =
                    "#ff4d5a";
            }

        }
    );
}


// ============================================================
// LIMPAR BORDA AO SAIR
// ============================================================

if (confirmPasswordInput) {

    confirmPasswordInput.addEventListener(
        "blur",
        function () {

            if (
                !confirmPasswordInput.value
            ) {

                confirmPasswordInput.style.borderColor =
                    "";

            }

        }
    );
}


// ============================================================
// LOG
// ============================================================

console.log(
    "StudioMusic.AI - register.js carregado."
);

