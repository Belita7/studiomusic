# ============================================================
# StudioMusic.AI
# main.py
#
# Backend principal
#
# Compatível com:
# - database.py PostgreSQL (psycopg2)
# - app.js atual
# - JWT
# - Usuários
# - Músicas privadas
# - Músicas públicas
# - Favoritos
# - Histórico
# - Comunidade futura
# - Admin futuro
# - Stable Audio 2.5
# ============================================================

from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    Header,
    Query,
    UploadFile,
    File,
    Form,
    Request
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from huggingface_hub import InferenceClient
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Any
from functools import lru_cache
from decimal import Decimal

import os
import re
import uuid
import hashlib
import hmac
import logging
import secrets
import asyncio
import json


import requests
import jwt
import time

logger = logging.getLogger("studiomusic")

# ============================================================
# 1.DATABASE
# ============================================================

from database import (
    init_database,
    add_cover_column,
    add_public_column,
    create_indexes,
    initialize_default_plans,
    migrate_international_billing,
    get_connection,
    create_user,
    get_user_by_id,
    get_user_by_email,
    get_all_users,
    update_user_active,
    ensure_bitpay_webhook_table,
    update_user_profile,
    update_user_photo,
    update_user_password,

    create_song,
    get_song,
    get_songs,
    get_public_songs,
    get_public_song,
    update_song,
    delete_song,
    set_song_public,

    add_favorite,
    remove_favorite,
    is_favorite,
    get_favorites,

    add_history,
    remove_history,
    get_history,
    clear_history,
    
        # PLANOS
    get_all_plans,
    get_plan_by_id,
    get_plan_by_code,

    # SUBSCRIÇÕES
    create_subscription,
    get_user_subscription,
    get_user_subscriptions,

    # PAGAMENTOS
    create_payment,
    get_payment_by_id,
    get_user_payments,
    get_all_payments,
    update_payment_status,
    confirm_payment_and_activate_subscription,
    activate_payment_credits,
    consume_user_credit,
    restore_user_credit,
    get_user_credit_balance,
    get_user_credit_summary,
    update_payment_proof,
    get_user_profile_stats,
    get_statistics,
    
    # COMUNIDADE
    get_user_community_songs,
    get_user_community_stats,
    community_like_count, 
    community_has_like, 
    community_set_like,
    community_follow_count, 
    community_is_following, 
    community_set_follow,
    register_community_view,
    get_community_song_views,
    get_user_community_views
)
# ============================================================
#2.CONFIGURAÇÃO
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(
    BASE_DIR / ".env"
)

FRONTEND_DIR = BASE_DIR.parent / "frontend"

MUSIC_DIR = BASE_DIR / "music"
COVERS_DIR = BASE_DIR / "covers"
AVATARS_DIR = BASE_DIR / "avatars"


MUSIC_DIR.mkdir(
    parents=True,
    exist_ok=True
)

COVERS_DIR.mkdir(
    parents=True,
    exist_ok=True
)

AVATARS_DIR.mkdir(
    parents=True,
    exist_ok=True
)
# ============================================================
# COMPROVATIVOS DE PAGAMENTO
# ============================================================

PAYMENT_PROOFS_DIR = (
    Path(__file__).resolve().parent
    / "payment_proofs"
)

PAYMENT_PROOFS_DIR.mkdir(
    parents=True,
    exist_ok=True
)

MAX_PAYMENT_PROOF_SIZE = 5 * 1024 * 1024

ALLOWED_PAYMENT_PROOF_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf"
}


# ============================================================
# 3.GERAÇÃO AUTOMÁTICA DE CAPAS — HUGGING FACE
# ============================================================

def generate_music_cover(title: str, music_prompt: str):
    """
    Gera uma capa quadrada e guarda a imagem localmente.
    Devolve o endereço público da capa ou None se não estiver
    configurado o Hugging Face.
    """

    hf_token = os.getenv("HF_TOKEN")
    model = os.getenv(
        "HF_IMAGE_MODEL",
        "black-forest-labs/FLUX.1-schnell"
    )

    if not hf_token:
        print("HF_TOKEN não configurado. A música será mantida sem capa.")
        return None

    visual_prompt = f"""
    Create a professional square album cover for a music streaming app.
    Music title: {title}.
    Music style and description: {music_prompt}.
    Create striking, polished album artwork inspired by the musical mood.
    High quality, visually clear, balanced composition, square format.
    No letters, no text, no watermark, no logos.
    """

    client = InferenceClient(api_key=hf_token)

    image = client.text_to_image(
        visual_prompt,
        model=model
    )

    filename = f"{uuid.uuid4().hex}.png"
    image_path = COVERS_DIR / filename
    image.save(image_path, format="PNG")

    return f"/covers/{filename}"

# ============================================================
# 4.VARIÁVEIS DE AMBIENTE
# ============================================================

BITPAY_ENV = os.getenv(
    "BITPAY_ENV",
    "sandbox"
).strip().lower()

BITPAY_SK = os.getenv(
    "BITPAY_SK",
    ""
).strip()

BITPAY_WEBHOOK_SECRET = os.getenv(
    "BITPAY_WEBHOOK_SECRET",
    ""
).strip()

BITPAY_API_BASE = os.getenv(
    "BITPAY_API_BASE",
    "https://api-sandbox.bitpay.ao/v1"
).strip().rstrip("/")

if BITPAY_ENV not in {"sandbox", "production"}:
    raise RuntimeError(
        "BITPAY_ENV deve ser sandbox ou production."
    )

PADDLE_ENV = os.getenv(
    "PADDLE_ENV",
    "sandbox"
).strip().lower()

PADDLE_CLIENT_TOKEN = os.getenv(
    "PADDLE_CLIENT_TOKEN",
    ""
).strip()

PADDLE_API_KEY = os.getenv(
    "PADDLE_API_KEY",
    ""
).strip()

PADDLE_WEBHOOK_SECRET = os.getenv(
    "PADDLE_WEBHOOK_SECRET",
    ""
).strip()

PADDLE_BASIC_PRICE_ID = os.getenv(
    "PADDLE_BASIC_PRICE_ID",
    ""
).strip()

PADDLE_PREMIUM_PRICE_ID = os.getenv(
    "PADDLE_PREMIUM_PRICE_ID",
    ""
).strip()

PADDLE_PRICE_IDS = {
    "basic": PADDLE_BASIC_PRICE_ID,
    "premium": PADDLE_PREMIUM_PRICE_ID
}

PADDLE_API_BASE = (
    "https://sandbox-api.paddle.com"
    if PADDLE_ENV == "sandbox"
    else "https://api.paddle.com"
)

# Public receiving details for manual P2P payments (configured in Render).
# Never place Visa card numbers, CVV or expiry dates here.
P2P_UNIFI_DETAILS = os.getenv("P2P_UNIFI_DETAILS", "").strip()
P2P_BANK_DETAILS = os.getenv("P2P_BANK_DETAILS", "").strip()
P2P_MULTICAIXA_DETAILS = os.getenv("P2P_MULTICAIXA_DETAILS", "").strip()
P2P_USDC_NETWORK = os.getenv("P2P_USDC_NETWORK", "").strip()
P2P_USDC_WALLET_ADDRESS = os.getenv("P2P_USDC_WALLET_ADDRESS", "").strip()
try:
    P2P_USDC_AOA_RATE = Decimal(os.getenv("P2P_USDC_AOA_RATE", "0").strip() or "0")
except Exception:
    P2P_USDC_AOA_RATE = Decimal("0")

# Mureka is the only active music-generation provider.
MUREKA_API_KEY = os.getenv("MUREKA_API_KEY", "").strip()
MUREKA_BASE_URL = os.getenv("MUREKA_BASE_URL", "https://api.mureka.ai").strip().rstrip("/")
MUREKA_MODEL = os.getenv("MUREKA_MODEL", "mureka-9.5").strip()
# Test mode: strictly limited to an allowlisted account configured in Render.
MUREKA_TEST_MODE = os.getenv("MUREKA_TEST_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}
MUREKA_TEST_EMAILS = {email.strip().lower() for email in os.getenv("MUREKA_TEST_EMAILS", "").split(",") if email.strip()}
MUREKA_TEST_MAX_GENERATIONS = max(1, min(20, int(os.getenv("MUREKA_TEST_MAX_GENERATIONS", "3"))))
ADMIN_BOOTSTRAP_EMAIL = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "").strip().lower()
ADMIN_BOOTSTRAP_TOKEN = os.getenv("ADMIN_BOOTSTRAP_TOKEN", "").strip()
PUBLIC_API_BASE_URL = os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/")
SOURCE_AUDIO_DIR = BASE_DIR / "source_audio"
SOURCE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
MAX_SOURCE_AUDIO_BYTES = int(os.getenv("MAX_SOURCE_AUDIO_MB", "30")) * 1024 * 1024


APP_ENV = os.getenv(
    "APP_ENV",
    "development"
).strip().lower()

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    ""
).strip()

if not JWT_SECRET_KEY:

    if APP_ENV == "production":
        raise RuntimeError(
            "ERRO DE SEGURANÇA: "
            "JWT_SECRET_KEY não configurada."
        )

    JWT_SECRET_KEY = secrets.token_urlsafe(64)

    logger.warning(
        "JWT_SECRET_KEY temporária criada. "
        "Configure uma chave permanente antes da produção."
    )

JWT_ALGORITHM = "HS256"

JWT_EXPIRE_DAYS = int(
    os.getenv(
        "JWT_EXPIRE_DAYS",
        "7"
    )
)

APP_NAME = "StudioMusic.AI"

MAX_PROMPT_LENGTH = 1024
MAX_AUDIO_DURATION = 600

# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="StudioMusic.AI",
    version="3.0",
    description="API do StudioMusic.AI"
)
app.mount("/source-audio", StaticFiles(directory=str(SOURCE_AUDIO_DIR)), name="source-audio")
app.mount(
    "/covers",
    StaticFiles(directory=str(COVERS_DIR)),
    name="covers"
)

app.mount("/avatars",
    StaticFiles(directory=str(AVATARS_DIR)),
    name="avatars"
)
# ============================================================
# CORS — CONFIGURAÇÃO
# ============================================================

# Lê as origens permitidas no Render/.env e normaliza os valores.
CORS_ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# Frontend oficial do StudioMusic.AI no Cloudflare Pages.
FRONTEND_ORIGIN = "https://studiomusic-r63.pages.dev"
if FRONTEND_ORIGIN not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_ORIGIN)

# Remove duplicados sem alterar a ordem.
CORS_ALLOWED_ORIGINS = list(dict.fromkeys(CORS_ALLOWED_ORIGINS))

if APP_ENV == "production":
    if not CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "Configure CORS_ALLOWED_ORIGINS antes de iniciar em produção."
        )

    if "*" in CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "Não é permitido utilizar CORS '*'."
        )

    if "null" in CORS_ALLOWED_ORIGINS:
        raise RuntimeError(
            "A origem null não é permitida em produção."
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 5.MODELOS
# ============================================================

class RegisterRequest(BaseModel):

    name: str = Field(
        min_length=2,
        max_length=100
    )

    email: str = Field(
        min_length=3,
        max_length=255
    )

    password: str = Field(
        min_length=6,
        max_length=200
    )


class LoginRequest(BaseModel):

    email: str

    password: str


class AdminBootstrapRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(
        min_length=1,
        max_length=200
    )

    new_password: str = Field(
        min_length=6,
        max_length=200
    )


class UpdateProfileRequest(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=100
    )
    email: str = Field(
        min_length=3,
        max_length=255
    )
    sobremim: str = Field(
        default="",
        max_length=1000
    )
    # Opcional para manter compatibilidade com versões antigas do frontend.
    telefone: Optional[str] = Field(
        default=None,
        max_length=20
    )
    

class GenerateMusicRequest(BaseModel):
    # mode: generate | cover | extend | add_vocals
    mode: str = "generate"
    prompt: Optional[str] = Field(default=None, max_length=5000)
    lyrics: Optional[str] = Field(default=None, max_length=5000)
    style: Optional[str] = Field(default=None, max_length=1000)
    title: Optional[str] = Field(default=None, max_length=100)
    source_url: Optional[str] = None
    source_reference_id: Optional[str] = Field(default=None, max_length=200)
    vocal_id: Optional[str] = Field(default=None, max_length=200)
    continue_at: Optional[float] = Field(default=None, gt=0)
    duration: Optional[int] = Field(default=180, ge=1, le=600)
    instrumental: bool = False
    vocal_gender: Optional[str] = None
    model: str = "mureka-9.5"
    audio_weight: Optional[float] = Field(default=None, ge=0, le=1)
    style_weight: Optional[float] = Field(default=None, ge=0, le=1)
    weirdness: Optional[float] = Field(default=None, ge=0, le=1)


class PublishRequest(BaseModel):

    is_public: bool = True


class AdminActiveRequest(BaseModel):

    is_active: bool


# ============================================================
# MODELOS — PLANOS E PAGAMENTOS
# ============================================================
class PaddleCheckoutRequest(BaseModel):
    plan_id: int = Field(gt=0)

class BitPayCheckoutRequest(BaseModel):

    plan_id: int = Field(gt=0)

    payment_method: str = Field(
        pattern="^(multicaixa_express|multicaixa_reference)$"
    )

    mobile: Optional[str] = Field(
        default=None,
        max_length=20
    )
class CreatePaymentRequest(BaseModel):
    plan_id: int = Field(gt=0)
    payment_method: str = Field(
        min_length=2,
        max_length=50
    )
    transaction_reference: Optional[str] = Field(
        default=None,
        max_length=200
    )


class ReviewPaymentRequest(BaseModel):
    status: str = Field(
        pattern="^(confirmed|rejected)$"
    )
    admin_note: Optional[str] = Field(
        default=None,
        max_length=1000
    )


# ============================================================
# 6.PASSWORD
# ============================================================

PBKDF2_ITERATIONS = 310_000


def hash_password(password: str) -> str:

    salt = secrets.token_bytes(16)

    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS
    )

    return (
        "pbkdf2_sha256$"
        f"{PBKDF2_ITERATIONS}$"
        f"{salt.hex()}$"
        f"{derived.hex()}"
    )


