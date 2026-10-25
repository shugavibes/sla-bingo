// Entrada para Vercel: todas las rutas dinámicas (/api/*, /c/:id, páginas) pasan por acá.
// Los archivos de public/ los sirve Vercel directamente como estáticos.
import app from '../src/app.js';

export default app;
