# ============================================================
# Versão: 3.0
#
# Novos recursos:
# - Planos de subscrição
# - Gestão de assinaturas
# - Pagamentos automáticos e manuais
# - Aprovação e rejeição de pagamentos
# Suporte:
# - Usuários
# - Músicas
# - Isolamento por usuário
# - Músicas públicas
# - Favoritos por usuário
# - Histórico por usuário
# - Capas
# - Migrações seguras
# ============================================================

import os
import re
from pathlib import Path
from datetime import datetime
from typing import Optional

import psycopg2
from psycopg2.extras import DictCursor

BASE_DIR = Path(__file__).resolve().parent

class HybridRow(dict):
    """Mapping row that also supports SQLite-style numeric indexing."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

class CompatCursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self.lastrowid = None
        self.rowcount = -1
    def execute(self, sql, params=None):
        sql = _translate_sql(sql)
        # Preserve cursor.lastrowid semantics used by the original application.
        m = re.match(r"\s*INSERT\s+INTO\s+([a-zA-Z_][\w]*)", sql, re.I)
        if m and not re.search(r"\bRETURNING\b", sql, re.I):
            table = m.group(1).lower()
            if table not in {"community_likes", "user_follows", "payment_webhook_events", "paddle_webhook_events", "bitpay_webhook_events", "schema_migrations", "password_reset_tokens"}:
                sql = sql.rstrip().rstrip(';') + " RETURNING id"
        self._cursor.execute(sql, params or ())
        self.rowcount = self._cursor.rowcount
        self.lastrowid = None
        if re.search(r"\bRETURNING\s+id\s*$", sql, re.I):
            row = self._cursor.fetchone()
            if row is not None:
                self.lastrowid = row[0]
        return self
    def fetchone(self):
        row = self._cursor.fetchone()
        return HybridRow(row) if row is not None else None
    def fetchall(self):
        return [HybridRow(r) for r in self._cursor.fetchall()]
    def __getattr__(self, name):
        return getattr(self._cursor, name)

def _translate_sql(sql):
    # Convert legacy SQLite SQL to PostgreSQL while retaining parameter order.
    # Add conflict handling to former INSERT OR IGNORE statements.
    was_ignore = bool(re.search(r"INSERT\s+OR\s+IGNORE\s+INTO", sql, re.I))
    if was_ignore:
        sql = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO", "INSERT INTO", sql, flags=re.I)
        if not re.search(r"ON\s+CONFLICT", sql, re.I):
            sql = sql.rstrip().rstrip(';') + " ON CONFLICT DO NOTHING"
    sql = re.sub(r"\bMIN\(credits_total,\s*credits_remaining\s*\+\s*1\)", "LEAST(credits_total, credits_remaining + 1)", sql, flags=re.I)
    sql = re.sub(r"expires_at\s*=\s*''", "FALSE", sql, flags=re.I)
    # Replace qmark placeholders; all app SQL uses positional parameters.
    sql = sql.replace('?', '%s')
    return sql

class CompatConnection:
    def __init__(self, raw):
        self._raw = raw
    def cursor(self):
        return CompatCursor(self._raw.cursor(cursor_factory=DictCursor))
    def execute(self, sql, params=None):
        cur = self.cursor(); cur.execute(sql, params); return cur
    def commit(self): self._raw.commit()
    def rollback(self): self._raw.rollback()
    def close(self): self._raw.close()
    def __enter__(self): return self
    def __exit__(self, exc_type, exc, tb):
        if exc_type is None: self.commit()
        else: self.rollback()
        self.close()

def get_connection():
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL não está configurada. Configure a ligação PostgreSQL no Render.")
    # Render pode fornecer postgres://; psycopg2 aceita postgres:// e postgresql://.
    raw = psycopg2.connect(database_url, cursor_factory=DictCursor, connect_timeout=15)
    return CompatConnection(raw)

# ============================================================
# HELPERS
# ============================================================

def row_to_dict(row):

    if row is None:
        return None

    return dict(row)


def get_connection():
    from urllib.parse import urlsplit

    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL não está configurada no Render."
        )

    parsed = urlsplit(database_url)

    print("DIAGNOSTICO DATABASE:", {
        "username": parsed.username,
        "host": parsed.hostname,
        "port": parsed.port,
        "database": parsed.path.lstrip("/")
    })

    raw = psycopg2.connect(
        database_url,
        cursor_factory=DictCursor,
        connect_timeout=15
    )

    return CompatConnection(raw)

def rows_to_dict(rows):

    return [
        dict(row)
        for row in rows
    ]


# ============================================================
# INICIALIZAÇÃO
# ============================================================

def init_database():
    """Apply the PostgreSQL schema once and ensure compatibility columns exist."""
    schema_path = BASE_DIR / "studiomusic.sql"
    with get_connection() as connection:
        cur = connection.cursor()
        cur.execute("SELECT to_regclass('public.users') AS table_name")
        exists = cur.fetchone()["table_name"]
        if not exists:
            if not schema_path.exists():
                raise RuntimeError("Schema PostgreSQL não encontrado: studiomusic.sql")
            # Execute the reviewed DDL as one PostgreSQL script.
            cur.execute(schema_path.read_text(encoding="utf-8"))
        # Compatibility with fields referenced by the existing Paddle/BitPay code.
        cur.execute("ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_usd NUMERIC(12,2) NOT NULL DEFAULT 0")
        for name, definition in {
            "billing_provider": "TEXT",
            "provider_subscription_id": "TEXT",
            "provider_customer_id": "TEXT",
            "next_billing_at": "TEXT",
            "cancel_at_period_end": "SMALLINT NOT NULL DEFAULT 0"
        }.items():
            cur.execute(f"ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS {name} {definition}")
        cur.execute("""CREATE TABLE IF NOT EXISTS paddle_webhook_events (
            event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT,
            processing_status TEXT NOT NULL DEFAULT 'received', payload_json TEXT NOT NULL,
            received_at TEXT NOT NULL, processed_at TEXT, error_message TEXT)""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_paddle_events_status ON paddle_webhook_events(processing_status)")
        cur.execute("""CREATE TABLE IF NOT EXISTS bitpay_webhook_events (
            event_id TEXT PRIMARY KEY, event_type TEXT, status TEXT NOT NULL DEFAULT 'processing',
            received_at TEXT NOT NULL, processed_at TEXT)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS support_tickets (
            id BIGSERIAL PRIMARY KEY,
            ticket_number TEXT NOT NULL UNIQUE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'normal',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            closed_at TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS support_messages (
            id BIGSERIAL PRIMARY KEY,
            ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE
        )""")
        cur.execute("ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated ON support_tickets(user_id, updated_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority ON support_tickets(status, priority)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id, created_at, id)")