def verify_password(
    password: str,
    stored_hash: str
) -> bool:

    if not stored_hash:
        return False

    # --------------------------------------------------------
    # Nosso formato:
    #
    # pbkdf2_sha256$iterations$salt$hash
    # --------------------------------------------------------

    if stored_hash.startswith(
        "pbkdf2_sha256$"
    ):

        try:

            parts = stored_hash.split("$")

            if len(parts) != 4:
                return False

            iterations = int(parts[1])

            salt = bytes.fromhex(
                parts[2]
            )

            expected = bytes.fromhex(
                parts[3]
            )

            derived = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt,
                iterations
            )

            return secrets.compare_digest(
                derived,
                expected
            )

        except Exception:

            return False

    # --------------------------------------------------------
    # Compatibilidade com formato Passlib:
    #
    # $pbkdf2-sha256$29000$salt$hash
    # --------------------------------------------------------

    if stored_hash.startswith(
        "$pbkdf2-sha256$"
    ):

        try:

            parts = stored_hash.split("$")

            if len(parts) != 4:
                return False

            iterations = int(parts[2])

            salt_text = parts[3]

            # O formato Passlib utiliza
            # base64 URL-safe sem necessariamente
            # possuir "=" no final.

            import base64

            hash_part = parts[4] if len(parts) > 4 else None

            if hash_part is None:
                return False

            salt_bytes = salt_text.encode(
                "utf-8"
            )

            derived = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt_bytes,
                iterations
            )

            derived_b64 = base64.b64encode(
                derived
            ).decode(
                "ascii"
            ).rstrip("=")

            return secrets.compare_digest(
                derived_b64,
                hash_part
            )

        except Exception:

            return False

    return False


# ============================================================
# 7.JWT
# ============================================================

def create_access_token(
    user: dict
) -> str:

    now = datetime.utcnow()

    payload = {

        "sub": str(
            user["id"]
        ),

        "user_id": user["id"],

        "email": user["email"],

        "name": user["name"],

        "is_admin": bool(
            user.get(
                "is_admin",
                0
            )
        ),

        "iat": now,

        "exp": now + timedelta(
            days=JWT_EXPIRE_DAYS
        )
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )


def decode_token(
    token: str
) -> dict:

    try:

        return jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[
                JWT_ALGORITHM
            ]
        )

    except jwt.ExpiredSignatureError:

        raise HTTPException(
            status_code=401,
            detail="Token expirado."
        )

    except jwt.InvalidTokenError:

        raise HTTPException(
            status_code=401,
            detail="Token inválido."
        )


# ============================================================
# 8.AUTENTICAÇÃO
# ============================================================

def extract_bearer_token(
    authorization: Optional[str]
):

    if not authorization:
        return None

    if not authorization.lower().startswith(
        "bearer "
    ):
        return None

    return authorization[7:].strip()


def get_current_user(
    authorization: Optional[str] = Header(
        default=None,
        alias="Authorization"
    )
):

    token = extract_bearer_token(
        authorization
    )

    if not token:

        raise HTTPException(
            status_code=401,
            detail="Autenticação necessária."
        )

    payload = decode_token(
        token
    )

    user_id = payload.get(
        "user_id"
    )

    if user_id is None:

        user_id = payload.get(
            "sub"
        )

    try:

        user_id = int(
            user_id
        )

    except Exception:

        raise HTTPException(
            status_code=401,
            detail="Token inválido."
        )

    user = get_user_by_id(
        user_id
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Utilizador não encontrado."
        )

    if not user.get(
        "is_active",
        1
    ):

        raise HTTPException(
            status_code=403,
            detail="Utilizador desativado."
        )

    return user

# ======================================================
# VERIFICAR A PERMISSÃO ADMINISTRATIVA
def require_admin(
    user=Depends(
        get_current_user
    )
):

    if not bool(
        user.get(
            "is_admin",
            0
        )
    ):

        raise HTTPException(
            status_code=403,
            detail="Acesso restrito ao administrador."
        )

    return user


# ============================================================
# 9.TOKEN PARA ÁUDIO PRIVADO
# ============================================================

def create_audio_token(
    user_id: int,
    song_id: int
):
    # Timestamp Unix em segundos
    now = int(time.time())

    payload = {

        "type": "audio",

        "user_id": int(user_id),

        "song_id": int(song_id),

        "iat": now,
        # Validade de 2 horas
        "exp": now + (2 * 60 * 60)
        
        
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )


def decode_audio_token(
    token: str
):

    try:

        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[
                JWT_ALGORITHM
            ]
        )

        if payload.get(
            "type"
        ) != "audio":

            return None

        return payload

    except Exception:

        return None


# ============================================================
# 10.AUTORIZAÇÃO DE MÚSICA
# ============================================================

def user_owns_song(
    song: dict,
    user: dict
):

    return (
        song is not None
        and
        song.get(
            "user_id"
        ) is not None
        and
        int(
            song["user_id"]
        ) == int(
            user["id"]
        )
    )


def can_access_song(
    song: dict,
    user: dict
):

    if not song:
        return False

    if bool(
        user.get(
            "is_admin",
            0
        )
    ):
        return True

    if user_owns_song(
        song,
        user
    ):
        return True

    if bool(
        song.get(
            "is_public",
            0
        )
    ) and song.get(
        "status"
    ) == "completed":

        return True

    return False


def require_song_access(
    song_id: int,
    user: dict
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    if not can_access_song(
        song,
        user
    ):

        raise HTTPException(
            status_code=403,
            detail="Não tem permissão para aceder a esta música."
        )

    return song


def require_song_owner(
    song_id: int,
    user: dict
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    if bool(
        user.get(
            "is_admin",
            0
        )
    ):

        return song

    if not user_owns_song(
        song,
        user
    ):

        raise HTTPException(
            status_code=403,
            detail="Esta música pertence a outro utilizador."
        )

    return song


# ============================================================
# 11.SERIALIZAÇÃO DAS MÚSICAS
# ============================================================

def serialize_song(
    song: dict,
    user: Optional[dict] = None,
    include_private_access: bool = True
):

    if not song:
        return None

    result = dict(
        song
    )

    # --------------------------------------------------------
    # Conversão de campos SQLite
    # --------------------------------------------------------

    result["instrumental"] = bool(
        result.get(
            "instrumental",
            0
        )
    )

    result["is_public"] = bool(
        result.get(
            "is_public",
            0
        )
    )

    # --------------------------------------------------------
    # Proteção do áudio
    # --------------------------------------------------------

    audio_file = result.get(
        "audio_file"
    )

    if audio_file:

        filename = Path(
            str(audio_file)
        ).name

        is_public = (
            result["is_public"]
            and
            result.get(
                "status"
            ) == "completed"
        )

        owner = (
            user
            and
            user_owns_song(
                result,
                user
            )
        )

        admin = (
            user
            and
            bool(
                user.get(
                    "is_admin",
                    0
                )
            )
        )

        if is_public:

            result["audio_url"] = (
                f"/api/audio/"
                f"{result['id']}"
            )

        elif (
            include_private_access
            and
            (owner or admin)
        ):

            token = create_audio_token(
                int(
                    user["id"]
                ),
                int(
                    result["id"]
                )
            )

            result["audio_url"] = (
                f"/api/audio/"
                f"{result['id']}"
                f"?token={token}"
            )

        else:

            result["audio_url"] = None

    else:
        external_audio_url = result.get("audio_url")
        is_public_external = bool(result.get("is_public")) and result.get("status") == "completed"
        owner_external = bool(user and user_owns_song(result, user))
        admin_external = bool(user and user.get("is_admin", 0))
        if external_audio_url and (is_public_external or owner_external or admin_external):
            result["audio_url"] = external_audio_url
        else:
            result["audio_url"] = None

    raw_generation = result.get("generation_json")
    if raw_generation:
        try:
            generation_data = json.loads(raw_generation)
            completed = generation_data.get("result") or {}
            result["clips"] = completed.get("clips") or []
            result["generation_status"] = completed.get("status") or result.get("status")
        except (TypeError, ValueError):
            result["clips"] = []

    # --------------------------------------------------------
    # Não expor caminho físico
    # --------------------------------------------------------

    result.pop(
        "audio_file",
        None
    )

    result.pop(
        "error_message",
        None
    )

    return result


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/api/health"
)
def health():

    return {

        "status": "ok",

        "service": APP_NAME,

        "version": "3.0",

        "database": True,

        "mureka_configured": bool(MUREKA_API_KEY),
        "provider": "mureka",
        "model": MUREKA_MODEL,

        "features": {

            "auth": True,

            "music": True,

            "favorites": True,

            "history": True,

            "community": True,

            "admin": True
        }
    }


# ============================================================
# CONFIG
# ============================================================

@app.get(
    "/api/config"
)
def api_config():

    return {

        "success": True,

        "model": MUREKA_MODEL,

        "provider": "mureka",
        "mureka_configured": bool(MUREKA_API_KEY),

        "max_prompt_length":
            MAX_PROMPT_LENGTH,

        "max_duration":
            MAX_AUDIO_DURATION,

        "community":
            True,

        "admin":
            True
    }


# ============================================================
# ADMIN — BOOTSTRAP ÚNICO DO PRIMEIRO ADMINISTRADOR
# ============================================================

@app.post("/api/admin/bootstrap")
def bootstrap_first_admin(
    data: AdminBootstrapRequest,
    bootstrap_token: Optional[str] = Header(default=None, alias="X-Admin-Bootstrap-Token")
):
    """Cria o primeiro administrador com token e email previamente definidos no Render."""
    if not ADMIN_BOOTSTRAP_EMAIL or len(ADMIN_BOOTSTRAP_TOKEN) < 32:
        raise HTTPException(status_code=503, detail="Bootstrap administrativo não configurado no servidor.")
    if not bootstrap_token or not secrets.compare_digest(bootstrap_token, ADMIN_BOOTSTRAP_TOKEN):
        raise HTTPException(status_code=403, detail="Token de bootstrap inválido.")
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT COUNT(*) AS admin_count FROM users WHERE is_admin = 1")
        row = cursor.fetchone()
        admin_count = int(row["admin_count"] if isinstance(row, dict) else row[0])
    if admin_count:
        raise HTTPException(status_code=409, detail="O administrador inicial já existe. Bootstrap encerrado.")
    email = data.email.strip().lower()
    if not secrets.compare_digest(email, ADMIN_BOOTSTRAP_EMAIL):
        raise HTTPException(status_code=403, detail="Email não corresponde ao ADMIN_BOOTSTRAP_EMAIL configurado.")
    user = get_user_by_email(email)
    if user:
        if not verify_password(data.password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="A conta já existe. Usa a palavra-passe dessa conta para a promover a administrador.")
        with get_connection() as connection:
            cursor = connection.cursor()
            cursor.execute("UPDATE users SET is_admin = 1, is_active = 1 WHERE id = ?", (user["id"],))
            connection.commit()
        user = get_user_by_id(user["id"])
    else:
        user_id = create_user(name=data.name.strip(), email=email, password_hash=hash_password(data.password), is_admin=True)
        user = get_user_by_id(user_id)
    token = create_access_token(user)
    logger.warning("Bootstrap do primeiro administrador concluído.")
    return {
        "success": True,
        "message": "Administrador criado. O bootstrap fica agora encerrado.",
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "name": user["name"], "email": user["email"], "is_admin": True}
    }


# ============================================================
# AUTH — REGISTER
# ============================================================

@app.post(
    "/auth/register"
)
def register(
    data: RegisterRequest
):

    name = data.name.strip()

    email = data.email.strip().lower()

    password = data.password

    if not name:

        raise HTTPException(
            status_code=400,
            detail="Nome obrigatório."
        )

    existing = get_user_by_email(
        email
    )

    if existing:

        raise HTTPException(
            status_code=409,
            detail="Este email já está registado."
        )

    password_hash = hash_password(
        password
    )

    user_id = create_user(
        name=name,
        email=email,
        password_hash=password_hash
    )

    user = get_user_by_id(
        user_id
    )

    token = create_access_token(
        user
    )

    return {

        "success": True,

        "message":
            "Conta criada com sucesso.",

        "access_token":
            token,

        "token":
            token,

        "token_type":
            "bearer",

        "user": {

            "id": user["id"],

            "name": user["name"],

            "email": user["email"],

            "is_admin": bool(
                user["is_admin"]
            )
        }
    }


# ============================================================
# AUTH — LOGIN
# ============================================================

@app.post(
    "/auth/login"
)
def login(
    data: LoginRequest
):

    email = data.email.strip().lower()

    user = get_user_by_email(
        email
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Email ou palavra-passe incorretos."
        )

    if not user.get(
        "is_active",
        1
    ):

        raise HTTPException(
            status_code=403,
            detail="Esta conta está desativada."
        )

    if not verify_password(
        data.password,
        user["password_hash"]
    ):

        raise HTTPException(
            status_code=401,
            detail="Email ou palavra-passe incorretos."
        )

    token = create_access_token(
        user
    )

    return {

        "success": True,

        "access_token":
            token,

        "token":
            token,

        "token_type":
            "bearer",

        "user": {

            "id": user["id"],

            "name": user["name"],

            "email": user["email"],

            "is_admin": bool(
                user["is_admin"]
            )
        }
    }

# ============================================================
# AUTH — ME
# Consultar o perfil do utilizador autenticado
# ============================================================

@app.get("/auth/me")
def auth_me(
    user=Depends(get_current_user)
):

    return {
        "success": True,

        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],

            "foto": user.get("foto"),
            "sobremim": user.get("sobremim") or "",
            "telefone": user.get("telefone") or "",

            "is_active": bool(
                user.get("is_active", 1)
            ),

            "is_admin": bool(
                user.get("is_admin", 0)
            ),

            "created_at": user.get("created_at")
        }
    }

# ============================================================
# AUTH — ATUALIZAR PERFIL
# ============================================================

