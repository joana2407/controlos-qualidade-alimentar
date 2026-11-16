# QualiControl — versão independente para Vercel

## Publicar

O pacote de produção contém apenas HTML, JavaScript, CSS, imagens de marca, manifesto, Service Worker e `vercel.json`. Não contém `package.json`, `src`, `server`, dependências ou credenciais. O `vercel.json` usa exatamente:

```json
{ "buildCommand": "", "outputDirectory": ".", "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Extraia o ZIP e publique o **conteúdo** da pasta no Vercel. Se o projeto já estava configurado como Vite/React, selecione **Framework Preset: Other**, deixe o comando de build vazio e use `.` como diretório de saída. Não volte a publicar a pasta do código-fonte no mesmo deployment estático.

## Preservar e restaurar o histórico

A base original não foi modificada nem eliminada. Foi criada uma cópia privada com IDs, datas, relações entre registos e tarefas, tratamentos e respetivo histórico, fusões de colaboradores, temas, catálogos de verificações e todos os arquivos diários existentes.

A transferência exportada em 16/11/2026 inclui **8 182 verificações**, **1 207 tarefas**, **107 arquivos diários**, **145 colaboradores** e **292 ficheiros históricos**. Inclui também os registos tecnicamente eliminados que existiam na base, sem os reativar na interface. A exportação é uma fotografia do histórico no momento indicado dentro do JSON; registos inseridos posteriormente no serviço original não aparecem automaticamente nesta versão independente.

**Não publique os ficheiros de histórico no Vercel.** Contêm dados da operação e colaboradores. São entregues separadamente para guardar no computador e importar diretamente no navegador, sem upload a um servidor.

1. Antes de atualizar o site, exporte a cópia de segurança do navegador que usa atualmente, especialmente os registos e configurações do Controlo de Processos. Esses dados só existem nesse dispositivo e não são acessíveis a esta tarefa.
2. Publique o novo ZIP de produção. Mantenha o mesmo domínio para continuar a ter acesso às chaves locais já existentes.
3. No primeiro acesso, clique em **Importar Cópia de Segurança** e escolha `qualicontrol-historico-preservado.json`. Também pode importar em **Backups diários**.
4. A transferência histórica substitui a base operacional local mediante confirmação, mas preserva as outras chaves locais, incluindo os registos e catálogos já guardados do Controlo de Processos. Se já criou registos operacionais nesta nova versão, exporte-os antes de importar; não há fusão automática entre duas bases independentes.
5. Defina novos PINs para os perfis ativos e entre no seu perfil. Os PINs antigos da base remota não são incluídos na transferência nem apresentados.
6. Exporte uma nova cópia de segurança completa após confirmar o histórico. Essa cópia inclui as fotografias locais em formato portátil.

O JSON histórico inclui cópias de consulta das fotografias, com preservação do enquadramento e orientação. As fotografias originais, sem recompressão, e a exportação original da base também são preservadas num **arquivo privado separado**. Esta separação evita tornar os dados públicos e permite consultar as imagens no navegador sem carregar centenas de megabytes em todos os painéis.

Pela dimensão do histórico, é recomendado fazer o primeiro restauro num computador com espaço disponível, manter a página aberta até terminar e só depois testar noutros dispositivos.

## Armazenamento e funcionamento

Os fluxos operacionais usam um transporte local em vez de `/api/trpc`. Os registos são reais e persistem no navegador; não são respostas mock nem dados de exemplo. O `localStorage` é usado com formato versionado e compressão. Bases que excedam a capacidade do `localStorage` e as fotografias são guardadas em **IndexedDB**, igualmente no próprio navegador. O backup JSON inclui ambos, não apenas as preferências do `localStorage`.

Nenhum deployment ou atualização apaga intencionalmente o armazenamento existente. Uma cópia corrompida não é substituída silenciosamente por uma base vazia. Uma gravação sem espaço é comunicada como erro; não é mostrada como sucesso.

Os dados não sincronizam automaticamente entre computadores, telemóveis ou navegadores. Para transferir os dados, use Exportar/Importar Cópia de Segurança. Os PINs são um controlo de acesso operacional local; não cifram a base nem substituem a proteção do dispositivo. Limpar dados do navegador ou desinstalar o seu perfil pode eliminar o armazenamento, pelo que as cópias de segurança continuam a ser essenciais.

O catálogo e os registos do Controlo de Processos mantêm as chaves locais existentes. Não os elimine para resolver um problema de cache: atualize a aplicação sem apagar o armazenamento.

## Funcionalidades que exigiam serviços remotos

A IA remota/copiloto e a extração automática de PDFs não são executadas nesta versão. O registo manual dos dados e os restantes fluxos operacionais não dependem desses serviços. Os painéis externos continuam a ser atalhos opcionais para outros sites; esses sites não passam a funcionar offline.

Os arquivos diários locais são atualizados quando há alterações na aplicação aberta. Não há um servidor a executar tarefas automáticas enquanto o navegador está fechado. O arquivo de uma mesma data é atualizado para a versão mais recente sem eliminar as verificações que lhe deram origem. Os arquivos históricos transferidos são mantidos; não são apagados no arranque.

## Validação

Foram adicionadas regressões de arranque sem API, PINs, permissões, planeamento sem duplicados, completitude partilhada, cobertura de BPHF, segregação por fábrica, histórico de tratamento, fusão de temas, fotografias locais, cópia e restauro JSON, preservação de catálogos existentes e rejeição de ficheiros inválidos. A build é gerada com `VITE_LOCAL_MODE=true` e base `/`, usando `npm run build`.