def backfill_active_subscription_credits(connection, user_id: int, now: str):
    """Atribui uma única vez créditos a assinaturas activas antigas.

    Usa o plano e o período guardados na própria assinatura. Quando existe
    pagamento confirmado, payment_id é a chave idempotente; para assinaturas
    legadas sem pagamento associado, subscription_id é verificado antes
    da inserção. Não altera nem repõe lotes que já existem.
    """
    subscriptions = connection.execute("""
        SELECT
            s.id AS subscription_id,
            s.user_id,
            s.plan_id,
            COALESCE(NULLIF(s.starts_at, ''), s.created_at) AS starts_at,
            s.expires_at,
            p.monthly_song_limit,
            pay.id AS payment_id
        FROM subscriptions AS s
        INNER JOIN plans AS p ON p.id = s.plan_id
        LEFT JOIN payments AS pay
            ON pay.subscription_id = s.id
           AND pay.status = 'confirmed'
        WHERE s.user_id = ?
          AND LOWER(s.status) = 'active'
          AND COALESCE(NULLIF(s.starts_at, ''), s.created_at) <= ?
          AND (s.expires_at IS NULL OR s.expires_at = '' OR s.expires_at > ?)
        ORDER BY s.id ASC, pay.id ASC
    """, (user_id, now, now)).fetchall()

    for sub in subscriptions:
        credits = max(0, int(sub["monthly_song_limit"] or 0))
        if credits <= 0:
            continue

        payment_id = sub["payment_id"]
        if payment_id is not None:
            # Um pagamento só pode originar um lote, mesmo se a migração
            # for executada novamente ou o webhook for repetido.
            connection.execute("""
                INSERT OR IGNORE INTO credit_lots (
                    user_id, plan_id, payment_id, subscription_id,
                    credits_total, credits_remaining, starts_at, expires_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sub["user_id"], sub["plan_id"], payment_id,
                sub["subscription_id"], credits, credits,
                sub["starts_at"], sub["expires_at"] or None, now
            ))
        else:
            # Compatibilidade com assinaturas antigas criadas sem registo
            # de pagamento. Uma assinatura sem pagamento recebe no máximo
            # um lote legado.
            exists = connection.execute("""
                SELECT 1 FROM credit_lots
                WHERE subscription_id = ? AND payment_id IS NULL
                LIMIT 1
            """, (sub["subscription_id"],)).fetchone()
            if exists is None:
                connection.execute("""
                    INSERT INTO credit_lots (
                        user_id, plan_id, payment_id, subscription_id,
                        credits_total, credits_remaining, starts_at, expires_at, created_at
                    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
                """, (
                    sub["user_id"], sub["plan_id"], sub["subscription_id"],
                    credits, credits, sub["starts_at"], sub["expires_at"] or None, now
                ))


def get_user_credit_summary(user_id: int):
    """Migra créditos das assinaturas activas antigas e devolve os lotes válidos."""
    now = datetime.utcnow().isoformat()
    with get_connection() as connection:
        backfill_active_subscription_credits(connection, user_id, now)
        rows = connection.execute("""
            SELECT
                credit_lots.id,
                credit_lots.plan_id,
                credit_lots.payment_id,
                credit_lots.subscription_id,
                credit_lots.credits_total,
                credit_lots.credits_remaining,
                credit_lots.starts_at,
                credit_lots.expires_at,
                credit_lots.created_at,
                plans.name AS plan_name,
                plans.code AS plan_code
            FROM credit_lots
            LEFT JOIN plans ON plans.id = credit_lots.plan_id
            WHERE credit_lots.user_id = ?
              AND credit_lots.starts_at <= ?
              AND (credit_lots.expires_at IS NULL OR credit_lots.expires_at > ?)
              AND credit_lots.credits_remaining > 0
            ORDER BY credit_lots.expires_at IS NULL, credit_lots.expires_at ASC,
                     credit_lots.created_at ASC, credit_lots.id ASC
        """, (user_id, now, now)).fetchall()

    lots = [dict(row) for row in rows]
    return {
        "total_credits": sum(int(lot["credits_remaining"] or 0) for lot in lots),
        "active_lots": len(lots),
        "lots": lots,
    }


def get_user_credit_balance(user_id: int):
    return int(get_user_credit_summary(user_id)["total_credits"])


def activate_payment_credits(connection, payment_id: int, subscription_id: int,
                              starts_at: str, expires_at: Optional[str], now: str):
    """Cria um lote por pagamento confirmado; repetição do webhook não duplica."""
    payment = connection.execute("""
        SELECT payments.id, payments.user_id, payments.plan_id,
               plans.monthly_song_limit
        FROM payments
        INNER JOIN plans ON plans.id = payments.plan_id
        WHERE payments.id = ?
    """, (payment_id,)).fetchone()
    if payment is None:
        raise ValueError("Pagamento não encontrado para atribuição de créditos.")

    credits = max(0, int(payment["monthly_song_limit"] or 0))
    if credits <= 0:
        return None

    connection.execute("""
        INSERT OR IGNORE INTO credit_lots (
            user_id, plan_id, payment_id, subscription_id,
            credits_total, credits_remaining, starts_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payment["user_id"], payment["plan_id"], payment_id, subscription_id,
        credits, credits, starts_at or now, expires_at, now
    ))
    row = connection.execute(
        "SELECT id FROM credit_lots WHERE payment_id = ?", (payment_id,)
    ).fetchone()
    return int(row["id"]) if row else None


def consume_user_credit(user_id: int):
    """Consome um crédito do lote válido mais antigo (FIFO). Devolve o ID do lote."""
    now = datetime.utcnow().isoformat()
    with get_connection() as connection:
        row = connection.execute("""
            SELECT id FROM credit_lots
            WHERE user_id = ? AND credits_remaining > 0
              AND starts_at <= ?
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY expires_at IS NULL, expires_at ASC, created_at ASC, id ASC
            LIMIT 1
        """, (user_id, now, now)).fetchone()
        if row is None:
            return None
        lot_id = int(row["id"])
        changed = connection.execute("""
            UPDATE credit_lots SET credits_remaining = credits_remaining - 1
            WHERE id = ? AND credits_remaining > 0
        """, (lot_id,)).rowcount
        return lot_id if changed == 1 else None


def restore_user_credit(credit_lot_id: int):
    """Repõe um crédito no lote que foi reservado antes de uma geração falhar."""
    if credit_lot_id is None:
        return False
    with get_connection() as connection:
        changed = connection.execute("""
            UPDATE credit_lots
            SET credits_remaining = MIN(credits_total, credits_remaining + 1)
            WHERE id = ?
        """, (credit_lot_id,)).rowcount
        return changed == 1

# ============================================================
# VERIFICAR COLUNAS
# ============================================================

def get_song_columns():

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'songs'
            ORDER BY ordinal_position
        """)
        return [row["name"] for row in cursor.fetchall()]


# ============================================================
# MIGRAÇÃO COVER_URL
# ============================================================

def add_cover_column():

    columns = get_song_columns()

    if "cover_url" in columns:
        return

    print(
        "Banco antigo detectado: "
        "adicionando coluna cover_url..."
    )

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            ALTER TABLE songs
            ADD COLUMN cover_url TEXT
        """)

        connection.commit()

    print(
        "Coluna cover_url adicionada com sucesso."
    )


# ============================================================
# MIGRAÇÃO IS_PUBLIC
# ============================================================