@app.patch("/auth/me")
def update_my_profile(
    data: UpdateProfileRequest,
    user=Depends(get_current_user)
):

    name = data.name.strip()
    email = data.email.strip().lower()
    sobremim = data.sobremim.strip()
    telefone = data.telefone.strip() if data.telefone is not None else None

    # Angola: aceitar 9 dígitos (9XXXXXXXX) ou +244 seguido dos 9 dígitos.
    # Guardar no formato nacional de 9 dígitos, adequado à API BitPay.
    if telefone is not None and telefone:
        telefone = re.sub(r"[\s().-]", "", telefone)
        if telefone.startswith("+244"):
            telefone = telefone[4:]
        elif telefone.startswith("00244"):
            telefone = telefone[5:]
        if not re.fullmatch(r"9\d{8}", telefone):
            raise HTTPException(
                status_code=400,
                detail="Introduza um número angolano válido com 9 dígitos, começando por 9."
            )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="O nome completo é obrigatório."
        )

    if not email or not re.match(
        r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        email
    ):
        raise HTTPException(
            status_code=400,
            detail="Introduza um endereço de email válido."
        )

    if len(sobremim) > 1000:
        raise HTTPException(
            status_code=400,
            detail="O campo Sobre mim não pode ultrapassar 1000 caracteres."
        )

    try:

        updated_user = update_user_profile(
            user_id=user["id"],
            name=name,
            email=email,
            sobremim=sobremim,
            telefone=telefone
        )

    except ValueError as error:

        raise HTTPException(
            status_code=409,
            detail=str(error)
        )

    if not updated_user:
        raise HTTPException(
            status_code=404,
            detail="Utilizador não encontrado."
        )

    return {
        "success": True,
        "message": "Perfil atualizado com sucesso.",

        "user": {
            "id": updated_user["id"],
            "name": updated_user["name"],
            "email": updated_user["email"],
            "foto": updated_user.get("foto"),
            "sobremim": updated_user.get("sobremim") or "",
            "telefone": updated_user.get("telefone") or "",
            "is_active": bool(
                updated_user.get("is_active", 1)
            ),
            "is_admin": bool(
                updated_user.get("is_admin", 0)
            ),
            "created_at": updated_user.get("created_at")
        }
    }
@app.post("/auth/change-password")
def change_password(
    data: ChangePasswordRequest,
    user=Depends(get_current_user)
):
    """
    Permite ao utilizador autenticado alterar a palavra-passe.
    Exige a palavra-passe actual para confirmar a identidade.
    """

    current_password = data.current_password
    new_password = data.new_password

# Verificar a palavra-passe actual.
    stored_hash = user.get("password_hash")

    if not stored_hash or not verify_password(
        current_password,
        stored_hash
    ):
        raise HTTPException(
            status_code=400,
            detail="A palavra-passe actual está incorrecta."
    )

# Impedir a reutilização da mesma palavra-passe.
    if verify_password(new_password, stored_hash):
        raise HTTPException(
            status_code=400,
            detail=(
                "A nova palavra-passe deve ser diferente "
                "da palavra-passe actual."
            )
        )

# Gerar o hash seguro da nova palavra-passe.
    new_password_hash = hash_password(new_password)

# Guardar na base de dados.
    updated = update_user_password(
        user["id"],
        new_password_hash
    )

    if not updated:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível actualizar a palavra-passe."
        )

    return {
        "success": True,
        "message": "Palavra-passe alterada com sucesso."
    }
# ============================================================
# AUTH — ATUALIZAR FOTOGRAFIA DO PERFIL
# ============================================================

@app.post("/auth/me/photo")
async def update_my_profile_photo(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):

    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    }

    extension = allowed_types.get(
        file.content_type
    )

    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Utilize JPG, PNG ou WEBP."
        )

    content = await file.read()

    max_size = 5 * 1024 * 1024

    if not content:
        raise HTTPException(
            status_code=400,
            detail="O ficheiro enviado está vazio."
        )

    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail="A fotografia não pode ultrapassar 5 MB."
        )

    # Confirmar a assinatura do ficheiro,
    # em vez de confiar apenas no tipo declarado.
    valid_signatures = {
        ".jpg": content.startswith(b"\xff\xd8\xff"),
        ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".webp": (
            len(content) >= 12
            and content[:4] == b"RIFF"
            and content[8:12] == b"WEBP"
        )
    }

    if not valid_signatures.get(extension, False):
        raise HTTPException(
            status_code=400,
            detail="O conteúdo do ficheiro não corresponde a uma imagem válida."
        )

    filename = (
        f"{user['id']}_{uuid.uuid4().hex}{extension}"
    )

    file_path = AVATARS_DIR / filename

    try:

        with open(file_path, "wb") as image_file:
            image_file.write(content)

        photo_url = f"/avatars/{filename}"

        updated_user = update_user_photo(
            user_id=user["id"],
            foto=photo_url
        )

        if not updated_user:
            file_path.unlink(missing_ok=True)

            raise HTTPException(
                status_code=404,
                detail="Utilizador não encontrado."
            )

        return {
            "success": True,
            "message": "Fotografia atualizada com sucesso.",
            "foto": photo_url,
            "user": {
                "id": updated_user["id"],
                "name": updated_user["name"],
                "email": updated_user["email"],
                "foto": updated_user.get("foto"),
                "sobremim": updated_user.get("sobremim") or ""
            }
        }

    except HTTPException:
        raise

    except Exception:
        if file_path.exists():
            file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Não foi possível guardar a fotografia."
        )

    finally:
        await file.close()
        
# ============================================================
# GERAR MÚSICA
# ============================================================

def get_user_paid_subscription(user_id: int) -> bool:
    """True apenas quando existe uma assinatura activa de um plano pago."""
    subscription = get_user_subscription(user_id)
    if not subscription or str(subscription.get("status") or "").lower() != "active":
        return False
    try:
        return Decimal(str(subscription.get("plan_price") or "0")) > 0
    except (TypeError, ValueError, ArithmeticError):
        return False


def is_mureka_test_user(user: dict) -> bool:
    email = str(user.get("email") or "").strip().lower()
    return bool(MUREKA_TEST_MODE and email and email in MUREKA_TEST_EMAILS)


@app.post("/api/music/upload-source")
async def upload_source_audio(
    file: UploadFile = File(...),
    purpose: str = Form(default="reference"),
    user=Depends(get_current_user)
):
    """Envia o áudio de referência recebido ao backend e à API Mureka."""
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=503, detail="MUREKA_API_KEY não configurada no servidor.")
    if not get_user_paid_subscription(user["id"]) and not is_mureka_test_user(user):
        raise HTTPException(status_code=403, detail="O envio de áudio requer uma subscrição paga ou acesso de teste autorizado.")
    if purpose not in {"reference", "instrumental"}:
        raise HTTPException(status_code=400, detail="Finalidade de áudio inválida.")

    filename = Path(file.filename or "reference.mp3").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".mp3", ".m4a"}:
        raise HTTPException(status_code=415, detail="A Mureka aceita áudio de referência em MP3 ou M4A.")

    content = await file.read(10 * 1024 * 1024 + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="O ficheiro de áudio está vazio.")
    if len(content) >= 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="O áudio de referência deve ter menos de 10 MB.")

    try:
        response = requests.post(
            f"{MUREKA_BASE_URL}/v1/files/upload",
            headers={"Authorization": f"Bearer {MUREKA_API_KEY}"},
            data={"purpose": purpose},
            files={"file": (filename, content, file.content_type or "audio/mpeg")},
            timeout=60
        )
        try:
            result = response.json()
        except ValueError:
            result = {"message": response.text[:1000]}
        if response.status_code not in {200, 201}:
            logger.error("Mureka reference upload failed (%s): %s", response.status_code, result)
            raise HTTPException(status_code=502, detail=f"A Mureka não aceitou o áudio de referência: {result.get('error', result.get('message', 'erro do fornecedor'))}")
        reference_id = result.get("id") or result.get("reference_id")
        if not reference_id:
            raise HTTPException(status_code=502, detail="A Mureka não devolveu o ID do áudio de referência.")
        return {"success": True, "reference_id": str(reference_id),
                "instrumental_id": str(reference_id) if purpose == "instrumental" else None,
                "filename": filename, "size_bytes": len(content)}
    except HTTPException:
        raise
    except requests.RequestException as exc:
        logger.warning("Mureka reference upload connection error: %s", exc)
        raise HTTPException(status_code=502, detail="Não foi possível enviar o áudio para a Mureka.")


@app.post("/api/music/clone-voice")
async def clone_voice_sample(
    file: UploadFile = File(...),
    authorized: bool = Form(default=False),
    user=Depends(get_current_user)
):
    """Cria um Vocal ID Mureka apenas para uma voz que o utilizador tem direito a usar."""
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=503, detail="MUREKA_API_KEY não configurada no servidor.")
    if not get_user_paid_subscription(user["id"]):
        raise HTTPException(status_code=403, detail="A clonagem vocal requer uma subscrição paga activa.")
    if not authorized:
        raise HTTPException(status_code=400, detail="Confirma que tens autorização para utilizar esta voz.")
    filename = Path(file.filename or "voice.mp3").name
    if Path(filename).suffix.lower() not in {".mp3", ".m4a"}:
        raise HTTPException(status_code=415, detail="A amostra vocal deve ser MP3 ou M4A.")
    content = await file.read(10 * 1024 * 1024 + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=400, detail="A amostra vocal está vazia.")
    if len(content) >= 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="A amostra vocal deve ter menos de 10 MB.")
    try:
        response = requests.post(
            f"{MUREKA_BASE_URL}/v1/song/vocal-clone",
            headers={"Authorization": f"Bearer {MUREKA_API_KEY}"},
            files={"file": (filename, content, file.content_type or "audio/mpeg")},
            timeout=60
        )
        try:
            result = response.json()
        except ValueError:
            result = {"message": response.text[:1000]}
        if response.status_code not in {200, 201}:
            logger.warning("Mureka vocal clone rejected (%s): %s", response.status_code, result)
            detail = result.get("error") or result.get("message") or result
            raise HTTPException(status_code=502, detail=f"A Mureka não aceitou a amostra vocal: {detail}")
        vocal_id = result.get("vocal_id") or result.get("id")
        if not vocal_id:
            raise HTTPException(status_code=502, detail="A Mureka não devolveu o ID da voz.")
        return {"success": True, "vocal_id": str(vocal_id)}
    except HTTPException:
        raise
    except requests.RequestException as exc:
        logger.warning("Mureka vocal clone connection error: %s", exc)
        raise HTTPException(status_code=502, detail="Não foi possível enviar a amostra vocal para a Mureka.")


@app.post("/api/music/generate")
def generate_music(data: GenerateMusicRequest, user=Depends(get_current_user)):
    """Cria uma tarefa de música na Mureka, mantendo a cobrança de créditos."""
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=503, detail="MUREKA_API_KEY não configurada no servidor.")

    # O modo de teste só autoriza emails da allowlist e impõe um limite persistente.
    test_access = is_mureka_test_user(user)
    if not get_user_paid_subscription(user["id"]) and not test_access:
        raise HTTPException(status_code=403, detail="A geração completa de músicas requer uma subscrição paga activa.")
    if test_access:
        user_songs = get_songs() or []
        test_count = sum(1 for item in user_songs if isinstance(item, dict) and item.get("user_id") is not None and int(item.get("user_id")) == int(user["id"]))
        if test_count >= MUREKA_TEST_MAX_GENERATIONS:
            raise HTTPException(status_code=429, detail=f"Limite de teste atingido ({MUREKA_TEST_MAX_GENERATIONS} gerações).")

    prompt = (data.prompt or "").strip()
    lyrics = (data.lyrics or "").strip()
    style = (data.style or "").strip()
    reference_id = (data.source_reference_id or "").strip()
    if data.source_url and not reference_id:
        raise HTTPException(status_code=400, detail="O áudio precisa de ser enviado primeiro para /api/music/upload-source.")
    if not (prompt or lyrics):
        raise HTTPException(status_code=400, detail="Indique uma descrição ou forneça a letra da música.")
    if len(prompt) > 1024 or len(style) > 1024:
        raise HTTPException(status_code=400, detail="A descrição musical da Mureka não pode ultrapassar 1024 caracteres.")
    if data.vocal_gender not in {None, "m", "f", "male", "female"}:
        raise HTTPException(status_code=400, detail="vocal_gender deve ser m/f ou male/female.")
    vocal_id = (data.vocal_id or "").strip()
    if data.instrumental and vocal_id:
        raise HTTPException(status_code=400, detail="Uma voz clonada não pode ser usada numa geração instrumental.")

    model = (data.model or MUREKA_MODEL).strip()
    allowed_models = {"mureka-7.6", "mureka-8", "mureka-9", "mureka-9.5", "mureka-o2"}
    if model not in allowed_models:
        model = MUREKA_MODEL if MUREKA_MODEL in allowed_models else "mureka-9.5"
    if model == "mureka-o2" and vocal_id:
        raise HTTPException(status_code=400, detail="O modelo mureka-o2 não aceita um perfil vocal vocal_id.")
    gender = {"m": "male", "f": "female"}.get(data.vocal_gender, data.vocal_gender)
    music_prompt = ", ".join(part for part in (prompt, style) if part)[:1024]

    if data.instrumental:
        endpoint = "/v1/instrumental/generate"
        payload = {"model": model, "prompt": music_prompt, "n": 1}
        if model == "mureka-9.5" and data.duration and not reference_id:
            payload["duration"] = max(120, min(300, int(data.duration)))
        if reference_id:
            payload = {"model": model, "instrumental_id": reference_id, "n": 1}
    elif lyrics:
        endpoint = "/v1/song/generate"
        payload = {"model": model, "lyrics": lyrics, "n": 1}
        if music_prompt:
            payload["prompt"] = music_prompt
        if gender:
            payload["gender"] = gender
        if vocal_id:
            payload["vocal_id"] = vocal_id
        if reference_id:
            payload["reference_id"] = reference_id
        elif model == "mureka-9.5" and data.duration:
            payload["duration"] = max(120, min(300, int(data.duration)))
    else:
        endpoint = "/v1/song/easy-generate"
        payload = {"model": model, "prompt": music_prompt, "n": 1}
        if gender:
            payload["gender"] = gender
        if vocal_id:
            payload["vocal_id"] = vocal_id
        if reference_id:
            payload["reference_id"] = reference_id
        elif model == "mureka-9.5" and data.duration:
            payload["duration"] = max(120, min(300, int(data.duration)))

    title = (data.title or "Nova música StudioMusic.AI").strip()[:100]
    credit_lot_id = None if test_access else consume_user_credit(user["id"])
    if not test_access and credit_lot_id is None:
        available = get_user_credit_balance(user["id"])
        raise HTTPException(status_code=402, detail=f"Créditos insuficientes. Saldo actual: {available}.")

    song_prompt = prompt or lyrics or style or "Música instrumental StudioMusic.AI"
    try:
        song = create_song(
            title=title, prompt=song_prompt, model=model,
            duration=(max(120, min(300, int(data.duration)))
                      if model == "mureka-9.5" and data.duration and not reference_id else 180),
            instrumental=data.instrumental, status="pending",
            user_id=user["id"], is_public=False
        )
        song_id = song["id"]
    except Exception as exc:
        if credit_lot_id is not None:
            restore_user_credit(credit_lot_id)
        logger.exception("Could not create local song record")
        raise HTTPException(status_code=500, detail="Não foi possível registar a música. O crédito foi reposto.")

    try:
        response = requests.post(
            f"{MUREKA_BASE_URL}{endpoint}",
            headers={"Authorization": f"Bearer {MUREKA_API_KEY}", "Content-Type": "application/json"},
            json=payload, timeout=60
        )
        try:
            result = response.json()
        except ValueError:
            result = {"message": response.text[:1000]}
        if response.status_code not in {200, 201, 202}:
            update_song(song_id=song_id, status="failed", error_message=str(result)[:2000])
            if credit_lot_id is not None:
                restore_user_credit(credit_lot_id)
            detail = (result.get("error") or {}).get("message") if isinstance(result.get("error"), dict) else result.get("error")
            detail = detail or result.get("message") or result
            raise HTTPException(status_code=502, detail=f"A Mureka recusou o pedido ({response.status_code}): {detail}")

        generation_id = result.get("id") or result.get("task_id") or result.get("generation_id")
        if not generation_id:
            update_song(song_id=song_id, status="failed", error_message="Resposta Mureka sem ID da tarefa.")
            if credit_lot_id is not None:
                restore_user_credit(credit_lot_id)
            raise HTTPException(status_code=502, detail="A Mureka não devolveu o identificador da tarefa.")
        generation_json = {
            "provider": "mureka", "mode": "generate",
            "submission": result, "credit_lot_id": credit_lot_id,
            "reference_id": reference_id or None,
            "vocal_id": vocal_id or None
        }
        update_song(song_id=song_id, task_id=str(generation_id), generation_json=json.dumps(generation_json))
        return {"success": True, "song_id": song_id, "generation_id": str(generation_id),
                "status": result.get("status", "queued"), "provider": "mureka",
                "message": "Pedido aceite pela Mureka. Consulte o estado para acompanhar a geração."}
    except HTTPException:
        raise
    except requests.RequestException as exc:
        update_song(song_id=song_id, status="failed", error_message=str(exc)[:2000])
        if credit_lot_id is not None:
            restore_user_credit(credit_lot_id)
        logger.warning("Mureka generation connection error: %s", exc)
        raise HTTPException(status_code=502, detail="Não foi possível comunicar com a Mureka.")


