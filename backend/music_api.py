# ============================================================
# EasyMusic.AI
# music_api.py
#
# Comunicação com Stability AI / Stable Audio
# ============================================================

import base64
import os
import uuid
from pathlib import Path
from typing import Any

import httpx


# ============================================================
# CONFIGURAÇÃO
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MUSIC_DIR = BASE_DIR / "music"

MUSIC_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# CONFIGURAÇÃO DA STABILITY AI
# ============================================================

STABILITY_API_URL = os.getenv(
    "STABILITY_AUDIO_URL",
    "https://api.stability.ai"
)


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def _headers(api_key: str) -> dict[str, str]:

    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }


def _save_audio(
    audio_bytes: bytes,
    extension: str = "wav"
) -> str:

    filename = (
        f"easymusic_"
        f"{uuid.uuid4().hex}"
        f".{extension}"
    )

    filepath = MUSIC_DIR / filename

    with open(filepath, "wb") as file:

        file.write(audio_bytes)

    return filename


def _decode_base64_audio(
    value: str
) -> bytes:

    # Caso a API devolva:
    #
    # data:audio/wav;base64,AAAA...
    #
    # removemos a parte inicial.

    if "," in value:

        value = value.split(
            ",",
            1
        )[1]

    return base64.b64decode(value)


# ============================================================
# EXTRAIR ÁUDIO DA RESPOSTA
# ============================================================

def _extract_audio(
    response_data: Any
) -> tuple[bytes | None, str]:

    """
    Tenta localizar o áudio em diferentes formatos
    possíveis de resposta.

    Retorna:

        (bytes_do_audio, extensão)
    """

    # --------------------------------------------------------
    # CASO 1
    # Resposta em JSON com base64
    # --------------------------------------------------------

    if isinstance(
        response_data,
        dict
    ):

        possible_keys = [

            "audio",

            "audio_base64",

            "base64",

            "data",

            "result"
        ]

        for key in possible_keys:

            value = response_data.get(key)

            if isinstance(
                value,
                str
            ):

                try:

                    audio = _decode_base64_audio(
                        value
                    )

                    return audio, "wav"

                except Exception:

                    pass


            # --------------------------------------------
            # Caso result seja um objeto
            # --------------------------------------------

            if isinstance(
                value,
                dict
            ):

                audio, extension = _extract_audio(
                    value
                )

                if audio:

                    return audio, extension


            # --------------------------------------------
            # Caso result seja uma lista
            # --------------------------------------------

            if isinstance(
                value,
                list
            ):

                for item in value:

                    audio, extension = _extract_audio(
                        item
                    )

                    if audio:

                        return audio, extension


        # ----------------------------------------------------
        # Caso artifacts seja usado
        # ----------------------------------------------------

        artifacts = response_data.get(
            "artifacts"
        )

        if isinstance(
            artifacts,
            list
        ):

            for artifact in artifacts:

                if not isinstance(
                    artifact,
                    dict
                ):

                    continue

                encoded = artifact.get(
                    "base64"
                )

                if encoded:

                    try:

                        audio = _decode_base64_audio(
                            encoded
                        )

                        return audio, "wav"

                    except Exception:

                        pass


    # --------------------------------------------------------
    # Caso não tenha encontrado
    # --------------------------------------------------------

    return None, "wav"


# ============================================================
# GERAR MÚSICA
# ============================================================

async def generate_music_stability(
    api_key: str,
    prompt: str,
    duration: int = 60,
    model: str = "stable-audio-3.0"
) -> dict:

    """
    Envia um pedido de geração de música
    para a Stability AI.

    Retorna:

        {
            "task_id": "...",
            "audio_url": "..."
        }
    """

    if not api_key:

        raise ValueError(
            "STABILITY_API_KEY não foi fornecida."
        )


    if not prompt:

        raise ValueError(
            "O prompt não pode estar vazio."
        )


    # --------------------------------------------------------
    # LIMITAR DURAÇÃO
    # --------------------------------------------------------

    duration = max(
        5,
        min(
            int(duration),
            360
        )
    )


    # --------------------------------------------------------
    # ENDPOINT
    #
    # A URL pode ser alterada através do .env:
    #
    # STABILITY_AUDIO_URL=...
    #
    # Isso permite acompanhar mudanças da API
    # sem alterar o código.
    # --------------------------------------------------------

    endpoint = (
        f"{STABILITY_API_URL.rstrip('/')}"
        f"/v2beta/audio/{model}/text-to-audio"
    )


    # --------------------------------------------------------
    # DADOS DA GERAÇÃO
    # --------------------------------------------------------

    data = {

        "prompt": prompt,

        "duration": str(
            duration
        )
    }


    # --------------------------------------------------------
    # REQUISIÇÃO
    # --------------------------------------------------------

    timeout = httpx.Timeout(
        connect=30.0,
        read=300.0,
        write=60.0,
        pool=30.0
    )


    async with httpx.AsyncClient(
        timeout=timeout
    ) as client:

        response = await client.post(

            endpoint,

            headers=_headers(
                api_key
            ),

            data=data
        )


    # --------------------------------------------------------
    # TRATAMENTO DE ERROS
    # --------------------------------------------------------

    if response.status_code >= 400:

        try:

            error_data = response.json()

            error_message = (
                error_data.get(
                    "message"
                )
                or error_data.get(
                    "error"
                )
                or str(error_data)
            )

        except Exception:

            error_message = response.text


        raise RuntimeError(

            f"Stability AI retornou "
            f"HTTP {response.status_code}: "
            f"{error_message}"
        )


    # --------------------------------------------------------
    # IDENTIFICADOR
    # --------------------------------------------------------

    task_id = str(
        uuid.uuid4()
    )


    # --------------------------------------------------------
    # VERIFICAR CONTENT-TYPE
    # --------------------------------------------------------

    content_type = (
        response.headers
        .get(
            "content-type",
            ""
        )
        .lower()
    )


    # ========================================================
    # RESPOSTA BINÁRIA
    # ========================================================

    if (

        "audio/" in content_type

        or
        "application/octet-stream"
        in content_type

    ):

        audio_bytes = response.content


        # --------------------------------------------
        # Detectar extensão
        # --------------------------------------------

        if "mpeg" in content_type:

            extension = "mp3"

        elif "ogg" in content_type:

            extension = "ogg"

        elif "flac" in content_type:

            extension = "flac"

        else:

            extension = "wav"


        # --------------------------------------------
        # Salvar
        # --------------------------------------------

        filename = _save_audio(

            audio_bytes,

            extension
        )


        return {

            "task_id":
                task_id,

            "audio_url":
                f"/music/{filename}",

            "filename":
                filename,

            "status":
                "completed"
        }


    # ========================================================
    # RESPOSTA JSON
    # ========================================================

    try:

        response_data = response.json()

    except Exception:

        raise RuntimeError(

            "A Stability AI respondeu "
            "com um formato que o EasyMusic.AI "
            "não conseguiu interpretar."
        )


    # --------------------------------------------------------
    # Verificar se existe URL de áudio
    # --------------------------------------------------------

    audio_url = _find_audio_url(
        response_data
    )

    if audio_url:

        return {

            "task_id":
                response_data.get(
                    "id",
                    task_id
                ),

            "audio_url":
                audio_url,

            "status":
                "completed",

            "raw":
                response_data
        }


    # --------------------------------------------------------
    # Verificar base64
    # --------------------------------------------------------

    audio_bytes, extension = _extract_audio(
        response_data
    )

    if audio_bytes:

        filename = _save_audio(

            audio_bytes,

            extension
        )


        return {

            "task_id":
                response_data.get(
                    "id",
                    task_id
                ),

            "audio_url":
                f"/music/{filename}",

            "filename":
                filename,

            "status":
                "completed"
        }


    # --------------------------------------------------------
    # Se chegou aqui, devolver resposta para diagnóstico
    # --------------------------------------------------------

    return {

        "task_id":
            response_data.get(
                "id",
                task_id
            ),

        "audio_url":
            None,

        "status":
            response_data.get(
                "status",
                "unknown"
            ),

        "raw":
            response_data
    }