def add_public_column():

    columns = get_song_columns()

    # --------------------------------------------------------
    # Já existe
    # --------------------------------------------------------

    if "is_public" in columns:

        print(
            "Coluna is_public já existe."
        )

        return

    print(
        "Banco antigo detectado: "
        "adicionando coluna is_public..."
    )

    with get_connection() as connection:

        cursor = connection.cursor()

        # ----------------------------------------------------
        # SQLite permite ADD COLUMN com DEFAULT.
        #
        # Todas as músicas antigas ficam privadas:
        # is_public = 0
        # ----------------------------------------------------

        cursor.execute("""
            ALTER TABLE songs
            ADD COLUMN is_public
            SMALLINT NOT NULL DEFAULT 0
        """)

        connection.commit()

    print(
        "Coluna is_public adicionada com sucesso."
    )

    print(
        "Todas as músicas existentes "
        "foram mantidas como privadas."
    )


# ============================================================
# ÍNDICES
#
# IMPORTANTE:
# Estes índices são criados SOMENTE depois das migrações.
# ============================================================

def create_indexes():

    columns = get_song_columns()

    with get_connection() as connection:

        cursor = connection.cursor()

        # ----------------------------------------------------
        # user_id
        # ----------------------------------------------------

        if "user_id" in columns:

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_songs_user_id
                ON songs(user_id)
            """)

        # ----------------------------------------------------
        # status
        # ----------------------------------------------------

        if "status" in columns:

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_songs_status
                ON songs(status)
            """)

        # ----------------------------------------------------
        # is_public
        # ----------------------------------------------------

        if "is_public" in columns:

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_songs_public
                ON songs(is_public)
            """)

        # ----------------------------------------------------
        # favoritos
        # ----------------------------------------------------

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_favorites_user_id
            ON favorites(user_id)
        """)

        # ----------------------------------------------------
        # histórico
        # ----------------------------------------------------

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_history_user_id
            ON history(user_id)
        """)

        connection.commit()


# ============================================================
# USERS
# ============================================================

def create_user(
    name: str,
    email: str,
    password_hash: str,
    is_admin: bool = False
):

    created_at = datetime.utcnow().isoformat()

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO users (
                name,
                email,
                password_hash,
                is_active,
                is_admin,
                created_at
            )
            VALUES (?, ?, ?, 1, ?, ?)
        """, (
            name,
            email.lower().strip(),
            password_hash,
            1 if is_admin else 0,
            created_at
        ))

        connection.commit()

        return cursor.lastrowid


def get_user_by_id(user_id: int):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT *
            FROM users
            WHERE id = ?
        """, (user_id,))

        return row_to_dict(
            cursor.fetchone()
        )


def get_user_by_email(email: str):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT *
            FROM users
            WHERE LOWER(email) = LOWER(?)
        """, (email.strip(),))

        return row_to_dict(
            cursor.fetchone()
        )


def get_all_users():

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                id,
                name,
                email,
                is_active,
                is_admin,
                created_at
            FROM users
            ORDER BY created_at DESC
        """)

        return rows_to_dict(
            cursor.fetchall()
        )


def update_user_active(
    user_id: int,
    is_active: bool
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            UPDATE users
            SET is_active = ?
            WHERE id = ?
        """, (
            1 if is_active else 0,
            user_id
        ))

        connection.commit()

        return cursor.rowcount > 0
# ============================================================

# ALTERAÇÃO DA PALAVRA-PASSE

# ============================================================

def update_user_password(
    user_id: int,
    password_hash: str
):
    """
    Actualiza a palavra-passe de um utilizador.
    Guarda apenas o hash, nunca a palavra-passe original.
    """

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE users
            SET password_hash = ?
            WHERE id = ?
        """, (
                password_hash,
                user_id
        ))

        connection.commit()

    return cursor.rowcount > 0
# ============================================================
# PERFIL DE UTILIZADOR
# ============================================================
def update_user_profile(
    user_id: int,
    name: str,
    email: str,
    sobremim: Optional[str] = None,
    telefone: Optional[str] = None
):
    """Actualiza os dados editáveis do perfil.
        Não permite alterar:
        -id
        -password_hash
        -is_admin
        -is_active
        -created_at
        -foto

        A fotografia será actualizada através de uma rota própria."""
    name = name.strip()
    email = email.strip().lower()
    
    sobremim = (
        sobremim.strip()
        if sobremim is not None
        else ""
    )
    # None significa que o chamador antigo não enviou telefone:
    # nesse caso, preservamos o número já guardado.
    # String vazia permite limpar explicitamente o campo.
    telefone = telefone.strip() if telefone is not None else None

    if not name:
        raise ValueError(
            "O nome completo é obrigatório."
        )
    if not email:
        raise ValueError(
            "O email é obrigatório."
        )
    with get_connection() as connection:
        cursor = connection.cursor()
        # Verificar se o email pertence a outra conta.
        cursor.execute(""" 
            SELECT id 
            FROM users 
            WHERE LOWER(email)=LOWER(?) 
                AND id !=?
        """, (
            email,
            user_id
        ))
        existing_email = cursor.fetchone()
        
        if existing_email:
            raise ValueError(
                "Este email já está associado a outra conta."
            )
        cursor.execute(""" 
            UPDATE users
            SET
                name = ?,
                email = ?,
                sobremim = ?,
                telefone = COALESCE(?, telefone)
            WHERE id = ?
        """, (
            name,
            email,
            sobremim,
            telefone,
            user_id
        ))

        connection.commit()
        if cursor.rowcount == 0:
            return None
    return get_user_by_id(user_id)
    
def update_user_phone(
    user_id: int,
    telefone: Optional[str]
):
    """Actualiza apenas o telefone do utilizador."""
    telefone = telefone.strip() if telefone is not None else None

    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("""
            UPDATE users
            SET telefone = ?
            WHERE id = ?
        """, (telefone, user_id))
        connection.commit()

        if cursor.rowcount == 0:
            return None

    return get_user_by_id(user_id)


def update_user_photo(
    user_id: int,
    foto: str
):
    """ Guarda o caminho da fotografia do utilizador."""
    with get_connection() as connection:
        cursor = connection.cursor()
        cursor.execute(""" UPDATE users SET foto = ? WHERE id = ? """, (
            foto,
            user_id
        )) 
        connection.commit()
        if cursor.rowcount == 0:
            return None
    return get_user_by_id(user_id)
# ============================================================
# SONGS
# ============================================================

def create_song(
    title: str,
    prompt: str,
    model: str = "mureka-9.5",
    duration: int = 60,
    instrumental: bool = False,
    status: str = "pending",
    task_id: Optional[str] = None,
    audio_url: Optional[str] = None,
    audio_file: Optional[str] = None,
    cover_url: Optional[str] = None,
    error_message: Optional[str] = None,
    user_id: Optional[int] = None,
    is_public: bool = False
):

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO songs (
                user_id,
                title,
                prompt,
                model,
                duration,
                instrumental,
                status,
                task_id,
                audio_url,
                audio_file,
                cover_url,
                error_message,
                is_public,
                created_at,
                updated_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?
            )
        """, (
            user_id,
            title,
            prompt,
            model,
            duration,
            1 if instrumental else 0,
            status,
            task_id,
            audio_url,
            audio_file,
            cover_url,
            error_message,
            1 if is_public else 0,
            now,
            now
        ))

        connection.commit()

        song_id = cursor.lastrowid

    return get_song(song_id)