# ============================================================
# MINHAS MÚSICAS E FAVORITOS — ROTAS ESTÁTICAS
# Devem ficar antes de /api/music/{song_id}, pois "favorites"
# seria interpretado como song_id e causaria erro 422.
# ============================================================

@app.get("/api/music")
def list_user_music(user=Depends(get_current_user)):
    songs = get_songs() or []
    owned_songs = [
        song for song in songs
        if isinstance(song, dict)
        and song.get("user_id") is not None
        and int(song.get("user_id")) == int(user["id"])
    ]
    owned_songs.sort(
        key=lambda item: str(item.get("created_at") or ""),
        reverse=True
    )
    return [serialize_song(song, user=user) for song in owned_songs]


@app.get("/api/music/favorites")
def list_user_favorites(user=Depends(get_current_user)):
    favorite_items = get_favorites(user["id"]) or []
    result = []

    for item in favorite_items:
        if not isinstance(item, dict):
            continue

        # DB implementations may return a joined song or a favorite row.
        nested_song = item.get("song") or item.get("music")
        if isinstance(nested_song, dict):
            song = nested_song
        else:
            song_id = item.get("song_id") or item.get("music_id") or item.get("id")
            try:
                song = get_song(int(song_id)) if song_id is not None else None
            except (TypeError, ValueError):
                song = None
            if song is None and item.get("title"):
                song = item

        if song:
            result.append(serialize_song(song, user=user))

    return result



# ============================================================
@app.get("/api/music/{song_id}/status")
def get_music_generation_status(song_id: int, user=Depends(get_current_user)):
    song = get_song(song_id)
    if not song or (song.get("user_id") != user["id"] and not user.get("is_admin")):
        raise HTTPException(status_code=404, detail="Geração não encontrada.")
    if song.get("status") in {"completed", "failed"} or not song.get("task_id"):
        return serialize_song(song, user=user)

    try:
        gen_json = json.loads(song.get("generation_json") or "{}")
    except (TypeError, ValueError):
        gen_json = {}
    task_id = str(song.get("task_id"))
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=503, detail="MUREKA_API_KEY não configurada.")
    url = f"{MUREKA_BASE_URL}/v1/song/query/{task_id}"
    headers = {"Authorization": f"Bearer {MUREKA_API_KEY}"}
    provider_name = "Mureka"

    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
    except requests.RequestException as exc:
        logger.warning("Generation status query failed (%s): %s", provider_name, exc)
        raise HTTPException(status_code=502, detail=f"Não foi possível consultar o estado na {provider_name}.")

    state = str(result.get("status") or "processing").strip().lower()
    choices = result.get("choices") or result.get("clips") or []
    first = choices[0] if choices and isinstance(choices[0], dict) else {}
    audio_url = first.get("url") or first.get("audio_url") or first.get("mp3_url") or first.get("wav_url") or result.get("audio_url") or result.get("url")
    cover_url = first.get("image_url") or first.get("cover_url") or result.get("image_url")
    gen_json["result"] = result
    changes = {"generation_json": json.dumps(gen_json)}

    if state in {"succeeded", "success", "complete", "completed"}:
        if audio_url:
            changes.update(status="completed", audio_url=audio_url, cover_url=cover_url)
        else:
            state = "processing"
    elif state in {"failed", "error", "timeouted", "cancelled", "canceled"}:
        failure = str(result.get("failed_reason") or result.get("error") or result.get("message") or f"A geração falhou na {provider_name}.")[:1000]
        changes.update(status="failed", error_message=failure)
        if not gen_json.get("credit_restored"):
            credit_lot_id = gen_json.get("credit_lot_id")
            if credit_lot_id:
                restore_user_credit(credit_lot_id)
            gen_json["credit_restored"] = True
            changes["generation_json"] = json.dumps(gen_json)

    update_song(song_id=song_id, **changes)
    refreshed = get_song(song_id)
    serialized = serialize_song(refreshed, user=user)
    serialized["clips"] = choices
    serialized["generation_status"] = state
    if state in {"failed", "error", "timeouted", "cancelled", "canceled"}:
        serialized["generation_error"] = str(result.get("failed_reason") or result.get("error") or result.get("message") or "A geração falhou.")[:1000]
    return serialized


