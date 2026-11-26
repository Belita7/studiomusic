
const API_BASE_URL = "https://studiomusic.onrender.com";
const RESET_PASSWORD_ENDPOINT = `${API_BASE_URL}/auth/reset-password`;

const form = document.getElementById("resetPasswordForm");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const messageElement = document.getElementById("message");
const submitButton = document.getElementById("submitButton");
const buttonText = document.getElementById("buttonText");

function showMessage(message, type) {
    messageElement.textContent = message;
    messageElement.className = `message ${type}`;
}

function getResetToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const token = getResetToken();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!token) {
        showMessage(
            "O link de recuperação é inválido ou está incompleto. Solicita um novo link.",
            "error"
        );
        return;
    }

    if (password.length < 8) {
        showMessage(
            "A palavra-passe deve ter pelo menos 8 caracteres.",
            "error"
        );
        return;
    }

    if (password !== confirmPassword) {
        showMessage(
            "As palavras-passe não coincidem.",
            "error"
        );
        return;
    }

    submitButton.disabled = true;
    buttonText.textContent = "A guardar...";
    showMessage("A actualizar a palavra-passe...", "info");

    try {
        const response = await fetch(RESET_PASSWORD_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token: token,
                new_password: password
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.detail ||
                data.message ||
                "Não foi possível actualizar a palavra-passe."
            );
        }

        showMessage(
            data.message ||
            "Palavra-passe alterada com sucesso. Já podes iniciar sessão.",
            "success"
        );

        form.reset();

        // Remove o token da barra de endereço após a utilização.
        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );

        buttonText.textContent = "Palavra-passe alterada";

    } catch (error) {
        showMessage(
            error.message ||
            "Ocorreu um erro. Tenta novamente mais tarde.",
            "error"
        );

        submitButton.disabled = false;
        buttonText.textContent = "Guardar nova palavra-passe";
    }
});