def get_song(song_id: int):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                songs.*,
                users.name AS owner_name,
                users.email AS owner_email

            FROM songs

            LEFT JOIN users
                ON users.id = songs.user_id

            WHERE songs.id = ?
        """, (song_id,))

        return row_to_dict(
            cursor.fetchone()
        )


def get_songs(
    user_id: Optional[int] = None
):

    with get_connection() as connection:

        cursor = connection.cursor()

        if user_id is not None:

            cursor.execute("""
                SELECT
                    songs.*,
                    users.name AS owner_name

                FROM songs

                LEFT JOIN users
                    ON users.id = songs.user_id

                WHERE songs.user_id = ?

                ORDER BY songs.created_at DESC
            """, (user_id,))

        else:

            cursor.execute("""
                SELECT
                    songs.*,
                    users.name AS owner_name

                FROM songs

                LEFT JOIN users
                    ON users.id = songs.user_id

                ORDER BY songs.created_at DESC
            """)

        return rows_to_dict(
            cursor.fetchall()
        )


def get_public_songs(
    limit: int = 100
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                songs.*,
                users.name AS owner_name

            FROM songs

            LEFT JOIN users
                ON users.id = songs.user_id

            WHERE songs.is_public = 1
              AND songs.status = 'completed'

            ORDER BY songs.created_at DESC

            LIMIT ?
        """, (limit,))

        return rows_to_dict(
            cursor.fetchall()
        )


def get_public_song(song_id: int):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                songs.*,
                users.name AS owner_name

            FROM songs

            LEFT JOIN users
                ON users.id = songs.user_id

            WHERE songs.id = ?
              AND songs.is_public = 1
              AND songs.status = 'completed'
        """, (song_id,))

        return row_to_dict(
            cursor.fetchone()
        )


def update_song(
    song_id: int,
    title: Optional[str] = None,
    status: Optional[str] = None,
    task_id: Optional[str] = None,
    audio_url: Optional[str] = None,
    audio_file: Optional[str] = None,
    cover_url: Optional[str] = None,
    error_message: Optional[str] = None,
    duration: Optional[int] = None,
    instrumental: Optional[bool] = None,
    generation_json: Optional[str] = None
):

    fields = []
    values = []

    if title is not None:

        fields.append(
            "title = ?"
        )

        values.append(title)

    if status is not None:

        fields.append(
            "status = ?"
        )

        values.append(status)

    if task_id is not None:

        fields.append(
            "task_id = ?"
        )

        values.append(task_id)

    if audio_url is not None:

        fields.append(
            "audio_url = ?"
        )

        values.append(audio_url)

    if audio_file is not None:

        fields.append(
            "audio_file = ?"
        )

        values.append(audio_file)

    if cover_url is not None:

        fields.append(
            "cover_url = ?"
        )

        values.append(cover_url)

    if error_message is not None:

        fields.append(
            "error_message = ?"
        )

        values.append(error_message)

    if duration is not None:

        fields.append(
            "duration = ?"
        )

        values.append(duration)

    if instrumental is not None:

        fields.append(
            "instrumental = ?"
        )

        values.append(
            1 if instrumental else 0
        )

    if generation_json is not None:
        fields.append("generation_json = ?")
        values.append(generation_json)

    fields.append(
        "updated_at = ?"
    )

    values.append(
        datetime.utcnow().isoformat()
    )

    values.append(song_id)

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute(
            f"""
            UPDATE songs

            SET {", ".join(fields)}

            WHERE id = ?
            """,
            values
        )

        connection.commit()

    return get_song(song_id)


def delete_song(song_id: int):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            DELETE FROM songs
            WHERE id = ?
        """, (song_id,))

        connection.commit()

        return cursor.rowcount > 0


# ============================================================
# PUBLICAÇÃO
# ============================================================

def set_song_public(
    song_id: int,
    is_public: bool
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            UPDATE songs

            SET
                is_public = ?,
                updated_at = ?

            WHERE id = ?
        """, (
            1 if is_public else 0,
            datetime.utcnow().isoformat(),
            song_id
        ))

        connection.commit()

        return cursor.rowcount > 0


# ============================================================
# FAVORITOS
# ============================================================

def add_favorite(
    user_id: int,
    song_id: int
):

    created_at = datetime.utcnow().isoformat()

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            INSERT OR IGNORE INTO favorites (
                user_id,
                song_id,
                created_at
            )
            VALUES (?, ?, ?)
        """, (
            user_id,
            song_id,
            created_at
        ))

        connection.commit()

        return cursor.rowcount > 0


def remove_favorite(
    user_id: int,
    song_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            DELETE FROM favorites

            WHERE user_id = ?
              AND song_id = ?
        """, (
            user_id,
            song_id
        ))

        connection.commit()

        return cursor.rowcount > 0


def is_favorite(
    user_id: int,
    song_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT id
            FROM favorites

            WHERE user_id = ?
              AND song_id = ?
        """, (
            user_id,
            song_id
        ))

        return (
            cursor.fetchone()
            is not None
        )


def get_favorites(
    user_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                songs.*,

                users.name AS owner_name,

                favorites.created_at
                AS favorited_at

            FROM favorites

            INNER JOIN songs
                ON songs.id = favorites.song_id

            LEFT JOIN users
                ON users.id = songs.user_id

            WHERE favorites.user_id = ?

            ORDER BY favorites.created_at DESC
        """, (user_id,))

        return rows_to_dict(
            cursor.fetchall()
        )


# ============================================================
# HISTÓRICO
# ============================================================

def add_history(
    user_id: int,
    song_id: int
):

    played_at = datetime.utcnow().isoformat()

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO history (
                user_id,
                song_id,
                played_at
            )

            VALUES (?, ?, ?)

            ON CONFLICT(user_id, song_id)

            DO UPDATE SET
                played_at = excluded.played_at
        """, (
            user_id,
            song_id,
            played_at
        ))

        connection.commit()

        return True


def remove_history(
    user_id: int,
    song_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            DELETE FROM history

            WHERE user_id = ?
              AND song_id = ?
        """, (
            user_id,
            song_id
        ))

        connection.commit()

        return cursor.rowcount > 0


def get_history(
    user_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                songs.*,

                users.name AS owner_name,

                history.played_at

            FROM history

            INNER JOIN songs
                ON songs.id = history.song_id

            LEFT JOIN users
                ON users.id = songs.user_id

            WHERE history.user_id = ?

            ORDER BY history.played_at DESC
        """, (user_id,))

        return rows_to_dict(
            cursor.fetchall()
        )