@app.get(
    "/api/music/{song_id}"
)
def get_music(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_access(
        song_id,
        user
    )

    return serialize_song(
        song,
        user=user
    )


# ============================================================
# DELETE MÚSICA
#
# Somente proprietário ou admin.
# ============================================================

@app.delete(
    "/api/music/{song_id}"
)
def remove_music(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_owner(
        song_id,
        user
    )

    audio_file = song.get(
        "audio_file"
    )

    deleted = delete_song(
        song_id
    )

    if not deleted:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    # --------------------------------------------------------
    # Apagar ficheiro
    # --------------------------------------------------------

    if audio_file:

        path = (
            MUSIC_DIR /
            Path(
                str(audio_file)
            ).name
        )

        try:

            if path.exists():

                path.unlink()

        except Exception:

            pass

    return {

        "success": True,

        "message":
            "Música eliminada com sucesso.",

        "id":
            song_id
    }


@app.post(
    "/api/music/{song_id}/favorite"
)
def favorite_music(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_access(
        song_id,
        user
    )

    if song.get(
        "status"
    ) != "completed":

        raise HTTPException(
            status_code=400,
            detail="A música ainda não está disponível."
        )

    added = add_favorite(
        user["id"],
        song_id
    )

    return {

        "success": True,

        "favorite": True,

        "created":
            added
    }


@app.delete(
    "/api/music/{song_id}/favorite"
)
def unfavorite_music(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    removed = remove_favorite(
        user["id"],
        song_id
    )

    return {

        "success": True,

        "favorite": False,

        "removed":
            removed
    }


# ============================================================
# HISTÓRICO
# ============================================================

@app.post(
    "/api/music/{song_id}/history"
)
def add_music_history(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_access(
        song_id,
        user
    )

    if song.get(
        "status"
    ) != "completed":

        raise HTTPException(
            status_code=400,
            detail="A música ainda não está disponível."
        )

    add_history(
        user["id"],
        song_id
    )

    return {

        "success": True
    }

# ============================================================
# HISTÓRICO — LISTAR MÚSICAS DO UTILIZADOR
# ============================================================

@app.get("/api/music/history/list")
@app.get("/api/music/history")
def list_history(
    user=Depends(get_current_user)
):
    history = get_history(user["id"])

    result = []

    for song in history:
        if not song:
            continue

        owner_id = song.get("user_id")
        is_public = bool(song.get("is_public", 0))

        # Mostrar músicas próprias ou públicas.
        if (
            owner_id != user["id"]
            and not is_public
            and not bool(user.get("is_admin", 0))
        ):
            continue

        result.append(
            serialize_song(
                song,
                user=user
            )
        )

    return result


@app.delete(
    "/api/music/{song_id}/history"
)
def remove_music_history(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    removed = remove_history(
        user["id"],
        song_id
    )

    return {

        "success": True,

        "removed":
            removed
    }

@app.delete(
    "/api/music/history"
)
def delete_all_history(
    user=Depends(
        get_current_user
    )
):

    count = clear_history(
        user["id"]
    )

    return {

        "success": True,

        "deleted":
            count
    }


# ============================================================
# COMUNIDADE

# ============================================================
# INTERAÇÕES DA COMUNIDADE
# ============================================================

def community_enrich(song, user_id=None):
    result = serialize_song(song, user=None, include_private_access=False)
    sid = int(song["id"])
    owner_id = song.get("user_id")
    result["likes_count"] = community_like_count(sid)
    result["liked_by_me"] = bool(user_id and community_has_like(user_id, sid))
    result["followers_count"] = community_follow_count(owner_id) if owner_id else 0
    result["following_author"] = bool(user_id and owner_id and community_is_following(user_id, owner_id))
    result["views_count"]=get_community_song_views(song["id"])
    return result

@app.get("/api/community/interactions")
def community_interactions(user=Depends(get_current_user)):
    return {"user_id": user["id"], "likes": [], "following": []}

@app.post("/api/community/{song_id}/like")
def community_like(song_id: int, user=Depends(get_current_user)):
    song = get_public_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Música pública não encontrada.")
    community_set_like(user["id"], song_id, True)
    return {"success": True, "liked": True, "likes_count": community_like_count(song_id)}

@app.delete("/api/community/{song_id}/like")
def community_unlike(song_id: int, user=Depends(get_current_user)):
    community_set_like(user["id"], song_id, False)
    return {"success": True, "liked": False, "likes_count": community_like_count(song_id)}

@app.post("/api/community/users/{author_id}/follow")
def community_follow(author_id: int, user=Depends(get_current_user)):
    if author_id == user["id"]:
        raise HTTPException(status_code=400, detail="Não podes seguir a tua própria conta.")
    if not get_user_by_id(author_id):
        raise HTTPException(status_code=404, detail="Autor não encontrado.")
    community_set_follow(user["id"], author_id, True)
    return {"success": True, "following": True, "followers_count": community_follow_count(author_id)}

@app.delete("/api/community/users/{author_id}/follow")
def community_unfollow(author_id: int, user=Depends(get_current_user)):
    community_set_follow(user["id"], author_id, False)
    return {"success": True, "following": False, "followers_count": community_follow_count(author_id)}

@app.get("/api/community/me/state")
def community_my_state(user=Depends(get_current_user)):
    with __import__("database").get_connection() as connection:
        likes = [r[0] for r in connection.execute("SELECT song_id FROM community_likes WHERE user_id=?", (user["id"],))]
        following = [r[0] for r in connection.execute("SELECT following_id FROM user_follows WHERE follower_id=?", (user["id"],))]
    return {"user_id": user["id"], "likes": likes, "following": following}

#=========================================================
# COMUNIDADE - ESTATISTICA DO UTILIZADOR AUTÊNTICADO
#========================================================
@app.get("/api/community/me/stats")
def get_my_community_stats(
    user=Depends(get_current_user)
):
    """ Devolve as caracteristicas reais da comunidade
    Pertencentes ao utilizador autenticado.
    """
    try:
        user_id= int(user["id"])
        stats = get_user_community_stats(user_id)

        return {
            "success": True,
            "published_count": stats.get(
                "published_count", 0
            ),
            "views_count": get_user_community_views(user_id),
            "likes_received": stats.get(
                "likes_received", 0
            ),
            "followers_count": stats.get(
                "followers_count", 0
            ),
            "following_count": stats.get(
                "following_count", 0
            )
        }
    except HTTPException:
        raise

    except Exception:
        logger.exception(
            "Erro ao carregar estatisticas da comunidade"
        )

        raise HTTPException(
            status_code=500,
            detail="Não foi possivel carregar as estatisticas da comunidade."
        )

@app.get(
    "/api/community"
)
def community_songs(
    limit: int = Query(
        default=100,
        ge=1,
        le=500
    )
):

    songs = get_public_songs(
        limit=limit
    )

    return [community_enrich(song) for song in songs]


@app.get(
    "/api/community/{song_id}"
)
def community_song(
    song_id: int
):

    song = get_public_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail=(
                "Música pública não encontrada."
            )
        )

    return serialize_song(
        song,
        user=None,
        include_private_access=False
    )

# ============================================================
# COMUNIDADE — PUBLICAÇÕES DO UTILIZADOR AUTENTICADO
# ============================================================

@app.get("/api/community/me/songs")
def get_my_community_songs(
    limit: int = 100,
    user=Depends(get_current_user)
):
    """
    Devolve as músicas publicadas na comunidade
    pelo utilizador autenticado.
    """

    try:

        user_id = int(user["id"])

        # Limitar quantidade de resultados.
        limit = max(1, min(limit, 200))

        songs = get_user_community_songs(
            user_id=user_id,
            limit=limit
        )

        publications = []

        for song in songs:

            # Utilizar a função existente do main.py
            # para serializar as músicas públicas.
            publication = community_enrich(
                song,
                user_id=user_id
            )

            publications.append(publication)

        return {
            "success": True,
            "published_count": len(publications),
            "publications": publications
        }

    except HTTPException:
        raise

    except Exception:

        logger.exception(
            "Erro ao carregar publicações da comunidade"
        )

        raise HTTPException(
            status_code=500,
            detail="Não foi possível carregar as publicações da comunidade."
        )
# ============================================================
# PUBLICAR NA COMUNIDADE
#
# SOMENTE o proprietário ou admin.
# ============================================================

@app.post(
    "/api/community/{song_id}/publish"
)
def publish_song(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_owner(
        song_id,
        user
    )

    if song.get(
        "status"
    ) != "completed":

        raise HTTPException(
            status_code=400,
            detail=(
                "Só é possível publicar "
                "músicas concluídas."
            )
        )

    set_song_public(
        song_id,
        True
    )

    updated = get_song(
        song_id
    )

    return {

        "success": True,

        "message":
            "Música publicada na comunidade.",

        "song":
            serialize_song(
                updated,
                user=user
            )
    }


# ============================================================
# RETIRAR DA COMUNIDADE
# ============================================================

@app.delete(
    "/api/community/{song_id}/publish"
)
def unpublish_song(
    song_id: int,

    user=Depends(
        get_current_user
    )
):

    song = require_song_owner(
        song_id,
        user
    )

    set_song_public(
        song_id,
        False
    )

    updated = get_song(
        song_id
    )

    return {

        "success": True,

        "message":
            "Música retirada da comunidade.",

        "song":
            serialize_song(
                updated,
                user=user
            )
    }

# ============================================================
# COMUNIDADE — REGISTAR VISUALIZAÇÃO
# ============================================================

@app.post("/api/community/{song_id}/view")
def register_song_view(
    song_id: int,
    request: Request
):
    """
    Regista uma visualização de uma música pública.

    Não exige autenticação para permitir visitantes.
    """

    song = get_public_song(song_id)

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Música pública não encontrada."
        )

    # Identificar o visitante sem guardar o IP em texto.
    client_ip = (
        request.client.host
        if request.client
        else "unknown"
    )

    user_agent = request.headers.get(
        "user-agent",
        ""
    )[:300]

    # Usa a chave secreta já configurada no backend.
    # SECRET_KEY deve ser a mesma utilizada pelo JWT.
    identity = f"{client_ip}|{user_agent}"

    viewer_key = hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        identity.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    registered = register_community_view(
        song_id=song_id,
        viewer_key=viewer_key
    )

    return {
        "success": True,
        "registered": registered,
        "views_count": get_community_song_views(song_id)
    }
# ============================================================
# ÁUDIO
#
# Esta rota protege arquivos privados.
#
# Público:
#   /api/audio/123
#
# Privado:
#   /api/audio/123?token=...
# ============================================================

@app.get(
    "/api/audio/{song_id}"
)
def serve_audio(
    song_id: int,

    token: Optional[str] = Query(
        default=None
    ),

    authorization: Optional[str] = Header(
        default=None
    )
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Áudio não encontrado."
        )

    if song.get(
        "status"
    ) != "completed":

        raise HTTPException(
            status_code=404,
            detail="Áudio ainda não disponível."
        )

    audio_file = song.get(
        "audio_file"
    )

    if not audio_file:

        raise HTTPException(
            status_code=404,
            detail="Ficheiro de áudio não encontrado."
        )

    # --------------------------------------------------------
    # Música pública
    # --------------------------------------------------------

    is_public = bool(
        song.get(
            "is_public",
            0
        )
    )

    if not is_public:

        # ----------------------------------------------------
        # Primeiro tenta token de áudio.
        # ----------------------------------------------------

        audio_payload = None

        if token:

            audio_payload = decode_audio_token(
                token
            )

        if audio_payload:

            try:

                token_song_id = int(
                    audio_payload.get(
                        "song_id"
                    )
                )

                token_user_id = int(
                    audio_payload.get(
                        "user_id"
                    )
                )

            except Exception:

                raise HTTPException(
                    status_code=403,
                    detail="Token de áudio inválido."
                )

            if token_song_id != song_id:

                raise HTTPException(
                    status_code=403,
                    detail="Token não corresponde à música."
                )

            if song.get(
                "user_id"
            ) != token_user_id:

                raise HTTPException(
                    status_code=403,
                    detail="Sem permissão para este áudio."
                )

        else:

            # ------------------------------------------------
            # Tenta Authorization Bearer.
            # ------------------------------------------------

            bearer = extract_bearer_token(
                authorization
            )

            if not bearer:

                raise HTTPException(
                    status_code=403,
                    detail="Áudio privado."
                )

            payload = decode_token(
                bearer
            )

            try:

                user_id = int(
                    payload.get(
                        "user_id",
                        payload.get(
                            "sub"
                        )
                    )
                )

            except Exception:

                raise HTTPException(
                    status_code=403,
                    detail="Token inválido."
                )

            is_admin = bool(
                payload.get(
                    "is_admin",
                    False
                )
            )

            if (
                not is_admin
                and
                song.get(
                    "user_id"
                ) != user_id
            ):

                raise HTTPException(
                    status_code=403,
                    detail="Sem permissão para este áudio."
                )

    # --------------------------------------------------------
    # Caminho seguro
    # --------------------------------------------------------

    filename = Path(
        str(audio_file)
    ).name

    file_path = (
        MUSIC_DIR /
        filename
    )

    if not file_path.exists():

        raise HTTPException(
            status_code=404,
            detail="Ficheiro de áudio não encontrado no servidor."
        )

    return FileResponse(
        path=file_path,
        media_type="audio/mpeg",
        filename=filename
    )


# ============================================================
# ADMIN — ESTATÍSTICAS
#
# FUTURO
# ============================================================

@app.get(
    "/api/admin/statistics"
)
def admin_statistics(
    admin=Depends(
        require_admin
    )
):

    return get_statistics()
# ============================================================
# PADDLE — INICIAR CHECKOUT INTERNACIONAL
# ============================================================

@app.post("/api/paddle/checkout")
def create_paddle_checkout(
    data: PaddleCheckoutRequest,
    user=Depends(get_current_user)
):

    if PADDLE_ENV not in {"sandbox", "production"}:
        raise HTTPException(
            status_code=500,
            detail="Ambiente Paddle inválido."
        )

    if not PADDLE_CLIENT_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Paddle Client Token não configurado."
        )

    plan = get_plan_by_id(data.plan_id)

    if not plan or not plan.get("is_active"):
        raise HTTPException(
            status_code=404,
            detail="Plano indisponível."
        )

    plan_code = plan.get("code")

    if plan_code not in {"basic", "premium"}:
        raise HTTPException(
            status_code=400,
            detail="Este plano não aceita checkout internacional."
        )

    price_id = PADDLE_PRICE_IDS.get(plan_code)

    if not price_id or not price_id.startswith("pri_"):
        raise HTTPException(
            status_code=503,
            detail="Preço Paddle não configurado para este plano."
        )

    amount_usd = {
        "basic": 5.99,
        "premium": 11.99
    }[plan_code]

    now = datetime.utcnow().isoformat()

    # Criar registo local em USD.
    # O navegador nunca escolhe o preço.

    try:

        with get_connection() as connection:

            cursor = connection.cursor()

            cursor.execute("""
                INSERT INTO payments (
                    user_id,
                    plan_id,
                    amount,
                    currency,
                    payment_method,
                    payment_provider,
                    transaction_reference,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, 'USD', 'card',
                        'paddle', ?, 'pending', ?, ?)
            """, (
                user["id"],
                plan["id"],
                amount_usd,
                "paddle_pending_" + uuid.uuid4().hex,
                now,
                now
            ))

            payment_id = cursor.lastrowid

            connection.commit()

    except Exception:

        logger.exception(
            "Erro ao criar pagamento Paddle."
        )

        raise HTTPException(
            status_code=500,
            detail="Não foi possível iniciar o pagamento."
        )

    return {
        "success": True,
        "provider": "paddle",
        "environment": PADDLE_ENV,
        "payment_id": payment_id,
        "plan_code": plan_code,
        "amount": amount_usd,
        "currency": "USD",
        "billing_interval": "month",
        "client_token": PADDLE_CLIENT_TOKEN,
        "price_id": price_id,
        "customer": {
            "email": user["email"]
        },
        "custom_data": {
            "local_payment_id": str(payment_id),
            "user_id": str(user["id"]),
            "plan_code": plan_code
        }
    }


# ============================================================
# ESTATÍSTICAS DO PERFIL
# ============================================================
@app.get("/auth/me/stats")
def get_my_profile_stats(
    user=Depends(get_current_user)
):
    stats = get_user_profile_stats(user["id"])
    return {
        "success": True,
        **stats
    }
# ============================================================
# ADMIN — UTILIZADORES
#
# FUTURO
# ============================================================

@app.get(
    "/api/admin/users"
)
def admin_users(
    admin=Depends(
        require_admin
    )
):

    return get_all_users()


@app.patch(
    "/api/admin/users/{user_id}/active"
)
def admin_update_user_active(
    user_id: int,

    data: AdminActiveRequest,

    admin=Depends(
        require_admin
    )
):

    if user_id == admin["id"]:

        raise HTTPException(
            status_code=400,
            detail=(
                "O administrador não pode "
                "desativar a própria conta."
            )
        )

    updated = update_user_active(
        user_id,
        data.is_active
    )

    if not updated:

        raise HTTPException(
            status_code=404,
            detail="Utilizador não encontrado."
        )

    return {

        "success": True,

        "user_id":
            user_id,

        "is_active":
            data.is_active
    }


# ============================================================
# ADMIN — TODAS AS MÚSICAS
#
# FUTURO
# ============================================================

@app.get(
    "/api/admin/music"
)
def admin_music(
    admin=Depends(
        require_admin
    )
):

    songs = get_songs()

    return [
        serialize_song(
            song,
            user=admin
        )
        for song in songs
    ]


# ============================================================
# ADMIN — MÚSICA ESPECÍFICA
# ============================================================

@app.get(
    "/api/admin/music/{song_id}"
)
def admin_get_music(
    song_id: int,

    admin=Depends(
        require_admin
    )
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    return serialize_song(
        song,
        user=admin
    )


# ============================================================
# ADMIN — APAGAR MÚSICA
# ============================================================

@app.delete(
    "/api/admin/music/{song_id}"
)
def admin_delete_music(
    song_id: int,

    admin=Depends(
        require_admin
    )
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    audio_file = song.get(
        "audio_file"
    )

    deleted = delete_song(
        song_id
    )

    if audio_file:

        path = (
            MUSIC_DIR /
            Path(
                str(audio_file)
            ).name
        )

        try:

            if path.exists():

                path.unlink()

        except Exception:

            pass

    return {

        "success":
            deleted,

        "message":
            "Música eliminada pelo administrador."
    }


# ============================================================
# ADMIN — PUBLICAR / DESPUBLICAR
# ============================================================

@app.patch(
    "/api/admin/music/{song_id}/public"
)
def admin_set_public(
    song_id: int,

    data: PublishRequest,

    admin=Depends(
        require_admin
    )
):

    song = get_song(
        song_id
    )

    if not song:

        raise HTTPException(
            status_code=404,
            detail="Música não encontrada."
        )

    set_song_public(
        song_id,
        data.is_public
    )

    updated = get_song(
        song_id
    )

    return {

        "success": True,

        "is_public":
            data.is_public,

        "song":
            serialize_song(
                updated,
                user=admin
            )
    }


# ============================================================
# ROOT(ROTA)
# ============================================================

@app.get(
    "/"
)
def root():
    login_file=FRONTEND_DIR / "login.html"
    if not login_file.exists():
        raise HTTPException(
            status_code=404,
            detail="login.html não encontrado."
        )
    return FileResponse(
        path=login_file
    )

# ============================================================
# PLANOS - LISTAR PLANOS DISPONÍVEIS
# ============================================================
@app.get("/api/plans")
def list_plans():
    plans = get_all_plans(
        active_only=True
    )
    return {
        "success": True,
        "plans": plans
    }

@app.get("/api/payments/p2p/options")
def p2p_payment_options(user=Depends(get_current_user)):
    methods = []
    if P2P_UNIFI_DETAILS:
        methods.append({"id": "unifi_transfer", "label": "Transferência internacional UniFi", "details": P2P_UNIFI_DETAILS, "currency": "USD"})
    if P2P_BANK_DETAILS:
        methods.append({"id": "bank_transfer", "label": "Transferência bancária", "details": P2P_BANK_DETAILS, "currency": "AOA"})
    if P2P_MULTICAIXA_DETAILS:
        methods.append({"id": "multicaixa_express", "label": "Multicaixa Express (manual)", "details": P2P_MULTICAIXA_DETAILS, "currency": "AOA"})
    if P2P_USDC_WALLET_ADDRESS and P2P_USDC_NETWORK and P2P_USDC_AOA_RATE > 0:
        methods.append({
            "id": "usdc", "label": "USDC", "details": "Enviar apenas USDC na rede indicada.",
            "currency": "USDC", "network": P2P_USDC_NETWORK,
            "wallet_address": P2P_USDC_WALLET_ADDRESS,
            "aoa_per_usdc": str(P2P_USDC_AOA_RATE)
        })
    return {"success": True, "methods": methods}

# ============================================================
# SUBSCRIÇÕES - PLANO ACTUAL DO UTILIZADOR
# ============================================================
@app.get("/api/subscriptions/me")
def my_subscription(
    user=Depends(get_current_user)
):
    subscription = get_user_subscription(
        user["id"]
    )
    credits = get_user_credit_summary(user["id"])
    if subscription:
        return {
            "success": True,
            "has_subscription": True,
            "subscription": subscription,
            "credits": credits,
            "total_credits": credits["total_credits"],
            "active_credit_lots": credits["active_lots"],
        }
    free_plan = get_plan_by_code("free")
    return {
        "success": True,
        "has_subscription": False,
        "subscription": None,
        "default_plan": free_plan,
        "credits": credits,
        "total_credits": credits["total_credits"],
        "active_credit_lots": credits["active_lots"],
    }
# ============================================================
# PADDLE — VERIFICAR ASSINATURA DO WEBHOOK
# ============================================================

def verify_paddle_signature(
    raw_body: bytes,
    signature_header: str
):

    if not PADDLE_WEBHOOK_SECRET:
        logger.error(
            "PADDLE_WEBHOOK_SECRET não configurado."
        )
        return False

    if not signature_header:
        return False

    timestamp = None
    signatures = []

    try:

        for part in signature_header.split(";"):

            key, value = part.strip().split("=", 1)

            if key == "ts":
                timestamp = value

            elif key == "h1":
                signatures.append(value)

        if not timestamp or not signatures:
            return False

        timestamp_int = int(timestamp)

        # Proteção contra pedidos antigos.
        if abs(time.time() - timestamp_int) > 5:
            return False

        signed_payload = (
            timestamp.encode("utf-8")
            + b":"
            + raw_body
        )

        expected_signature = hmac.new(
            PADDLE_WEBHOOK_SECRET.encode("utf-8"),
            signed_payload,
            hashlib.sha256
        ).hexdigest()

        return any(
            hmac.compare_digest(
                expected_signature,
                received_signature
            )
            for received_signature in signatures
        )

    except Exception:

        logger.exception(
            "Erro ao verificar assinatura Paddle."
        )

        return False

# ============================================================
# PAGAMENTOS - HISTÓRICO DO UTILIZADOR
# ============================================================
@app.get("/api/payments/me")
def my_payments(
    user=Depends(get_current_user)
):
    payments = get_user_payments(
        user["id"]
    )
    return {
        "success":True,
        "payments":payments
    }

# ============================================================
# PAGAMENTOS — CRIAR PEDIDO
# ============================================================

@app.post("/api/payments")
def create_payment_request(
    data: CreatePaymentRequest,
    user=Depends(get_current_user)
):

    payment_method = data.payment_method.strip().lower()

    allowed_methods = {
        "bank_transfer",
        "multicaixa_express",
        "unifi_transfer",
        "usdc"
    }

    if payment_method not in allowed_methods:

        raise HTTPException(
            status_code=400,
            detail="Método de pagamento inválido."
        )

    if payment_method == "unifi_transfer" and not P2P_UNIFI_DETAILS:
        raise HTTPException(status_code=503, detail="Dados de recebimento UniFi ainda não configurados.")
    if payment_method == "bank_transfer" and not P2P_BANK_DETAILS:
        raise HTTPException(status_code=503, detail="Dados de transferência bancária ainda não configurados.")
    if payment_method == "multicaixa_express" and not P2P_MULTICAIXA_DETAILS:
        raise HTTPException(status_code=503, detail="Dados Multicaixa Express ainda não configurados.")
    if payment_method == "usdc" and not (P2P_USDC_WALLET_ADDRESS and P2P_USDC_NETWORK and P2P_USDC_AOA_RATE > 0):
        raise HTTPException(status_code=503, detail="USDC ainda não está configurado. Configure rede, carteira e taxa AOA/USDC.")

    plan = get_plan_by_id(
        data.plan_id
    )

    if not plan or not plan.get("is_active"):

        raise HTTPException(
            status_code=404,
            detail="Plano inexistente ou indisponível."
        )

    if plan.get("code") == "free":

        raise HTTPException(
            status_code=400,
            detail="O plano gratuito não necessita de pagamento."
        )

    # O preço é obtido da base de dados.
    # Nunca aceitar o preço enviado pelo navegador.

    amount = float(
        plan.get("price", 0)
    )

    if amount <= 0:

        raise HTTPException(
            status_code=409,
            detail=(
                "Este plano ainda não tem um preço configurado. "
                "Contacte o administrador."
            )
        )

    try:

        payment_id = create_payment(
            user_id=user["id"],
            plan_id=plan["id"],
            amount=amount,
            payment_method=payment_method,
            payment_provider=(
                "manual"
                if payment_method in {"bank_transfer", "unifi_transfer", "usdc"}
                else "pending_integration"
            ),
            transaction_reference=(
                data.transaction_reference.strip()
                if data.transaction_reference
                else None
            )
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    response = {
        "success": True,
        "message": "Pedido criado. Envie o pagamento e aguarde confirmação.",
        "payment_id": payment_id,
        "amount": amount,
        "currency": plan.get("currency", "AOA"),
        "status": "pending",
        "payment_method": payment_method
    }
    if payment_method == "usdc":
        response.update({
            "crypto_amount": str((Decimal(str(amount)) / P2P_USDC_AOA_RATE).quantize(Decimal("0.000001"))),
            "crypto_currency": "USDC",
            "network": P2P_USDC_NETWORK,
            "wallet_address": P2P_USDC_WALLET_ADDRESS
        })
    return response
@app.post("/api/bitpay/checkout")
def create_bitpay_checkout(
    data: BitPayCheckoutRequest,
    user=Depends(get_current_user)
):

    if not BITPAY_SK:
        raise HTTPException(
            status_code=503,
            detail="BITPAY_SK não está configurada no servidor."
        )

    if BITPAY_ENV != "sandbox":
        raise HTTPException(
            status_code=403,
            detail="Esta integração está configurada para Sandbox."
        )

    # --------------------------------------------------------
    # VALIDAR PLANO
    # --------------------------------------------------------

    plan = get_plan_by_id(data.plan_id)

    if not plan or not plan.get("is_active"):
        raise HTTPException(
            status_code=404,
            detail="Plano inexistente ou indisponível."
        )

    if plan.get("code") == "free":
        raise HTTPException(
            status_code=400,
            detail="O plano gratuito não necessita de pagamento."
        )

    currency = str(
        plan.get("currency", "AOA")
    ).upper()

    if currency != "AOA":
        raise HTTPException(
            status_code=400,
            detail="O BitPay Angola aceita pagamentos em AOA."
        )

    try:
        amount_decimal = Decimal(
            str(plan.get("price", 0))
        )

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Preço do plano inválido."
        )

    if amount_decimal <= 0:
        raise HTTPException(
            status_code=400,
            detail="O plano não possui um preço válido."
        )

    if amount_decimal != amount_decimal.to_integral_value():
        raise HTTPException(
            status_code=400,
            detail="O preço BitPay deve ser um valor inteiro em AOA."
        )

    amount = int(amount_decimal)

    # --------------------------------------------------------
    # VALIDAR MULTICAIXA EXPRESS
    # --------------------------------------------------------

    mobile = None

    if data.payment_method == "multicaixa_express":

        if not data.mobile:
            raise HTTPException(
                status_code=400,
                detail="O número Multicaixa Express é obrigatório."
            )

        mobile = re.sub(
            r"\D",
            "",
            data.mobile
        )

        if mobile.startswith("244") and len(mobile) == 12:
            mobile = mobile[3:]

        if not re.fullmatch(r"9\d{8}", mobile):
            raise HTTPException(
                status_code=400,
                detail="Número Multicaixa inválido."
            )

    # --------------------------------------------------------
    # CRIAR REFERÊNCIA LOCAL ÚNICA
    # --------------------------------------------------------

    local_reference = (
        "SM-" + uuid.uuid4().hex[:24]
    )

    try:

        payment_id = create_payment(
            user_id=user["id"],
            plan_id=plan["id"],
            amount=amount,
            payment_method=data.payment_method,
            payment_provider="bitpay",
            transaction_reference=local_reference
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception:

        logger.exception(
            "Erro ao criar pagamento local BitPay."
        )

        raise HTTPException(
            status_code=500,
            detail="Não foi possível registar o pagamento."
        )

    # --------------------------------------------------------
    # PREPARAR PEDIDO BITPAY
    # --------------------------------------------------------

    payload = {

        "amount": amount,

        "currency": "AOA",

        "payment_method": data.payment_method,

        "merchant_reference": local_reference,

        "metadata": {

            "local_payment_id": str(payment_id),

            "user_id": str(user["id"]),

            "plan_id": str(plan["id"]),

            "plan_code": str(plan["code"])

        }
    }

    if data.payment_method == "multicaixa_express":

        payload["customer"] = {
            "mobile": mobile
        }

    headers = {

        "Authorization": f"Bearer {BITPAY_SK}",

        "Content-Type": "application/json",

        "Idempotency-Key": local_reference

    }

    # --------------------------------------------------------
    # ENVIAR PARA BITPAY
    # --------------------------------------------------------

    try:

        response = requests.post(

            f"{BITPAY_API_BASE}/payment_intents",

            headers=headers,

            json=payload,

            timeout=20

        )

        if not response.ok:

            logger.error(
                "BitPay recusou pedido: HTTP %s - %s",
                response.status_code,
                response.text[:1000]
            )

            # Apenas rejeitar quando existe uma resposta
            # definitiva de erro do fornecedor.
            # Timeout e respostas ambíguas permanecem pendentes.

            if (
                400 <= response.status_code < 500
                and response.status_code not in {408, 409, 429}
            ):

                update_payment_status(
                    payment_id=payment_id,
                    status="rejected",
                    admin_note="BitPay recusou o pedido."
                )

            raise HTTPException(
                status_code=502,
                detail=(
                    "Não foi possível concluir a comunicação "
                    "com o BitPay. Consulta o histórico antes "
                    "de tentar criar outro pagamento."
                )
            )

        result = response.json()

    except HTTPException:
        raise

    except requests.RequestException:

        logger.exception(
            "Falha de comunicação com BitPay."
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Sem resposta do BitPay. O pagamento local "
                "permanece pendente para evitar duplicação."
            )
        )

    except ValueError:

        logger.exception(
            "Resposta JSON inválida do BitPay."
        )

        raise HTTPException(
            status_code=502,
            detail="O BitPay devolveu uma resposta inválida."
        )

    # --------------------------------------------------------
    # VALIDAR RESPOSTA
    # --------------------------------------------------------

    bitpay_payment_id = result.get("id")

    if not bitpay_payment_id:

        logger.error(
            "BitPay não devolveu o ID do pagamento: %s",
            result
        )

        raise HTTPException(
            status_code=502,
            detail="O BitPay não devolveu o identificador do pagamento."
        )

    # --------------------------------------------------------
    # GUARDAR ID DO FORNECEDOR
    # --------------------------------------------------------

    try:

        with get_connection() as connection:

            connection.execute(
                """
                UPDATE payments

                SET
                    provider_transaction_id = ?,
                    updated_at = ?

                WHERE id = ?
                  AND payment_provider = 'bitpay'
                """,
                (
                    bitpay_payment_id,
                    datetime.utcnow().isoformat(),
                    payment_id
                )
            )

            connection.commit()

    except Exception:

        logger.exception(
            "Não foi possível guardar o ID BitPay."
        )

        raise HTTPException(
            status_code=500,
            detail="Pagamento criado, mas não foi possível actualizar o registo local."
        )

    # --------------------------------------------------------
    # RESPOSTA AO FRONTEND
    # --------------------------------------------------------

    return {

        "success": True,

        "provider": "bitpay",

        "environment": BITPAY_ENV,

        "payment_id": payment_id,

        "bitpay_payment_id": bitpay_payment_id,

        "plan_code": plan["code"],

        "amount": amount,

        "currency": "AOA",

        "payment_method": data.payment_method,

        "status": result.get("status", "PENDING"),

        "reference": result.get("reference"),

        "message": (
            "Pagamento criado. Aguarda a confirmação "
            "do Multicaixa."
        )

    }


# Os planos Básicos e Premium que configuramos inicialmente têm preço Zero.
# Esta rota recusará pedidos pagos enquanto o administrador não definir preços válidos

#=============================================================
# ADMIN - LISTAR PAGAMENTOS
#=============================================================
@app.get("/api/admin/payments")
def admin_list_payments(
    status: Optional[str] = Query(
        default=None
    ),
    admin=Depends(require_admin)
):
    allowed_statuses = {
        "pending",
        "confirmed",
        "rejected",
        "cancelled"
    }

    if status is not None and status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Estado de pagamento inválido."
        )
    payments = get_all_payments(
        status=status
    )
    return {
        "success": True,
        "payments": payments
    }

#=============================================================
# ADMIN - ANALISAR PAGAMENTO
#=============================================================
@app.patch("/api/admin/payments/{payment_id}/review")
def admin_review_payment(
    payment_id: int,
    data: ReviewPaymentRequest,
    admin=Depends(require_admin)
):
    payment = get_payment_by_id(
        payment_id
    )

    if not payment:
        raise HTTPException(
            status_code=404,
            detail="Pagamento não encontrado."
        )
    if payment.get("status") != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                "Este pagamento já foi analisado"
                "ou deixou de estar pendente."
            )
        )
    try:
        if data.status == "confirmed":
            # Só confirmar depois de verificar
            # efectivamente o recebimento do dinheiro.
            result = confirm_payment_and_activate_subscription(
                payment_id=payment_id,
                reviewed_by=admin["id"],
                admin_note=data.admin_note
            )
            if result is None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "O pagamento já foi processado ou não está pendente."
                    )
                )

            return {
                "success": True,
                "message": (
                    "Pagamento confirmado e subscrição activada."
                ),
                "result": result
            }
        updated = update_payment_status(
            payment_id=payment_id,
            status="rejected",
            reviewed_by=admin["id"],
            admin_note=data.admin_note
        )
        if not updated:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Não foi possivel rejeitar o pagamento."
                    "Verifique o estado actual."
                )
            )
        return {
            "success":True,
            "message":"Pagamento regeitado.",
            "payment_id":payment_id,
            "status": "rejected"
        }
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

