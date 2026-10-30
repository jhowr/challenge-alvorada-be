# @booking/web

Painel opcional do Caso 02: Next.js 16 + shadcn/ui (Base UI). Como rodar, credenciais e variáveis estão no [README da raiz](../../README.md#painel-web-opcional); as decisões, em [DECISIONS.md §3](../../docs/DECISIONS.md).

```
app/            rotas: login, (panel)/ agenda e reservas
features/
  agenda/       grade por hora, seleção por arraste, verificação ao vivo
  bookings/     cliente da API (server-only), server actions, tabela, erros em pt-BR
  auth/         sessão JWT em cookie httpOnly, credenciais de demo
  shell/        sidebar e peças de layout
lib/hours.ts    a convenção: cada inteiro é uma hora desde 1970-01-01 00:00 UTC
proxy.ts        redireciona para /login sem sessão (as páginas checam de novo)
```

```bash
pnpm --filter @booking/web test     # convenção de horas, grade, sessão e mensagens de erro
```