def clear_history(
    user_id: int
):

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            DELETE FROM history
            WHERE user_id = ?
        """, (user_id,))

        connection.commit()

        return cursor.rowcount


# ============================================================
# ESTATÍSTICAS
# ============================================================

def get_statistics(
    user_id: Optional[int] = None
):

    with get_connection() as connection:

        cursor = connection.cursor()

        if user_id is None:

            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM songs
            """)

            total = cursor.fetchone()["total"]

            cursor.execute("""
                SELECT COUNT(*) AS completed
                FROM songs
                WHERE status = 'completed'
            """)

            completed = (
                cursor.fetchone()["completed"]
            )

            cursor.execute("""
                SELECT COUNT(*) AS pending
                FROM songs
                WHERE status = 'pending'
            """)

            pending = (
                cursor.fetchone()["pending"]
            )

            cursor.execute("""
                SELECT COUNT(*) AS failed
                FROM songs
                WHERE status = 'failed'
            """)

            failed = (
                cursor.fetchone()["failed"]
            )

            cursor.execute("""
                SELECT COUNT(*) AS public
                FROM songs
                WHERE is_public = 1
            """)

            public = (
                cursor.fetchone()["public"]
            )

            return {
                "total": total,
                "completed": completed,
                "pending": pending,
                "failed": failed,
                "public": public
            }

        cursor.execute("""
            SELECT COUNT(*) AS total
            FROM songs
            WHERE user_id = ?
        """, (user_id,))

        total = cursor.fetchone()["total"]

        cursor.execute("""
            SELECT COUNT(*) AS completed
            FROM songs
            WHERE user_id = ?
              AND status = 'completed'
        """, (user_id,))

        completed = (
            cursor.fetchone()["completed"]
        )

        cursor.execute("""
            SELECT COUNT(*) AS pending
            FROM songs
            WHERE user_id = ?
              AND status = 'pending'
        """, (user_id,))

        pending = (
            cursor.fetchone()["pending"]
        )

        cursor.execute("""
            SELECT COUNT(*) AS failed
            FROM songs
            WHERE user_id = ?
              AND status = 'failed'
        """, (user_id,))

        failed = (
            cursor.fetchone()["failed"]
        )

        cursor.execute("""
            SELECT COUNT(*) AS public
            FROM songs
            WHERE user_id = ?
              AND is_public = 1
        """, (user_id,))

        public = (
            cursor.fetchone()["public"]
        )

        cursor.execute("""
            SELECT COUNT(*) AS favorites
            FROM favorites
            WHERE user_id = ?
        """, (user_id,))

        favorites = (
            cursor.fetchone()["favorites"]
        )

        cursor.execute("""
            SELECT COUNT(*) AS history
            FROM history
            WHERE user_id = ?
        """, (user_id,))

        history = (
            cursor.fetchone()["history"]
        )

        return {
            "total": total,
            "completed": completed,
            "pending": pending,
            "failed": failed,
            "public": public,
            "favorites": favorites,
            "history": history
        }



# ============================================================
# STUDIOMUSIC.AI
# GESTÃO DE PLANOS, ASSINATURAS E PAGAMENTOS
# ============================================================


# ============================================================
# PLANOS
# ============================================================

def initialize_default_plans():
    """
    Cria os planos iniciais apenas se ainda não existirem.
    Os preços são exemplos configuráveis em kwanzas (AOA).
    """

    now = datetime.utcnow().isoformat()

    plans = [
        {
            "code": "free",
            "name": "Gratuito",
            "description": "Plano gratuito para experimentar o StudioMusic.AI.",
            "price": 0,
            "duration_days": 0,
            "max_song_duration": 30,
            "monthly_song_limit": 3,
        },
        {
            "code": "basic",
            "name": "Básico",
            "description": "Plano pago para utilização regular.",
            "price": 8000,
            "duration_days": 30,
            "max_song_duration": 180,
            "monthly_song_limit": 60,
        },
        {
            "code": "premium",
            "name": "Premium",
            "description": "Plano pago com limites superiores.",
            "price": 15000,
            "duration_days": 30,
            "max_song_duration": 300,
            "monthly_song_limit": 100,
        },
    ]

    with get_connection() as connection:
        cursor = connection.cursor()

        for plan in plans:
            cursor.execute("""
                INSERT OR IGNORE INTO plans (
                    code,
                    name,
                    description,
                    price,
                    currency,
                    duration_days,
                    max_song_duration,
                    monthly_song_limit,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 'AOA', ?, ?, ?, 1, ?, ?)
            """, (
                plan["code"],
                plan["name"],
                plan["description"],
                plan["price"],
                plan["duration_days"],
                plan["max_song_duration"],
                plan["monthly_song_limit"],
                now,
                now,
            ))
# ============================================================
# ASSINATURAS
# ============================================================
# ASSINATURAS NACIONAIS
# ============================================================
# BITPAY — TABELA DE EVENTOS WEBHOOK
# ============================================================

def ensure_bitpay_webhook_table():

    with get_connection() as connection:

        connection.execute("""
            CREATE TABLE IF NOT EXISTS bitpay_webhook_events (

                event_id TEXT PRIMARY KEY,

                event_type TEXT,

                status TEXT NOT NULL DEFAULT 'processing',

                received_at TEXT NOT NULL,

                processed_at TEXT

            )
        """)

        connection.commit()
# ============================================================
# ASSINATURAS INTERNACIONAIS
# StudioMusic.AI
# ============================================================

def migrate_international_billing():

    now = datetime.utcnow().isoformat()

    migrations = {
        "plans": {
            "price_usd": "NUMERIC(12,2) NOT NULL DEFAULT 0"
        },
        "subscriptions": {
            "billing_provider": "TEXT",
            "provider_subscription_id": "TEXT",
            "provider_customer_id": "TEXT",
            "next_billing_at": "TEXT",
            "cancel_at_period_end": "SMALLINT NOT NULL DEFAULT 0"
        }
    }

    with get_connection() as connection:

        cursor = connection.cursor()

        # --------------------------------------------
        # ADICIONAR COLUNAS SEM APAGAR DADOS
        # --------------------------------------------

        for table, columns in migrations.items():

            cursor.execute("""
                SELECT column_name AS name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
            """, (table,))
            existing = {row["name"] for row in cursor.fetchall()}

            for column, definition in columns.items():

                if column not in existing:

                    cursor.execute(
                        f"""
                        ALTER TABLE {table}
                        ADD COLUMN {column} {definition}
                        """
                    )

        # --------------------------------------------
        # EVENTOS WEBHOOK PADDLE
        # --------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS paddle_webhook_events (

                event_id TEXT PRIMARY KEY,

                event_type TEXT NOT NULL,

                occurred_at TEXT,

                processing_status TEXT NOT NULL
                    DEFAULT 'received',

                payload_json TEXT NOT NULL,

                received_at TEXT NOT NULL,

                processed_at TEXT,

                error_message TEXT

            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_paddle_events_status
            ON paddle_webhook_events(processing_status)
        """)

        # --------------------------------------------
        # PREÇOS DEFINIDOS PARA OS PLANOS
        # --------------------------------------------

        cursor.execute("""
            UPDATE plans
            SET
                price = 5000,
                price_usd = 5.99,
                currency = 'AOA',
                monthly_song_limit = 20,
                duration_days = 30,
                updated_at = ?
            WHERE code = 'basic'
        """, (now,))

        cursor.execute("""
            UPDATE plans
            SET
                price = 10000,
                price_usd = 11.99,
                currency = 'AOA',
                monthly_song_limit = 40,
                duration_days = 30,
                updated_at = ?
            WHERE code = 'premium'
        """, (now,))

        cursor.execute("""
            UPDATE plans
            SET
                price = 0,
                price_usd = 0,
                monthly_song_limit = 3,
                updated_at = ?
            WHERE code = 'free'
        """, (now,))

        # --------------------------------------------
        # ÍNDICE PARA IDENTIFICAR ASSINATURAS EXTERNAS
        # --------------------------------------------

        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            idx_subscriptions_provider_id
            ON subscriptions(provider_subscription_id)
            WHERE provider_subscription_id IS NOT NULL
        """)

        connection.commit()

    print(
        "Migração de assinaturas internacionais concluída."
    )