# ============================================================
# PAGAMENTOS - ENVIAR COMPROVATIVO
# ============================================================

@app.post("/api/payments/{payment_id}/proof")
async def upload_payment_proof(
    payment_id: int,
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):

    payment = get_payment_by_id(payment_id)

    if not payment:
        raise HTTPException(
            status_code=404,
            detail="Pagamento não encontrado."
        )

    if payment["user_id"] != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="Não tem autorização para este pagamento."
        )

    if payment["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail="Este pagamento já foi processado."
        )

    if payment["payment_method"] not in {"bank_transfer", "unifi_transfer", "multicaixa_express", "usdc"}:
        raise HTTPException(
            status_code=400,
            detail="Este método não aceita comprovativo manual."
        )

    if payment.get("proof_file"):
        raise HTTPException(
            status_code=409,
            detail="Este pagamento já possui um comprovativo."
        )

    if file.content_type not in ALLOWED_PAYMENT_PROOF_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Utilize JPG, PNG ou PDF."
        )

    try:
        content = await file.read(
            MAX_PAYMENT_PROOF_SIZE + 1
        )

        if len(content) > MAX_PAYMENT_PROOF_SIZE:
            raise HTTPException(
                status_code=413,
                detail="O comprovativo não pode ultrapassar 5 MB."
            )

        if not content:
            raise HTTPException(
                status_code=400,
                detail="O ficheiro está vazio."
            )

        # Validar a assinatura real do ficheiro.
        # Não confiar apenas no Content-Type enviado.

        if file.content_type == "image/jpeg":

            valid = content.startswith(b"\xff\xd8\xff")

        elif file.content_type == "image/png":

            valid = content.startswith(
                b"\x89PNG\r\n\x1a\n"
            )

        else:

            valid = content.startswith(b"%PDF-")

        if not valid:
            raise HTTPException(
                status_code=400,
                detail="O conteúdo do ficheiro não corresponde ao formato."
            )

        extension = ALLOWED_PAYMENT_PROOF_TYPES[
            file.content_type
        ]

        filename = f"{uuid.uuid4().hex}{extension}"

        filepath = PAYMENT_PROOFS_DIR / filename

        # Criar o ficheiro sem substituir outro existente.

        with open(filepath, "xb") as destination:
            destination.write(content)

        try:

            updated = update_payment_proof(
                payment_id=payment_id,
                user_id=user["id"],
                proof_file=filename
            )

        except Exception:

            filepath.unlink(missing_ok=True)
            raise

        if not updated:

            filepath.unlink(missing_ok=True)

            raise HTTPException(
                status_code=409,
                detail=(
                    "Não foi possível associar o comprovativo. "
                    "O pagamento pode ter sido alterado."
                )
            )

        return {
            "success": True,
            "message": "Comprovativo enviado com sucesso.",
            "payment_id": payment_id,
            "status": "pending",
            "proof_uploaded": True
        }

    finally:

        await file.close()

