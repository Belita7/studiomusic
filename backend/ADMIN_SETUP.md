# Configuração inicial de administrador e testes Mureka

## Criar o primeiro administrador

No Render, abra o serviço backend StudioMusic e adicione estas variáveis de ambiente:

- `ADMIN_BOOTSTRAP_EMAIL`: email exacto que será o primeiro administrador.
- `ADMIN_BOOTSTRAP_TOKEN`: token aleatório secreto com pelo menos 32 caracteres.

Gere um token localmente no PowerShell (não o envie em mensagens):

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Guarde o token como Secret no Render. Faça deploy e execute o pedido uma única vez. A rota é `POST /api/admin/bootstrap`, protegida pelo cabeçalho `X-Admin-Bootstrap-Token`. O email do pedido tem de corresponder ao `ADMIN_BOOTSTRAP_EMAIL`. Se a conta já existir, é necessário fornecer a palavra-passe correcta dessa conta; se não existir, será criada com palavra-passe de pelo menos 8 caracteres. Após existir um administrador, a rota fecha com HTTP 409. Depois de concluir, remova `ADMIN_BOOTSTRAP_TOKEN` e `ADMIN_BOOTSTRAP_EMAIL` das variáveis do Render.

Exemplo PowerShell; preencha os valores localmente e não partilhe a palavra-passe nem o token:

```powershell
$bootstrapToken = Read-Host "Token de bootstrap do Render" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapToken)
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
$body = @{
  name = "Administrador"
  email = "EMAIL_CONFIGURADO_NO_RENDER"
  password = "PALAVRA_PASSE_FORTE"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://studiomusic.onrender.com/api/admin/bootstrap" -Headers @{"X-Admin-Bootstrap-Token"=$token} -ContentType "application/json" -Body $body
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
```

## Testar geração Mureka sem subscrição

A geração de teste é desligada por padrão. No Render, configure:

- `MUREKA_TEST_MODE=true`
- `MUREKA_TEST_EMAILS`: email da conta de teste ou do administrador, separado por vírgulas.
- `MUREKA_TEST_MAX_GENERATIONS=3`: limite por conta; pode ser configurado entre 1 e 20.

Apenas emails nesta lista podem gerar sem subscrição e sem consumir créditos. O limite é contado a partir das músicas já registadas para a conta, incluindo tarefas falhadas. O envio de áudio de referência também é permitido a estes emails para testar o fluxo completo. A clonagem vocal continua a exigir subscrição. Desligue o modo de teste e remova os emails autorizados antes de abrir a plataforma ao público.

O modo de teste não altera o acesso dos utilizadores normais nem desactiva a validação de subscrição para contas que não estejam na lista.