def get_all_plans(active_only=True):
    """Devolve os planos disponíveis."""

    with get_connection() as connection:
        cursor = connection.cursor()

        if active_only:
            cursor.execute("""
                SELECT *
                FROM plans
                WHERE is_active = 1
                ORDER BY price ASC, id ASC
            """)
        else:
            cursor.execute("""
                SELECT *
                FROM plans
                ORDER BY price ASC, id ASC
            """)

        return rows_to_dict(cursor.fetchall())


def get_plan_by_id(plan_id: int):
    """Consulta um plano pelo identificador."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT *
            FROM plans
            WHERE id = ?
        """, (plan_id,))

        return row_to_dict(cursor.fetchone())


def get_plan_by_code(code: str):
    """Consulta um plano pelo código."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT *
            FROM plans
            WHERE code = ?
        """, (code.strip().lower(),))

        return row_to_dict(cursor.fetchone())


def update_plan_price(plan_id: int, price: float):
    """Atualiza o preço de um plano."""

    if price < 0:
        raise ValueError("O preço não pode ser negativo.")

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE plans
            SET price = ?,
                updated_at = ?
            WHERE id = ?
        """, (
            price,
            datetime.utcnow().isoformat(),
            plan_id,
        ))

        return cursor.rowcount > 0


# ============================================================
# ASSINATURAS
# ============================================================

def create_subscription(
    user_id: int,
    plan_id: int,
    status: str = "pending",
    starts_at: Optional[str] = None,
    expires_at: Optional[str] = None,
    auto_renew: bool = False,
):
    """Cria uma assinatura."""

    allowed_statuses = {
        "pending",
        "active",
        "expired",
        "cancelled",
    }

    if status not in allowed_statuses:
        raise ValueError("Estado de assinatura inválido.")

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO subscriptions (
                user_id,
                plan_id,
                status,
                starts_at,
                expires_at,
                auto_renew,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            plan_id,
            status,
            starts_at,
            expires_at,
            1 if auto_renew else 0,
            now,
            now,
        ))

        return cursor.lastrowid


def get_subscription_by_id(subscription_id: int):
    """Consulta uma assinatura e os dados do respetivo plano."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                subscriptions.*,
                plans.name AS plan_name,
                plans.code AS plan_code,
                plans.price AS plan_price,
                plans.currency AS plan_currency,
                plans.max_song_duration,
                plans.monthly_song_limit

            FROM subscriptions

            INNER JOIN plans
                ON plans.id = subscriptions.plan_id

            WHERE subscriptions.id = ?
        """, (subscription_id,))

        return row_to_dict(cursor.fetchone())


def get_user_subscription(user_id: int):
    """
    Devolve a assinatura ativa e ainda válida do utilizador.
    Uma assinatura expirada não é devolvida como ativa.
    """

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                subscriptions.*,
                plans.name AS plan_name,
                plans.code AS plan_code,
                plans.price AS plan_price,
                plans.currency AS plan_currency,
                plans.max_song_duration,
                plans.monthly_song_limit

            FROM subscriptions

            INNER JOIN plans
                ON plans.id = subscriptions.plan_id

            WHERE subscriptions.user_id = ?
              AND subscriptions.status = 'active'
              AND (
                    subscriptions.expires_at IS NULL
                    OR subscriptions.expires_at > ?
              )

            ORDER BY subscriptions.expires_at DESC,
                     subscriptions.id DESC

            LIMIT 1
        """, (user_id, now))

        return row_to_dict(cursor.fetchone())


def get_user_subscriptions(user_id: int):
    """Devolve o histórico de assinaturas do utilizador."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                subscriptions.*,
                plans.name AS plan_name,
                plans.code AS plan_code,
                plans.price AS plan_price,
                plans.currency AS plan_currency

            FROM subscriptions

            INNER JOIN plans
                ON plans.id = subscriptions.plan_id

            WHERE subscriptions.user_id = ?

            ORDER BY subscriptions.created_at DESC
        """, (user_id,))

        return rows_to_dict(cursor.fetchall())


def activate_subscription(
    subscription_id: int,
    starts_at: Optional[str] = None,
    expires_at: Optional[str] = None,
):
    """
    Ativa uma assinatura.

    Esta função não deve ser chamada apenas porque o navegador
    informou que o pagamento foi concluído.
    A confirmação deve ser validada no backend.
    """

    now = datetime.utcnow()

    start = starts_at or now.isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                subscriptions.id,
                subscriptions.status,
                plans.duration_days

            FROM subscriptions

            INNER JOIN plans
                ON plans.id = subscriptions.plan_id

            WHERE subscriptions.id = ?
        """, (subscription_id,))

        subscription = cursor.fetchone()

        if subscription is None:
            return False

        if subscription["status"] in ("cancelled", "expired"):
            return False

        if expires_at is None:
            duration_days = subscription["duration_days"]

            if duration_days > 0:
                from datetime import timedelta

                start_datetime = datetime.fromisoformat(start)

                expires_at = (
                    start_datetime
                    + timedelta(days=duration_days)
                ).isoformat()

        cursor.execute("""
            UPDATE subscriptions
            SET status = 'active',
                starts_at = ?,
                expires_at = ?,
                updated_at = ?
            WHERE id = ?
        """, (
            start,
            expires_at,
            datetime.utcnow().isoformat(),
            subscription_id,
        ))

        return cursor.rowcount > 0


def expire_subscriptions():
    """Marca como expiradas as assinaturas cujo prazo terminou."""

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE subscriptions
            SET status = 'expired',
                updated_at = ?
            WHERE status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at <= ?
        """, (now, now))

        return cursor.rowcount


# ============================================================
# PAGAMENTOS
# ============================================================