@app.get("/api/admin/payments/{payment_id}/proof")
def admin_download_payment_proof(payment_id: int, admin=Depends(require_admin)):
    payment = get_payment_by_id(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado.")
    filename = payment.get("proof_file")
    if not filename:
        raise HTTPException(status_code=404, detail="Este pagamento não tem comprovativo.")
    safe_name = Path(str(filename)).name
    filepath = PAYMENT_PROOFS_DIR / safe_name
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Comprovativo não encontrado no servidor.")
    return FileResponse(filepath, filename=safe_name)

# ============================================================
# PAGAMENTOS - CONSULTAR COMPROVATIVO
# ============================================================

@app.get("/api/payments/{payment_id}/proof")
def view_payment_proof(
    payment_id: int,
    user=Depends(get_current_user)
):

    payment = get_payment_by_id(payment_id)

    if not payment:
        raise HTTPException(
            status_code=404,
            detail="Pagamento não encontrado."
        )

    is_owner = payment["user_id"] == user["id"]

    is_admin = bool(user.get("is_admin"))

    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Acesso não autorizado."
        )

    filename = payment.get("proof_file")

    if not filename:
        raise HTTPException(
            status_code=404,
            detail="Este pagamento não possui comprovativo."
        )

    # Impedir acesso a caminhos fora da pasta privada.

    filepath = (
        PAYMENT_PROOFS_DIR / filename
    ).resolve()

    if filepath.parent != PAYMENT_PROOFS_DIR.resolve():
        raise HTTPException(
            status_code=403,
            detail="Caminho de ficheiro inválido."
        )

    if not filepath.is_file():
        raise HTTPException(
            status_code=404,
            detail="Ficheiro não encontrado."
        )

    return FileResponse(
        path=str(filepath),
        filename=filepath.name,
        media_type="application/octet-stream"
    )


# ============================================================
# PADDLE — WEBHOOK
# StudioMusic.AI
# ============================================================

def paddle_datetime(value):

    if not value:
        return None

    try:

        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).replace(
            tzinfo=None
        ).isoformat()

    except Exception:

        return None


def paddle_transaction_price_ids(data):

    price_ids = []

    for item in data.get("items", []):

        price_id = item.get("price_id")

        if not price_id:

            price = item.get("price") or {}

            price_id = price.get("id")

        if price_id:
            price_ids.append(price_id)

    return price_ids


def paddle_transaction_amount(data):

    totals = (
        data.get("details", {})
        .get("totals", {})
    )

    total = totals.get("total")

    if total is None:
        return None

    try:

        # Paddle envia os valores monetários
        # em unidades mínimas da moeda.
        return Decimal(str(total)) / Decimal("100")

    except Exception:

        return None


# ============================================================
# PROCESSAR TRANSAÇÃO CONCLUÍDA
# ============================================================