# ============================================================
# LOCALIZAR URL DE ÁUDIO
# ============================================================

def _find_audio_url(
    data: Any
) -> str | None:

    if isinstance(
        data,
        dict
    ):

        # Campos comuns

        for key in [

            "audio_url",

            "audioUrl",

            "url",

            "download_url",

            "downloadUrl"

        ]:

            value = data.get(
                key
            )

            if isinstance(
                value,
                str
            ):

                if (

                    value.startswith(
                        "http://"
                    )

                    or

                    value.startswith(
                        "https://"
                    )

                ):

                    return value


        # Procurar recursivamente

        for value in data.values():

            result = _find_audio_url(
                value
            )

            if result:

                return result


    elif isinstance(
        data,
        list
    ):

        for item in data:

            result = _find_audio_url(
                item
            )

            if result:

                return result


    return None


# ============================================================
# CONSULTAR STATUS
# ============================================================

async def get_music_status(
    api_key: str,
    task_id: str
) -> dict:

    """
    Consulta o estado de uma geração,
    caso o serviço/endpoint configurado
    forneça um identificador consultável.
    """

    if not api_key:

        raise ValueError(
            "STABILITY_API_KEY não foi fornecida."
        )


    if not task_id:

        raise ValueError(
            "task_id não foi fornecido."
        )


    # --------------------------------------------------------
    # Endpoint configurável
    #
    # Caso a API utilizada pela sua conta tenha
    # um endpoint específico de consulta,
    # ele pode ser definido no .env.
    # --------------------------------------------------------

    status_base = os.getenv(
        "STABILITY_STATUS_URL"
    )


    if not status_base:

        return {

            "task_id":
                task_id,

            "status":
                "completed",

            "message":
                (
                    "O endpoint atual não "
                    "possui consulta de tarefa "
                    "configurada. O resultado "
                    "é tratado diretamente "
                    "quando retornado pela API."
                )
        }


    endpoint = (

        status_base.rstrip("/")

        + "/"

        + task_id

    )


    async with httpx.AsyncClient(
        timeout=60.0
    ) as client:

        response = await client.get(

            endpoint,

            headers=_headers(
                api_key
            )
        )


    if response.status_code >= 400:

        raise RuntimeError(

            f"Erro ao consultar geração: "
            f"HTTP {response.status_code}: "
            f"{response.text}"
        )


    try:

        return response.json()

    except Exception:

        return {

            "task_id":
                task_id,

            "status":
                "unknown",

            "response":
                response.text
        }


# ============================================================
# TESTE LOCAL
# ============================================================

if __name__ == "__main__":

    import asyncio

    async def test():

        api_key = os.getenv(
            "STABILITY_API_KEY"
        )

        if not api_key:

            print(
                "ERRO: "
                "STABILITY_API_KEY não configurada."
            )

            return


        result = await generate_music_stability(

            api_key=api_key,

            prompt=(
                "Kizomba gospel instrumental, "
                "warm acoustic guitar, "
                "deep bass, "
                "African percussion, "
                "emotional piano, "
                "smooth romantic atmosphere, "
                "professional studio production"
            ),

            duration=30,

            model=os.getenv(
                "STABILITY_AUDIO_MODEL",
                "stable-audio-3.0"
            )
        )


        print(
            "\nResultado:"
        )

        print(
            result
        )


    asyncio.run(
        test()
    )
