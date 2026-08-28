/**
 * Variáveis mínimas para o `src/config/env.ts` validar no boot dos testes.
 * Nenhum teste desta suíte abre conexão real com o banco — os que precisam de
 * banco ficam em `tests/integration` e são pulados sem DATABASE_URL de teste.
 */
process.env.NODE_ENV ??= 'test'
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/annetec_test'
process.env.BETTER_AUTH_SECRET ??= 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres'
process.env.LOG_LEVEL ??= 'silent'
