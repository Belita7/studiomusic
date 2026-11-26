"""Password recovery endpoints for StudioMusic.AI.

Uses PostgreSQL via database.get_connection and Resend's transactional email API.
"""
import hashlib
import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_connection, get_user_by_email

logger = logging.getLogger("studiomusic.password_reset")
router = APIRouter(tags=["password-recovery"])

RESET_TOKEN_MINUTES = 30
RESET_REQUEST_LIMIT = 3
RESET_REQUEST_WINDOW_MINUTES = 60
PBKDF2_ITERATIONS = 310_000


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


def _now():
    return datetime.utcnow()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return (
        "pbkdf2_sha256$"
        f"{PBKDF2_ITERATIONS}$"
        f"{salt.hex()}$"
        f"{derived.hex()}"
    )


def _ensure_reset_table():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                used_at TEXT
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
            ON password_reset_tokens(user_id, created_at)
        """)


def _send_reset_email(email: str, reset_url: str):
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip()

    if not api_key or not sender:
        raise RuntimeError(
            "RESEND_API_KEY e PASSWORD_RESET_FROM_EMAIL têm de estar configuradas."
        )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#222">
      <h2>Recuperar palavra-passe — StudioMusic.AI</h2>
      <p>Recebemos um pedido para definir uma nova palavra-passe na tua conta.</p>
      <p><a href="{reset_url}" style="display:inline-block;padding:12px 20px;background:#8b5cf6;color:#fff;text-decoration:none;border-radius:8px">Definir nova palavra-passe</a></p>
      <p>Este link expira em {RESET_TOKEN_MINUTES} minutos e só pode ser utilizado uma vez.</p>
      <p>Se não pediste esta alteração, ignora este e-mail. A tua palavra-passe não será alterada.</p>
      <p>StudioMusic.AI</p>
    </div>
    """
    text_body = (
        "Recebemos um pedido para recuperar a palavra-passe da tua conta StudioMusic.AI.\n"
        f"Abre este link para definires uma nova palavra-passe: {reset_url}\n"
        f"O link expira em {RESET_TOKEN_MINUTES} minutos e só pode ser utilizado uma vez.\n"
        "Se não fizeste este pedido, ignora este e-mail."
    )

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": sender,
            "to": [email],
            "subject": "Recuperar palavra-passe — StudioMusic.AI",
            "html": html,
            "text": text_body,
        },
        timeout=20,
    )
    if response.status_code not in (200, 201):
        logger.error("Resend rejeitou o envio de recuperação (HTTP %s).", response.status_code)
        raise RuntimeError("O serviço de e-mail não aceitou o envio.")
    return response.json()


@router.post("/auth/forgot-password")
def forgot_password(data: ForgotPasswordRequest):
    email = data.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Introduz um endereço de e-mail válido.")

    if not os.getenv("RESEND_API_KEY", "").strip() or not os.getenv("PASSWORD_RESET_FROM_EMAIL", "").strip():
        raise HTTPException(
            status_code=503,
            detail="O serviço de recuperação por e-mail ainda não está configurado.",
        )

    _ensure_reset_table()
    user = get_user_by_email(email)

    # Resposta neutra: não revela se a conta existe.
    generic_response = {
        "success": True,
        "message": "Se existir uma conta associada a este e-mail, receberás instruções para recuperar a palavra-passe.",
    }
    if not user or not user.get("is_active", 1):
        return generic_response

    now = _now()
    created_after = (now - timedelta(minutes=RESET_REQUEST_WINDOW_MINUTES)).isoformat()
    with get_connection() as connection:
        recent = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM password_reset_tokens
            WHERE user_id = ? AND created_at >= ?
            """,
            (user["id"], created_after),
        ).fetchone()
        if int(recent["total"] or 0) >= RESET_REQUEST_LIMIT:
            return generic_response

    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    expires_at = (now + timedelta(minutes=RESET_TOKEN_MINUTES)).isoformat()
    created_at = now.isoformat()
    frontend_url = os.getenv(
        "FRONTEND_URL", "https://studiomusic-r63.pages.dev"
    ).strip().rstrip("/")
    reset_url = f"{frontend_url}/reset-password.html?token={raw_token}"

    with get_connection() as connection:
        # Um pedido novo invalida links anteriores ainda não utilizados.
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE user_id = ? AND used_at IS NULL
            """,
            (created_at, user["id"]),
        )
        connection.execute(
            """
            INSERT INTO password_reset_tokens
                (token_hash, user_id, expires_at, created_at, used_at)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (token_hash, user["id"], expires_at, created_at),
        )

    try:
        _send_reset_email(email, reset_url)
    except Exception:
        logger.exception("Falha ao enviar e-mail de recuperação.")
        with get_connection() as connection:
            connection.execute(
                "DELETE FROM password_reset_tokens WHERE token_hash = ?",
                (token_hash,),
            )
        raise HTTPException(
            status_code=502,
            detail="Não foi possível enviar o e-mail de recuperação. Tenta novamente mais tarde.",
        )

    return generic_response


@router.post("/auth/reset-password")
def reset_password(data: ResetPasswordRequest):
    token_hash = _hash_token(data.token.strip())
    now = _now()
    now_iso = now.isoformat()
    _ensure_reset_table()

    with get_connection() as connection:
        token_row = connection.execute(
            """
            SELECT token_hash, user_id, expires_at, used_at
            FROM password_reset_tokens
            WHERE token_hash = ?
            FOR UPDATE
            """,
            (token_hash,),
        ).fetchone()

        if (
            not token_row
            or token_row["used_at"] is not None
            or str(token_row["expires_at"]) <= now_iso
        ):
            raise HTTPException(
                status_code=400,
                detail="O link de recuperação é inválido ou expirou. Solicita um novo link.",
            )

        password_hash = _hash_password(data.new_password)
        updated = connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, token_row["user_id"]),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=400, detail="Não foi possível actualizar a palavra-passe.")

        # Token consumido e todos os outros links da conta invalidados.
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE user_id = ? AND used_at IS NULL
            """,
            (now_iso, token_row["user_id"]),
        )

    return {
        "success": True,
        "message": "Palavra-passe alterada com sucesso. Já podes iniciar sessão.",
    }