def create_payment(
    user_id: int,
    plan_id: int,
    amount: float,
    payment_method: str,
    payment_provider: Optional[str] = None,
    transaction_reference: Optional[str] = None,
    provider_transaction_id: Optional[str] = None,
    proof_file: Optional[str] = None,
):
    """
    Regista um pagamento pendente.

    payment_method:
        - multicaixa_express
        - multicaixa_reference
        - bank_transfer

    O valor é obtido e validado pelo backend.
    Não se deve confiar num preço enviado pelo navegador.
    """

    allowed_methods = {
        "multicaixa_express",
        "multicaixa_reference",
        "bank_transfer",
        "unifi_transfer",
        "usdc",
    }

    if payment_method not in allowed_methods:
        raise ValueError("Método de pagamento inválido.")

    if amount <= 0:
        raise ValueError("O valor do pagamento deve ser positivo.")

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id
            FROM plans
            WHERE id = ?
              AND is_active = 1
        """, (plan_id,))

        if cursor.fetchone() is None:
            raise ValueError("Plano inexistente ou indisponível.")

        cursor.execute("""
            INSERT INTO payments (
                user_id,
                plan_id,
                amount,
                currency,
                payment_method,
                payment_provider,
                transaction_reference,
                provider_transaction_id,
                proof_file,
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, 'AOA', ?, ?, ?, ?, ?, 'pending', ?, ?)
        """, (
            user_id,
            plan_id,
            amount,
            payment_method,
            payment_provider,
            transaction_reference,
            provider_transaction_id,
            proof_file,
            now,
            now,
        ))

        return cursor.lastrowid


def get_payment_by_id(payment_id: int):
    """Consulta um pagamento."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                payments.*,
                users.name AS user_name,
                users.email AS user_email,
                plans.name AS plan_name,
                plans.code AS plan_code

            FROM payments

            INNER JOIN users
                ON users.id = payments.user_id

            INNER JOIN plans
                ON plans.id = payments.plan_id

            WHERE payments.id = ?
        """, (payment_id,))

        return row_to_dict(cursor.fetchone())
# ============================================================
# PAGAMENTOS - GUARDAR COMPROVATIVO
# ============================================================

def update_payment_proof(
    payment_id: int,
    user_id: int,
    proof_file: str
):
    """
    Guarda o caminho do comprovativo.

    Apenas permite atualizar pagamentos:
    - pertencentes ao utilizador;
    - com estado pending;
    - efetuados por transferência bancária.
    """

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            UPDATE payments
            SET
                proof_file = ?,
                updated_at = ?
            WHERE id = ?
              AND user_id = ?
              AND status = 'pending'
              AND payment_method IN ('bank_transfer', 'unifi_transfer', 'multicaixa_express', 'usdc')
              AND proof_file IS NULL
        """, (
            proof_file,
            now,
            payment_id,
            user_id
        ))

        return cursor.rowcount > 0

def get_user_payments(user_id: int):
    """Devolve os pagamentos de um utilizador."""

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                payments.*,
                plans.name AS plan_name,
                plans.code AS plan_code

            FROM payments

            INNER JOIN plans
                ON plans.id = payments.plan_id

            WHERE payments.user_id = ?

            ORDER BY payments.created_at DESC
        """, (user_id,))

        return rows_to_dict(cursor.fetchall())


def get_all_payments(status: Optional[str] = None):
    """Consulta os pagamentos para o painel administrativo."""

    with get_connection() as connection:
        cursor = connection.cursor()

        if status is None:
            cursor.execute("""
                SELECT
                    payments.*,
                    users.name AS user_name,
                    users.email AS user_email,
                    plans.name AS plan_name

                FROM payments

                INNER JOIN users
                    ON users.id = payments.user_id

                INNER JOIN plans
                    ON plans.id = payments.plan_id

                ORDER BY payments.created_at DESC
            """)
        else:
            cursor.execute("""
                SELECT
                    payments.*,
                    users.name AS user_name,
                    users.email AS user_email,
                    plans.name AS plan_name

                FROM payments

                INNER JOIN users
                    ON users.id = payments.user_id

                INNER JOIN plans
                    ON plans.id = payments.plan_id

                WHERE payments.status = ?

                ORDER BY payments.created_at DESC
            """, (status,))

        return rows_to_dict(cursor.fetchall())


def update_payment_status(
    payment_id: int,
    status: str,
    reviewed_by: Optional[int] = None,
    admin_note: Optional[str] = None,
):
    """
    Atualiza o estado administrativo de um pagamento.

    A ativação da assinatura deve ser realizada separadamente,
    depois de verificar a autenticidade do pagamento.
    """

    allowed_statuses = {
        "pending",
        "confirmed",
        "rejected",
        "cancelled",
    }

    if status not in allowed_statuses:
        raise ValueError("Estado de pagamento inválido.")

    now = datetime.utcnow().isoformat()

    with get_connection() as connection:
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE payments
            SET status = ?,
                reviewed_by = ?,
                admin_note = ?,
                reviewed_at = ?,
                confirmed_at = CASE
                    WHEN ? = 'confirmed' THEN ?
                    ELSE confirmed_at
                END,
                updated_at = ?
            WHERE id = ?
              AND status = 'pending'
        """, (
            status,
            reviewed_by,
            admin_note,
            now,
            status,
            now,
            now,
            payment_id,
        ))

        return cursor.rowcount > 0

#=================================
# ============================================================
# CONFIRMAR PAGAMENTO E ATIVAR SUBSCRIÇÃO
# ============================================================

def confirm_payment_and_activate_subscription(
    payment_id: int,
    starts_at: Optional[str] = None,
    reviewed_by: Optional[int] = None,
    admin_note: Optional[str] = None,
):
    """
    Confirma um pagamento pendente e ativa a subscrição.

    Regista o administrador responsável pela aprovação.

    A função deve ser chamada apenas depois da verificação
    real do recebimento do pagamento.
    """

    from datetime import timedelta

    now = datetime.utcnow()
    now_text = now.isoformat()
    start = starts_at or now_text

    with get_connection() as connection:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                payments.*,
                plans.duration_days

            FROM payments

            INNER JOIN plans
                ON plans.id = payments.plan_id

            WHERE payments.id = ?
              AND payments.status = 'pending'
        """, (payment_id,))

        payment = cursor.fetchone()

        if payment is None:
            return None

        duration_days = payment["duration_days"]

        expires_at = None

        if duration_days > 0:

            expires_at = (
                datetime.fromisoformat(start)
                + timedelta(days=duration_days)
            ).isoformat()

        # Criar subscrição ativa.
        cursor.execute("""
            INSERT INTO subscriptions (
                user_id,
                plan_id,
                status,
                starts_at,
                expires_at,
                auto_renew,
                created_at,
                updated_at
            )
            VALUES (?, ?, 'active', ?, ?, 0, ?, ?)
        """, (
            payment["user_id"],
            payment["plan_id"],
            start,
            expires_at,
            now_text,
            now_text,
        ))

        subscription_id = cursor.lastrowid

        # Confirmar o pagamento e guardar a auditoria.
        cursor.execute("""
            UPDATE payments
            SET
                status = 'confirmed',
                subscription_id = ?,
                reviewed_by = ?,
                admin_note = ?,
                reviewed_at = ?,
                confirmed_at = ?,
                updated_at = ?
            WHERE id = ?
              AND status = 'pending'
        """, (
            subscription_id,
            reviewed_by,
            admin_note,
            now_text,
            now_text,
            now_text,
            payment_id,
        ))

        if cursor.rowcount != 1:

            raise RuntimeError(
                "Não foi possível confirmar o pagamento."
            )

        activate_payment_credits(
            connection, payment_id, subscription_id, start, expires_at, now_text
        )

        return {
            "payment_id": payment_id,
            "subscription_id": subscription_id,
            "user_id": payment["user_id"],
            "plan_id": payment["plan_id"],
            "status": "confirmed",
            "subscription_status": "active",
            "starts_at": start,
            "expires_at": expires_at,
            "reviewed_by": reviewed_by,
        }

# ============================================================
# ESTATÍSTICAS DO PERFIL DO UTILIZADOR
# ============================================================

def get_user_profile_stats(user_id: int):

    with get_connection() as connection:

        cursor = connection.cursor()

        # Total de músicas criadas
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM songs
            WHERE user_id = ?
            """,
            (user_id,)
        )

        total_songs = cursor.fetchone()[0]

        # Total de músicas publicadas
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM songs
            WHERE user_id = ?
            AND is_public = 1
            """,
            (user_id,)
        )

        public_songs = cursor.fetchone()[0]

        # Total de músicas favoritas
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM favorites
            WHERE user_id = ?
            """,
            (user_id,)
        )

        favorites_count = cursor.fetchone()[0]

        return {
            "total_songs": total_songs,
            "public_songs": public_songs,
            "favorites_count": favorites_count
        }
