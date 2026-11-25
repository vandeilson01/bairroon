# BairroOn — React + Vercel

Site web responsivo do BairroOn em React, com endpoint serverless no próprio Vercel para buscar estabelecimentos reais próximos. O site não precisa de backend externo nem de chave de Google.

## Como funciona

- A interface React usa geolocalização do navegador somente após autorização.
- O navegador envia as coordenadas por `POST /api/nearby` no mesmo domínio do site.
- A função `api/nearby.ts` valida os dados e consulta o Overpass API no servidor. Isso evita o bloqueio CORS do navegador entre o Vercel e o OpenStreetMap.
- Os resultados vêm do OpenStreetMap. Avaliações e notas de usuários não são fornecidas por essa fonte.
- Favoritos ficam no armazenamento local do navegador. Resultados consultados podem ficar em cache apenas na sessão por até 10 minutos.
- Não há variáveis secretas a configurar para executar esta versão.

## Executar localmente

Requer Node.js 20 ou mais recente.

```bash
npm install
npm run dev
```

O Vite serve a interface. Para testar o endpoint `/api/nearby` localmente, use a CLI do Vercel:

```bash
npm install -g vercel
vercel dev
```

Autorize a CLI quando solicitado. A chamada à API pede HTTPS ao Overpass e precisa de acesso à internet.

## Publicar no Vercel

1. Extraia o arquivo ZIP ou envie esta pasta para um repositório Git.
2. No Vercel, selecione **Add New → Project** e importe o repositório.
3. O Vercel detecta Vite. Confira **Build Command** `npm run build` e **Output Directory** `dist`.
4. Clique em **Deploy**. A pasta raiz `api/` será implantada como função serverless junto com o frontend.
5. Teste `https://seu-dominio.vercel.app/api/nearby` com um `POST` JSON; um `GET` deve retornar `405 Method Not Allowed`, pois o endpoint exige POST.
6. Abra o site pelo domínio HTTPS e permita localização no navegador.

A localização depende de permissão do visitante e de contexto seguro (HTTPS, como no domínio Vercel). Nenhuma chamada deve ser feita a `/api/trpc`.

## Dados, atribuição e limites

Dados © contribuidores do [OpenStreetMap](https://www.openstreetmap.org/copyright), sob licença ODbL. A cobertura e a qualidade variam de acordo com o mapeamento local. A busca consulta um raio de até 3 km e limita a resposta a 60 lugares para manter as consultas menores.

O projeto usa uma instância pública do Overpass por padrão, compartilhada entre usuários. Ela pode aplicar limitação de carga ou ficar indisponível. O próprio operador pede que a instância pública não seja usada como backend de aplicações com demanda elevada. Para uso comercial ou aumento de tráfego, configure `OVERPASS_URL` nas variáveis de ambiente do Vercel para apontar a um serviço contratado ou a uma instância própria.

Documentação: [Vite no Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel Functions](https://vercel.com/docs/functions) · [orientações de uso do Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
