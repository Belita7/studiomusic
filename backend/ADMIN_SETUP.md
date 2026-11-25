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


## Pagamentos P2P adicionais

A página **Pagamentos** foi acrescentada como uma secção separada. O checkout e os webhooks Paddle existentes não foram modificados. Os métodos P2P só aparecem quando os dados correspondentes estiverem configurados no Render.

Configure apenas dados destinados a receber dinheiro — **nunca** número de cartão Visa, CVV ou validade:

- `P2P_UNIFI_DETAILS`: instruções de recebimento internacional UniFi (sem dados de cartão).
- `P2P_USD_AOA_RATE`: taxa AOA por 1 USD usada para mostrar o valor equivalente de uma transferência UniFi em USD.
- `P2P_BANK_DETAILS`: dados/instruções de transferência bancária.
- `P2P_MULTICAIXA_DETAILS`: instruções de recebimento Multicaixa Express.
- `P2P_USDC_NETWORK`: rede blockchain exacta para receber USDC.
- `P2P_USDC_WALLET_ADDRESS`: endereço de carteira de recebimento USDC.
- `P2P_USDC_AOA_RATE`: taxa AOA por 1 USDC, usada para calcular o valor de USDC.

As taxas são definidas pelo administrador e devem ser actualizadas quando necessário. O sistema não consulta automaticamente cotação cambial ou blockchain. USDC só aparece se rede, carteira e taxa estiverem configuradas.

O cliente cria um pedido, pode enviar comprovativo JPG/PNG/PDF (máximo 5 MB) e o pedido permanece pendente. Na secção Pagamentos, o administrador pode descarregar o comprovativo, confirmar ou rejeitar. A confirmação activa o plano através do fluxo de pagamentos já existente. Confirme sempre o recebimento real antes de aprovar.

A lista administrativa P2P filtra os métodos manuais; os pagamentos Paddle não são apresentados nessa lista.