def process_paddle_transaction(
    connection,
    data
):

    transaction_id = data.get("id")

    subscription_id = data.get(
        "subscription_id"
    )

    customer_id = data.get(
        "customer_id"
    )

    custom_data = (
        data.get("custom_data") or {}
    )

    local_payment_id = custom_data.get(
        "local_payment_id"
    )

    currency = data.get(
        "currency_code"
    )

    amount = paddle_transaction_amount(data)

    if not transaction_id:
        raise ValueError(
            "Transação Paddle sem identificador."
        )

    # Idempotência ao nível da transacção: um mesmo transaction_id
    # não pode criar pagamentos/lotes adicionais em webhooks repetidos.
    already_processed = connection.execute(
        """
        SELECT id FROM payments
        WHERE provider_transaction_id = ? AND status = 'confirmed'
        LIMIT 1
        """,
        (transaction_id,)
    ).fetchone()
    if already_processed:
        return

    if currency != "USD":
        raise ValueError(
            "A moeda da transação não é USD."
        )

    if amount is None or amount <= 0:
        raise ValueError(
            "Valor da transação inválido."
        )

    if not subscription_id:
        raise ValueError(
            "A transação não contém uma assinatura Paddle."
        )

    price_ids = paddle_transaction_price_ids(
        data
    )

    # --------------------------------------------------------
    # LOCALIZAR PAGAMENTO INICIAL
    # --------------------------------------------------------

    payment = None

    if local_payment_id:

        try:

            local_payment_id = int(
                local_payment_id
            )

        except (TypeError, ValueError):

            raise ValueError(
                "Identificador local de pagamento inválido."
            )

        cursor = connection.execute(
            """
            SELECT
                payments.*,
                plans.code AS plan_code,
                plans.duration_days,
                plans.price_usd

            FROM payments

            INNER JOIN plans
                ON plans.id = payments.plan_id

            WHERE payments.id = ?
            """,
            (local_payment_id,)
        )

        payment = cursor.fetchone()

    # --------------------------------------------------------
    # SE NÃO EXISTIR PAGAMENTO INICIAL,
    # PROCURAR ASSINATURA PARA RENOVAÇÃO
    # --------------------------------------------------------

    existing_subscription = connection.execute(
        """
        SELECT *
        FROM subscriptions
        WHERE provider_subscription_id = ?
        LIMIT 1
        """,
        (subscription_id,)
    ).fetchone()

    if payment is None:

        if existing_subscription is None:

            logger.warning(
                "Transação Paddle sem pagamento local associado: %s",
                transaction_id
            )

            return

        # Pagamento de renovação.
        subscription = existing_subscription

        plan = connection.execute(
            """
            SELECT *
            FROM plans
            WHERE id = ?
            """,
            (subscription["plan_id"],)
        ).fetchone()

        if not plan:
            raise ValueError(
                "Plano da assinatura não encontrado."
            )

        now = datetime.utcnow().isoformat()

        renewal_cursor = connection.execute(
            """
            INSERT INTO payments (
                user_id,
                plan_id,
                subscription_id,
                amount,
                currency,
                payment_method,
                payment_provider,
                transaction_reference,
                provider_transaction_id,
                status,
                confirmed_at,
                created_at,
                updated_at
            )
            VALUES (
                ?, ?, ?, ?, 'USD',
                'card', 'paddle',
                ?, ?, 'confirmed',
                ?, ?, ?
            )
            """,
            (
                subscription["user_id"],
                subscription["plan_id"],
                subscription["id"],
                float(amount),
                transaction_id,
                transaction_id,
                now,
                now,
                now
            )
        )

        period = data.get(
            "billing_period"
        ) or {}

        period_end = paddle_datetime(
            period.get("ends_at")
        )

        if not period_end:

            period_end = (
                datetime.utcnow()
                + timedelta(
                    days=plan["duration_days"]
                )
            ).isoformat()

        period_start = paddle_datetime(
            (data.get("billing_period") or {}).get("starts_at")
        ) or now

        connection.execute(
            """
            UPDATE subscriptions

            SET
                status = 'active',
                starts_at = ?,
                expires_at = ?,
                next_billing_at = ?,
                updated_at = ?

            WHERE id = ?
            """,
            (
                period_start,
                period_end,
                period_end,
                now,
                subscription["id"]
            )
        )

        activate_payment_credits(
            connection, renewal_cursor.lastrowid, subscription["id"],
            period_start, period_end, now
        )

        return

    # --------------------------------------------------------
    # VALIDAR PAGAMENTO INICIAL
    # --------------------------------------------------------

    if payment["payment_provider"] != "paddle":
        raise ValueError(
            "O pagamento não pertence ao Paddle."
        )

    if payment["currency"] != "USD":
        raise ValueError(
            "O pagamento local não está em USD."
        )

    plan_code = payment["plan_code"]

    expected_price_id = PADDLE_PRICE_IDS.get(
        plan_code
    )

    if not expected_price_id:
        raise ValueError(
            "Price ID não configurado para o plano."
        )

    if expected_price_id not in price_ids:
        raise ValueError(
            "O Price ID recebido não corresponde ao plano."
        )

    now = datetime.utcnow().isoformat()

    # --------------------------------------------------------
    # IMPEDIR PROCESSAMENTO DUPLICADO
    # --------------------------------------------------------

    if payment["status"] == "confirmed":

        if payment["provider_transaction_id"] == transaction_id:
            return

        # Se já estava confirmado por outra transação,
        # a transação atual é uma renovação.
        if existing_subscription is None:
            raise ValueError(
                "Assinatura não encontrada para renovação."
            )

        subscription = existing_subscription

        renewal_cursor = connection.execute(
            """
            INSERT INTO payments (
                user_id,
                plan_id,
                subscription_id,
                amount,
                currency,
                payment_method,
                payment_provider,
                transaction_reference,
                provider_transaction_id,
                status,
                confirmed_at,
                created_at,
                updated_at
            )
            VALUES (
                ?, ?, ?, ?, 'USD',
                'card', 'paddle',
                ?, ?, 'confirmed',
                ?, ?, ?
            )
            """,
            (
                subscription["user_id"],
                subscription["plan_id"],
                subscription["id"],
                float(amount),
                transaction_id,
                transaction_id,
                now,
                now,
                now
            )
        )

        period = data.get("billing_period") or {}
        period_start = paddle_datetime(period.get("starts_at")) or now
        period_end = paddle_datetime(period.get("ends_at"))
        if not period_end:
            period_end = (
                datetime.utcnow()
                + timedelta(days=payment["duration_days"])
            ).isoformat()

        connection.execute(
            """
            UPDATE subscriptions
            SET status = 'active', starts_at = ?, expires_at = ?,
                next_billing_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (period_start, period_end, period_end, now, subscription["id"])
        )

        activate_payment_credits(
            connection, renewal_cursor.lastrowid, subscription["id"],
            period_start, period_end, now
        )

        return

    if payment["status"] != "pending":
        raise ValueError(
            "O pagamento não está pendente."
        )

    # --------------------------------------------------------
    # CRIAR OU REUTILIZAR ASSINATURA
    # --------------------------------------------------------

    period = data.get(
        "billing_period"
    ) or {}

    period_start = (
        paddle_datetime(
            period.get("starts_at")
        )
        or now
    )

    period_end = paddle_datetime(
        period.get("ends_at")
    )

    if not period_end:

        period_end = (
            datetime.utcnow()
            + timedelta(
                days=payment["duration_days"]
            )
        ).isoformat()

    if existing_subscription:

        subscription_local_id = existing_subscription["id"]

        connection.execute(
            """
            UPDATE subscriptions

            SET
                status = 'active',
                starts_at = ?,
                expires_at = ?,
                auto_renew = 1,
                billing_provider = 'paddle',
                provider_customer_id = ?,
                next_billing_at = ?,
                updated_at = ?

            WHERE id = ?
            """,
            (
                period_start,
                period_end,
                customer_id,
                period_end,
                now,
                subscription_local_id
            )
        )

    else:

        cursor = connection.execute(
            """
            INSERT INTO subscriptions (
                user_id,
                plan_id,
                status,
                starts_at,
                expires_at,
                auto_renew,
                billing_provider,
                provider_subscription_id,
                provider_customer_id,
                next_billing_at,
                cancel_at_period_end,
                created_at,
                updated_at
            )
            VALUES (
                ?, ?, 'active',
                ?, ?, 1,
                'paddle', ?, ?, ?,
                0, ?, ?
            )
            """,
            (
                payment["user_id"],
                payment["plan_id"],
                period_start,
                period_end,
                subscription_id,
                customer_id,
                period_end,
                now,
                now
            )
        )

        subscription_local_id = cursor.lastrowid

    # --------------------------------------------------------
    # CONFIRMAR PAGAMENTO
    # --------------------------------------------------------

    connection.execute(
        """
        UPDATE payments

        SET
            status = 'confirmed',
            amount = ?,
            subscription_id = ?,
            provider_transaction_id = ?,
            confirmed_at = ?,
            updated_at = ?

        WHERE id = ?
          AND status = 'pending'
        """,
        (
            float(amount),
            subscription_local_id,
            transaction_id,
            now,
            now,
            payment["id"]
        )
    )

    activate_payment_credits(
        connection, payment["id"], subscription_local_id,
        period_start, period_end, now
    )


# ============================================================
# ATUALIZAR ESTADO DA ASSINATURA PADDLE
# ============================================================

def process_paddle_subscription(
    connection,
    data,
    event_type
):

    provider_subscription_id = data.get(
        "id"
    )

    if not provider_subscription_id:
        return

    subscription = connection.execute(
        """
        SELECT id
        FROM subscriptions
        WHERE provider_subscription_id = ?
        LIMIT 1
        """,
        (provider_subscription_id,)
    ).fetchone()

    if not subscription:
        logger.warning(
            "Assinatura Paddle ainda não encontrada: %s",
            provider_subscription_id
        )
        return

    status = data.get("status")

    cancel_at_period_end = bool(
        data.get("scheduled_change")
        and data["scheduled_change"].get("action") == "cancel"
    )

    current_period = data.get(
        "current_billing_period"
    ) or {}

    period_end = paddle_datetime(
        current_period.get("ends_at")
    )

    now = datetime.utcnow().isoformat()

    if event_type == "subscription.canceled":
        local_status = "cancelled"

    elif status == "canceled":
        local_status = "cancelled"

    elif status in ("active", "trialing"):
        local_status = "active"

    else:
        # Não revogar acesso automaticamente em estados
        # transitórios, como past_due.
        local_status = None

    connection.execute(
        """
        UPDATE subscriptions

        SET
            status = COALESCE(?, status),
            provider_customer_id = COALESCE(?, provider_customer_id),
            next_billing_at = COALESCE(?, next_billing_at),
            expires_at = COALESCE(?, expires_at),
            cancel_at_period_end = ?,
            auto_renew = ?,
            updated_at = ?

        WHERE id = ?
        """,
        (
            local_status,
            data.get("customer_id"),
            period_end,
            period_end,
            1 if cancel_at_period_end else 0,
            0 if cancel_at_period_end or local_status == "cancelled" else 1,
            now,
            subscription["id"]
        )
    )


# ============================================================
# ENDPOINT PÚBLICO DO WEBHOOK
# ============================================================

@app.post("/api/paddle/webhook")
async def paddle_webhook(
    request: Request
):

    if not PADDLE_WEBHOOK_SECRET:

        raise HTTPException(
            status_code=503,
            detail="Webhook Paddle não configurado."
        )

    raw_body = await request.body()

    signature = request.headers.get(
        "Paddle-Signature",
        ""
    )

    if not verify_paddle_signature(
        raw_body,
        signature
    ):

        raise HTTPException(
            status_code=401,
            detail="Assinatura Paddle inválida."
        )

    try:

        payload = json.loads(
            raw_body.decode("utf-8")
        )

    except Exception:

        raise HTTPException(
            status_code=400,
            detail="JSON do Webhook inválido."
        )

    event_id = payload.get("event_id")
    event_type = payload.get("event_type")
    occurred_at = payload.get("occurred_at")
    data = payload.get("data") or {}

    if not event_id or not event_type:

        raise HTTPException(
            status_code=400,
            detail="Identificação do evento inválida."
        )

    now = datetime.utcnow().isoformat()

    try:

        with get_connection() as connection:

            # ------------------------------------------------
            # IDEMPOTÊNCIA
            # ------------------------------------------------

            existing = connection.execute(
                """
                SELECT processing_status
                FROM paddle_webhook_events
                WHERE event_id = ?
                """,
                (event_id,)
            ).fetchone()

            if existing and existing["processing_status"] == "processed":

                return {
                    "success": True,
                    "duplicate": True
                }

            connection.execute(
                """
                INSERT OR IGNORE INTO paddle_webhook_events (
                    event_id,
                    event_type,
                    occurred_at,
                    processing_status,
                    payload_json,
                    received_at
                )
                VALUES (?, ?, ?, 'received', ?, ?)
                """,
                (
                    event_id,
                    event_type,
                    occurred_at,
                    raw_body.decode("utf-8"),
                    now
                )
            )

            # ------------------------------------------------
            # EVENTOS DE TRANSAÇÃO
            # ------------------------------------------------

            if event_type == "transaction.completed":

                process_paddle_transaction(
                    connection,
                    data
                )

            # ------------------------------------------------
            # EVENTOS DE ASSINATURA
            # ------------------------------------------------

            elif event_type in (
                "subscription.created",
                "subscription.updated",
                "subscription.canceled"
            ):

                process_paddle_subscription(
                    connection,
                    data,
                    event_type
                )

            # ------------------------------------------------
            # MARCAR EVENTO COMO PROCESSADO
            # ------------------------------------------------

            connection.execute(
                """
                UPDATE paddle_webhook_events

                SET
                    processing_status = 'processed',
                    processed_at = ?,
                    error_message = NULL

                WHERE event_id = ?
                """,
                (
                    datetime.utcnow().isoformat(),
                    event_id
                )
            )

            connection.commit()

        logger.info(
            "Webhook Paddle processado: %s (%s)",
            event_id,
            event_type
        )

        return {
            "success": True,
            "event_id": event_id,
            "event_type": event_type
        }

    except Exception as error:

        logger.exception(
            "Erro ao processar Webhook Paddle."
        )

        try:

            with get_connection() as connection:

                connection.execute(
                    """
                    UPDATE paddle_webhook_events

                    SET
                        processing_status = 'failed',
                        error_message = ?,
                        processed_at = ?

                    WHERE event_id = ?
                    """,
                    (
                        str(error)[:1000],
                        datetime.utcnow().isoformat(),
                        event_id
                    )
                )

                connection.commit()

        except Exception:

            logger.exception(
                "Não foi possível registar falha do Webhook."
            )

        raise HTTPException(
            status_code=500,
            detail="Erro ao processar notificação Paddle."
        )

# ============================================================
# BITPAY — VERIFICAR ASSINATURA WEBHOOK
# ============================================================

def verify_bitpay_signature(
    raw_body: bytes,
    signature_header: Optional[str]
):

    if not BITPAY_WEBHOOK_SECRET:
        logger.error(
            "BITPAY_WEBHOOK_SECRET não configurada."
        )
        return False

    if not signature_header:
        return False

    match = re.fullmatch(
        r"t=(\d+),v1=([a-fA-F0-9]{64})",
        signature_header.strip()
    )

    if not match:
        return False

    timestamp = match.group(1)
    received_signature = match.group(2)

    try:

        timestamp_int = int(timestamp)

        # Tolerância de 10 minutos.

        if abs(time.time() - timestamp_int) > 600:
            return False

        signed_payload = (
            timestamp.encode("utf-8")
            + b"."
            + raw_body
        )

        expected_signature = hmac.new(
            BITPAY_WEBHOOK_SECRET.encode("utf-8"),
            signed_payload,
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(
            expected_signature,
            received_signature
        )

    except Exception:

        logger.exception(
            "Erro na verificação do webhook BitPay."
        )

        return False


# ============================================================
# BITPAY — LOCALIZAR PAGAMENTO
# ============================================================

def get_bitpay_local_payment(
    bitpay_payment_id: str,
    metadata: dict
):

    with get_connection() as connection:

        payment = connection.execute(
            """
            SELECT *
            FROM payments

            WHERE payment_provider = 'bitpay'
              AND provider_transaction_id = ?

            LIMIT 1
            """,
            (bitpay_payment_id,)
        ).fetchone()

        if payment is not None:
            return dict(payment)

        # Segunda possibilidade:
        # procurar pelo ID local enviado nos metadata.

        local_payment_id = metadata.get(
            "local_payment_id"
        )

        if local_payment_id:

            try:
                local_payment_id = int(local_payment_id)
            except (TypeError, ValueError):
                return None

            payment = connection.execute(
                """
                SELECT *
                FROM payments

                WHERE id = ?
                  AND payment_provider = 'bitpay'

                LIMIT 1
                """,
                (local_payment_id,)
            ).fetchone()

            if payment is not None:
                return dict(payment)

    return None


# ============================================================
# BITPAY — PROCESSAR EVENTO
# ============================================================

def process_bitpay_event(event):

    event_type = event.get("type")

    data = event.get("data") or {}

    bitpay_payment_id = data.get("id")

    if event_type not in {
        "payment.succeeded",
        "payment.failed",
        "payment.expired",
        "payment.cancelled",
        "payment.unknown",
        "payment.reconciled",
        "reference.paid"
    }:

        logger.info(
            "Evento BitPay ignorado: %s",
            event_type
        )

        return

    if not bitpay_payment_id:
        raise ValueError(
            "Evento BitPay sem identificador de pagamento."
        )

    metadata = data.get("metadata") or {}

    payment = get_bitpay_local_payment(
        bitpay_payment_id,
        metadata
    )

    if not payment:

        raise ValueError(
            "Pagamento local não encontrado para o evento BitPay."
        )

    payment_id = int(payment["id"])

    # --------------------------------------------------------
    # PAGAMENTO CONFIRMADO
    # --------------------------------------------------------

    if event_type == "payment.succeeded":

        if data.get("status") != "SUCCEEDED":

            raise ValueError(
                "O estado do pagamento não é SUCCEEDED."
            )

        currency = str(
            data.get("currency", "")
        ).upper()

        if currency != "AOA" or payment["currency"] != "AOA":

            raise ValueError(
                "Moeda do pagamento não corresponde a AOA."
            )

        try:

            received_amount = Decimal(
                str(data.get("amount"))
            )

            local_amount = Decimal(
                str(payment["amount"])
            )

        except Exception:

            raise ValueError(
                "Valor do pagamento inválido."
            )

        if received_amount != local_amount:

            raise ValueError(
                "O valor recebido não corresponde ao pagamento local."
            )

        if payment["status"] == "confirmed":
            return

        if payment["status"] != "pending":

            raise ValueError(
                "O pagamento local já não está pendente."
            )

        result = confirm_payment_and_activate_subscription(
            payment_id=payment_id,
            admin_note="Confirmado automaticamente pelo webhook BitPay."
        )

        if result is None:

            # Pode acontecer se outro evento já tiver
            # confirmado o mesmo pagamento.

            current_payment = get_payment_by_id(payment_id)

            if (
                not current_payment
                or current_payment.get("status") != "confirmed"
            ):

                raise ValueError(
                    "Não foi possível activar a assinatura."
                )

        logger.info(
            "Pagamento BitPay confirmado: %s",
            bitpay_payment_id
        )

        return

    # --------------------------------------------------------
    # PAGAMENTO FALHOU
    # --------------------------------------------------------

    if event_type in {
        "payment.failed",
        "payment.expired"
    }:

        if payment["status"] == "pending":

            update_payment_status(
                payment_id=payment_id,
                status="rejected",
                admin_note=(
                    "BitPay: "
                    + str(data.get("failure_code") or event_type)
                )
            )

        return

    # --------------------------------------------------------
    # PAGAMENTO CANCELADO
    # --------------------------------------------------------

    if event_type == "payment.cancelled":

        if payment["status"] == "pending":

            update_payment_status(
                payment_id=payment_id,
                status="cancelled",
                admin_note="Pagamento cancelado no BitPay."
            )

        return

    # --------------------------------------------------------
    # UNKNOWN / RECONCILED / REFERENCE PAID
    # --------------------------------------------------------

    # UNKNOWN não significa falha.
    # REFERENCE PAID não substitui payment.succeeded.
    # RECONCILED é informativo.
    #
    # Mantemos o pagamento pendente até receber
    # o evento payment.succeeded.
    
    return


# ============================================================
# BITPAY — WEBHOOK PRINCIPAL
# ============================================================

@app.post("/api/bitpay/webhook")
async def bitpay_webhook(
    request: Request
):

    raw_body = await request.body()

    signature = request.headers.get(
        "BitPay-Signature"
    )

    event_header_id = request.headers.get(
        "BitPay-Event-Id"
    )

    # --------------------------------------------------------
    # VALIDAR ASSINATURA
    # --------------------------------------------------------

    if not verify_bitpay_signature(
        raw_body,
        signature
    ):

        logger.warning(
            "Webhook BitPay rejeitado: assinatura inválida."
        )

        raise HTTPException(
            status_code=401,
            detail="Assinatura BitPay inválida."
        )

    # --------------------------------------------------------
    # LER EVENTO
    # --------------------------------------------------------

    try:

        event = json.loads(
            raw_body.decode("utf-8")
        )

    except Exception:

        raise HTTPException(
            status_code=400,
            detail="JSON do webhook inválido."
        )

    event_id = (
        event_header_id
        or event.get("id")
    )

    event_type = event.get("type")

    if not event_id or not event_type:

        raise HTTPException(
            status_code=400,
            detail="Identificador ou tipo de evento em falta."
        )

    # --------------------------------------------------------
    # REGISTAR EVENTO E EVITAR DUPLICAÇÃO
    # --------------------------------------------------------

    try:

        with get_connection() as connection:

            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO bitpay_webhook_events (
                    event_id,
                    event_type,
                    status,
                    received_at
                )
                VALUES (?, ?, 'processing', ?)
                """,
                (
                    event_id,
                    event_type,
                    datetime.utcnow().isoformat()
                )
            )

            if cursor.rowcount == 0:

                existing = connection.execute(
                    """
                    SELECT status
                    FROM bitpay_webhook_events
                    WHERE event_id = ?
                    """,
                    (event_id,)
                ).fetchone()

                if existing and existing["status"] == "processed":

                    return {
                        "success": True,
                        "duplicate": True
                    }

                raise HTTPException(
                    status_code=409,
                    detail="Este evento já está a ser processado."
                )

            connection.commit()

        # ----------------------------------------------------
        # PROCESSAR
        # ----------------------------------------------------

        process_bitpay_event(event)

        # ----------------------------------------------------
        # MARCAR COMO PROCESSADO
        # ----------------------------------------------------

        with get_connection() as connection:

            connection.execute(
                """
                UPDATE bitpay_webhook_events

                SET
                    status = 'processed',
                    processed_at = ?

                WHERE event_id = ?
                """,
                (
                    datetime.utcnow().isoformat(),
                    event_id
                )
            )

            connection.commit()

        return {
            "success": True,
            "message": "Webhook BitPay processado."
        }

    except HTTPException:
        raise

    except Exception:

        logger.exception(
            "Erro ao processar webhook BitPay."
        )

        # Apagar evento não concluído para permitir
        # nova tentativa de entrega pelo BitPay.

        with get_connection() as connection:

            connection.execute(
                """
                DELETE FROM bitpay_webhook_events
                WHERE event_id = ?
                  AND status = 'processing'
                """,
                (event_id,)
            )

            connection.commit()

        raise HTTPException(
            status_code=500,
            detail="Erro ao processar notificação BitPay."
        )

#=============================================================
# FRONTEND
#=============================================================
if not FRONTEND_DIR.exists():
    raise RuntimeError(
        f"Pasta frontend não encontrada: {FRONTEND_DIR}"
    )
app.mount(
    "/",
    StaticFiles(
        directory=str(FRONTEND_DIR),
        html=True
    ),
    name="frontend"
)
# ============================================================
# INICIALIZAÇÃO
# ============================================================
@app.on_event(
    "startup"
)
def startup_event():

    init_database()
    add_cover_column()
    add_public_column()
    create_indexes()
    initialize_default_plans()
    migrate_international_billing()
    ensure_bitpay_webhook_table()

    print()
    print("=" * 60)
    print("StudioMusic.AI")
    print("=" * 60)
    print(
        "Servidor: http://127.0.0.1:8000"
    )
    print(
        "Health:   http://127.0.0.1:8000/api/health"
    )
    print(
        "Mureka:  " + ("configurada" if MUREKA_API_KEY else "não configurada")
    )
    print(
        "BitPay:   " + BITPAY_ENV.upper()
    )
    print("=" * 60)