# ============================================================
# INICIALIZAÇÃO
#
# A ORDEM É MUITO IMPORTANTE:
#
# 1. Criar tabelas
# 2. Migrar cover_url
# 3. Migrar is_public
# 4. Criar índices
#
# Assim o índice idx_songs_public nunca será criado
# antes da coluna is_public existir.
# ============================================================

def community_like_count(song_id):
    with get_connection() as connection:
        return connection.execute("SELECT COUNT(*) FROM community_likes WHERE song_id=?", (song_id,)).fetchone()[0]

def community_has_like(user_id, song_id):
    with get_connection() as connection:
        return connection.execute("SELECT 1 FROM community_likes WHERE user_id=? AND song_id=?", (user_id, song_id)).fetchone() is not None

def community_set_like(user_id, song_id, liked):
    with get_connection() as connection:
        if liked:
            connection.execute("INSERT OR IGNORE INTO community_likes(user_id,song_id) VALUES (?,?)", (user_id,song_id))
        else:
            connection.execute("DELETE FROM community_likes WHERE user_id=? AND song_id=?", (user_id,song_id))
        connection.commit()

def community_follow_count(user_id):
    with get_connection() as connection:
        return connection.execute("SELECT COUNT(*) FROM user_follows WHERE following_id=?", (user_id,)).fetchone()[0]

def community_is_following(follower_id, following_id):
    with get_connection() as connection:
        return connection.execute("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?", (follower_id, following_id)).fetchone() is not None

def community_set_follow(follower_id, following_id, following):
    with get_connection() as connection:
        if following:
            connection.execute("INSERT OR IGNORE INTO user_follows(follower_id,following_id) VALUES (?,?)", (follower_id,following_id))
        else:
            connection.execute("DELETE FROM user_follows WHERE follower_id=? AND following_id=?", (follower_id,following_id))
        connection.commit()


# ============================================================
# COMUNIDADE — VISUALIZAÇÕES REAIS
# ============================================================

def register_community_view(song_id, viewer_key, user_id=None):
    """Regista no máximo uma visualização por visitante por período de 24 h."""
    song_id = int(song_id)
    viewer_key = str(viewer_key or "").strip()
    if not viewer_key:
        raise ValueError("viewer_key não pode estar vazio")

    with get_connection() as connection:
        cursor = connection.execute(
            """
            SELECT 1
            FROM community_views
            WHERE song_id = ?
              AND viewer_key = ?
              AND viewed_at >= datetime('now', '-24 hours')
            LIMIT 1
            """,
            (song_id, viewer_key)
        )
        if cursor.fetchone():
            return False

        connection.execute(
            """
            INSERT INTO community_views (song_id, user_id, viewer_key)
            VALUES (?, ?, ?)
            """,
            (song_id, user_id, viewer_key)
        )
        connection.commit()
        return True


def get_community_song_views(song_id):
    """Devolve o número total de visualizações registadas para uma música."""
    with get_connection() as connection:
        row = connection.execute(
            "SELECT COUNT(*) FROM community_views WHERE song_id = ?",
            (int(song_id),)
        ).fetchone()
        return int(row[0] or 0)


def get_user_community_views(user_id):
    """Devolve a soma das visualizações das músicas públicas concluídas do utilizador."""
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(cv.id)
            FROM community_views cv
            INNER JOIN songs s ON s.id = cv.song_id
            WHERE s.user_id = ?
              AND s.is_public = 1
              AND s.status = 'completed'
            """,
            (int(user_id),)
        ).fetchone()
        return int(row[0] or 0)


# ============================================================
# COMUNIDADE — MÚSICAS PUBLICADAS PELO UTILIZADOR
# ============================================================

def get_user_community_songs(user_id, limit=100):
    """
    Devolve as músicas publicadas na comunidade
    por um utilizador específico.

    Apenas músicas públicas e concluídas.
    """

    user_id = int(user_id)

    limit = max(1, min(int(limit), 200))

    conn = get_connection()

    try:
        cursor = conn.execute(
            """
            SELECT
                s.*,
                u.name AS owner_name,

                (
                    SELECT COUNT(*)
                    FROM community_likes cl
                    WHERE cl.song_id = s.id
                ) AS likes_count

            FROM songs s

            LEFT JOIN users u
                ON u.id = s.user_id

            WHERE
                s.user_id = ?
                AND s.is_public = 1
                AND s.status = 'completed'

            ORDER BY
                s.created_at DESC,
                s.id DESC

            LIMIT ?
            """,
            (user_id, limit)
        )

        return [
            dict(row)
            for row in cursor.fetchall()
        ]

    finally:
        conn.close()
# ============================================================
# COMUNIDADE — ESTATÍSTICAS DO UTILIZADOR
# ============================================================

def get_user_community_stats(user_id):
    """
    Estatísticas reais da participação do utilizador
    na comunidade StudioMusic.AI.
    """

    user_id = int(user_id)

    conn = get_connection()

    try:

        # ========================================
        # TOTAL DE MÚSICAS PUBLICADAS
        # ========================================

        published_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM songs
            WHERE user_id = ?
              AND is_public = 1
              AND status = 'completed'
            """,
            (user_id,)
        ).fetchone()[0]

        # ========================================
        # GOSTOS RECEBIDOS NAS MÚSICAS PÚBLICAS
        # ========================================

        likes_received = conn.execute(
            """
            SELECT COUNT(*)

            FROM community_likes cl

            INNER JOIN songs s
                ON s.id = cl.song_id

            WHERE
                s.user_id = ?
                AND s.is_public = 1
                AND s.status = 'completed'
            """,
            (user_id,)
        ).fetchone()[0]

        # ========================================
        # TOTAL DE SEGUIDORES
        # ========================================

        followers_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM user_follows
            WHERE following_id = ?
            """,
            (user_id,)
        ).fetchone()[0]

        # ========================================
        # TOTAL DE UTILIZADORES SEGUIDOS
        # ========================================

        following_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM user_follows
            WHERE follower_id = ?
            """,
            (user_id,)
        ).fetchone()[0]

        # ========================================
        # DEVOLVER ESTATÍSTICAS
        # ========================================

        return {
            "published_count": published_count,
            "likes_received": likes_received,
            "followers_count": followers_count,
            "following_count": following_count
        }

    finally:
        conn.close()
